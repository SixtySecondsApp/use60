import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { RepMemory, ApprovalStat } from './types.ts';

// ---------------------------------------------------------------------------
// updateRepFromApproval
// ---------------------------------------------------------------------------

/**
 * Record an approval decision to the rep's memory.
 * Used by the Autopilot Engine to track which actions reps approve/edit/reject.
 */
export async function updateRepFromApproval(
  userId: string,
  orgId: string,
  actionType: string,
  outcome: 'approved' | 'edited' | 'rejected' | 'auto_approved',
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { data: existing } = await supabase
    .from('rep_memory')
    .select('id, approval_stats')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    // ---- Insert path ----
    const approvalStats: Record<string, ApprovalStat> = {
      [actionType]: buildStat(outcome),
    };

    await supabase.from('rep_memory').insert({
      org_id: orgId,
      user_id: userId,
      approval_stats: approvalStats,
    });
    return;
  }

  // ---- Update path — deep merge into existing JSONB ----
  const stats: Record<string, ApprovalStat> = existing.approval_stats ?? {};
  const current = stats[actionType] ?? { total: 0, approved: 0, edited: 0, rejected: 0, auto_approved: 0 };

  stats[actionType] = {
    total: current.total + 1,
    approved: current.approved + (outcome === 'approved' ? 1 : 0),
    edited: current.edited + (outcome === 'edited' ? 1 : 0),
    rejected: current.rejected + (outcome === 'rejected' ? 1 : 0),
    auto_approved: current.auto_approved + (outcome === 'auto_approved' ? 1 : 0),
  };

  await supabase
    .from('rep_memory')
    .update({ approval_stats: stats })
    .eq('id', existing.id);
}

function buildStat(outcome: 'approved' | 'edited' | 'rejected' | 'auto_approved'): ApprovalStat {
  return {
    total: 1,
    approved: outcome === 'approved' ? 1 : 0,
    edited: outcome === 'edited' ? 1 : 0,
    rejected: outcome === 'rejected' ? 1 : 0,
    auto_approved: outcome === 'auto_approved' ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// getRepPatterns
// ---------------------------------------------------------------------------

/**
 * Get rep's patterns and coaching data.
 */
export async function getRepPatterns(
  userId: string,
  orgId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<RepMemory | null> {
  const { data, error } = await supabase
    .from('rep_memory')
    .select(
      'id, org_id, user_id, approval_stats, autonomy_profile, talk_ratio_avg, discovery_depth_avg, objection_handling_score, follow_up_speed_avg_hours, win_patterns, loss_patterns, working_hours_observed, feature_usage, coaching_summary, coaching_summary_updated_at, created_at, updated_at',
    )
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[memory/reps] getRepPatterns error:', error.message);
    return null;
  }

  return data as RepMemory | null;
}

// ---------------------------------------------------------------------------
// updateRepCoachingMetrics
// ---------------------------------------------------------------------------

/**
 * Update rep coaching metrics (talk ratio, discovery depth, etc.)
 * Called after meeting analysis.
 * Uses a weighted running average: 0.7 * existing + 0.3 * new.
 */
export async function updateRepCoachingMetrics(
  userId: string,
  orgId: string,
  metrics: {
    talk_ratio?: number;
    discovery_depth?: number;
    objection_handling?: number;
    follow_up_speed_hours?: number;
  },
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { data: existing } = await supabase
    .from('rep_memory')
    .select(
      'id, talk_ratio_avg, discovery_depth_avg, objection_handling_score, follow_up_speed_avg_hours',
    )
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  function weightedAvg(current: number | null, incoming: number | undefined): number | null {
    if (incoming === undefined) return current;
    if (current === null) return incoming;
    return 0.7 * current + 0.3 * incoming;
  }

  const updates: Record<string, number | null> = {
    talk_ratio_avg: weightedAvg(existing?.talk_ratio_avg ?? null, metrics.talk_ratio),
    discovery_depth_avg: weightedAvg(existing?.discovery_depth_avg ?? null, metrics.discovery_depth),
    objection_handling_score: weightedAvg(
      existing?.objection_handling_score ?? null,
      metrics.objection_handling,
    ),
    follow_up_speed_avg_hours: weightedAvg(
      existing?.follow_up_speed_avg_hours ?? null,
      metrics.follow_up_speed_hours,
    ),
  };

  // Strip keys where neither an existing value nor an incoming value was present
  for (const key of Object.keys(updates)) {
    if (updates[key] === null) delete updates[key];
  }

  if (Object.keys(updates).length === 0) return;

  if (!existing) {
    await supabase.from('rep_memory').insert({
      org_id: orgId,
      user_id: userId,
      ...updates,
    });
  } else {
    await supabase
      .from('rep_memory')
      .update(updates)
      .eq('id', existing.id);
  }
}
