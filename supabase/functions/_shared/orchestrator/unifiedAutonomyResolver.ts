/**
 * Unified Autonomy Resolver — AE2-002
 *
 * Single entry point that consults BOTH autonomy systems:
 *   System A (org-policy)  → autonomyResolver.ts  → org/preset ceiling
 *   System B (user-autopilot) → autopilot_confidence → per-user earned tier
 *
 * Returns the MORE RESTRICTIVE of the two, plus a rich decision payload
 * for the explainability layer (AE2-007).
 *
 * Used by: fleetRouter, AutonomousExecutor (chat path), Command Centre
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  resolveAutonomyPolicy,
  getActionTypeForSkill,
  type AutonomyPolicy,
  type PolicyResolution,
} from './autonomyResolver.ts';
import { calculateContextRisk, type ContextRiskInput } from './contextRiskScorer.ts';

// =============================================================================
// Types
// =============================================================================

export type { AutonomyPolicy };

/** Ordered tiers from most restrictive to least restrictive */
const TIER_ORDER: AutonomyPolicy[] = ['disabled', 'suggest', 'approve', 'auto'];

export interface AutonomyDecisionFactor {
  signal: string;
  value: string | number;
  weight: number;
  contribution: string;
}

export interface AutonomyDecision {
  /** Effective tier after combining both systems */
  tier: AutonomyPolicy;
  /** Which system was the bottleneck */
  source: 'org_policy' | 'user_autopilot' | 'aligned' | 'default' | 'context_risk';
  /** System A result */
  orgPolicy: PolicyResolution;
  /** System B user tier (null if no confidence data) */
  userTier: AutonomyPolicy | null;
  /** System B confidence score (null if no data) */
  confidenceScore: number | null;
  /** Factors that influenced the decision (for explainability) */
  factors: AutonomyDecisionFactor[];
  /** Human-readable explanation stub (expanded by AE2-007) */
  explanation: string;
  /** Whether context risk adjusted the tier */
  contextAdjusted: boolean;
  /** Context risk score if applicable */
  contextRisk: number | null;
}

export { type ContextRiskInput };

// =============================================================================
// Cache (5-minute TTL)
// =============================================================================

