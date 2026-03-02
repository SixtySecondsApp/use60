/**
 * Sentry Webhook Edge Function (Receiver)
 *
 * Receives Sentry webhook events from the Vercel proxy, validates them,
 * and enqueues for processing by the bridge worker.
 *
 * Supports:
 * - issue.created: Create new Dev Hub ticket
 * - issue.resolved: Mark ticket as done
 * - issue.unresolved: Reopen ticket
 * - issue.regression: Escalate priority + add comment
 *
 * Features:
 * - Signature verification (Use60 proxy signature)
 * - Rate limiting and circuit breaker
 * - Triage mode (dry-run before auto-create)
 * - Idempotency via deduplication keys
 * - Privacy redaction
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  type SentryIssuePayload,
  type BridgeConfig,
  type RoutingRule,
  verifyUse60Signature,
  isTimestampValid,
  matchRoutingRules,
  getDefaultRouting,
  formatTicketPayload,
  generateErrorHash,
  redactObject,
} from '../_shared/sentryBridge.ts';
import { withSentryHandler, addBreadcrumb, captureException } from '../_shared/sentryEdge.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Use60-Timestamp, X-Use60-Signature, X-Sentry-Hook-Resource',
};

const SUPPORTED_ACTIONS = ['created', 'resolved', 'unresolved', 'regression'];

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return withSentryHandler(req, corsHeaders, async () => {
    const startTime = Date.now();

    // Only accept POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const proxySecret = Deno.env.get('SENTRY_WEBHOOK_PROXY_SECRET');

    if (!proxySecret) {
      console.error('[sentry-webhook] Missing SENTRY_WEBHOOK_PROXY_SECRET');
      return new Response(
        JSON.stringify({ error: 'Webhook endpoint not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get org_id from query params or use platform default
    const url = new URL(req.url);
    const PLATFORM_ORG_ID = Deno.env.get('PLATFORM_ORG_ID') || '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';
    const orgId = url.searchParams.get('org_id') || PLATFORM_ORG_ID;

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Missing org_id parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Read and verify request body
    const rawBody = await req.text();
    const timestamp = req.headers.get('x-use60-timestamp') || '';
    const signature = req.headers.get('x-use60-signature') || '';
    const hookResource = req.headers.get('x-sentry-hook-resource') || 'unknown';

    addBreadcrumb(`Received ${hookResource} webhook for org ${orgId}`, 'webhook', 'info');

    // Verify timestamp freshness
    if (!isTimestampValid(timestamp)) {
      console.error('[sentry-webhook] Timestamp too old or missing');
      return new Response(
        JSON.stringify({ error: 'Invalid timestamp' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify signature
    const isValidSignature = await verifyUse60Signature(proxySecret, timestamp, signature, rawBody);
    if (!isValidSignature) {
      console.error('[sentry-webhook] Invalid signature');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    addBreadcrumb('Signature verified', 'auth', 'info');

    // Parse payload
    let payload: SentryIssuePayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if action is supported
    if (!SUPPORTED_ACTIONS.includes(payload.action)) {
      console.log(`[sentry-webhook] Skipping unsupported action: ${payload.action}`);
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: `Action '${payload.action}' not supported`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get bridge config for this org
    const { data: config, error: configError } = await supabase
      .from('sentry_bridge_config')
      .select('*')
      .eq('org_id', orgId)
      .single();

    if (configError || !config) {
      console.error('[sentry-webhook] No config found for org:', orgId, configError);
      return new Response(
        JSON.stringify({ error: 'Sentry bridge not configured for this organization' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bridgeConfig = config as BridgeConfig;

    // Check if bridge is enabled
    if (!bridgeConfig.enabled) {
      console.log(`[sentry-webhook] Bridge disabled for org ${orgId}`);
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'Bridge disabled for this organization',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    addBreadcrumb('Config loaded', 'db', 'info', { triage_mode: bridgeConfig.triage_mode_enabled });

    // Check circuit breaker
    if (bridgeConfig.circuit_breaker_tripped_at) {
      const trippedAt = new Date(bridgeConfig.circuit_breaker_tripped_at);
      const cooldownMs = (config.circuit_breaker_cooldown_minutes || 15) * 60 * 1000;
      if (Date.now() - trippedAt.getTime() < cooldownMs) {
        console.log(`[sentry-webhook] Circuit breaker tripped for org ${orgId}`);
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            reason: 'Circuit breaker active',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check rate limits
    const { data: rateLimitResult } = await supabase.rpc('check_sentry_bridge_rate_limit', {
      p_org_id: orgId,
    });

    if (rateLimitResult && !rateLimitResult.allowed) {
      console.log(`[sentry-webhook] Rate limit exceeded for org ${orgId}:`, rateLimitResult.reason);
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: rateLimitResult.reason,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const issue = payload.data.issue;
    const event = payload.data.event;
    const sentryIssueId = issue.id;
    const sentryEventId = event?.eventID || `issue-${sentryIssueId}`;

    addBreadcrumb(`Processing ${payload.action} for issue ${issue.shortId}`, 'processing', 'info');

    // Store raw webhook event (for debugging/replay)
    const { data: webhookEvent, error: webhookError } = await supabase
      .from('sentry_webhook_events')
      .insert({
        org_id: orgId,
        sentry_event_id: sentryEventId,
        sentry_issue_id: sentryIssueId,
        event_type: payload.action,
        raw_payload: redactObject(payload) as Record<string, unknown>,
        status: 'received',
      })
      .select('id')
      .single();

    if (webhookError) {
      // Check for duplicate
      if (webhookError.code === '23505') {
        console.log(`[sentry-webhook] Duplicate event: ${sentryEventId}`);
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            reason: 'Duplicate event',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw webhookError;
    }

    // Check for existing mapping (idempotency)
    const { data: existingMapping } = await supabase
      .from('sentry_issue_mappings')
      .select('id, dev_hub_task_id, sentry_status')
      .eq('org_id', orgId)
      .eq('sentry_issue_id', sentryIssueId)
      .single();

    // Get routing rules
    const { data: routingRules } = await supabase
      .from('sentry_routing_rules')
      .select('*')
      .eq('org_id', orgId)
      .eq('enabled', true)
      .order('priority', { ascending: true });

    // Determine routing
    let routing = matchRoutingRules(issue, event, (routingRules || []) as RoutingRule[]);
    if (!routing) {
      routing = getDefaultRouting(bridgeConfig);
    }

    if (!routing) {
      console.error('[sentry-webhook] No routing destination found');
      await supabase
        .from('sentry_webhook_events')
        .update({ status: 'skipped', error_message: 'No routing destination' })
        .eq('id', webhookEvent.id);

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'No routing destination configured',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format ticket payload
    const ticketPayload = formatTicketPayload(
      issue,
      event,
      routing,
      bridgeConfig.allowlisted_tags
    );

    // Generate error hash for similarity tracking
    const errorHash = await generateErrorHash(
      issue.metadata.type || issue.type || 'Error',
      issue.metadata.value || issue.title,
      issue.culprit
    );

    // Handle based on action type
    if (payload.action === 'created' && !existingMapping) {
      // New issue - create ticket
      if (bridgeConfig.triage_mode_enabled) {
        // Add to triage queue for manual approval
        await supabase.from('sentry_triage_queue').insert({
          org_id: orgId,
          webhook_event_id: webhookEvent.id,
          sentry_issue_id: sentryIssueId,
          sentry_project_slug: issue.project.slug,
          error_title: issue.title.slice(0, 200),
          error_type: issue.metadata.type || issue.type,
          error_message: (issue.metadata.value || '').slice(0, 500),
          culprit: issue.culprit,
          environment: event?.environment,
          release_version: event?.release,
          event_count: issue.count || 1,
          first_seen: issue.firstSeen,
          suggested_dev_hub_project_id: routing.projectId,
          suggested_owner_user_id: routing.ownerId,
          suggested_priority: routing.priority,
          matched_rule_id: routing.matchedRuleId,
          ticket_payload: ticketPayload,
          status: 'pending',
        });

        await supabase
          .from('sentry_webhook_events')
          .update({ status: 'processed', processed_at: new Date().toISOString() })
          .eq('id', webhookEvent.id);

        console.log(`[sentry-webhook] Issue ${issue.shortId} added to triage queue`);

        return new Response(
          JSON.stringify({
            success: true,
            action: 'triage_queued',
            issueId: sentryIssueId,
            shortId: issue.shortId,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Add to processing queue directly
        await supabase.from('sentry_bridge_queue').insert({
          org_id: orgId,
          webhook_event_id: webhookEvent.id,
          sentry_issue_id: sentryIssueId,
          sentry_event_id: sentryEventId,
          event_type: payload.action,
          target_dev_hub_project_id: routing.projectId,
          target_owner_user_id: routing.ownerId,
          target_priority: routing.priority,
          routing_rule_id: routing.matchedRuleId,
          ticket_payload: ticketPayload,
          status: 'pending',
        });

        await supabase
          .from('sentry_webhook_events')
          .update({ status: 'processing' })
          .eq('id', webhookEvent.id);

        console.log(`[sentry-webhook] Issue ${issue.shortId} queued for processing`);

        return new Response(
          JSON.stringify({
            success: true,
            action: 'queued',
            issueId: sentryIssueId,
            shortId: issue.shortId,
            routing: {
              projectId: routing.projectId,
              priority: routing.priority,
              matchedRule: routing.matchedRuleName,
            },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (existingMapping) {
      // Existing issue - handle lifecycle events
      const updatePayload: Record<string, unknown> = {
        latest_sentry_event_id: sentryEventId,
        last_seen: new Date().toISOString(),
        latest_release: event?.release,
        event_count: (issue.count || 1),
      };

      if (payload.action === 'resolved') {
        updatePayload.sentry_status = 'resolved';
        // Queue update to mark Dev Hub ticket as done
        await supabase.from('sentry_bridge_queue').insert({
          org_id: orgId,
          webhook_event_id: webhookEvent.id,
          sentry_issue_id: sentryIssueId,
          sentry_event_id: sentryEventId,
          event_type: 'resolved',
          target_dev_hub_project_id: routing.projectId,
          target_owner_user_id: routing.ownerId,
          target_priority: routing.priority,
          ticket_payload: { action: 'resolve', taskId: existingMapping.dev_hub_task_id },
          status: 'pending',
        });
      } else if (payload.action === 'unresolved') {
        updatePayload.sentry_status = 'unresolved';
        // Queue update to reopen Dev Hub ticket
        await supabase.from('sentry_bridge_queue').insert({
          org_id: orgId,
          webhook_event_id: webhookEvent.id,
          sentry_issue_id: sentryIssueId,
          sentry_event_id: sentryEventId,
          event_type: 'unresolved',
          target_dev_hub_project_id: routing.projectId,
          target_owner_user_id: routing.ownerId,
          target_priority: routing.priority,
          ticket_payload: { action: 'reopen', taskId: existingMapping.dev_hub_task_id },
          status: 'pending',
        });
      } else if (payload.action === 'regression') {
        updatePayload.sentry_status = 'unresolved';
        // Queue update to escalate priority and add comment
        await supabase.from('sentry_bridge_queue').insert({
          org_id: orgId,
          webhook_event_id: webhookEvent.id,
          sentry_issue_id: sentryIssueId,
          sentry_event_id: sentryEventId,
          event_type: 'regression',
          target_dev_hub_project_id: routing.projectId,
          target_owner_user_id: routing.ownerId,
          target_priority: 'high', // Escalate on regression
          ticket_payload: {
            action: 'regression',
            taskId: existingMapping.dev_hub_task_id,
            comment: `Issue regressed in release ${event?.release || 'unknown'}. Count: ${issue.count || 1}`,
          },
          status: 'pending',
        });
      }

      // Update mapping
      await supabase
        .from('sentry_issue_mappings')
        .update(updatePayload)
        .eq('id', existingMapping.id);

      await supabase
        .from('sentry_webhook_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', webhookEvent.id);

      console.log(`[sentry-webhook] Updated existing mapping for ${issue.shortId}: ${payload.action}`);

      return new Response(
        JSON.stringify({
          success: true,
          action: `updated_${payload.action}`,
          issueId: sentryIssueId,
          shortId: issue.shortId,
          devHubTaskId: existingMapping.dev_hub_task_id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Duplicate creation attempt
      await supabase
        .from('sentry_webhook_events')
        .update({ status: 'skipped', error_message: 'Issue already processed' })
        .eq('id', webhookEvent.id);

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'Issue already has a mapping',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  });
});
