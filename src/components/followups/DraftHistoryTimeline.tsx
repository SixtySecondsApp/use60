import React from 'react';
import {
  Wand2,
  Pencil,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';

// ============================================================================
// Types
// ============================================================================

interface DraftHistoryTimelineProps {
  draft: FollowUpDraft;
}

interface TimelineNode {
  key: string;
  label: string;
  icon: React.ReactNode;
  timestamp: string | null;
  colorClass: string;
  activeColorClass: string;
}

// ============================================================================
// Helpers
// ============================================================================

/** Build the ordered list of lifecycle nodes for a draft. */
function buildTimelineNodes(draft: FollowUpDraft): TimelineNode[] {
  const nodes: TimelineNode[] = [];

  // 1. Generated — always present
  nodes.push({
    key: 'generated',
    label: 'Generated',
    icon: <Wand2 className="h-3.5 w-3.5" />,
    timestamp: draft.generated_at ?? draft.created_at,
    colorClass: 'text-violet-400 bg-violet-500/15 border-violet-500/30',
    activeColorClass: 'text-violet-400',
  });

  // 2. Edited — only if the user modified the body
  if (draft.edited_body && draft.edited_body !== draft.body) {
    nodes.push({
      key: 'edited',
      label: 'Edited',
      icon: <Pencil className="h-3.5 w-3.5" />,
      timestamp: draft.updated_at,
      colorClass: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
      activeColorClass: 'text-blue-400',
    });
  }

  // Diverging paths: approved/scheduled/sent vs rejected
  if (draft.rejected_at) {
    nodes.push({
      key: 'rejected',
      label: 'Rejected',
      icon: <XCircle className="h-3.5 w-3.5" />,
      timestamp: draft.rejected_at,
      colorClass: 'text-red-400 bg-red-500/15 border-red-500/30',
      activeColorClass: 'text-red-400',
    });
  } else {
    // 3. Approved
    nodes.push({
      key: 'approved',
      label: 'Approved',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      timestamp: draft.approved_at,
      colorClass: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
      activeColorClass: 'text-emerald-400',
    });

    // 4. Scheduled
    nodes.push({
      key: 'scheduled',
      label: 'Scheduled',
      icon: <Clock className="h-3.5 w-3.5" />,
      timestamp: draft.scheduled_email_id ? (draft.updated_at ?? null) : null,
      colorClass: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
      activeColorClass: 'text-purple-400',
    });

    // 5. Sent
    nodes.push({
      key: 'sent',
      label: 'Sent',
      icon: <Send className="h-3.5 w-3.5" />,
      timestamp: draft.sent_at,
      colorClass: 'text-gray-300 bg-gray-500/15 border-gray-500/30',
      activeColorClass: 'text-gray-300',
    });
  }

  return nodes;
}

/**
 * Determine which node is the "current" (most recent completed) step.
 * Returns the index of the last node with a non-null timestamp.
 */
function getCurrentNodeIndex(nodes: TimelineNode[]): number {
  let lastCompleted = -1;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].timestamp) lastCompleted = i;
  }
  return lastCompleted;
}

// ============================================================================
// Component
// ============================================================================

export function DraftHistoryTimeline({ draft }: DraftHistoryTimelineProps) {
  const nodes = buildTimelineNodes(draft);
  const currentIdx = getCurrentNodeIndex(nodes);

  // If there is only the generated node and nothing else has happened,
  // the draft was just created — show a minimal state.
  if (currentIdx <= 0 && nodes.length <= 1) {
    return (
      <div className="p-4 text-sm text-gray-500">No history yet</div>
    );
  }

  return (
    <div className="p-4">
      <div className="relative">
        {nodes.map((node, idx) => {
          const isCompleted = node.timestamp !== null;
          const isCurrent = idx === currentIdx;
          const isFuture = !isCompleted;

          return (
            <div key={node.key} className="relative flex items-start gap-3 pb-4 last:pb-0">
              {/* Connecting line */}
              {idx < nodes.length - 1 && (
                <div
                  className={cn(
                    'absolute left-[13px] top-7 w-0.5 h-[calc(100%-16px)]',
                    isCompleted && idx < currentIdx
                      ? 'bg-gray-700'
                      : 'bg-gray-800'
                  )}
                />
              )}

              {/* Icon circle */}
              <div
                className={cn(
                  'relative z-10 flex items-center justify-center h-7 w-7 rounded-full border flex-shrink-0 transition-all',
                  isCompleted
                    ? node.colorClass
                    : 'text-gray-600 bg-gray-900 border-gray-800'
                )}
              >
                {node.icon}
              </div>

              {/* Label + timestamp */}
              <div className="flex-1 min-w-0 pt-0.5">
                <p
                  className={cn(
                    'text-sm font-medium leading-tight',
                    isCurrent
                      ? node.activeColorClass
                      : isCompleted
                        ? 'text-gray-300'
                        : 'text-gray-600'
                  )}
                >
                  {node.label}
                </p>

                {isCompleted && node.timestamp ? (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDistanceToNow(new Date(node.timestamp), { addSuffix: true })}
                  </p>
                ) : isFuture ? (
                  <p className="text-xs text-gray-700 mt-0.5">Pending</p>
                ) : null}
              </div>

              {/* Current indicator dot */}
              {isCurrent && (
                <div className="flex-shrink-0 mt-2">
                  <div className={cn('h-2 w-2 rounded-full', node.colorClass.split(' ')[0].replace('/15', ''))} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
