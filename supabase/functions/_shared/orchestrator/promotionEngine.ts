// supabase/functions/_shared/orchestrator/promotionEngine.ts
// Promotion rules engine for graduated autonomy (PRD-24, GRAD-002)
//
// Promotion policy ladder (least to most autonomous):
//   disabled -> suggest -> approve -> auto
//
// Never skip levels: approve -> auto (one step), not approve -> auto in one jump
// from disabled.
//
// Demotion trigger: rejection rate > 15% in trailing 7-day window after promotion.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getAutonomyAnalytics,
  meetsPromotionCriteria,
  shouldDemote,
  DEFAULT_THRESHOLDS,
} from './autonomyAnalytics.ts';
import type { ActionAnalytics, PromotionThresholds } from './autonomyAnalytics.ts';
import { evaluateDemotions, clearExpiredCooldowns, isInCooldown } from './demotionHandler.ts';
import type { DemotionResult } from './demotionHandler.ts';

// Re-export thresholds for consumers
export { DEFAULT_THRESHOLDS };
export type { PromotionThresholds };

const ACTION_TYPES = [
  'crm_stage_change', 'crm_field_update', 'crm_contact_create',
  'send_email', 'send_slack', 'create_task', 'enrich_contact', 'draft_proposal',
];

// Policy order from least to most autonomous
const POLICY_ORDER = ['disabled', 'suggest', 'approve', 'auto'] as const;

export interface PromotionCandidate {
  actionType: string;
  currentPolicy: string;
  proposedPolicy: string;
  evidence: {
    approvalRate: number;
    totalActions: number;
    windowDays: number;
    rejectionRate: number;
    avgEditRate: number;
    approvalCount: number;
    rejectionCount: number;
    editCount: number;
  };
}

// =============================================================================
// Core evaluation functions
// =============================================================================

/**
 * Evaluate all action types for promotion eligibility.
 * Returns a list of candidates that meet the criteria.
 *
 * Called by the daily evaluation cron job.
 */
export async function evaluatePromotions(
  supabase: SupabaseClient,
  orgId: string,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS
): Promise<PromotionCandidate[]> {
  const analytics = await getAutonomyAnalytics(supabase, orgId, 30);
  const candidates: PromotionCandidate[] = [];

  for (const actionAnalytics of analytics) {
    const candidate = await checkPromotionEligibility(
      supabase,
      orgId,
      actionAnalytics.action_type,
      actionAnalytics,
      thresholds,
    );

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Check a single action type for promotion eligibility.
 *
 * Returns a PromotionCandidate if the action type meets all criteria,
 * or null if it does not qualify.
 *
 * Checks performed:
 * 1. Not in cooldown period (post-demotion)
 * 2. No pending promotion already in queue
 * 3. Meets min approvals, max rejection rate, min days active thresholds
 * 4. Manager ceiling allows promotion
 * 5. Next policy level exists (not already at 'auto')
 */
export async function checkPromotionEligibility(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string,
  stats: ActionAnalytics,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS
): Promise<PromotionCandidate | null> {
  // 1. Skip if in cooldown (post-demotion — checked via demotionHandler)
  const inCooldown = await isInCooldown(supabase, orgId, actionType);
  if (inCooldown) {
    return null;
  }

  // 2. Skip if already has a pending promotion
  const { data: existing } = await supabase
    .from('autonomy_promotion_queue')
    .select('id')
    .eq('org_id', orgId)
    .eq('action_type', actionType)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) return null;

  // 3. Check if meets promotion criteria (min approvals, max rejection rate)
  const { eligible } = meetsPromotionCriteria(stats, thresholds);
  if (!eligible) return null;

  // 4. Check min days active — need at least minDaysActive days of data
  // Use the earliest action in the analytics window as a proxy
  const { data: earliestAction } = await supabase
    .from('crm_approval_queue')
    .select('created_at')
    .eq('org_id', orgId)
    .eq('action_type', actionType)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (earliestAction) {
    const daysActive = Math.floor(
      (Date.now() - new Date(earliestAction.created_at).getTime()) / (24 * 60 * 60 * 1000)
    );
    if (daysActive < thresholds.minDaysActive) return null;
  } else {
    // No history at all — cannot promote
    return null;
  }

  // 5. Check manager ceiling and auto-promotion eligibility
  const { data: ceiling } = await supabase
    .from('autonomy_policy_ceilings')
    .select('max_ceiling, auto_promotion_eligible')
    .eq('org_id', orgId)
    .eq('action_type', actionType)
    .maybeSingle();

  if (ceiling && !ceiling.auto_promotion_eligible) return null;

  // 6. Determine current and proposed policy
  const currentPolicy = await getCurrentPolicy(supabase, orgId, actionType);
  const proposedPolicy = getNextPolicy(currentPolicy);

  if (!proposedPolicy) return null; // Already at highest autonomy

  // 7. Enforce manager ceiling — don't promote beyond the max ceiling
  if (ceiling?.max_ceiling) {
    const proposedIdx = POLICY_ORDER.indexOf(proposedPolicy as typeof POLICY_ORDER[number]);
    const ceilingIdx = POLICY_ORDER.indexOf(ceiling.max_ceiling as typeof POLICY_ORDER[number]);
    if (proposedIdx > ceilingIdx) return null;
  }

  // Build evidence
  const rejectionRate = stats.total_count > 0
    ? (stats.rejection_count / stats.total_count) * 100
    : 0;
  const editRate = stats.total_count > 0
    ? (stats.edit_count / stats.total_count) * 100
    : 0;

  return {
    actionType,
    currentPolicy,
    proposedPolicy,
    evidence: {
      approvalRate: stats.approval_rate,
      totalActions: stats.total_count,
      windowDays: 30,
      rejectionRate: Math.round(rejectionRate * 100) / 100,
      avgEditRate: Math.round(editRate * 100) / 100,
      approvalCount: stats.approval_count,
      rejectionCount: stats.rejection_count,
      editCount: stats.edit_count,
    },
  };
}

/**
 * Check if demotion is needed for an action type.
 *
 * Demotion trigger: rejection rate exceeds 15% in trailing 7-day window
 * after a promotion occurred within the last 30 days.
 *
 * Returns true if the action type should be demoted.
 */
export async function checkDemotionNeeded(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS
): Promise<boolean> {
  // Check if there was a recent promotion for this action type
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentPromotion } = await supabase
    .from('autonomy_audit_log')
    .select('action_type, new_policy, created_at')
    .eq('org_id', orgId)
    .eq('action_type', actionType)
    .eq('change_type', 'promotion')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!recentPromotion) return false;

  // Get 7-day analytics
  const analytics7d = await getAutonomyAnalytics(supabase, orgId, 7);
  const actionAnalytics = analytics7d.find((a) => a.action_type === actionType);

  if (!actionAnalytics) return false;

  const { demote } = shouldDemote(actionAnalytics, thresholds);
  return demote;
}

