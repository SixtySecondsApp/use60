import { motion } from 'framer-motion';
import {
  Mail,
  Inbox,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Link2,
  RefreshCw,
  Sparkles,
  Archive,
  Trash2,
  Star,
  Send
} from 'lucide-react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
}

/**
 * Base Empty State Component
 */
export function EmptyState({ icon, title, description, action, secondaryAction }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex items-center justify-center p-8"
    >
      <div className="text-center max-w-md">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-300 dark:border-gray-700/50 mb-6"
        >
          <div className="text-gray-600 dark:text-gray-400">
            {icon}
          </div>
        </motion.div>

        {/* Title */}
        <motion.h3
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-xl font-semibold text-gray-200 mb-2"
        >
          {title}
        </motion.h3>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-gray-500 mb-6"
        >
          {description}
        </motion.p>

        {/* Actions */}
        {(action || secondaryAction) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            {action && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={action.onClick}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {action.icon}
                {action.label}
              </motion.button>
            )}

            {secondaryAction && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={secondaryAction.onClick}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {secondaryAction.icon}
                {secondaryAction.label}
              </motion.button>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * No Emails Empty State - Clean inbox
 */
export function NoEmailsEmptyState() {
  return (
    <EmptyState
      icon={<CheckCircle2 className="w-10 h-10" />}
      title="All caught up!"
      description="You've reached inbox zero. Great job staying on top of your emails!"
    />
  );
}

/**
 * No Search Results Empty State
 */
export function NoSearchResultsEmptyState({ query, onClearSearch }: { query: string; onClearSearch: () => void }) {
  return (
    <EmptyState
      icon={<Search className="w-10 h-10" />}
      title="No results found"
      description={`We couldn't find any emails matching "${query}". Try adjusting your search terms.`}
      action={{
        label: 'Clear Search',
        onClick: onClearSearch,
        icon: <RefreshCw className="w-4 h-4" />
      }}
    />
  );
}

/**
 * No Filtered Emails Empty State
 */
export function NoFilteredEmailsEmptyState({ filterType, onClearFilters }: { filterType: string; onClearFilters: () => void }) {
  const getFilterMessage = () => {
    switch (filterType) {
      case 'unread':
        return 'No unread emails. You\'re all caught up!';
      case 'starred':
        return 'No starred emails yet. Star important emails to find them quickly.';
      case 'important':
        return 'No important emails right now.';
      default:
        return 'No emails match your current filters.';
    }
  };

  return (
    <EmptyState
      icon={<Filter className="w-10 h-10" />}
      title="No emails found"
      description={getFilterMessage()}
      action={{
        label: 'Clear Filters',
        onClick: onClearFilters,
        icon: <RefreshCw className="w-4 h-4" />
      }}
    />
  );
}

/**
 * Gmail Not Connected Empty State
 */
export function GmailNotConnectedEmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <EmptyState
      icon={<Mail className="w-10 h-10" />}
      title="Connect your Gmail account"
      description="Connect your Google account to access and manage your emails directly from this dashboard."
      action={{
        label: 'Connect Gmail',
        onClick: onConnect,
        icon: <Link2 className="w-4 h-4" />
      }}
    />
  );
}

/**
 * Email Loading Error Empty State
 */
export function EmailErrorEmptyState({ onRetry, error }: { onRetry: () => void; error?: string }) {
  return (
    <EmptyState
      icon={<AlertCircle className="w-10 h-10" />}
      title="Failed to load emails"
      description={error || "We couldn't load your emails. This might be a temporary issue."}
      action={{
        label: 'Retry',
        onClick: onRetry,
        icon: <RefreshCw className="w-4 h-4" />
      }}
    />
  );
}

/**
 * Folder-Specific Empty States
 */
export function EmptyInboxState() {
  return (
    <EmptyState
      icon={<Inbox className="w-10 h-10" />}
      title="Your inbox is empty"
      description="No new emails. Enjoy the peace and quiet!"
    />
  );
}

export function EmptyStarredState() {
  return (
    <EmptyState
      icon={<Star className="w-10 h-10" />}
      title="No starred emails"
      description="Star important emails to find them quickly later."
    />
  );
}

export function EmptySentState({ onCompose }: { onCompose: () => void }) {
  return (
    <EmptyState
      icon={<Send className="w-10 h-10" />}
      title="No sent emails"
      description="You haven't sent any emails yet. Start a conversation!"
      action={{
        label: 'Compose Email',
        onClick: onCompose,
        icon: <Sparkles className="w-4 h-4" />
      }}
    />
  );
}

export function EmptyArchiveState() {
  return (
    <EmptyState
      icon={<Archive className="w-10 h-10" />}
      title="Archive is empty"
      description="Archived emails will appear here."
    />
  );
}

export function EmptyTrashState() {
  return (
    <EmptyState
      icon={<Trash2 className="w-10 h-10" />}
      title="Trash is empty"
      description="Deleted emails will appear here for 30 days before being permanently removed."
    />
  );
}

/**
 * Generic Empty State with Custom Content
 */
export function CustomEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={actionLabel && onAction ? {
        label: actionLabel,
        onClick: onAction,
      } : undefined}
    />
  );
}
