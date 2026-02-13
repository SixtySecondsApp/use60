/**
 * Email Classifier Adapter
 *
 * Wraps the categorize-email edge function to conform to the orchestrator's
 * SkillAdapter interface. Classifies emails into categories (to_respond, fyi,
 * marketing, etc.) and extracts sales signals.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';

export const emailClassifierAdapter: SkillAdapter = {
  name: 'classify-email-intent',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables');
      }

      // Extract email data from event payload
      const payload = state.event.payload;
      const messageId = payload.message_id as string;
      const subject = payload.subject as string;
      const body = payload.body as string;
      const from = payload.from as string;

      if (!messageId || (!subject && !body)) {
        throw new Error('Email message_id and subject/body are required in event payload');
      }

      // Call existing categorize-email edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/categorize-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          subject: subject || '',
          body: body || '',
          from: from || '',
          labels: payload.labels as string[] || [],
          direction: payload.direction as 'inbound' | 'outbound' || 'inbound',
          threadId: payload.thread_id as string,
          userId: state.event.user_id,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`categorize-email returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // Map the result to a standardized format
      const standardizedResult = {
        category: result.category,
        confidence: result.confidence,
        signals: result.signals,
        reasoning: result.reasoning,
        // Include original result for debugging
        raw: result,
      };

      return {
        success: true,
        output: standardizedResult,
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
