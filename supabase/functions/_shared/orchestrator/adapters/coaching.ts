/**
 * Coaching Orchestrator Adapters
 * Wraps coaching-analysis edge function for orchestrator sequences
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';

export const coachingMicroFeedbackAdapter: SkillAdapter = {
  name: 'coaching-micro-feedback',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          meeting_id: state.event.payload.meeting_id,
          mode: 'per_meeting',
          transcript: state.event.payload.transcript,
          context: {
            rep_name: state.context.tier1.user.name,
            org_name: state.context.tier1.org.name,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`coaching-analysis returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const aggregateWeeklyMetricsAdapter: SkillAdapter = {
  name: 'aggregate-weekly-metrics',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          mode: 'weekly_aggregate',
        }),
      });

      if (!response.ok) {
        throw new Error(`coaching-analysis returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const correlateWinLossAdapter: SkillAdapter = {
  name: 'correlate-win-loss',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          mode: 'correlate_win_loss',
          weekly_metrics: state.outputs['aggregate-weekly-metrics'],
        }),
      });

      if (!response.ok) {
        throw new Error(`correlate-win-loss returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const generateCoachingDigestAdapter: SkillAdapter = {
  name: 'generate-coaching-digest',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          mode: 'generate_digest',
          weekly_metrics: state.outputs['aggregate-weekly-metrics'],
          win_loss_correlation: state.outputs['correlate-win-loss'],
        }),
      });

      if (!response.ok) {
        throw new Error(`generate-coaching-digest returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const deliverCoachingSlackAdapter: SkillAdapter = {
  name: 'deliver-coaching-slack',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const digest = state.outputs['generate-coaching-digest'];

      const response = await fetch(`${supabaseUrl}/functions/v1/slack-send-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          message_type: 'coaching_digest',
          data: digest,
        }),
      });

      if (!response.ok) {
        throw new Error(`slack-send-message returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
