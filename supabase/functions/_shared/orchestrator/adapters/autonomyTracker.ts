/**
 * Autonomy Tracker — AUT-005
 *
 * Background adapter that:
 * 1. Aggregates hitl_pending_approvals into approval_statistics (daily)
 * 2. Detects promotion candidates (>= 20 approvals, < 5% rejection over 30 days)
 * 3. Sends Slack DM to org admin with Approve/Dismiss buttons
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { buildAutonomyPromotionMessage } from '../../slackBlocks.ts';
import { sendSlackDM } from '../../proactive/deliverySlack.ts';

// =============================================================================
// Types
// =============================================================================

export interface AggregateStatsResult {
  orgsProcessed: number;
  rowsUpserted: number;
}

export interface PromotionCheckResult {
  promotionsSent: number;
  candidates: Array<{ orgId: string; actionType: string }>;
}

// Action label map (matches frontend catalog)
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
// Aggregate approval_statistics from hitl_pending_approvals
// =============================================================================

/**
 * Aggregates hitl_pending_approvals rows for the given date into approval_statistics.
 * Idempotent: upserts on (org_id, user_id, action_type, period).
 */
export async function aggregateApprovalStats(
  serviceClient: SupabaseClient,
  forDate?: string,
): Promise<AggregateStatsResult> {
  const period = forDate ?? new Date().toISOString().split('T')[0];

  // Pull all resolved HITL approvals for the period
  const { data: approvals, error } = await serviceClient
    .from('hitl_pending_approvals')
    .select('org_id, user_id, action_type, status, created_at, resolved_at')
    .in('status', ['approved', 'rejected', 'auto_executed'])
    .gte('resolved_at', `${period}T00:00:00Z`)
    .lt('resolved_at', `${period}T23:59:59Z`);

  if (error) {
    console.error('[autonomyTracker] hitl_pending_approvals query error:', error);
    throw error;
  }

  if (!approvals || approvals.length === 0) {
    return { orgsProcessed: 0, rowsUpserted: 0 };
  }

  // Aggregate by (org_id, user_id, action_type)
  const statsMap = new Map<string, {
    org_id: string;
    user_id: string | null;
    action_type: string;
    approved_count: number;
    rejected_count: number;
    auto_count: number;
    approval_times: number[];
  }>();

  for (const row of approvals) {
    const key = `${row.org_id}:${row.user_id ?? 'null'}:${row.action_type ?? 'unknown'}`;
    const existing = statsMap.get(key) ?? {
      org_id: row.org_id,
      user_id: row.user_id ?? null,
      action_type: row.action_type ?? 'unknown',
      approved_count: 0,
      rejected_count: 0,
      auto_count: 0,
      approval_times: [],
    };

    if (row.status === 'approved') {
      existing.approved_count += 1;
      if (row.created_at && row.resolved_at) {
        const ms = new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime();
        if (ms > 0) existing.approval_times.push(ms / 1000);
      }
    } else if (row.status === 'rejected') {
      existing.rejected_count += 1;
    } else if (row.status === 'auto_executed') {
      existing.auto_count += 1;
    }

    statsMap.set(key, existing);
  }

  const upsertRows = Array.from(statsMap.values()).map((s) => ({
    org_id: s.org_id,
    user_id: s.user_id,
    action_type: s.action_type,
    period,
    approved_count: s.approved_count,
    rejected_count: s.rejected_count,
    auto_count: s.auto_count,
    avg_approval_time_seconds:
      s.approval_times.length > 0
        ? s.approval_times.reduce((a, b) => a + b, 0) / s.approval_times.length
        : null,
  }));

  const { error: upsertError } = await serviceClient
    .from('approval_statistics')
    .upsert(upsertRows, { onConflict: 'org_id,user_id,action_type,period', ignoreDuplicates: false });

  if (upsertError) {
    console.error('[autonomyTracker] upsert error:', upsertError);
    throw upsertError;
  }

  const orgIds = [...new Set(upsertRows.map((r) => r.org_id))];
  return { orgsProcessed: orgIds.length, rowsUpserted: upsertRows.length };
}

// =============================================================================
// Check for promotion candidates and send Slack DMs
// =============================================================================

/**
 * Checks approval_statistics for the last 30 days.
 * For any action_type with >= 20 approvals and < 5% rejection, sends a Slack DM
 * to the org admin (if not already promoted).
 */
