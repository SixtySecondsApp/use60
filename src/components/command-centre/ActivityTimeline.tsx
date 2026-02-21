import { Bot, UserCircle, CheckCircle2, Wand2, Edit, ThumbsUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityEntry {
  action: string;
  actor: string;
  timestamp: string;
}

interface ActivityTimelineProps {
  activities: ActivityEntry[];
}

const actionIcons: Record<string, any> = {
  'ai_draft_generated': Wand2,
  'ai_refined': Edit,
  'user_approved': ThumbsUp,
  'user_dismissed': X,
  'user_edited': Edit,
  'status_changed': CheckCircle2,
};

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (!activities || activities.length === 0) return null;

  return (
    <div className="space-y-2">
      {activities.map((entry, i) => {
        const isAI = entry.actor === 'AI' || entry.actor === 'ai';
        const Icon = actionIcons[entry.action] || (isAI ? Bot : UserCircle);

        return (
          <div key={i} className="flex items-start gap-2.5">
            <div className="relative flex flex-col items-center">
              <div className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center',
                isAI ? 'bg-violet-100 dark:bg-violet-500/20' : 'bg-blue-100 dark:bg-blue-500/20'
              )}>
                <Icon className={cn('h-2.5 w-2.5', isAI ? 'text-violet-500' : 'text-blue-500')} />
              </div>
              {i < activities.length - 1 && (
                <div className="w-px h-4 bg-slate-200 dark:bg-gray-700/50 mt-1" />
              )}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <p className="text-[11px] text-slate-600 dark:text-gray-400">
                {formatAction(entry.action)}
              </p>
              <span className="text-[10px] text-slate-400 dark:text-gray-500">
                {formatTimestamp(entry.timestamp)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    'ai_draft_generated': 'AI generated a draft',
    'ai_refined': 'AI refined the draft',
    'user_approved': 'Approved by user',
    'user_dismissed': 'Dismissed by user',
    'user_edited': 'Edited by user',
    'status_changed': 'Status changed',
    'comment_added': 'Comment added',
  };
  return map[action] || action.replace(/_/g, ' ');
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return ts;
  }
}
