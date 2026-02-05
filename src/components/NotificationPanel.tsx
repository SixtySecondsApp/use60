import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  Info, 
  AlertTriangle,
  Loader2,
  BellOff,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { cn } from '@/lib/utils';
import type { Notification, NotificationType } from '@/lib/services/notificationService';

interface NotificationPanelProps {
  onClose?: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
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
  } = useNotifications({ limit: 20 });

  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.read)
    : notifications;

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Navigate if there's an action URL
    if (notification.action_url) {
      if (notification.action_url.startsWith('/')) {
        navigate(notification.action_url);
        onClose?.();
      } else {
        window.open(notification.action_url, '_blank');
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all notifications?')) {
      await clearAll();
    }
  };

  return (
    <div className="
      w-full h-full sm:w-96 sm:h-auto sm:max-h-[600px]
      bg-white dark:bg-gray-900/95 backdrop-blur-sm
      border-0 sm:border border-gray-200 dark:border-gray-700/50
      rounded-none sm:rounded-lg shadow-2xl
      overflow-hidden flex flex-col
    ">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-lg bg-blue-500/20 dark:bg-blue-500/20 flex-shrink-0">
              <Bell className="w-5 h-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 truncate">Notifications</h3>
              {unreadCount > 0 && (
                <span className="inline-block mt-0.5 px-2 py-0.5 bg-red-500/20 text-red-500 dark:text-red-400 text-xs font-medium rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg transition-all duration-200"
                title="Mark all as read"
                aria-label="Mark all notifications as read"
              >
                <CheckCheck className="w-5 h-5" />
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200"
                title="Clear all"
                aria-label="Clear all notifications"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-800/50 p-1.5 rounded-lg">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              "flex-1 px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all duration-200",
              filter === 'all'
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-700/30"
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={cn(
              "flex-1 px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 whitespace-nowrap",
              filter === 'unread'
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-700/30"
            )}
          >
            <span className="hidden sm:inline">Unread</span>
            <span className="sm:hidden">Unread</span>
            {unreadCount > 0 && (
              <span className="ml-1 text-xs">({unreadCount})</span>
            )}
          </button>
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
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <BellOff className="w-8 h-8 text-gray-400 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            <AnimatePresence>
              {filteredNotifications.map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={cn(
                    "px-4 sm:px-5 py-4 sm:py-5 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer group relative",
                    !notification.read && "bg-gray-50 dark:bg-gray-800/20"
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  {/* Unread indicator */}
                  {!notification.read && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                  )}

                  <div className="flex gap-3 sm:gap-4">
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-1">
                      <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                        {getNotificationIcon(notification.type)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm sm:text-base font-medium leading-snug",
                            notification.read ? "text-gray-700 dark:text-gray-300" : "text-gray-900 dark:text-gray-100"
                          )}>
                            {notification.title}
                          </p>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-normal">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                            </span>
                            {notification.category && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 px-2 py-0.5 bg-gray-200 dark:bg-gray-800 rounded-md">
                                {notification.category}
                              </span>
                            )}
                            {notification.action_url && (
                              <ExternalLink className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                            )}
                          </div>
                        </div>

                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200 flex-shrink-0"
                          title="Delete notification"
                          aria-label="Delete notification"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Load More */}
      {notifications.length >= 20 && (
        <div className="p-4 sm:p-5 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={loadMore}
            className="w-full px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg transition-all duration-200"
          >
            Load more notifications
          </button>
        </div>
      )}
    </div>
  );
}