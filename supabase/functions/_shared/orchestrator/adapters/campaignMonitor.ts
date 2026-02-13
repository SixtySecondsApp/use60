/**
 * Campaign Monitor Orchestrator Adapter
 * Wraps monitor-campaigns edge function for orchestrator sequences
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';

export const pullCampaignMetricsAdapter: SkillAdapter = {
  name: 'pull-campaign-metrics',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/monitor-campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          mode: 'metrics',
        }),
      });

      if (!response.ok) {
        throw new Error(`monitor-campaigns returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const classifyRepliesAdapter: SkillAdapter = {
  name: 'classify-replies',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/monitor-campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          mode: 'classify_replies',
          campaign_metrics: state.outputs['pull-campaign-metrics'],
        }),
      });

      if (!response.ok) {
        throw new Error(`classify-replies returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const generateCampaignReportAdapter: SkillAdapter = {
  name: 'generate-campaign-report',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/monitor-campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          mode: 'report',
          metrics: state.outputs['pull-campaign-metrics'],
          classified_replies: state.outputs['classify-replies'],
        }),
      });

      if (!response.ok) {
        throw new Error(`generate-campaign-report returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const deliverCampaignSlackAdapter: SkillAdapter = {
  name: 'deliver-campaign-slack',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      // This adapter sends the campaign report to Slack
      // The actual Slack message building uses buildCampaignReportMessage from the handler
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const report = state.outputs['generate-campaign-report'] as any;

      // Send via existing Slack delivery infrastructure
      const response = await fetch(`${supabaseUrl}/functions/v1/slack-send-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          message_type: 'campaign_report',
          data: report,
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
