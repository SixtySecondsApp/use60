/**
 * Context Risk Scorer — AE2-004
 *
 * Calculates a risk score (0.0–1.0) based on deal/contact context.
 * The score is used by the unified autonomy resolver (AE2-005) to dynamically
 * downgrade autonomy tiers for high-stakes situations — large deals, senior
 * buyers, and cold relationships all warrant more scrutiny before acting.
 *
 * Signal weights:
 *   deal_value          (0.30) — deal size proxy for financial exposure
 *   contact_seniority   (0.25) — seniority of the primary buyer
 *   deal_stage          (0.20) — later stages = more scrutiny before acting
 *   relationship_warmth (0.15) — cold relationships are riskier to act on
 *   action_reversibility(0.10) — caller-supplied; irreversible actions score higher
 *
 * Escalation thresholds:
 *   score > 0.9 → 'two_levels'
 *   score > 0.7 → 'one_level'
 *   else        → 'none'
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

export interface ContextRiskInput {
  dealId?: string;
  contactId?: string;
  /** Deal value in dollars. Fetched from deals.amount if dealId provided and this is omitted. */
  dealValue?: number;
  /** Contact job title. Fetched from contacts.job_title if contactId provided and this is omitted. */
  contactTitle?: string;
  /** Stage ID UUID. Fetched from deals.stage_id if dealId provided and this is omitted. */
  dealStage?: string;
  /** Warmth score [0,1] from contact_warmth_scores. Looked up by contactId if omitted. */
  warmthScore?: number;
  /**
   * Reversibility of the action being evaluated [0,1].
   * 0.0 = fully reversible (e.g. draft creation)
   * 1.0 = fully irreversible (e.g. sending an email, CRM field delete)
   * Supplied by the caller — this scorer does not infer it.
   */
  actionReversibility?: number;
}

export interface ContextRiskFactor {
  signal: string;
  value: string | number;
  weight: number;
  contribution: number;
}

export interface ContextRisk {
  /** Composite risk score in [0.0, 1.0]. Higher = more risky. */
  score: number;
  /** Breakdown of each signal's contribution. */
  factors: ContextRiskFactor[];
  /** Recommended autonomy-tier downgrade based on the score. */
  escalation_recommendation: 'none' | 'one_level' | 'two_levels';
}

// =============================================================================
// Signal weights (must sum to 1.0)
// =============================================================================

const WEIGHTS = {
  deal_value: 0.30,
  contact_seniority: 0.25,
  deal_stage: 0.20,
  relationship_warmth: 0.15,
  action_reversibility: 0.10,
} as const;

// =============================================================================
// Seniority parser
// =============================================================================

/**
 * Parses a job title string and returns a seniority score in [0.0, 1.0].
 *
 * Scoring tiers:
 *   C-suite (CEO, CTO, CFO, COO, CMO, CRO, "Chief …") → 1.0
 *   VP / Vice President                                 → 0.7
 *   Director                                            → 0.5
 *   Manager / Head of                                   → 0.3
 *   Everything else (IC / unknown)                      → 0.0
 */
export function parseSeniority(title: string): number {
  if (!title || title.trim() === '') return 0.0;

  const t = title.toLowerCase();

  // C-suite — check first (most specific)
  if (
    /\bceo\b/.test(t) ||
    /\bcto\b/.test(t) ||
    /\bcfo\b/.test(t) ||
    /\bcoo\b/.test(t) ||
    /\bcmo\b/.test(t) ||
    /\bcro\b/.test(t) ||
    /\bchief\b/.test(t)
  ) {
    return 1.0;
  }

  // VP
  if (/\bvp\b/.test(t) || /vice\s+president/.test(t)) {
    return 0.7;
  }

  // Director
  if (/\bdirector\b/.test(t)) {
    return 0.5;
  }

  // Manager / Head of
  if (/\bmanager\b/.test(t) || /\bhead\s+of\b/.test(t)) {
    return 0.3;
  }

  // IC / unknown
  return 0.0;
}

// =============================================================================
// Deal value scoring
// =============================================================================

/**
 * Maps a deal dollar value to a risk score in [0.0, 1.0].
 *   < $25 000  → 0.0
 *   $25K–$100K → 0.5
 *   > $100 000 → 1.0
 */
function scoreDealValue(value: number): number {
  if (value >= 100_000) return 1.0;
  if (value >= 25_000) return 0.5;
  return 0.0;
}

