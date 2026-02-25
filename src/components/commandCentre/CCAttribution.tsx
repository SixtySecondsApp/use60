/**
 * CCAttribution — CC-007
 *
 * Human + AI joint ownership attribution strip for Command Centre feed cards.
 * Renders agent icon alongside optional user avatar with status indicator,
 * and a short metadata label describing the current state of the item.
 *
 * Three states:
 *  1. Agent only  — completed / auto-resolved, no human action needed
 *  2. Needs review — agent icon + user avatar with blue dot
 *  3. Actioned    — agent icon + user avatar with green checkmark
 */

import {
  BarChart3,
  Bot,
  Calendar,
  Check,
  HeartPulse,
  Mail,
  RefreshCw,
  Search,
  Signal,
  Sun,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface CCAttributionProps {
  sourceAgent: string;
  status: string;
  resolutionChannel: string | null;
  /** Whether this item still needs human action */
  needsReview: boolean;
  /** Optional user display name for the "approved by" state */
  userName?: string;
  /** Optional user avatar URL */
  userAvatarUrl?: string;
}

// ============================================================================
// Agent icon registry
// ============================================================================

const AGENT_ICONS: Record<string, React.ElementType> = {
  'morning-briefing': Sun,
  'deal-health': HeartPulse,
  'follow-up': Mail,
  'pipeline-analysis': BarChart3,
  'meeting-prep': Calendar,
  're-engagement': RefreshCw,
  'signal-monitor': Signal,
  'enrichment': Search,
};

// Human-readable agent labels derived from the source_agent key
function toAgentLabel(sourceAgent: string): string {
  return sourceAgent
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// Status suffix
// ============================================================================

function getStatusSuffix(status: string, needsReview: boolean): string {
  if (needsReview) return ' · Needs your review';

  switch (status) {
    case 'approved':
      return ' · Approved';
    case 'dismissed':
      return ' · Dismissed';
    case 'auto_resolved':
    case 'auto-resolved':
      return ' · Auto-completed';
    default:
      return '';
  }
}

// ============================================================================
// Component
// ============================================================================

export function CCAttribution({
  sourceAgent,
  status,
  resolutionChannel: _resolutionChannel,
  needsReview,
  userName: _userName,
  userAvatarUrl,
}: CCAttributionProps) {
  const AgentIcon = AGENT_ICONS[sourceAgent] ?? Bot;
  const agentLabel = toAgentLabel(sourceAgent);
  const statusSuffix = getStatusSuffix(status, needsReview);

  const isApproved = !needsReview && status === 'approved';
  const isDismissed = !needsReview && status === 'dismissed';
  const showUserAvatar = needsReview || isApproved || isDismissed;

  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-gray-800/40">
      {/* Agent icon */}
      <div className="relative h-7 w-7 rounded-full bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center flex-shrink-0">
        <AgentIcon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
      </div>

      {/* User avatar (rendered when item needs review or has been actioned) */}
      {showUserAvatar && (
        <div className="relative h-7 w-7 rounded-full bg-slate-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 -ml-2 overflow-visible">
          {userAvatarUrl ? (
            <img
              src={userAvatarUrl}
              alt="User avatar"
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <User className="h-4 w-4 text-slate-500 dark:text-gray-400" />
          )}

          {/* Blue dot — needs review */}
          {needsReview && (
            <div
              className={cn(
                'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500',
                'ring-2 ring-white dark:ring-gray-900',
              )}
            />
          )}

          {/* Green checkmark — approved */}
          {isApproved && (
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500',
                'flex items-center justify-center',
                'ring-2 ring-white dark:ring-gray-900',
              )}
            >
              <Check className="h-2 w-2 text-white" />
            </div>
          )}
        </div>
      )}

      {/* Text label */}
      <span className="text-xs text-slate-500 dark:text-gray-400 truncate">
        {agentLabel}
        {statusSuffix}
      </span>
    </div>
  );
}
