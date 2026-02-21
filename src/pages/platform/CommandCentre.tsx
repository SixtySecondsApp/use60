/**
 * Command Centre — Unified Task System
 *
 * Full-screen master-detail layout consolidating Tasks, Action Centre,
 * Next Action Suggestions, and Meeting Action Items into a single
 * AI-powered inbox.
 *
 * Design: V2 (3-column: sidebar, header+canvas, context panel)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Inbox, PanelLeft, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useCommandCentreStore } from '@/lib/stores/commandCentreStore';
import { useCommandCentreTasks } from '@/lib/hooks/useCommandCentreTasks';
import { useAuth } from '@/lib/contexts/AuthContext';
import { TaskSidebar } from '@/components/command-centre/TaskSidebar';
import { TaskDetailHeader } from '@/components/command-centre/TaskDetailHeader';
import { WritingCanvas } from '@/components/command-centre/WritingCanvas';
import { ContextPanel } from '@/components/command-centre/ContextPanel';
import { AIReasoningFooter } from '@/components/command-centre/AIReasoningFooter';
import { ComposePreview } from '@/components/command-centre/ComposePreview';
import { SlackPreview } from '@/components/command-centre/SlackPreview';
import { CrmUpdatePreview } from '@/components/command-centre/CrmUpdatePreview';
import { useKeyboardNav } from '@/components/command-centre/useKeyboardNav';
import { useApproveTask, useDismissTask, useCreateTask } from '@/lib/hooks/useTaskActions';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Task } from '@/lib/database/models';

const EMAIL_DELIVERABLE_TYPES = ['email_draft', 'follow_up_email', 'meeting_follow_up'];
const SLACK_DELIVERABLE_TYPES = ['slack_update', 'internal_debrief'];

export default function CommandCentre() {
  const { user } = useAuth();
  const organizationId = useActiveOrgId();
  const {
    selectedTaskId,
    setSelectedTaskId,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    sortField,
    setSortField,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    contextOpen,
    toggleContextPanel,
  } = useCommandCentreStore();

  const { data: tasks, isLoading, isError, refetch, counts } = useCommandCentreTasks({
    activeFilter,
    search: searchQuery,
    sortField,
    sortOrder: 'desc',
  });

  const selectedTask = tasks?.find((t: Task) => t.id === selectedTaskId) ?? null;
  const approveMutation = useApproveTask();
  const dismissMutation = useDismissTask();
  const createTaskMutation = useCreateTask();

  // Greeting header state — collapses after first task interaction
  const [greetingVisible, setGreetingVisible] = useState(true);
  const hasInteracted = useRef(false);

  // New task dialog state
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Compose preview state
  const [composeOpen, setComposeOpen] = useState(false);

  // Slack preview state
  const [slackPreviewOpen, setSlackPreviewOpen] = useState(false);

  // CRM update preview state
  const [crmPreviewOpen, setCrmPreviewOpen] = useState(false);

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
    onApprove: selectedTaskId ? () => approveMutation.mutate(selectedTaskId) : undefined,
    onDismiss: selectedTaskId ? () => dismissMutation.mutate(selectedTaskId) : undefined,
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName =
    (user?.user_metadata?.first_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'there';

  // Collapse greeting on first task interaction
  const handleSelectTask = useCallback((taskId: string) => {
    if (!hasInteracted.current) {
      hasInteracted.current = true;
      setGreetingVisible(false);
    }
    setSelectedTaskId(taskId);
  }, [setSelectedTaskId]);

  const handleTaskCompleted = useCallback((completedTaskId: string) => {
    if (!tasks) return;

    const completedTask = tasks.find((t: Task) => t.id === completedTaskId);
    if (!completedTask) return;

    const parentId = completedTask.parent_task_id || (completedTask.metadata as any)?.parent_task_id;
    if (!parentId) return;

    const siblings = tasks
      .filter((t: Task) => {
        const tParentId = t.parent_task_id || (t.metadata as any)?.parent_task_id;
        return tParentId === parentId && t.id !== completedTaskId;
      })
      .filter((t: Task) => t.status !== 'completed' && t.status !== 'approved' && t.status !== 'dismissed');

    if (siblings.length > 0) {
      const nextTask = siblings[0];
      setSelectedTaskId(nextTask.id);
      toast.info(`Next in chain: ${nextTask.title}`, { duration: 3000 });
    }
  }, [tasks, setSelectedTaskId]);

  const handleApprove = useCallback(() => {
    if (!selectedTask) return;
    if (EMAIL_DELIVERABLE_TYPES.includes(selectedTask.deliverable_type || '')) {
      setComposeOpen(true);
    } else if (SLACK_DELIVERABLE_TYPES.includes(selectedTask.deliverable_type || '')) {
      setSlackPreviewOpen(true);
    } else if (selectedTask.deliverable_type === 'crm_update') {
      setCrmPreviewOpen(true);
    } else {
      approveMutation.mutate({ taskId: selectedTask.id }, {
        onSuccess: () => handleTaskCompleted(selectedTask.id),
      });
    }
  }, [selectedTask, approveMutation, handleTaskCompleted]);

  const handleEmailSent = useCallback(() => {
    if (selectedTask) {
      approveMutation.mutate({ taskId: selectedTask.id }, {
        onSuccess: () => handleTaskCompleted(selectedTask.id),
      });
    }
  }, [selectedTask, approveMutation, handleTaskCompleted]);

  const handleSlackSent = useCallback(() => {
    if (selectedTask) {
      approveMutation.mutate({ taskId: selectedTask.id }, {
        onSuccess: () => handleTaskCompleted(selectedTask.id),
      });
    }
  }, [selectedTask, approveMutation, handleTaskCompleted]);

  const handleCrmConfirmed = useCallback(() => {
    if (selectedTask) {
      approveMutation.mutate({ taskId: selectedTask.id }, {
        onSuccess: () => handleTaskCompleted(selectedTask.id),
      });
    }
  }, [selectedTask, approveMutation, handleTaskCompleted]);

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

  const handleSaveContent = useCallback(async (content: string) => {
    if (!selectedTask) return;
    const existing = (selectedTask.deliverable_data as Record<string, unknown>) ?? {};
    const field = selectedTask.deliverable_type === 'email_draft' ? 'body' : 'content';
    await supabase
      .from('tasks')
      .update({ deliverable_data: { ...existing, [field]: content } })
      .eq('id', selectedTask.id);
  }, [selectedTask]);

  const handleSaveMetadata = useCallback(async (patch: Record<string, unknown>) => {
    if (!selectedTask) return;
    const existing = (selectedTask.metadata as Record<string, unknown>) ?? {};
    await supabase
      .from('tasks')
      .update({ metadata: { ...existing, ...patch } })
      .eq('id', selectedTask.id);
  }, [selectedTask]);

  // Compute the next pending task in the same chain as the selected task
  const nextInChainId = (() => {
    if (!selectedTask || !tasks) return null;
    const parentId = selectedTask.parent_task_id || (selectedTask.metadata as any)?.parent_task_id;
    if (!parentId) return null;
    const next = tasks.find((t: Task) => {
      const tParentId = (t as any).parent_task_id || (t.metadata as any)?.parent_task_id;
      return (
        tParentId === parentId &&
        t.id !== selectedTask.id &&
        t.status !== 'completed' &&
        t.status !== 'approved' &&
        t.status !== 'dismissed'
      );
    });
    return next?.id ?? null;
  })();

  // Context panel always available — useTaskContext lazy-loads live data
  const taskHasContext = !!selectedTask;

  if (!user) return null;

  if (isError) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-white dark:bg-gray-950">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-7 w-7 text-red-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Failed to load tasks</p>
          <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">Something went wrong. Please try again.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-white dark:bg-gray-950">
      {/* ====== GREETING HEADER ====== */}
      <AnimatePresence>
        {greetingVisible && (
          <motion.div
            key="greeting"
            initial={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden shrink-0"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-gray-800/60">
              <p className="text-2xl font-semibold text-slate-800 dark:text-gray-100">
                {getGreeting()}, {firstName}
              </p>
              {counts && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {counts.drafts > 0 && (
                    <span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">{counts.drafts}</span>
                      {' ready for review'}
                    </span>
                  )}
                  {counts.drafts > 0 && counts.working > 0 && <span className="mx-2 text-slate-300 dark:text-gray-600">·</span>}
                  {counts.working > 0 && (
                    <span>
                      <span className="font-medium text-violet-600 dark:text-violet-400">{counts.working}</span>
                      {' in progress'}
                    </span>
                  )}
                  {(counts.drafts > 0 || counts.working > 0) && counts.review > 0 && <span className="mx-2 text-slate-300 dark:text-gray-600">·</span>}
                  {counts.review > 0 && (
                    <span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">{counts.review}</span>
                      {' needs your input'}
                    </span>
                  )}
                  {counts.drafts === 0 && counts.working === 0 && counts.review === 0 && (
                    <span>All caught up — nothing needs your attention right now.</span>
                  )}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== MAIN 3-COLUMN LAYOUT ====== */}
      <div className="flex flex-1 min-h-0">
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
            sortField={sortField}
            onSelectTask={handleSelectTask}
            onFilterChange={setActiveFilter}
            onSearchChange={setSearchQuery}
            onSortChange={setSortField}
            onCollapse={() => setSidebarCollapsed(true)}
            onCreateTask={handleCreateTask}
            nextInChainId={nextInChainId}
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
            <WritingCanvas task={selectedTask} organizationId={organizationId} onSaveContent={handleSaveContent} onSaveMetadata={handleSaveMetadata} />
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
        {/* AI Reasoning Footer — rendered naturally at the bottom of the center column */}
        {selectedTask?.reasoning && (
          <AIReasoningFooter reasoning={selectedTask.reasoning} confidenceScore={selectedTask.confidence_score} />
        )}
      </div>

      {/* ====== RIGHT: CONTEXT PANEL ====== */}
      <AnimatePresence mode="wait">
        {contextOpen && selectedTask && taskHasContext && (
          <ContextPanel task={selectedTask} />
        )}
      </AnimatePresence>

      </div>{/* end inner 3-column flex */}

      {/* Compose Preview Dialog */}
      <ComposePreview
        open={composeOpen}
        onOpenChange={setComposeOpen}
        task={selectedTask}
        onSent={handleEmailSent}
      />

      {/* Slack Preview Dialog */}
      <SlackPreview
        open={slackPreviewOpen}
        onOpenChange={setSlackPreviewOpen}
        task={selectedTask}
        onSent={handleSlackSent}
      />

      {/* CRM Update Preview Dialog */}
      <CrmUpdatePreview
        open={crmPreviewOpen}
        onOpenChange={setCrmPreviewOpen}
        task={selectedTask}
        onConfirmed={handleCrmConfirmed}
      />

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
