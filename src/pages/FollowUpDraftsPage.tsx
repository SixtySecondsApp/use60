/**
 * FollowUpDraftsPage — FU-001
 * /follow-ups/drafts
 *
 * In-app follow-up draft inbox: review, edit, schedule, and send AI-generated follow-ups.
 * Status filters: Pending, Edited, Scheduled, Sent, Rejected
 */

import React, { useState, useCallback, useMemo } from 'react';
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
  Link as LinkIcon,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useFollowUpDrafts, type FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';
import { DraftEditor } from '@/components/followups/DraftEditor';
import { DraftHistoryTimeline } from '@/components/followups/DraftHistoryTimeline';
import { MeetingContextSidebar } from '@/components/followups/MeetingContextSidebar';
import { BatchDraftActions } from '@/components/followups/BatchDraftActions';
import { ScheduleSendPicker } from '@/components/followups/ScheduleSendPicker';
import { BuyerSignalBadge } from '@/components/followups/BuyerSignalBadge';
import { FollowUpChainView } from '@/components/followups/FollowUpChainView';
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
  isChainGrouped,
  onSelect,
  onOpen,
}: {
  draft: FollowUpDraft;
  isSelected: boolean;
  isActive: boolean;
  isChainGrouped?: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (draft: FollowUpDraft) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all',
        isActive
          ? 'border-[#37bd7e]/40 bg-[#37bd7e]/5'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/60',
        isSelected && 'ring-1 ring-[#37bd7e]/30',
        isChainGrouped && 'ml-4 border-l-2 border-l-[#37bd7e]/30'
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
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 accent-[#37bd7e] cursor-pointer"
        />
      </div>

      {/* Email icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#37bd7e]/10 flex items-center justify-center mt-0.5">
        <Mail className="w-4 h-4 text-[#37bd7e]" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {draft.to_name ?? draft.to_email}
          </span>
          <StatusBadge status={draft.status} />
          <BuyerSignalBadge draft={draft} />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 truncate mb-1">{draft.subject}</p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {draft.chain_id && (
            <span className="flex items-center gap-1 text-[#37bd7e]">
              <LinkIcon className="w-3 h-3" />
              Chain {(draft.chain_position ?? 0) + 1}/4
            </span>
          )}
          {draft.meeting_id && !draft.chain_id && (
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
  const [activeChainId, setActiveChainId] = useState<string | null>(null);

  const { drafts, isLoading, error, refetch, updateDraftStatus } = useFollowUpDrafts({
    orgId: activeOrgId ?? undefined,
    userId: user?.id,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  // Group drafts by chain_id for chain view
  const chainDraftsMap = useMemo(() => {
    const map = new Map<string, FollowUpDraft[]>();
    for (const draft of drafts) {
      if (draft.chain_id) {
        const existing = map.get(draft.chain_id) ?? [];
        existing.push(draft);
        map.set(draft.chain_id, existing);
      }
    }
    // Sort chain members by position
    for (const [, members] of map) {
      members.sort((a, b) => (a.chain_position ?? 0) - (b.chain_position ?? 0));
    }
    return map;
  }, [drafts]);

  // Build display list: group chain drafts under the first member, indent the rest
  const displayDrafts = useMemo(() => {
    const seenChains = new Set<string>();
    const result: { draft: FollowUpDraft; isChainGrouped: boolean }[] = [];

    for (const draft of drafts) {
      if (draft.chain_id) {
        if (!seenChains.has(draft.chain_id)) {
          seenChains.add(draft.chain_id);
          // Add all chain members in order
          const chainMembers = chainDraftsMap.get(draft.chain_id) ?? [draft];
          for (let i = 0; i < chainMembers.length; i++) {
            result.push({ draft: chainMembers[i], isChainGrouped: i > 0 });
          }
        }
        // Skip individual chain members already added
      } else {
        result.push({ draft, isChainGrouped: false });
      }
    }

    return result;
  }, [drafts, chainDraftsMap]);

  const activeChainDrafts = useMemo(() => {
    if (!activeChainId) return [];
    return chainDraftsMap.get(activeChainId) ?? [];
  }, [activeChainId, chainDraftsMap]);

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
    // If opening a chain draft, show chain view
    if (draft.chain_id) {
      setActiveChainId(draft.chain_id);
    } else {
      setActiveChainId(null);
    }
  }, []);

  const handleShowChainView = useCallback((chainId: string) => {
    setActiveChainId(chainId);
    setActiveDraft(null);
  }, []);

  const handleBatchComplete = useCallback(() => {
    setSelectedIds(new Set());
    refetch();
  }, [refetch]);

  const handleDraftUpdated = useCallback((updatedDraft: FollowUpDraft) => {
    setActiveDraft(updatedDraft);
    refetch();
  }, [refetch]);

  const handleChainUpdated = useCallback(() => {
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
        <div className="w-full max-w-md flex flex-col border-r border-gray-200 dark:border-gray-800 min-h-0">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
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
                className="p-2 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
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
              drafts={drafts}
              orgId={activeOrgId ?? ''}
              onComplete={handleBatchComplete}
              onClearSelection={() => setSelectedIds(new Set())}
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
              displayDrafts.map(({ draft, isChainGrouped }) => (
                <div key={draft.id}>
                  <DraftCard
                    draft={draft}
                    isSelected={selectedIds.has(draft.id)}
                    isActive={activeDraft?.id === draft.id}
                    isChainGrouped={isChainGrouped}
                    onSelect={handleSelect}
                    onOpen={handleOpen}
                  />
                  {/* Show "View Chain" button on the first draft of a chain */}
                  {draft.chain_id && !isChainGrouped && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShowChainView(draft.chain_id!);
                      }}
                      className={cn(
                        'ml-[60px] mt-1 mb-1 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                        activeChainId === draft.chain_id
                          ? 'bg-[#37bd7e]/20 text-[#37bd7e]'
                          : 'text-gray-500 dark:text-gray-400 hover:text-[#37bd7e] hover:bg-[#37bd7e]/10'
                      )}
                    >
                      <LinkIcon className="w-3 h-3" />
                      View Chain ({(chainDraftsMap.get(draft.chain_id!) ?? []).length} emails)
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel: chain view / editor / empty state */}
        <div className="flex-1 flex min-h-0">
          {activeChainId && !activeDraft ? (
            /* Chain timeline view */
            <div className="flex-1 flex min-h-0">
              <div className="flex-1 min-h-0">
                <FollowUpChainView
                  meetingId={activeChainDrafts[0]?.meeting_id ?? ''}
                  chainDrafts={activeChainDrafts}
                  onOpenDraft={(draft) => {
                    setActiveDraft(draft);
                  }}
                  onChainUpdated={handleChainUpdated}
                />
              </div>
              {activeChainDrafts[0]?.meeting_id && (
                <div className="w-72 border-l border-gray-200 dark:border-gray-800 flex-shrink-0 overflow-y-auto">
                  <MeetingContextSidebar meetingId={activeChainDrafts[0].meeting_id} orgId={activeOrgId ?? undefined} />
                </div>
              )}
            </div>
          ) : activeDraft ? (
            <>
              {/* Editor panel */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Back to chain view link (when editing a chain draft) */}
                {activeDraft.chain_id && (
                  <button
                    onClick={() => {
                      setActiveDraft(null);
                      setActiveChainId(activeDraft.chain_id);
                    }}
                    className="flex items-center gap-1.5 px-5 py-2 text-xs font-medium text-[#37bd7e] hover:bg-[#37bd7e]/5 border-b border-gray-200 dark:border-gray-800 transition-colors flex-shrink-0"
                  >
                    <LinkIcon className="w-3 h-3" />
                    Back to chain view
                  </button>
                )}

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
                  <div className="border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
                    <ScheduleSendPicker
                      draft={activeDraft}
                      orgId={activeOrgId ?? ''}
                      onScheduled={(updated) => {
                        handleDraftUpdated(updated);
                        setShowScheduler(false);
                      }}
                      onCancel={() => setShowScheduler(false)}
                    />
                  </div>
                )}

                {showHistory && (
                  <div className="border-t border-gray-200 dark:border-gray-800 flex-shrink-0 max-h-60 overflow-y-auto">
                    <DraftHistoryTimeline draft={activeDraft} />
                  </div>
                )}
              </div>

              {/* Meeting context sidebar */}
              {activeDraft.meeting_id && (
                <div className="w-72 border-l border-gray-200 dark:border-gray-800 flex-shrink-0 overflow-y-auto">
                  <MeetingContextSidebar meetingId={activeDraft.meeting_id} orgId={activeOrgId ?? undefined} />
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
