/**
 * Pipeline Outreach Response Component
 * Renders batch email drafts from pipeline health + follow-up queries.
 * Each email is an interactive card with edit-in-place, Send Now, and Queue to Action Centre.
 */

import React, { useState, useCallback } from 'react';
import {
  Mail,
  Send,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  Inbox,
  User,
  Building2,
  Pencil,
  Loader2,
  TrendingDown,
  Activity,
  Calendar,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import type {
  PipelineOutreachResponse as PipelineOutreachResponseType,
  PipelineEmailDraft,
  PipelineEmailMeetingContext,
  QuickActionResponse,
} from '../types';

interface Props {
  data: PipelineOutreachResponseType;
  onActionClick?: (action: QuickActionResponse) => void;
}

type DraftStatus = 'pending' | 'sending' | 'sent' | 'queued' | 'dismissed';

interface DraftState {
  status: DraftStatus;
  editingSubject: boolean;
  editingBody: boolean;
  subject: string;
  body: string;
  expanded: boolean;
}

const urgencyConfig = {
  high: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Urgent' },
  medium: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'Medium' },
  low: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', label: 'Low' },
};

const riskConfig = {
  critical: { color: 'text-red-400', icon: AlertCircle, label: 'Critical' },
  high: { color: 'text-red-400', icon: AlertTriangle, label: 'High Risk' },
  medium: { color: 'text-amber-400', icon: AlertTriangle, label: 'Medium Risk' },
  low: { color: 'text-green-400', icon: CheckCircle2, label: 'Healthy' },
};

