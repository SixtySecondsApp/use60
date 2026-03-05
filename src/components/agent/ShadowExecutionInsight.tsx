/**
 * ShadowExecutionInsight — AE2-013: Shadow execution analytics & promotion evidence
 *
 * Two display modes:
 *   1. `banner` — single-line promotion nudge for AutonomySettingsPage
 *      "If you'd been on auto for follow-ups last month, 94% would have been sent unchanged"
 *   2. `breakdown` — per-action-type table for AutopilotDashboard
 *
 * Promotion suggestion only surfaces when:
 *   - shadow match rate > 90% (0.9)
 *   - total shadow executions > 10
 *
 * Clicking "See evidence" expands the last 5 shadow comparisons.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Eye,
  CheckCircle,
  XCircle,
  Pencil,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useShadowExecutionStatsAll,
  useShadowComparisons,
  type ShadowExecutionStatRow,
  type ShadowComparison,
} from '@/lib/hooks/useShadowExecutionStats';

// ============================================================================
// Constants
// ============================================================================

/** Minimum match rate (0–1) to suggest promotion */
const PROMOTION_THRESHOLD_RATE = 0.9;

/** Minimum total shadow executions to suggest promotion */
const PROMOTION_THRESHOLD_COUNT = 10;

const ACTION_LABELS: Record<string, string> = {
  'crm.note_add': 'Meeting notes',
  'crm.activity_log': 'Activity logging',
  'crm.contact_enrich': 'Contact enrichment',
  'crm.next_steps_update': 'Next steps',
  'crm.deal_field_update': 'Deal field updates',
  'crm.deal_stage_change': 'Deal stage changes',
  'crm.deal_amount_change': 'Deal amount changes',
  'crm.deal_close_date_change': 'Close date changes',
  'email.draft_save': 'Email drafts',
  'email.send': 'Email sending',
  'email.follow_up_send': 'Follow-up emails',
  'email.check_in_send': 'Check-in emails',
  'task.create': 'Task creation',
  'task.assign': 'Task assignment',
  'calendar.create_event': 'Meeting scheduling',
  'calendar.reschedule': 'Meeting rescheduling',
  'analysis.risk_assessment': 'Risk assessment',
  // Legacy keys from approval_statistics
  crm_stage_change: 'CRM Stage Change',
  crm_field_update: 'CRM Field Update',
  crm_contact_create: 'Create Contact',
  send_email: 'Send Email',
  send_slack: 'Send Slack',
  create_task: 'Create Task',
  enrich_contact: 'Enrich Contact',
  draft_proposal: 'Draft Proposal',
};

const ALL_ACTION_TYPES = Object.keys(ACTION_LABELS);

function getLabel(actionType: string): string {
  return ACTION_LABELS[actionType] ?? actionType.replace(/[._]/g, ' ');
}

function isPromotionCandidate(stat: ShadowExecutionStatRow): boolean {
  return (
    stat.match_rate >= PROMOTION_THRESHOLD_RATE &&
    stat.total > PROMOTION_THRESHOLD_COUNT
  );
}

// ============================================================================
// Evidence row — single shadow comparison
// ============================================================================

