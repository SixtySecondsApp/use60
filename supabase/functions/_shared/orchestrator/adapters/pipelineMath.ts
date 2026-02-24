/**
 * Pipeline Math Adapters (BRF-004)
 *
 * Pure TypeScript utilities for quarter phase detection and highest-leverage
 * action recommendation. These functions receive pre-computed data as params
 * (no direct DB calls) so they are fast and testable.
 *
 * Used by the proactive-pipeline-analysis edge function and the enhanced
 * morning briefing pipeline.
 */

// =============================================================================
// Types
// =============================================================================

export type QuarterPhase = 'build' | 'progress' | 'close';

export interface QuarterPhaseResult {
  phase: QuarterPhase;
  label: string;
  weekOfQuarter: number;
  weeksRemaining: number;
  totalWeeks: number;
  description: string;
  emphasis: QuarterPhaseEmphasis;
}

export interface QuarterPhaseEmphasis {
  primaryFocus: string[];
  pipelineMultiplier: number;  // Coverage ratio target multiplier for this phase
  closeProbabilityBonus: number;  // Add to stage probability for phase weighting
  urgencyLevel: 'low' | 'medium' | 'high';
}

export interface DealSummary {
  deal_id: string;
  deal_name: string;
  deal_value: number;
  current_stage: string;
  stage_probability: number;  // 0-100
  expected_close_date: string | null;
  days_since_last_activity: number | null;
  health_score: number | null;
  risk_score: number | null;
  company_name: string | null;
  primary_contact_name: string | null;
}

export interface PipelineMathInput {
  target: number | null;
  closed_so_far: number;
  weighted_pipeline: number;
  total_pipeline: number;
  coverage_ratio: number | null;
  gap_amount: number | null;
  projected_close: number | null;
  deals_at_risk: number;
  deals_by_stage: Record<string, { count: number; total_value: number }>;
}

export interface ActionRecommendation {
  action: string;
  rationale: string;
  target_deal_id: string | null;
  target_deal_name: string | null;
  expected_impact: string;
  urgency: 'immediate' | 'today' | 'this_week';
  category: 'close' | 'advance' | 'revive' | 'build_pipeline' | 'protect_coverage';
}

// =============================================================================
// Quarter Phase Detection
// =============================================================================

/**
 * Detect which phase of the quarter we are in based on the week number
 * within the current quarter.
 *
 * Phase definitions (from global agent_config temporal.quarter_phases):
 *   build:    weeks 1-4   — prospecting, discovery, new opportunities
 *   progress: weeks 5-9   — advance qualified deals, deepen relationships
 *   close:    weeks 10-13 — convert late-stage deals, manage risk
 *
 * @param quarterStartMonth  Calendar month (1-12) that begins Q1 for this org
 * @param referenceDate      Date to evaluate against (defaults to today)
 */
export function detectQuarterPhase(
  quarterStartMonth: number = 1,
  referenceDate: Date = new Date()
): QuarterPhaseResult {
  // Normalise quarter start month to 1-12
  const qStartMonth = Math.max(1, Math.min(12, Math.floor(quarterStartMonth)));

  // Find the start of the current quarter
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1; // 1-12

  // Months offset from qStartMonth (wrapping across year boundary)
  const monthsIntoYear = ((month - qStartMonth + 12) % 12);
  const quartersElapsed = Math.floor(monthsIntoYear / 3);
  const quarterStartDate = addMonths(new Date(year, qStartMonth - 1, 1), quartersElapsed * 3);

  // If the quarterStartDate is in the future (due to year wrapping), step back one year
  const effectiveStart = quarterStartDate > referenceDate
    ? addMonths(quarterStartDate, -12)
    : quarterStartDate;

  const effectiveEnd = addMonths(effectiveStart, 3);

  // Calculate week of quarter (1-based)
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const msElapsed = referenceDate.getTime() - effectiveStart.getTime();
  const weekOfQuarter = Math.min(Math.max(Math.ceil(msElapsed / msPerWeek), 1), 13);

  const totalWeeks = Math.round(
    (effectiveEnd.getTime() - effectiveStart.getTime()) / msPerWeek
  );
  const weeksRemaining = Math.max(totalWeeks - weekOfQuarter, 0);

  // Classify phase
  let phase: QuarterPhase;
  let label: string;
  let description: string;
  let emphasis: QuarterPhaseEmphasis;

  if (weekOfQuarter <= 4) {
    phase = 'build';
    label = 'Build';
    description = 'Pipeline building phase — focus on prospecting, discovery, and new opportunity creation';
    emphasis = {
      primaryFocus: ['pipeline_generation', 'discovery_meetings', 'new_contacts'],
      pipelineMultiplier: 4.0,   // Need 4× pipeline to hit target this early
      closeProbabilityBonus: 0,
      urgencyLevel: 'low',
    };
  } else if (weekOfQuarter <= 9) {
    phase = 'progress';
    label = 'Progress';
    description = 'Momentum phase — advance qualified deals through stages, deepen champion relationships';
    emphasis = {
      primaryFocus: ['stage_progression', 'champion_health', 'proposal_delivery'],
      pipelineMultiplier: 3.0,   // Still need strong coverage
      closeProbabilityBonus: 5,  // Boost probability estimates for mid-stage deals
      urgencyLevel: 'medium',
    };
  } else {
    phase = 'close';
    label = 'Close';
    description = 'Closing phase — convert late-stage deals, manage risk, accelerate decisions';
    emphasis = {
      primaryFocus: ['deal_closure', 'risk_mitigation', 'executive_engagement'],
      pipelineMultiplier: 2.0,   // Focus narrows to closeable deals
      closeProbabilityBonus: 10, // Late-quarter urgency lifts probability estimates
      urgencyLevel: 'high',
    };
  }

  return {
    phase,
    label,
    weekOfQuarter,
    weeksRemaining,
    totalWeeks,
    description,
    emphasis,
  };
}

