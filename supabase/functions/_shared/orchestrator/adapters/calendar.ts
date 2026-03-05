/**
 * Calendar Orchestrator Adapters
 * Wraps find-available-slots and create-calendar-event for orchestrator
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

export const findAvailableSlotsAdapter: SkillAdapter = {
  name: 'find-available-slots',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/find-available-slots`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: state.event.user_id,
          org_id: state.event.org_id,
          prospect_timezone: state.event.payload.prospect_timezone,
          days_ahead: state.event.payload.days_ahead || 5,
          duration_minutes: state.event.payload.duration_minutes || 30,
        }),
      });

      if (!response.ok) {
        throw new Error(`find-available-slots returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const presentTimeOptionsAdapter: SkillAdapter = {
  name: 'present-time-options',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      // This step creates a Slack message with time options and pauses for HITL
      const slots = (state.outputs['find-available-slots'] as any)?.slots || [];

      if (slots.length === 0) {
        return {
          success: true,
          output: { message: 'No available slots found', slots: [] },
          duration_ms: Date.now() - start,
        };
      }

      // The pending approval will be created by the runner
      // This adapter just prepares the data for the Slack message
      return {
        success: true,
        output: {
          slots,
          prospect_name: state.context.tier2?.contact?.name,
          prospect_email: state.context.tier2?.contact?.email,
          meeting_title: state.event.payload.meeting_title || `Meeting with ${state.context.tier2?.contact?.name || 'prospect'}`,
        },
        duration_ms: Date.now() - start,
        pending_approval: {
          step_name: 'present-time-options',
          action_type: 'calendar_slot_selection',
          preview: `${slots.length} time slots available for ${state.context.tier2?.contact?.name || 'prospect'}`,
          created_at: new Date().toISOString(),
        },
      };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

/**
 * Detect Scheduling Intent Adapter (CAL-001)
 *
 * Wave 2b step in the meeting_ended sequence.
 * Runs after detect-intents to check whether a schedule_meeting intent was
 * detected in the transcript. When found, calls find-available-slots to
 * surface the rep's next open windows so a downstream Slack HITL step
 * (CAL-002) can present them.
 *
 * Skip conditions (all return success with { skipped: true }):
 *   - detect-intents output absent or skipped
 *   - no schedule_meeting commitment found
 *   - rep has no Google Calendar connected (getGoogleIntegration throws)
 */
