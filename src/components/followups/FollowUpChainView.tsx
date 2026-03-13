/**
 * FollowUpChainView — Multi-email sequence timeline for follow-up chains
 *
 * Displays a vertical timeline of chain drafts generated from a single meeting:
 *   - Day 0: Meeting Recap
 *   - Day 3: Value Add
 *   - Day 7: Gentle Nudge
 *   - Day 14: Re-engagement
 *
 * Each draft is clickable to open in the DraftEditor.
 * "Approve All" to approve the entire chain at once.
 */

import React, { useState, useCallback } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Edit2,
  Loader2,
  Mail,
  Send,
  XCircle,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';
import { useFollowUpDrafts } from '@/lib/hooks/useFollowUpDrafts';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { BuyerSignalBadge } from './BuyerSignalBadge';

// ============================================================================
// Types & constants
// ============================================================================

export type ChainType = 'meeting_recap' | 'value_add' | 'gentle_nudge' | 're_engagement';

interface ChainStep {
  type: ChainType;
  label: string;
  dayOffset: number;
  description: string;
}

const CHAIN_STEPS: ChainStep[] = [
  { type: 'meeting_recap', label: 'Meeting Recap', dayOffset: 0, description: 'Same-day summary and next steps' },
  { type: 'value_add', label: 'Value Add', dayOffset: 3, description: 'Relevant resource or insight' },
  { type: 'gentle_nudge', label: 'Gentle Nudge', dayOffset: 7, description: 'Friendly check-in on progress' },
  { type: 're_engagement', label: 'Re-engagement', dayOffset: 14, description: 'Restart the conversation' },
];

const STATUS_STYLES: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  pending: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  editing: { icon: Edit2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  approved: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  scheduled: { icon: Calendar, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  sent: { icon: Send, color: 'text-gray-400', bg: 'bg-gray-500/10' },
  rejected: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
};

// ============================================================================
// Subcomponents
// ============================================================================

function ChainStepCard({
  step,
  draft,
  isLast,
  onOpenDraft,
}: {
  step: ChainStep;
  draft: FollowUpDraft | null;
  isLast: boolean;
  onOpenDraft: (draft: FollowUpDraft) => void;
}) {
  const statusInfo = draft
    ? STATUS_STYLES[draft.status] ?? STATUS_STYLES.pending
    : null;
  const StatusIcon = statusInfo?.icon ?? Circle;

  return (
    <div className="flex gap-3">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center border',
            draft
              ? cn(statusInfo?.bg, 'border-transparent')
              : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          )}
        >
          <StatusIcon
            className={cn(
              'w-4 h-4',
              draft ? statusInfo?.color : 'text-gray-400 dark:text-gray-500'
            )}
          />
        </div>
        {!isLast && (
          <div className="w-px flex-1 min-h-[24px] bg-gray-200 dark:bg-gray-700" />
        )}
      </div>

      {/* Step content */}
      <div
        className={cn(
          'flex-1 pb-4 min-w-0',
          draft && 'cursor-pointer'
        )}
        onClick={() => draft && onOpenDraft(draft)}
      >
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-gray-900 dark:text-white">
            {step.label}
          </span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            Day {step.dayOffset}
          </span>
          {draft && <BuyerSignalBadge draft={draft} />}
          {draft && (
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                draft.status === 'pending' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                draft.status === 'editing' && 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                draft.status === 'approved' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                draft.status === 'scheduled' && 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                draft.status === 'sent' && 'bg-gray-500/10 text-gray-400 border-gray-500/20',
                draft.status === 'rejected' && 'bg-red-500/10 text-red-400 border-red-500/20'
              )}
            >
              {draft.status.charAt(0).toUpperCase() + draft.status.slice(1)}
            </span>
          )}
        </div>

        {draft ? (
          <div className="group rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-3 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/60 transition-all">
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate mb-1">
              {draft.subject}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
              {(draft.edited_body ?? draft.body).replace(/<[^>]*>/g, '').slice(0, 150)}
            </p>
            <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className="w-3 h-3" />
              Click to edit
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">
              {step.description} - not yet generated
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface FollowUpChainViewProps {
  meetingId: string;
  chainDrafts: FollowUpDraft[];
  onOpenDraft: (draft: FollowUpDraft) => void;
  onChainUpdated: () => void;
}

export function FollowUpChainView({
  meetingId,
  chainDrafts,
  onOpenDraft,
  onChainUpdated,
}: FollowUpChainViewProps) {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();
  const { updateDraftStatus } = useFollowUpDrafts({
    orgId: activeOrgId ?? undefined,
    userId: user?.id,
  });

  const [isApprovingAll, setIsApprovingAll] = useState(false);

  // Map drafts to chain steps by chain_type
  const draftsByType = new Map<ChainType, FollowUpDraft>();
  for (const draft of chainDrafts) {
    if (draft.chain_type) {
      draftsByType.set(draft.chain_type, draft);
    }
  }

  // Stats
  const approvableCount = chainDrafts.filter(
    (d) => d.status === 'pending' || d.status === 'editing'
  ).length;
  const approvedCount = chainDrafts.filter(
    (d) => d.status === 'approved' || d.status === 'scheduled' || d.status === 'sent'
  ).length;

  // Approve all pending/editing drafts
  const handleApproveAll = useCallback(async () => {
    const eligible = chainDrafts.filter(
      (d) => d.status === 'pending' || d.status === 'editing'
    );

    if (eligible.length === 0) {
      toast.error('No drafts to approve');
      return;
    }

    setIsApprovingAll(true);

    let successCount = 0;
    let failCount = 0;

    for (const draft of eligible) {
      try {
        await updateDraftStatus(draft.id, 'approved');
        successCount++;
      } catch {
        failCount++;
      }
    }

    setIsApprovingAll(false);

    if (failCount > 0) {
      toast.error(`${successCount} approved, ${failCount} failed`);
    } else {
      toast.success(`${successCount} draft${successCount !== 1 ? 's' : ''} approved`);
    }

    onChainUpdated();
  }, [chainDrafts, updateDraftStatus, onChainUpdated]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#37bd7e]" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Follow-Up Chain
            </h2>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
              {chainDrafts.length} of {CHAIN_STEPS.length} emails
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {approvedCount} approved, {approvableCount} pending review
          </p>
        </div>

        {approvableCount > 0 && (
          <Button
            variant="success"
            size="sm"
            onClick={handleApproveAll}
            disabled={isApprovingAll}
          >
            {isApprovingAll ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
            )}
            Approve All ({approvableCount})
          </Button>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-5">
        {CHAIN_STEPS.map((step, index) => (
          <ChainStepCard
            key={step.type}
            step={step}
            draft={draftsByType.get(step.type) ?? null}
            isLast={index === CHAIN_STEPS.length - 1}
            onOpenDraft={onOpenDraft}
          />
        ))}
      </div>
    </div>
  );
}
