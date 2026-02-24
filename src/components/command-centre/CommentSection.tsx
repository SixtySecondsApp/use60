import { useState } from 'react';
import { Send, Bot, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAddComment } from '@/lib/hooks/useTaskActions';

interface Comment {
  id: string;
  author: string;
  content: string;
  is_ai: boolean;
  created_at: string;
}

interface CommentSectionProps {
  taskId: string;
  comments: Comment[];
}

export function CommentSection({ taskId, comments }: CommentSectionProps) {
  const [newComment, setNewComment] = useState('');
  const addComment = useAddComment();

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addComment.mutate({ taskId, content: newComment.trim() });
    setNewComment('');
  };

  return (
    <div className="space-y-3">
      {/* Existing comments */}
      {comments.map((comment) => (
        <div key={comment.id} className="flex items-start gap-2">
          <div className={cn(
            'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
            comment.is_ai ? 'bg-violet-100 dark:bg-violet-500/20' : 'bg-blue-100 dark:bg-blue-500/20'
          )}>
            {comment.is_ai ? (
              <Bot className="h-2.5 w-2.5 text-violet-500" />
            ) : (
              <UserCircle className="h-2.5 w-2.5 text-blue-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-700 dark:text-gray-300">
                {comment.is_ai ? 'AI' : comment.author?.split('@')[0] || 'You'}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-gray-500">
                {new Date(comment.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">{comment.content}</p>
          </div>
        </div>
      ))}

      {/* Add comment input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newComment.trim()) handleSubmit();
          }}
          placeholder="Add a note..."
          className="flex-1 h-7 rounded-md border border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 px-2 text-xs text-slate-700 dark:text-gray-300 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          disabled={!newComment.trim() || addComment.isPending}
          onClick={handleSubmit}
        >
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
