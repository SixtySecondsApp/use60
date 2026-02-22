/**
 * Command Centre Digest Builder
 *
 * Prepares CC items for the Slack digest block builder.
 * Groups items by urgency, truncates summaries, and computes footer stats.
 */

import type { CommandCentreItem } from './types.ts';

// Maximum items to show inline per urgency tier (to stay within Slack's 50-block limit)
export const CC_DIGEST_MAX_CRITICAL = 5;
export const CC_DIGEST_MAX_HIGH = 3;

export interface CCDigestStats {
  /** Items auto-completed overnight (status = 'auto_resolved') */
  auto_completed_count: number;
  /** Total pipeline value (£/$/€) across all items with deal context */
  pipeline_value_sum: number;
  /** Currency code for pipeline display (e.g. 'GBP', 'USD') */
  currency_code?: string;
  /** Currency locale for Intl.NumberFormat */
  currency_locale?: string;
  /** Number of proposals awaiting response */
  proposals_awaiting: number;
}

export interface CCDigestItem {
  id: string;
  title: string;
  summary: string;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  item_type: string;
  source_agent: string;
  deal_id?: string;
  contact_id?: string;
  /** True when this item has a drafted action ready to send */
  has_drafted_action: boolean;
  drafted_action_display?: string;
}

export interface CCDigestTier {
  items: CCDigestItem[];
  /** Total count in this tier (may exceed items.length if capped) */
  total_count: number;
}

export interface CCDigestData {
  critical: CCDigestTier;
  high: CCDigestTier;
  /** Count of normal + low items (not shown inline) */
  normal_count: number;
  stats: CCDigestStats & { total_items: number };
}

/**
 * Truncate a string to max chars with ellipsis.
 */
const truncateSummary = (text: string | null | undefined, max: number): string => {
  if (!text) return '';
  const v = text.trim();
  if (v.length <= max) return v;
  return `${v.slice(0, max - 1)}\u2026`;
};

/**
 * Convert a raw CommandCentreItem into the digest-ready CCDigestItem shape.
 */
const toDigestItem = (item: CommandCentreItem): CCDigestItem => ({
  id: item.id,
  title: item.title,
  summary: truncateSummary(item.summary, 200),
  urgency: item.urgency,
  item_type: item.item_type,
  source_agent: item.source_agent,
  deal_id: item.deal_id,
  contact_id: item.contact_id,
  has_drafted_action: !!item.drafted_action,
  drafted_action_display: item.drafted_action?.display_text
    ? truncateSummary(item.drafted_action.display_text, 120)
    : undefined,
});

/**
 * prepareCCDigestData
 *
 * Groups items by urgency tier, caps inline items to Slack block limits,
 * and computes footer stats. Returns a CCDigestData object ready to pass
 * into buildCommandCentreDigest() in slackBlocks.ts.
 */
export const prepareCCDigestData = (
  items: CommandCentreItem[],
  stats: CCDigestStats,
): CCDigestData => {
  // Filter to open/ready items only (skip completed, dismissed, etc.)
  const active = items.filter(
    (i) => i.status === 'open' || i.status === 'ready' || i.status === 'enriching',
  );

  const byUrgency = (urgency: string): CommandCentreItem[] =>
    active.filter((i) => i.urgency === urgency);

  const criticalAll = byUrgency('critical');
  const highAll = byUrgency('high');
  const normalCount = byUrgency('normal').length + byUrgency('low').length;

  const criticalItems = criticalAll.slice(0, CC_DIGEST_MAX_CRITICAL).map(toDigestItem);
  const highItems = highAll.slice(0, CC_DIGEST_MAX_HIGH).map(toDigestItem);

  return {
    critical: {
      items: criticalItems,
      total_count: criticalAll.length,
    },
    high: {
      items: highItems,
      total_count: highAll.length,
    },
    normal_count: normalCount,
    stats: {
      ...stats,
      total_items: active.length,
    },
  };
};
