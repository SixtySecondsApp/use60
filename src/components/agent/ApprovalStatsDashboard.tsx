/**
 * ApprovalStatsDashboard
 *
 * Shows per-action-type approval statistics for the last 30 days:
 * - approved, rejected, auto-executed, avg time to approve
 * - Summary line and promotion suggestions
 */

import { useApprovalStats } from '@/lib/hooks/useApprovalStats';
import { Loader2, CheckCircle, XCircle, Zap, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApprovalStatsDashboardProps {
  orgId: string;
}

const ACTION_LABELS: Record<string, string> = {
  crm_stage_change: 'CRM Stage Change',
  crm_field_update: 'CRM Field Update',
  crm_contact_create: 'Create Contact',
  send_email: 'Send Email',
  send_slack: 'Send Slack',
  create_task: 'Create Task',
  enrich_contact: 'Enrich Contact',
  draft_proposal: 'Draft Proposal',
};

function formatTime(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export function ApprovalStatsDashboard({ orgId }: ApprovalStatsDashboardProps) {
  const { data: stats, isLoading, error } = useApprovalStats(orgId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500 dark:text-red-400 py-4">
        Failed to load approval statistics.
      </div>
    );
  }

  const totalAutoApproved = stats?.reduce((sum, s) => sum + s.total_auto, 0) ?? 0;
  const totalRejected = stats?.reduce((sum, s) => sum + s.total_rejected, 0) ?? 0;
  const totalApproved = stats?.reduce((sum, s) => sum + s.total_approved, 0) ?? 0;

  // Promotion candidates: >= 20 approvals with < 5% rejection rate
  const promotionCandidates = (stats ?? []).filter(
    (s) => s.total_approved >= 20 && (s.total_rejected / (s.total_approved || 1)) < 0.05
  );

  if (!stats || stats.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
        No approval activity in the last 30 days.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Line */}
      <div className="flex flex-wrap gap-4 p-3 bg-gray-50 dark:bg-gray-800/30 rounded-lg text-sm">
        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
          <Zap className="h-4 w-4" />
          <span><strong>{totalAutoApproved}</strong> auto-executed</span>
        </div>
        <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
          <CheckCircle className="h-4 w-4" />
          <span><strong>{totalApproved}</strong> approved</span>
        </div>
        <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400">
          <XCircle className="h-4 w-4" />
          <span><strong>{totalRejected}</strong> corrections this month</span>
        </div>
      </div>

      {/* Promotion suggestion banner */}
      {promotionCandidates.length > 0 && (
        <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <TrendingUp className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-blue-800 dark:text-blue-300">Automation opportunities</p>
            <p className="text-blue-600 dark:text-blue-400 mt-0.5">
              {promotionCandidates.map((c) => ACTION_LABELS[c.action_type] ?? c.action_type).join(', ')}{' '}
              {promotionCandidates.length === 1 ? 'has' : 'have'} been approved{' '}
              {promotionCandidates.reduce((sum, c) => sum + c.total_approved, 0)} times with no corrections. Consider switching to Auto.
            </p>
          </div>
        </div>
      )}

      {/* Stats Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="pb-2 pr-4 text-left font-medium text-gray-500 dark:text-gray-400">Action</th>
              <th className="pb-2 px-3 text-right font-medium text-gray-500 dark:text-gray-400">
                <span className="flex items-center justify-end gap-1"><Zap className="h-3 w-3" /> Auto</span>
              </th>
              <th className="pb-2 px-3 text-right font-medium text-gray-500 dark:text-gray-400">
                <span className="flex items-center justify-end gap-1"><CheckCircle className="h-3 w-3" /> Approved</span>
              </th>
              <th className="pb-2 px-3 text-right font-medium text-gray-500 dark:text-gray-400">
                <span className="flex items-center justify-end gap-1"><XCircle className="h-3 w-3" /> Rejected</span>
              </th>
              <th className="pb-2 pl-3 text-right font-medium text-gray-500 dark:text-gray-400">
                <span className="flex items-center justify-end gap-1"><Clock className="h-3 w-3" /> Avg Time</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {stats.map((row) => {
              const total = row.total_approved + row.total_rejected;
              const rejectionRate = total > 0 ? row.total_rejected / total : 0;
              return (
                <tr key={row.action_type} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                  <td className="py-2.5 pr-4 font-medium text-gray-900 dark:text-gray-100">
                    {ACTION_LABELS[row.action_type] ?? row.action_type}
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">
                    {row.total_auto}
                  </td>
                  <td className="py-2.5 px-3 text-right text-green-600 dark:text-green-400">
                    {row.total_approved}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className={cn(
                      rejectionRate > 0.1 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'
                    )}>
                      {row.total_rejected}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right text-gray-500 dark:text-gray-400">
                    {formatTime(row.avg_approval_time_seconds)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
