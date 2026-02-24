/**
 * Re-engagement Signal Relevance Scorer & Cooldown Enforcer
 *
 * REN-005: Scores deals from deal_signal_temperature against their watchlist
 * context (loss reason, timing, contacts, signal strength) to produce a
 * 0-100 relevance score. Enforces cooldown gates before passing deals
 * to the outreach drafting stage.
 *
 * Scoring model (100pts total):
 *   signal_strength       (40pts) — derived from temperature + signal types
 *   timing                (20pts) — days since close / ideal re-engagement window
 *   relationship          (20pts) — contact count, champion status
 *   reason_compatibility  (20pts) — does the trigger fit the original loss reason?
 *
 * Cooldown gates (hard blocks):
 *   - min_days_since_close   — from agent_config_defaults
 *   - max_attempts           — from reengagement_watchlist
 *   - cooldown_until         — from reengagement_watchlist (per attempt)
 *   - unsubscribed           — from reengagement_watchlist (permanent opt-out)
 *   - signal_relevance_threshold — from agent_config_defaults
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Default config values (used when config engine is unavailable)
// =============================================================================

const CONFIG_DEFAULTS = {
  min_days_since_close: 30,
  max_attempts: 3,
  cooldown_days: 90,
  signal_relevance_threshold: 0.6,
} as const;

// =============================================================================
// Types
// =============================================================================

interface WatchlistRow {
  deal_id: string;
  deal_name: string;
  deal_value: number | null;
  contact_ids: string[];
  loss_reason: string | null;
  close_date: string | null;
  days_since_close: number;
  next_check_date: string;
  last_signal_at: string | null;
  last_signal_type: string | null;
  owner_name: string | null;
  // Columns from REN-001 ALTER
  max_attempts: number;
  attempt_count: number;
  cooldown_until: string | null;
  unsubscribed: boolean;
}

interface TemperatureRow {
  deal_id: string;
  temperature: number;
  trend: string;
  last_signal: string | null;
  signal_count_24h: number;
  signal_count_7d: number;
  top_signals: Array<{
    type: string;
    source: string;
    description: string;
    score_delta: number;
    detected_at: string;
  }>;
}

export interface ScoredDeal {
  deal_id: string;
  deal_name: string;
  deal_value: number | null;
  company_name: string | null;
  contact_ids: string[];
  loss_reason: string | null;
  days_since_close: number;
  owner_name: string | null;
  // Scoring breakdown
  score: number;
  signal_strength_score: number;
  timing_score: number;
  relationship_score: number;
  reason_compatibility_score: number;
  // Signal context
  temperature: number;
  trend: string;
  top_signals: TemperatureRow['top_signals'];
  // Gate status
  passed_gates: boolean;
  gate_blocked_reason?: string;
  // Config-resolved threshold used for this deal
  relevance_threshold: number;
}

// =============================================================================
// Helpers: Config resolution
// =============================================================================

/**
 * Resolve a numeric config value from the agent config engine.
 * Falls back to the provided default if resolution fails or the value
 * is not a number.
 */
