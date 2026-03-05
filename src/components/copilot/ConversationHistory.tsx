/**
 * Conversation History Component
 * Displays a list of past CoPilot conversations
 */

import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Trash2, Plus, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { useConversationHistory, useDeleteConversation, ConversationSummary } from '@/lib/hooks/useConversationHistory';
import { toast } from 'sonner';

interface ConversationHistoryProps {
  currentConversationId?: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  className?: string;
  /** Compact mode for right panel - hides header and reduces padding */
  compact?: boolean;
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  className,
  compact = false
}) => {
  const { data: conversations, isLoading, error } = useConversationHistory(20);
  const deleteConversation = useDeleteConversation();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    setConfirmDeleteId(conversationId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    const conversationId = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(conversationId);

    try {
      await deleteConversation.mutateAsync(conversationId);
      toast.success('Conversation deleted');

      // If deleting the current conversation, navigate to a new one
      if (conversationId === currentConversationId) {
        onNewConversation();
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast.error('Failed to delete conversation');
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Recently';
    }
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4 text-sm text-red-500', className)}>
        Failed to load conversations
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header - hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700/50">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            History
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewConversation}
            className="h-8 px-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto scrollbar-custom">
        {!conversations || conversations.length === 0 ? (
          <div className={cn(
            'flex flex-col items-center justify-center text-center',
            compact ? 'p-4' : 'p-6'
          )}>
            <MessageSquare className={cn(
              'text-gray-300 dark:text-gray-600 mb-2',
              compact ? 'w-6 h-6' : 'w-8 h-8'
            )} />
            <p className={cn(
              'text-gray-500 dark:text-gray-400',
              compact ? 'text-xs' : 'text-sm'
            )}>
              No conversations yet
            </p>
            {!compact && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Start a new chat to begin
              </p>
            )}
          </div>
        ) : (
          <ul className={compact ? 'py-1' : 'py-2'}>
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === currentConversationId}
                onClick={() => onSelectConversation(conv.id)}
                onDelete={(e) => handleDeleteClick(e, conv.id)}
                isDeleting={deletingId === conv.id}
                formatTime={formatTime}
                compact={compact}
              />
            ))}
          </ul>
        )}
      </div>

      {/* New conversation button in compact mode */}
      {compact && (
        <button
          type="button"
          onClick={onNewConversation}
          className={cn(
            'w-full py-2 text-xs text-center',
            'text-slate-500 hover:text-violet-400',
            'border-t border-white/5 hover:bg-white/[0.02]',
            'transition-colors'
          )}
        >
          + New conversation
        </button>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface ConversationItemProps {
  conversation: ConversationSummary;
  isActive: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isDeleting: boolean;
  formatTime: (date: string) => string;
  compact?: boolean;
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isActive,
  onClick,
  onDelete,
  isDeleting,
  formatTime,
  compact = false
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full flex items-start gap-2 text-left transition-colors group cursor-pointer',
          compact ? 'px-2 py-2' : 'px-4 py-3 gap-3',
          compact
            ? 'hover:bg-white/[0.03] rounded-lg'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
          isActive && (compact
            ? 'bg-violet-500/10 border-l-2 border-violet-500'
            : 'bg-violet-50 dark:bg-violet-900/20 border-l-2 border-violet-500'
          )
        )}
      >
        <MessageSquare className={cn(
          'mt-0.5 flex-shrink-0',
          compact ? 'w-3.5 h-3.5' : 'w-4 h-4',
          isActive ? 'text-violet-400' : 'text-gray-400 dark:text-slate-500'
        )} />

        <div className="flex-1 min-w-0">
          <p className={cn(
            'font-medium truncate',
            compact ? 'text-xs' : 'text-sm',
            isActive
              ? (compact ? 'text-violet-300' : 'text-violet-700 dark:text-violet-400')
              : (compact ? 'text-slate-300' : 'text-gray-700 dark:text-gray-300')
          )}>
            {conversation.title || 'New Conversation'}
          </p>

          {!compact && (
            <div className="flex items-center gap-2 mt-1">
              <Clock className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatTime(conversation.updated_at)}
              </span>
              {conversation.message_count > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  · {conversation.message_count} messages
                </span>
              )}
            </div>
          )}

          {compact && (
            <span className="text-[10px] text-slate-500">
              {formatTime(conversation.updated_at)}
            </span>
          )}
        </div>

        {/* Delete button */}
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className={cn(
            'rounded opacity-0 group-hover:opacity-100 transition-opacity',
            compact ? 'p-1' : 'p-1.5',
            'hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500',
            isDeleting && 'opacity-50 cursor-not-allowed'
          )}
          title="Delete conversation"
        >
          {isDeleting ? (
            <Loader2 className={cn('animate-spin', compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
          ) : (
            <Trash2 className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          )}
        </button>
      </div>
    </li>
  );
};

export default ConversationHistory;
