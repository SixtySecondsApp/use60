/**
 * Action Items Adapter
 *
 * Wraps the extract-action-items edge function to conform to the orchestrator's
 * SkillAdapter interface. Extracts action items from meeting transcripts using AI.
 *
 * After extraction, queries the actual action items and includes them in the output
 * so downstream steps (createTasks, nextActions, detectIntents) can use the details.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

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
          rerun: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`extract-action-items returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // --- Enrich output with actual action item details ---
      // This makes downstream steps (createTasks, nextActions) context-aware
      // by seeing the actual items rather than just a count
      const supabase = getServiceClient();
      const { data: actionItems } = await supabase
        .from('meeting_action_items')
        .select('id, title, assignee_name, assignee_email, priority, category, deadline_at, ai_confidence')
        .eq('meeting_id', meetingId)
        .eq('ai_generated', true)
        .order('priority', { ascending: true });

      const enrichedOutput = {
        ...result,
        action_items: actionItems || [],
        meeting_id: meetingId,
      };

      console.log(`[extract-action-items] Extracted ${result.itemsCreated || 0} items, ${actionItems?.length || 0} total AI items for meeting`);

      return {
        success: true,
        output: enrichedOutput,
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