export async function checkAndNotifyPromotionCandidates(
  serviceClient: SupabaseClient,
): Promise<PromotionCheckResult> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split('T')[0];

  // Fetch aggregate stats for last 30 days across all orgs
  const { data: stats, error } = await serviceClient
    .from('approval_statistics')
    .select('org_id, action_type, approved_count, rejected_count, auto_count')
    .gte('period', sinceStr);

  if (error) {
    console.error('[autonomyTracker] stats query error:', error);
    throw error;
  }

  if (!stats || stats.length === 0) {
    return { promotionsSent: 0, candidates: [] };
  }

  // Aggregate totals by (org_id, action_type)
  const totals = new Map<string, {
    org_id: string;
    action_type: string;
    total_approved: number;
    total_rejected: number;
    total_auto: number;
  }>();

  for (const row of stats) {
    const key = `${row.org_id}:${row.action_type}`;
    const existing = totals.get(key) ?? {
      org_id: row.org_id,
      action_type: row.action_type,
      total_approved: 0,
      total_rejected: 0,
      total_auto: 0,
    };
    existing.total_approved += row.approved_count ?? 0;
    existing.total_rejected += row.rejected_count ?? 0;
    existing.total_auto += row.auto_count ?? 0;
    totals.set(key, existing);
  }

  const candidates: Array<{ orgId: string; actionType: string }> = [];
  let promotionsSent = 0;

  for (const s of totals.values()) {
    const total = s.total_approved + s.total_rejected;
    if (total < 20) continue;

    const rejectionRate = s.total_rejected / total;
    if (rejectionRate >= 0.05) continue;

    // Check if already promoted (policy is already 'auto')
    const { data: existingPolicy } = await serviceClient
      .from('autonomy_policies')
      .select('policy')
      .eq('org_id', s.org_id)
      .eq('action_type', s.action_type)
      .is('user_id', null)
      .maybeSingle();

    if (existingPolicy?.policy === 'auto') continue;

    // Check if we already sent a promotion suggestion recently (within 7 days)
    // We use a simple check: look for a recent 'autonomy_promotion_sent' entry in a config table
    // For simplicity, we store a flag in agent_config_org_overrides
    const promotionKey = `autonomy.promotion_sent.${s.action_type}`;
    const { data: alreadySent } = await serviceClient
      .from('agent_config_org_overrides')
      .select('config_value, updated_at')
      .eq('org_id', s.org_id)
      .eq('agent_type', 'global')
      .eq('config_key', promotionKey)
      .maybeSingle();

    if (alreadySent) {
      const sentAt = new Date(alreadySent.updated_at as string);
      const daysSince = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) continue;
    }

    candidates.push({ orgId: s.org_id, actionType: s.action_type });

    // Fetch org admin's Slack credentials
    const { data: slackCreds } = await serviceClient
      .from('integration_credentials')
      .select('settings')
      .eq('organization_id', s.org_id)
      .eq('integration_type', 'slack')
      .maybeSingle();

    const botToken = (slackCreds?.settings as Record<string, unknown>)?.bot_token as string | undefined;
    if (!botToken) continue;

    // Get org admin user_id and Slack user ID
    const { data: adminMember } = await serviceClient
      .from('organization_members')
      .select('user_id')
      .eq('org_id', s.org_id)
      .in('role', ['owner', 'admin'])
      .limit(1)
      .maybeSingle();

    if (!adminMember?.user_id) continue;

    const { data: slackUser } = await serviceClient
      .from('user_slack_identities')
      .select('slack_user_id')
      .eq('user_id', adminMember.user_id)
      .maybeSingle();

    const adminSlackUserId = slackUser?.slack_user_id as string | undefined;
    if (!adminSlackUserId) continue;

    const actionLabel = ACTION_LABELS[s.action_type] ?? s.action_type;
    const message = buildAutonomyPromotionMessage({
      orgId: s.org_id,
      actionType: s.action_type,
      actionLabel,
      approvedCount: s.total_approved,
      totalCount: total,
      rejectionRate,
      adminSlackUserId,
    });

    try {
      await sendSlackDM({
        botToken,
        slackUserId: adminSlackUserId,
        text: message.text ?? '',
        blocks: message.blocks as never[],
      });
      promotionsSent += 1;

      // Mark as sent
      await serviceClient.from('agent_config_org_overrides').upsert(
        {
          org_id: s.org_id,
          agent_type: 'global',
          config_key: promotionKey,
          config_value: { sent_at: new Date().toISOString() },
        },
        { onConflict: 'org_id,agent_type,config_key' }
      );
    } catch (err) {
      console.error('[autonomyTracker] Slack DM error:', err);
    }
  }

  return { promotionsSent, candidates };
}