// =============================================================================
// Stage position scoring
// =============================================================================

/**
 * Converts a stage position (1-based ordinal) to a risk score in [0.0, 1.0].
 * Higher position = later stage = higher risk (more committed, harder to reverse).
 * We normalise against a practical maximum of 8 stages; anything beyond that
 * caps at 1.0.
 */
function scoreStagePosition(position: number): number {
  const MAX_STAGES = 8;
  // Position 1 (earliest stage) = 0.0; final stages approach 1.0
  return Math.min(1.0, (position - 1) / (MAX_STAGES - 1));
}

// =============================================================================
// Warmth inversion
// =============================================================================

/**
 * Converts a warmth score [0,1] to a risk contribution [0,1].
 * Cold relationships (warmth ≈ 0) are riskier to act on autonomously.
 */
function warmthToRisk(warmthScore: number): number {
  return 1.0 - Math.max(0, Math.min(1, warmthScore));
}

// =============================================================================
// Escalation recommendation
// =============================================================================

function toEscalation(score: number): ContextRisk['escalation_recommendation'] {
  if (score > 0.9) return 'two_levels';
  if (score > 0.7) return 'one_level';
  return 'none';
}

// =============================================================================
// Main exported function
// =============================================================================

/**
 * Calculates the context risk score for a given deal/contact context.
 *
 * Any fields not supplied in `input` will be fetched from the database when
 * a corresponding ID is present (dealId → deals, contactId → contacts +
 * contact_warmth_scores).
 *
 * @param supabase - A Supabase client (service role for edge functions)
 * @param input    - Context signals; supply pre-fetched values to avoid extra queries
 */
