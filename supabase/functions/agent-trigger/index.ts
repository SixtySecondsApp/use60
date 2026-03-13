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
import { writeToCommandCentre } from '../_shared/commandCentre/writeAdapter.ts';
import { deliverToSlack } from '../_shared/proactive/deliverySlack.ts';
import { shouldSendNotification, recordNotificationSent } from '../_shared/proactive/dedupe.ts';
import { getSlackRecipient } from '../_shared/proactive/recipients.ts';
import type { EventType, EventSource } from '../_shared/orchestrator/types.ts';
import type { SourceAgent, ItemType, Urgency } from '../_shared/commandCentre/types.ts';

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
  'calendar_event_created',
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
// Brain Event Dispatch (US-007 to US-013)
// =============================================================================

/** Events that should be dispatched to the fleet orchestrator (brain sequences) */
const BRAIN_EVENTS: Record<string, {
  orchestratorEventType: EventType;
  source: EventSource;
  /** If true, skip traditional trigger execution and only dispatch to orchestrator */
  orchestratorOnly: boolean;
}> = {
  deal_created: {
    orchestratorEventType: 'deal_created',
    source: 'trigger:brain_deal_created',
    orchestratorOnly: false,
  },
  calendar_event_created: {
    orchestratorEventType: 'calendar_event_created',
    source: 'trigger:brain_pre_call',
    orchestratorOnly: false,
  },
  meeting_completed: {
    orchestratorEventType: 'meeting_completed',
    source: 'trigger:brain_post_call',
    orchestratorOnly: false,
  },
  deal_stage_changed: {
    orchestratorEventType: 'deal_stage_changed',
    source: 'trigger:brain_deal_stage',
    orchestratorOnly: false,
  },
  deal_stalled: {
    orchestratorEventType: 'deal_stalled',
    source: 'trigger:brain_stale_deal',
    orchestratorOnly: false,
  },
};

/** Events that create CC items directly (no fleet orchestration needed) */
const DIRECT_CC_EVENTS = new Set(['task_overdue', 'contact_created']);

interface BrainDispatchResult {
  dispatched: boolean;
  method: 'orchestrator' | 'direct_cc' | 'skipped';
  idempotencyKey?: string;
  ccItemId?: string | null;
  error?: string;
}

/**
 * Dispatch a brain event to the fleet orchestrator or handle directly.
 *
 * US-007: calendar_event_created → fleet orchestrator (brain_pre_call sequence)
 * US-010: meeting_completed → fleet orchestrator (brain_post_call sequence)
 * US-012: deal_stage_changed → fleet orchestrator (brain_deal_stage sequence)
 * US-013: task_overdue → direct CC item + Slack DM
 * US-013: deal_stalled → fleet orchestrator (stale_deal_revival sequence)
 */
async function dispatchBrainEvent(
  supabase: ReturnType<typeof createClient>,
  event: string,
  payload: Record<string, unknown>,
  orgId: string,
  userId: string,
): Promise<BrainDispatchResult> {
  const entityId = (payload.id || payload.entity_id || payload.deal_id || payload.meeting_id || payload.event_id || '') as string;
  const idempotencyKey = `brain:${event}:${entityId || crypto.randomUUID()}`;

  try {
    // US-013: Task overdue — create CC item directly (no fleet orchestration)
    if (DIRECT_CC_EVENTS.has(event)) {
      return await handleDirectCCEvent(supabase, event, payload, orgId, userId, idempotencyKey);
    }

    // Fleet orchestrator dispatch for brain sequences
    const brainConfig = BRAIN_EVENTS[event];
    if (!brainConfig) {
      return { dispatched: false, method: 'skipped' };
    }

    // Dedup check: skip if we recently dispatched the same event for this entity
    const { data: existingRun } = await supabase
      .from('agent_trigger_runs')
      .select('id')
      .eq('organization_id', orgId)
      .eq('trigger_event', event)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    if (existingRun && entityId) {
      // Check for same entity within the last hour
      const { data: entityRun } = await supabase
        .from('sequence_jobs')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .not('status', 'eq', 'failed')
        .maybeSingle();

      if (entityRun) {
        console.log(`[brain] Dedup: skipping ${event} for entity ${entityId} — recent run exists`);
        return { dispatched: false, method: 'skipped', idempotencyKey };
      }
    }

    // Fire orchestrator call (fire-and-forget for async processing)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    console.log(`[brain] Dispatching ${event} → orchestrator (${brainConfig.orchestratorEventType}, source: ${brainConfig.source})`);

    fetch(`${supabaseUrl}/functions/v1/agent-fleet-router`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'orchestrator',
        type: brainConfig.orchestratorEventType,
        source: brainConfig.source,
        org_id: orgId,
        user_id: userId,
        payload,
        idempotency_key: idempotencyKey,
      }),
    }).catch(err => {
      console.error(`[brain] Orchestrator dispatch failed for ${event}:`, err);
    });

    return { dispatched: true, method: 'orchestrator', idempotencyKey };
  } catch (err) {
    console.error(`[brain] dispatchBrainEvent error for ${event}:`, err);
    return { dispatched: false, method: 'skipped', error: String(err) };
  }
}

