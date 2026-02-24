/**
 * Next Actions Adapter
 *
 * Wraps the suggest-next-actions edge function to conform to the orchestrator's
 * SkillAdapter interface. Generates intelligent next-action suggestions.
 *
 * Uses prior pipeline outputs to prevent duplicate suggestions:
 * - Converts extracted action items into existingContext.tasks
 * - Converts detected intents into existingContext.suggestions
 * - Passes coaching insights for informed recommendations
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

      const meetingId = state.event.payload.meeting_id as string;
      if (!meetingId) {
        throw new Error('meeting_id not found in event payload');
      }

      // --- Build existingContext from prior pipeline outputs ---
      // This prevents the suggest-next-actions AI from generating
      // duplicate suggestions that overlap with already-extracted items
      const existingContext: {
        tasks: Array<{ title: string; task_type: string; status: string }>;
        suggestions: Array<{ title: string; action_type: string; status: string }>;
      } = {
        tasks: [],
        suggestions: [],
      };

      // Convert extracted action items → existingContext.tasks
      const actionItemsOutput = state.outputs['extract-action-items'] as any;
      if (actionItemsOutput?.action_items) {
        for (const item of actionItemsOutput.action_items) {
          existingContext.tasks.push({
            title: item.title || 'Untitled action item',
            task_type: item.category || 'general',
            status: item.completed ? 'completed' : 'pending',
          });
        }
      }

      // Convert detected intents → existingContext.suggestions
      const intentsOutput = state.outputs['detect-intents'] as any;
      if (intentsOutput?.follow_up_items) {
        for (const item of intentsOutput.follow_up_items) {
          existingContext.suggestions.push({
            title: item.action || 'Follow-up item',
            action_type: item.intent_type || 'follow_up',
            status: 'pending',
          });
        }
      }
      if (intentsOutput?.commitments) {
        for (const commitment of intentsOutput.commitments) {
          if (commitment.speaker === 'rep' || commitment.speaker_side === 'seller') {
            existingContext.suggestions.push({
              title: commitment.phrase || commitment.source_quote || 'Commitment',
              action_type: commitment.intent || commitment.action_type || 'general',
              status: 'pending',
            });
          }
        }
      }

      const hasExistingContext = existingContext.tasks.length > 0 || existingContext.suggestions.length > 0;

      console.log(
        `[suggest-next-actions] Passing ${existingContext.tasks.length} existing tasks ` +
        `and ${existingContext.suggestions.length} existing suggestions to prevent duplicates`,
      );

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
          existingContext: hasExistingContext ? existingContext : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`suggest-next-actions returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      console.log(
        `[suggest-next-actions] Generated ${result.count || result.suggestions?.length || 0} suggestions, ` +
        `${result.tasks?.length || 0} auto-created tasks`,
      );

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
