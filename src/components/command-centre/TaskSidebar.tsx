import React, { useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Zap, PanelLeftClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task } from '@/lib/database/models';
import { SidebarTaskItem } from './SidebarTaskItem';
import type { CommandCentreFilter } from './types';

interface TaskSidebarProps {
  tasks: Task[];
  isLoading: boolean;
  counts:
    | {
        all: number;
        review: number;
        drafts: number;
        working: number;
        done: number;
      }
    | undefined;
  selectedTaskId: string | null;
  activeFilter: string;
  searchQuery: string;
  onSelectTask: (id: string) => void;
  onFilterChange: (filter: CommandCentreFilter) => void;
  onSearchChange: (query: string) => void;
  onCollapse: () => void;
  onCreateTask?: () => void;
}

const filterOptions = [
  { id: 'all', label: 'All' },
  { id: 'review', label: 'Review' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'working', label: 'AI Working' },
  { id: 'done', label: 'Done' },
];

export function TaskSidebar({
  tasks,
  isLoading,
  counts,
  selectedTaskId,
  activeFilter,
  searchQuery,
  onSelectTask,
  onFilterChange,
  onSearchChange,
  onCollapse,
  onCreateTask,
}: TaskSidebarProps) {
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search handler
  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearchQuery(value);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onSearchChange(value);
      }, 300);
    },
    [onSearchChange]
  );

  // Compute child counts per parent
  const childCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(t => {
      const parentId = (t as any).parent_task_id || (t.metadata as any)?.parent_task_id;
      if (parentId) {
        counts[parentId] = (counts[parentId] || 0) + 1;
      }
    });
    return counts;
  }, [tasks]);

  // Filter out child tasks - only show parent tasks in sidebar
  const parentTasks = useMemo(() => {
    return tasks.filter(t => {
      const parentId = (t as any).parent_task_id || (t.metadata as any)?.parent_task_id;
      return !parentId;
    });
  }, [tasks]);

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="shrink-0 border-r border-slate-200 dark:border-gray-700/50 flex flex-col bg-slate-50/30 dark:bg-gray-900/30 overflow-hidden"
    >
      {/* Sidebar header */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <h1 className="text-sm font-bold text-slate-800 dark:text-gray-200">Command Centre</h1>
          </div>
          <button
            onClick={onCollapse}
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 transition-colors"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={localSearchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full h-8 rounded-lg border border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 pl-8 pr-3 text-xs text-slate-700 dark:text-gray-300 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
          />
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1 flex-wrap">
          {filterOptions.map((f) => {
            const count = counts?.[f.id as keyof typeof counts] || 0;
            return (
              <button
                key={f.id}
                onClick={() => onFilterChange(f.id as CommandCentreFilter)}
                className={cn(
                  'px-2 py-1 rounded-md text-[11px] font-medium transition-all',
                  activeFilter === f.id
                    ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                    : 'text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800'
                )}
              >
                {f.label}
                {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-xs text-slate-400 dark:text-gray-500">Loading tasks...</div>
          </div>
        ) : parentTasks.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-xs text-slate-400 dark:text-gray-500">No tasks found</div>
          </div>
        ) : (
          parentTasks.map((task) => (
            <SidebarTaskItem
              key={task.id}
              task={task}
              isSelected={task.id === selectedTaskId}
              onClick={() => onSelectTask(task.id)}
              childCount={childCounts[task.id]}
            />
          ))
        )}
      </div>

      {/* Quick add */}
      <div className="shrink-0 px-3 py-3 border-t border-slate-200 dark:border-gray-700/50">
        <button
          onClick={onCreateTask}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-gray-600 text-xs text-slate-400 hover:text-blue-500 hover:border-blue-300 dark:hover:border-blue-500/30 hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          New task
          <span className="ml-auto text-[10px] text-slate-300 dark:text-gray-600">N</span>
        </button>
      </div>
    </motion.div>
  );
}