function PipelineSummaryCard({ summary }: { summary: PipelineOutreachResponseType['data']['pipeline_summary'] }) {
  const risk = riskConfig[summary.risk_level] || riskConfig.medium;
  const RiskIcon = risk.icon;

  return (
    <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
          <TrendingDown className="w-5 h-5 text-red-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Pipeline Health</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <RiskIcon className={cn('w-3.5 h-3.5', risk.color)} />
            <span className={cn('text-xs font-medium', risk.color)}>{risk.label}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-gray-900/40 px-3 py-2 text-center">
          <div className="text-lg font-bold text-white">{summary.stale_count}</div>
          <div className="text-xs text-gray-400">Stale</div>
        </div>
        <div className="rounded-lg bg-gray-900/40 px-3 py-2 text-center">
          <div className="text-lg font-bold text-white">{summary.total_deals}</div>
          <div className="text-xs text-gray-400">Total Deals</div>
        </div>
        <div className="rounded-lg bg-gray-900/40 px-3 py-2 text-center">
          <div className="text-lg font-bold text-white">{summary.zero_interaction_count ?? 0}</div>
          <div className="text-xs text-gray-400">No Contact</div>
        </div>
      </div>
      {summary.health_score != null && (
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-gray-400">Health Score</span>
            <span className="text-white font-medium">{summary.health_score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-700/50 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                summary.health_score >= 70 ? 'bg-green-500' :
                summary.health_score >= 40 ? 'bg-amber-500' : 'bg-red-500'
              )}
              style={{ width: `${Math.min(100, summary.health_score)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EmailDraftCard({
  draft,
  state,
  onUpdate,
  onSendNow,
  onQueueLater,
  onDismiss,
  onActionClick,
}: {
  draft: PipelineEmailDraft;
  state: DraftState;
  onUpdate: (updates: Partial<DraftState>) => void;
  onSendNow: () => void;
  onQueueLater: () => void;
  onDismiss: () => void;
  onActionClick?: (action: QuickActionResponse) => void;
}) {
  const urgency = urgencyConfig[draft.urgency] || urgencyConfig.medium;
  const isProcessed = state.status === 'sent' || state.status === 'queued' || state.status === 'dismissed';
  const isSending = state.status === 'sending';

  if (state.status === 'dismissed') return null;

  return (
    <div
      className={cn(
        'rounded-xl border bg-gray-900/30 overflow-hidden transition-all',
        isProcessed ? 'border-gray-700/30 opacity-60' : 'border-gray-700/60',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => draft.contactId && onActionClick?.({
            id: `open-contact-${draft.contactId}`,
            label: 'Open Contact',
            type: 'tertiary',
            callback: 'open_contact',
            params: { contactId: draft.contactId },
          })}
          disabled={!draft.contactId}
          className={cn(
            'w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0',
            draft.contactId && 'hover:bg-gray-700 cursor-pointer'
          )}
        >
          <User className="w-4 h-4 text-gray-400" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{draft.contactName}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', urgency.bg, urgency.color, urgency.border, 'border')}>
              {urgency.label}
            </span>
            {state.status === 'sent' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/30 font-medium">Sent</span>
            )}
            {state.status === 'queued' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 font-medium">Queued</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
            {draft.company && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {draft.company}
              </span>
            )}
            {draft.daysSinceContact != null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {draft.daysSinceContact}d ago
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onUpdate({ expanded: !state.expanded })}
            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            {state.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {!isProcessed && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-red-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Subject line (always visible) */}
      <div className="px-3 pb-2">
        {state.editingSubject ? (
          <input
            type="text"
            value={state.subject}
            onChange={(e) => onUpdate({ subject: e.target.value })}
            onBlur={() => onUpdate({ editingSubject: false })}
            onKeyDown={(e) => e.key === 'Enter' && onUpdate({ editingSubject: false })}
            autoFocus
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <button
            type="button"
            onClick={() => !isProcessed && onUpdate({ editingSubject: true })}
            disabled={isProcessed}
            className={cn(
              'flex items-center gap-2 text-sm text-gray-300 w-full text-left group',
              !isProcessed && 'hover:text-white'
            )}
          >
            <Mail className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span className="truncate">{state.subject}</span>
            {!isProcessed && <Pencil className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 shrink-0" />}
          </button>
        )}
      </div>

      {/* Expanded body */}
      {state.expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Email body */}
          <div className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-3">
            {state.editingBody ? (
              <textarea
                value={state.body}
                onChange={(e) => onUpdate({ body: e.target.value })}
                onBlur={() => onUpdate({ editingBody: false })}
                autoFocus
                rows={8}
                className="w-full bg-transparent text-sm text-gray-300 focus:outline-none resize-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => !isProcessed && onUpdate({ editingBody: true })}
                disabled={isProcessed}
                className="w-full text-left group"
              >
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {state.body}
                </pre>
                {!isProcessed && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-gray-600 group-hover:text-gray-400">
                    <Pencil className="w-3 h-3" />
                    Click to edit
                  </div>
                )}
              </button>
            )}
          </div>

          {/* Strategy notes */}
          {draft.strategyNotes && (
            <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-blue-400">Strategy</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{draft.strategyNotes}</p>
            </div>
          )}

          {/* Meeting context */}
          {draft.meetingContext && (
            <div className="rounded-lg bg-purple-500/5 border border-purple-500/20 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-medium text-purple-400">Last Meeting</span>
              </div>
              <button
                type="button"
                onClick={() => onActionClick?.({
                  id: `open-meeting-${draft.meetingContext!.meetingId}`,
                  label: 'Open Meeting',
                  type: 'tertiary',
                  callback: 'open_meeting',
                  params: { meetingId: draft.meetingContext!.meetingId },
                })}
                className="text-sm text-gray-300 hover:text-white transition-colors text-left"
              >
                {draft.meetingContext.meetingTitle}
              </button>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {new Date(draft.meetingContext.meetingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              {draft.meetingContext.meetingSummary && (
                <p className="text-xs text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">
                  {draft.meetingContext.meetingSummary}
                </p>
              )}
              {draft.meetingContext.pendingActionItems.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-purple-500/10">
                  <div className="flex items-center gap-1 mb-1">
                    <ListChecks className="w-3 h-3 text-purple-400/70" />
                    <span className="text-[10px] text-purple-400/70 font-medium">Open Action Items</span>
                  </div>
                  <ul className="space-y-0.5">
                    {draft.meetingContext.pendingActionItems.slice(0, 3).map((item) => (
                      <li key={item.id} className="text-xs text-gray-400 flex items-start gap-1.5">
                        <span className="text-purple-400/50 mt-1">&#8226;</span>
                        <span>{item.title}</span>
                      </li>
                    ))}
                  </ul>
                  {draft.meetingContext.pendingActionItems.length > 3 && (
                    <span className="text-[10px] text-gray-500 mt-0.5 block">
                      +{draft.meetingContext.pendingActionItems.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          {!isProcessed && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={onSendNow}
                disabled={isSending}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
              >
                {isSending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                )}
                Send Now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onQueueLater}
                disabled={isSending}
                className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white text-xs h-8"
              >
                <Inbox className="w-3.5 h-3.5 mr-1.5" />
                Queue for Later
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PipelineOutreachResponse({ data, onActionClick }: Props) {
  const { pipeline_summary, email_drafts } = data.data;

  const [draftStates, setDraftStates] = useState<DraftState[]>(() =>
    email_drafts.map((draft) => ({
      status: 'pending' as DraftStatus,
      editingSubject: false,
      editingBody: false,
      subject: draft.subject,
      body: draft.body,
      expanded: false,
    }))
  );

  const [bulkSending, setBulkSending] = useState(false);

  const updateDraft = useCallback((index: number, updates: Partial<DraftState>) => {
    setDraftStates((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }, []);

  const handleSendNow = useCallback(async (index: number) => {
    const draft = email_drafts[index];
    const state = draftStates[index];
    if (!draft.to) {
      toast.error(`No email address for ${draft.contactName}`);
      return;
    }

    updateDraft(index, { status: 'sending' });

    try {
      // Create HITL approval record and send via hitl-send-followup-email
      const { data: approval, error: approvalError } = await supabase
        .from('hitl_pending_approvals')
        .insert({
          resource_type: 'email_draft',
          status: 'approved',
          original_content: {
            to: draft.to,
            subject: state.subject,
            body: state.body,
            recipientName: draft.contactName,
            recipientEmail: draft.to,
          },
          metadata: {
            source: 'copilot_pipeline_outreach',
            contactId: draft.contactId,
            dealId: draft.dealId,
          },
          callback_type: 'edge_function',
          callback_target: 'hitl-send-followup-email',
        })
        .select('id')
        .single();

      if (approvalError) throw approvalError;

      // Call the send function
      const { error: sendError } = await supabase.functions.invoke('hitl-send-followup-email', {
        body: {
          approval_id: approval.id,
          action: 'approved',
          content: {
            recipientEmail: draft.to,
            to: draft.to,
            subject: state.subject,
            body: state.body,
          },
        },
      });

      if (sendError) throw sendError;

      updateDraft(index, { status: 'sent' });
      toast.success(`Email sent to ${draft.contactName}`);
    } catch (err: any) {
      updateDraft(index, { status: 'pending' });
      toast.error(`Failed to send: ${err.message || 'Unknown error'}`);
    }
  }, [email_drafts, draftStates, updateDraft]);

  const handleQueueLater = useCallback(async (index: number) => {
    const draft = email_drafts[index];
    const state = draftStates[index];

    try {
      const { error } = await supabase.from('action_centre_items').insert({
        action_type: 'email',
        title: `Follow-up: ${draft.contactName}${draft.company ? ` (${draft.company})` : ''}`,
        description: state.subject,
        preview_data: {
          to: draft.to,
          subject: state.subject,
          body: state.body,
          recipientName: draft.contactName,
        },
        contact_id: draft.contactId || null,
        deal_id: draft.dealId || null,
        risk_level: draft.urgency === 'high' ? 'high' : draft.urgency === 'medium' ? 'medium' : 'low',
        source_type: 'copilot_conversation',
        status: 'pending',
      });

      if (error) throw error;

      updateDraft(index, { status: 'queued' });
      toast.success(`Queued to Action Centre`);
    } catch (err: any) {
      toast.error(`Failed to queue: ${err.message || 'Unknown error'}`);
    }
  }, [email_drafts, draftStates, updateDraft]);

  const handleDismiss = useCallback((index: number) => {
    updateDraft(index, { status: 'dismissed' });
  }, [updateDraft]);

  const handleBulkQueueAll = useCallback(async () => {
    setBulkSending(true);
    const pendingIndices = draftStates
      .map((s, i) => (s.status === 'pending' ? i : -1))
      .filter((i) => i >= 0);

    for (const i of pendingIndices) {
      await handleQueueLater(i);
    }
    setBulkSending(false);
    toast.success(`${pendingIndices.length} emails queued to Action Centre`);
  }, [draftStates, handleQueueLater]);

  const pendingCount = draftStates.filter((s) => s.status === 'pending').length;
  const processedCount = draftStates.filter((s) => s.status === 'sent' || s.status === 'queued').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data.summary && (
        <p className="text-sm text-gray-400">{data.summary}</p>
      )}

      {/* Pipeline Health Card */}
      <PipelineSummaryCard summary={pipeline_summary} />

      {/* Email drafts header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Follow-up Drafts</span>
          <span className="text-xs text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded-full">
            {email_drafts.length}
          </span>
        </div>
        {processedCount > 0 && (
          <span className="text-xs text-gray-500">
            {processedCount}/{email_drafts.length} processed
          </span>
        )}
      </div>

      {/* Email draft cards */}
      <div className="space-y-2">
        {email_drafts.map((draft, index) => (
          <EmailDraftCard
            key={`${draft.contactId || draft.contactName}-${index}`}
            draft={draft}
            state={draftStates[index]}
            onUpdate={(updates) => updateDraft(index, updates)}
            onSendNow={() => handleSendNow(index)}
            onQueueLater={() => handleQueueLater(index)}
            onDismiss={() => handleDismiss(index)}
            onActionClick={onActionClick}
          />
        ))}
      </div>

      {/* Bulk actions */}
      {pendingCount > 1 && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-800/60">
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkQueueAll}
            disabled={bulkSending}
            className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white text-xs h-8"
          >
            {bulkSending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Inbox className="w-3.5 h-3.5 mr-1.5" />
            )}
            Add All to Action Centre ({pendingCount})
          </Button>
        </div>
      )}
    </div>
  );
}
