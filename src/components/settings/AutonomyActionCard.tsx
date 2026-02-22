/**
 * AutonomyActionCard
 *
 * Individual card component for a single action type in the autonomy dashboard.
 * Shows:
 *  - Action type name and description
 *  - Current policy badge (require_approval / suggest / auto) with color coding
 *  - Approval rate mini sparkline (SVG)
 *  - Stats: approved / rejected / edited counts for 30-day window
 *  - Promotion eligibility indicator when close to threshold
 *
 * PRD-24, GRAD-005
 */

import {
  CheckCircle2,
  XCircle,
  Edit3,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Ban,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ActionAnalytics, AutonomyPolicy } from '@/lib/hooks/useAutonomyAnalytics';

// ============================================================================
// Types
// ============================================================================

export interface AutonomyActionCardProps {
  /** Analytics data for this action type */
  analytics: ActionAnalytics;
  /** Current org-wide policy for this action type (if set) */
  policy?: AutonomyPolicy;
  /** Whether this action has a pending promotion in the queue */
  hasPendingPromotion?: boolean;
  /** Approval rate threshold for promotion eligibility (default 90) */
  promotionThreshold?: number;
  /** Historical approval rates for sparkline (last N windows, oldest first) */
  sparklineData?: number[];
}

// ============================================================================
// Constants
// ============================================================================

/** Human-readable labels and descriptions for each action type */
const ACTION_META: Record<string, { label: string; description: string; icon: React.ElementType }> = {
  crm_field_update: {
    label: 'CRM Field Updates',
    description: 'Auto-update deal and contact fields from meeting insights',
    icon: Edit3,
  },
  crm_stage_change: {
    label: 'Deal Stage Changes',
    description: 'Move deals between pipeline stages based on signals',
    icon: TrendingUp,
  },
  crm_note_add: {
    label: 'CRM Notes',
    description: 'Add meeting summaries and context notes to records',
    icon: Edit3,
  },
  email_draft: {
    label: 'Email Drafts',
    description: 'Draft follow-up emails after meetings for review',
    icon: Edit3,
  },
  email_send: {
    label: 'Email Sending',
    description: 'Send emails directly without manual review',
    icon: Zap,
  },
  task_create: {
    label: 'Task Creation',
    description: 'Create follow-up tasks from meeting action items',
    icon: CheckCircle2,
  },
  meeting_prep: {
    label: 'Meeting Prep',
    description: 'Generate pre-meeting briefs and talking points',
    icon: Eye,
  },
  slack_post: {
    label: 'Slack Posts',
    description: 'Post pipeline updates and alerts to Slack channels',
    icon: Zap,
  },
  // Legacy action types (from earlier migration) - map for backwards compat
  crm_contact_create: {
    label: 'Contact Creation',
    description: 'Create new contacts from meeting data',
    icon: CheckCircle2,
  },
  send_email: {
    label: 'Email Sending',
    description: 'Send emails directly without manual review',
    icon: Zap,
  },
  send_slack: {
    label: 'Slack Messages',
    description: 'Post messages to Slack channels',
    icon: Zap,
  },
  create_task: {
    label: 'Task Creation',
    description: 'Create follow-up tasks automatically',
    icon: CheckCircle2,
  },
  enrich_contact: {
    label: 'Contact Enrichment',
    description: 'Enrich contact data from external sources',
    icon: TrendingUp,
  },
  draft_proposal: {
    label: 'Proposal Drafts',
    description: 'Draft proposals and documents for review',
    icon: Edit3,
  },
};

/** Badge styling per policy level */
const POLICY_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; badgeCls: string; dotCls: string }
> = {
  auto: {
    label: 'Auto',
    icon: ShieldCheck,
    badgeCls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dotCls: 'bg-emerald-500',
  },
  approve: {
    label: 'Approval Required',
    icon: ShieldAlert,
    badgeCls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    dotCls: 'bg-amber-500',
  },
  suggest: {
    label: 'Suggest Only',
    icon: Eye,
    badgeCls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    dotCls: 'bg-blue-500',
  },
  disabled: {
    label: 'Disabled',
    icon: Ban,
    badgeCls: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    dotCls: 'bg-gray-500',
  },
};

const DEFAULT_PROMOTION_THRESHOLD = 90;

// ============================================================================
// Sub-components
// ============================================================================

