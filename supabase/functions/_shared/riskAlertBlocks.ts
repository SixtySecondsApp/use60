/**
 * Risk Alert Slack Block Kit Builder
 *
 * Builds rich Slack Block Kit messages for high/critical risk deals
 * with deal summary, trend arrows, evidence quotes, intervention playbooks,
 * and action buttons.
 *
 * Story: RSK-008
 */

import type { InterventionPlaybook } from './orchestrator/riskPlaybooks.ts';

// =============================================================================
// Types
// =============================================================================

interface DealAlertContext {
  deal_id: string;
  deal_name: string;
  deal_value: number | null;
  deal_stage: string;
  days_in_stage: number;
  risk_score: number;
  previous_score: number | null;
  risk_level: string;
  owner_name: string | null;
}

interface SignalSummary {
  signal_type: string;
  severity: string;
  title: string;
  evidence_quote: string | null;
}

interface AlertConfig {
  app_url: string;
  include_evidence: boolean;
  include_playbook: boolean;
}

// =============================================================================
// Block Kit Builder
// =============================================================================

/**
 * Build rich Slack Block Kit blocks for a risk alert.
 */
export function buildRiskAlertBlocks(
  deal: DealAlertContext,
  signals: SignalSummary[],
  playbooks: InterventionPlaybook[],
  config: AlertConfig,
): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  // ---------------------------------------------------------------------------
  // 1. Header with risk level emoji
  // ---------------------------------------------------------------------------
  const riskEmoji = getRiskEmoji(deal.risk_level);
  const trendArrow = getTrendArrow(deal.risk_score, deal.previous_score);

  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${riskEmoji} ${deal.risk_level.toUpperCase()} RISK — ${deal.deal_name}`,
      emoji: true,
    },
  });

  // ---------------------------------------------------------------------------
  // 2. Deal summary context
  // ---------------------------------------------------------------------------
  const valueFmt = deal.deal_value != null
    ? `${formatCurrency(deal.deal_value)}`
    : 'No value set';

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `*${valueFmt}* • ${deal.deal_stage} • Day ${deal.days_in_stage}${deal.owner_name ? ` • Owner: ${deal.owner_name}` : ''}`,
      },
    ],
  });

  // ---------------------------------------------------------------------------
  // 3. Risk score with trend
  // ---------------------------------------------------------------------------
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Risk Score:* ${deal.risk_score}/100 ${trendArrow}`,
    },
  });

  blocks.push({ type: 'divider' });

  // ---------------------------------------------------------------------------
  // 4. Top signals with evidence
  // ---------------------------------------------------------------------------
  const topSignals = signals.slice(0, 3);
  if (topSignals.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Top Risk Signals:*',
      },
    });

    for (const signal of topSignals) {
      const severityEmoji = getSeverityEmoji(signal.severity);
      let signalText = `${severityEmoji} *${signal.title}*`;

      if (config.include_evidence && signal.evidence_quote) {
        const quote = truncate(signal.evidence_quote, 150);
        signalText += `\n> _${quote}_`;
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: signalText,
        },
      });
    }

    blocks.push({ type: 'divider' });
  }

  // ---------------------------------------------------------------------------
  // 5. Intervention playbook (top suggestion)
  // ---------------------------------------------------------------------------
  if (config.include_playbook && playbooks.length > 0) {
    const topPlaybook = playbooks[0];
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Suggested Action:*\n${topPlaybook.action}`,
      },
    });

    if (topPlaybook.expected_outcome) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Expected outcome: ${topPlaybook.expected_outcome}`,
          },
        ],
      });
    }

    blocks.push({ type: 'divider' });
  }

  // ---------------------------------------------------------------------------
  // 6. Action buttons
  // ---------------------------------------------------------------------------
  const dealUrl = `${config.app_url}/deals?id=${deal.deal_id}`;

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View Full Analysis', emoji: true },
        url: dealUrl,
        style: 'primary',
        action_id: `risk_view_${deal.deal_id}`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Draft Check-in', emoji: true },
        url: `${config.app_url}/copilot?action=draft_checkin&deal_id=${deal.deal_id}`,
        action_id: `risk_checkin_${deal.deal_id}`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Dismiss', emoji: true },
        action_id: `risk_dismiss_${deal.deal_id}`,
      },
    ],
  });

  return blocks;
}

/**
 * Build a compact alert text (for fallback/notification text).
 */
export function buildRiskAlertText(deal: DealAlertContext, signals: SignalSummary[]): string {
  const riskEmoji = getRiskEmoji(deal.risk_level);
  const trendArrow = getTrendArrow(deal.risk_score, deal.previous_score);
  const topSignal = signals[0]?.title || 'Multiple risk signals';

  return `${riskEmoji} ${deal.risk_level.toUpperCase()} RISK — ${deal.deal_name} (${deal.risk_score}/100 ${trendArrow}): ${topSignal}`;
}

// =============================================================================
// Helpers
// =============================================================================

function getRiskEmoji(level: string): string {
  switch (level) {
    case 'critical': return ':rotating_light:';
    case 'high': return ':warning:';
    case 'medium': return ':large_yellow_circle:';
    default: return ':white_check_mark:';
  }
}

function getSeverityEmoji(severity: string): string {
  switch (severity) {
    case 'critical': return ':red_circle:';
    case 'high': return ':orange_circle:';
    case 'medium': return ':large_yellow_circle:';
    default: return ':white_circle:';
  }
}

function getTrendArrow(current: number, previous: number | null): string {
  if (previous == null) return '';
  const delta = current - previous;
  if (delta > 5) return `:arrow_up: +${delta}`;
  if (delta < -5) return `:arrow_down: ${delta}`;
  return ':left_right_arrow: stable';
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `£${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `£${(value / 1000).toFixed(0)}K`;
  return `£${value.toLocaleString()}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