export async function calculateContextRisk(
  supabase: SupabaseClient,
  input: ContextRiskInput,
): Promise<ContextRisk> {
  console.log('[contextRiskScorer] calculateContextRisk called', {
    dealId: input.dealId,
    contactId: input.contactId,
    hasDealValue: input.dealValue !== undefined,
    hasContactTitle: input.contactTitle !== undefined,
    hasDealStage: input.dealStage !== undefined,
    hasWarmthScore: input.warmthScore !== undefined,
    actionReversibility: input.actionReversibility,
  });

  // -------------------------------------------------------------------------
  // 1. Fetch missing deal fields (amount, stage_id)
  // -------------------------------------------------------------------------

  let dealValue = input.dealValue;
  let dealStageId = input.dealStage;

  if (input.dealId && (dealValue === undefined || dealStageId === undefined)) {
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('amount, stage_id')
      .eq('id', input.dealId)
      .maybeSingle();

    if (dealError) {
      console.warn('[contextRiskScorer] Failed to fetch deal', {
        dealId: input.dealId,
        error: dealError.message,
      });
    } else if (deal) {
      if (dealValue === undefined) dealValue = deal.amount ?? undefined;
      if (dealStageId === undefined) dealStageId = deal.stage_id ?? undefined;

      console.log('[contextRiskScorer] Fetched deal fields', {
        dealId: input.dealId,
        amount: deal.amount,
        stage_id: deal.stage_id,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. Fetch missing contact title
  // -------------------------------------------------------------------------

  let contactTitle = input.contactTitle;

  if (input.contactId && contactTitle === undefined) {
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('job_title')
      .eq('id', input.contactId)
      .maybeSingle();

    if (contactError) {
      console.warn('[contextRiskScorer] Failed to fetch contact', {
        contactId: input.contactId,
        error: contactError.message,
      });
    } else if (contact) {
      contactTitle = contact.job_title ?? undefined;

      console.log('[contextRiskScorer] Fetched contact title', {
        contactId: input.contactId,
        job_title: contact.job_title,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Fetch missing warmth score
  // -------------------------------------------------------------------------

  let warmthScore = input.warmthScore;

  if (input.contactId && warmthScore === undefined) {
    const { data: warmth, error: warmthError } = await supabase
      .from('contact_warmth_scores')
      .select('warmth_score')
      .eq('contact_id', input.contactId)
      .maybeSingle();

    if (warmthError) {
      console.warn('[contextRiskScorer] Failed to fetch warmth score', {
        contactId: input.contactId,
        error: warmthError.message,
      });
    } else if (warmth) {
      warmthScore = warmth.warmth_score ?? undefined;

      console.log('[contextRiskScorer] Fetched warmth score', {
        contactId: input.contactId,
        warmth_score: warmth.warmth_score,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. Fetch stage position from pipeline_stages
  // -------------------------------------------------------------------------

  let stagePosition: number | undefined;

  if (dealStageId) {
    const { data: stage, error: stageError } = await supabase
      .from('pipeline_stages')
      .select('position')
      .eq('id', dealStageId)
      .maybeSingle();

    if (stageError) {
      console.warn('[contextRiskScorer] Failed to fetch pipeline stage', {
        stageId: dealStageId,
        error: stageError.message,
      });
    } else if (stage) {
      stagePosition = stage.position ?? undefined;

      console.log('[contextRiskScorer] Fetched stage position', {
        stageId: dealStageId,
        position: stage.position,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5. Score each signal
  // -------------------------------------------------------------------------

  const factors: ContextRiskFactor[] = [];

  // --- deal_value ---
  const rawDealValue = dealValue ?? 0;
  const dealValueRisk = scoreDealValue(rawDealValue);
  const dealValueContribution = dealValueRisk * WEIGHTS.deal_value;
  factors.push({
    signal: 'deal_value',
    value: rawDealValue,
    weight: WEIGHTS.deal_value,
    contribution: dealValueContribution,
  });

  console.log('[contextRiskScorer] deal_value signal', {
    rawDealValue,
    dealValueRisk,
    contribution: dealValueContribution,
  });

  // --- contact_seniority ---
  const rawTitle = contactTitle ?? '';
  const seniorityRisk = parseSeniority(rawTitle);
  const seniorityContribution = seniorityRisk * WEIGHTS.contact_seniority;
  factors.push({
    signal: 'contact_seniority',
    value: rawTitle || 'unknown',
    weight: WEIGHTS.contact_seniority,
    contribution: seniorityContribution,
  });

  console.log('[contextRiskScorer] contact_seniority signal', {
    rawTitle,
    seniorityRisk,
    contribution: seniorityContribution,
  });

  // --- deal_stage ---
  const rawPosition = stagePosition ?? 1;
  const stageRisk = stagePosition !== undefined ? scoreStagePosition(rawPosition) : 0.0;
  const stageContribution = stageRisk * WEIGHTS.deal_stage;
  factors.push({
    signal: 'deal_stage',
    value: stagePosition !== undefined ? rawPosition : 'unknown',
    weight: WEIGHTS.deal_stage,
    contribution: stageContribution,
  });

  console.log('[contextRiskScorer] deal_stage signal', {
    stagePosition,
    stageRisk,
    contribution: stageContribution,
  });

  // --- relationship_warmth ---
  // When warmth is unknown we treat it as cold (riskiest assumption)
  const rawWarmth = warmthScore ?? 0;
  const warmthRisk = warmthToRisk(rawWarmth);
  const warmthContribution = warmthRisk * WEIGHTS.relationship_warmth;
  factors.push({
    signal: 'relationship_warmth',
    value: rawWarmth,
    weight: WEIGHTS.relationship_warmth,
    contribution: warmthContribution,
  });

  console.log('[contextRiskScorer] relationship_warmth signal', {
    rawWarmth,
    warmthRisk,
    contribution: warmthContribution,
  });

  // --- action_reversibility ---
  const reversibilityRisk = Math.max(0, Math.min(1, input.actionReversibility ?? 0));
  const reversibilityContribution = reversibilityRisk * WEIGHTS.action_reversibility;
  factors.push({
    signal: 'action_reversibility',
    value: reversibilityRisk,
    weight: WEIGHTS.action_reversibility,
    contribution: reversibilityContribution,
  });

  console.log('[contextRiskScorer] action_reversibility signal', {
    reversibilityRisk,
    contribution: reversibilityContribution,
  });

  // -------------------------------------------------------------------------
  // 6. Composite score
  // -------------------------------------------------------------------------

  const score = Math.min(
    1.0,
    factors.reduce((sum, f) => sum + f.contribution, 0),
  );

  const escalation_recommendation = toEscalation(score);

  console.log('[contextRiskScorer] Final risk score', {
    score,
    escalation_recommendation,
    factors: factors.map((f) => ({ signal: f.signal, contribution: f.contribution })),
  });

  return { score, factors, escalation_recommendation };
}
