import { Task } from '@/lib/database/models';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  Bot,
  User,
  CheckCircle,
  Circle,
  FileText,
  Send,
  Edit,
  Trash,
  MessageCircle,
} from 'lucide-react';

interface ActivityTimelineProps {
  task: Task;
}

interface ActivityItem {
  id: string;
  type: 'ai' | 'user' | 'system';
  action: string;
  timestamp: string;
  icon?: 'check' | 'edit' | 'send' | 'comment' | 'create' | 'delete';
}

export function ActivityTimeline({ task }: ActivityTimelineProps) {
  // Build activity items from task data
  const activityItems: ActivityItem[] = [];

  // Add from metadata if available
  if (task.metadata?.activity && Array.isArray(task.metadata.activity)) {
    activityItems.push(...(task.metadata.activity as ActivityItem[]));
  }

  // Generate basic activity from task timestamps
  if (task.created_at) {
    activityItems.push({
      id: 'created',
      type: 'system',
      action: 'Task created',
      timestamp: task.created_at,
      icon: 'create',
    });
  }

  if (task.status === 'draft_ready' && task.updated_at) {
    activityItems.push({
      id: 'draft',
      type: 'ai',
      action: 'Draft content generated',
      timestamp: task.updated_at,
      icon: 'edit',
    });
  }

  if (task.status === 'approved' && task.actioned_at) {
    activityItems.push({
      id: 'approved',
      type: 'user',
      action: 'Task approved',
      timestamp: task.actioned_at,
      icon: 'check',
    });
  }

  if (task.completed_at) {
    activityItems.push({
      id: 'completed',
      type: 'system',
      action: 'Task completed',
      timestamp: task.completed_at,
      icon: 'check',
    });
  }

  // Sort by timestamp (newest first)
  activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const getIcon = (item: ActivityItem) => {
    switch (item.icon) {
      case 'check':
        return CheckCircle;
      case 'edit':
        return Edit;
      case 'send':
        return Send;
      case 'comment':
        return MessageCircle;
      case 'delete':
        return Trash;
      case 'create':
      default:
        return FileText;
    }
  };

  const getTypeColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'ai':
        return {
          bg: 'bg-violet-500',
          ring: 'ring-violet-100 dark:ring-violet-500/20',
        };
      case 'user':
        return {
          bg: 'bg-blue-500',
          ring: 'ring-blue-100 dark:ring-blue-500/20',
        };
      case 'system':
      default:
        return {
          bg: 'bg-slate-400',
          ring: 'ring-slate-100 dark:ring-slate-500/20',
        };
    }
  };

  if (activityItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
          <Circle className="w-6 h-6 text-slate-400 dark:text-slate-500" />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No activity yet
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="space-y-6">
        {activityItems.map((item, index) => {
          const Icon = getIcon(item);
          const colors = getTypeColor(item.type);
          const isLast = index === activityItems.length - 1;

          return (
            <div key={item.id} className="flex gap-4 relative">
              {/* Timeline Line */}
              {!isLast && (
                <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
              )}

              {/* Icon Circle */}
              <div
                className={cn(
                  'shrink-0 w-8 h-8 rounded-full flex items-center justify-center ring-4 z-10',
                  colors.bg,
                  colors.ring
                )}
              >
                {item.type === 'ai' ? (
                  <Bot className="w-4 h-4 text-white" />
                ) : item.type === 'user' ? (
                  <User className="w-4 h-4 text-white" />
                ) : (
                  <Icon className="w-4 h-4 text-white" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pt-0.5">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {item.action}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
