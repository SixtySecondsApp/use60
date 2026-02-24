import { useState } from 'react';
import {
  Bot,
  Building2,
  UserCircle,
  Calendar as CalendarIcon,
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
  Target,
  Pencil,
  ArrowUpDown,
  Tag,
  Trash2,
} from 'lucide-react';
import { Task } from '@/lib/database/models';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { priorityConfig, taskTypeConfig } from './types';
import { useDeleteTask, useUpdateTaskField } from '@/lib/hooks/useTaskActions';

interface TaskDetailHeaderProps {
  task: Task;
  onApprove: () => void;
  onDismiss: () => void;
  contextOpen: boolean;
  onToggleContext: () => void;
}

export function TaskDetailHeader({ task, onApprove, onDismiss, contextOpen, onToggleContext }: TaskDetailHeaderProps) {
  const deleteTask = useDeleteTask();
  const updateField = useUpdateTaskField();
  const [editTitleOpen, setEditTitleOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDueDateOpen, setEditDueDateOpen] = useState(false);
  const [editDueDate, setEditDueDate] = useState(task.due_date || '');
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const typeInfo = taskTypeConfig[task.task_type] || taskTypeConfig['email'];
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
          <button
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 transition-colors"
            title="Copy link"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/command-centre?task=${task.id}`);
              toast.success('Link copied to clipboard');
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-400 transition-colors" title="More options">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {
                setEditTitle(task.title);
                setEditTitleOpen(true);
              }}>
                <Pencil className="h-4 w-4 mr-2" /> Edit title
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPriorityPickerOpen(true)}>
                <ArrowUpDown className="h-4 w-4 mr-2" /> Change priority
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTypePickerOpen(true)}>
                <Tag className="h-4 w-4 mr-2" /> Change type
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                setEditDueDate(task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '');
                setEditDueDateOpen(true);
              }}>
                <CalendarIcon className="h-4 w-4 mr-2" /> Change due date
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => deleteTask.mutate(task.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
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

      {/* Edit Title Dialog */}
      <Dialog open={editTitleOpen} onOpenChange={setEditTitleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Task Title</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editTitle.trim()) {
                updateField.mutate({ taskId: task.id, field: 'title', value: editTitle.trim() });
                toast.success('Title updated');
                setEditTitleOpen(false);
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTitleOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (editTitle.trim()) {
                updateField.mutate({ taskId: task.id, field: 'title', value: editTitle.trim() });
                toast.success('Title updated');
                setEditTitleOpen(false);
              }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Priority Picker Dialog */}
      <Dialog open={priorityPickerOpen} onOpenChange={setPriorityPickerOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Change Priority</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {Object.entries(priorityConfig).map(([key, cfg]) => (
              <button
                key={key}
                className={cn(
                  'w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-left',
                  task.priority === key
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-700 dark:text-gray-300'
                )}
                onClick={() => {
                  updateField.mutate({ taskId: task.id, field: 'priority', value: key });
                  toast.success(`Priority changed to ${cfg.label}`);
                  setPriorityPickerOpen(false);
                }}
              >
                <div className={cn('w-2.5 h-2.5 rounded-full', cfg.dotColor)} />
                {cfg.label}
                {task.priority === key && <Check className="h-3.5 w-3.5 ml-auto" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Type Picker Dialog */}
      <Dialog open={typePickerOpen} onOpenChange={setTypePickerOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Change Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {Object.entries(taskTypeConfig).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={key}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-left',
                    task.task_type === key
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-700 dark:text-gray-300'
                  )}
                  onClick={() => {
                    updateField.mutate({ taskId: task.id, field: 'task_type', value: key });
                    toast.success(`Type changed to ${cfg.label}`);
                    setTypePickerOpen(false);
                  }}
                >
                  <Icon className={cn('h-4 w-4', cfg.color)} />
                  {cfg.label}
                  {task.task_type === key && <Check className="h-3.5 w-3.5 ml-auto" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Due Date Dialog */}
      <Dialog open={editDueDateOpen} onOpenChange={setEditDueDateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Due Date</DialogTitle>
          </DialogHeader>
          <Input
            type="date"
            autoFocus
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              updateField.mutate({ taskId: task.id, field: 'due_date', value: null });
              toast.success('Due date removed');
              setEditDueDateOpen(false);
            }}>Remove Date</Button>
            <Button onClick={() => {
              if (editDueDate) {
                updateField.mutate({ taskId: task.id, field: 'due_date', value: new Date(editDueDate).toISOString() });
                toast.success('Due date updated');
              }
              setEditDueDateOpen(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
