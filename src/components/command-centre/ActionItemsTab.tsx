import { CheckCircle2, Circle, Plus, Clock, User, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMeetingActionItems, type MeetingActionItem } from '@/lib/hooks/useMeetingActionItems';
import { useCreateTask } from '@/lib/hooks/useTaskActions';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ActionItemsTabProps {
  meetingId: string | null | undefined;
}

export function ActionItemsTab({ meetingId }: ActionItemsTabProps) {
  const { data: items, isLoading } = useMeetingActionItems(meetingId);
  const createTask = useCreateTask();

  if (!meetingId) {
    return (
      <div className="flex items-center justify-center h-32 text-[11px] text-slate-400 dark:text-gray-500">
        No meeting linked to this task
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse rounded-lg bg-slate-100 dark:bg-gray-800/50 h-12" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-[11px] text-slate-400 dark:text-gray-500">
        No action items from this meeting
      </div>
    );
  }

  const handleCreateTask = (item: MeetingActionItem) => {
    createTask.mutate({
      title: item.title,
      description: item.description,
      priority: item.priority || 'medium',
      task_type: 'general',
      due_date: item.due_date,
      source: 'meeting_ai',
      metadata: {
        meeting_action_item_id: item.id,
        meeting_id: meetingId,
      },
    }, {
      onSuccess: () => {
        toast.success(`Task created: ${item.title}`);
      },
    });
  };

  const completedCount = items.filter(i => i.status === 'completed' || i.status === 'done').length;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-500 dark:text-gray-400">
          {completedCount}/{items.length} completed
        </span>
        <div className="h-1.5 w-20 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Action items list */}
      <div className="space-y-1.5">
        {items.map((item) => {
          const isCompleted = item.status === 'completed' || item.status === 'done';
          const isSynced = !!item.synced_task_id;
          const isOverdue = item.due_date && new Date(item.due_date) < new Date() && !isCompleted;

          return (
            <div
              key={item.id}
              className={cn(
                'rounded-lg border p-2.5 transition-colors',
                isCompleted
                  ? 'border-slate-100 dark:border-gray-800/30 bg-slate-50/50 dark:bg-gray-800/20'
                  : 'border-slate-200 dark:border-gray-700/50'
              )}
            >
              <div className="flex items-start gap-2">
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-300 dark:text-gray-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-xs font-medium',
                    isCompleted
                      ? 'text-slate-400 dark:text-gray-500 line-through'
                      : 'text-slate-700 dark:text-gray-300'
                  )}>
                    {item.title}
                  </p>

                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {item.assignee_name && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-gray-500">
                        <User className="h-2.5 w-2.5" /> {item.assignee_name}
                      </span>
                    )}
                    {item.due_date && (
                      <span className={cn(
                        'inline-flex items-center gap-0.5 text-[10px]',
                        isOverdue ? 'text-red-500 font-medium' : 'text-slate-400 dark:text-gray-500'
                      )}>
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {isOverdue && <AlertTriangle className="h-2.5 w-2.5" />}
                      </span>
                    )}
                    {isSynced && (
                      <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium">
                        Synced to task
                      </span>
                    )}
                  </div>
                </div>

                {/* Create task button for unsynced items */}
                {!isSynced && !isCompleted && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] gap-1 shrink-0"
                    onClick={() => handleCreateTask(item)}
                    disabled={createTask.isPending}
                  >
                    <Plus className="h-2.5 w-2.5" /> Task
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
