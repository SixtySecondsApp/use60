// supabase/functions/_shared/orchestrator/demotionHandler.ts
// Demotion handling and safety net for graduated autonomy (PRD-24, GRAD-004)

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getAutonomyAnalytics, shouldDemote, DEFAULT_THRESHOLDS } from './autonomyAnalytics.ts';
import type { PromotionThresholds } from './autonomyAnalytics.ts';

/**
 * Check all promoted action types for demotion triggers.
 * Called daily by the autonomy evaluation cron job.
 */
export async function evaluateDemotions(
  supabase: SupabaseClient,
  orgId: string,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS
): Promise<void> {
  // Get 7-day analytics for recently promoted actions
  const analytics7d = await getAutonomyAnalytics(supabase, orgId, 7);

  // Find actions that were recently promoted (check audit log)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentPromotions } = await supabase
    .from('autonomy_audit_log')
    .select('action_type, new_policy, previous_policy, created_at')
    .eq('org_id', orgId)
    .eq('change_type', 'promotion')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false });

  if (!recentPromotions || recentPromotions.length === 0) return;

  for (const promotion of recentPromotions) {
    const actionAnalytics = analytics7d.find((a) => a.action_type === promotion.action_type);
    if (!actionAnalytics) continue;

    const { demote, reason } = shouldDemote(actionAnalytics, thresholds);

    if (demote && reason) {
      await applyDemotion(supabase, orgId, promotion.action_type, promotion.new_policy, promotion.previous_policy, reason, thresholds.cooldownDays);
    }
  }
}

/**
 * Apply a demotion — revert action type to previous policy.
 */
async function applyDemotion(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string,
  currentPolicy: string,
  previousPolicy: string,
  reason: string,
  cooldownDays: number
): Promise<void> {
  console.log(`[demotionHandler] Demoting ${actionType} from ${currentPolicy} to ${previousPolicy}: ${reason}`);

  // Revert the policy
  await supabase.from('agent_config_org_overrides').upsert({
    org_id: orgId,
    agent_type: 'global',
    config_key: `autonomy.${actionType}`,
    config_value: JSON.stringify(previousPolicy),
  }, { onConflict: 'org_id,agent_type,config_key' });

  // Set cooldown
  const cooldownUntil = new Date(Date.now() + cooldownDays * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('autonomy_cooldowns').upsert({
    org_id: orgId,
    action_type: actionType,
    cooldown_until: cooldownUntil,
    demoted_at: new Date().toISOString(),
    reason,
  }, { onConflict: 'org_id,action_type' });

  // Audit log
  await supabase.from('autonomy_audit_log').insert({
    org_id: orgId,
    action_type: actionType,
    change_type: 'demotion',
    previous_policy: currentPolicy,
    new_policy: previousPolicy,
    trigger_reason: reason,
    evidence: { cooldown_until: cooldownUntil, cooldown_days: cooldownDays },
    initiated_by: 'system',
  });
}

/**
 * Check and clear expired cooldowns.
 */
export async function clearExpiredCooldowns(
  supabase: SupabaseClient,
  orgId: string
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
    await supabase.from('autonomy_audit_log').insert({
      org_id: orgId,
      action_type: cooldown.action_type,
      change_type: 'cooldown_end',
      trigger_reason: 'Cooldown period expired',
      initiated_by: 'system',
    });
  }
}
