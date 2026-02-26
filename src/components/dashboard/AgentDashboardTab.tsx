/**
 * AgentDashboardTab — AI Agent activity timeline + stats panel for the Dashboard
 *
 * Shows a real-time activity feed with filtering, read/unread tracking,
 * triage analytics, and activity breakdown by category.
 */

import { useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  ChevronDown,
  Loader2,
  BellOff,
  Bell,
  Layers,
  Settings,
  Bot,
  TrendingUp,
} from 'lucide-react';
import {
  useAgentActivityFeed,
  useAgentActivityUnreadCount,
  useMarkAgentActivityRead,
  useMarkAllAgentActivityRead,
  type AgentActivity,
} from '@/hooks/useAgentActivity';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { cn } from '@/lib/utils';

// --- Reused from AgentActivityFeed.tsx ---

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

function getSequenceConfig(sequenceType: string) {
  return SEQUENCE_TYPE_CONFIG[sequenceType] || { Icon: FileText, color: 'gray', label: sequenceType, category: 'admin' };
}

function getColorClasses(color: string) {
  const colors: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
    purple: { bg: 'bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400' },
    amber: { bg: 'bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
    emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
    indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400' },
    rose: { bg: 'bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400' },
    cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400' },
    violet: { bg: 'bg-violet-500/20', text: 'text-violet-600 dark:text-violet-400' },
    teal: { bg: 'bg-teal-500/20', text: 'text-teal-600 dark:text-teal-400' },
    gray: { bg: 'bg-gray-500/20', text: 'text-gray-600 dark:text-gray-400' },
  };
  return colors[color] || colors.gray;
}

// --- Triage stats type ---

interface TriageStats {
  total: number;
  delivered: number;
  suppressed: number;
  batched: number;
  failed: number;
}

// --- Component ---

