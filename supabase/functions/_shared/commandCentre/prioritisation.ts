/**
 * Command Centre Prioritisation Engine
 *
 * Scores command_centre_items 0–100 using 5 weighted factors:
 *   1. time_sensitivity  (0.30) — due date proximity, meeting imminence
 *   2. deal_value        (0.25) — normalised deal amount × stage probability
 *   3. signal_strength   (0.20) — risk score, buying signals, engagement spikes
 *   4. strategic_alignment (0.15) — target account flag, ICP fit
 *   5. effort_required   (0.10) — inverted: easy / one-click actions score higher
 *
 * Story: CC8-004
 */

import type { CommandCentreItem } from './types.ts';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PriorityFactor {
  raw: number;       // 0–100 before weighting
  weighted: number;  // raw × weight
  detail: string;    // human-readable explanation
}

export interface PriorityFactors {
  time_sensitivity: PriorityFactor;
  deal_value: PriorityFactor;
  signal_strength: PriorityFactor;
  strategic_alignment: PriorityFactor;
  effort_required: PriorityFactor;
}

export interface DealContext {
  amount?: number;
  stage?: string;
  stage_probability?: number;   // 0–1 (e.g. 0.70 for 70%)
  org_avg_deal_value?: number;
  is_target_account?: boolean;
}

export interface PriorityResult {
  score: number;                // final 0–100 composite score
  factors: PriorityFactors;
}

// ---------------------------------------------------------------------------
// Weights (must sum to 1.0)
// ---------------------------------------------------------------------------

const WEIGHT_TIME_SENSITIVITY   = 0.30;
const WEIGHT_DEAL_VALUE         = 0.25;
const WEIGHT_SIGNAL_STRENGTH    = 0.20;
const WEIGHT_STRATEGIC_ALIGNMENT = 0.15;
const WEIGHT_EFFORT_REQUIRED    = 0.10;

// ---------------------------------------------------------------------------
// Factor calculators
// ---------------------------------------------------------------------------

function scoreTimeSensitivity(item: CommandCentreItem): PriorityFactor {
  const now = Date.now();
  let raw = 20; // neutral baseline — no due date
  let detail = 'No due date set';

  if (item.due_date) {
    const msUntilDue = new Date(item.due_date).getTime() - now;
    const hoursUntilDue = msUntilDue / (1000 * 60 * 60);

    if (hoursUntilDue < 0) {
      raw = 100;
      detail = 'Overdue';
    } else if (hoursUntilDue < 24) {
      raw = 80;
      detail = 'Due today';
    } else if (hoursUntilDue < 72) {
      raw = 50;
      detail = 'Due within 3 days';
    } else if (hoursUntilDue < 168) {
      raw = 30;
      detail = 'Due this week';
    } else {
      raw = 15;
      detail = 'Due later';
    }
  }

  // Bonus: meeting within 24 hours (check context for meeting_date)
  const ctx = item.context as Record<string, unknown>;
  const meetingDate = ctx?.meeting_date as string | undefined;
  if (meetingDate) {
    const msUntilMeeting = new Date(meetingDate).getTime() - now;
    const hoursUntilMeeting = msUntilMeeting / (1000 * 60 * 60);
    if (hoursUntilMeeting >= 0 && hoursUntilMeeting < 24) {
      raw = Math.min(100, raw + 15);
      detail += ' (meeting within 24h)';
    }
  }

  return { raw, weighted: raw * WEIGHT_TIME_SENSITIVITY, detail };
}

function scoreDealValue(item: CommandCentreItem, dealContext?: DealContext): PriorityFactor {
  if (!dealContext || dealContext.amount == null) {
    return {
      raw: 30,
      weighted: 30 * WEIGHT_DEAL_VALUE,
      detail: 'No deal context',
    };
  }

  const { amount, org_avg_deal_value, stage_probability } = dealContext;

  // Normalise: amount relative to org average, capped at 100
  let raw: number;
  let detail: string;

  if (org_avg_deal_value && org_avg_deal_value > 0) {
    raw = Math.min(100, (amount / org_avg_deal_value) * 50);
    detail = `$${amount.toLocaleString()} vs avg $${org_avg_deal_value.toLocaleString()}`;
  } else {
    // Rough absolute scale if no org average: $100k = 50, $500k = 100
    raw = Math.min(100, (amount / 100_000) * 50);
    detail = `$${amount.toLocaleString()} (no org avg)`;
  }

  // Weight by stage probability
  const prob = stage_probability ?? 0.5;
  raw = Math.min(100, raw * prob);
  detail += ` × ${Math.round(prob * 100)}% probability`;

  if (dealContext.stage) {
    detail += ` (${dealContext.stage})`;
  }

  return { raw, weighted: raw * WEIGHT_DEAL_VALUE, detail };
}

