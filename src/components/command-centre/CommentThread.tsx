import { useState } from 'react';
import { Bot, User, Send } from 'lucide-react';
import { Task } from '@/lib/database/models';
import { Button } from '@/components/ui/button';
import { useAddComment } from '@/lib/hooks/useTaskActions';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface CommentThreadProps {
  task: Task;
}

interface Comment {
  id: string;
  author: string;
  content: string;
  is_ai: boolean;
  created_at: string;
}

export function CommentThread({ task }: CommentThreadProps) {
  const [newComment, setNewComment] = useState('');
  const addCommentMutation = useAddComment();

  const comments = (task.metadata?.comments as Comment[]) || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    addCommentMutation.mutate(
      { taskId: task.id, content: newComment, isAI: false },
      {
        onSuccess: () => {
          setNewComment('');
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
              <Bot className="w-6 h-6 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No comments yet. Start the conversation!
            </p>
          </div>
        ) : (
          comments.map((comment) => {
            const isAI = comment.is_ai;
            const initials = comment.author
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <div key={comment.id} className="flex gap-3">
                {/* Avatar */}
                <div
                  className={cn(
                    'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold',
                    isAI
                      ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white'
                      : 'bg-blue-500 text-white'
                  )}
                >
                  {isAI ? <Bot className="w-4 h-4" /> : initials}
                </div>

                {/* Comment Content */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {isAI ? 'AI Assistant' : comment.author}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                    {comment.content}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Comment Input */}
      <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 p-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          {/* User Avatar */}
          <div className="shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>

          {/* Input */}
          <div className="flex-1 relative">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment..."
              className="w-full px-3 py-2 pr-20 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              rows={2}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Press Enter
              </span>
              <Button
                type="submit"
                size="icon"
                className="w-7 h-7"
                disabled={!newComment.trim() || addCommentMutation.isPending}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