function ComparisonRow({ comparison }: { comparison: ShadowComparison }) {
  const date = new Date(comparison.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const time = new Date(comparison.created_at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800/60 last:border-0">
      {/* Match indicator */}
      <div className="flex-shrink-0">
        {comparison.would_have_matched ? (
          <CheckCircle className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-400" />
        )}
      </div>

      {/* Decision + details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {comparison.user_decision === 'approved' && 'Approved unchanged'}
            {comparison.user_decision === 'approved_edited' && 'Approved with edits'}
            {comparison.user_decision === 'rejected' && 'Rejected'}
            {!comparison.user_decision && 'Pending'}
          </span>
          {comparison.user_decision === 'approved_edited' && comparison.edit_distance != null && (
            <span className="flex items-center gap-0.5 text-xs text-gray-400">
              <Pencil className="h-3 w-3" />
              {comparison.edit_distance}% edited
            </span>
          )}
        </div>
      </div>

      {/* Timestamp */}
      <div className="flex-shrink-0 text-right">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {date} {time}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Evidence detail — expandable comparison list for a single action type
// ============================================================================

function EvidenceDetail({ actionType }: { actionType: string }) {
  const { data: comparisons, isLoading } = useShadowComparisons(
    actionType,
    5,
    true,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!comparisons || comparisons.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 py-3">
        No shadow comparisons recorded yet.
      </p>
    );
  }

  return (
    <div className="mt-2 bg-gray-50 dark:bg-gray-800/30 rounded-lg p-3">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        Last {comparisons.length} shadow comparison{comparisons.length !== 1 ? 's' : ''}
      </p>
      {comparisons.map((c) => (
        <ComparisonRow key={c.id} comparison={c} />
      ))}
    </div>
  );
}

// ============================================================================
// Stat row for breakdown mode — one per action type
// ============================================================================

function StatRow({ stat }: { stat: ShadowExecutionStatRow }) {
  const [expanded, setExpanded] = useState(false);
  const matchPct = Math.round(stat.match_rate * 100);
  const qualifies = isPromotionCandidate(stat);

  return (
    <div className="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
      <div className="flex items-center gap-3 py-3">
        {/* Action label */}
        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100 min-w-0 truncate">
          {getLabel(stat.action_type)}
        </span>

        {/* Match rate badge */}
        <Badge
          variant={qualifies ? 'success' : 'secondary'}
          className="flex-shrink-0 text-xs font-semibold"
        >
          {matchPct}% match
        </Badge>

        {/* Count */}
        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 w-16 text-right">
          {stat.total} shadow{stat.total !== 1 ? 's' : ''}
        </span>

        {/* See evidence button */}
        <Button
          variant="ghost"
          size="sm"
          className="flex-shrink-0 h-7 px-2 text-xs gap-1"
          onClick={() => setExpanded(!expanded)}
        >
          <Eye className="h-3 w-3" />
          {expanded ? 'Hide' : 'Evidence'}
          {expanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Expandable evidence panel */}
      {expanded && <EvidenceDetail actionType={stat.action_type} />}
    </div>
  );
}

// ============================================================================
// Banner mode — single promotion nudge
// ============================================================================

interface BannerProps {
  className?: string;
}

function ShadowInsightBanner({ className }: BannerProps) {
  const { data: stats, isLoading } = useShadowExecutionStatsAll(ALL_ACTION_TYPES);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  if (isLoading || !stats || stats.length === 0) return null;

  // Only show promotion-eligible actions
  const candidates = stats.filter(isPromotionCandidate);
  if (candidates.length === 0) return null;

  // Pick the best candidate for the headline
  const best = candidates.reduce((a, b) =>
    a.match_rate > b.match_rate ? a : b,
  );
  const bestPct = Math.round(best.match_rate * 100);
  const bestLabel = getLabel(best.action_type).toLowerCase();

  return (
    <Card
      className={cn(
        'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20',
        className,
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Shadow execution insight
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-0.5">
              If you&apos;d been on auto for {bestLabel} last month, {bestPct}% would have been
              sent unchanged.
              {candidates.length > 1 && (
                <span>
                  {' '}
                  {candidates.length - 1} other action{candidates.length - 1 !== 1 ? 's' : ''} also
                  qualify.
                </span>
              )}
            </p>

            {/* See evidence toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 px-2 text-xs gap-1 text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200"
              onClick={() =>
                setExpandedAction(
                  expandedAction === best.action_type ? null : best.action_type,
                )
              }
            >
              <Eye className="h-3 w-3" />
              {expandedAction === best.action_type ? 'Hide evidence' : 'See evidence'}
              {expandedAction === best.action_type ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>

            {expandedAction && <EvidenceDetail actionType={expandedAction} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Breakdown mode — per-action-type table
// ============================================================================

interface BreakdownProps {
  className?: string;
}

function ShadowInsightBreakdown({ className }: BreakdownProps) {
  const { data: stats, isLoading } = useShadowExecutionStatsAll(ALL_ACTION_TYPES);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!stats || stats.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
        No shadow execution data yet. Shadow tracking begins when actions are
        executed at the approve tier.
      </div>
    );
  }

  // Sort: promotion candidates first, then by match rate descending
  const sorted = [...stats].sort((a, b) => {
    const aCand = isPromotionCandidate(a) ? 1 : 0;
    const bCand = isPromotionCandidate(b) ? 1 : 0;
    if (aCand !== bCand) return bCand - aCand;
    return b.match_rate - a.match_rate;
  });

  const candidateCount = sorted.filter(isPromotionCandidate).length;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Summary line */}
      {candidateCount > 0 && (
        <div className="flex items-center gap-2 px-1">
          <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm text-blue-700 dark:text-blue-300">
            {candidateCount} action{candidateCount !== 1 ? 's' : ''} eligible for auto-promotion
            based on shadow evidence
          </span>
        </div>
      )}

      {/* Stat rows */}
      <div className="bg-white dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-800 px-4">
        {sorted.map((stat) => (
          <StatRow key={stat.action_type} stat={stat} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main export — unified component with mode prop
// ============================================================================

export interface ShadowExecutionInsightProps {
  /** Display mode: `banner` for settings page nudge, `breakdown` for dashboard table */
  mode: 'banner' | 'breakdown';
  className?: string;
}

export function ShadowExecutionInsight({
  mode,
  className,
}: ShadowExecutionInsightProps) {
  if (mode === 'banner') {
    return <ShadowInsightBanner className={className} />;
  }
  return <ShadowInsightBreakdown className={className} />;
}

export default ShadowExecutionInsight;