function scoreSignalStrength(item: CommandCentreItem): PriorityFactor {
  const ctx = item.context as Record<string, unknown>;
  let raw = 30; // default
  let detail = 'No notable signals';

  const riskScore = ctx?.risk_score as number | undefined;
  const buyingSignals = ctx?.buying_signals;
  const engagementLevel = ctx?.engagement_level as string | undefined;

  if (riskScore != null) {
    if (riskScore > 70) {
      raw = 90;
      detail = `High risk score (${riskScore})`;
    } else if (riskScore >= 50) {
      raw = 60;
      detail = `Moderate risk score (${riskScore})`;
    } else {
      raw = Math.max(30, riskScore);
      detail = `Low risk score (${riskScore})`;
    }
  }

  // Buying signals take priority over a moderate risk score reading
  if (buyingSignals && (Array.isArray(buyingSignals) ? buyingSignals.length > 0 : true)) {
    raw = Math.max(raw, 80);
    detail = 'Buying signals present';
  }

  if (engagementLevel === 'spike' || engagementLevel === 'high') {
    raw = Math.max(raw, 70);
    detail = detail === 'No notable signals' ? 'Engagement spike detected' : detail + ', engagement spike';
  }

  return { raw, weighted: raw * WEIGHT_SIGNAL_STRENGTH, detail };
}

function scoreStrategicAlignment(item: CommandCentreItem, dealContext?: DealContext): PriorityFactor {
  const ctx = item.context as Record<string, unknown>;
  let raw = 30; // default
  let detail = 'Standard account';

  const icpFitScore = ctx?.icp_fit_score as number | undefined;
  const isTargetAccount = dealContext?.is_target_account ?? (ctx?.is_target_account as boolean | undefined);

  if (isTargetAccount) {
    raw = 80;
    detail = 'Target account';
  }

  if (icpFitScore != null) {
    // icp_fit_score assumed to be 0–100 already
    const icpRaw = Math.min(100, icpFitScore);
    if (icpRaw > raw) {
      raw = icpRaw;
      detail = `ICP fit score: ${icpRaw}`;
      if (isTargetAccount) detail += ' (target account)';
    }
  }

  return { raw, weighted: raw * WEIGHT_STRATEGIC_ALIGNMENT, detail };
}

function scoreEffortRequired(item: CommandCentreItem): PriorityFactor {
  // INVERTED: easy / one-click = higher priority
  let raw = 50; // default: unknown effort
  let detail = 'Unknown effort required';

  const draftedAction = item.drafted_action;
  const requiresHumanInput = item.requires_human_input ?? [];

  if (draftedAction) {
    const confidence = draftedAction.confidence ?? 0;
    if (confidence > 0.8) {
      raw = 90;
      detail = `One-click action ready (confidence: ${Math.round(confidence * 100)}%)`;
    } else {
      raw = 70;
      detail = `Drafted action available (confidence: ${Math.round(confidence * 100)}%)`;
    }
  } else if (requiresHumanInput.length > 0) {
    raw = 30;
    detail = `Needs input: ${requiresHumanInput.slice(0, 3).join(', ')}${requiresHumanInput.length > 3 ? '…' : ''}`;
  }

  return { raw, weighted: raw * WEIGHT_EFFORT_REQUIRED, detail };
}

// ---------------------------------------------------------------------------
// Public: calculatePriority
// ---------------------------------------------------------------------------

/**
 * Calculate a composite priority score (0–100) for a command_centre_items row.
 *
 * @param item        The full item row from command_centre_items
 * @param dealContext Optional enriched deal data (amount, stage, org average, etc.)
 * @returns           { score, factors } — score capped at 100
 */
export function calculatePriority(
  item: CommandCentreItem,
  dealContext?: DealContext
): PriorityResult {
  const timeSensitivity    = scoreTimeSensitivity(item);
  const dealValue          = scoreDealValue(item, dealContext);
  const signalStrength     = scoreSignalStrength(item);
  const strategicAlignment = scoreStrategicAlignment(item, dealContext);
  const effortRequired     = scoreEffortRequired(item);

  const rawScore =
    timeSensitivity.weighted +
    dealValue.weighted +
    signalStrength.weighted +
    strategicAlignment.weighted +
    effortRequired.weighted;

  const score = Math.min(100, Math.round(rawScore * 100) / 100);

  return {
    score,
    factors: {
      time_sensitivity:    timeSensitivity,
      deal_value:          dealValue,
      signal_strength:     signalStrength,
      strategic_alignment: strategicAlignment,
      effort_required:     effortRequired,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: map score to urgency band
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable urgency band from a priority score.
 * Consistent with the urgency CHECK constraint in command_centre_items.
 */
export function scoreToUrgency(score: number): 'critical' | 'high' | 'normal' | 'low' {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'normal';
  return 'low';
}
