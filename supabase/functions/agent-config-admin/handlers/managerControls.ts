// supabase/functions/agent-config-admin/handlers/managerControls.ts
// Backend handlers for manager autonomy controls (PRD-24, GRAD-006)

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutonomyLevel = 'suggest' | 'approve' | 'auto' | 'no_limit';

interface CeilingRow {
  action_type: string;
  max_ceiling: AutonomyLevel;
  auto_promotion_eligible: boolean;
  updated_at: string;
}

interface RepAutonomyRow {
  user_id: string;
  email: string;
  full_name: string | null;
  action_type: string;
  policy: string;
}

interface TeamAnalyticsRow {
  action_type: string;
  total_actions: number;
  approved: number;
  rejected: number;
  auto_approved: number;
  approval_rate: number;
  promotions: number;
  demotions: number;
}

// ---------------------------------------------------------------------------
// get_autonomy_ceilings — returns current ceilings per action type for the org
// ---------------------------------------------------------------------------

export async function handleGetAutonomyCeilings(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<{ ceilings: CeilingRow[] }> {
  const { data, error } = await serviceClient
    .from('agent_config_org_overrides')
    .select('config_key, config_value, updated_at')
    .eq('org_id', orgId)
    .eq('agent_type', 'global')
    .or('config_key.like.autonomy.ceiling.%,config_key.like.autonomy.eligible.%');

  if (error) {
    console.error('[managerControls] get_autonomy_ceilings error:', error);
    throw new Error('Failed to fetch autonomy ceilings');
  }

  // Group by action type
  const ceilingMap = new Map<string, Partial<CeilingRow>>();

  for (const row of data ?? []) {
    const key = row.config_key as string;
    const value = row.config_value;

    if (key.startsWith('autonomy.ceiling.')) {
      const actionType = key.replace('autonomy.ceiling.', '');
      const existing = ceilingMap.get(actionType) ?? { action_type: actionType };
      existing.max_ceiling = value as AutonomyLevel;
      existing.updated_at = row.updated_at;
      ceilingMap.set(actionType, existing);
    } else if (key.startsWith('autonomy.eligible.')) {
      const actionType = key.replace('autonomy.eligible.', '');
      const existing = ceilingMap.get(actionType) ?? { action_type: actionType };
      existing.auto_promotion_eligible = value === true || value === 'true';
      existing.updated_at = row.updated_at;
      ceilingMap.set(actionType, existing);
    }
  }

  const ceilings: CeilingRow[] = Array.from(ceilingMap.values()).map((c) => ({
    action_type: c.action_type!,
    max_ceiling: c.max_ceiling ?? 'no_limit',
    auto_promotion_eligible: c.auto_promotion_eligible ?? true,
    updated_at: c.updated_at ?? new Date().toISOString(),
  }));

  return { ceilings };
}

// ---------------------------------------------------------------------------
// set_autonomy_ceiling — sets ceiling for a specific action type
// ---------------------------------------------------------------------------

export async function handleSetAutonomyCeiling(
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
  params: { action_type: string; max_ceiling?: AutonomyLevel; auto_promotion_eligible?: boolean },
): Promise<{ success: boolean }> {
  const { action_type, max_ceiling, auto_promotion_eligible } = params;

  if (!action_type) {
    throw new Error('action_type is required');
  }

  const now = new Date().toISOString();
  const upsertRows: Array<{
    org_id: string;
    agent_type: string;
    config_key: string;
    config_value: unknown;
    updated_by: string;
    updated_at: string;
  }> = [];

  if (max_ceiling !== undefined) {
    const validCeilings: AutonomyLevel[] = ['suggest', 'approve', 'auto', 'no_limit'];
    if (!validCeilings.includes(max_ceiling)) {
      throw new Error(`Invalid max_ceiling: ${max_ceiling}. Must be one of: ${validCeilings.join(', ')}`);
    }
    upsertRows.push({
      org_id: orgId,
      agent_type: 'global',
      config_key: `autonomy.ceiling.${action_type}`,
      config_value: max_ceiling,
      updated_by: userId,
      updated_at: now,
    });
  }

  if (auto_promotion_eligible !== undefined) {
    upsertRows.push({
      org_id: orgId,
      agent_type: 'global',
      config_key: `autonomy.eligible.${action_type}`,
      config_value: auto_promotion_eligible,
      updated_by: userId,
      updated_at: now,
    });
  }

  if (upsertRows.length === 0) {
    throw new Error('At least one of max_ceiling or auto_promotion_eligible is required');
  }

  const { error } = await serviceClient
    .from('agent_config_org_overrides')
    .upsert(upsertRows, { onConflict: 'org_id,agent_type,config_key' });

  if (error) {
    console.error('[managerControls] set_autonomy_ceiling error:', error);
    throw new Error('Failed to set autonomy ceiling');
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// get_rep_autonomy — returns per-rep autonomy levels for the org
// ---------------------------------------------------------------------------

export async function handleGetRepAutonomy(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<{ reps: RepAutonomyRow[] }> {
  // Get org members
  const { data: members, error: membersError } = await serviceClient
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId);

  if (membersError) {
    console.error('[managerControls] get_rep_autonomy members error:', membersError);
    throw new Error('Failed to fetch org members');
  }

  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) {
    return { reps: [] };
  }

  // Get profiles for display names
  const { data: profiles } = await serviceClient
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds);

  const profileMap = new Map<string, { email: string; full_name: string | null }>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, { email: p.email ?? '', full_name: p.full_name ?? null });
  }

  // Get per-user autonomy overrides from agent_config_user_overrides
  const { data: overrides, error: overridesError } = await serviceClient
    .from('agent_config_user_overrides')
    .select('user_id, config_key, config_value')
    .eq('org_id', orgId)
    .eq('agent_type', 'global')
    .like('config_key', 'autonomy.policy.%')
    .in('user_id', userIds);

  if (overridesError) {
    console.error('[managerControls] get_rep_autonomy overrides error:', overridesError);
    throw new Error('Failed to fetch rep autonomy overrides');
  }

  const reps: RepAutonomyRow[] = (overrides ?? []).map((o) => {
    const profile = profileMap.get(o.user_id);
    const actionType = (o.config_key as string).replace('autonomy.policy.', '');
    return {
      user_id: o.user_id,
      email: profile?.email ?? '',
      full_name: profile?.full_name ?? null,
      action_type: actionType,
      policy: String(o.config_value ?? 'suggest'),
    };
  });

  // Also include members who have no overrides (with default info)
  const usersWithOverrides = new Set(reps.map((r) => r.user_id));
  for (const uid of userIds) {
    if (!usersWithOverrides.has(uid)) {
      const profile = profileMap.get(uid);
      reps.push({
        user_id: uid,
        email: profile?.email ?? '',
        full_name: profile?.full_name ?? null,
        action_type: '_none',
        policy: 'default',
      });
    }
  }

  return { reps };
}