async function resolveNumericConfig(
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
  configKey: string,
  fallback: number
): Promise<number> {
  try {
    // Use the DB function resolve_agent_config for the platform default
    // (no user/org overrides needed for scoring thresholds in this context)
    const { data, error } = await supabase.rpc('resolve_agent_config', {
      p_org_id: orgId,
      p_user_id: '00000000-0000-0000-0000-000000000000', // no user context
      p_agent_type: 'reengagement',
      p_config_key: configKey,
    });

    if (error || data === null || data === undefined) {
      return fallback;
    }

    // config_value is JSONB — may be a number directly or {"value": N}
    if (typeof data === 'number') return data;
    if (typeof data === 'string') {
      const parsed = parseFloat(data);
      return isNaN(parsed) ? fallback : parsed;
    }
    if (typeof data === 'object' && data !== null && 'value' in data) {
      const v = parseFloat(String((data as Record<string, unknown>).value));
      return isNaN(v) ? fallback : v;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

// =============================================================================
// Scoring: signal_strength (0-40pts)
// =============================================================================

/**
 * Map temperature + signal quality to signal_strength score (0-40).
 *
 * temperature=1.0 → 40pts
 * temperature=0.7 → 28pts (linear)
 * boost: +5pts for funding/job_change signals, +3pts for rising trend
 */
function scoreSignalStrength(temp: TemperatureRow): number {
  let base = Math.round(temp.temperature * 40);

  // Boost for high-quality signal types
  const highValueTypes = ['job_change', 'funding_round', 'funding', 'product_launch'];
  const hasHighValue = temp.top_signals.some((s) => highValueTypes.includes(s.type));
  if (hasHighValue) base = Math.min(base + 5, 40);

  // Boost for rising trend
  if (temp.trend === 'rising') base = Math.min(base + 3, 40);

  // Recency boost: signal within 24h
  if (temp.signal_count_24h > 0) base = Math.min(base + 2, 40);

  return base;
}

// =============================================================================
// Scoring: timing (0-20pts)
// =============================================================================

/**
 * Score timing based on days since deal close.
 *   30-90 days  → 10pts (warming up)
 *   90-180 days → 20pts (sweet spot)
 *   180-270 days → 15pts
 *   270-365 days → 10pts
 *   >365 days   → 5pts (stale but not abandoned)
 *   <30 days    → 0pts (too soon)
 */
function scoreTiming(daysSinceClose: number, minDays: number): number {
  if (daysSinceClose < minDays) return 0;
  if (daysSinceClose < 90)  return 10;
  if (daysSinceClose < 180) return 20;
  if (daysSinceClose < 270) return 15;
  if (daysSinceClose < 365) return 10;
  return 5;
}

// =============================================================================
// Scoring: relationship (0-20pts)
// =============================================================================

/**
 * Score relationship health from contact count and champion signal types.
 *
 * 3+ contacts → 20pts
 * 2 contacts  → 15pts
 * 1 contact   → 10pts
 * 0 contacts  → 0pts
 * Boost: +5pts if a champion_left signal exists (re-engagement opportunity)
 */
function scoreRelationship(
  contactIds: string[],
  topSignals: TemperatureRow['top_signals']
): number {
  const contactCount = contactIds.length;
  let base = 0;

  if (contactCount >= 3) base = 20;
  else if (contactCount === 2) base = 15;
  else if (contactCount === 1) base = 10;

  // Champion job-change signal is a positive relationship indicator
  const hasChampionSignal = topSignals.some(
    (s) => s.type === 'job_change' || s.type === 'champion_job_change'
  );
  if (hasChampionSignal) base = Math.min(base + 5, 20);

  return base;
}

// =============================================================================
// Scoring: reason_compatibility (0-20pts)
// =============================================================================

/**
 * Score how well the detected signals match the original loss reason.
 *
 * budget    + funding signal    → 20pts (they now have budget)
 * timing    + any signal        → 20pts (timing was the only blocker)
 * champion_left + job_change    → 20pts (champion moved to new ICP account)
 * competitor + company_news     → 15pts (competitor may be in trouble)
 * bad_fit                       → 5pts  (signals rarely overcome fit issues)
 * went_dark                     → 15pts (any positive signal is worth a try)
 * unknown                       → 12pts (neutral)
 */
function scoreReasonCompatibility(
  lossReason: string | null,
  topSignals: TemperatureRow['top_signals']
): number {
  const reason = (lossReason || '').toLowerCase();
  const signalTypes = topSignals.map((s) => s.type.toLowerCase());

  const hasFunding   = signalTypes.some((t) => t.includes('funding'));
  const hasJobChange = signalTypes.some((t) => t.includes('job_change'));
  const hasNews      = signalTypes.some(
    (t) => t.includes('product') || t.includes('expansion') || t.includes('launch')
  );

  if (reason.includes('budget')) {
    return hasFunding ? 20 : 12;
  }
  if (reason.includes('timing')) {
    return 20; // Any signal at the right time is enough
  }
  if (reason.includes('champion')) {
    return hasJobChange ? 20 : 10;
  }
  if (reason.includes('competitor')) {
    return hasNews ? 15 : 10;
  }
  if (reason.includes('bad_fit') || reason.includes('fit')) {
    return 5;
  }
  if (reason.includes('went_dark') || reason.includes('dark')) {
    return 15;
  }
  // Unknown or 'other'
  return 12;
}

// =============================================================================
// Cooldown gate checks
// =============================================================================

interface GateResult {
  passed: boolean;
  reason?: string;
}

function checkCooldownGates(
  watchlist: WatchlistRow,
  minDaysSinceClose: number
): GateResult {
  // 1. Unsubscribed — permanent opt-out
  if (watchlist.unsubscribed) {
    return { passed: false, reason: 'unsubscribed' };
  }

  // 2. Max attempts exhausted
  const maxAttempts = watchlist.max_attempts ?? CONFIG_DEFAULTS.max_attempts;
  if (watchlist.attempt_count >= maxAttempts) {
    return {
      passed: false,
      reason: `max_attempts_exhausted (${watchlist.attempt_count}/${maxAttempts})`,
    };
  }

  // 3. Active cooldown period
  if (watchlist.cooldown_until) {
    const cooldownEnd = new Date(watchlist.cooldown_until);
    if (cooldownEnd > new Date()) {
      return {
        passed: false,
        reason: `on_cooldown_until_${watchlist.cooldown_until}`,
      };
    }
  }

  // 4. Minimum days since close
  if (watchlist.days_since_close < minDaysSinceClose) {
    return {
      passed: false,
      reason: `too_soon (${watchlist.days_since_close} < ${minDaysSinceClose} days)`,
    };
  }

  return { passed: true };
}

// =============================================================================
// Main Adapter
// =============================================================================

export const signalRelevanceScorerAdapter: SkillAdapter = {
  name: 'score-reengagement-signals',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[reengagement-scorer] Starting signal relevance scoring...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      if (!orgId) {
        throw new Error('org_id is required in event payload');
      }

      // 1. Resolve config values from agent config engine
      const [minDaysSinceClose, signalThreshold] = await Promise.all([
        resolveNumericConfig(
          supabase,
          orgId,
          'min_days_since_close',
          CONFIG_DEFAULTS.min_days_since_close
        ),
        resolveNumericConfig(
          supabase,
          orgId,
          'signal_relevance_threshold',
          CONFIG_DEFAULTS.signal_relevance_threshold
        ),
      ]);

      console.log(
        `[reengagement-scorer] Config: min_days_since_close=${minDaysSinceClose}, ` +
        `signal_relevance_threshold=${signalThreshold}`
      );

      // 2. Get all hot deals at or above the temperature threshold
      //    (temperature threshold = signalThreshold, so we only fetch candidates)
      const { data: hotDeals, error: hotDealsError } = await supabase
        .rpc('get_hot_deals', {
          p_org_id: orgId,
          p_threshold: signalThreshold,
          p_limit: 25,
        });

      if (hotDealsError) {
        throw new Error(`Failed to fetch hot deals: ${hotDealsError.message}`);
      }

      if (!hotDeals || hotDeals.length === 0) {
        console.log('[reengagement-scorer] No hot deals above threshold');
        return {
          success: true,
          output: {
            deals_evaluated: 0,
            deals_qualified: 0,
            scored_deals: [],
          },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[reengagement-scorer] Evaluating ${hotDeals.length} hot deals...`);

      // 3. Fetch full temperature data for these deals
      const dealIds = hotDeals.map((d: Record<string, unknown>) => d.deal_id as string);

      const { data: temperatureRows, error: tempError } = await supabase
        .from('deal_signal_temperature')
        .select(
          'deal_id, temperature, trend, last_signal, signal_count_24h, signal_count_7d, top_signals'
        )
        .in('deal_id', dealIds);

      if (tempError) {
        throw new Error(`Failed to fetch temperature rows: ${tempError.message}`);
      }

      const tempByDeal = new Map<string, TemperatureRow>();
      for (const row of temperatureRows || []) {
        tempByDeal.set(row.deal_id, row as TemperatureRow);
      }

      // 4. Fetch watchlist rows for cooldown gate data
      //    get_hot_deals already filters by cooldown/unsubscribed at DB level,
      //    but we need the full row for attempt_count / close_date / contact_ids
      const { data: watchlistRows, error: wlError } = await supabase
        .from('reengagement_watchlist')
        .select(
          'deal_id, deal_id, contact_ids, loss_reason, close_date, ' +
          'max_attempts, attempt_count, cooldown_until, unsubscribed, status'
        )
        .in('deal_id', dealIds)
        .eq('status', 'active');

      if (wlError) {
        throw new Error(`Failed to fetch watchlist rows: ${wlError.message}`);
      }

      // Build watchlist lookup — augment with days_since_close
      const wlByDeal = new Map<string, WatchlistRow & { deal_id: string }>();
      for (const row of watchlistRows || []) {
        const closeDate = row.close_date ? new Date(row.close_date) : null;
        const daysSinceClose = closeDate
          ? Math.floor((Date.now() - closeDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        wlByDeal.set(row.deal_id, {
          ...(row as unknown as WatchlistRow),
          deal_id: row.deal_id,
          deal_name: '', // filled from hotDeal below
          deal_value: null,
          owner_name: null,
          next_check_date: '',
          last_signal_at: null,
          last_signal_type: null,
          days_since_close: daysSinceClose,
          max_attempts: row.max_attempts ?? CONFIG_DEFAULTS.max_attempts,
          attempt_count: row.attempt_count ?? 0,
          cooldown_until: row.cooldown_until || null,
          unsubscribed: row.unsubscribed ?? false,
        });
      }

      // 5. Fetch company names for enrichment
      const { data: dealCompanies } = await supabase
        .from('deals')
        .select('id, company_id')
        .in('id', dealIds);

      const companyIdsByDeal = new Map<string, string>();
      for (const d of dealCompanies || []) {
        if (d.company_id) companyIdsByDeal.set(d.id, d.company_id);
      }

      const uniqueCompanyIds = [...new Set(companyIdsByDeal.values())];
      const companyNames = new Map<string, string>();

      if (uniqueCompanyIds.length > 0) {
        const { data: companies } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', uniqueCompanyIds);

        for (const c of companies || []) {
          companyNames.set(c.id, c.name);
        }
      }

      // 6. Score each deal
      const scoredDeals: ScoredDeal[] = [];
      let dealsQualified = 0;

      for (const hotDeal of hotDeals) {
        const dealId = hotDeal.deal_id as string;
        const temp = tempByDeal.get(dealId);
        const wl = wlByDeal.get(dealId);

        if (!temp || !wl) {
          console.warn(`[reengagement-scorer] Missing temp/watchlist for deal ${dealId}, skipping`);
          continue;
        }

        // Augment watchlist row with deal name and value from hotDeal
        wl.deal_name = (hotDeal.deal_name as string) || '';
        wl.deal_value = (hotDeal.deal_value as number) || null;
        wl.owner_name = (hotDeal.owner_name as string) || null;

        // Gate checks (cooldown enforcement)
        const gate = checkCooldownGates(wl, minDaysSinceClose);

        // Compute scoring dimensions
        const signalStrengthScore = scoreSignalStrength(temp);
        const timingScore        = scoreTiming(wl.days_since_close, minDaysSinceClose);
        const relationshipScore  = scoreRelationship(wl.contact_ids || [], temp.top_signals || []);
        const reasonCompatScore  = scoreReasonCompatibility(wl.loss_reason, temp.top_signals || []);

        const totalScore = signalStrengthScore + timingScore + relationshipScore + reasonCompatScore;

        // Map score to 0-100 normalized relevance (max possible = 100)
        const normalizedScore = Math.min(totalScore, 100);

        // Qualify: must pass gates AND score >= threshold (converted to 0-100 scale)
        const thresholdScore = signalThreshold * 100;
        const qualifies = gate.passed && normalizedScore >= thresholdScore;

        if (qualifies) dealsQualified++;

        const companyId = companyIdsByDeal.get(dealId);
        const companyName = companyId ? (companyNames.get(companyId) || null) : null;

        scoredDeals.push({
          deal_id: dealId,
          deal_name: wl.deal_name,
          deal_value: wl.deal_value,
          company_name: companyName,
          contact_ids: wl.contact_ids || [],
          loss_reason: wl.loss_reason,
          days_since_close: wl.days_since_close,
          owner_name: wl.owner_name,
          score: normalizedScore,
          signal_strength_score: signalStrengthScore,
          timing_score: timingScore,
          relationship_score: relationshipScore,
          reason_compatibility_score: reasonCompatScore,
          temperature: temp.temperature,
          trend: temp.trend,
          top_signals: temp.top_signals || [],
          passed_gates: gate.passed,
          gate_blocked_reason: gate.reason,
          relevance_threshold: signalThreshold,
        });

        console.log(
          `[reengagement-scorer] ${wl.deal_name}: ` +
          `score=${normalizedScore}/100 ` +
          `(signal=${signalStrengthScore}, timing=${timingScore}, ` +
          `rel=${relationshipScore}, reason=${reasonCompatScore}) ` +
          `gates=${gate.passed ? 'PASSED' : `BLOCKED:${gate.reason}`} ` +
          `qualifies=${qualifies}`
        );
      }

      // Sort: qualified deals first, then by score descending
      scoredDeals.sort((a, b) => {
        if (a.passed_gates !== b.passed_gates) return a.passed_gates ? -1 : 1;
        return b.score - a.score;
      });

      const qualifiedDeals = scoredDeals.filter((d) => d.passed_gates);

      console.log(
        `[reengagement-scorer] Complete: ` +
        `${scoredDeals.length} evaluated, ${dealsQualified} qualified ` +
        `(score >= ${(signalThreshold * 100).toFixed(0)}/100 and all gates passed)`
      );

      return {
        success: true,
        output: {
          deals_evaluated: scoredDeals.length,
          deals_qualified: dealsQualified,
          scored_deals: scoredDeals,
          qualified_deals: qualifiedDeals,
          config: {
            min_days_since_close: minDaysSinceClose,
            signal_relevance_threshold: signalThreshold,
          },
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[reengagement-scorer] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