// =============================================================================
// Highest-Leverage Action Recommender
// =============================================================================

/**
 * Recommend the single highest-leverage action for the rep given:
 * - Current pipeline math (gap, coverage, projected close)
 * - Quarter phase emphasis weights
 * - Deal-level signals (risk, stage, activity)
 *
 * Returns a single recommendation with rationale and expected impact.
 */
export function recommendHighestLeverageAction(
  pipelineMath: PipelineMathInput,
  quarterPhase: QuarterPhaseResult,
  deals: DealSummary[]
): ActionRecommendation {
  const { phase, emphasis, weeksRemaining } = quarterPhase;
  const { target, closed_so_far, weighted_pipeline, gap_amount, coverage_ratio, deals_at_risk } = pipelineMath;

  // -------------------------------------------------------------------
  // Priority 1: Is there a closing-soon high-value deal that needs push?
  // -------------------------------------------------------------------
  const closingSoon = deals
    .filter(d => {
      if (!d.expected_close_date) return false;
      const daysToClose = daysBetween(new Date(), new Date(d.expected_close_date));
      const isLateStage = isLateStageKeyword(d.current_stage);
      return daysToClose >= 0 && daysToClose <= 14 && isLateStage;
    })
    .sort((a, b) => b.deal_value - a.deal_value);

  if (closingSoon.length > 0 && (phase === 'close' || phase === 'progress')) {
    const deal = closingSoon[0];
    const daysToClose = daysBetween(new Date(), new Date(deal.expected_close_date!));
    const impact = formatCurrency(deal.deal_value);

    return {
      action: `Drive ${deal.deal_name} to close — ${daysToClose === 0 ? 'closes today' : `${daysToClose} days remaining`}`,
      rationale: `${deal.deal_name} is in ${deal.current_stage} with a close date in ${daysToClose} day${daysToClose === 1 ? '' : 's'}. This is your highest-probability revenue this period.`,
      target_deal_id: deal.deal_id,
      target_deal_name: deal.deal_name,
      expected_impact: `+${impact} to closed revenue`,
      urgency: daysToClose <= 3 ? 'immediate' : 'today',
      category: 'close',
    };
  }

  // -------------------------------------------------------------------
  // Priority 2: Coverage gap requires pipeline action
  // -------------------------------------------------------------------
  const targetedCoverageMin = emphasis.pipelineMultiplier;
  const coverageIsLow = coverage_ratio !== null && coverage_ratio < targetedCoverageMin;
  const noTarget = target === null;

  if (noTarget || coverageIsLow) {
    // Recommend the highest-value at-risk deal to revive, or pipeline build
    const riskDeals = deals
      .filter(d => (d.risk_score !== null && d.risk_score >= 60) || (d.health_score !== null && d.health_score < 50))
      .sort((a, b) => b.deal_value - a.deal_value);

    if (riskDeals.length > 0 && phase !== 'build') {
      const deal = riskDeals[0];
      const impactVal = deal.deal_value * (deal.stage_probability / 100);

      return {
        action: `Revive at-risk deal: ${deal.deal_name} — reach out to re-establish engagement`,
        rationale: `${deal.deal_name} shows risk signals ${deal.days_since_last_activity !== null ? `(${deal.days_since_last_activity} days dark)` : ''}. Reviving this deal could recover ${formatCurrency(impactVal)} in weighted pipeline.`,
        target_deal_id: deal.deal_id,
        target_deal_name: deal.deal_name,
        expected_impact: `Recover ~${formatCurrency(impactVal)} weighted pipeline`,
        urgency: 'today',
        category: 'revive',
      };
    }

    if (phase === 'build' || coverageIsLow) {
      const coverageGap = target && coverage_ratio !== null
        ? formatCurrency((targetedCoverageMin - coverage_ratio) * (target - closed_so_far))
        : null;

      return {
        action: `Generate new pipeline — book at least 2 discovery calls this week`,
        rationale: phase === 'build'
          ? `We are in the Build phase (weeks 1-4). Early pipeline generation is the highest-leverage activity now.`
          : `Coverage ratio (${coverage_ratio !== null ? coverage_ratio.toFixed(1) : 'N/A'}×) is below the ${targetedCoverageMin}× target for the ${quarterPhase.label} phase.${coverageGap ? ` You need ~${coverageGap} more pipeline.` : ''}`,
        target_deal_id: null,
        target_deal_name: null,
        expected_impact: `Increase coverage ratio toward ${targetedCoverageMin}× target`,
        urgency: 'this_week',
        category: 'build_pipeline',
      };
    }
  }

  // -------------------------------------------------------------------
  // Priority 3: Advance the highest-value stalled mid-stage deal
  // -------------------------------------------------------------------
  const stalledDeals = deals
    .filter(d => {
      const daysStale = d.days_since_last_activity ?? 0;
      const isMidStage = !isLateStageKeyword(d.current_stage) && !isEarlyStageKeyword(d.current_stage);
      return daysStale >= 7 && isMidStage && d.deal_value > 0;
    })
    .sort((a, b) => b.deal_value - a.deal_value);

  if (stalledDeals.length > 0) {
    const deal = stalledDeals[0];
    const daysStale = deal.days_since_last_activity ?? 0;
    const weightedValue = deal.deal_value * (deal.stage_probability / 100);

    return {
      action: `Advance ${deal.deal_name} — no activity for ${daysStale} days, time to push forward`,
      rationale: `${deal.deal_name} in ${deal.current_stage} hasn't moved in ${daysStale} days. Advancing this deal has the highest weighted impact (${formatCurrency(weightedValue)}) outside of closing deals.`,
      target_deal_id: deal.deal_id,
      target_deal_name: deal.deal_name,
      expected_impact: `Advance ${formatCurrency(deal.deal_value)} deal to next stage`,
      urgency: daysStale >= 14 ? 'immediate' : 'today',
      category: 'advance',
    };
  }

  // -------------------------------------------------------------------
  // Priority 4: Protect coverage if close phase and gap is significant
  // -------------------------------------------------------------------
  if (phase === 'close' && gap_amount !== null && gap_amount > 0 && weeksRemaining <= 4) {
    const projectedShortfall = weighted_pipeline < gap_amount;

    if (projectedShortfall) {
      return {
        action: `Alert: projected close (${formatCurrency(pipelineMath.projected_close ?? 0)}) is below remaining target (${formatCurrency(gap_amount)}) — escalate at-risk deals immediately`,
        rationale: `With ${weeksRemaining} week${weeksRemaining === 1 ? '' : 's'} remaining and a ${formatCurrency(gap_amount)} gap, weighted pipeline (${formatCurrency(weighted_pipeline)}) may not cover the target. Immediate executive engagement is required.`,
        target_deal_id: deals.length > 0 ? deals.sort((a, b) => b.deal_value - a.deal_value)[0].deal_id : null,
        target_deal_name: deals.length > 0 ? deals.sort((a, b) => b.deal_value - a.deal_value)[0].deal_name : null,
        expected_impact: `Reduce projected miss by escalating ${deals_at_risk} at-risk deal${deals_at_risk === 1 ? '' : 's'}`,
        urgency: 'immediate',
        category: 'protect_coverage',
      };
    }
  }

  // -------------------------------------------------------------------
  // Fallback: Generic advance recommendation
  // -------------------------------------------------------------------
  const topDeal = deals
    .filter(d => !['won', 'lost'].includes(d.current_stage.toLowerCase()))
    .sort((a, b) => (b.deal_value * b.stage_probability) - (a.deal_value * a.stage_probability))[0];

  if (topDeal) {
    return {
      action: `Focus on ${topDeal.deal_name} — highest weighted value deal`,
      rationale: `${topDeal.deal_name} (${topDeal.current_stage}, ${formatCurrency(topDeal.deal_value)}) represents the highest expected revenue in your current pipeline.`,
      target_deal_id: topDeal.deal_id,
      target_deal_name: topDeal.deal_name,
      expected_impact: `Progress ${formatCurrency(topDeal.deal_value * topDeal.stage_probability / 100)} weighted deal`,
      urgency: 'today',
      category: 'advance',
    };
  }

  return {
    action: 'Prospect for new opportunities and build your pipeline',
    rationale: 'No active deals detected. Focus on generating new qualified pipeline.',
    target_deal_id: null,
    target_deal_name: null,
    expected_impact: 'Build pipeline for future quarters',
    urgency: 'this_week',
    category: 'build_pipeline',
  };
}

// =============================================================================
// Helpers
// =============================================================================

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function isLateStageKeyword(stage: string): boolean {
  const s = stage.toLowerCase();
  return ['negotiation', 'proposal', 'contract', 'closing', 'verbal', 'decision', 'commit'].some(k => s.includes(k));
}

function isEarlyStageKeyword(stage: string): boolean {
  const s = stage.toLowerCase();
  return ['lead', 'prospect', 'discovery', 'qualified', 'intro'].some(k => s.includes(k));
}