export default function AgentDashboardTab() {
  const activeOrgId = useActiveOrgId();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Activity feed
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAgentActivityFeed({ orgId: activeOrgId, limit: 20 });

  const { data: unreadCount = 0 } = useAgentActivityUnreadCount(activeOrgId);
  const markAsRead = useMarkAgentActivityRead();
  const markAllAsRead = useMarkAllAgentActivityRead();

  // Triage stats (7-day window)
  const { data: triageStats } = useQuery({
    queryKey: ['agent-triage-stats', user?.id, activeOrgId],
    queryFn: async (): Promise<TriageStats> => {
      if (!user?.id) return { total: 0, delivered: 0, suppressed: 0, batched: 0, failed: 0 };
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('notification_queue')
        .select('triage_status')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo);
      if (error) throw error;
      const items = data || [];
      return {
        total: items.length,
        delivered: items.filter((i) => i.triage_status === 'delivered').length,
        suppressed: items.filter((i) => i.triage_status === 'suppressed').length,
        batched: items.filter((i) => i.triage_status === 'batched').length,
        failed: items.filter((i) => i.triage_status === 'failed').length,
      };
    },
    enabled: !!user?.id,
  });

  // Agent persona name
  const { data: agentName } = useQuery({
    queryKey: ['agent-persona-name', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return null;
      const { data } = await supabase
        .from('agent_persona')
        .select('name')
        .eq('org_id', activeOrgId)
        .maybeSingle();
      return data?.name || null;
    },
    enabled: !!activeOrgId,
  });

  // Flatten pages + filter
  const allActivities = data?.pages.flat() || [];
  const activities = activeFilter === 'all'
    ? allActivities
    : allActivities.filter((a) => {
        const config = SEQUENCE_TYPE_CONFIG[a.sequence_type];
        return config?.category === activeFilter;
      });

  // Category breakdown counts
  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = { meetings: 0, deals: 0, outreach: 0, admin: 0 };
    for (const a of allActivities) {
      const config = SEQUENCE_TYPE_CONFIG[a.sequence_type];
      const cat = config?.category || 'admin';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [allActivities]);

  const maxCategoryCount = Math.max(...Object.values(categoryBreakdown), 1);

  // Time saved estimate
  const timeSavedMinutes = (triageStats?.suppressed || 0) * 2;
  const timeSavedDisplay = timeSavedMinutes >= 60
    ? `${Math.floor(timeSavedMinutes / 60)}h ${timeSavedMinutes % 60}m`
    : `${timeSavedMinutes}m`;

  const handleItemClick = async (activity: AgentActivity) => {
    if (!activity.is_read) {
      await markAsRead.mutateAsync([activity.id]);
    }
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

  const handleMarkAllAsRead = async () => {
    if (!activeOrgId) return;
    await markAllAsRead.mutateAsync(activeOrgId);
  };

  const totalHandled = triageStats?.total || allActivities.length;
  const heroText = agentName
    ? `${agentName} handled ${totalHandled} items, saving ~${timeSavedDisplay}`
    : `Your agent handled ${totalHandled} items, saving ~${timeSavedDisplay}`;

  const triageMetricCards = [
    { label: 'Delivered', value: triageStats?.delivered || 0, Icon: Bell, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Suppressed', value: triageStats?.suppressed || 0, Icon: BellOff, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-500/10' },
    { label: 'Batched', value: triageStats?.batched || 0, Icon: Layers, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Saved', value: timeSavedDisplay, Icon: Clock, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  ];

  const categoryLabels: Record<string, string> = {
    meetings: 'Meetings',
    deals: 'Deals',
    outreach: 'Outreach',
    admin: 'Admin',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Hero Bar */}
      <div className="bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50 rounded-xl p-5 flex items-center gap-4 shadow-sm dark:shadow-none">
        <div className="p-3 rounded-xl bg-emerald-500/10">
          <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{heroText}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Last 7 days</p>
        </div>
      </div>

      {/* Main Grid: Timeline + Stats */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Activity Timeline (3/5) */}
        <div className="lg:w-3/5">
          <div className="bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50 rounded-xl shadow-sm dark:shadow-none overflow-hidden">
            {/* Filter Pills + Mark Read */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800/50 flex items-center justify-between gap-2">
              <div className="flex gap-1.5 overflow-x-auto">
                {FILTER_OPTIONS.map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setActiveFilter(filter.key)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                      activeFilter === filter.key
                        ? 'bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors whitespace-nowrap"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark read
                </button>
              )}
            </div>

            {/* Activity List */}
            <div className="max-h-[600px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Failed to load activity feed</p>
                </div>
              ) : activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <BellOff className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {activeFilter === 'all' ? 'No agent activity yet' : `No ${activeFilter} activity`}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-1.5 max-w-[280px]">
                    Your AI agent is monitoring your deals, meetings, and pipeline. Activity will appear here as it works.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  <AnimatePresence>
                    {activities.map((activity) => {
                      const { Icon, color, label } = getSequenceConfig(activity.sequence_type);
                      const colors = getColorClasses(color);
                      const isExpanded = expandedItems.has(activity.id);

                      return (
                        <motion.div
                          key={activity.id}
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className={cn(
                            'px-4 py-4 transition-colors cursor-pointer',
                            !activity.is_read && 'bg-blue-50/30 dark:bg-blue-950/10',
                            'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                          )}
                          onClick={() => handleItemClick(activity)}
                        >
                          <div className="flex gap-3">
                            <div className={cn('p-2 rounded-lg flex-shrink-0', colors.bg)}>
                              <Icon className={cn('w-4 h-4', colors.text)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className={cn(
                                    'text-sm font-medium leading-snug',
                                    !activity.is_read ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
                                  )}>
                                    {activity.title}
                                  </p>
                                  <p className={cn(
                                    'text-xs mt-1 text-gray-500 dark:text-gray-400 leading-relaxed',
                                    !isExpanded && 'line-clamp-2'
                                  )}>
                                    {activity.summary}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className={cn(
                                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium',
                                      colors.bg, colors.text
                                    )}>
                                      {label}
                                    </span>
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                                  {!activity.is_read && (
                                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                                  )}
                                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                  </motion.div>
                                </div>
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

            {/* Load More */}
            {hasNextPage && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800/50">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
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
        </div>

        {/* Stats Panel (2/5) */}
        <div className="lg:w-2/5 space-y-5">
          {/* Triage Metric Cards */}
          <div className="grid grid-cols-2 gap-3">
            {triageMetricCards.map((metric) => (
              <div
                key={metric.label}
                className="bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50 rounded-xl p-4 shadow-sm dark:shadow-none"
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn('p-1.5 rounded-lg', metric.bg)}>
                    <metric.Icon className={cn('w-4 h-4', metric.color)} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{metric.value}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{metric.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Activity Breakdown */}
          <div className="bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50 rounded-xl p-4 shadow-sm dark:shadow-none">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Activity Breakdown</h3>
            <div className="space-y-3">
              {Object.entries(categoryBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([category, count]) => (
                  <div key={category} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">{categoryLabels[category] || category}</span>
                        <span className="text-xs font-medium text-gray-900 dark:text-white">{count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500/70 rounded-full transition-all"
                          style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Settings Link */}
          <button
            onClick={() => navigate('/settings/proactive-agent')}
            className="w-full flex items-center gap-2.5 bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50 rounded-xl p-4 shadow-sm dark:shadow-none text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors group"
          >
            <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
            <span>Agent Settings</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
