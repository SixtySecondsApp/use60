/**
 * Task Response Component
 * Displays task analysis with urgent tasks, high priority tasks, and metrics
 */

import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Calendar, Flag } from 'lucide-react';
import { ActionButtons } from '../ActionButtons';
import { StatsFirstView } from './StatsFirstView';
import type { TaskResponse as TaskResponseData, TaskItem } from '../types';
import { supabase } from '@/lib/supabase/clientV2';
import { cleanUnresolvedVariables } from '@/lib/utils/templateUtils';

interface TaskResponseProps {
  data: TaskResponseData;
  onActionClick?: (action: any) => void;
}

const formatDate = (dateString: string): string => {
  if (!dateString) return 'No due date';
  
  const date = new Date(dateString);
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return 'Invalid date';
  }
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  // If the date is more than 1 year in the past, it's likely a data error
  // Show the actual date instead of "X days ago"
  if (diffDays < -365) {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
  return `In ${diffDays} days`;
};

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'urgent':
      return 'text-red-400 border-l-red-500 bg-red-500/5';
    case 'high':
      return 'text-amber-400 border-l-amber-500 bg-amber-500/5';
    case 'medium':
      return 'text-blue-400 border-l-blue-500 bg-blue-500/5';
    case 'low':
      return 'text-gray-400 border-l-gray-500 bg-gray-500/5';
    default:
      return 'text-gray-400 border-l-gray-500 bg-gray-500/5';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case 'in_progress':
      return <Clock className="w-4 h-4 text-blue-400" />;
    case 'cancelled':
      return <AlertCircle className="w-4 h-4 text-gray-400" />;
    default:
      return <Flag className="w-4 h-4 text-gray-400" />;
  }
};

const MetricCard: React.FC<{ label: string; value: string | number; variant?: 'danger' | 'warning' | 'success' | 'default' }> = ({
  label,
  value,
  variant = 'default'
}) => {
  const variantColors = {
    danger: 'text-red-400',
    warning: 'text-amber-400',
    success: 'text-emerald-400',
    default: 'text-gray-100'
  };

  return (
    <div className="bg-gray-900/60 backdrop-blur-sm border border-gray-800/40 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-semibold ${variantColors[variant]}`}>{value}</div>
    </div>
  );
};

