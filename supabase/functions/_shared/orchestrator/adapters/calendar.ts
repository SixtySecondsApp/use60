/**
 * Calendar Orchestrator Adapters
 * Wraps find-available-slots and create-calendar-event for orchestrator
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';

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
