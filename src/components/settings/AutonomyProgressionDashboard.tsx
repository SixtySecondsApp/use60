/**
 * AutonomyProgressionDashboard
 *
 * Visual dashboard showing autonomy progression per action type (PRD-24, GRAD-005).
 *
 * Sections:
 *   1. Stats summary — total auto-approved, corrections, accuracy this month
 *   2. Visual timeline — autonomy progression per action type over time
 *   3. Per-action cards — current status, approval sparkline, stats, eligibility
 *   4. Promotion suggestions — pending promotions with approve/dismiss actions
 *   5. Promotion history — audit trail of past promotions/demotions with evidence
 */

import { useState } from 'react';
import {
  Shield,
  TrendingUp,
  TrendingDown,
  Clock,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Activity,
  CheckCircle2,
  XCircle,
  BarChart3,
  Check,
  X,
  AlarmClock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  useAutonomyAnalytics,
  useAutonomyAuditLog,
  usePromotionSuggestions,
  useApprovePromotion,
  useAutonomyPolicies,
  type ActionAnalytics,
  type AuditLogEntry,
} from '@/lib/hooks/useAutonomyAnalytics';
import { AutonomyActionCard } from './AutonomyActionCard';

// ============================================================================
// Constants
// ============================================================================

/** Canonical action types in display order */
const ACTION_TYPE_ORDER = [
  'crm_field_update',
  'crm_stage_change',
  'crm_note_add',
  'email_draft',
  'email_send',
  'task_create',
  'meeting_prep',
  'slack_post',
] as const;

/** Human-readable labels for action types (shared with audit log) */
const ACTION_LABELS: Record<string, string> = {
  crm_field_update: 'CRM Field Updates',
  crm_stage_change: 'Deal Stage Changes',
  crm_note_add: 'CRM Notes',
  email_draft: 'Email Drafts',
  email_send: 'Email Sending',
  task_create: 'Task Creation',
  meeting_prep: 'Meeting Prep',
  slack_post: 'Slack Posts',
  // Legacy names
  crm_contact_create: 'Contact Creation',
  send_email: 'Email Sending',
  send_slack: 'Slack Messages',
  create_task: 'Task Creation',
  enrich_contact: 'Contact Enrichment',
  draft_proposal: 'Proposal Drafts',
};

/** Visual tokens for policy levels in the timeline */
const POLICY_TIMELINE: Record<string, { color: string; y: number; label: string }> = {
  auto: { color: '#10b981', y: 0, label: 'Auto' },
  approve: { color: '#f59e0b', y: 1, label: 'Approve' },
  suggest: { color: '#3b82f6', y: 2, label: 'Suggest' },
  disabled: { color: '#6b7280', y: 3, label: 'Disabled' },
};

// ============================================================================
// Sub-components
// ============================================================================

