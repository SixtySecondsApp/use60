import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  Mail,
  RefreshCw,
  FileSearch,
  CalendarClock,
  Target,
  FileText,
  Phone,
  Pencil,
  BellRing,
  Lightbulb,
  LayoutList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task } from '@/lib/database/models';

interface SidebarTaskItemProps {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
  childCount?: number;
}

const priorityConfig = {
  urgent: { color: 'text-red-600 dark:text-red-400', dotColor: 'bg-red-500' },
  high: { color: 'text-orange-600 dark:text-orange-400', dotColor: 'bg-orange-500' },
  medium: { color: 'text-blue-600 dark:text-blue-400', dotColor: 'bg-blue-500' },
  low: { color: 'text-slate-500 dark:text-slate-400', dotColor: 'bg-slate-400' },
};

const typeIconMap: Record<string, typeof Mail> = {
  email: Mail,
  follow_up: RefreshCw,
  research: FileSearch,
  meeting_prep: CalendarClock,
  crm_update: Target,
  proposal: FileText,
  call: Phone,
  content: Pencil,
  alert: BellRing,
  insight: Lightbulb,
  meeting: CalendarClock,
  demo: CalendarClock,
  general: Circle,
  slack_message: Mail,
};

const typeConfig: Record<string, { color: string }> = {
  email: { color: 'text-blue-500' },
  follow_up: { color: 'text-purple-500' },
  research: { color: 'text-cyan-500' },
  meeting_prep: { color: 'text-indigo-500' },
  crm_update: { color: 'text-emerald-500' },
  proposal: { color: 'text-amber-500' },
  call: { color: 'text-green-500' },
  content: { color: 'text-pink-500' },
  alert: { color: 'text-red-500' },
  insight: { color: 'text-yellow-500' },
  meeting: { color: 'text-indigo-500' },
  demo: { color: 'text-violet-500' },
  general: { color: 'text-slate-500' },
  slack_message: { color: 'text-purple-500' },
};

export function SidebarTaskItem({ task, isSelected, onClick, childCount }: SidebarTaskItemProps) {
  const TypeIcon = typeIconMap[task.task_type] || Circle;
  const isCompleted = task.status === 'completed';
  const isDraftReady = task.ai_status === 'draft_ready';
  const isAIWorking = task.ai_status === 'working';
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !isCompleted;

  // Extract company name from company field (could be string or Company object)
  const companyName = typeof task.company === 'string' ? task.company : task.company?.name;

  // Calculate due date label
  const dueLabel = (() => {
    if (!task.due_date) return null;
    const d = new Date(task.due_date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (isCompleted) return null;
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  // Calculate subtask progress
  const subtaskCount = task.metadata?.subtask_count as number | undefined;
  const subtaskCompleted = task.metadata?.subtask_completed as number | undefined;

  return (
    <motion.button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-all relative group',
        isSelected
          ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20'
          : 'hover:bg-slate-50 dark:hover:bg-gray-800/40 border border-transparent',
        isCompleted && 'opacity-50',
      )}
      whileTap={{ scale: 0.99 }}
    >
      {/* Priority dot */}
      <div
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full transition-opacity',
          priorityConfig[task.priority].dotColor,
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50',
        )}
      />

      <div className="flex items-start gap-2.5">
        {/* Status indicator */}
        <div className="pt-0.5 shrink-0">
          {isCompleted ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : isAIWorking ? (
            <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
          ) : isDraftReady ? (
            <Sparkles className="h-4 w-4 text-emerald-500" />
          ) : (
            <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <div
            className={cn(
              'text-[13px] font-medium leading-tight line-clamp-2',
              isSelected ? 'text-blue-900 dark:text-blue-200' : 'text-slate-700 dark:text-gray-300',
              isCompleted && 'line-through text-slate-400 dark:text-gray-500',
            )}
          >
            {task.title}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-1.5 mt-1">
            <TypeIcon className={cn('h-3 w-3', typeConfig[task.task_type]?.color || 'text-slate-500')} />
            {companyName && (
              <span className="text-[11px] text-slate-500 dark:text-gray-400 truncate">{companyName}</span>
            )}
            {companyName && dueLabel && <span className="text-slate-300 dark:text-gray-600">·</span>}
            {dueLabel && (
              <span
                className={cn(
                  'text-[11px]',
                  isOverdue ? 'text-red-500 font-medium' : 'text-slate-400 dark:text-gray-500'
                )}
              >
                {dueLabel}
              </span>
            )}
          </div>

          {/* AI status tag */}
          {(isDraftReady || isAIWorking || (childCount != null && childCount > 0)) && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              {isDraftReady && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/50 dark:border-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="h-2.5 w-2.5" /> Draft ready
                </span>
              )}
              {isAIWorking && (
                <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 dark:bg-violet-500/10 border border-violet-200/50 dark:border-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> Working
                  {subtaskCount && subtaskCompleted !== undefined ? ` ${subtaskCompleted}/${subtaskCount}` : ''}
                </span>
              )}
              {childCount != null && childCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-gray-500">
                  <LayoutList className="h-2.5 w-2.5" /> {childCount} sub-tasks
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
