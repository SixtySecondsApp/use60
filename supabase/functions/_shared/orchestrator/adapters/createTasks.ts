/**
 * Create Tasks Adapter
 *
 * Wraps the create-task-unified edge function to conform to the orchestrator's
 * SkillAdapter interface. Creates tasks from action items extracted in previous steps.
 *
 * This is a batch adapter — it iterates over action items from previous step output
 * and creates tasks for each.
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

      // Extract action items from previous step output
      // The extract-action-items step should have stored action items in outputs
      const actionItemsOutput = state.outputs['extract-action-items'] as any;

      if (!actionItemsOutput?.action_items || actionItemsOutput.action_items.length === 0) {
        return {
          success: true,
          output: { tasks_created: 0, message: 'No action items to create tasks from' },
          duration_ms: Date.now() - start,
        };
      }

      // Extract action item IDs
      const actionItemIds = actionItemsOutput.action_items.map((item: any) => item.id).filter(Boolean);

      if (actionItemIds.length === 0) {
        return {
          success: true,
          output: { tasks_created: 0, message: 'No valid action item IDs found' },
          duration_ms: Date.now() - start,
        };
      }

      // Call create-task-unified in auto mode
      const response = await fetch(`${supabaseUrl}/functions/v1/create-task-unified`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'auto',
          action_item_ids: actionItemIds,
          source: 'action_item',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`create-task-unified returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      return {
        success: result.success || false,
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