// =============================================================================
// Queue management
// =============================================================================

/**
 * Create promotion suggestions in the queue.
 */
export async function createPromotionSuggestions(
  supabase: SupabaseClient,
  orgId: string,
  candidates: PromotionCandidate[]
): Promise<void> {
  for (const candidate of candidates) {
    const { error } = await supabase.from('autonomy_promotion_queue').insert({
      org_id: orgId,
      action_type: candidate.actionType,
      current_policy: candidate.currentPolicy,
      proposed_policy: candidate.proposedPolicy,
      evidence: candidate.evidence,
      status: 'pending',
    });

    if (error) {
      // Unique constraint violation means a pending promotion already exists — skip
      if (error.code === '23505') {
        console.log(`[promotionEngine] Pending promotion already exists for ${candidate.actionType}, skipping`);
        continue;
      }
      console.error(`[promotionEngine] Error creating promotion suggestion for ${candidate.actionType}:`, error);
    }
  }
}

/**
 * Apply a promotion — update the autonomy policy for an action type.
 */
export async function applyPromotion(
  supabase: SupabaseClient,
  orgId: string,
  promotionId: string,
  approvedBy: string
): Promise<void> {
  // Get the promotion
  const { data: promotion } = await supabase
    .from('autonomy_promotion_queue')
    .select('action_type, current_policy, proposed_policy, evidence')
    .eq('id', promotionId)
    .eq('status', 'pending')
    .maybeSingle();

  if (!promotion) throw new Error('Promotion not found or not in pending status');

  // Update the autonomy policy in the org-level policies table
  const { error: policyError } = await supabase.from('autonomy_policies').upsert({
    org_id: orgId,
    user_id: null,
    action_type: promotion.action_type,
    policy: promotion.proposed_policy,
  }, { onConflict: 'org_id,user_id,action_type' });

  if (policyError) {
    console.error('[promotionEngine] Error updating autonomy policy:', policyError);

    // Fallback: also update the config override for backwards compatibility
    await supabase.from('agent_config_org_overrides').upsert({
      org_id: orgId,
      agent_type: 'global',
      config_key: `autonomy.${promotion.action_type}`,
      config_value: JSON.stringify(promotion.proposed_policy),
    }, { onConflict: 'org_id,agent_type,config_key' });
  }

  // Mark promotion as approved
  await supabase
    .from('autonomy_promotion_queue')
    .update({
      status: 'approved',
      resolved_at: new Date().toISOString(),
      resolved_by: approvedBy,
      reviewed_by: approvedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', promotionId);

  // Audit log
  await supabase.from('autonomy_audit_log').insert({
    org_id: orgId,
    action_type: promotion.action_type,
    change_type: 'promotion',
    previous_policy: promotion.current_policy,
    new_policy: promotion.proposed_policy,
    trigger_reason: 'Met promotion criteria — approved by admin',
    evidence: promotion.evidence,
    initiated_by: approvedBy,
  });

  console.log(`[promotionEngine] Promoted ${promotion.action_type}: ${promotion.current_policy} -> ${promotion.proposed_policy} (approved by ${approvedBy})`);
}

/**
 * Reject or snooze a promotion suggestion.
 */
export async function rejectPromotion(
  supabase: SupabaseClient,
  promotionId: string,
  rejectedBy: string,
  snooze: boolean = false
): Promise<void> {
  const snoozedUntil = snooze
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  await supabase
    .from('autonomy_promotion_queue')
    .update({
      status: snooze ? 'snoozed' : 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: rejectedBy,
      reviewed_by: rejectedBy,
      reviewed_at: new Date().toISOString(),
      snoozed_until: snoozedUntil,
    })
    .eq('id', promotionId);
}

// =============================================================================
// Daily evaluation job entry point
// =============================================================================

/**
 * Run the full daily evaluation cycle:
 * 1. Expire old snoozed promotions
 * 2. Evaluate all action types for promotions
 * 3. Queue eligible candidates
 * 4. Check for demotions on recently promoted actions
 *
 * Intended to be called by a cron-triggered edge function.
 */
export async function runDailyEvaluation(
  supabase: SupabaseClient,
  orgId: string,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS
): Promise<{ promotions: PromotionCandidate[]; demotions: DemotionResult[] }> {
  console.log(`[promotionEngine] Starting daily evaluation for org ${orgId}`);

  // 1. Clear expired cooldowns first (unlocks re-promotion of previously demoted actions)
  await clearExpiredCooldowns(supabase, orgId);

  // 2. Expire snoozed promotions
  await supabase.rpc('expire_snoozed_promotions');

  // 3. Evaluate promotions
  const candidates = await evaluatePromotions(supabase, orgId, thresholds);

  if (candidates.length > 0) {
    console.log(`[promotionEngine] Found ${candidates.length} promotion candidates:`,
      candidates.map((c) => `${c.actionType}: ${c.currentPolicy} -> ${c.proposedPolicy}`));
    await createPromotionSuggestions(supabase, orgId, candidates);
  }

  // 4. Evaluate and apply demotions (handles audit log, cooldown, Slack notification)
  const demotions = await evaluateDemotions(supabase, orgId, thresholds);

  if (demotions.length > 0) {
    console.log(`[promotionEngine] Demoted ${demotions.length} actions:`,
      demotions.map((d) => `${d.actionType}: ${d.fromPolicy} -> ${d.toPolicy}`));
  }

  console.log(`[promotionEngine] Daily evaluation complete: ${candidates.length} promotions, ${demotions.length} demotions`);

  return { promotions: candidates, demotions };
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Get the current effective policy for an action type at the org level.
 * Checks autonomy_policies first, falls back to agent_config_org_overrides.
 */
async function getCurrentPolicy(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string
): Promise<string> {
  // Check autonomy_policies table first (preferred source)
  const { data: policy } = await supabase
    .from('autonomy_policies')
    .select('policy')
    .eq('org_id', orgId)
    .eq('action_type', actionType)
    .is('user_id', null)
    .maybeSingle();

  if (policy?.policy) {
    return policy.policy;
  }

  // Fall back to agent_config_org_overrides
  const { data } = await supabase
    .from('agent_config_org_overrides')
    .select('config_value')
    .eq('org_id', orgId)
    .eq('agent_type', 'global')
    .eq('config_key', `autonomy.${actionType}`)
    .maybeSingle();

  if (data?.config_value) {
    try {
      return JSON.parse(data.config_value);
    } catch {
      return data.config_value;
    }
  }

  return 'approve'; // Default — most conservative non-disabled policy
}

/**
 * Get the next policy in the promotion ladder.
 * Ladder: disabled -> suggest -> approve -> auto
 *
 * Returns null if already at the highest level ('auto').
 * Never skips levels.
 */
function getNextPolicy(current: string): string | null {
  const idx = POLICY_ORDER.indexOf(current as typeof POLICY_ORDER[number]);

  if (idx === -1) {
    // Unknown policy, default to promoting to 'approve'
    return 'approve';
  }

  if (idx >= POLICY_ORDER.length - 1) {
    return null; // Already at 'auto'
  }

  return POLICY_ORDER[idx + 1];
}
