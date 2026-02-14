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
