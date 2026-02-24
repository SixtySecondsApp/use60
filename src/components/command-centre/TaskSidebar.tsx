import React, { useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Zap, PanelLeftClose, Inbox, Calendar, Mail, ArrowUpDown, Check, X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task } from '@/lib/database/models';
import { SidebarTaskItem } from './SidebarTaskItem';
import { TaskChainGroup } from './TaskChainGroup';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CommandCentreFilter, CommandCentreSortField } from './types';
import { useCommandCentreStore } from '@/lib/stores/commandCentreStore';
import { useApproveTask, useDismissTask, useDeleteTask } from '@/lib/hooks/useTaskActions';
import { toast } from 'sonner';

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
  sortField: CommandCentreSortField;
  onSelectTask: (id: string) => void;
  onFilterChange: (filter: CommandCentreFilter) => void;
  onSearchChange: (query: string) => void;
  onSortChange: (field: CommandCentreSortField) => void;
  onCollapse: () => void;
  onCreateTask?: () => void;
  nextInChainId?: string | null;
}

const filterOptions = [
  { id: 'all', label: 'All' },
  { id: 'review', label: 'Review' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'working', label: 'AI Working' },
  { id: 'done', label: 'Done' },
];

const sortOptions: { id: CommandCentreSortField; label: string }[] = [
  { id: 'urgency', label: 'Urgency' },
  { id: 'created_at', label: 'Created' },
  { id: 'priority', label: 'Priority' },
  { id: 'due_date', label: 'Due date' },
];

export function TaskSidebar({
  tasks,
  isLoading,
  counts,
  selectedTaskId,
  activeFilter,
  searchQuery,
  sortField,
  onSelectTask,
  onFilterChange,
  onSearchChange,
  onSortChange,
  onCollapse,
  onCreateTask,
  nextInChainId,
}: TaskSidebarProps) {
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { selectedTaskIds, toggleTaskSelection, clearSelection } = useCommandCentreStore();
  const approveMutation = useApproveTask();
  const dismissMutation = useDismissTask();
  const deleteMutation = useDeleteTask();

  const isMultiSelectMode = selectedTaskIds.length > 0;

  const handleBulkApprove = () => {
    const count = selectedTaskIds.length;
    selectedTaskIds.forEach(id => approveMutation.mutate({ taskId: id }));
    clearSelection();
    toast.success(`${count} tasks approved`);
  };

  const handleBulkDismiss = () => {
    const count = selectedTaskIds.length;
    selectedTaskIds.forEach(id => dismissMutation.mutate({ taskId: id }));
    clearSelection();
    toast.success(`${count} tasks dismissed`);
  };

  const handleBulkDelete = () => {
    const count = selectedTaskIds.length;
    selectedTaskIds.forEach(id => deleteMutation.mutate(id));
    clearSelection();
    toast.success(`${count} tasks deleted`);
  };

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

  const sortLabel = sortOptions.find(s => s.id === sortField)?.label ?? 'Urgency';

  // Group tasks into chains and standalone
  const { chains, standalone } = useMemo(() => {
    if (!tasks || tasks.length === 0) return { chains: [], standalone: [] };

    const parentMap = new Map<string, Task[]>();
    const parentTasks = new Map<string, Task>();
    const standaloneList: Task[] = [];

    // Identify which task IDs are referenced as parents
    const childIds = new Set(
      tasks
        .map(t => t.parent_task_id || (t.metadata as any)?.parent_task_id)
        .filter(Boolean)
    );

    tasks.forEach(task => {
      const parentId = task.parent_task_id || (task.metadata as any)?.parent_task_id;
      if (parentId) {
        // This is a child task
        const children = parentMap.get(parentId) || [];
        children.push(task);
        parentMap.set(parentId, children);
      } else if (childIds.has(task.id)) {
        // This is a parent task (has children referencing it)
        parentTasks.set(task.id, task);
      } else {
        // Standalone task (no parent, no children)
        standaloneList.push(task);
      }
    });

    const chainList = Array.from(parentTasks.entries()).map(([id, parent]) => ({
      parent,
      children: parentMap.get(id) || [],
    }));

    return { chains: chainList, standalone: standaloneList };
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
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600">
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

        {/* Filter pills + sort dropdown */}
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
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-slate-500 dark:text-gray-400 px-2">
                  <ArrowUpDown className="h-3 w-3" />
                  {sortLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {sortOptions.map(opt => (
                  <DropdownMenuItem
                    key={opt.id}
                    onClick={() => onSortChange(opt.id)}
                    className={cn(sortField === opt.id && 'font-medium text-blue-600 dark:text-blue-400')}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {isMultiSelectMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 px-3 py-2 border-b border-slate-200 dark:border-gray-700/50 bg-blue-50 dark:bg-blue-500/10"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                {selectedTaskIds.length} selected
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={handleBulkApprove}>
                  <Check className="h-3 w-3" /> Approve
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={handleBulkDismiss}>
                  <X className="h-3 w-3" /> Dismiss
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1 text-red-500" onClick={handleBulkDelete}>
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-xs text-slate-400 dark:text-gray-500">Loading tasks...</div>
          </div>
        ) : chains.length === 0 && standalone.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 dark:bg-gray-800 mb-4">
              <Inbox className="h-6 w-6 text-blue-400 dark:text-blue-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-1.5">
              Your command centre is clear
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-5">
              AI creates tasks from your meetings, pipeline signals, and email threads
            </p>
            <Button
              size="sm"
              onClick={onCreateTask}
              className="w-full mb-4 bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create your first task
            </Button>
            <div className="flex flex-col gap-2 w-full">
              <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700/50 text-xs text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/50 hover:text-blue-500 dark:hover:text-blue-400 transition-all">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                Connect your calendar
              </button>
              <button className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700/50 text-xs text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/50 hover:text-blue-500 dark:hover:text-blue-400 transition-all">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                Connect your email
              </button>
            </div>
          </div>
        ) : (
          <>
            {chains.map(({ parent, children }) => (
              <TaskChainGroup
                key={parent.id}
                parentTask={parent}
                childTasks={children}
                selectedTaskId={selectedTaskId}
                onSelectTask={onSelectTask}
                nextInChainId={nextInChainId}
              />
            ))}
            {standalone.map((task) => (
              <SidebarTaskItem
                key={task.id}
                task={task}
                isSelected={task.id === selectedTaskId}
                onClick={() => onSelectTask(task.id)}
                isMultiSelected={selectedTaskIds.includes(task.id)}
                onToggleMultiSelect={toggleTaskSelection}
              />
            ))}
          </>
        )}
      </div>

      {/* Quick add */}
      <div className="shrink-0 px-3 py-3 border-t border-slate-200 dark:border-gray-700/50">
        <button
          onClick={onCreateTask}
          data-command-centre-quick-add
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
