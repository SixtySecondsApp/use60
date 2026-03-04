/**
 * FollowUpDraftsPage — FU-001
 * /follow-ups/drafts
 *
 * In-app follow-up draft inbox: review, edit, schedule, and send AI-generated follow-ups.
 * Status filters: Pending, Edited, Scheduled, Sent, Rejected
 */

import React, { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Edit2,
  Loader2,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useFollowUpDrafts, type FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';
import { DraftEditor } from '@/components/followups/DraftEditor';
import { DraftHistoryTimeline } from '@/components/followups/DraftHistoryTimeline';
import { MeetingContextSidebar } from '@/components/followups/MeetingContextSidebar';
import { BatchDraftActions } from '@/components/followups/BatchDraftActions';
import { ScheduleSendPicker } from '@/components/followups/ScheduleSendPicker';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type StatusFilter = 'pending' | 'editing' | 'scheduled' | 'sent' | 'rejected' | 'all';

const STATUS_FILTERS: { value: StatusFilter; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: <Inbox className="w-3.5 h-3.5" /> },
  { value: 'pending', label: 'Pending', icon: <Clock className="w-3.5 h-3.5" /> },
  { value: 'editing', label: 'Edited', icon: <Edit2 className="w-3.5 h-3.5" /> },
  { value: 'scheduled', label: 'Scheduled', icon: <Calendar className="w-3.5 h-3.5" /> },
  { value: 'sent', label: 'Sent', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  { value: 'rejected', label: 'Rejected', icon: <XCircle className="w-3.5 h-3.5" /> },
];

const STATUS_BADGE_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  editing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  scheduled: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  sent: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  expired: 'bg-gray-500/10 text-gray-500 border-gray-600/20',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        STATUS_BADGE_STYLES[status] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function DraftCard({
  draft,
  isSelected,
  isActive,
  onSelect,
  onOpen,
}: {
  draft: FollowUpDraft;
  isSelected: boolean;
  isActive: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (draft: FollowUpDraft) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all',
        isActive
          ? 'border-[#37bd7e]/40 bg-[#37bd7e]/5'
          : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900/60',
        isSelected && 'ring-1 ring-[#37bd7e]/30'
      )}
      onClick={() => onOpen(draft)}
    >
      {/* Checkbox */}
      <div
        className="mt-0.5 flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(draft.id, !isSelected);
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-[#37bd7e] cursor-pointer"
        />
      </div>

      {/* Email icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#37bd7e]/10 flex items-center justify-center mt-0.5">
        <Mail className="w-4 h-4 text-[#37bd7e]" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white truncate">
            {draft.to_name ?? draft.to_email}
          </span>
          <StatusBadge status={draft.status} />
        </div>
        <p className="text-sm text-gray-300 truncate mb-1">{draft.subject}</p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {draft.meeting_id && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              From meeting
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(draft.generated_at), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function FollowUpDraftsPage() {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeDraft, setActiveDraft] = useState<FollowUpDraft | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);

  const { drafts, isLoading, error, refetch, updateDraftStatus } = useFollowUpDrafts({
    orgId: activeOrgId ?? undefined,
    userId: user?.id,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleOpen = useCallback((draft: FollowUpDraft) => {
    setActiveDraft(draft);
    setShowHistory(false);
    setShowScheduler(false);
  }, []);

  const handleBatchComplete = useCallback(() => {
    setSelectedIds(new Set());
    refetch();
  }, [refetch]);

  const handleDraftUpdated = useCallback((updatedDraft: FollowUpDraft) => {
    setActiveDraft(updatedDraft);
    refetch();
  }, [refetch]);

  const pendingCount = drafts.filter((d) => d.status === 'pending').length;

  return (
    <>
      <Helmet>
        <title>Follow-Up Drafts | 60</title>
      </Helmet>

      <div className="flex h-full min-h-0">
        {/* Left panel: draft list */}
        <div className="w-full max-w-md flex flex-col border-r border-gray-800 min-h-0">
          {/* Header */}
          <div className="p-4 border-b border-gray-800 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-[#37bd7e]" />
                  Follow-Up Drafts
                  {pendingCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-[#37bd7e] text-black rounded-full font-bold">
                      {pendingCount}
                    </span>
                  )}
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  AI-generated follow-ups awaiting your review
                </p>
              </div>
              <button
                onClick={() => refetch()}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Status filters */}
            <div className="flex gap-1 flex-wrap">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    statusFilter === f.value
                      ? 'bg-[#37bd7e]/20 text-[#37bd7e] border border-[#37bd7e]/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'
                  )}
                >
                  {f.icon}
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Batch actions bar */}
          {selectedIds.size > 0 && (
            <BatchDraftActions
              selectedIds={selectedIds}
              orgId={activeOrgId ?? ''}
              onComplete={handleBatchComplete}
            />
          )}

          {/* Draft list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-[#37bd7e] animate-spin" />
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={() => refetch()}
                  className="mt-2 text-xs text-[#37bd7e] hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : drafts.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  {statusFilter === 'pending'
                    ? 'No pending drafts — you\'re all caught up'
                    : `No ${statusFilter} drafts`}
                </p>
              </div>
            ) : (
              drafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  isSelected={selectedIds.has(draft.id)}
                  isActive={activeDraft?.id === draft.id}
                  onSelect={handleSelect}
                  onOpen={handleOpen}
                />
              ))
            )}
          </div>
        </div>

        {/* Right panel: editor / empty state */}
        <div className="flex-1 flex min-h-0">
          {activeDraft ? (
            <>
              {/* Editor panel */}
              <div className="flex-1 flex flex-col min-h-0">
                <DraftEditor
                  draft={activeDraft}
                  orgId={activeOrgId ?? ''}
                  onDraftUpdated={handleDraftUpdated}
                  onShowHistory={() => setShowHistory(!showHistory)}
                  onShowScheduler={() => setShowScheduler(!showScheduler)}
                  showHistory={showHistory}
                  showScheduler={showScheduler}
                />

                {showScheduler && (
                  <div className="border-t border-gray-800 flex-shrink-0">
                    <ScheduleSendPicker
                      draft={activeDraft}
                      orgId={activeOrgId ?? ''}
                      onScheduled={(updated) => {
                        handleDraftUpdated(updated);
                        setShowScheduler(false);
                      }}
                    />
                  </div>
                )}

                {showHistory && (
                  <div className="border-t border-gray-800 flex-shrink-0 max-h-60 overflow-y-auto">
                    <DraftHistoryTimeline draft={activeDraft} />
                  </div>
                )}
              </div>

              {/* Meeting context sidebar */}
              {activeDraft.meeting_id && (
                <div className="w-72 border-l border-gray-800 flex-shrink-0 overflow-y-auto">
                  <MeetingContextSidebar meetingId={activeDraft.meeting_id} />
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Mail className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Select a draft to review and edit</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
