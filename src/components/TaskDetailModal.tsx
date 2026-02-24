import React, { useState } from 'react';
import { format, isToday, isTomorrow, isPast, isValid } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  User,
  Building2,
  Phone,
  CheckCircle2,
  Circle,
  Edit3,
  Trash2,
  Calendar,
  AlertTriangle,
  ArrowRight,
  Star,
  Zap,
  Target,
  ExternalLink,
  Users,
  Mail,
  Video,
  RefreshCw,
  FileText,
  Activity,
  X
} from 'lucide-react';

import { Task } from '@/lib/database/models';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { handleRelatedRecordClick, handleRelatedRecordKeyDown, isRelatedRecordNavigable } from '@/lib/utils/navigationUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

interface TaskDetailModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onToggleComplete: (task: Task) => void;
}

// Task type configurations with icons and colors (matching TaskForm)
const taskTypeConfigs = {
  call: { icon: Phone, emoji: '📞', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Phone Call' },
  email: { icon: Mail, emoji: '✉️', color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Email' },
  meeting: { icon: Users, emoji: '🤝', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', label: 'Meeting' },
  follow_up: { icon: RefreshCw, emoji: '🔄', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'Follow Up' },
  demo: { icon: Video, emoji: '🎯', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', label: 'Demo' },
  proposal: { icon: FileText, emoji: '📋', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Proposal' },
  general: { icon: Activity, emoji: '⚡', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: 'General' },
};

// Priority configurations (matching TaskForm)
const priorityConfigs = {
  low: { icon: '🟢', color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Low' },
  medium: { icon: '🟡', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Medium' },
  high: { icon: '🟠', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'High' },
  urgent: { icon: '🔴', color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Urgent' },
};

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onToggleComplete
}) => {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!task) return null;

  const taskTypeConfig = taskTypeConfigs[task.task_type];
  const priorityConfig = priorityConfigs[task.priority];
  const TaskTypeIcon = taskTypeConfig?.icon || Activity;

  // Date parsing and formatting
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = dueDate && isPast(dueDate) && !task.completed;
  const completedDate = task.completed_at ? new Date(task.completed_at) : null;

  // Format due date with smart labels
  const formatDueDate = (date: Date | null) => {
    if (!date || !isValid(date)) return null;

    let label = '';
    if (isToday(date)) label = ' (Today)';
    else if (isTomorrow(date)) label = ' (Tomorrow)';
    else if (isPast(date)) label = ' (Overdue)';

    return {
      formatted: format(date, 'MMM dd, yyyy \'at\' h:mm a'),
      label,
      isOverdue: isPast(date)
    };
  };

  const dueDateInfo = formatDueDate(dueDate);

  // Handle navigation to related records using utility functions
  const handleNavigateToCompany = (event: React.MouseEvent) => {
    handleRelatedRecordClick(event, navigate, 'company', task.company_id, task.company, onClose);
  };

  const handleNavigateToContact = (event: React.MouseEvent) => {
    handleRelatedRecordClick(event, navigate, 'contact', task.contact_id, task.contact_name, onClose);
  };

  const handleNavigateToDeal = (event: React.MouseEvent) => {
    handleRelatedRecordClick(event, navigate, 'deal', task.deal_id, undefined, onClose);
  };

  // Handle task completion toggle
  const handleToggleComplete = async () => {
    try {
      onToggleComplete(task);
      toast.success(task.completed ? 'Task marked as incomplete' : 'Task completed!');
    } catch (error) {
      logger.error('Error toggling task completion:', error);
      toast.error('Failed to update task status');
    }
  };

  // Handle task deletion
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      onDelete(task.id);
      toast.success('Task deleted successfully');
      onClose();
    } catch (error) {
      logger.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  };

  // Generate assignee display
  const getAssigneeDisplay = () => {
    if (task.assignee) {
      return {
        name: `${task.assignee.first_name} ${task.assignee.last_name}`,
        initials: `${task.assignee.first_name?.[0] || ''}${task.assignee.last_name?.[0] || ''}`,
        avatar: task.assignee.avatar_url
      };
    }
    
    // Handle special cases
    if (task.assigned_to === 'steve') {
      return { name: 'Steve', initials: 'ST', avatar: null };
    }
    if (task.assigned_to === 'phil') {
      return { name: 'Phil', initials: 'PH', avatar: null };
    }
    
    return { name: 'Unknown User', initials: '??', avatar: null };
  };

  const assigneeInfo = getAssigneeDisplay();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="
        fixed inset-0 w-screen h-screen max-w-none !max-h-none rounded-none p-0 m-0
        sm:fixed sm:left-[50%] sm:top-[50%] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:right-auto sm:bottom-auto sm:w-full sm:h-auto sm:max-w-2xl sm:max-h-[85vh] sm:rounded-xl sm:p-0 sm:m-0
        bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col
      ">
        <DialogHeader className="sr-only">
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>
            {task.description || 'Task details and information'}
          </DialogDescription>
        </DialogHeader>
        {/* Clean Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-br from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleComplete}
                className={`p-2 rounded-lg transition-all ${
                  task.completed
                    ? 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                    : 'text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                }`}
              >
                <AnimatePresence mode="wait">
                  {task.completed ? (
                    <motion.div
                      key="completed"
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 90 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="incomplete"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Circle className="w-5 h-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </motion.div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3 break-words pr-8 leading-tight">
                {task.title}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`text-xs font-medium ${taskTypeConfig?.color || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                  <span className="mr-1">{taskTypeConfig?.emoji}</span>
                  {taskTypeConfig?.label || 'General'}
                </Badge>
                <Badge className={`text-xs font-medium ${priorityConfig?.color || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                  {priorityConfig?.icon} {priorityConfig?.label || 'Medium'}
                </Badge>
                {isOverdue && !task.completed && (
                  <Badge className="text-xs font-medium bg-red-50 text-red-600 dark:bg-red-500/20 dark:text-red-400 border border-red-200 dark:border-red-500/30">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Overdue
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg p-2 flex-shrink-0 transition-colors"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-950">
          <div className="p-5 space-y-5">
            {/* Description - Prominent */}
            {task.description && (
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                <p className="text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">
                  {task.description}
                </p>
              </div>
            )}

            {/* Compact Info Bar */}
            <div className="flex items-center gap-6 flex-wrap pt-4 border-t border-gray-100 dark:border-gray-800">
              {/* Assignee */}
              <div className="flex items-center gap-2.5">
                <Avatar className="w-8 h-8 ring-2 ring-gray-200 dark:ring-gray-700">
                  {assigneeInfo.avatar && <AvatarImage src={assigneeInfo.avatar} alt={assigneeInfo.name} />}
                  <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs font-semibold">
                    {assigneeInfo.initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{assigneeInfo.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Assigned</div>
                </div>
              </div>

              {/* Due Date */}
              {dueDateInfo && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  isOverdue 
                    ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' 
                    : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                }`}>
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {isToday(dueDate) ? 'Today' : isTomorrow(dueDate) ? 'Tomorrow' : format(dueDate, 'MMM dd')}
                  </span>
                </div>
              )}
            </div>

            {/* Related Records - Compact Connected Layout */}
            {(task.company || task.contact_name || task.deal_id) && (
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Connected</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Company */}
                  {task.company && isRelatedRecordNavigable(task.company_id, task.company) && (
                    <div 
                      onClick={handleNavigateToCompany}
                      onKeyDown={(e) => handleRelatedRecordKeyDown(e, navigate, 'company', task.company_id, task.company, onClose)}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30 rounded-lg cursor-pointer transition-all group shadow-sm hover:shadow"
                      tabIndex={0}
                      role="button"
                      aria-label={`Navigate to company ${typeof task.company === 'object' ? task.company?.name : task.company}`}
                    >
                      <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300 group-hover:text-blue-800 dark:group-hover:text-blue-200">
                        {typeof task.company === 'object' ? task.company?.name : task.company}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                  
                  {task.company && !isRelatedRecordNavigable(task.company_id, task.company) && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg shadow-sm">
                      <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        {typeof task.company === 'object' ? task.company?.name : task.company}
                      </span>
                    </div>
                  )}

                  {/* Contact */}
                  {task.contact_name && isRelatedRecordNavigable(task.contact_id, task.contact_name) && (
                    <div 
                      onClick={handleNavigateToContact}
                      onKeyDown={(e) => handleRelatedRecordKeyDown(e, navigate, 'contact', task.contact_id, task.contact_name, onClose)}
                      className="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/20 border border-orange-200 dark:border-orange-500/30 rounded-lg cursor-pointer transition-all group shadow-sm hover:shadow"
                      tabIndex={0}
                      role="button"
                      aria-label={`Navigate to contact ${task.contact_name}`}
                    >
                      <User className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-sm font-medium text-orange-700 dark:text-orange-300 group-hover:text-orange-800 dark:group-hover:text-orange-200">
                        {task.contact_name}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                  
                  {task.contact_name && !isRelatedRecordNavigable(task.contact_id, task.contact_name) && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-lg shadow-sm">
                      <User className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-sm font-medium text-orange-700 dark:text-orange-300">{task.contact_name}</span>
                    </div>
                  )}

                  {/* Deal */}
                  {task.deal_id && (
                    <div 
                      onClick={handleNavigateToDeal}
                      onKeyDown={(e) => handleRelatedRecordKeyDown(e, navigate, 'deal', task.deal_id, undefined, onClose)}
                      className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 rounded-lg cursor-pointer transition-all group shadow-sm hover:shadow"
                      tabIndex={0}
                      role="button"
                      aria-label="Navigate to related deal"
                    >
                      <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300 group-hover:text-emerald-800 dark:group-hover:text-emerald-200">Deal</span>
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Clean Action Footer */}
        <div className="flex items-center gap-2 p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <Button
            onClick={() => onEdit(task)}
            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white h-9 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <Edit3 className="w-4 h-4 mr-2" />
            Edit
          </Button>

          <Button
            onClick={handleToggleComplete}
            variant="outline"
            className="flex-1 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white h-9 rounded-lg text-sm font-medium transition-all"
          >
            {task.completed ? (
              <>
                <Circle className="w-4 h-4 mr-2" />
                Incomplete
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Complete
              </>
            )}
          </Button>

          <Button
            onClick={handleDelete}
            disabled={isDeleting}
            variant="outline"
            className="border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-300 dark:hover:border-red-500/50 h-9 px-3 rounded-lg transition-all duration-200 disabled:opacity-50 shadow-sm"
          >
            {isDeleting ? (
              <div className="animate-spin w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailModal;