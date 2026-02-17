/**
 * Unified Task List Response Component
 * Renders a summary of Command Centre tasks with AI status indicators,
 * filter counts, and navigation to the full Command Centre page.
 */

import React from 'react';
import { Inbox, Bot, FileCheck, Clock, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { ActionButtons } from '../ActionButtons';
import type { QuickActionResponse, CopilotResponse } from '../types';

// ─── Data Interface ──────────────────────────────────────────

export interface UnifiedTaskListItem {
  id: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: string;
  task_type: string;
  source: string;
  ai_status?: string;
  deliverable_type?: string;
  confidence_score?: number;
  due_date?: string;
  contact_name?: string;
  deal_name?: string;
  deal_id?: string;
  contact_id?: string;
}

export interface UnifiedTaskListResponseData {
  tasks: UnifiedTaskListItem[];
  counts: {
    total: number;
    review: number;
    drafts: number;
    working: number;
    done: number;
    overdue: number;
  };
  groupBy?: 'status' | 'priority' | 'source';
}

// ─── Props ───────────────────────────────────────────────────

interface Props {
  data: CopilotResponse & { data: UnifiedTaskListResponseData };
  onActionClick?: (action: QuickActionResponse) => void;
}

// ─── Helpers ─────────────────────────────────────────────────

const priorityColor: Record<string, string> = {
  urgent: 'text-red-400',
  high: 'text-amber-400',
  medium: 'text-blue-400',
  low: 'text-gray-400',
};

const aiStatusIcon = (status?: string) => {
  switch (status) {
    case 'draft_ready':
      return <FileCheck className="w-3.5 h-3.5 text-emerald-400" />;
    case 'working':
    case 'queued':
      return <Bot className="w-3.5 h-3.5 text-blue-400 animate-pulse" />;
    case 'approved':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case 'failed':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
    default:
      return null;
  }
};

const aiStatusLabel = (status?: string) => {
  switch (status) {
    case 'draft_ready':
      return 'Draft ready';
    case 'working':
      return 'AI working';
    case 'queued':
      return 'Queued';
    case 'approved':
      return 'Approved';
    case 'failed':
      return 'Failed';
    default:
      return null;
  }
};

// ─── Component ───────────────────────────────────────────────

export const UnifiedTaskListResponse: React.FC<Props> = React.memo(({ data, onActionClick }) => {
  const responseData = data.data;

  if (!responseData.tasks || responseData.tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Inbox className="w-8 h-8 text-gray-500 mb-2" />
        <p className="text-sm text-gray-400">No tasks in your Command Centre</p>
      </div>
    );
  }

  const handleOpenCommandCentre = () => {
    onActionClick?.({
      id: 'open-command-centre',
      label: 'Open Command Centre',
      type: 'primary',
      callback: 'navigate',
      params: { path: '/command-centre' },
    });
  };

  const handleOpenTask = (taskId: string) => {
    onActionClick?.({
      id: `open-task-${taskId}`,
      label: 'Open Task',
      type: 'primary',
      callback: 'navigate',
      params: { path: `/command-centre?task=${taskId}` },
    });
  };

  const handleOpenDeal = (dealId: string) => {
    onActionClick?.({
      id: `open-deal-${dealId}`,
      label: 'View Deal',
      type: 'secondary',
      callback: 'open_deal',
      params: { dealId },
    });
  };

  const handleOpenContact = (contactId: string) => {
    onActionClick?.({
      id: `open-contact-${contactId}`,
      label: 'View Contact',
      type: 'secondary',
      callback: 'open_contact',
      params: { contactId },
    });
  };

  const { counts } = responseData;

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data.summary && (
        <p className="text-sm text-gray-300">{data.summary}</p>
      )}

      {/* Status Counts Bar */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {counts.review > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-semibold text-amber-400">{counts.review}</div>
            <div className="text-[10px] text-amber-400/70 uppercase tracking-wide">Review</div>
          </div>
        )}
        {counts.drafts > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-semibold text-emerald-400">{counts.drafts}</div>
            <div className="text-[10px] text-emerald-400/70 uppercase tracking-wide">Drafts</div>
          </div>
        )}
        {counts.working > 0 && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-semibold text-blue-400">{counts.working}</div>
            <div className="text-[10px] text-blue-400/70 uppercase tracking-wide">Working</div>
          </div>
        )}
        {counts.overdue > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-semibold text-red-400">{counts.overdue}</div>
            <div className="text-[10px] text-red-400/70 uppercase tracking-wide">Overdue</div>
          </div>
        )}
        <div className="bg-gray-500/10 border border-gray-500/20 rounded-lg px-3 py-2 text-center">
          <div className="text-lg font-semibold text-gray-300">{counts.total}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Total</div>
        </div>
      </div>

      {/* Task List (max 6) */}
      <div className="space-y-1.5">
        {responseData.tasks.slice(0, 6).map((task) => (
          <div
            key={task.id}
            onClick={() => handleOpenTask(task.id)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900/60 border border-gray-800/50 hover:bg-gray-800/60 hover:border-gray-700/50 cursor-pointer transition-all group"
          >
            {/* Priority dot */}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              task.priority === 'urgent' ? 'bg-red-400' :
              task.priority === 'high' ? 'bg-amber-400' :
              task.priority === 'medium' ? 'bg-blue-400' : 'bg-gray-500'
            }`} />

            {/* Title */}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-200 truncate group-hover:text-white transition-colors">
                {task.title}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {task.contact_name && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (task.contact_id) handleOpenContact(task.contact_id);
                    }}
                    className="text-[11px] text-gray-500 hover:text-blue-400 transition-colors"
                  >
                    {task.contact_name}
                  </button>
                )}
                {task.deal_name && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (task.deal_id) handleOpenDeal(task.deal_id);
                    }}
                    className="text-[11px] text-gray-500 hover:text-blue-400 transition-colors"
                  >
                    {task.deal_name}
                  </button>
                )}
              </div>
            </div>

            {/* AI Status */}
            {task.ai_status && task.ai_status !== 'none' && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {aiStatusIcon(task.ai_status)}
                <span className="text-[10px] text-gray-500">{aiStatusLabel(task.ai_status)}</span>
              </div>
            )}

            {/* Priority label */}
            <span className={`text-[10px] uppercase tracking-wide flex-shrink-0 ${priorityColor[task.priority] || 'text-gray-400'}`}>
              {task.priority}
            </span>

            <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
          </div>
        ))}

        {responseData.tasks.length > 6 && (
          <button
            onClick={handleOpenCommandCentre}
            className="w-full text-center text-xs text-gray-500 hover:text-blue-400 py-2 transition-colors"
          >
            +{responseData.tasks.length - 6} more tasks — Open Command Centre
          </button>
        )}
      </div>

      {/* Actions */}
      <ActionButtons actions={data.actions} onActionClick={onActionClick} />
    </div>
  );
});

UnifiedTaskListResponse.displayName = 'UnifiedTaskListResponse';

export default UnifiedTaskListResponse;
