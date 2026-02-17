/**
 * Command Centre — Unified Task System
 *
 * Full-screen master-detail layout consolidating Tasks, Action Centre,
 * Next Action Suggestions, and Meeting Action Items into a single
 * AI-powered inbox.
 *
 * Design: V2 (3-column: sidebar, header+canvas, context panel)
 */

import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Inbox, PanelLeft, Loader2 } from 'lucide-react';
import { useCommandCentreStore } from '@/lib/stores/commandCentreStore';
import { useCommandCentreTasks } from '@/lib/hooks/useCommandCentreTasks';
import { useAuth } from '@/lib/contexts/AuthContext';
import { TaskSidebar } from '@/components/command-centre/TaskSidebar';
import { TaskDetailHeader } from '@/components/command-centre/TaskDetailHeader';
import { WritingCanvas } from '@/components/command-centre/WritingCanvas';
import { ContextPanel } from '@/components/command-centre/ContextPanel';
import { AIReasoningFooter } from '@/components/command-centre/AIReasoningFooter';
import { useKeyboardNav } from '@/components/command-centre/useKeyboardNav';
import { useApproveTask, useDismissTask, useCreateTask } from '@/lib/hooks/useTaskActions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Task } from '@/lib/database/models';

export default function CommandCentre() {
  const { user } = useAuth();
  const {
    selectedTaskId,
    setSelectedTaskId,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    contextOpen,
    toggleContextPanel,
  } = useCommandCentreStore();

  const { data: tasks, isLoading, counts } = useCommandCentreTasks({
    activeFilter,
    search: searchQuery,
  });

  const selectedTask = tasks?.find((t: Task) => t.id === selectedTaskId) ?? null;
  const approveMutation = useApproveTask();
  const dismissMutation = useDismissTask();
  const createTaskMutation = useCreateTask();

  // New task dialog state
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Auto-select first task if none selected
  useEffect(() => {
    if (!selectedTaskId && tasks && tasks.length > 0) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [tasks, selectedTaskId, setSelectedTaskId]);

  // Keyboard navigation
  useKeyboardNav({
    tasks: tasks ?? [],
    selectedTaskId,
    onSelectTask: setSelectedTaskId,
    onToggleSidebar: toggleSidebarCollapsed,
    onToggleContext: toggleContextPanel,
  });

  const handleApprove = () => {
    if (selectedTask) {
      approveMutation.mutate({ taskId: selectedTask.id });
    }
  };

  const handleDismiss = () => {
    if (selectedTask) {
      dismissMutation.mutate({ taskId: selectedTask.id });
    }
  };

  const handleCreateTask = useCallback(() => {
    setShowNewTaskDialog(true);
    setNewTaskTitle('');
  }, []);

  const handleSubmitNewTask = useCallback(() => {
    if (!newTaskTitle.trim()) return;
    createTaskMutation.mutate(
      { title: newTaskTitle.trim(), source: 'manual' },
      {
        onSuccess: (data: any) => {
          setShowNewTaskDialog(false);
          setNewTaskTitle('');
          if (data?.id) {
            setSelectedTaskId(data.id);
          }
        },
      }
    );
  }, [newTaskTitle, createTaskMutation, setSelectedTaskId]);

  // Check if context panel has any content for the selected task
  const taskHasContext = selectedTask && (
    selectedTask.metadata?.meeting_context ||
    selectedTask.metadata?.contact_context ||
    (selectedTask.metadata?.activity && (selectedTask.metadata.activity as any[]).length > 0) ||
    (selectedTask.metadata?.related_items && (selectedTask.metadata.related_items as any[]).length > 0)
  );

  if (!user) return null;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white dark:bg-gray-950">
      {/* ====== LEFT SIDEBAR: TASK LIST ====== */}
      <AnimatePresence mode="wait">
        {!sidebarCollapsed && (
          <TaskSidebar
            tasks={tasks ?? []}
            isLoading={isLoading}
            counts={counts}
            selectedTaskId={selectedTaskId}
            activeFilter={activeFilter}
            searchQuery={searchQuery}
            onSelectTask={setSelectedTaskId}
            onFilterChange={setActiveFilter}
            onSearchChange={setSearchQuery}
            onCollapse={() => setSidebarCollapsed(true)}
            onCreateTask={handleCreateTask}
          />
        )}
      </AnimatePresence>

      {/* Collapsed sidebar rail */}
      {sidebarCollapsed && (
        <div className="shrink-0 w-12 border-r border-slate-200 dark:border-gray-700/50 flex flex-col items-center pt-3 bg-slate-50/30 dark:bg-gray-900/30">
          <button
            onClick={toggleSidebarCollapsed}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 transition-colors"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          {counts && (
            <div className="mt-3 flex flex-col items-center gap-2">
              {counts.drafts > 0 && (
                <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    {counts.drafts}
                  </span>
                </div>
              )}
              {counts.working > 0 && (
                <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
                  <Loader2 className="h-3 w-3 text-violet-500 animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====== CENTER: HEADER + CANVAS ====== */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900/60">
        {selectedTask ? (
          <>
            <TaskDetailHeader
              task={selectedTask}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              contextOpen={contextOpen}
              onToggleContext={toggleContextPanel}
            />
            <WritingCanvas task={selectedTask} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <Inbox className="h-7 w-7 text-slate-300 dark:text-gray-600" />
              </div>
              <p className="text-sm text-slate-500 dark:text-gray-400">
                {isLoading ? 'Loading tasks...' : 'Select a task to view details'}
              </p>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
                Use arrow keys to navigate · <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-gray-800 text-[10px] font-mono">[</kbd> <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-gray-800 text-[10px] font-mono">]</kbd> to toggle panels
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ====== RIGHT: CONTEXT PANEL ====== */}
      <AnimatePresence mode="wait">
        {contextOpen && selectedTask && taskHasContext && (
          <ContextPanel task={selectedTask} />
        )}
      </AnimatePresence>

      {/* AI Reasoning Footer */}
      {selectedTask?.reasoning && (
        <AIReasoningFooter reasoning={selectedTask.reasoning} confidenceScore={selectedTask.confidence_score} />
      )}

      {/* New Task Dialog */}
      <Dialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              placeholder="Task title..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTaskTitle.trim()) {
                  handleSubmitNewTask();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTaskDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitNewTask}
              disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
            >
              {createTaskMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
