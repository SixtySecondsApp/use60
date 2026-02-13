/**
 * Proposal Generator Adapter
 *
 * Wraps the generate-proposal edge function for orchestrator use.
 * Generates proposal templates based on meeting context, deal info, and detected intents.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';

export const proposalGeneratorAdapter: SkillAdapter = {
  name: 'select-proposal-template',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables');
      }

      // Prepare payload for generate-proposal
      const payload = {
        org_id: state.event.org_id,
        user_id: state.event.user_id,
        deal_id: state.context.tier2?.deal?.id,
        contact_id: state.context.tier2?.contact?.id,
        trigger_phrase: state.event.payload.trigger_phrase as string | undefined,
        meeting_context: state.outputs['extract-action-items'] || {},
        intent_data: state.outputs['detect-intents'] || {},
      };

      // Call generate-proposal edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-proposal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`generate-proposal returned ${response.status}: ${errorText}`);
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
