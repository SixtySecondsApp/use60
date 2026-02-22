// supabase/functions/_shared/orchestrator/promotionEngine.ts
// Promotion rules engine for graduated autonomy (PRD-24, GRAD-002)

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getAutonomyAnalytics, meetsPromotionCriteria, DEFAULT_THRESHOLDS } from './autonomyAnalytics.ts';
import type { PromotionThresholds } from './autonomyAnalytics.ts';

const ACTION_TYPES = [
  'crm_stage_change', 'crm_field_update', 'crm_contact_create',
  'send_email', 'send_slack', 'create_task', 'enrich_contact', 'draft_proposal',
];

export interface PromotionCandidate {
  actionType: string;
  currentPolicy: string;
  proposedPolicy: string;
  evidence: {
    approvalCount: number;
    rejectionCount: number;
    approvalRate: number;
    windowDays: number;
  };
}

/**
 * Evaluate all action types for promotion eligibility.
 * Returns a list of candidates that meet the criteria.
 */
export async function evaluatePromotions(
  supabase: SupabaseClient,
  orgId: string,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS
): Promise<PromotionCandidate[]> {
  const analytics = await getAutonomyAnalytics(supabase, orgId, 30);
  const candidates: PromotionCandidate[] = [];

  for (const actionAnalytics of analytics) {
    // Skip if in cooldown
    const { data: cooldown } = await supabase
      .from('autonomy_cooldowns')
      .select('cooldown_until')
      .eq('org_id', orgId)
      .eq('action_type', actionAnalytics.action_type)
      .maybeSingle();

    if (cooldown && new Date(cooldown.cooldown_until) > new Date()) {
      continue; // Still in cooldown
    }

    // Skip if already has a pending promotion
    const { data: existing } = await supabase
      .from('autonomy_promotion_queue')
      .select('id')
      .eq('org_id', orgId)
      .eq('action_type', actionAnalytics.action_type)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) continue;

    // Check if meets criteria
    const { eligible } = meetsPromotionCriteria(actionAnalytics, thresholds);
    if (!eligible) continue;

    // Check manager ceiling and promotion eligibility
    const { data: ceiling } = await supabase
      .from('autonomy_policy_ceilings')
      .select('max_ceiling, auto_promotion_eligible')
      .eq('org_id', orgId)
      .eq('action_type', actionAnalytics.action_type)
      .maybeSingle();

    // Skip if manager has disabled auto-promotion for this action type
    if (ceiling && !ceiling.auto_promotion_eligible) continue;

    // Determine current and proposed policy
    const currentPolicy = await getCurrentPolicy(supabase, orgId, actionAnalytics.action_type);
    const proposedPolicy = getNextPolicy(currentPolicy);

    if (!proposedPolicy) continue; // Already at highest autonomy

    // Enforce manager ceiling — don't promote beyond the max ceiling
    if (ceiling?.max_ceiling) {
      const policyOrder = ['disabled', 'suggest', 'approve', 'auto'];
      const proposedIdx = policyOrder.indexOf(proposedPolicy);
      const ceilingIdx = policyOrder.indexOf(ceiling.max_ceiling);
      if (proposedIdx > ceilingIdx) continue; // Would exceed ceiling
    }

    candidates.push({
      actionType: actionAnalytics.action_type,
      currentPolicy,
      proposedPolicy,
      evidence: {
        approvalCount: actionAnalytics.approval_count,
        rejectionCount: actionAnalytics.rejection_count,
        approvalRate: actionAnalytics.approval_rate,
        windowDays: 30,
      },
    });
  }

  return candidates;
}

/**
 * Create promotion suggestions in the queue.
 */
export async function createPromotionSuggestions(
  supabase: SupabaseClient,
  orgId: string,
  candidates: PromotionCandidate[]
): Promise<void> {
  for (const candidate of candidates) {
    await supabase.from('autonomy_promotion_queue').insert({
      org_id: orgId,
      action_type: candidate.actionType,
      current_policy: candidate.currentPolicy,
      proposed_policy: candidate.proposedPolicy,
      evidence: candidate.evidence,
      status: 'pending',
    });
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
    .single();

  if (!promotion) throw new Error('Promotion not found');

  // Update the org config
  await supabase.from('agent_config_org_overrides').upsert({
    org_id: orgId,
    agent_type: 'global',
    config_key: `autonomy.${promotion.action_type}`,
    config_value: JSON.stringify(promotion.proposed_policy),
  }, { onConflict: 'org_id,agent_type,config_key' });

  // Mark promotion as approved
  await supabase
    .from('autonomy_promotion_queue')
    .update({ status: 'approved', resolved_at: new Date().toISOString(), resolved_by: approvedBy })
    .eq('id', promotionId);

  // Audit log
  await supabase.from('autonomy_audit_log').insert({
    org_id: orgId,
    action_type: promotion.action_type,
    change_type: 'promotion',
    previous_policy: promotion.current_policy,
    new_policy: promotion.proposed_policy,
    trigger_reason: 'Met promotion criteria',
    evidence: promotion.evidence,
    initiated_by: approvedBy,
  });
}

/**
 * Reject/snooze a promotion suggestion.
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
      snoozed_until: snoozedUntil,
    })
    .eq('id', promotionId);
}

async function getCurrentPolicy(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string
): Promise<string> {
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

  return 'approve'; // Default
}

function getNextPolicy(current: string): string | null {
  switch (current) {
    case 'suggest': return 'approve';
    case 'approve': return 'auto';
    case 'auto': return null; // Already highest
    case 'disabled': return 'suggest';
    default: return 'approve';
  }
}
