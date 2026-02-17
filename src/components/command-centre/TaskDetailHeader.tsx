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
  MoreHorizontal,
  Send,
  Check,
  X,
  ThumbsUp,
  PanelRight,
  PanelRightClose,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { Task } from '@/lib/database/models';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface TaskDetailHeaderProps {
  task: Task;
  onApprove: () => void;
  onDismiss: () => void;
  contextOpen: boolean;
  onToggleContext: () => void;
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
  low: { label: 'Low', color: 'text-slate-500', dot: 'bg-slate-400', dotColor: 'bg-slate-400' },
  medium: { label: 'Medium', color: 'text-blue-500', dot: 'bg-blue-400', dotColor: 'bg-blue-400' },
  high: { label: 'High', color: 'text-orange-500', dot: 'bg-orange-400', dotColor: 'bg-orange-400' },
  urgent: { label: 'Urgent', color: 'text-red-500', dot: 'bg-red-400', dotColor: 'bg-red-400' },
};

export function TaskDetailHeader({ task, onApprove, onDismiss, contextOpen, onToggleContext }: TaskDetailHeaderProps) {
  const typeInfo = taskTypeConfig[task.task_type as keyof typeof taskTypeConfig] || taskTypeConfig.email;
  const TypeIcon = typeInfo.icon;
  const isCompleted = task.status === 'completed';
  const isDraftReady = task.ai_status === 'draft_ready';
  const priorityInfo = priorityConfig[task.priority] || priorityConfig.medium;

  // Handle subtasks from metadata
  const subtasks = (task.metadata?.subtasks as { id: string; title: string; completed: boolean }[] | undefined) || [];
  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const totalSubtasks = subtasks.length;

  // Handle deal metadata
  const dealName = task.metadata?.deal_name as string | undefined;
  const dealValue = task.metadata?.deal_value as string | undefined;

  // Handle company (can be string or Company object)
  const companyName = typeof task.company === 'string' ? task.company : task.company?.name;

  return (
    <div className="shrink-0 border-b border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center justify-center w-7 h-7 rounded-lg', typeInfo.bg)}>
            <TypeIcon className={cn('h-3.5 w-3.5', typeInfo.color)} />
          </div>
          <span className={cn('text-xs font-medium', typeInfo.color)}>
            {typeInfo.label}
          </span>
          {task.source !== 'manual' && (
            <>
              <span className="text-slate-300 dark:text-gray-600">·</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400">
                <Bot className="h-3 w-3" /> AI Generated
              </span>
            </>
          )}
          {task.confidence_score !== undefined && task.confidence_score !== null && (
            <>
              <span className="text-slate-300 dark:text-gray-600">·</span>
              <span className="text-[11px] text-slate-400 dark:text-gray-500">
                {Math.round(task.confidence_score * 100)}% confidence
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleContext}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              contextOpen
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-500'
                : 'hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400'
            )}
            title={contextOpen ? 'Hide context' : 'Show context'}
          >
            {contextOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
          </button>
          <button className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 transition-colors" title="Copy link">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 transition-colors" title="More options">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pb-2">
        <h2 className={cn(
          'text-lg font-bold text-slate-900 dark:text-gray-100',
          isCompleted && 'line-through opacity-50'
        )}>
          {task.title}
        </h2>
        {task.description && (
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-0.5">{task.description}</p>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 px-6 pb-2 flex-wrap">
        {companyName && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-gray-400">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-medium">{companyName}</span>
          </div>
        )}
        {task.contact_name && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-gray-400">
            <UserCircle className="h-3.5 w-3.5 text-slate-400" />
            <span>{task.contact_name}</span>
          </div>
        )}
        {dealName && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-gray-400">
            <Target className="h-3.5 w-3.5 text-slate-400" />
            <span>{dealName}</span>
            {dealValue && <Badge variant="secondary" className="text-[10px] ml-0.5">{dealValue}</Badge>}
          </div>
        )}
        {task.due_date && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-gray-400">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>{new Date(task.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', priorityInfo.dotColor)} />
          <span className={cn('text-xs font-medium', priorityInfo.color)}>
            {priorityInfo.label}
          </span>
        </div>
      </div>

      {/* Subtasks */}
      {subtasks.length > 0 && (
        <div className="px-6 pb-2">
          <div className="flex items-center gap-3 mb-2">
            <Progress value={totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0} className="h-1.5 flex-1" />
            <span className="text-xs text-slate-500 dark:text-gray-400">
              {completedSubtasks}/{totalSubtasks}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {subtasks.map(st => (
              <span
                key={st.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border',
                  st.completed
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/50 dark:border-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-slate-50 dark:bg-gray-800/50 border-slate-200 dark:border-gray-700/50 text-slate-500 dark:text-gray-400'
                )}
              >
                {st.completed ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
                {st.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!isCompleted && (
        <div className="flex items-center gap-2 px-6 pb-3">
          {isDraftReady && (
            <>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={onApprove}>
                {task.task_type === 'email' ? <><Send className="h-3 w-3" /> Approve & Send</> :
                 task.task_type === 'crm_update' ? <><Check className="h-3 w-3" /> Approve Update</> :
                 <><ThumbsUp className="h-3 w-3" /> Approve</>}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Bot className="h-3 w-3" /> Revise with AI
              </Button>
            </>
          )}
          {task.status === 'pending_review' && !isDraftReady && (
            <>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={onApprove}>
                <Check className="h-3 w-3" /> Accept
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Bot className="h-3 w-3" /> Let AI Draft
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-slate-400" onClick={onDismiss}>
            <X className="h-3 w-3" /> Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
