import React from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  LayoutList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task } from '@/lib/database/models';
import { priorityConfig, taskTypeConfig } from './types';

interface SidebarTaskItemProps {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
  childCount?: number;
  isNextInChain?: boolean;
  isMultiSelected?: boolean;
  onToggleMultiSelect?: (taskId: string) => void;
}

export function SidebarTaskItem({ task, isSelected, onClick, childCount, isNextInChain, isMultiSelected, onToggleMultiSelect }: SidebarTaskItemProps) {
  const typeEntry = taskTypeConfig[task.task_type];
  const TypeIcon = typeEntry?.icon || Circle;
  const isCompleted = task.status === 'completed' || task.status === 'approved';
  const isApproved = task.status === 'approved';
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

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onToggleMultiSelect?.(task.id);
    } else {
      onClick();
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-all relative group',
        isSelected
          ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20'
          : isMultiSelected
          ? 'bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20'
          : 'hover:bg-slate-50 dark:hover:bg-gray-800/40 border border-transparent',
        isCompleted && 'opacity-50',
        isNextInChain && !isSelected && 'ring-1 ring-violet-300/40',
      )}
      whileTap={{ scale: 0.99 }}
    >
      {/* Priority dot */}
      <div
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full transition-opacity',
          (priorityConfig[task.priority] || priorityConfig['medium']).dotColor,
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50',
        )}
      />

      {/* Multi-select checkbox */}
      {isMultiSelected && (
        <div className="absolute right-2 top-2">
          <div className="w-4 h-4 rounded bg-blue-500 flex items-center justify-center">
            <Check className="h-2.5 w-2.5 text-white" />
          </div>
        </div>
      )}

      <div className="flex items-start gap-2.5">
        {/* Status indicator */}
        <div className="pt-0.5 shrink-0">
          {isApproved ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : isAIWorking ? (
            <Loader2 className="h-4 w-4 text-violet-400 animate-spin [animation-duration:3s]" />
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
            <TypeIcon className={cn('h-3 w-3', typeEntry?.color || 'text-slate-500')} />
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
                <span className="text-[10px] text-emerald-500 dark:text-emerald-400">
                  Draft ready
                </span>
              )}
              {isAIWorking && (
                <span className="text-[10px] text-violet-400 dark:text-violet-500">
                  AI working{subtaskCount && subtaskCompleted !== undefined ? ` ${subtaskCompleted}/${subtaskCount}` : ''}
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