const TaskCard: React.FC<{ 
  task: TaskItem; 
  urgency: 'urgent' | 'high' | 'medium' | 'low';
  onTaskComplete?: (taskId: string) => void;
}> = ({
  task,
  urgency,
  onTaskComplete
}) => {
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(task.status === 'completed');
  const priorityColors = getPriorityColor(task.priority);

  const handleCheckboxChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation(); // Prevent card click
    
    if (isCompleting) return;
    
    const newStatus = e.target.checked ? 'completed' : 'todo';
    const previousStatus = isCompleted;
    
    // Optimistically update UI
    setIsCompleted(newStatus === 'completed');
    setIsCompleting(true);
    
    try {
      const updateData: any = { 
        status: newStatus
      };
      
      if (newStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.completed_at = null;
      }
      
      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', task.id);

      if (error) throw error;

      if (onTaskComplete && newStatus === 'completed') {
        onTaskComplete(task.id);
      }
    } catch (error) {
      console.error('Error updating task:', error);
      // Revert on error
      setIsCompleted(previousStatus);
    } finally {
      setIsCompleting(false);
    }
  };

  const [isExpanded, setIsExpanded] = useState(false);

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking checkbox
    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
      return;
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <div 
      onClick={handleCardClick}
      className={`bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-4 border-l-4 ${priorityColors} cursor-pointer hover:bg-gray-900/90 hover:border-gray-700/50 transition-all group`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={handleCheckboxChange}
              disabled={isCompleting}
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            />
            {getStatusIcon(task.status)}
            <h5 className={`text-sm font-medium group-hover:text-blue-400 transition-colors ${
              isCompleted ? 'line-through text-gray-500' : 'text-gray-100'
            }`}>
              {cleanUnresolvedVariables(task.title)}
            </h5>
          </div>
          {task.description && (
            <p className={`text-xs text-gray-400 mb-2 ${isExpanded ? '' : 'line-clamp-2'}`}>
              {cleanUnresolvedVariables(task.description)}
            </p>
          )}
          
          {/* Always visible metadata */}
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            {task.contactName && (
              <span className="flex items-center gap-1">
                <span className="text-gray-600">Contact:</span>
                {task.contactId ? (
                  <a
                    href={`/crm/contacts/${task.contactId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-400 hover:text-blue-300 underline cursor-pointer transition-colors"
                  >
                    {task.contactName}
                  </a>
                ) : (
                  <span className="text-gray-300">{task.contactName}</span>
                )}
              </span>
            )}
            {task.dealName && (
              <span className="flex items-center gap-1">
                <span className="text-gray-600">Deal:</span>
                {task.dealId ? (
                  <a
                    href={`/crm/deals/${task.dealId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-400 hover:text-blue-300 underline cursor-pointer transition-colors"
                  >
                    {task.dealName}
                  </a>
                ) : (
                  <span className="text-gray-300">{task.dealName}</span>
                )}
              </span>
            )}
            {task.companyName && (
              <span className="flex items-center gap-1">
                <span className="text-gray-600">Company:</span>
                {task.companyId ? (
                  <a
                    href={`/crm/companies/${task.companyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-400 hover:text-blue-300 underline cursor-pointer transition-colors"
                  >
                    {task.companyName}
                  </a>
                ) : (
                  <span className="text-gray-300">{task.companyName}</span>
                )}
              </span>
            )}
            {task.meetingName && (
              <span className="flex items-center gap-1">
                <span className="text-gray-600">Meeting:</span>
                {task.meetingId ? (
                  <a
                    href={`/meetings/${task.meetingId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-400 hover:text-blue-300 underline cursor-pointer transition-colors"
                  >
                    {task.meetingName}
                  </a>
                ) : (
                  <span className="text-gray-300">{task.meetingName}</span>
                )}
              </span>
            )}
            {task.taskType && task.taskType !== 'general' && (
              <span className="flex items-center gap-1">
                <span className="text-gray-600">Type:</span>
                <span className="text-gray-300 capitalize">{task.taskType.replace('_', ' ')}</span>
              </span>
            )}
          </div>
          
          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-gray-800/50 space-y-2">
              <div className="text-xs text-gray-500">
                <div className="flex items-center justify-between mb-1">
                  <span>Created:</span>
                  <span className="text-gray-300">{formatDateTime(task.createdAt)}</span>
                </div>
                {task.updatedAt !== task.createdAt && (
                  <div className="flex items-center justify-between mb-1">
                    <span>Last Updated:</span>
                    <span className="text-gray-300">{formatDateTime(task.updatedAt)}</span>
                  </div>
                )}
                {task.contactId && (
                  <div className="flex items-center justify-between mb-1">
                    <span>Contact ID:</span>
                    <span className="text-gray-300 font-mono text-[10px]">{task.contactId.slice(0, 8)}...</span>
                  </div>
                )}
                {task.dealId && (
                  <div className="flex items-center justify-between mb-1">
                    <span>Deal ID:</span>
                    <span className="text-gray-300 font-mono text-[10px]">{task.dealId.slice(0, 8)}...</span>
                  </div>
                )}
                {task.companyId && (
                  <div className="flex items-center justify-between mb-1">
                    <span>Company ID:</span>
                    <span className="text-gray-300 font-mono text-[10px]">{task.companyId.slice(0, 8)}...</span>
                  </div>
                )}
                {task.meetingId && (
                  <div className="flex items-center justify-between">
                    <span>Meeting ID:</span>
                    <span className="text-gray-300 font-mono text-[10px]">{task.meetingId.slice(0, 8)}...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="text-right ml-4">
          <div className="text-xs text-gray-500 mb-1">Priority</div>
          <div className={`text-sm font-semibold ${task.priority === 'urgent' ? 'text-red-400' : task.priority === 'high' ? 'text-amber-400' : 'text-gray-400'}`}>
            {task.priority}
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800/50">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Calendar className="w-3 h-3" />
          {task.dueDate ? (
            <span className={task.isOverdue ? 'text-red-400 font-medium' : ''}>
              {formatDate(task.dueDate)}
              {task.isOverdue && task.daysUntilDue !== undefined && task.daysUntilDue > -365 && ' (Overdue)'}
              {task.daysUntilDue !== undefined && task.daysUntilDue >= 0 && !task.isOverdue && (
                <span className="text-gray-400 ml-1">
                  ({task.daysUntilDue === 0 ? 'today' : task.daysUntilDue === 1 ? 'tomorrow' : `in ${task.daysUntilDue} days`})
                </span>
              )}
            </span>
          ) : (
            <span>No due date</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className={`text-xs px-2 py-1 rounded capitalize ${
            task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
            task.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
            task.status === 'cancelled' ? 'bg-gray-500/20 text-gray-400' :
            'bg-amber-500/20 text-amber-400'
          }`}>
            {task.status.replace('_', ' ')}
          </div>
          {!isExpanded && (
            <span className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">
              Click to expand
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const TaskResponse: React.FC<TaskResponseProps> = React.memo(({ data, onActionClick }) => {
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [showAllResults, setShowAllResults] = useState(false);

  const handleTaskComplete = (taskId: string) => {
    setCompletedTaskIds(prev => new Set(prev).add(taskId));
  };

  // Filter out completed tasks from display (or show them at the bottom)
  const filterTasks = (tasks: TaskItem[]) => {
    return tasks.filter(task => !completedTaskIds.has(task.id));
  };

  const handleFilterSelect = (filterId: string, count: number) => {
    setSelectedFilter(filterId);
    setShowAllResults(true);
    // Scroll to the relevant section
    setTimeout(() => {
      const element = document.getElementById(`filter-${filterId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleViewAll = () => {
    setShowAllResults(true);
    setSelectedFilter(null);
  };

  // Show stats-first view if enabled and user hasn't selected a filter yet
  if (data.data.showStatsFirst && !showAllResults) {
    const stats = [
      { label: 'Total Tasks', value: data.data.metrics.totalTasks },
      { label: 'Urgent', value: data.data.metrics.urgentCount, variant: 'danger' as const },
      { label: 'Due Today', value: data.data.metrics.dueTodayCount, variant: 'warning' as const },
      { label: 'Overdue', value: data.data.metrics.overdueCount, variant: 'danger' as const }
    ];

    const filterOptions = [
      { id: 'overdue', label: 'Overdue Tasks', count: data.data.overdue.length },
      { id: 'due-today', label: 'Due Today', count: data.data.dueToday.length },
      { id: 'urgent', label: 'Urgent Tasks', count: data.data.urgentTasks.length },
      { id: 'high-priority', label: 'High Priority', count: data.data.highPriorityTasks.length },
      { id: 'all', label: 'All Tasks', count: data.data.metrics.totalTasks }
    ];

    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-300">{data.summary}</p>
        <StatsFirstView
          stats={stats}
          filterOptions={filterOptions}
          onFilterSelect={handleFilterSelect}
          onViewAll={handleViewAll}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <p className="text-sm text-gray-300">{data.summary}</p>

      {/* Metrics Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Tasks"
          value={data.data.metrics.totalTasks}
        />
        <MetricCard
          label="Urgent"
          value={data.data.metrics.urgentCount}
          variant="danger"
        />
        <MetricCard
          label="Due Today"
          value={data.data.metrics.dueTodayCount}
          variant="warning"
        />
        <MetricCard
          label="Overdue"
          value={data.data.metrics.overdueCount}
          variant="danger"
        />
      </div>

      {/* Overdue Tasks */}
      {filterTasks(data.data.overdue).length > 0 && (!selectedFilter || selectedFilter === 'overdue' || selectedFilter === 'all') && (
        <div id="filter-overdue" className="space-y-3">
          <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Overdue - Immediate Action Needed
          </h4>
          {filterTasks(data.data.overdue).slice(0, selectedFilter === 'all' ? undefined : 3).map(task => (
            <TaskCard key={task.id} task={task} urgency="urgent" onTaskComplete={handleTaskComplete} />
          ))}
        </div>
      )}

      {/* Urgent Tasks */}
      {filterTasks(data.data.urgentTasks).length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Urgent Priority
          </h4>
          {filterTasks(data.data.urgentTasks).slice(0, 3).map(task => (
            <TaskCard key={task.id} task={task} urgency="urgent" onTaskComplete={handleTaskComplete} />
          ))}
        </div>
      )}

      {/* Due Today */}
      {filterTasks(data.data.dueToday).length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Due Today
          </h4>
          {filterTasks(data.data.dueToday).slice(0, 3).map(task => (
            <TaskCard key={task.id} task={task} urgency="high" onTaskComplete={handleTaskComplete} />
          ))}
        </div>
      )}

      {/* High Priority Tasks */}
      {filterTasks(data.data.highPriorityTasks).length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <Flag className="w-4 h-4" />
            High Priority
          </h4>
          {filterTasks(data.data.highPriorityTasks).slice(0, 3).map(task => (
            <TaskCard key={task.id} task={task} urgency="high" onTaskComplete={handleTaskComplete} />
          ))}
          {filterTasks(data.data.highPriorityTasks).length > 3 && (
            <p className="text-xs text-gray-500">
              +{filterTasks(data.data.highPriorityTasks).length - 3} more high priority tasks
            </p>
          )}
        </div>
      )}

      {/* Upcoming Tasks */}
      {filterTasks(data.data.upcoming).length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Upcoming
          </h4>
          {filterTasks(data.data.upcoming).slice(0, 3).map(task => (
            <TaskCard key={task.id} task={task} urgency="medium" onTaskComplete={handleTaskComplete} />
          ))}
          {filterTasks(data.data.upcoming).length > 3 && (
            <p className="text-xs text-gray-500">
              +{filterTasks(data.data.upcoming).length - 3} more upcoming tasks
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <ActionButtons actions={data.actions} onActionClick={onActionClick} />
    </div>
  );
});

TaskResponse.displayName = 'TaskResponse';

export default TaskResponse;
