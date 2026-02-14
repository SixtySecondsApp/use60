/**
 * Create Tasks Adapter
 *
 * Wraps the create-task-unified edge function to conform to the orchestrator's
 * SkillAdapter interface. Creates tasks from action items extracted in previous steps.
 *
 * Uses enriched action item data from the upgraded actionItems adapter,
 * and includes deal/contact/meeting context in the output for downstream use.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';

export const createTasksAdapter: SkillAdapter = {
  name: 'create-tasks-from-actions',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables');
      }

      // Get enriched action items from previous step
      const actionItemsOutput = state.outputs['extract-action-items'] as any;

      if (!actionItemsOutput?.action_items || actionItemsOutput.action_items.length === 0) {
        return {
          success: true,
          output: { tasks_created: 0, message: 'No action items to create tasks from' },
          duration_ms: Date.now() - start,
        };
      }

      // Extract action item IDs from enriched output
      const actionItemIds = actionItemsOutput.action_items
        .map((item: any) => item.id)
        .filter(Boolean);

      if (actionItemIds.length === 0) {
        return {
          success: true,
          output: { tasks_created: 0, message: 'No valid action item IDs found' },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[create-tasks] Creating tasks from ${actionItemIds.length} action items`);

      // Include context metadata for smarter task creation
      const meetingId = state.event.payload.meeting_id as string | undefined;
      const contactName = state.context.tier2?.contact?.name;
      const dealName = state.context.tier2?.deal?.name;
      const meetingTitle = state.event.payload.title as string | undefined;

      if (contactName || dealName) {
        console.log(`[create-tasks] Context: contact=${contactName || 'none'}, deal=${dealName || 'none'}, meeting=${meetingTitle || 'none'}`);
      }

      // Call create-task-unified in manual mode (orchestrator bypasses user auto-sync prefs)
      const response = await fetch(`${supabaseUrl}/functions/v1/create-task-unified`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'manual',
          action_item_ids: actionItemIds,
          source: 'action_item',
          // Pass context metadata (edge function may use in future)
          context: {
            meeting_id: meetingId,
            meeting_title: meetingTitle,
            contact_name: contactName,
            deal_name: dealName,
            user_id: state.event.user_id,
            org_id: state.event.org_id,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`create-task-unified returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      console.log(`[create-tasks] Result: ${result.tasks_created || 0} tasks created`);

      return {
        success: result.success || false,
        output: {
          ...result,
          meeting_id: meetingId,
          contact_name: contactName,
          deal_name: dealName,
        },
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