/** Stats summary row */
function StatsSummary({
  analytics,
}: {
  analytics: ActionAnalytics[];
}) {
  const totalActions = analytics.reduce((sum, a) => sum + a.total_count, 0);
  const totalAutoApproved = analytics.reduce((sum, a) => sum + a.auto_approved_count, 0);
  const totalCorrections = analytics.reduce(
    (sum, a) => sum + a.rejection_count + a.edit_count,
    0,
  );
  const accuracy =
    totalActions > 0
      ? ((totalActions - totalCorrections) / totalActions) * 100
      : 0;

  const stats = [
    {
      label: 'Auto-Approved',
      value: totalAutoApproved,
      icon: CheckCircle2,
      iconCls: 'text-emerald-500',
    },
    {
      label: 'Corrections',
      value: totalCorrections,
      icon: XCircle,
      iconCls: 'text-red-500',
    },
    {
      label: 'Accuracy',
      value: `${accuracy.toFixed(0)}%`,
      icon: Activity,
      iconCls: 'text-blue-500',
    },
    {
      label: 'Total Actions',
      value: totalActions,
      icon: BarChart3,
      iconCls: 'text-gray-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.label} className="border border-gray-800 bg-gray-900/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn('h-4 w-4', s.iconCls)} />
                <span className="text-xs text-gray-500">{s.label}</span>
              </div>
              <div className="text-xl font-bold text-gray-100">{s.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Visual timeline showing autonomy progression per action type */
function AutonomyTimeline({
  auditLog,
}: {
  auditLog: AuditLogEntry[];
}) {
  if (auditLog.length === 0) return null;

  // Group by action_type, build timeline segments
  const grouped = new Map<string, AuditLogEntry[]>();
  for (const entry of auditLog) {
    const existing = grouped.get(entry.action_type) ?? [];
    existing.push(entry);
    grouped.set(entry.action_type, existing);
  }

  const actionTypes = Array.from(grouped.keys()).sort((a, b) => {
    const aIdx = ACTION_TYPE_ORDER.indexOf(a as (typeof ACTION_TYPE_ORDER)[number]);
    const bIdx = ACTION_TYPE_ORDER.indexOf(b as (typeof ACTION_TYPE_ORDER)[number]);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  return (
    <Card className="border border-gray-800 bg-gray-900/60">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center gap-2.5">
          <Activity className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-100">
            Autonomy Timeline
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs">
          {Object.entries(POLICY_TIMELINE).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: cfg.color }}
              />
              <span className="text-gray-500">{cfg.label}</span>
            </div>
          ))}
        </div>

        {/* Per-action timeline rows */}
        <div className="space-y-3">
          {actionTypes.map((actionType) => {
            const entries = grouped.get(actionType) ?? [];
            const label = ACTION_LABELS[actionType] ?? actionType.replace(/_/g, ' ');

            return (
              <div key={actionType} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-28 flex-shrink-0 truncate">
                  {label}
                </span>
                <div className="flex-1 flex items-center gap-1 h-6 bg-gray-800/40 rounded px-2 overflow-hidden">
                  {entries
                    .slice()
                    .reverse()
                    .map((entry, i) => {
                      const policyCfg =
                        POLICY_TIMELINE[entry.new_policy ?? 'approve'] ??
                        POLICY_TIMELINE.approve;
                      const isPromotion = entry.change_type === 'promotion';
                      const isDemotion = entry.change_type === 'demotion';

                      return (
                        <div
                          key={entry.id}
                          className="flex items-center gap-1"
                          title={`${entry.change_type}: ${entry.previous_policy ?? '?'} -> ${entry.new_policy ?? '?'} (${new Date(entry.created_at).toLocaleDateString()})`}
                        >
                          {i > 0 && (
                            <div className="w-3 h-px bg-gray-700 flex-shrink-0" />
                          )}
                          <div
                            className={cn(
                              'flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0',
                              isPromotion && 'ring-1 ring-emerald-500/40',
                              isDemotion && 'ring-1 ring-red-500/40',
                            )}
                            style={{ backgroundColor: policyCfg.color + '30' }}
                          >
                            {isPromotion ? (
                              <TrendingUp
                                className="h-2.5 w-2.5"
                                style={{ color: policyCfg.color }}
                              />
                            ) : isDemotion ? (
                              <TrendingDown
                                className="h-2.5 w-2.5"
                                style={{ color: policyCfg.color }}
                              />
                            ) : (
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: policyCfg.color }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** Promotion suggestions section */
function PromotionSuggestions() {
  const { data: promotions, isLoading } = usePromotionSuggestions();
  const approvePromotion = useApprovePromotion();

  const handleAction = async (
    promotionId: string,
    action: 'approve' | 'reject' | 'snooze',
  ) => {
    try {
      await approvePromotion.mutateAsync({ promotionId, action });
      const messages = {
        approve: 'Promotion applied successfully',
        reject: 'Promotion rejected',
        snooze: 'Snoozed for 30 days',
      };
      toast.success(messages[action]);
    } catch {
      toast.error('Failed to process promotion');
    }
  };

  if (isLoading || !promotions || promotions.length === 0) return null;

  return (
    <Card className="border border-blue-700/40 bg-blue-950/20">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center gap-2.5">
          <TrendingUp className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span className="text-sm font-medium text-blue-300">
            Promotion Suggestions
          </span>
          <Badge
            variant="outline"
            className="text-xs px-2 py-0 border font-medium bg-blue-500/15 text-blue-400 border-blue-500/30"
          >
            {promotions.length}
          </Badge>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          These action types meet the criteria for increased autonomy
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-3">
        {promotions.map((p) => {
          const label = ACTION_LABELS[p.action_type] ?? p.action_type.replace(/_/g, ' ');
          const evidence = p.evidence ?? {
            approvalCount: 0,
            rejectionCount: 0,
            approvalRate: 0,
            windowDays: 30,
          };

          return (
            <div
              key={p.id}
              className="flex items-center justify-between p-3 bg-gray-900/60 rounded-lg border border-gray-800"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-200">{label}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {evidence.approvalCount} approved, {evidence.rejectionCount} corrections in{' '}
                  {evidence.windowDays}d ({evidence.approvalRate}% rate)
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {p.current_policy}
                  </Badge>
                  <span className="text-xs text-gray-600">&rarr;</span>
                  <Badge
                    variant="outline"
                    className="text-xs px-1.5 py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  >
                    {p.proposed_policy}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <Button
                  size="sm"
                  onClick={() => handleAction(p.id, 'approve')}
                  disabled={approvePromotion.isPending}
                  className="h-7 text-xs"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(p.id, 'snooze')}
                  disabled={approvePromotion.isPending}
                  className="h-7 text-xs border-gray-700 text-gray-400"
                >
                  <AlarmClock className="h-3.5 w-3.5 mr-1" />
                  Snooze
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleAction(p.id, 'reject')}
                  disabled={approvePromotion.isPending}
                  className="h-7 text-xs text-gray-500 hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Promotion/demotion history */
function PromotionHistory({
  auditLog,
  expanded,
  onToggle,
}: {
  auditLog: AuditLogEntry[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (auditLog.length === 0) return null;

  const displayEntries = expanded ? auditLog : auditLog.slice(0, 5);

  return (
    <Card className="border border-gray-800 bg-gray-900/60">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-100">
              Autonomy History
            </span>
          </div>
          <span className="text-xs text-gray-600">
            {auditLog.length} event{auditLog.length !== 1 ? 's' : ''}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="space-y-1">
          {displayEntries.map((entry) => {
            const label = ACTION_LABELS[entry.action_type] ?? entry.action_type.replace(/_/g, ' ');
            const isPromotion = entry.change_type === 'promotion';
            const isDemotion = entry.change_type === 'demotion';

            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 py-2.5 border-b border-gray-800/60 last:border-0"
              >
                {/* Change type icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {isPromotion ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : isDemotion ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-gray-500" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-200">
                      {label}
                    </span>
                    {entry.previous_policy && entry.new_policy && (
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-xs px-1.5 py-0 text-gray-500 border-gray-700"
                        >
                          {entry.previous_policy}
                        </Badge>
                        <span className="text-xs text-gray-600">&rarr;</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs px-1.5 py-0',
                            isPromotion
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : isDemotion
                                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                : 'text-gray-400 border-gray-700',
                          )}
                        >
                          {entry.new_policy}
                        </Badge>
                      </div>
                    )}
                  </div>
                  {entry.trigger_reason && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {entry.trigger_reason}
                    </p>
                  )}
                  {entry.evidence && Object.keys(entry.evidence).length > 0 && (
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                      {(entry.evidence as Record<string, unknown>).approvalRate !== undefined && (
                        <span>
                          {String((entry.evidence as Record<string, unknown>).approvalRate)}% approval
                        </span>
                      )}
                      {(entry.evidence as Record<string, unknown>).windowDays !== undefined && (
                        <span>
                          {String((entry.evidence as Record<string, unknown>).windowDays)}d window
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Date + initiator */}
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-gray-500">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {entry.initiated_by === 'system' ? 'Auto' : 'Admin'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Expand/collapse */}
        {auditLog.length > 5 && (
          <button
            onClick={onToggle}
            className={cn(
              'w-full flex items-center justify-center',
              'rounded-md px-3 py-2 mt-2 text-xs font-medium',
              'bg-gray-800/60 hover:bg-gray-800 transition-colors',
              'text-gray-400 hover:text-gray-300',
            )}
          >
            {expanded ? (
              <>
                Show less <ChevronUp className="h-3.5 w-3.5 ml-1" />
              </>
            ) : (
              <>
                Show all {auditLog.length} events{' '}
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function AutonomyProgressionDashboard() {
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const { data: analytics, isLoading: analyticsLoading, isError, error, refetch } = useAutonomyAnalytics(30);
  const { data: auditLog } = useAutonomyAuditLog(50);
  const { data: promotions } = usePromotionSuggestions();
  const { data: policies } = useAutonomyPolicies();

  // ---- Loading state -------------------------------------------------------
  if (analyticsLoading) {
    return (
      <Card className="border border-gray-800 bg-gray-900/60">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-100">
              Agent Autonomy
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8 gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading autonomy analytics...</span>
        </CardContent>
      </Card>
    );
  }

  // ---- Error state ---------------------------------------------------------
  if (isError) {
    return (
      <Card className="border border-gray-800 bg-gray-900/60">
        <CardContent className="flex items-center gap-3 py-5 px-5">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-gray-400">
            Could not load autonomy analytics: {(error as Error)?.message ?? 'Unknown error'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs text-gray-500 hover:text-gray-300"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const analyticsData = analytics ?? [];
  const auditData = auditLog ?? [];
  const promotionSet = new Set((promotions ?? []).map((p) => p.action_type));
  const policyMap = new Map((policies ?? []).map((p) => [p.action_type, p]));

  // Build a map of analytics by action_type for ordering
  const analyticsMap = new Map(analyticsData.map((a) => [a.action_type, a]));

  // Ordered action cards: canonical order first, then any extras
  const orderedActions: ActionAnalytics[] = [];
  for (const actionType of ACTION_TYPE_ORDER) {
    const existing = analyticsMap.get(actionType);
    if (existing) {
      orderedActions.push(existing);
    }
  }
  // Add any action types not in the canonical list
  for (const a of analyticsData) {
    if (!ACTION_TYPE_ORDER.includes(a.action_type as (typeof ACTION_TYPE_ORDER)[number])) {
      orderedActions.push(a);
    }
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-2.5">
        <Shield className="h-5 w-5 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-100">
          Agent Autonomy Dashboard
        </h2>
        <span className="text-xs text-gray-600 ml-2">30-day window</span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Stats summary                                                      */}
      {/* ------------------------------------------------------------------ */}
      <StatsSummary analytics={analyticsData} />

      {/* ------------------------------------------------------------------ */}
      {/* Visual timeline                                                    */}
      {/* ------------------------------------------------------------------ */}
      <AutonomyTimeline auditLog={auditData} />

      {/* ------------------------------------------------------------------ */}
      {/* Promotion suggestions                                              */}
      {/* ------------------------------------------------------------------ */}
      <PromotionSuggestions />

      {/* ------------------------------------------------------------------ */}
      {/* Per-action cards                                                   */}
      {/* ------------------------------------------------------------------ */}
      {orderedActions.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-200">
              Action Autonomy Levels
            </span>
          </div>
          {orderedActions.map((a) => (
            <AutonomyActionCard
              key={a.action_type}
              analytics={a}
              policy={policyMap.get(a.action_type)}
              hasPendingPromotion={promotionSet.has(a.action_type)}
              sparklineData={buildSparkline(a, auditData)}
            />
          ))}
        </div>
      ) : (
        <Card className="border border-gray-800 bg-gray-900/60">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-gray-500">
              No approval data yet. Analytics will appear as the agent processes
              actions.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Promotion history                                                  */}
      {/* ------------------------------------------------------------------ */}
      <PromotionHistory
        auditLog={auditData}
        expanded={historyExpanded}
        onToggle={() => setHistoryExpanded((v) => !v)}
      />
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a simple sparkline dataset for an action type.
 *
 * If audit log entries exist for the action, we extract approval rates from
 * evidence payloads. Otherwise, we return the single current approval rate
 * which results in no sparkline being rendered (< 2 data points).
 */
function buildSparkline(
  analytics: ActionAnalytics,
  auditLog: AuditLogEntry[],
): number[] {
  const entries = auditLog
    .filter((e) => e.action_type === analytics.action_type && e.evidence)
    .reverse(); // oldest first

  const rates: number[] = [];
  for (const entry of entries) {
    const evidence = entry.evidence as Record<string, unknown> | null;
    if (evidence?.approvalRate !== undefined) {
      rates.push(Number(evidence.approvalRate));
    }
  }

  // Always include the current rate as the last point
  rates.push(Number(analytics.approval_rate ?? 0));

  return rates;
}

export default AutonomyProgressionDashboard;
