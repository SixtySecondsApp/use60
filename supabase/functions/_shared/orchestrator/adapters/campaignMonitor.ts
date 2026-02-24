/**
 * Campaign Monitor Orchestrator Adapter
 * Wraps monitor-campaigns edge function for orchestrator sequences
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import { deliverToSlack } from '../../proactive/deliverySlack.ts';
import type { ProactiveNotificationPayload } from '../../proactive/types.ts';

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
      const supabase = getServiceClient();
      const report = state.outputs['generate-campaign-report'] as any;

      // Get bot token and Slack user ID for delivery
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('user_id', state.event.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const { data: slackMapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', state.event.org_id)
        .eq('sixty_user_id', state.event.user_id)
        .maybeSingle();

      const botToken = slackIntegration?.access_token;
      const recipientSlackUserId = slackMapping?.slack_user_id;

      let slackDelivered = false;
      let deliveryError: string | undefined;

      if (!botToken) {
        console.warn('[deliver-campaign-slack] No Slack bot token found for user');
        deliveryError = 'No Slack integration';
      } else if (!recipientSlackUserId) {
        console.warn('[deliver-campaign-slack] No Slack user mapping found');
        deliveryError = 'No Slack user mapping';
      } else {
        // Build Slack blocks from campaign report
        const blocks = report.blocks || [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Campaign Daily Check*\n${report.summary || 'Campaign metrics updated'}`,
            },
          },
        ];

        // Route through proactive delivery layer (handles quiet hours + rate limiting)
        const payload: ProactiveNotificationPayload = {
          type: 'campaign_daily_check',
          orgId: state.event.org_id,
          recipientUserId: state.event.user_id,
          recipientSlackUserId,
          entityType: 'campaign',
          entityId: report.campaign_id,
          title: 'Campaign Daily Check',
          message: report.summary || 'Campaign metrics updated',
          blocks,
          metadata: {
            campaign_id: report.campaign_id,
            metrics: report.metrics,
            reply_rate: report.reply_rate,
          },
          priority: 'medium',
        };

        const deliveryResult = await deliverToSlack(supabase, payload, botToken);
        slackDelivered = deliveryResult.sent;
        deliveryError = deliveryResult.error;

        if (!slackDelivered) {
          console.warn(
            `[deliver-campaign-slack] Slack delivery blocked/failed: ${deliveryError}`
          );
        }
      }

      // Insert agent_activity record (in-app mirroring)
      try {
        const { error: activityError } = await supabase.rpc('insert_agent_activity', {
          p_user_id: state.event.user_id,
          p_org_id: state.event.org_id,
          p_sequence_type: 'campaign_daily_check',
          p_title: 'Campaign Daily Check',
          p_summary: report.summary || 'Campaign metrics updated',
          p_metadata: {
            campaign_id: report.campaign_id,
            metrics: report.metrics,
            reply_rate: report.reply_rate,
            delivery_method: slackDelivered ? 'slack' : 'in_app_only',
            delivery_error: deliveryError,
          },
          p_job_id: null,
        });

        if (activityError) {
          console.error('[deliver-campaign-slack] Failed to insert agent_activity:', activityError);
        } else {
          console.log('[deliver-campaign-slack] Agent activity recorded');
        }
      } catch (actErr) {
        console.error('[deliver-campaign-slack] Error inserting agent_activity:', actErr);
      }

      return {
        success: true,
        output: {
          delivered: slackDelivered,
          delivery_method: slackDelivered ? 'slack' : 'in_app_only',
          delivery_error: deliveryError,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
