/**
 * Warmth Scoring Engine — RG-003
 *
 * Pure computation module — no Supabase/Deno dependencies.
 * Computes a composite warmth score for a contact from an array of signals.
 *
 * Five sub-scores with weighted contribution:
 *   Recency        0.30  (half-life 7 days)
 *   Engagement     0.25  (half-life 14 days)
 *   Deal Momentum  0.20  (half-life 21 days)
 *   Multi-thread   0.15  (half-life 30 days)
 *   Sentiment      0.10  (half-life 30 days)
 */

export interface WarmthSignal {
  signal_type: string;
  signal_weight: number;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

export interface WarmthResult {
  warmth_score: number;
  recency_score: number;
  engagement_score: number;
  deal_momentum_score: number;
  multi_thread_score: number;
  sentiment_score: number;
  tier: 'hot' | 'warm' | 'cool' | 'cold';
  trending_direction: 'up' | 'down' | 'stable';
}

// ============================================================================
// Weights and half-lives
// ============================================================================

const WEIGHTS = {
  recency:       0.30,
  engagement:    0.25,
  deal_momentum: 0.20,
  multi_thread:  0.15,
  sentiment:     0.10,
} as const;

const HALF_LIFE_DAYS = {
  recency:       7,
  engagement:    14,
  deal_momentum: 21,
  multi_thread:  30,
  sentiment:     30,
} as const;

// ============================================================================
// Engagement signal type → base weight mapping
// ============================================================================

const ENGAGEMENT_TYPE_WEIGHTS: Record<string, number> = {
  meeting_held:    1.0,
  call_completed:  0.8,
  email_received:  0.6,
  linkedin_message: 0.4,
  email_sent:      0.3,
};

// Deal-momentum signal types
const DEAL_MOMENTUM_TYPES = new Set(['deal_stage_change', 'proposal_opened']);
const DEAL_MOMENTUM_TYPE_WEIGHTS: Record<string, number> = {
  deal_stage_change: 1.0,
  proposal_opened:   0.7,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Exponential decay: returns a value in [0, 1].
 * Score = 0.5^(daysSince / halfLife)
 */
function decay(daysSince: number, halfLife: number): number {
  return Math.pow(0.5, daysSince / halfLife);
}

function daysSince(dateStr: string, now: Date): number {
  const ms = now.getTime() - new Date(dateStr).getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

// ============================================================================
// computeWarmth
// ============================================================================

export function computeWarmth(
  signals: WarmthSignal[],
  previousScore: number,
  dealData?: {
    stage_velocity: number;
    days_since_stage_change: number;
    is_stalled: boolean;
  }
): WarmthResult {
  const now = new Date();

  // Filter to last 90 days — callers should already do this, but guard here.
  const recent = signals.filter(
    s => daysSince(s.occurred_at, now) <= 90
  );

  // ---- Recency score -------------------------------------------------------
  // Based on the single most-recent signal using a 7-day half-life.
  let recencyScore = 0;
  if (recent.length > 0) {
    const mostRecent = recent.reduce((best, s) =>
      new Date(s.occurred_at) > new Date(best.occurred_at) ? s : best
    );
    const days = daysSince(mostRecent.occurred_at, now);
    recencyScore = decay(days, HALF_LIFE_DAYS.recency);
  }

  // ---- Engagement score ----------------------------------------------------
  // Weighted sum of engagement-type signals, each decayed by 14-day half-life.
  let engagementRaw = 0;
  let engagementCount = 0;
  for (const s of recent) {
    const typeWeight = ENGAGEMENT_TYPE_WEIGHTS[s.signal_type];
    if (typeWeight !== undefined) {
      const days = daysSince(s.occurred_at, now);
      engagementRaw += typeWeight * s.signal_weight * decay(days, HALF_LIFE_DAYS.engagement);
      engagementCount++;
    }
  }
  // Normalise: cap at 1.0 (5+ high-quality signals = max engagement)
  const engagementScore = engagementCount > 0
    ? clamp(engagementRaw / Math.max(5, engagementCount))
    : 0;

  // ---- Deal momentum score -------------------------------------------------
  // From explicit deal signals + optional external deal data.
  let dealMomentumRaw = 0;
  for (const s of recent) {
    if (DEAL_MOMENTUM_TYPES.has(s.signal_type)) {
      const typeWeight = DEAL_MOMENTUM_TYPE_WEIGHTS[s.signal_type] ?? 0.5;
      const days = daysSince(s.occurred_at, now);
      dealMomentumRaw += typeWeight * s.signal_weight * decay(days, HALF_LIFE_DAYS.deal_momentum);
    }
  }

  // Boost or penalise from external deal velocity data if provided
  if (dealData) {
    if (!dealData.is_stalled && dealData.stage_velocity > 0) {
      // Reward recent forward movement
      const velocityBoost = clamp(dealData.stage_velocity / 10) * 0.3;
      const velocityDecay = decay(dealData.days_since_stage_change, HALF_LIFE_DAYS.deal_momentum);
      dealMomentumRaw += velocityBoost * velocityDecay;
    } else if (dealData.is_stalled) {
      // Stalled deal drags score down slightly
      dealMomentumRaw = Math.max(0, dealMomentumRaw - 0.15);
    }
  }

  const dealMomentumScore = clamp(dealMomentumRaw);

  // ---- Multi-thread score --------------------------------------------------
  // Count distinct contacts at the same company that had signals in last 30d.
  // We rely on metadata.company_id being set on signals where available.
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last30Signals = recent.filter(
    s => new Date(s.occurred_at) >= thirtyDaysAgo
  );

  // Count distinct contact_ids or company signals as a proxy for threading
  const companySignalDates = new Set<string>();
  for (const s of last30Signals) {
    const companyId = s.metadata?.company_id as string | undefined;
    if (companyId) {
      // Group by company — each unique company touched = threading signal
      companySignalDates.add(companyId);
    }
  }

  // Score: 0 companies = 0, 1 = 0.3, 2 = 0.6, 3+ = 1.0
  const threadCount = companySignalDates.size;
  const multiThreadBase = threadCount === 0 ? 0
    : threadCount === 1 ? 0.3
    : threadCount === 2 ? 0.6
    : 1.0;

  // Decay based on most-recent signal in the 30d window
  let multiThreadScore = 0;
  if (last30Signals.length > 0) {
    const mostRecentLast30 = last30Signals.reduce((best, s) =>
      new Date(s.occurred_at) > new Date(best.occurred_at) ? s : best
    );
    const days = daysSince(mostRecentLast30.occurred_at, now);
    multiThreadScore = multiThreadBase * decay(days, HALF_LIFE_DAYS.multi_thread);
  }

  // ---- Sentiment score -----------------------------------------------------
  // Average signal_weight of sentiment-carrying signals, decayed by 30-day half-life.
  // Non-sentiment signals contribute nothing.
  const sentimentSignals = recent.filter(
    s => s.signal_type === 'email_received' || s.signal_type === 'linkedin_engaged'
  );
  let sentimentRaw = 0;
  if (sentimentSignals.length > 0) {
    for (const s of sentimentSignals) {
      const days = daysSince(s.occurred_at, now);
      sentimentRaw += s.signal_weight * decay(days, HALF_LIFE_DAYS.sentiment);
    }
    sentimentRaw /= sentimentSignals.length;
  }
  const sentimentScore = clamp(sentimentRaw);

  // ---- Composite warmth score ----------------------------------------------
  const warmthScore = clamp(
    recencyScore       * WEIGHTS.recency       +
    engagementScore    * WEIGHTS.engagement    +
    dealMomentumScore  * WEIGHTS.deal_momentum +
    multiThreadScore   * WEIGHTS.multi_thread  +
    sentimentScore     * WEIGHTS.sentiment
  );

  // ---- Tier ----------------------------------------------------------------
  let tier: WarmthResult['tier'];
  if (warmthScore >= 0.70) {
    tier = 'hot';
  } else if (warmthScore >= 0.40) {
    tier = 'warm';
  } else if (warmthScore >= 0.15) {
    tier = 'cool';
  } else {
    tier = 'cold';
  }

  // ---- Trending direction --------------------------------------------------
  const delta = warmthScore - previousScore;
  let trending_direction: WarmthResult['trending_direction'];
  if (delta > 0.03) {
    trending_direction = 'up';
  } else if (delta < -0.03) {
    trending_direction = 'down';
  } else {
    trending_direction = 'stable';
  }

  return {
    warmth_score:        round3(warmthScore),
    recency_score:       round3(recencyScore),
    engagement_score:    round3(engagementScore),
    deal_momentum_score: round3(dealMomentumScore),
    multi_thread_score:  round3(multiThreadScore),
    sentiment_score:     round3(sentimentScore),
    tier,
    trending_direction,
  };
}

// Round to 3 decimal places to match numeric(4,3) DB column
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
