/**
 * AutonomyPromotionProposalBanner
 *
 * In-app banner when the AI proposes a tier promotion.
 * Actions: Approve / Snooze / Reject
 * Shows evidence: approval rate, signal count.
 *
 * Story: AUT-005
 */

import { TrendingUp, Check, AlarmClock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  usePromotionSuggestions,
  useApprovePromotion,
} from '@/lib/hooks/useAutonomyAnalytics';
import { toast } from 'sonner';

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
  send_email: 'Email Sending',
  send_slack: 'Slack Messages',
  create_task: 'Task Creation',
  enrich_contact: 'Contact Enrichment',
  draft_proposal: 'Proposal Drafts',
};

const TIER_BADGE_CLS: Record<string, string> = {
  auto: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  approve: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  suggest: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

// ============================================================================
// Component
// ============================================================================

export function AutonomyPromotionProposalBanner() {
  const { data: promotions, isLoading } = usePromotionSuggestions();
  const approvePromotion = useApprovePromotion();

  const handleAction = async (
    promotionId: string,
    action: 'approve' | 'reject' | 'snooze'
  ) => {
    try {
      await approvePromotion.mutateAsync({ promotionId, action });
      const messages: Record<typeof action, string> = {
        approve: 'Promotion applied — the agent will now auto-execute this action',
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
    <div className="space-y-3">
      {promotions.map((p) => {
        const label =
          ACTION_LABELS[p.action_type] ??
          p.action_type.replace(/[._]/g, ' ');
        const evidence = p.evidence ?? {
          approvalCount: 0,
          rejectionCount: 0,
          approvalRate: 0,
          windowDays: 30,
        };

        return (
          <Card
            key={p.id}
            className="border border-blue-700/50 bg-blue-950/20"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                {/* Left: icon + info */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-md bg-blue-900/40 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-200">
                      Promotion proposal: {label}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {evidence.approvalCount} approved,{' '}
                      {evidence.rejectionCount} corrections in{' '}
                      {evidence.windowDays}d ({evidence.approvalRate}%
                      approval rate)
                    </p>
                    {/* Current → Proposed tier */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs px-1.5 py-0',
                          TIER_BADGE_CLS[p.current_policy] ??
                            'text-gray-500 border-gray-700'
                        )}
                      >
                        {p.current_policy}
                      </Badge>
                      <span className="text-xs text-gray-600">&rarr;</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs px-1.5 py-0',
                          TIER_BADGE_CLS[p.proposed_policy] ??
                            'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        )}
                      >
                        {p.proposed_policy}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Right: action buttons */}
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
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
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default AutonomyPromotionProposalBanner;