/**
 * US-013: Handle task_overdue and cold deal events directly with CC items + Slack.
 *
 * These are simple events that don't need fleet orchestration — they just need
 * a CC item created and a Slack DM sent.
 */
async function handleDirectCCEvent(
  supabase: ReturnType<typeof createClient>,
  event: string,
  payload: Record<string, unknown>,
  orgId: string,
  userId: string,
  idempotencyKey: string,
): Promise<BrainDispatchResult> {
  try {
    if (event === 'contact_created') {
      const contactName = (payload.full_name || payload.name || 'New contact') as string;
      const contactId = (payload.id || payload.contact_id || '') as string;
      const email = (payload.email || '') as string;
      const company = (payload.company || '') as string;

      const ccItemId = await writeToCommandCentre({
        org_id: orgId,
        user_id: userId,
        source_agent: 'notification-bridge' as SourceAgent,
        item_type: 'suggestion' as ItemType,
        title: `New contact: ${contactName}`,
        summary: [
          `${contactName} was added to your CRM.`,
          email ? `Email: ${email}` : '',
          company ? `Company: ${company}` : '',
          'Auto-enrichment can fill in missing details.',
        ].filter(Boolean).join(' '),
        urgency: 'low' as Urgency,
        contact_id: contactId || undefined,
        source_event_id: contactId || undefined,
        context: {
          brain_event: 'contact_created',
          contact_id: contactId,
          contact_name: contactName,
          email,
          company,
          idempotency_key: idempotencyKey,
        },
      });

      console.log(`[brain] contact_created handled: CC item=${ccItemId}, contact=${contactName}`);
      return { dispatched: true, method: 'direct_cc', idempotencyKey, ccItemId };
    }

    if (event === 'task_overdue') {
      const taskTitle = (payload.title || payload.task_title || 'Untitled task') as string;
      const taskId = (payload.id || payload.task_id || '') as string;
      const dueDate = (payload.due_date || '') as string;
      const assignedTo = (payload.assigned_to || userId) as string;
      const dealId = (payload.deal_id || null) as string | null;
      const contactId = (payload.contact_id || null) as string | null;

      // Dedup: check if we already sent a notification for this task recently
      const canSend = await shouldSendNotification(
        supabase,
        'stale_deal_alert', // Closest existing notification type for overdue alerts
        orgId,
        assignedTo,
        taskId,
      );

      if (!canSend) {
        console.log(`[brain] Dedup: skipping task_overdue notification for task ${taskId}`);
        return { dispatched: false, method: 'skipped', idempotencyKey };
      }

      // Write CC item with high urgency
      const ccItemId = await writeToCommandCentre({
        org_id: orgId,
        user_id: assignedTo,
        source_agent: 'notification-bridge' as SourceAgent,
        item_type: 'alert' as ItemType,
        title: `Overdue task: ${taskTitle}`,
        summary: dueDate
          ? `Task "${taskTitle}" was due on ${dueDate} and needs attention.`
          : `Task "${taskTitle}" is overdue and needs attention.`,
        urgency: 'high' as Urgency,
        deal_id: dealId ?? undefined,
        contact_id: contactId ?? undefined,
        source_event_id: taskId || undefined,
        context: {
          brain_event: 'task_overdue',
          task_id: taskId,
          task_title: taskTitle,
          due_date: dueDate,
          idempotency_key: idempotencyKey,
        },
      });

      // Send Slack DM (best-effort — don't break flow on failure)
      try {
        const recipient = await getSlackRecipient(supabase, orgId, assignedTo);
        if (recipient?.slackUserId) {
          const { data: slackIntegration } = await supabase
            .from('slack_integrations')
            .select('access_token')
            .eq('user_id', assignedTo)
            .maybeSingle();

          const botToken = slackIntegration?.access_token;
          if (botToken) {
            const slackResult = await deliverToSlack(supabase, {
              type: 'stale_deal_alert',
              orgId,
              recipientUserId: assignedTo,
              recipientSlackUserId: recipient.slackUserId,
              title: `Overdue Task: ${taskTitle}`,
              message: dueDate
                ? `Your task "${taskTitle}" was due on ${dueDate}. Take action to keep things on track.`
                : `Your task "${taskTitle}" is overdue. Take action to keep things on track.`,
              blocks: [
                {
                  type: 'header',
                  text: { type: 'plain_text', text: 'Overdue Task', emoji: false },
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*${taskTitle}*\n${dueDate ? `Due: ${dueDate}` : 'Overdue'}`,
                  },
                },
                {
                  type: 'actions',
                  elements: [
                    {
                      type: 'button',
                      text: { type: 'plain_text', text: 'View in 60', emoji: false },
                      url: `https://app.use60.com/tasks`,
                      action_id: 'brain_task_overdue_view',
                    },
                  ],
                },
              ],
              entityType: 'task',
              entityId: taskId,
            }, botToken);

            if (slackResult.sent) {
              await recordNotificationSent(
                supabase,
                'stale_deal_alert',
                orgId,
                recipient.slackUserId,
                slackResult.channelId,
                slackResult.ts,
                taskId,
              );
            } else {
              console.warn(`[brain] Slack DM failed for task_overdue:`, slackResult.error);
            }
          }
        }
      } catch (slackErr) {
        console.warn(`[brain] Slack delivery error for task_overdue (non-fatal):`, slackErr);
      }

      console.log(`[brain] task_overdue handled: CC item=${ccItemId}, task=${taskTitle}`);
      return { dispatched: true, method: 'direct_cc', idempotencyKey, ccItemId };
    }

    return { dispatched: false, method: 'skipped' };
  } catch (err) {
    console.error(`[brain] handleDirectCCEvent error for ${event}:`, err);
    return { dispatched: false, method: 'skipped', error: String(err) };
  }
}

