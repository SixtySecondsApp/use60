/**
 * Agent Trigger Edge Function
 *
 * Called when CRM events happen (deal_created, meeting_completed, etc.).
 * Queries active triggers for the event type and org, runs matching
 * specialist agents with event context, and delivers results.
 *
 * Supported events:
 *   - deal_created, deal_stage_changed
 *   - meeting_completed
 *   - contact_created
 *   - task_overdue
 *   - email_received
 *
 * Pre-built trigger templates:
 *   - deal_created -> research agent (auto-enrich the new deal's company/contact)
 *   - meeting_completed -> outreach agent (draft follow-up email)
 *
 * Rate limiting: max 10 triggers per org per hour to prevent runaway costs.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { runSpecialist } from '../_shared/agentSpecialist.ts';
import { getSpecialistConfig } from '../_shared/agentDefinitions.ts';
import { loadAgentTeamConfig } from '../_shared/agentConfig.ts';
import type { AgentName } from '../_shared/agentConfig.ts';
import { checkAgentBudget } from '../_shared/costTracking.ts';
import { verifyCronSecret } from '../_shared/edgeAuth.ts';

// =============================================================================
// Types
// =============================================================================

interface TriggerRequest {
  event: string;
  payload: Record<string, unknown>;
  organization_id: string;
  user_id: string;
  /** When set, runs a specific trigger directly (manual "Test" mode) */
  trigger_id?: string;
}

interface TriggerRow {
  id: string;
  organization_id: string;
  trigger_event: string;
  agent_name: string;
  prompt_template: string;
  delivery_channel: string;
}

interface TriggerRunResult {
  triggerId: string;
  agentName: string;
  success: boolean;
  delivered: boolean;
  error?: string;
  durationMs?: number;
  responseText?: string;
}

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Constants
// =============================================================================

const VALID_EVENTS = [
  'deal_created',
  'deal_stage_changed',
  'deal_stalled',
  'meeting_completed',
  'contact_created',
  'task_overdue',
  'email_received',
];

const VALID_AGENTS: AgentName[] = [
  'pipeline', 'outreach', 'research', 'crm_ops', 'meetings', 'prospecting',
];

const RATE_LIMIT_MAX_PER_ORG_PER_HOUR = 10;

// =============================================================================
// Pre-Built Trigger Templates
// =============================================================================

export const TRIGGER_TEMPLATES = [
  {
    key: 'deal_created_enrich',
    label: 'Auto-Enrich New Deal',
    trigger_event: 'deal_created',
    agent_name: 'research' as AgentName,
    prompt_template:
      'A new deal was just created. Research the associated company and primary contact. Provide a brief ICP fit assessment, key company details (size, industry, funding), and any relevant signals. Include the contact\'s background and role.',
    delivery_channel: 'in_app',
  },
  {
    key: 'meeting_completed_followup',
    label: 'Draft Post-Meeting Follow-up',
    trigger_event: 'meeting_completed',
    agent_name: 'outreach' as AgentName,
    prompt_template:
      'A meeting just ended. Review the meeting details and draft a concise follow-up email to the main external attendee. Reference specific discussion points from the meeting context. Include a clear next step or call-to-action.',
    delivery_channel: 'in_app',
  },
] as const;

// =============================================================================
// Rate Limiting
// =============================================================================

async function checkTriggerRateLimit(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ allowed: boolean; count: number }> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('agent_trigger_runs')
      .select('id')
      .eq('organization_id', orgId)
      .gte('created_at', oneHourAgo);

    if (error) {
      // Table may not exist — allow the trigger
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        return { allowed: true, count: 0 };
      }
      console.warn('[agent-trigger] Rate limit check error:', error);
      return { allowed: true, count: 0 };
    }

    const count = data?.length || 0;
    return {
      allowed: count < RATE_LIMIT_MAX_PER_ORG_PER_HOUR,
      count,
    };
  } catch {
    return { allowed: true, count: 0 };
  }
}

// =============================================================================
// Result Delivery
// =============================================================================