/** Tiny SVG sparkline for approval rate trend */
function ApprovalSparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  if (data.length < 2) return null;

  const width = 80;
  const height = 24;
  const padding = 2;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const min = Math.min(...data, 0);
  const max = Math.max(...data, 100);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * innerW;
    const y = padding + innerH - ((v - min) / range) * innerH;
    return `${x},${y}`;
  });

  const lastValue = data[data.length - 1];
  const strokeColor =
    lastValue >= 90
      ? '#10b981' // emerald-500
      : lastValue >= 70
        ? '#f59e0b' // amber-500
        : '#ef4444'; // red-500

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('flex-shrink-0', className)}
      width={width}
      height={height}
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
      {/* Dot at last data point */}
      <circle
        cx={padding + innerW}
        cy={padding + innerH - ((lastValue - min) / range) * innerH}
        r="2"
        fill={strokeColor}
      />
    </svg>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function AutonomyActionCard({
  analytics,
  policy,
  hasPendingPromotion = false,
  promotionThreshold = DEFAULT_PROMOTION_THRESHOLD,
  sparklineData = [],
}: AutonomyActionCardProps) {
  const actionType = analytics.action_type;
  const meta = ACTION_META[actionType] ?? {
    label: actionType.replace(/_/g, ' '),
    description: '',
    icon: ShieldAlert,
  };
  const ActionIcon = meta.icon;

  // Derive current policy: from policies table, or infer from auto_approved_count
  const currentPolicy = policy?.policy ?? (analytics.auto_approved_count > 0 ? 'auto' : 'approve');
  const policyCfg = POLICY_CONFIG[currentPolicy] ?? POLICY_CONFIG.approve;
  const PolicyIcon = policyCfg.icon;

  const approvalRate = Number(analytics.approval_rate ?? 0);
  const corrections = analytics.rejection_count + analytics.edit_count;

  // Promotion eligibility: rate >= threshold, at least 10 total actions, not already auto, no pending promotion
  const isEligibleForPromotion =
    currentPolicy !== 'auto' &&
    !hasPendingPromotion &&
    analytics.total_count >= 10 &&
    approvalRate >= promotionThreshold;

  const isNearPromotion =
    currentPolicy !== 'auto' &&
    !hasPendingPromotion &&
    analytics.total_count >= 5 &&
    approvalRate >= promotionThreshold - 10 &&
    approvalRate < promotionThreshold;

  return (
    <Card
      className={cn(
        'border bg-gray-900/60 transition-shadow hover:shadow-md',
        hasPendingPromotion
          ? 'border-blue-700/50 shadow-blue-900/20'
          : 'border-gray-800',
      )}
    >
      <CardContent className="p-4">
        {/* ---------------------------------------------------------------- */}
        {/* Top row: icon + name + policy badge + sparkline                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Action icon */}
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-md bg-gray-800 flex items-center justify-center">
              <ActionIcon className="h-4 w-4 text-gray-400" />
            </div>

            {/* Name + description */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-100">
                  {meta.label}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs px-2 py-0 border font-medium',
                    policyCfg.badgeCls,
                  )}
                >
                  <PolicyIcon className="h-3 w-3 mr-1" />
                  {policyCfg.label}
                </Badge>
                {hasPendingPromotion && (
                  <Badge
                    variant="outline"
                    className="text-xs px-2 py-0 border font-medium bg-blue-500/15 text-blue-400 border-blue-500/30"
                  >
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Promotion Pending
                  </Badge>
                )}
              </div>
              {meta.description && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {meta.description}
                </p>
              )}
            </div>
          </div>

          {/* Sparkline */}
          {sparklineData.length >= 2 && (
            <ApprovalSparkline data={sparklineData} className="mt-1" />
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Stats row                                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-3 flex items-center gap-4 flex-wrap">
          {/* Approval rate */}
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-semibold text-gray-100">
              {approvalRate.toFixed(0)}%
            </div>
            <span className="text-xs text-gray-500">approval</span>
          </div>

          {/* Mini progress track */}
          <div className="flex-1 min-w-[80px] max-w-[160px]">
            <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  approvalRate >= 90
                    ? 'bg-emerald-500'
                    : approvalRate >= 70
                      ? 'bg-amber-500'
                      : 'bg-red-500',
                )}
                style={{ width: `${Math.min(approvalRate, 100)}%` }}
              />
            </div>
          </div>

          {/* Count badges */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              {analytics.approval_count + analytics.auto_approved_count}
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500" />
              {analytics.rejection_count}
            </span>
            <span className="flex items-center gap-1">
              <Edit3 className="h-3 w-3 text-amber-500" />
              {analytics.edit_count}
            </span>
          </div>

          {/* Total count */}
          <span className="text-xs text-gray-600 ml-auto">
            {analytics.total_count} total
          </span>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Promotion eligibility indicator                                  */}
        {/* ---------------------------------------------------------------- */}
        {isEligibleForPromotion && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/20">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
            <span className="text-xs text-emerald-400">
              Eligible for promotion — {approvalRate.toFixed(0)}% approval rate with {analytics.total_count} actions ({corrections} correction{corrections !== 1 ? 's' : ''})
            </span>
          </div>
        )}
        {isNearPromotion && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
            <TrendingUp className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-400">
              Approaching promotion threshold — {(promotionThreshold - approvalRate).toFixed(0)}% more approval needed
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AutonomyActionCard;