/**
 * US-013: Check for cold deals (no activity >14 days) and dispatch stale_deal_revival.
 *
 * Called when a deal_stalled event fires (from DB trigger or cron).
 * The stale_deal_revival sequence in the fleet orchestrator handles the re-engagement.
 */
async function checkAndDispatchColdDeals(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  orgId: string,
  userId: string,
): Promise<void> {
  try {
    const dealId = (payload.deal_id || payload.id || '') as string;
    if (!dealId) return;

    // Check if deal has had any activity in the last 14 days
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentActivity } = await supabase
      .from('activities')
      .select('id')
      .eq('deal_id', dealId)
      .gte('created_at', fourteenDaysAgo)
      .limit(1);

    if (recentActivity && recentActivity.length > 0) {
      console.log(`[brain] Deal ${dealId} has recent activity, skipping cold deal dispatch`);
      return;
    }

    // Check per-org ability enablement for stale deal revival
    const { data: orgConfig } = await supabase
      .from('proactive_agent_config')
      .select('enabled_sequences')
      .eq('org_id', orgId)
      .maybeSingle();

    const staleDealEnabled = orgConfig?.enabled_sequences?.stale_deal_revival?.enabled;
    if (orgConfig && !staleDealEnabled) {
      console.log(`[brain] stale_deal_revival disabled for org ${orgId}, skipping cold deal`);
      return;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    console.log(`[brain] Cold deal detected: ${dealId} — dispatching stale_deal_revival`);

    fetch(`${supabaseUrl}/functions/v1/agent-fleet-router`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'orchestrator',
        type: 'stale_deal_revival' as EventType,
        source: 'trigger:brain_stale_deal' as EventSource,
        org_id: orgId,
        user_id: userId,
        payload: { ...payload, deal_id: dealId, cold_deal: true },
        idempotency_key: `brain:cold_deal:${dealId}`,
      }),
    }).catch(err => {
      console.error(`[brain] Cold deal dispatch failed for ${dealId}:`, err);
    });
  } catch (err) {
    console.error(`[brain] checkAndDispatchColdDeals error:`, err);
  }
}

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

    // =========================================================================
    // Brain Event Dispatch (US-007 to US-013)
    // Dispatch brain events to fleet orchestrator in parallel with legacy triggers.
    // For task_overdue, creates CC items directly (no fleet orchestration).
    // For deal_stalled, also checks for cold deals (>14 days no activity).
    // =========================================================================
    let brainDispatchResult: BrainDispatchResult | null = null;

    if (event && !isTestMode) {
      const isBrainEvent = BRAIN_EVENTS[event] || DIRECT_CC_EVENTS.has(event);
      if (isBrainEvent) {
        brainDispatchResult = await dispatchBrainEvent(
          supabase, event, payload, organization_id, user_id,
        );
        console.log(`[brain] Dispatch result for ${event}: method=${brainDispatchResult.method}, dispatched=${brainDispatchResult.dispatched}`);

        // US-013: For deal_stalled events, also check for cold deals
        if (event === 'deal_stalled') {
          await checkAndDispatchColdDeals(supabase, payload, organization_id, user_id);
        }
      }
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    let triggersToRun: TriggerRow[];

    if (isTestMode) {
      // Test mode: fetch the specific trigger by ID
      const { data: trigger, error: triggerError } = await supabase
        .from('agent_triggers')
        .select('id, organization_id, trigger_event, agent_name, prompt_template, delivery_channel, handoff_target_event, handoff_context_mapping, handoff_conditions')
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
        .select('id, organization_id, trigger_event, agent_name, prompt_template, delivery_channel, handoff_target_event, handoff_context_mapping, handoff_conditions')
        .eq('organization_id', organization_id)
        .eq('trigger_event', event)
        .eq('is_active', true);

      if (triggerError) {
        if (triggerError.message.includes('relation') || triggerError.message.includes('does not exist')) {
          // If brain dispatch handled it, return success with brain info
          if (brainDispatchResult?.dispatched) {
            return jsonResponse({
              success: true,
              message: `Brain event dispatched for '${event}'`,
              brain: brainDispatchResult,
              executed: 0,
            }, req);
          }
          return jsonResponse({ success: true, message: 'agent_triggers table not found', executed: 0 }, req);
        }
        console.error('[agent-trigger] Failed to fetch triggers:', triggerError);
        return errorResponse('Failed to fetch triggers', req, 500);
      }

      if (!triggers || triggers.length === 0) {
        // If brain dispatch handled it, return success with brain info
        if (brainDispatchResult?.dispatched) {
          return jsonResponse(
            {
              success: true,
              message: `Brain event dispatched for '${event}' (no legacy triggers)`,
              brain: brainDispatchResult,
              executed: 0,
            },
            req
          );
        }
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

        // FLT-007: Check handoff fields — fire orchestrator event if defined
        const triggerRow = trigger as TriggerRow & {
          handoff_target_event?: string;
          handoff_context_mapping?: Record<string, unknown>;
          handoff_conditions?: Record<string, unknown>;
        };
        if (triggerRow.handoff_target_event && !isTestMode) {
          try {
            // Evaluate handoff conditions against agent output
            let shouldHandoff = true;
            if (triggerRow.handoff_conditions) {
              const output = { responseText: result.responseText, success: true };
              for (const [key, expected] of Object.entries(triggerRow.handoff_conditions)) {
                if ((output as any)[key] !== expected) {
                  shouldHandoff = false;
                  break;
                }
              }
            }

            if (shouldHandoff) {
              const handoffPayload: Record<string, unknown> = {
                ...(triggerRow.handoff_context_mapping || {}),
                _trigger_output: result.responseText?.slice(0, 5000),
                _trigger_id: trigger.id,
                _trigger_event: triggerEvent,
              };

              fetch(`${supabaseUrl}/functions/v1/agent-fleet-router`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${supabaseServiceKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action: 'orchestrator',
                  type: triggerRow.handoff_target_event,
                  source: 'orchestrator:trigger-handoff',
                  org_id: organization_id,
                  user_id: user_id,
                  payload: handoffPayload,
                }),
              }).catch(handoffErr => {
                console.error(`[agent-trigger] Handoff to ${triggerRow.handoff_target_event} failed:`, handoffErr);
              });

              console.log(`[agent-trigger] Handoff fired: ${triggerEvent} → ${triggerRow.handoff_target_event}`);
            }
          } catch (handoffErr) {
            console.error(`[agent-trigger] Handoff processing error:`, handoffErr);
          }
        }
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
        // Include brain dispatch info when present (US-007 to US-013)
        ...(brainDispatchResult ? { brain: brainDispatchResult } : {}),
      },
      req
    );
  } catch (error) {
    console.error('[agent-trigger] Error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});