interface CacheEntry {
  decision: AutonomyDecision;
  expires: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const decisionCache = new Map<string, CacheEntry>();

export function invalidateUnifiedCache(): void {
  decisionCache.clear();
}

// =============================================================================
// Helpers
// =============================================================================

/** Returns the more restrictive of two tiers (lower index = more restrictive) */
function moreRestrictive(a: AutonomyPolicy, b: AutonomyPolicy): AutonomyPolicy {
  const idxA = TIER_ORDER.indexOf(a);
  const idxB = TIER_ORDER.indexOf(b);
  return idxA <= idxB ? a : b;
}

/** Maps an autopilot tier string to AutonomyPolicy (handles edge cases) */
function parseUserTier(tier: string | null): AutonomyPolicy | null {
  if (!tier) return null;
  const normalized = tier.toLowerCase() as AutonomyPolicy;
  if (TIER_ORDER.includes(normalized)) return normalized;
  return null;
}

// =============================================================================
// Main Resolver
// =============================================================================

/**
 * Resolves the effective autonomy tier by consulting both systems.
 *
 * @param supabase - Service role client
 * @param orgId    - Organization ID
 * @param userId   - User ID (null for system-triggered actions)
 * @param actionType - Action type key (e.g. 'send_email', 'crm_field_update')
 */
export async function resolveAutonomy(
  supabase: SupabaseClient,
  orgId: string,
  userId: string | null,
  actionType: string,
  context?: ContextRiskInput,
): Promise<AutonomyDecision> {
  // Skip cache when context is provided (context-specific decisions shouldn't pollute base cache)
  const useCache = !context;
  const cacheKey = `unified:${orgId}:${userId ?? 'null'}:${actionType}`;
  const now = Date.now();

  if (useCache) {
    const cached = decisionCache.get(cacheKey);
    if (cached && cached.expires > now) {
      return cached.decision;
    }
  }

  const factors: AutonomyDecisionFactor[] = [];

  try {
    // -----------------------------------------------------------------------
    // Step 1: Resolve System A (org-policy)
    // -----------------------------------------------------------------------
    const orgPolicy = await resolveAutonomyPolicy(supabase, orgId, userId, actionType);
    factors.push({
      signal: 'org_policy',
      value: orgPolicy.policy,
      weight: 1.0,
      contribution: `Org policy: ${orgPolicy.policy} (source: ${orgPolicy.source})`,
    });

    // -----------------------------------------------------------------------
    // Step 2: Resolve System B (user autopilot confidence)
    // -----------------------------------------------------------------------
    let userTier: AutonomyPolicy | null = null;
    let confidenceScore: number | null = null;

    if (userId) {
      const { data: confidence } = await supabase
        .from('autopilot_confidence')
        .select('current_tier, score, approval_rate, clean_approval_rate, total_signals, cooldown_until')
        .eq('user_id', userId)
        .eq('action_type', actionType)
        .maybeSingle();

      if (confidence) {
        userTier = parseUserTier(confidence.current_tier);
        confidenceScore = confidence.score;

        factors.push({
          signal: 'confidence_score',
          value: confidence.score,
          weight: 0.8,
          contribution: `Confidence: ${(confidence.score * 100).toFixed(0)}% (${confidence.total_signals} signals)`,
        });

        factors.push({
          signal: 'approval_rate',
          value: confidence.clean_approval_rate ?? confidence.approval_rate ?? 0,
          weight: 0.5,
          contribution: `Clean approval rate: ${((confidence.clean_approval_rate ?? 0) * 100).toFixed(0)}%`,
        });

        if (confidence.cooldown_until && new Date(confidence.cooldown_until) > new Date()) {
          factors.push({
            signal: 'cooldown_active',
            value: confidence.cooldown_until,
            weight: -1.0,
            contribution: `Cooldown active until ${confidence.cooldown_until}`,
          });
        }

        if (userTier) {
          factors.push({
            signal: 'user_tier',
            value: userTier,
            weight: 1.0,
            contribution: `User earned tier: ${userTier}`,
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 3: Combine — take the more restrictive of org ceiling vs user tier
    // -----------------------------------------------------------------------
    let effectiveTier: AutonomyPolicy;
    let source: AutonomyDecision['source'];

    if (userTier) {
      effectiveTier = moreRestrictive(orgPolicy.policy, userTier);
      if (effectiveTier === orgPolicy.policy && effectiveTier !== userTier) {
        source = 'org_policy'; // org ceiling is the bottleneck
      } else if (effectiveTier === userTier && effectiveTier !== orgPolicy.policy) {
        source = 'user_autopilot'; // user hasn't earned enough trust yet
      } else {
        source = 'aligned'; // both agree
      }
    } else {
      // No user autopilot data — fall back to org policy only
      effectiveTier = orgPolicy.policy;
      source = 'org_policy';
    }

    // -----------------------------------------------------------------------
    // Step 3.5: Context risk adjustment (AE2-005)
    // -----------------------------------------------------------------------
    let contextAdjusted = false;
    let contextRiskScore: number | null = null;

    if (context && (context.dealId || context.contactId || context.dealValue !== undefined)) {
      const risk = await calculateContextRisk(supabase, context);
      contextRiskScore = risk.score;

      if (risk.escalation_recommendation !== 'none') {
        const preTier = effectiveTier;

        // > 0.9: downgrade to 'suggest' regardless of current tier
        if (risk.score > 0.9 && TIER_ORDER.indexOf(effectiveTier) > TIER_ORDER.indexOf('suggest')) {
          effectiveTier = 'suggest';
        }
        // > 0.7 AND current tier is 'auto': downgrade to 'approve'
        else if (risk.score > 0.7 && effectiveTier === 'auto') {
          effectiveTier = 'approve';
        }

        if (preTier !== effectiveTier) {
          contextAdjusted = true;
          source = 'context_risk';

          factors.push({
            signal: 'context_risk',
            value: risk.score,
            weight: 1.0,
            contribution: `Context risk ${risk.score.toFixed(2)} downgraded ${preTier} → ${effectiveTier}`,
          });

          // Add individual risk factor breakdown for explainability
          for (const rf of risk.factors) {
            if (rf.contribution > 0) {
              factors.push({
                signal: `context:${rf.signal}`,
                value: rf.value,
                weight: rf.weight,
                contribution: `${rf.signal}: ${rf.contribution.toFixed(3)}`,
              });
            }
          }

          // Record context_escalation signal for learning (fire-and-forget)
          if (userId) {
            supabase
              .from('autopilot_signals')
              .insert({
                user_id: userId,
                org_id: orgId,
                action_type: actionType,
                signal_type: 'context_escalation',
                metadata: {
                  risk_score: risk.score,
                  from_tier: preTier,
                  to_tier: effectiveTier,
                  deal_id: context.dealId ?? null,
                  contact_id: context.contactId ?? null,
                },
              })
              .then(({ error }) => {
                if (error) console.warn('[unifiedAutonomyResolver] Failed to record context_escalation signal:', error.message);
              });
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 4: Build explanation stub
    // -----------------------------------------------------------------------
    let explanation: string;
    if (contextAdjusted) {
      explanation = `Tier downgraded to ${effectiveTier} due to high-risk context (risk score: ${contextRiskScore?.toFixed(2)})`;
    } else {
      switch (source) {
        case 'org_policy':
          explanation = `Tier set by org policy (${orgPolicy.source}): ${effectiveTier}`;
          break;
        case 'user_autopilot':
          explanation = `Your earned trust level is ${userTier} for ${actionType} (confidence: ${confidenceScore !== null ? (confidenceScore * 100).toFixed(0) + '%' : 'N/A'})`;
          break;
        case 'aligned':
          explanation = `Both org policy and your trust level agree: ${effectiveTier}`;
          break;
        default:
          explanation = `Default policy: ${effectiveTier}`;
      }
    }

    const decision: AutonomyDecision = {
      tier: effectiveTier,
      source,
      orgPolicy,
      userTier,
      confidenceScore,
      factors,
      explanation,
      contextAdjusted,
      contextRisk: contextRiskScore,
    };

    // Only cache non-context decisions
    if (useCache) {
      decisionCache.set(cacheKey, { decision, expires: now + CACHE_TTL_MS });
    }
    return decision;
  } catch (err) {
    console.warn('[unifiedAutonomyResolver] Resolution error, falling back to approve:', err);
    return {
      tier: 'approve',
      source: 'default',
      orgPolicy: { policy: 'approve', source: 'default' },
      userTier: null,
      confidenceScore: null,
      factors: [{ signal: 'error_fallback', value: 'true', weight: 0, contribution: 'Error during resolution — defaulting to approve' }],
      explanation: 'Defaulting to approval-required due to resolution error',
      contextAdjusted: false,
      contextRisk: null,
    };
  }
}

/**
 * Convenience: resolve autonomy from a skill name (maps to action type internally).
 */
export async function resolveAutonomyForSkill(
  supabase: SupabaseClient,
  orgId: string,
  userId: string | null,
  skillName: string,
  context?: ContextRiskInput,
): Promise<AutonomyDecision> {
  const actionType = getActionTypeForSkill(skillName);
  if (!actionType) {
    // Internal/read-only skills — always auto
    return {
      tier: 'auto',
      source: 'default',
      orgPolicy: { policy: 'auto', source: 'default' },
      userTier: null,
      confidenceScore: null,
      factors: [{ signal: 'internal_skill', value: skillName, weight: 0, contribution: `${skillName} has no action mapping — auto-execute` }],
      explanation: 'Internal skill — no approval required',
      contextAdjusted: false,
      contextRisk: null,
    };
  }

  return resolveAutonomy(supabase, orgId, userId, actionType, context);
}
