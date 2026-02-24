import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell, X, Check, CheckCheck, Trash2, Settings, Filter,
  Sparkles, Zap, Target, FileText, Users, Calendar, Clock,
  AlertCircle, TrendingUp, MessageSquare, Link2, Play,
  ChevronRight, MoreHorizontal, Archive, Star, RefreshCw,
  Loader2, BellOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Notification, NotificationCategory } from '@/lib/services/notificationService';

interface NotificationCenterProps {
  onClose?: () => void;
}

type TabId = 'all' | 'ai' | 'tasks' | 'content' | 'team';

interface Tab {
  id: TabId;
  label: string;
  icon?: typeof Bell;
}

const TABS: Tab[] = [
  { id: 'all', label: 'All', icon: Bell },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'tasks', label: 'Tasks', icon: Target },
  { id: 'content', label: 'Content', icon: FileText },
  { id: 'team', label: 'Team', icon: Users },
];

// Map DB categories/entity_types to UI tabs
function getNotificationTab(notification: Notification): TabId {
  const { category, entity_type, metadata } = notification;

  // AI tab: meeting debriefs, AI-generated content, insights
  if (
    entity_type === 'meeting_debrief' ||
    entity_type === 'ai_insight' ||
    entity_type === 'ai_draft' ||
    entity_type === 'ai_suggestion' ||
    metadata?.ai_generated ||
    metadata?.type === 'ai-complete' ||
    metadata?.type === 'ai-suggestion' ||
    metadata?.type === 'ai-insight'
  ) {
    return 'ai';
  }

  // Tasks tab: task-related notifications
  if (
    category === 'task' ||
    entity_type === 'task' ||
    entity_type === 'task_due' ||
    entity_type === 'task_overdue' ||
    metadata?.type === 'task-due' ||
    metadata?.type === 'task-overdue'
  ) {
    return 'tasks';
  }

  // Content tab: drafts, meeting notes, content suggestions
  if (
    entity_type === 'content' ||
    entity_type === 'draft' ||
    entity_type === 'meeting_note' ||
    metadata?.type === 'content-scheduled' ||
    metadata?.type === 'content-engagement'
  ) {
    return 'content';
  }

  // Team tab: team-level digests, mentions
  if (
    category === 'team' ||
    entity_type === 'digest' ||
    entity_type === 'team_mention' ||
    metadata?.type === 'team-mention'
  ) {
    return 'team';
  }

  // Default to 'all' for unmapped notifications
  return 'all';
}

// Get icon for notification based on type/category
function getNotificationIcon(notification: Notification) {
  const { type, category, entity_type, metadata } = notification;

  // Priority-based icons
  if (metadata?.priority === 'critical' || type === 'error') {
    return { Icon: AlertCircle, color: 'rose' };
  }
  if (metadata?.priority === 'high' || type === 'warning') {
    return { Icon: Clock, color: 'amber' };
  }

  // Category/entity-based icons
  if (getNotificationTab(notification) === 'ai') {
    if (metadata?.type === 'ai-complete') return { Icon: Sparkles, color: 'purple' };
    if (metadata?.type === 'ai-suggestion') return { Icon: Zap, color: 'purple' };
    if (metadata?.type === 'ai-insight') return { Icon: TrendingUp, color: 'purple' };
    return { Icon: Sparkles, color: 'purple' };
  }

  if (getNotificationTab(notification) === 'tasks') {
    if (entity_type === 'task_overdue' || metadata?.type === 'task-overdue') {
      return { Icon: Clock, color: 'amber' };
    }
    return { Icon: Target, color: 'amber' };
  }

  if (getNotificationTab(notification) === 'content') {
    if (metadata?.type === 'content-scheduled') return { Icon: Calendar, color: 'blue' };
    if (metadata?.type === 'content-engagement') return { Icon: MessageSquare, color: 'blue' };
    return { Icon: FileText, color: 'blue' };
  }

  if (getNotificationTab(notification) === 'team') {
    return { Icon: Users, color: 'emerald' };
  }

  // Default icons by type
  switch (type) {
    case 'success':
      return { Icon: Check, color: 'emerald' };
    case 'warning':
      return { Icon: AlertCircle, color: 'amber' };
    case 'error':
      return { Icon: AlertCircle, color: 'rose' };
    default:
      return { Icon: Bell, color: 'gray' };
  }
}

