/**
 * AutonomyHistoryTimeline
 *
 * Timeline showing promotion/demotion history per action type.
 * Each entry: date, old tier → new tier, trigger reason.
 *
 * Story: AUT-004
 */

import { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  useAutonomyAuditLog,
  type AuditLogEntry,
} from '@/lib/hooks/useAutonomyAnalytics';

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

const TIER_BADGE_CLS: Record<string, string> = {
  auto: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  approve: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  suggest: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  disabled: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

const PREVIEW_COUNT = 5;

// ============================================================================
// Entry row
// ============================================================================

function HistoryEntry({ entry }: { entry: AuditLogEntry }) {
  const label =
    ACTION_LABELS[entry.action_type] ??
    entry.action_type.replace(/[._]/g, ' ');
  const isPromotion = entry.change_type === 'promotion';
  const isDemotion = entry.change_type === 'demotion';

  const evidence = entry.evidence as Record<string, unknown> | null;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-800/60 last:border-0">
      {/* Icon */}
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
          <span className="text-sm font-medium text-gray-200">{label}</span>

          {entry.previous_policy && entry.new_policy && (
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn(
                  'text-xs px-1.5 py-0',
                  TIER_BADGE_CLS[entry.previous_policy] ??
                    'text-gray-500 border-gray-700'
                )}
              >
                {entry.previous_policy}
              </Badge>
              <span className="text-xs text-gray-600">&rarr;</span>
              <Badge
                variant="outline"
                className={cn(
                  'text-xs px-1.5 py-0',
                  TIER_BADGE_CLS[entry.new_policy] ??
                    'text-gray-500 border-gray-700'
                )}
              >
                {entry.new_policy}
              </Badge>
            </div>
          )}
        </div>

        {entry.trigger_reason && (
          <p className="text-xs text-gray-500 mt-0.5">{entry.trigger_reason}</p>
        )}

        {evidence && (
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-600">
            {evidence.approvalRate !== undefined && (
              <span>{String(evidence.approvalRate)}% approval</span>
            )}
            {evidence.windowDays !== undefined && (
              <span>{String(evidence.windowDays)}d window</span>
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
}

// ============================================================================
// Main component
// ============================================================================

export function AutonomyHistoryTimeline() {
  const [expanded, setExpanded] = useState(false);
  const { data: auditLog } = useAutonomyAuditLog(50);

  const entries = auditLog ?? [];

  if (entries.length === 0) return null;

  const displayEntries = expanded ? entries : entries.slice(0, PREVIEW_COUNT);

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
            {entries.length} event{entries.length !== 1 ? 's' : ''}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="space-y-0">
          {displayEntries.map((entry) => (
            <HistoryEntry key={entry.id} entry={entry} />
          ))}
        </div>

        {entries.length > PREVIEW_COUNT && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              'w-full flex items-center justify-center',
              'rounded-md px-3 py-2 mt-2 text-xs font-medium',
              'bg-gray-800/60 hover:bg-gray-800 transition-colors',
              'text-gray-400 hover:text-gray-300'
            )}
          >
            {expanded ? (
              <>
                Show less <ChevronUp className="h-3.5 w-3.5 ml-1" />
              </>
            ) : (
              <>
                Show all {entries.length} events{' '}
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export default AutonomyHistoryTimeline;
