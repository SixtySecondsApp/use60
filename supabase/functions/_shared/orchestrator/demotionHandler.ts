// supabase/functions/_shared/orchestrator/demotionHandler.ts
// Demotion handling and safety net for graduated autonomy (PRD-24, GRAD-004)
//
// Exports:
// - handleDemotion()    — Reverts action to previous policy, logs audit, sets cooldown, sends Slack
// - isInCooldown()      — Check if an action type is in post-demotion cooldown
// - logAutonomyEvent()  — Generic audit log writer for promotion/demotion/manual/ceiling events
// - evaluateDemotions() — Batch evaluation of all recently promoted actions for demotion triggers

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getAutonomyAnalytics, shouldDemote, DEFAULT_THRESHOLDS } from './autonomyAnalytics.ts';
import type { PromotionThresholds } from './autonomyAnalytics.ts';
import { sendSlackDM } from '../proactive/deliverySlack.ts';
import { buildAutonomyDemotionMessage } from '../slackBlocks.ts';

// Policy demotion ladder: auto -> suggest -> require_approval
// (reverse of promotion ladder: disabled -> suggest -> approve -> auto)
const POLICY_ORDER = ['disabled', 'suggest', 'approve', 'auto'] as const;

// Action label map for Slack messages
const ACTION_LABELS: Record<string, string> = {
  crm_stage_change: 'CRM Stage Change',
  crm_field_update: 'CRM Field Update',
  crm_contact_create: 'Create CRM Contact',
  send_email: 'Send Email',
  send_slack: 'Send Slack Message',
  create_task: 'Create Task',
  enrich_contact: 'Enrich Contact',
  draft_proposal: 'Draft Proposal',
};

// =============================================================================
// Types
// =============================================================================

export interface LogAutonomyEventParams {
  orgId: string;
  actionType: string;
  changeType: 'promotion' | 'demotion' | 'manual_change' | 'cooldown_start' | 'cooldown_end' | 'ceiling_set';
  previousPolicy?: string;
  newPolicy?: string;
  triggerReason?: string;
  evidence?: Record<string, unknown>;
  initiatedBy: string; // 'system', 'admin:{user_id}', 'auto'
  cooldownUntil?: string; // ISO timestamp
}

export interface DemotionResult {
  demoted: boolean;
  actionType: string;
  fromPolicy: string;
  toPolicy: string;
  reason: string;
  cooldownUntil: string;
}

// =============================================================================
// handleDemotion — Core demotion function
// =============================================================================

/**
 * Demote an action type to its previous (lower) approval policy.
 *
 * Steps:
 * 1. Determine current policy and compute the demotion target (one level down)
 * 2. Update autonomy_policies (preferred) and agent_config_org_overrides (fallback)
 * 3. Set cooldown in autonomy_cooldowns (30 days default)
 * 4. Log to autonomy_audit_log with event_type 'demotion'
 * 5. Send Slack notification to org admin about the demotion
 */