export const detectSchedulingIntentAdapter: SkillAdapter = {
  name: 'detect-scheduling-intent',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables');
      }

      // -----------------------------------------------------------------------
      // 1. Check detect-intents output for a schedule_meeting commitment
      // -----------------------------------------------------------------------
      const intentsOutput = state.outputs['detect-intents'] as
        | {
            skipped?: boolean;
            commitments?: Array<{ intent?: string; confidence?: number; phrase?: string; source_quote?: string }>;
          }
        | undefined;

      if (!intentsOutput || intentsOutput.skipped) {
        console.log('[detect-scheduling-intent] No detect-intents output — skipping');
        return {
          success: true,
          output: { skipped: true, reason: 'no_intents_output' },
          duration_ms: Date.now() - start,
        };
      }

      const schedulingCommitment = (intentsOutput.commitments ?? []).find(
        (c) => c.intent === 'schedule_meeting',
      );

      // Also accept an explicit detect-scheduling-intent output if present
      const schedulingOutput = state.outputs['detect-scheduling-intent'] as
        | { scheduling_intent?: boolean; confidence?: number }
        | undefined;

      const hasSchedulingIntent =
        schedulingCommitment !== undefined ||
        schedulingOutput?.scheduling_intent === true;

      if (!hasSchedulingIntent) {
        console.log('[detect-scheduling-intent] No schedule_meeting intent detected — skipping');
        return {
          success: true,
          output: { skipped: true, reason: 'no_scheduling_intent' },
          duration_ms: Date.now() - start,
        };
      }

      console.log(
        `[detect-scheduling-intent] schedule_meeting intent found — phrase="${schedulingCommitment?.phrase ?? schedulingCommitment?.source_quote ?? 'n/a'}", confidence=${schedulingCommitment?.confidence ?? 'n/a'}`,
      );

      // -----------------------------------------------------------------------
      // 2. Verify rep has Google Calendar connected
      // -----------------------------------------------------------------------
      const supabase = getServiceClient();
      const userId = state.event.user_id;

      const { data: googleConn } = await supabase
        .from('user_integrations')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'google_calendar')
        .eq('is_active', true)
        .maybeSingle();

      if (!googleConn) {
        console.log('[detect-scheduling-intent] Rep has no active Google Calendar integration — skipping');
        return {
          success: true,
          output: { skipped: true, reason: 'no_google_calendar' },
          duration_ms: Date.now() - start,
        };
      }

      // -----------------------------------------------------------------------
      // 3. Resolve parameters for find-available-slots
      // -----------------------------------------------------------------------

      // Duration: prefer explicit intent context, fall back to 45 min default
      const durationMinutes =
        (schedulingCommitment as any)?.duration_minutes ??
        (state.event.payload.duration_minutes as number | undefined) ??
        45;

      // Prospect timezone: prefer contact CRM data in state context, fall back to UTC
      const prospectTimezone =
        (state.context.tier2?.contact as any)?.timezone ??
        (state.event.payload.prospect_timezone as string | undefined) ??
        'UTC';

      // -----------------------------------------------------------------------
      // 4. Call find-available-slots
      // -----------------------------------------------------------------------
      console.log(
        `[detect-scheduling-intent] Calling find-available-slots — duration=${durationMinutes}min, tz=${prospectTimezone}, days_ahead=7, max_results=5`,
      );

      const response = await fetch(`${supabaseUrl}/functions/v1/find-available-slots`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          org_id: state.event.org_id,
          duration_minutes: durationMinutes,
          prospect_timezone: prospectTimezone,
          days_ahead: 7,
          max_results: 5,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[detect-scheduling-intent] find-available-slots returned ${response.status}: ${errorText}`);
        // Non-fatal — return skipped so the sequence continues
        return {
          success: true,
          output: {
            skipped: true,
            reason: 'find_available_slots_failed',
            error: `HTTP ${response.status}: ${errorText}`,
          },
          duration_ms: Date.now() - start,
        };
      }

      const slotsResult = await response.json();
      const slots: unknown[] = slotsResult.slots ?? [];

      console.log(
        `[detect-scheduling-intent] Got ${slots.length} available slot(s) from find-available-slots`,
      );

      return {
        success: true,
        output: {
          scheduling_intent_detected: true,
          trigger_phrase: schedulingCommitment?.phrase ?? schedulingCommitment?.source_quote ?? null,
          duration_minutes: durationMinutes,
          prospect_timezone: prospectTimezone,
          slots,
          total_candidates: slotsResult.total_candidates ?? null,
          user_timezone: slotsResult.user_timezone ?? null,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[detect-scheduling-intent] Unexpected error:', err);
      // Fire-and-forget: never throw — return success so the sequence continues
      return {
        success: true,
        output: {
          skipped: true,
          reason: 'unexpected_error',
          error: err instanceof Error ? err.message : String(err),
        },
        duration_ms: Date.now() - start,
      };
    }
  },
};

// =============================================================================
// Block Kit Helpers (mirrored from emailDraftApproval.ts)
// =============================================================================

function _calHeader(text: string) {
  return {
    type: 'header',
    text: { type: 'plain_text', text: text.substring(0, 150), emoji: false },
  };
}

function _calSection(text: string) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: text.substring(0, 3000) },
  };
}

function _calDivider() {
  return { type: 'divider' };
}

function _calContextBlock(elements: string[]) {
  return {
    type: 'context',
    elements: elements.map((t) => ({ type: 'mrkdwn', text: t.substring(0, 300) })),
  };
}

function _calButton(
  text: string,
  actionId: string,
  value: string,
  style?: 'primary' | 'danger',
): unknown {
  const btn: Record<string, unknown> = {
    type: 'button',
    text: { type: 'plain_text', text: text.substring(0, 75), emoji: false },
    action_id: actionId,
    value,
  };
  if (style) btn.style = style;
  return btn;
}

function _calActionsBlock(blockId: string, elements: unknown[]) {
  return { type: 'actions', block_id: blockId, elements };
}

// =============================================================================
// Slot Formatter
// =============================================================================

/**
 * Format a slot start/end into a human-readable string.
 * e.g. "Thursday Mar 5, 2:00–2:45 PM PT"
 */
function _formatSlot(slot: Record<string, unknown>, durationMinutes: number, timezone: string): string {
  const start = slot.start_time as string | undefined;
  if (!start) return '(unknown time)';

  try {
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

    const tz = timezone || 'UTC';
    const dayFmt = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: tz,
    });
    const timeFmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
    });

    const tzAbbrevFmt = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short', hour: 'numeric', timeZone: tz,
    });
    const tzParts = tzAbbrevFmt.formatToParts(startDate);
    const tzAbbrev = tzParts.find((p) => p.type === 'timeZoneName')?.value || tz;

    return `${dayFmt.format(startDate)}, ${timeFmt.format(startDate)}–${timeFmt.format(endDate)} ${tzAbbrev}`;
  } catch {
    return start;
  }
}

// =============================================================================
// Block Kit Message Builder
// =============================================================================

function buildCalendarSlotApprovalBlocks(params: {
  approvalId: string;
  slots: Array<Record<string, unknown>>;
  durationMinutes: number;
  prospectTimezone: string;
  contactName: string;
  meetingTitle: string;
}): unknown[] {
  const { approvalId, slots, durationMinutes, prospectTimezone, contactName, meetingTitle } = params;

  const top3 = slots.slice(0, 3);

  const slotLines = top3
    .map((slot, i) => {
      const label = _formatSlot(slot, durationMinutes, prospectTimezone);
      const score = typeof slot.score === 'number' ? ` _(score: ${slot.score.toFixed(2)})_` : '';
      return `${i + 1}. ${label}${score}`;
    })
    .join('\n');

  const blocks: unknown[] = [
    _calHeader('Meeting Times Available'),
    _calContextBlock([
      `Meeting: *${meetingTitle}* | With: *${contactName}*`,
    ]),
    _calDivider(),
    _calSection(`*Available slots (${durationMinutes} min):*\n${slotLines}`),
    _calDivider(),
    // Each button gets its own actions block to avoid duplicate action_id conflicts
    _calActionsBlock(`cal_slot_send_email_${approvalId}`, [
      _calButton(
        'Send times via email',
        `approve::calendar_slots::${approvalId}`,
        JSON.stringify({ approvalId, subAction: 'send_email' }),
        'primary',
      ),
    ]),
    _calActionsBlock(`cal_slot_send_invite_${approvalId}`, [
      _calButton(
        'Send calendar invite',
        `approve::calendar_slots::${approvalId}`,
        JSON.stringify({ approvalId, subAction: 'send_invite' }),
      ),
    ]),
    _calActionsBlock(`cal_slot_show_more_${approvalId}`, [
      _calButton(
        'Show more options',
        `reject::calendar_slots::${approvalId}`,
        JSON.stringify({ approvalId, subAction: 'show_more' }),
      ),
    ]),
    _calActionsBlock(`cal_slot_dismiss_${approvalId}`, [
      _calButton(
        "I'll handle this",
        `reject::calendar_slots::${approvalId}`,
        JSON.stringify({ approvalId, subAction: 'dismiss' }),
        'danger',
      ),
    ]),
    _calContextBlock([`Expires in 24 hours | Sixty will track which option you choose`]),
  ];

  return blocks;
}

// =============================================================================
// Calendar Slot Approval Adapter (CAL-002)
// =============================================================================

/**
 * Calendar Slot Approval Adapter (CAL-002)
 *
 * Wave 3 step in the meeting_ended sequence.
 * Runs after detect-scheduling-intent (CAL-001) which surfaced available slots.
 *
 * Responsibilities:
 * 1. Reads slots from state.outputs['detect-scheduling-intent']
 * 2. Creates a hitl_pending_approvals row (resource_type='calendar_slots')
 * 3. Sends a Slack Block Kit DM with top 3 slot options and 4 action buttons
 * 4. Returns pending_approval to pause the sequence for human approval
 */
export const calendarSlotApprovalAdapter: SkillAdapter = {
  name: 'calendar-slot-approval',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabase = getServiceClient();

      // --- Read upstream detect-scheduling-intent output ---
      const schedulingOutput = state.outputs['detect-scheduling-intent'] as
        | {
            skipped?: boolean;
            scheduling_intent_detected?: boolean;
            slots?: Array<Record<string, unknown>>;
            duration_minutes?: number;
            prospect_timezone?: string;
          }
        | undefined;

      if (!schedulingOutput || schedulingOutput.skipped || !schedulingOutput.scheduling_intent_detected) {
        console.log('[calendar-slot-approval] No scheduling intent output — skipping HITL step');
        return {
          success: true,
          output: { skipped: true, reason: 'no_scheduling_intent' },
          duration_ms: Date.now() - start,
        };
      }

      const slots = schedulingOutput.slots ?? [];
      if (slots.length === 0) {
        console.log('[calendar-slot-approval] No slots available — skipping HITL step');
        return {
          success: true,
          output: { skipped: true, reason: 'no_slots' },
          duration_ms: Date.now() - start,
        };
      }

      const durationMinutes = schedulingOutput.duration_minutes ?? 45;
      const prospectTimezone = schedulingOutput.prospect_timezone ?? 'UTC';
      const contactName = (state.context.tier2?.contact?.name as string | undefined) || 'the prospect';
      const meetingTitle = (state.event.payload.title as string | undefined) || 'Our meeting';
      const meetingId = state.event.payload.meeting_id as string | undefined;

      // --- Get Slack credentials for DM delivery ---
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('user_id', state.event.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const { data: slackMapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', state.event.org_id)
        .eq('sixty_user_id', state.event.user_id)
        .maybeSingle();

      const botToken = slackIntegration?.access_token;
      const recipientSlackUserId = slackMapping?.slack_user_id;

      if (!botToken || !recipientSlackUserId) {
        console.log('[calendar-slot-approval] No Slack credentials — skipping HITL step');
        return {
          success: true,
          output: { skipped: true, reason: 'no_slack_integration' },
          duration_ms: Date.now() - start,
        };
      }

      // --- Open DM channel with the rep ---
      const dmResponse = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({ users: recipientSlackUserId }),
      });

      const dmData = await dmResponse.json();
      const dmChannelId = dmData.channel?.id;
      const slackTeamId = dmData.channel?.context_team_id || '';

      if (!dmChannelId) {
        console.warn('[calendar-slot-approval] Failed to open DM channel:', dmData.error);
        return {
          success: true,
          output: { skipped: true, reason: 'slack_dm_failed' },
          duration_ms: Date.now() - start,
        };
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // --- Create hitl_pending_approvals row ---
      const { data: approval, error: approvalError } = await supabase
        .from('hitl_pending_approvals')
        .insert({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          created_by: state.event.user_id,
          resource_type: 'calendar_slots',
          resource_id: meetingId || state.event.org_id,
          resource_name: `Scheduling: ${meetingTitle}`,
          slack_team_id: slackTeamId,
          slack_channel_id: dmChannelId,
          slack_message_ts: '', // updated after message is sent
          status: 'pending',
          original_content: {
            slots,
            duration_minutes: durationMinutes,
            prospect_timezone: prospectTimezone,
            contact_name: contactName,
            meeting_id: meetingId,
            meeting_title: meetingTitle,
          },
          callback_type: 'edge_function',
          callback_target: 'hitl-calendar-slot-action',
          callback_metadata: {
            meeting_id: meetingId,
            job_id: (state as any).job_id || null,
            sequence_type: 'meeting_ended',
          },
          expires_at: expiresAt,
          metadata: {
            sequence_type: 'meeting_ended',
            step: 'calendar-slot-approval',
            meeting_id: meetingId,
          },
        })
        .select('id')
        .single();

      if (approvalError || !approval?.id) {
        console.error('[calendar-slot-approval] Failed to create hitl_pending_approvals row:', approvalError);
        return {
          success: true,
          output: { skipped: true, reason: 'approval_insert_failed', error: approvalError?.message },
          duration_ms: Date.now() - start,
        };
      }

      const approvalId = approval.id;

      // --- Build and send Slack Block Kit message ---
      const blocks = buildCalendarSlotApprovalBlocks({
        approvalId,
        slots,
        durationMinutes,
        prospectTimezone,
        contactName,
        meetingTitle,
      });

      const fallbackText = `Meeting times available for ${contactName} — choose how to share them`;

      const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({
          channel: dmChannelId,
          text: fallbackText,
          blocks,
        }),
      });

      const slackResult = await slackResponse.json();

      if (!slackResult.ok) {
        console.error('[calendar-slot-approval] Slack postMessage failed:', slackResult.error);
        await supabase.from('hitl_pending_approvals').delete().eq('id', approvalId);
        return {
          success: true,
          output: { skipped: true, reason: 'slack_post_failed', error: slackResult.error },
          duration_ms: Date.now() - start,
        };
      }

      // --- Update approval row with actual Slack message timestamp ---
      await supabase
        .from('hitl_pending_approvals')
        .update({ slack_message_ts: slackResult.ts || '', updated_at: new Date().toISOString() })
        .eq('id', approvalId);

      console.log(
        `[calendar-slot-approval] HITL approval created: id=${approvalId}, ` +
        `contact=${contactName}, meeting=${meetingTitle}, slack_ts=${slackResult.ts}`,
      );

      return {
        success: true,
        output: {
          approval_id: approvalId,
          contact_name: contactName,
          meeting_title: meetingTitle,
          slots_presented: Math.min(slots.length, 3),
          slack_message_ts: slackResult.ts,
          slack_channel_id: dmChannelId,
          hitl_created: true,
        },
        duration_ms: Date.now() - start,
        // Signal the runner to pause and wait for human approval
        pending_approval: {
          step_name: 'calendar-slot-approval',
          action_type: 'calendar_slots',
          preview: `${Math.min(slots.length, 3)} meeting slots for ${contactName} — ${meetingTitle}`,
          slack_pending_action_id: approvalId,
          created_at: new Date().toISOString(),
        },
      };
    } catch (err) {
      console.error('[calendar-slot-approval] Error:', err);
      return {
        success: true,
        output: { skipped: true, reason: 'unexpected_error', error: String(err) },
        duration_ms: Date.now() - start,
      };
    }
  },
};

// =============================================================================
// Parse Scheduling Request Adapter
// =============================================================================

export const parseSchedulingRequestAdapter: SkillAdapter = {
  name: 'parse-scheduling-request',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[parse-scheduling-request] Parsing natural language scheduling request...');

      // Get scheduling text from payload (email body or explicit scheduling_text)
      const schedulingText = (
        (state.event.payload.scheduling_text as string) ||
        (state.event.payload.body as string) ||
        ''
      ).toLowerCase();

      // Default values
      let durationMinutes = 30;
      let timeframeDays = 5;
      const timezone = state.context.tier1.user.timezone || 'UTC';
      const preferences: Record<string, string> = {};

      // Parse duration patterns
      if (/\b30\s*min(ute)?s?\b/i.test(schedulingText)) {
        durationMinutes = 30;
      } else if (/\b1\s*hour\b/i.test(schedulingText) || /\bhour\s+meeting\b/i.test(schedulingText)) {
        durationMinutes = 60;
      } else if (/\b15\s*min(ute)?s?\b/i.test(schedulingText) || /\bquick\s+sync\b/i.test(schedulingText)) {
        durationMinutes = 15;
      } else if (/\b45\s*min(ute)?s?\b/i.test(schedulingText)) {
        durationMinutes = 45;
      } else if (/\b2\s*hours?\b/i.test(schedulingText)) {
        durationMinutes = 120;
      }

      // Parse timeframe patterns
      if (/\bnext\s+week\b/i.test(schedulingText)) {
        timeframeDays = 7;
      } else if (/\bthis\s+week\b/i.test(schedulingText)) {
        timeframeDays = 5;
      } else if (/\bthis\s+thursday\b/i.test(schedulingText)) {
        // Calculate days until Thursday
        const now = new Date();
        const currentDay = now.getDay(); // 0 = Sunday, 4 = Thursday
        const daysUntilThursday = (4 - currentDay + 7) % 7 || 7;
        timeframeDays = daysUntilThursday;
      } else if (/\bthis\s+friday\b/i.test(schedulingText)) {
        // Calculate days until Friday
        const now = new Date();
        const currentDay = now.getDay();
        const daysUntilFriday = (5 - currentDay + 7) % 7 || 7;
        timeframeDays = daysUntilFriday;
      } else if (/\btoday\b/i.test(schedulingText) || /\basap\b/i.test(schedulingText)) {
        timeframeDays = 1;
      } else if (/\btomorrow\b/i.test(schedulingText)) {
        timeframeDays = 2;
      } else if (/\bnext\s+(\d+)\s+days?\b/i.test(schedulingText)) {
        const match = schedulingText.match(/\bnext\s+(\d+)\s+days?\b/i);
        if (match) {
          timeframeDays = parseInt(match[1], 10);
        }
      }

      // Parse time of day preferences
      if (/\bmorning\b/i.test(schedulingText)) {
        preferences.time_of_day = 'morning';
      } else if (/\bafternoon\b/i.test(schedulingText)) {
        preferences.time_of_day = 'afternoon';
      } else if (/\bevening\b/i.test(schedulingText)) {
        preferences.time_of_day = 'evening';
      }

      const output = {
        duration_minutes: durationMinutes,
        timeframe_days: timeframeDays,
        timezone,
        preferences,
      };

      console.log(
        `[parse-scheduling-request] Parsed: ${durationMinutes}min, ${timeframeDays}d, ` +
        `${timezone}${preferences.time_of_day ? `, prefer ${preferences.time_of_day}` : ''}`
      );

      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      console.error('[parse-scheduling-request] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
