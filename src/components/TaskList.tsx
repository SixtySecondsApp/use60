import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow, isToday, isTomorrow, isYesterday } from 'date-fns';
import {
  Check,
  Clock,
  User,
  Building2,
  Mail,
  Phone,
  Calendar,
  Plus,
  Filter,
  Search,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Target,
  Flag,
  Users,
  FileText,
  ExternalLink,
  Play,
  Video
} from 'lucide-react';

import { useTasks } from '@/lib/hooks/useTasks';
import { useUser } from '@/lib/hooks/useUser';
import { Task } from '@/lib/database/models';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// Temporarily removing dropdown menu to fix import issues
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { TaskQuickView } from '@/components/TaskQuickView';
import { cleanUnresolvedVariables } from '@/lib/utils/templateUtils';

interface TaskListProps {
  showCompleted?: boolean;
  assigneeFilter?: string;
  compactView?: boolean;
  onCreateTask?: () => void;
  onEditTask?: (task: Task) => void;
  dealId?: string;
  companyId?: string;
  contactId?: string;
  meetingTasksOnly?: boolean;
}

const TaskList: React.FC<TaskListProps> = ({
  showCompleted = false,
  assigneeFilter,
  compactView = false,
  onCreateTask,
  onEditTask,
  dealId,
  companyId,
  contactId,
  meetingTasksOnly = false
}) => {
  const { userData } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [quickViewTask, setQuickViewTask] = useState<Task | null>(null);

  // Build filters for the hook
  const filters = useMemo(() => {
    const taskFilters: any = {};

    if (assigneeFilter) {
      taskFilters.assigned_to = assigneeFilter;
    }

    if (dealId) {
      taskFilters.deal_id = dealId;
    }

    if (companyId) {
      taskFilters.company_id = companyId;
    }

    if (contactId) {
      taskFilters.contact_id = contactId;
    }

    // Add meeting filter if enabled
    if (meetingTasksOnly) {
      taskFilters.hasMeeting = true;
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'incomplete') {
        taskFilters.status = ['pending', 'in_progress', 'overdue'];
      } else {
        taskFilters.status = [statusFilter];
      }
    } else if (!showCompleted) {
      taskFilters.completed = false;
    }

    if (priorityFilter !== 'all') {
      taskFilters.priority = [priorityFilter];
    }

    if (taskTypeFilter !== 'all') {
      taskFilters.task_type = [taskTypeFilter];
    }

    if (searchQuery.trim()) {
      taskFilters.search = searchQuery.trim();
    }

    return taskFilters;
  }, [assigneeFilter, statusFilter, priorityFilter, taskTypeFilter, searchQuery, showCompleted, dealId, companyId, contactId, meetingTasksOnly]);

  const { tasks, isLoading, error, completeTask, uncompleteTask, deleteTask } = useTasks(filters);

  const handleCompleteTask = async (task: Task) => {
    try {
      if (task.completed) {
        await uncompleteTask(task.id);
        toast.success('Task marked as incomplete');
      } else {
        await completeTask(task.id);
        toast.success('Task completed!');
      }
    } catch (error) {
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      toast.success('Task deleted');
    } catch (error) {
      toast.error('Failed to delete task');
    }
  };

  const getTaskIcon = (taskType: Task['task_type']) => {
    const icons = {
      call: Phone,
      email: Mail,
      meeting: Users,
      follow_up: Target,
      proposal: FileText,
      demo: Users,
      general: Circle
    };
    return icons[taskType] || Circle;
  };

  const getPriorityColor = (priority: Task['priority']) => {
    const colors = {
      low: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
      medium: 'bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/20',
      high: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20',
      urgent: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20'
    };
    return colors[priority] || colors.medium;
  };

  const getStatusColor = (status: Task['status']) => {
    const colors = {
      pending: 'bg-gray-100 dark:bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-300 dark:border-gray-500/20',
      in_progress: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
      completed: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
      cancelled: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20',
      overdue: 'bg-red-50 dark:bg-red-600/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-600/20'
    };
    return colors[status] || colors.pending;
  };

  const formatTimestamp = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDueDate = (dueDate: string) => {
    const date = new Date(dueDate);
    const now = new Date();
    
    if (isToday(date)) {
      return 'Today';
    } else if (isTomorrow(date)) {
      return 'Tomorrow';
    } else if (isYesterday(date)) {
      return 'Yesterday';
    } else if (date < now) {
      return `${formatDistanceToNow(date)} ago`;
    } else {
      return formatDistanceToNow(date, { addSuffix: true });
    }
  };

  const isOverdue = (task: Task) => {
    if (!task.due_date || task.completed) return false;
    return new Date(task.due_date) < new Date();
  };

  const groupedTasks = useMemo(() => {
    const groups: { [key: string]: Task[] } = {
      overdue: [],
      today: [],
      tomorrow: [],
      thisWeek: [],
      later: [],
      noDate: []
    };

    tasks.forEach((task: Task) => {
      if (!task.due_date) {
        groups.noDate.push(task);
        return;
      }

      const dueDate = new Date(task.due_date);
      const now = new Date();

      if (isOverdue(task)) {
        groups.overdue.push(task);
      } else if (isToday(dueDate)) {
        groups.today.push(task);
      } else if (isTomorrow(dueDate)) {
        groups.tomorrow.push(task);
      } else if (dueDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
        groups.thisWeek.push(task);
      } else {
        groups.later.push(task);
      }
    });

    return groups;
  }, [tasks]);

  if (error) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardContent className="p-6">
          <div className="text-center text-red-700 dark:text-red-400">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
            <p>Failed to load tasks. Please try again.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isContextual = dealId || companyId || contactId;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Action Buttons */}
      {!isContextual && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
          {onCreateTask && (
            <Button
              size="sm"
              variant="success"
              onClick={onCreateTask}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </Button>
          )}
        </div>
      )}

      {/* Contextual Header */}
      {isContextual && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {dealId && 'Deal Tasks'}
              {companyId && 'Company Tasks'}
              {contactId && 'Contact Tasks'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">Related tasks and follow-ups</p>
          </div>
          {onCreateTask && (
            <Button
              size="sm"
              variant="success"
              onClick={onCreateTask}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          )}
        </div>
      )}

      {/* Filters */}
      <AnimatePresence>
        {showFilters && !isContextual && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <Input
                      placeholder="Search tasks..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="incomplete">Incomplete</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Task Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="follow_up">Follow Up</SelectItem>
                      <SelectItem value="proposal">Proposal</SelectItem>
                      <SelectItem value="demo">Demo</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task Groups */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8">
            <div className="text-center text-gray-600 dark:text-gray-400">
              <div className="animate-spin w-8 h-8 border-2 border-emerald-600 dark:border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Loading tasks...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedTasks).map(([groupKey, groupTasks]) => {
            if (groupTasks.length === 0) return null;

            const groupLabels: { [key: string]: string } = {
              overdue: 'Overdue',
              today: 'Today',
              tomorrow: 'Tomorrow',
              thisWeek: 'This Week',
              later: 'Later',
              noDate: 'No Due Date'
            };

            const groupColors: { [key: string]: string } = {
              overdue: 'text-red-700 dark:text-red-400',
              today: 'text-orange-700 dark:text-orange-400',
              tomorrow: 'text-blue-700 dark:text-blue-400',
              thisWeek: 'text-gray-700 dark:text-gray-300',
              later: 'text-gray-600 dark:text-gray-400',
              noDate: 'text-gray-500'
            };

            return (
              <div key={groupKey} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className={`text-lg font-medium ${groupColors[groupKey]}`}>
                    {groupLabels[groupKey]}
                  </h2>
                  <Badge variant="secondary" className="bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {groupTasks.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <AnimatePresence>
                    {groupTasks.map((task) => {
                      const TaskIcon = getTaskIcon(task.task_type);
                      const isTaskOverdue = isOverdue(task);

                      return (
                        <motion.div
                          key={task.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          className={`group ${compactView ? 'mb-1' : 'mb-2'}`}
                        >
                          <Card className={`transition-all duration-200 hover:shadow-lg ${
                            task.completed
                              ? 'bg-gray-100/50 dark:bg-gray-900/30 border-gray-300 dark:border-gray-800/30'
                              : isTaskOverdue
                                ? 'bg-red-50 dark:bg-red-500/5 border-red-300 dark:border-red-500/20'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                          }`}
                          onClick={() => setQuickViewTask(task)}
                          role="button"
                          tabIndex={0}
                          >
                            <CardContent className={compactView ? 'p-3' : 'p-4'}>
                              <div className="flex items-start gap-3">
                                {/* Checkbox */}
                                <button
                                  onClick={() => handleCompleteTask(task)}
                                  className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    task.completed
                                      ? 'bg-emerald-600 border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500'
                                      : 'border-gray-400 dark:border-gray-600 hover:border-emerald-600 dark:hover:border-emerald-500'
                                  }`}
                                  onClickCapture={(e) => e.stopPropagation()}
                                >
                                  {task.completed && <Check className="w-3 h-3 text-white" />}
                                </button>

                                {/* Task Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <TaskIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                                        <h3 className={`font-medium ${
                                          task.completed ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'
                                        }`}>
                                          {cleanUnresolvedVariables(task.title)}
                                        </h3>
                                        <Badge className={`px-2 py-0.5 text-xs ${getPriorityColor(task.priority)}`}>
                                          {task.priority}
                                        </Badge>
                                        <Badge className={`px-2 py-0.5 text-xs ${getStatusColor(task.status)}`}>
                                          {task.status.replace('_', ' ')}
                                        </Badge>
                                        {task.category && (
                                          <Badge className="px-2 py-0.5 text-xs bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-700">
                                            {task.category}
                                          </Badge>
                                        )}
                                        {task.meeting_action_item_id && (
                                          <Badge className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50 cursor-pointer transition-colors">
                                            <Calendar className="w-3 h-3 mr-1" />
                                            From Meeting
                                          </Badge>
                                        )}
                                      </div>

                                      {task.description && (
                                        <p className={`text-sm mb-2 ${
                                          task.completed ? 'text-gray-500 dark:text-gray-600' : 'text-gray-600 dark:text-gray-400'
                                        }`}>
                                          {cleanUnresolvedVariables(task.description)}
                                        </p>
                                      )}

                                      <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-500 flex-wrap">
                                        {/* Company Info - clickable link */}
                                        {(task as any).company && (
                                          <Link
                                            to={`/companies/${(task as any).company.id}`}
                                            className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Building2 className="w-3 h-3" />
                                            <span>{(task as any).company.name}</span>
                                          </Link>
                                        )}

                                        {/* Contact Info - clickable link */}
                                        {(task as any).contact && (
                                          <Link
                                            to={`/crm/contacts/${(task as any).contact.id}`}
                                            className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <User className="w-3 h-3" />
                                            <span>{(task as any).contact.full_name || (task as any).contact.email}</span>
                                          </Link>
                                        )}

                                        {/* Meeting Link */}
                                        {(task as any).meeting_action_item?.meeting && (
                                          <Link
                                            to={`/meetings/${(task as any).meeting_action_item.meeting.id}`}
                                            className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Video className="w-3 h-3" />
                                            <span>{(task as any).meeting_action_item.meeting.title || 'Meeting'}</span>
                                          </Link>
                                        )}

                                        {/* Playback timestamp button */}
                                        {(task as any).meeting_action_item?.timestamp_seconds != null && (task as any).meeting_action_item?.playback_url && (
                                          <a
                                            href={(task as any).meeting_action_item.playback_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Play className="w-3 h-3" />
                                            <span>{formatTimestamp((task as any).meeting_action_item.timestamp_seconds)}</span>
                                          </a>
                                        )}

                                        {/* Due Date */}
                                        {task.due_date && (
                                          <div className={`flex items-center gap-1 ${
                                            isTaskOverdue ? 'text-red-700 dark:text-red-400' : ''
                                          }`}>
                                            <Calendar className="w-3 h-3" />
                                            <span>{formatDueDate(task.due_date)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                      {task.assignee && (
                                        <Avatar className="w-6 h-6">
                                          <AvatarImage src={task.assignee.avatar_url} />
                                          <AvatarFallback className="text-xs bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                            {task.assignee.first_name?.[0]}{task.assignee.last_name?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                      )}

                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {onEditTask && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setQuickViewTask(task);
                                            }}
                                          >
                                            <Edit className="w-4 h-4" />
                                          </Button>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteTask(task.id);
                                          }}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}

          {tasks.length === 0 && (
            <Card>
              <CardContent className="p-8">
                <div className="text-center text-gray-600 dark:text-gray-400">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                  <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">No tasks found</h3>
                  <p>
                    {isContextual
                      ? 'No tasks found for this context. Create a new task to get started.'
                      : 'Create a new task or adjust your filters to see tasks.'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <TaskQuickView
        open={Boolean(quickViewTask)}
        onOpenChange={(open) => (!open ? setQuickViewTask(null) : undefined)}
        task={quickViewTask}
        onToggleComplete={async (t) => {
          await handleCompleteTask(t);
          setQuickViewTask(null);
        }}
        onEdit={onEditTask ? (t) => onEditTask(t) : undefined}
        onDelete={async (t) => {
          await handleDeleteTask(t.id);
          setQuickViewTask(null);
        }}
      />
    </div>
  );
};

export default TaskList;