import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
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
  Bot,
  Building2,
  UserCircle,
  Calendar,
  Copy,
  Archive,
  MoreHorizontal,
  Send,
  Check,
  X,
  MessageCircle,
  Activity,
} from 'lucide-react';
import { Task } from '@/lib/database/models';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useApproveTask, useDismissTask } from '@/lib/hooks/useTaskActions';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DeliverableEditor } from './DeliverableEditor';
import { CommentThread } from './CommentThread';
import { ActivityTimeline } from './ActivityTimeline';
import { AIReasoningFooter } from './AIReasoningFooter';

interface TaskDetailPanelProps {
  task: Task;
}

const taskTypeConfig = {
  email: { icon: Mail, label: 'Email', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  follow_up: { icon: RefreshCw, label: 'Follow-up', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
  research: { icon: FileSearch, label: 'Research', color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-500/10' },
  meeting_prep: { icon: CalendarClock, label: 'Meeting Prep', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
  crm_update: { icon: Target, label: 'CRM Update', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  proposal: { icon: FileText, label: 'Proposal', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  call: { icon: Phone, label: 'Call', color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-500/10' },
  content: { icon: Pencil, label: 'Content', color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-500/10' },
  alert: { icon: BellRing, label: 'Alert', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
  insight: { icon: Lightbulb, label: 'Insight', color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-500/10' },
} as const;

const priorityConfig = {
  low: { label: 'Low', color: 'text-slate-500', dot: 'bg-slate-400' },
  medium: { label: 'Medium', color: 'text-blue-500', dot: 'bg-blue-400' },
  high: { label: 'High', color: 'text-orange-500', dot: 'bg-orange-400' },
  urgent: { label: 'Urgent', color: 'text-red-500', dot: 'bg-red-400' },
};

type TabType = 'content' | 'comments' | 'activity';

export function TaskDetailPanel({ task }: TaskDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('content');
  const approveMutation = useApproveTask();
  const dismissMutation = useDismissTask();

  const typeInfo = taskTypeConfig[task.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.email;
  const TypeIcon = typeInfo.icon;
  const priorityInfo = priorityConfig[task.priority] || priorityConfig.medium;

  const handleCopy = () => {
    navigator.clipboard.writeText(task.title);
    toast.success('Task title copied');
  };

  const handleApprove = () => {
    approveMutation.mutate({ taskId: task.id });
  };

  const handleDismiss = () => {
    dismissMutation.mutate({ taskId: task.id });
  };

  const isDraftReady = task.status === 'draft_ready';
  const isPendingReview = task.status === 'pending_review';
  const isEmail = task.task_type === 'email';
  const isCrmUpdate = task.task_type === 'crm_update';

  const commentCount = (task.metadata?.comments as any[])?.length || 0;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="shrink-0 border-b border-slate-200 dark:border-slate-700 p-6 space-y-4">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={cn('gap-2', typeInfo.bg, typeInfo.color)}>
              <TypeIcon className="w-3.5 h-3.5" />
              {typeInfo.label}
            </Badge>
            {task.source === 'ai_proactive' && (
              <Badge variant="outline" className="gap-2 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Bot className="w-3.5 h-3.5" />
                AI Generated
              </Badge>
            )}
            {task.confidence_score !== undefined && (
              <Badge variant="outline" className="text-slate-600 dark:text-slate-400">
                {Math.round(task.confidence_score * 100)}% confidence
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleCopy}>
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Archive className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{task.title}</h2>
          {task.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400">{task.description}</p>
          )}
        </div>

        {/* Meta Row */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
          {(task.company_id || task.company) && (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span>{typeof task.company === 'string' ? task.company : task.company?.name}</span>
            </div>
          )}
          {(task.contact_name || task.contact?.full_name) && (
            <div className="flex items-center gap-2">
              <UserCircle className="w-4 h-4" />
              <span>
                {task.contact_name || task.contact?.full_name}
                {task.contact_email && <span className="text-slate-400"> ({task.contact_email})</span>}
              </span>
            </div>
          )}
          {task.deal_id && (
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              <span>Deal</span>
            </div>
          )}
          {task.due_date && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{new Date(task.due_date).toLocaleDateString()}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className={cn('w-2 h-2 rounded-full', priorityInfo.dot)} />
            <span className={priorityInfo.color}>{priorityInfo.label}</span>
          </div>
        </div>

        {/* Subtask Progress (if applicable) */}
        {task.metadata?.subtasks && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Subtasks</span>
              <span className="text-slate-500 dark:text-slate-400">
                {(task.metadata.subtasks as any[]).filter(s => s.completed).length} / {(task.metadata.subtasks as any[]).length}
              </span>
            </div>
            <Progress
              value={((task.metadata.subtasks as any[]).filter(s => s.completed).length / (task.metadata.subtasks as any[]).length) * 100}
              className="h-2"
            />
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center gap-2 pt-2">
          {isDraftReady && isEmail && (
            <>
              <Button onClick={handleApprove} className="gap-2">
                <Send className="w-4 h-4" />
                Approve & Send
              </Button>
              <Button variant="outline" className="gap-2">
                <Bot className="w-4 h-4" />
                Revise with AI
              </Button>
            </>
          )}
          {isDraftReady && isCrmUpdate && (
            <Button onClick={handleApprove} className="gap-2">
              <Check className="w-4 h-4" />
              Approve Update
            </Button>
          )}
          {isPendingReview && (
            <>
              <Button onClick={handleApprove} className="gap-2">
                <Check className="w-4 h-4" />
                Accept
              </Button>
              <Button variant="outline" className="gap-2">
                <Bot className="w-4 h-4" />
                Let AI Draft
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="gap-2 ml-auto"
            onClick={handleDismiss}
            disabled={dismissMutation.isPending}
          >
            <X className="w-4 h-4" />
            Dismiss
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-700 -mb-6 pb-0">
          <button
            onClick={() => setActiveTab('content')}
            className={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'content'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            <FileText className="w-4 h-4" />
            Content
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'comments'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            <MessageCircle className="w-4 h-4" />
            Comments
            {commentCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {commentCount}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'activity'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            <Activity className="w-4 h-4" />
            Activity
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'content' && (
            <motion.div
              key="content"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <DeliverableEditor task={task} />
            </motion.div>
          )}
          {activeTab === 'comments' && (
            <motion.div
              key="comments"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <CommentThread task={task} />
            </motion.div>
          )}
          {activeTab === 'activity' && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <ActivityTimeline task={task} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Reasoning Footer */}
      {task.reasoning && (
        <AIReasoningFooter reasoning={task.reasoning} confidenceScore={task.confidence_score} />
      )}
    </div>
  );
}
