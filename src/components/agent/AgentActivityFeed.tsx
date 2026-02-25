/**
 * AgentActivityFeed — Activity feed panel for proactive agent actions
 *
 * Displays a chronological feed of agent activity (meeting briefs, deal risks, etc.)
 * with read/unread tracking and pagination.
 */

import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Video,
  Clock,
  AlertTriangle,
  RefreshCw,
  GraduationCap,
  Mail,
  Inbox,
  FileText,
  Calendar,
  CheckCheck,
  Settings,
  X,
  Loader2,
  BellOff,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useAgentActivityFeed,
  useAgentActivityUnreadCount,
  useMarkAgentActivityRead,
  useMarkAllAgentActivityRead,
  type AgentActivity,
} from '@/hooks/useAgentActivity';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { cn } from '@/lib/utils';

interface AgentActivityFeedProps {
  onClose?: () => void;
}

// Map sequence types to icons and colors
const SEQUENCE_TYPE_CONFIG: Record<string, { Icon: typeof Video; color: string; label: string; category: string }> = {
  meeting_ended: { Icon: Video, color: 'blue', label: 'Meeting Debrief', category: 'meetings' },
  pre_meeting_90min: { Icon: Clock, color: 'purple', label: 'Meeting Prep', category: 'meetings' },
  deal_risk_scan: { Icon: AlertTriangle, color: 'amber', label: 'Deal Risk', category: 'deals' },
  stale_deal_revival: { Icon: RefreshCw, color: 'emerald', label: 'Deal Revival', category: 'deals' },
  coaching_weekly: { Icon: GraduationCap, color: 'indigo', label: 'Coaching', category: 'admin' },
  campaign_daily_check: { Icon: Mail, color: 'rose', label: 'Campaign Check', category: 'outreach' },
  email_received: { Icon: Inbox, color: 'cyan', label: 'Email Signal', category: 'outreach' },
  proposal_generation: { Icon: FileText, color: 'violet', label: 'Proposal', category: 'deals' },
  calendar_find_times: { Icon: Calendar, color: 'teal', label: 'Scheduling', category: 'meetings' },
  morning_briefing: { Icon: Calendar, color: 'blue', label: 'Morning Briefing', category: 'admin' },
  agent_notification: { Icon: FileText, color: 'gray', label: 'Notification', category: 'admin' },
  sequence_cost_rollup: { Icon: FileText, color: 'gray', label: 'Cost Rollup', category: 'admin' },
};

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'deals', label: 'Deals' },
  { key: 'outreach', label: 'Outreach' },
  { key: 'admin', label: 'Admin' },
] as const;

// Get icon and color for a sequence type
function getSequenceConfig(sequenceType: string) {
  return SEQUENCE_TYPE_CONFIG[sequenceType] || { Icon: FileText, color: 'gray' };
}

// Get color classes for a color name
function getColorClasses(color: string) {
  const colors: Record<string, { bg: string; text: string }> = {
    blue: {
      bg: 'bg-blue-500/20',
      text: 'text-blue-600 dark:text-blue-400',
    },
    purple: {
      bg: 'bg-purple-500/20',
      text: 'text-purple-600 dark:text-purple-400',
    },
    amber: {
      bg: 'bg-amber-500/20',
      text: 'text-amber-600 dark:text-amber-400',
    },
    emerald: {
      bg: 'bg-emerald-500/20',
      text: 'text-emerald-600 dark:text-emerald-400',
    },
    indigo: {
      bg: 'bg-indigo-500/20',
      text: 'text-indigo-600 dark:text-indigo-400',
    },
    rose: {
      bg: 'bg-rose-500/20',
      text: 'text-rose-600 dark:text-rose-400',
    },
    cyan: {
      bg: 'bg-cyan-500/20',
      text: 'text-cyan-600 dark:text-cyan-400',
    },
    violet: {
      bg: 'bg-violet-500/20',
      text: 'text-violet-600 dark:text-violet-400',
    },
    teal: {
      bg: 'bg-teal-500/20',
      text: 'text-teal-600 dark:text-teal-400',
    },
    gray: {
      bg: 'bg-gray-500/20',
      text: 'text-gray-600 dark:text-gray-400',
    },
  };
  return colors[color] || colors.gray;
}

