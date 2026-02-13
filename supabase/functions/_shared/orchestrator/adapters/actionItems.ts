/**
 * Action Items Adapter
 *
 * Wraps the extract-action-items edge function to conform to the orchestrator's
 * SkillAdapter interface. Extracts action items from meeting transcripts using AI.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';

export const actionItemsAdapter: SkillAdapter = {
  name: 'extract-action-items',

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

      // Call existing extract-action-items edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/extract-action-items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId,
          rerun: false, // Don't rerun if already extracted
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`extract-action-items returned ${response.status}: ${errorText}`);
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
