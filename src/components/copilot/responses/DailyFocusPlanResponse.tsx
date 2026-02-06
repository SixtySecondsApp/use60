import React from 'react';
import { Briefcase, CheckSquare, ExternalLink, Sparkles, Target, Users, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import type { DailyFocusPlanResponse as DailyFocusPlanResponseType } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';

interface Props {
  data: DailyFocusPlanResponseType;
  onActionClick?: (action: any) => void;
}

export function DailyFocusPlanResponse({ data }: Props) {
  const { sendMessage, isLoading } = useCopilot();
  const { pipelineDeals, contactsNeedingAttention, openTasks, plan, taskPreview, isSimulation } = data.data;

  const priorities = plan?.priorities || [];
  const actions = plan?.actions || [];
  const taskPack = plan?.task_pack || [];

  const topTask = taskPreview || taskPack[0];
  const taskTitle = topTask?.title ? String(topTask.title) : 'Daily focus task';
  const taskDescription = topTask?.description ? String(topTask.description) : '';
  const taskDueDate = topTask?.due_date ? String(topTask.due_date) : null;
  const taskPriority = topTask?.priority ? String(topTask.priority) : null;

  return (
    <motion.div 
      className="space-y-5" 
      data-testid="daily-focus-plan-response"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div 
        className="flex items-start justify-between gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white truncate">Daily Focus Plan</h3>
          </div>
          <p className="text-sm text-gray-300 mt-1">{data.summary}</p>
        </div>
        <div className={cn(
          'text-xs px-2 py-1 rounded-md border',
          isSimulation ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : 'border-green-500/30 bg-green-500/10 text-green-300'
        )}>
          {isSimulation ? 'Preview' : 'Created'}
        </div>
      </motion.div>

      {/* Priorities Grid */}
      {priorities.length > 0 && (
        <motion.div 
          className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-emerald-400" />
            <div className="text-sm font-semibold text-white">Top Priorities</div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {priorities.slice(0, 6).map((priority: any, index: number) => (
              <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-black/20 border border-gray-800/50">
                <div className={cn(
                  'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                  priority.urgency === 'critical' ? 'bg-red-500' :
                  priority.urgency === 'high' ? 'bg-orange-500' : 'bg-yellow-500'
                )} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-white truncate">{priority.name || `Priority ${index + 1}`}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{priority.reason || priority.context || ''}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Next Best Actions */}
      {actions.length > 0 && (
        <motion.div 
          className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <div className="text-sm font-semibold text-white">Next Best Actions</div>
          </div>
          <div className="space-y-2">
            {actions.slice(0, 5).map((action: any, index: number) => (
              <div key={index} className="flex items-start gap-3 p-2 rounded-lg bg-black/20 border border-gray-800/50">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-semibold text-violet-300">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-white">{action.title || `Action ${index + 1}`}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{action.description || ''}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {action.estimated_time ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {action.estimated_time}m
                      </span>
                    ) : null}
                    {action.priority ? <span>Priority: {action.priority}</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Top Task Preview */}
      <motion.div 
        className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <CheckSquare className="w-4 h-4 text-purple-400" />
          <div className="text-sm font-semibold text-white">Top Task</div>
        </div>
        <div className="text-sm text-gray-100 font-medium">{taskTitle}</div>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          {taskDueDate ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Due: {taskDueDate}
            </span>
          ) : null}
          {taskPriority ? <span>Priority: {taskPriority}</span> : null}
        </div>
        {taskDescription ? (
          <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-48 overflow-auto">
            {taskDescription}
          </pre>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {isSimulation ? (
            <Button
              size="sm"
              onClick={() => sendMessage('Confirm')}
              disabled={isLoading}
              className="gap-2"
              data-testid="daily-focus-plan-confirm-btn"
            >
              <CheckSquare className="w-4 h-4" />
              Create today's tasks
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (onActionClick) return onActionClick({ action: 'open_task', data: {} });
                window.location.href = '/tasks';
              }}
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View tasks
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