export async function handleDemotion(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string,
  options?: {
    reason?: string;
    evidence?: Record<string, unknown>;
    cooldownDays?: number;
    triggeredBy?: string;
  },
): Promise<DemotionResult> {
  const reason = options?.reason ?? 'Rejection rate exceeded threshold in post-promotion monitoring window';
  const cooldownDays = options?.cooldownDays ?? DEFAULT_THRESHOLDS.cooldownDays;
  const triggeredBy = options?.triggeredBy ?? 'system';

  // 1. Determine current policy
  const currentPolicy = await getCurrentPolicy(supabase, orgId, actionType);
  const demotedPolicy = getPreviousPolicy(currentPolicy);

  console.log(`[demotionHandler] Demoting ${actionType}: ${currentPolicy} -> ${demotedPolicy} (reason: ${reason})`);

  // 2. Update autonomy_policies table (primary)
  const { error: policyError } = await supabase.from('autonomy_policies').upsert({
    org_id: orgId,
    user_id: null,
    action_type: actionType,
    policy: demotedPolicy,
  }, { onConflict: 'org_id,user_id,action_type' });

  if (policyError) {
    console.error('[demotionHandler] Error updating autonomy_policies:', policyError);
  }

  // Also update agent_config_org_overrides for backwards compatibility
  await supabase.from('agent_config_org_overrides').upsert({
    org_id: orgId,
    agent_type: 'global',
    config_key: `autonomy.${actionType}`,
    config_value: JSON.stringify(demotedPolicy),
  }, { onConflict: 'org_id,agent_type,config_key' });

  // 3. Set cooldown — demoted actions cannot be re-promoted for cooldownDays
  const cooldownUntil = new Date(Date.now() + cooldownDays * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('autonomy_cooldowns').upsert({
    org_id: orgId,
    action_type: actionType,
    cooldown_until: cooldownUntil,
    demoted_at: new Date().toISOString(),
    reason,
  }, { onConflict: 'org_id,action_type' });

  // 4. Log to autonomy_audit_log
  await logAutonomyEvent(supabase, {
    orgId,
    actionType,
    changeType: 'demotion',
    previousPolicy: currentPolicy,
    newPolicy: demotedPolicy,
    triggerReason: reason,
    evidence: {
      ...options?.evidence,
      cooldown_until: cooldownUntil,
      cooldown_days: cooldownDays,
    },
    initiatedBy: triggeredBy,
    cooldownUntil,
  });

  // 5. Send Slack notification to org admin
  await sendDemotionSlackNotification(supabase, orgId, actionType, currentPolicy, demotedPolicy, reason, cooldownDays, options?.evidence);

  return {
    demoted: true,
    actionType,
    fromPolicy: currentPolicy,
    toPolicy: demotedPolicy,
    reason,
    cooldownUntil,
  };
}

// =============================================================================
// isInCooldown — Check if an action type is in post-demotion cooldown
// =============================================================================

/**
 * Check if an action type is currently in a cooldown period after demotion.
 *
 * Looks at autonomy_audit_log for recent demotions with cooldown_until in the future.
 * Also checks the autonomy_cooldowns table as a secondary source.
 *
 * Returns true if the action type cannot be re-promoted yet.
 */
export async function isInCooldown(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string,
): Promise<boolean> {
  // Primary check: autonomy_cooldowns table
  const { data: cooldown } = await supabase
    .from('autonomy_cooldowns')
    .select('cooldown_until')
    .eq('org_id', orgId)
    .eq('action_type', actionType)
    .maybeSingle();

  if (cooldown && new Date(cooldown.cooldown_until) > new Date()) {
    return true;
  }

  // Secondary check: audit log (in case cooldowns table is out of sync)
  const { data: latestDemotion } = await supabase
    .from('autonomy_audit_log')
    .select('cooldown_until')
    .eq('org_id', orgId)
    .eq('action_type', actionType)
    .eq('change_type', 'demotion')
    .not('cooldown_until', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestDemotion?.cooldown_until && new Date(latestDemotion.cooldown_until) > new Date()) {
    return true;
  }

  return false;
}

// =============================================================================
// logAutonomyEvent — Generic audit log writer
// =============================================================================

/**
 * Write an entry to the autonomy_audit_log table.
 *
 * Used for all autonomy change events: promotion, demotion, manual_change, ceiling_set, etc.
 */
export async function logAutonomyEvent(
  supabase: SupabaseClient,
  params: LogAutonomyEventParams,
): Promise<void> {
  const { error } = await supabase.from('autonomy_audit_log').insert({
    org_id: params.orgId,
    action_type: params.actionType,
    change_type: params.changeType,
    previous_policy: params.previousPolicy ?? null,
    new_policy: params.newPolicy ?? null,
    trigger_reason: params.triggerReason ?? null,
    evidence: params.evidence ?? {},
    initiated_by: params.initiatedBy,
    cooldown_until: params.cooldownUntil ?? null,
  });

  if (error) {
    console.error(`[demotionHandler] Error writing audit log for ${params.changeType}/${params.actionType}:`, error);
  }
}

// =============================================================================
// evaluateDemotions — Batch evaluation for all recently promoted actions
// =============================================================================

/**
 * Check all recently promoted action types for demotion triggers.
 * Called daily by the autonomy evaluation cron job (via runDailyEvaluation).
 *
 * For each action that was promoted in the last 30 days:
 * 1. Get 7-day rejection rate analytics
 * 2. If rejection rate > 15% (threshold), trigger handleDemotion()
 *
 * Returns list of demoted action types.
 */
export async function evaluateDemotions(
  supabase: SupabaseClient,
  orgId: string,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS,
): Promise<DemotionResult[]> {
  const results: DemotionResult[] = [];

  // Get 7-day analytics for recently promoted actions
  const analytics7d = await getAutonomyAnalytics(supabase, orgId, 7);

  // Find actions that were recently promoted (within last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentPromotions } = await supabase
    .from('autonomy_audit_log')
    .select('action_type, new_policy, previous_policy, created_at')
    .eq('org_id', orgId)
    .eq('change_type', 'promotion')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false });

  if (!recentPromotions || recentPromotions.length === 0) return results;

  // Deduplicate — only check the most recent promotion per action type
  const latestPromotionByAction = new Map<string, typeof recentPromotions[0]>();
  for (const promotion of recentPromotions) {
    if (!latestPromotionByAction.has(promotion.action_type)) {
      latestPromotionByAction.set(promotion.action_type, promotion);
    }
  }

  for (const [actionType, promotion] of latestPromotionByAction) {
    // Skip if already in cooldown (was already demoted)
    const inCooldown = await isInCooldown(supabase, orgId, actionType);
    if (inCooldown) continue;

    const actionAnalytics = analytics7d.find((a) => a.action_type === actionType);
    if (!actionAnalytics) continue;

    const { demote, reason } = shouldDemote(actionAnalytics, thresholds);

    if (demote && reason) {
      const rejectionRate = actionAnalytics.total_count > 0
        ? (actionAnalytics.rejection_count / actionAnalytics.total_count) * 100
        : 0;

      const result = await handleDemotion(supabase, orgId, actionType, {
        reason,
        evidence: {
          rejection_count_7d: actionAnalytics.rejection_count,
          total_count_7d: actionAnalytics.total_count,
          rejection_rate_7d: Math.round(rejectionRate * 100) / 100,
          promoted_at: promotion.created_at,
          promoted_to: promotion.new_policy,
        },
        cooldownDays: thresholds.cooldownDays,
        triggeredBy: 'system',
      });

      results.push(result);
    }
  }

  return results;
}

