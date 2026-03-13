/**
 * PromotionNudgeBanner (US-025)
 *
 * Banner shown in the CC inbox when pending_promotion_nudge=true for any action type.
 * Provides Accept (calls autopilot-evaluate) and Not Now (snoozes 7 days) buttons.
 */

import { useState } from 'react';
import {
  TrendingUp,
  Check,
  Clock,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  usePromotionNudges,
  useTriggerAutopilotEvaluate,
  useSnoozePromotionNudge,
  type AutopilotConfidence,
} from '@/lib/hooks/useAutopilotConfidence';
import { toast } from 'sonner';

// ============================================================================
// Constants
// ============================================================================

const TIER_LABELS: Record<string, string> = {
  disabled: 'Disabled',
  suggest: 'Suggest',
  approve: 'Approve',
  auto: 'Auto',
};

const ACTION_LABELS: Record<string, string> = {
  crm_field_update: 'CRM Field Updates',
  crm_stage_change: 'Deal Stage Changes',
  crm_note_add: 'CRM Notes',
  crm_contact_create: 'Contact Creation',
  email_draft: 'Email Drafts',
  email_send: 'Email Sending',
  task_create: 'Task Creation',
  meeting_prep: 'Meeting Prep',
  slack_post: 'Slack Posts',
  send_email: 'Email Sending',
  send_slack: 'Slack Messages',
  create_task: 'Task Creation',
  enrich_contact: 'Contact Enrichment',
  draft_proposal: 'Proposal Drafts',
};

// ============================================================================
// Single nudge card
// ============================================================================

function NudgeCard({ nudge }: { nudge: AutopilotConfidence }) {
  const triggerEvaluate = useTriggerAutopilotEvaluate();
  const snoozeNudge = useSnoozePromotionNudge();
  const [acting, setActing] = useState<'accept' | 'snooze' | null>(null);

  const label = ACTION_LABELS[nudge.action_type] ?? nudge.action_type.replace(/_/g, ' ');
  const currentTier = TIER_LABELS[nudge.current_tier] ?? nudge.current_tier;

  const handleAccept = async () => {
    setActing('accept');
    try {
      await triggerEvaluate.mutateAsync({ actionType: nudge.action_type });
      toast.success(`${label} promoted successfully`);
    } catch {
      toast.error('Failed to evaluate promotion');
    } finally {
      setActing(null);
    }
  };

  const handleSnooze = async () => {
    setActing('snooze');
    try {
      await snoozeNudge.mutateAsync({ confidenceId: nudge.id });
      toast.success('Snoozed for 7 days');
    } catch {
      toast.error('Failed to snooze');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
      <div className="flex items-start gap-2.5 min-w-0">
        <Sparkles className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-emerald-300">{label}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {nudge.total_signals} approvals · Currently:{' '}
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-gray-700 text-gray-400"
            >
              {currentTier}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          onClick={handleAccept}
          disabled={acting !== null}
          className="h-7 text-xs gap-1"
        >
          {acting === 'accept' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Check className="w-3 h-3" />
          )}
          Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSnooze}
          disabled={acting !== null}
          className="h-7 text-xs gap-1 text-gray-400 hover:text-gray-200"
        >
          {acting === 'snooze' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Clock className="w-3 h-3" />
          )}
          Not Now
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main banner component
// ============================================================================

export function PromotionNudgeBanner() {
  const { data: nudges, isLoading } = usePromotionNudges();

  if (isLoading || !nudges || nudges.length === 0) return null;

  return (
    <div className="space-y-2 mb-3">
      <div className="flex items-center gap-2 px-1">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs font-medium text-emerald-400">
          Ready to level up
        </span>
      </div>
      {nudges.map((nudge) => (
        <NudgeCard key={nudge.id} nudge={nudge} />
      ))}
    </div>
  );
}
