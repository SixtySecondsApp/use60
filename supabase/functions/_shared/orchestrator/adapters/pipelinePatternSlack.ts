/**
 * Pipeline Pattern Slack Adapter (KNW-011)
 *
 * Delivers pipeline pattern alerts and weekly insights via Slack.
 * Handles both immediate critical alerts and weekly digest messages.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

const APP_URL_FALLBACK = 'https://app.use60.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// ─── Slack Block Kit helpers ────────────────────────────────────────────────

interface SlackBlock { type: string; [key: string]: unknown; }
interface SlackMessage { text: string; blocks: SlackBlock[]; }

function section(mrkdwn: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text: mrkdwn } };
}
function divider(): SlackBlock { return { type: 'divider' }; }
function header(text: string): SlackBlock {
  return { type: 'header', text: { type: 'plain_text', text, emoji: true } };
}
function ctx(text: string): SlackBlock {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return ':rotating_light:';
    case 'warning': return ':warning:';
    default: return ':information_source:';
  }
}

// ─── Analyse Pipeline Patterns ──────────────────────────────────────────────

export const analysePipelinePatternsAdapter: SkillAdapter = {
  name: 'analyse-pipeline-patterns',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[analyse-pipeline-patterns] Starting...');

      const orgId = state.event.org_id;

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/agent-pipeline-patterns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ org_id: orgId }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { success: false, error: `edge_function_${resp.status}: ${text}`, duration_ms: Date.now() - start };
      }

      const result = await resp.json();
      console.log(`[analyse-pipeline-patterns] ${result.patterns_detected} patterns detected`);
      return { success: true, output: result, duration_ms: Date.now() - start };

    } catch (err) {
      console.error('[analyse-pipeline-patterns] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// ─── Deliver Pattern Slack Notification ─────────────────────────────────────

export const deliverPatternSlackAdapter: SkillAdapter = {
  name: 'deliver-pattern-slack',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[deliver-pattern-slack] Starting...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      // Get patterns from upstream or from event payload
      const analyseOutput = state.outputs?.['analyse-pipeline-patterns'] as Record<string, unknown> | undefined;
      let patterns = (analyseOutput?.patterns as Array<Record<string, unknown>>) || [];

      // If no patterns from upstream, load active patterns for the org
      if (patterns.length === 0) {
        const { data } = await supabase.rpc('get_active_pipeline_patterns', {
          p_org_id: orgId,
          p_limit: 5,
        });
        patterns = data || [];
      }

      if (patterns.length === 0) {
        return { success: true, output: { delivered: 0, reason: 'no_patterns' }, duration_ms: Date.now() - start };
      }

      // Get Slack bot token
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const botToken = slackIntegration?.access_token as string | null;
      if (!botToken) {
        return { success: true, output: { delivered: 0, skipped_reason: 'no_slack_integration' }, duration_ms: Date.now() - start };
      }

      // Get all org members' Slack IDs (pipeline patterns are org-wide)
      const { data: members } = await supabase
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', orgId)
        .in('role', ['owner', 'admin']);

      const memberIds = (members || []).map(m => m.user_id);
      if (memberIds.length === 0) {
        return { success: true, output: { delivered: 0, skipped_reason: 'no_admin_members' }, duration_ms: Date.now() - start };
      }

      const { data: slackMappings } = await supabase
        .from('slack_user_mappings')
        .select('sixty_user_id, slack_user_id')
        .eq('org_id', orgId)
        .in('sixty_user_id', memberIds);

      const slackUserIds = (slackMappings || []).map(m => m.slack_user_id).filter(Boolean);
      if (slackUserIds.length === 0) {
        return { success: true, output: { delivered: 0, skipped_reason: 'no_slack_mappings' }, duration_ms: Date.now() - start };
      }

      // Build Slack message
      const appUrl = Deno.env.get('APP_URL') || APP_URL_FALLBACK;
      const isCritical = patterns.some(p => p.severity === 'critical');

      const topSeverity = patterns.some(p => p.severity === 'critical')
        ? 'critical'
        : patterns.some(p => p.severity === 'warning')
          ? 'warning'
          : 'info';
      const headerIcon = severityIcon(topSeverity);
      const headerLabel = isCritical ? `${headerIcon} Pipeline Alert` : `${headerIcon} Weekly Pipeline Insights`;

      const blocks: SlackBlock[] = [
        header(headerLabel),
        ctx(`Trigger: ${isCritical ? 'Critical pipeline pattern detected' : 'Scheduled pipeline pattern analysis'}`),
        section(`*${patterns.length} pattern${patterns.length > 1 ? 's' : ''}* detected across your pipeline:`),
        divider(),
      ];

      for (const pattern of patterns.slice(0, 5)) {
        const icon = severityIcon(pattern.severity as string || 'info');
        const affectedCount = (pattern.affected_deal_ids as string[] || pattern.affected_deal_count || []).length || pattern.affected_deal_count || 0;

        let detail = `${icon} *${pattern.title}*\n`;
        detail += `${pattern.description}\n`;
        if (affectedCount > 0) detail += `_${affectedCount} deal${affectedCount > 1 ? 's' : ''} affected_`;

        blocks.push(section(detail));

        // Show top actionable deals
        const actionableDeals = (pattern.actionable_deals as Array<Record<string, unknown>>) || [];
        if (actionableDeals.length > 0) {
          const dealList = actionableDeals.slice(0, 3).map(d =>
            `• *${d.name}*: ${d.recommended_action}`
          ).join('\n');
          blocks.push(ctx(dealList));
        }
      }

      blocks.push(
        divider(),
        ctx(`<${appUrl}/pipeline|View pipeline> | Confidence: ${Math.round(Math.max(...patterns.map(p => (p.confidence as number) || 0)) * 100)}%`)
      );

      const message: SlackMessage = {
        text: `Pipeline insight: ${patterns[0]?.title || 'New patterns detected'}`,
        blocks,
      };

      // Send to first admin (avoid spamming all admins weekly)
      let delivered = 0;
      const targetSlackId = slackUserIds[0];

      const openResp = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({ users: targetSlackId }),
      });
      const openData = await openResp.json();

      if (openData.ok) {
        const sendResp = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
          body: JSON.stringify({ channel: openData.channel.id, ...message }),
        });
        const sendData = await sendResp.json();
        if (sendData.ok) delivered++;
      }

      console.log(`[deliver-pattern-slack] Delivered to ${delivered} user(s)`);
      return { success: true, output: { delivered, patterns_count: patterns.length }, duration_ms: Date.now() - start };

    } catch (err) {
      console.error('[deliver-pattern-slack] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