// Format sequence type for display
function formatSequenceType(sequenceType: string): string {
  return sequenceType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function AgentActivityFeed({ onClose }: AgentActivityFeedProps) {
  const activeOrgId = useActiveOrgId();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Fetch activity feed with infinite query
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAgentActivityFeed({
    orgId: activeOrgId,
    limit: 20,
  });

  // Fetch unread count
  const { data: unreadCount = 0 } = useAgentActivityUnreadCount(activeOrgId);

  // Mutation to mark as read
  const markAsRead = useMarkAgentActivityRead();
  const markAllAsRead = useMarkAllAgentActivityRead();

  // Flatten pages into single array and apply filter
  const allActivities = data?.pages.flat() || [];
  const activities = activeFilter === 'all'
    ? allActivities
    : allActivities.filter((a) => {
        const config = SEQUENCE_TYPE_CONFIG[a.sequence_type];
        return config?.category === activeFilter;
      });

  // Handle item click (mark as read + expand)
  const handleItemClick = async (activity: AgentActivity) => {
    // Mark as read if unread
    if (!activity.is_read) {
      await markAsRead.mutateAsync([activity.id]);
    }

    // Toggle expand
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(activity.id)) {
        next.delete(activity.id);
      } else {
        next.add(activity.id);
      }
      return next;
    });
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async () => {
    if (!activeOrgId) return;
    await markAllAsRead.mutateAsync(activeOrgId);
  };

  return (
    <div
      className="
      w-full h-full sm:w-[480px] sm:h-auto sm:max-h-[700px]
      bg-white dark:bg-gray-900/95 backdrop-blur-sm
      border-0 sm:border border-gray-200 dark:border-gray-700/50
      rounded-none sm:rounded-lg shadow-2xl
      overflow-hidden flex flex-col
    "
    >
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <GraduationCap className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                Agent Activity
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-500">
                {unreadCount} unread
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="p-2 rounded-lg transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                title="Mark all as read"
                aria-label="Mark all as read"
              >
                <CheckCheck className="w-5 h-5" />
              </button>
            )}
            <button
              className="p-2 rounded-lg transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
              title="Settings"
              aria-label="Activity settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
              aria-label="Close activity feed"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 sm:px-5 py-2 border-b border-gray-200 dark:border-gray-800 flex gap-1 overflow-x-auto">
        {FILTER_OPTIONS.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setActiveFilter(filter.key)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              activeFilter === filter.key
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-500 dark:text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              Failed to load activity feed
            </p>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <BellOff className="w-8 h-8 text-gray-400 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {activeFilter === 'all' ? 'No agent activity yet' : `No ${activeFilter} activity`}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-1 max-w-[240px]">
              Your AI agent is monitoring your deals, meetings, and pipeline. Activity will appear here as it works.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            <AnimatePresence>
              {activities.map((activity) => {
                const { Icon, color } = getSequenceConfig(activity.sequence_type);
                const colors = getColorClasses(color);
                const isExpanded = expandedItems.has(activity.id);

                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={cn(
                      'px-4 sm:px-5 py-4 sm:py-5 transition-colors cursor-pointer group',
                      !activity.is_read && 'bg-blue-50/50 dark:bg-gray-800/30',
                      'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    )}
                    onClick={() => handleItemClick(activity)}
                  >
                    <div className="flex gap-3 sm:gap-4">
                      {/* Icon */}
                      <div
                        className={cn(
                          'p-2.5 rounded-lg flex-shrink-0 flex items-center justify-center',
                          colors.bg
                        )}
                      >
                        <Icon className={cn('w-5 h-5', colors.text)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Title */}
                            <p
                              className={cn(
                                'text-sm sm:text-base font-medium leading-snug',
                                !activity.is_read
                                  ? 'text-gray-900 dark:text-white'
                                  : 'text-gray-700 dark:text-gray-300'
                              )}
                            >
                              {activity.title}
                            </p>

                            {/* Summary (truncated unless expanded) */}
                            <p
                              className={cn(
                                'text-xs sm:text-sm mt-1 text-gray-500 dark:text-gray-400 leading-normal',
                                !isExpanded && 'line-clamp-2'
                              )}
                            >
                              {activity.summary}
                            </p>

                            {/* Sequence Type Badge */}
                            <div className="mt-2">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                                  colors.bg,
                                  colors.text
                                )}
                              >
                                {formatSequenceType(activity.sequence_type)}
                              </span>
                            </div>
                          </div>

                          {/* Unread indicator */}
                          {!activity.is_read && (
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                          )}
                        </div>

                        {/* Footer (timestamp + expand indicator) */}
                        <div className="flex items-center justify-between gap-2 mt-3">
                          <span className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0">
                            {formatDistanceToNow(new Date(activity.created_at), {
                              addSuffix: true,
                            })}
                          </span>

                          {/* Expand/collapse indicator */}
                          <motion.div
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          </motion.div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer (Load More) */}
      {hasNextPage && (
        <div className="p-4 sm:p-5 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
