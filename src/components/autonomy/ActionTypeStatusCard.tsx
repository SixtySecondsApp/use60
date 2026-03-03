/**
 * ActionTypeStatusCard
 *
 * Card showing current autonomy tier, approval stats, signal count,
 * and an optional sparkline for a single action type.
 *
 * Stories: AUT-001, AUT-002
 */

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, AlertCircle, Clock } from 'lucide-react';
import { ApprovalSparkline } from './ApprovalSparkline';
import type { AutonomyDashboardRow } from '@/lib/services/autonomyService';

// ============================================================================
// Constants
// ============================================================================

const ACTION_LABELS: Record<string, string> = {
  'crm.note_add': 'Meeting Notes',
  'crm.activity_log': 'Activity Logging',
  'crm.contact_enrich': 'Contact Enrichment',
  'crm.next_steps_update': 'Next Steps',
  'crm.deal_field_update': 'Deal Field Updates',
  'crm.deal_stage_change': 'Deal Stage Changes',
  'crm.deal_amount_change': 'Deal Amount Changes',
  'crm.deal_close_date_change': 'Close Date Changes',
  'email.draft_save': 'Email Drafts',
  'email.send': 'Email Sending',
  'email.follow_up_send': 'Follow-up Emails',
  'email.check_in_send': 'Check-in Emails',
  'task.create': 'Task Creation',
  'task.assign': 'Task Assignment',
  'calendar.create_event': 'Meeting Scheduling',
  'calendar.reschedule': 'Meeting Rescheduling',
  'analysis.risk_assessment': 'Risk Assessment',
  'analysis.coaching_feedback': 'Coaching Feedback',
  // Legacy
  crm_field_update: 'CRM Field Updates',
  crm_stage_change: 'Deal Stage Changes',
  crm_note_add: 'CRM Notes',
  email_draft: 'Email Drafts',
  email_send: 'Email Sending',
  task_create: 'Task Creation',
  meeting_prep: 'Meeting Prep',
  slack_post: 'Slack Posts',
};

const TIER_CONFIG: Record<
  string,
  { label: string; badgeCls: string; dotCls: string }
> = {
  auto: {
    label: 'Auto',
    badgeCls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dotCls: 'bg-emerald-500',
  },
  approve: {
    label: 'Approval Required',
    badgeCls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    dotCls: 'bg-amber-500',
  },
  suggest: {
    label: 'Suggests Only',
    badgeCls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    dotCls: 'bg-blue-500',
  },
  disabled: {
    label: 'Disabled',
    badgeCls: 'bg-gray-500/15 text-gray-500 border-gray-600/30',
    dotCls: 'bg-gray-600',
  },
};

// ============================================================================
// Props
// ============================================================================

interface ActionTypeStatusCardProps {
  row: AutonomyDashboardRow;
  /**
   * Map of window → array of approval rate values (for sparklines).
   * Passed from parent to avoid re-fetching inside each card.
   */
  sparklineRates?: Record<7 | 30 | 90, number[]>;
  /** True if there is a pending promotion proposal for this action type. */
  hasPendingPromotion?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ActionTypeStatusCard({
  row,
  sparklineRates,
  hasPendingPromotion = false,
}: ActionTypeStatusCardProps) {
  const label =
    ACTION_LABELS[row.action_type] ??
    row.action_type.replace(/[._]/g, ' ');

  const tierConfig = TIER_CONFIG[row.current_tier] ?? TIER_CONFIG.disabled;
  const approvalRate = row.approval_rate ?? row.clean_approval_rate;

  const hasSparklineData =
    sparklineRates &&
    (sparklineRates[7].length > 0 ||
      sparklineRates[30].length > 0 ||
      sparklineRates[90].length > 0);

  return (
    <Card
      className={cn(
        'border bg-white dark:bg-gray-900/60 transition-colors',
        hasPendingPromotion
          ? 'border-blue-200 dark:border-blue-700/50'
          : 'border-gray-200 dark:border-gray-800'
      )}
    >
      <CardContent className="p-4">
        {/* ---------------------------------------------------------------- */}
        {/* Header row                                                       */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                'flex-shrink-0 w-2 h-2 rounded-full mt-0.5',
                tierConfig.dotCls
              )}
            />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasPendingPromotion && (
              <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
            )}
            <Badge
              variant="outline"
              className={cn('text-xs px-1.5 py-0', tierConfig.badgeCls)}
            >
              {tierConfig.label}
            </Badge>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Stats row                                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
          {approvalRate != null && (
            <span className="flex items-center gap-1">
              <span
                className={cn(
                  'font-semibold',
                  approvalRate >= 90
                    ? 'text-emerald-400'
                    : approvalRate >= 70
                    ? 'text-amber-400'
                    : 'text-red-400'
                )}
              >
                {approvalRate}%
              </span>
              approval
            </span>
          )}

          <span>
            <span className="text-gray-400 font-medium">
              {row.total_signals}
            </span>{' '}
            signals
          </span>

          {row.days_active > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {row.days_active}d
            </span>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Sparkline (AUT-002)                                              */}
        {/* ---------------------------------------------------------------- */}
        {hasSparklineData && sparklineRates && (
          <ApprovalSparkline rates={sparklineRates} />
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Progress hint: how many more signals needed                      */}
        {/* ---------------------------------------------------------------- */}
        {row.current_tier !== 'auto' &&
          !row.never_promote &&
          !row.cooldown_until &&
          row.extra_required_signals > 0 && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-600">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span>
                {row.extra_required_signals} more signals needed
                {row.threshold_approval_rate
                  ? ` at ≥${row.threshold_approval_rate}% approval`
                  : ''}
              </span>
            </div>
          )}

        {/* Cooldown indicator */}
        {row.cooldown_until && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-600">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span>
              Cooldown until{' '}
              {new Date(row.cooldown_until).toLocaleDateString()}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ActionTypeStatusCard;