// ---------------------------------------------------------------------------
// set_rep_autonomy_override — override a specific rep's autonomy level
// ---------------------------------------------------------------------------

export async function handleSetRepAutonomyOverride(
  serviceClient: SupabaseClient,
  orgId: string,
  adminUserId: string,
  params: { user_id: string; action_type: string; policy: string },
): Promise<{ success: boolean }> {
  const { user_id, action_type, policy } = params;

  if (!user_id || !action_type || !policy) {
    throw new Error('user_id, action_type, and policy are required');
  }

  const validPolicies = ['suggest', 'approve', 'auto', 'disabled'];
  if (!validPolicies.includes(policy)) {
    throw new Error(`Invalid policy: ${policy}. Must be one of: ${validPolicies.join(', ')}`);
  }

  // Verify target user is a member of this org
  const { data: membership } = await serviceClient
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('user_id', user_id)
    .maybeSingle();

  if (!membership) {
    throw new Error('Target user is not a member of this organization');
  }

  // If policy is 'default', remove the override instead
  if (policy === 'default') {
    const { error } = await serviceClient
      .from('agent_config_user_overrides')
      .delete()
      .eq('org_id', orgId)
      .eq('agent_type', 'global')
      .eq('config_key', `autonomy.policy.${action_type}`)
      .eq('user_id', user_id);

    if (error) {
      console.error('[managerControls] remove rep override error:', error);
      throw new Error('Failed to remove rep autonomy override');
    }

    return { success: true };
  }

  const { error } = await serviceClient
    .from('agent_config_user_overrides')
    .upsert(
      {
        org_id: orgId,
        agent_type: 'global',
        config_key: `autonomy.policy.${action_type}`,
        config_value: policy,
        user_id: user_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,agent_type,config_key,user_id' },
    );

  if (error) {
    console.error('[managerControls] set_rep_autonomy_override error:', error);
    throw new Error('Failed to set rep autonomy override');
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// get_team_autonomy_analytics — org-wide analytics: approval rates, velocity
// ---------------------------------------------------------------------------

export async function handleGetTeamAutonomyAnalytics(
  serviceClient: SupabaseClient,
  orgId: string,
  windowDays: number = 30,
): Promise<{ analytics: TeamAnalyticsRow[]; summary: Record<string, unknown> }> {
  // Try the RPC if available, otherwise fall back to direct query
  const { data: rpcData, error: rpcError } = await serviceClient.rpc('get_team_autonomy_stats', {
    p_org_id: orgId,
    p_window_days: windowDays,
  });

  if (!rpcError && rpcData) {
    // RPC succeeded — shape the response
    const stats = rpcData as Record<string, unknown>;
    return {
      analytics: (stats.per_action as TeamAnalyticsRow[]) ?? [],
      summary: {
        total_actions: stats.total_actions ?? 0,
        total_approved: stats.total_approved ?? 0,
        total_rejected: stats.total_rejected ?? 0,
        total_auto: stats.total_auto ?? 0,
        approval_rate: stats.approval_rate ?? 0,
        promotions_count: stats.promotions_count ?? 0,
        demotions_count: stats.demotions_count ?? 0,
        window_days: windowDays,
      },
    };
  }

  // Fallback: aggregate from agent_config_org_overrides autonomy keys
  console.warn('[managerControls] get_team_autonomy_analytics: RPC not available, returning empty analytics');
  return {
    analytics: [],
    summary: {
      total_actions: 0,
      total_approved: 0,
      total_rejected: 0,
      total_auto: 0,
      approval_rate: 0,
      promotions_count: 0,
      demotions_count: 0,
      window_days: windowDays,
    },
  };
}