const GROUP_LABELS: Record<TabId, string> = {
  all: 'All Notifications',
  ai: 'AI & Automation',
  tasks: 'Tasks & Goals',
  content: 'Content & Publishing',
  team: 'Team & Collaboration',
};

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [expandedGroup, setExpandedGroup] = useState<TabId | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    loadMore
  } = useNotifications({ limit: 50 });

  // Group notifications by tab
  const groupedNotifications = useMemo(() => {
    const groups: Record<TabId, Notification[]> = {
      all: [],
      ai: [],
      tasks: [],
      content: [],
      team: [],
    };

    notifications.forEach(notification => {
      const tab = getNotificationTab(notification);
      groups[tab].push(notification);
      groups.all.push(notification);
    });

    return groups;
  }, [notifications]);

  // Get notifications for current tab
  const displayNotifications = useMemo(() => {
    if (activeTab === 'all') {
      // When on "All" tab, show all notifications in a flat list
      return [['all', groupedNotifications.all]];
    }
    return [[activeTab, groupedNotifications[activeTab] || []]];
  }, [activeTab, groupedNotifications]);

  // Get tab counts
  const tabCounts = useMemo(() => {
    return {
      all: notifications.length,
      ai: groupedNotifications.ai.length,
      tasks: groupedNotifications.tasks.length,
      content: groupedNotifications.content.length,
      team: groupedNotifications.team.length,
    };
  }, [notifications.length, groupedNotifications]);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    if (notification.action_url) {
      if (notification.action_url.startsWith('/')) {
        navigate(notification.action_url);
        onClose?.();
      } else {
        window.open(notification.action_url, '_blank');
      }
    }
  };

  const getColorClasses = (color: string, isDark = true) => {
    const colors: Record<string, { bg: string; text: string }> = {
      purple: {
        bg: isDark ? 'bg-purple-500/20' : 'bg-purple-100',
        text: 'text-purple-600 dark:text-purple-400',
      },
      amber: {
        bg: isDark ? 'bg-amber-500/20' : 'bg-amber-100',
        text: 'text-amber-600 dark:text-amber-400',
      },
      blue: {
        bg: isDark ? 'bg-blue-500/20' : 'bg-blue-100',
        text: 'text-blue-600 dark:text-blue-400',
      },
      emerald: {
        bg: isDark ? 'bg-emerald-500/20' : 'bg-emerald-100',
        text: 'text-emerald-600 dark:text-emerald-400',
      },
      rose: {
        bg: isDark ? 'bg-rose-500/20' : 'bg-rose-100',
        text: 'text-rose-600 dark:text-rose-400',
      },
      gray: {
        bg: isDark ? 'bg-gray-500/20' : 'bg-gray-100',
        text: 'text-gray-600 dark:text-gray-400',
      },
    };
    return colors[color] || colors.gray;
  };

  return (
    <div className="
      w-full h-full sm:w-[480px] sm:h-auto sm:max-h-[700px]
      bg-white dark:bg-gray-900/95 backdrop-blur-sm
      border-0 sm:border border-gray-200 dark:border-gray-700/50
      rounded-none sm:rounded-lg shadow-2xl
      overflow-hidden flex flex-col
    ">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Bell className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white truncate">Notifications</h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-500">
                {unreadCount} unread
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="p-2 rounded-lg transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                title="Mark all as read"
                aria-label="Mark all notifications as read"
              >
                <CheckCheck className="w-5 h-5" />
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded-lg transition-all duration-200 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                title="Delete all notifications"
                aria-label="Delete all notifications"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              className="p-2 rounded-lg transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
              title="Settings"
              aria-label="Notification settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
              aria-label="Close notifications"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-5 gap-1.5">
          {TABS.map((tab) => {
            const count = tabCounts[tab.id];
            const unreadInTab = groupedNotifications[tab.id]?.filter(n => !n.read).length || 0;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'all') {
                    setExpandedGroup(null);
                  }
                }}
                className={cn(
                  "flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                  activeTab === tab.id
                    ? "bg-blue-500/20 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                )}
                title={tab.label}
              >
                {tab.icon && <tab.icon className="w-4 h-4 flex-shrink-0" />}
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full text-xs font-bold flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center",
                      activeTab === tab.id
                        ? "bg-blue-500/30 dark:bg-blue-500/30"
                        : "bg-gray-200 dark:bg-gray-800"
                    )}
                  >
                    {unreadInTab > 0 ? unreadInTab : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-500 dark:text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">{error}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <BellOff className="w-8 h-8 text-gray-400 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              No notifications yet
            </p>
          </div>
        ) : (
          displayNotifications.map(([groupId, groupNotifications]) => {
            if (groupNotifications.length === 0) return null;

            const groupIdTyped = groupId as TabId;
            // Always expanded - no collapsed groups
            const isExpanded = true;

            return (
              <div key={groupId}>
                {/* Group headers removed - showing flat list */}

                {isExpanded && (
                  <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    <AnimatePresence>
                      {groupNotifications.map((notification) => {
                        const { Icon, color } = getNotificationIcon(notification);
                        const colors = getColorClasses(color);

                        return (
                          <motion.div
                            key={notification.id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className={cn(
                              "px-4 sm:px-5 py-4 sm:py-5 transition-colors cursor-pointer group",
                              !notification.read && "bg-blue-50/50 dark:bg-gray-800/30",
                              "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                            )}
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <div className="flex gap-3 sm:gap-4">
                              <div className={cn("p-2.5 rounded-lg flex-shrink-0 flex items-center justify-center", colors.bg)}>
                                <Icon className={cn("w-5 h-5", colors.text)} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p
                                      className={cn(
                                        "text-sm sm:text-base font-medium leading-snug",
                                        !notification.read
                                          ? "text-gray-900 dark:text-white"
                                          : "text-gray-700 dark:text-gray-300"
                                      )}
                                    >
                                      {notification.title}
                                    </p>
                                    <p className="text-xs sm:text-sm mt-1 text-gray-500 dark:text-gray-400 line-clamp-2 leading-normal">
                                      {notification.message}
                                    </p>
                                  </div>
                                  {!notification.read && (
                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                                  )}
                                </div>

                                <div className="flex items-center justify-between gap-2 mt-3">
                                  <span className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0">
                                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                  </span>

                                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        markAsRead(notification.id);
                                      }}
                                      className="p-1.5 rounded-lg transition-all duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                                      title="Mark as read"
                                      aria-label="Mark as read"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteNotification(notification.id);
                                      }}
                                      className="p-1.5 rounded-lg transition-all duration-200 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                                      title="Delete notification"
                                      aria-label="Delete notification"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                {notification.metadata?.priority && (
                                  <div
                                    className={cn(
                                      "mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                                      notification.metadata.priority === 'critical'
                                        ? "bg-rose-500/20 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400"
                                        : "bg-amber-500/20 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                                    )}
                                  >
                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span>{notification.metadata.priority}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Delete all confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all notifications?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all your notifications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearAll()}
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