async function deliverResult(
  supabase: SupabaseClient,
  trigger: TriggerRow,
  userId: string,
  responseText: string,
  agentName: string,
  eventName: string
): Promise<boolean> {
  const channel = trigger.delivery_channel || 'in_app';

  try {
    if (channel === 'in_app') {
      const { error } = await supabase.from('notifications').insert({
        user_id: userId,
        organization_id: trigger.organization_id,
        type: 'agent_trigger_run',
        title: `${agentName} triggered by ${eventName}`,
        body: responseText.slice(0, 2000),
        metadata: {
          trigger_id: trigger.id,
          agent_name: agentName,
          event: eventName,
          full_response: responseText,
        },
      });

      if (error) {
        if (error.message.includes('relation') || error.message.includes('does not exist')) {
          console.warn('[agent-trigger] notifications table not found');
          return false;
        }
        console.error('[agent-trigger] Notification insert error:', error);
        return false;
      }
      return true;
    }

    if (channel === 'slack') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

      const slackResponse = await fetch(`${supabaseUrl}/functions/v1/slack-send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'x-internal-call': 'true',
        },
        body: JSON.stringify({
          organization_id: trigger.organization_id,
          message: `*${agentName} (triggered by ${eventName})*\n\n${responseText.slice(0, 3000)}`,
        }),
      });

      if (!slackResponse.ok) {
        console.error('[agent-trigger] Slack delivery failed:', slackResponse.status);
        return false;
      }
      return true;
    }

    console.warn(`[agent-trigger] Unknown delivery channel: ${channel}`);
    return false;
  } catch (err) {
    console.error('[agent-trigger] Delivery error:', err);
    return false;
  }
}

// =============================================================================
// Run Logging
// =============================================================================

async function logTriggerRun(
  supabase: SupabaseClient,
  trigger: TriggerRow,
  userId: string,
  eventName: string,
  payload: Record<string, unknown>,
  success: boolean,
  responseText: string,
  delivered: boolean,
  durationMs: number,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from('agent_trigger_runs').insert({
      trigger_id: trigger.id,
      organization_id: trigger.organization_id,
      agent_name: trigger.agent_name,
      user_id: userId,
      trigger_event: eventName,
      event_payload: payload,
      success,
      response_text: responseText.slice(0, 5000),
      delivery_channel: trigger.delivery_channel,
      delivered,
      duration_ms: durationMs,
      error_message: errorMessage || null,
    });
  } catch {
    // Non-fatal — table may not exist
    console.warn('[agent-trigger] Failed to log trigger run (table may not exist)');
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // Auth: accept cron secret (server-to-server), internal call header, or JWT
    const internalCall = req.headers.get('x-internal-call');
    const authHeader = req.headers.get('Authorization');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse('Missing Supabase configuration', req, 500);
    }

    if (!anthropicKey) {
      return errorResponse('Missing ANTHROPIC_API_KEY', req, 500);
    }

    // Verify auth using edgeAuth (constant-time comparison, fail-closed)
    const isCronAuth = verifyCronSecret(req, Deno.env.get('CRON_SECRET'));
    const isInternalCall = internalCall === 'true';
    if (!isCronAuth && !isInternalCall && !authHeader) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // If JWT auth, validate the user
    if (!isCronAuth && !isInternalCall && authHeader) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return errorResponse('Unauthorized', req, 401);
      }
    }

    const body = (await req.json()) as TriggerRequest;
    const { event, payload = {}, organization_id, user_id, trigger_id } = body;

    // Manual test mode: run a specific trigger directly by ID
    const isTestMode = !!trigger_id;

    // Validate required fields
    if (!organization_id || !user_id) {
      return errorResponse('Missing required fields: organization_id, user_id', req, 400);
    }

    if (!isTestMode && !event) {
      return errorResponse('Missing required field: event (or provide trigger_id for test mode)', req, 400);
    }

    if (event && !VALID_EVENTS.includes(event)) {
      return errorResponse(
        `Invalid event '${event}'. Valid: ${VALID_EVENTS.join(', ')}`,
        req,
        400
      );
    }

    // Rate limit: max 10 triggers per org per hour
    const rateLimit = await checkTriggerRateLimit(supabase, organization_id);
    if (!rateLimit.allowed) {
      console.log(`[agent-trigger] Rate limit hit for org ${organization_id}: ${rateLimit.count} triggers in last hour`);
      return jsonResponse(
        {
          success: false,
          error: `Rate limit exceeded: ${rateLimit.count}/${RATE_LIMIT_MAX_PER_ORG_PER_HOUR} triggers per hour`,
          event: event || 'test',
        },
        req,
        429
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    let triggersToRun: TriggerRow[];

    if (isTestMode) {
      // Test mode: fetch the specific trigger by ID
      const { data: trigger, error: triggerError } = await supabase
        .from('agent_triggers')
        .select('id, organization_id, trigger_event, agent_name, prompt_template, delivery_channel')
        .eq('id', trigger_id)
        .eq('organization_id', organization_id)
        .maybeSingle();

      if (triggerError || !trigger) {
        return errorResponse('Trigger not found', req, 404);
      }

      triggersToRun = [trigger as TriggerRow];
      console.log(`[agent-trigger] Test mode: running trigger ${trigger_id}`);
    } else {
      // Normal mode: fetch active triggers for this event and org
      const { data: triggers, error: triggerError } = await supabase
        .from('agent_triggers')
        .select('id, organization_id, trigger_event, agent_name, prompt_template, delivery_channel')
        .eq('organization_id', organization_id)
        .eq('trigger_event', event)
        .eq('is_active', true);

      if (triggerError) {
        if (triggerError.message.includes('relation') || triggerError.message.includes('does not exist')) {
          return jsonResponse({ success: true, message: 'agent_triggers table not found', executed: 0 }, req);
        }
        console.error('[agent-trigger] Failed to fetch triggers:', triggerError);
        return errorResponse('Failed to fetch triggers', req, 500);
      }

      if (!triggers || triggers.length === 0) {
        return jsonResponse(
          { success: true, message: `No active triggers for event '${event}'`, executed: 0 },
          req
        );
      }

      triggersToRun = triggers as TriggerRow[];
    }

    const effectiveEvent = event || (triggersToRun[0]?.trigger_event ?? 'test');
    console.log(`[agent-trigger] ${triggersToRun.length} trigger(s) for event '${effectiveEvent}' in org ${organization_id}`);

    // Load org config once (always returns a config per INT-001)
    const teamConfig = await loadAgentTeamConfig(supabase, organization_id);

    // Check daily budget
    const budgetCheck = await checkAgentBudget(
      supabase,
      organization_id,
      teamConfig.budget_limit_daily_usd
    );

    if (!budgetCheck.allowed) {
      console.log(`[agent-trigger] Budget exceeded for org ${organization_id}`);
      return jsonResponse(
        { success: false, error: budgetCheck.message || 'Daily budget exceeded', event },
        req
      );
    }

    const results: TriggerRunResult[] = [];

    for (const trigger of triggersToRun) {
      const runStart = Date.now();

      try {
        // Validate agent name
        if (!VALID_AGENTS.includes(trigger.agent_name as AgentName)) {
          results.push({
            triggerId: trigger.id,
            agentName: trigger.agent_name,
            success: false,
            delivered: false,
            error: `Unknown agent: ${trigger.agent_name}`,
          });
          continue;
        }

        const agentName = trigger.agent_name as AgentName;

        // Check if agent is enabled for this org
        if (!teamConfig.enabled_agents.includes(agentName)) {
          results.push({
            triggerId: trigger.id,
            agentName,
            success: false,
            delivered: false,
            error: `Agent '${agentName}' is not enabled for this organization`,
          });
          continue;
        }

        const specialistConfig = getSpecialistConfig(agentName, teamConfig.worker_model);

        // Build context from event payload
        const triggerEvent = trigger.trigger_event || effectiveEvent;
        const context = [
          isTestMode ? `Test run for trigger event: ${triggerEvent}` : `Triggered by event: ${triggerEvent}`,
          `Event payload:`,
          JSON.stringify(payload, null, 2),
          `Triggered at: ${new Date().toISOString()}`,
        ].join('\n');

        const result = await runSpecialist(
          specialistConfig,
          trigger.prompt_template,
          context,
          {
            anthropic,
            supabase,
            userId: user_id,
            orgId: organization_id,
          }
        );

        const durationMs = Date.now() - runStart;

        // Deliver result (skip delivery in test mode — just return inline)
        const delivered = isTestMode
          ? false
          : await deliverResult(supabase, trigger, user_id, result.responseText, agentName, triggerEvent);

        // Log the run
        await logTriggerRun(
          supabase,
          trigger,
          user_id,
          triggerEvent,
          payload,
          true,
          result.responseText,
          delivered,
          durationMs
        );

        results.push({
          triggerId: trigger.id,
          agentName,
          success: true,
          delivered,
          durationMs,
          responseText: isTestMode ? result.responseText?.slice(0, 2000) : undefined,
        });

        console.log(
          `[agent-trigger] Ran ${agentName} for event '${triggerEvent}' in org ${organization_id}: ` +
          `${result.iterations} iterations, ${durationMs}ms, delivered=${delivered}`
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - runStart;
        console.error(`[agent-trigger] Error for trigger ${trigger.id}:`, errorMsg);

        // Log failed run
        await logTriggerRun(
          supabase,
          trigger,
          user_id,
          effectiveEvent,
          payload,
          false,
          '',
          false,
          durationMs,
          errorMsg
        );

        results.push({
          triggerId: trigger.id,
          agentName: trigger.agent_name,
          success: false,
          delivered: false,
          error: errorMsg,
        });
      }
    }

    return jsonResponse(
      {
        success: true,
        mode: isTestMode ? 'test' : 'event',
        event: effectiveEvent,
        executed: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      },
      req
    );
  } catch (error) {
    console.error('[agent-trigger] Error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});
