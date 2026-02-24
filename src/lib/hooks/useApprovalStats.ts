/**
 * useApprovalStats
 *
 * Fetches approval statistics from the approval_statistics table
 * and hitl_pending_approvals for the current org.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

export interface ApprovalStatRow {
  action_type: string;
  approved_count: number;
  rejected_count: number;
  auto_count: number;
  avg_approval_time_seconds: number | null;
  period: string;
}

export interface ApprovalStatSummary {
  action_type: string;
  total_approved: number;
  total_rejected: number;
  total_auto: number;
  approval_rate: number; // 0–1
  avg_approval_time_seconds: number | null;
}

async function fetchApprovalStats(orgId: string): Promise<ApprovalStatSummary[]> {
  // Get last 30 days from approval_statistics
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('approval_statistics')
    .select('action_type, approved_count, rejected_count, auto_count, avg_approval_time_seconds, period')
    .eq('org_id', orgId)
    .gte('period', sinceStr)
    .order('period', { ascending: false });

  if (error) throw error;

  // Aggregate by action_type
  const map = new Map<string, ApprovalStatSummary>();

  for (const row of data ?? []) {
    const existing = map.get(row.action_type) ?? {
      action_type: row.action_type,
      total_approved: 0,
      total_rejected: 0,
      total_auto: 0,
      approval_rate: 0,
      avg_approval_time_seconds: null,
    };

    existing.total_approved += row.approved_count ?? 0;
    existing.total_rejected += row.rejected_count ?? 0;
    existing.total_auto += row.auto_count ?? 0;

    if (row.avg_approval_time_seconds != null) {
      existing.avg_approval_time_seconds =
        existing.avg_approval_time_seconds == null
          ? row.avg_approval_time_seconds
          : (existing.avg_approval_time_seconds + row.avg_approval_time_seconds) / 2;
    }

    map.set(row.action_type, existing);
  }

  // Compute approval rate and return sorted
  return Array.from(map.values()).map((s) => {
    const total = s.total_approved + s.total_rejected;
    return {
      ...s,
      approval_rate: total > 0 ? s.total_approved / total : 0,
    };
  });
}

export function useApprovalStats(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['approval-stats', orgId],
    queryFn: () => fetchApprovalStats(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}