// =============================================================================
// clearExpiredCooldowns — Cleanup for expired cooldown entries
// =============================================================================

/**
 * Check and clear expired cooldowns.
 * Called by the daily evaluation cron job.
 */
export async function clearExpiredCooldowns(
  supabase: SupabaseClient,
  orgId: string,
): Promise<void> {
  const now = new Date().toISOString();

  const { data: expired } = await supabase
    .from('autonomy_cooldowns')
    .select('id, action_type')
    .eq('org_id', orgId)
    .lte('cooldown_until', now);

  if (!expired || expired.length === 0) return;

  for (const cooldown of expired) {
    // Remove cooldown
    await supabase.from('autonomy_cooldowns').delete().eq('id', cooldown.id);

    // Audit log
    await logAutonomyEvent(supabase, {
      orgId,
      actionType: cooldown.action_type,
      changeType: 'cooldown_end',
      triggerReason: 'Cooldown period expired — action type eligible for re-promotion',
      initiatedBy: 'system',
    });

    console.log(`[demotionHandler] Cooldown expired for ${cooldown.action_type} in org ${orgId}`);
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Get current effective policy for an action type at the org level.
 */
async function getCurrentPolicy(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string,
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
 * Get the previous (less autonomous) policy in the demotion ladder.
 * auto -> suggest, suggest -> require_approval (approve stays approve).
 * Never demotes to 'disabled'.
 */
function getPreviousPolicy(current: string): string {
  const idx = POLICY_ORDER.indexOf(current as typeof POLICY_ORDER[number]);

  if (idx <= 1) {
    // 'disabled' or 'suggest' — cannot demote further in a meaningful way
    // Return 'suggest' as the floor for demotions
    return 'suggest';
  }

  return POLICY_ORDER[idx - 1];
}

/**
 * Send Slack DM to org admin about a demotion.
 */
async function sendDemotionSlackNotification(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string,
  fromPolicy: string,
  toPolicy: string,
  reason: string,
  cooldownDays: number,
  evidence?: Record<string, unknown>,
): Promise<void> {
  try {
    // Get Slack bot token for the org
    const { data: slackCreds } = await supabase
      .from('integration_credentials')
      .select('settings')
      .eq('organization_id', orgId)
      .eq('integration_type', 'slack')
      .maybeSingle();

    const botToken = (slackCreds?.settings as Record<string, unknown>)?.bot_token as string | undefined;
    if (!botToken) {
      console.log('[demotionHandler] No Slack bot token found for org, skipping notification');
      return;
    }

    // Find org admin to notify
    const { data: adminMember } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('org_id', orgId)
      .in('role', ['owner', 'admin'])
      .limit(1)
      .maybeSingle();

    if (!adminMember?.user_id) {
      console.log('[demotionHandler] No admin found for org, skipping Slack notification');
      return;
    }

    const { data: slackUser } = await supabase
      .from('user_slack_identities')
      .select('slack_user_id')
      .eq('user_id', adminMember.user_id)
      .maybeSingle();

    const adminSlackUserId = slackUser?.slack_user_id as string | undefined;
    if (!adminSlackUserId) {
      console.log('[demotionHandler] No Slack user ID found for admin, skipping notification');
      return;
    }

    const actionLabel = ACTION_LABELS[actionType] ?? actionType;
    const rejectionRate = (evidence?.rejection_rate_7d as number) ?? 0;

    const message = buildAutonomyDemotionMessage({
      orgId,
      actionType,
      actionLabel,
      fromPolicy,
      toPolicy,
      rejectionRate,
      cooldownDays,
      reason,
    });

    await sendSlackDM({
      botToken,
      slackUserId: adminSlackUserId,
      text: message.text ?? '',
      blocks: message.blocks as never[],
    });

    console.log(`[demotionHandler] Sent demotion Slack notification for ${actionType} to admin ${adminSlackUserId}`);
  } catch (err) {
    // Non-fatal: demotion still applied even if Slack notification fails
    console.error('[demotionHandler] Error sending Slack demotion notification:', err);
  }
}
