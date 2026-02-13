/**
 * Next Actions Adapter
 *
 * Wraps the suggest-next-actions edge function to conform to the orchestrator's
 * SkillAdapter interface. Generates intelligent next-action suggestions based on
 * meeting analysis.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';

export const nextActionsAdapter: SkillAdapter = {
  name: 'suggest-next-actions',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables');
      }

      // Extract meeting_id from event payload
      const meetingId = state.event.payload.meeting_id as string;
      if (!meetingId) {
        throw new Error('meeting_id not found in event payload');
      }

      // Call existing suggest-next-actions edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/suggest-next-actions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activityId: meetingId,
          activityType: 'meeting',
          userId: state.event.user_id,
          forceRegenerate: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`suggest-next-actions returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};
