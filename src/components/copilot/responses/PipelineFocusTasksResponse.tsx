import React from 'react';
import { Briefcase, CalendarDays, CheckSquare, ExternalLink, Sparkles, AlertCircle, Clock, X, Pencil } from 'lucide-react';
import type { PipelineFocusTasksResponse as PipelineFocusTasksResponseType } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';

interface Props {
  data: PipelineFocusTasksResponseType;
  onActionClick?: (action: any) => void;
}

export function PipelineFocusTasksResponse({ data, onActionClick }: Props) {
  const { sendMessage, isLoading } = useCopilot();
  const { deal, taskPreview, isSimulation } = data.data;

  const dealId = deal?.id ? String(deal.id) : null;
  const dealName = deal?.name ? String(deal.name) : 'Top deal';
  const company = deal?.company ? String(deal.company) : null;
  const closeDate = deal?.expected_close_date ? String(deal.expected_close_date) : null;
  const stage = deal?.stage_name ? String(deal.stage_name) : null;
  const health = deal?.health_status ? String(deal.health_status) : null;
  const risk = deal?.risk_level ? String(deal.risk_level) : null;
  const value = deal?.value || deal?.amount || null;
  const daysSinceActivity = deal?.days_since_activity || deal?.days_stale || null;

  const title = taskPreview?.title ? String(taskPreview.title) : 'Engagement task';
  const due = taskPreview?.due_date ? String(taskPreview.due_date) : null;
  const priority = taskPreview?.priority ? String(taskPreview.priority) : null;
  const description = taskPreview?.description ? String(taskPreview.description) : '';
  
  // Helper to format currency
  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
  
  // Helper to get health color
  const getHealthColor = (h: string | null) => {
    if (!h) return 'text-gray-400';
    const lower = h.toLowerCase();
    if (lower === 'healthy' || lower === 'good') return 'text-emerald-400';
    if (lower === 'at_risk' || lower === 'at risk' || lower === 'warning') return 'text-amber-400';
    if (lower === 'stale' || lower === 'critical' || lower === 'bad') return 'text-red-400';
    return 'text-gray-400';
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white truncate">Pipeline Focus Tasks</h3>
          </div>
          <p className="text-sm text-gray-300 mt-1">{data.summary}</p>
        </div>
        <div className={cn(
          'text-xs px-2 py-1 rounded-md border',
          isSimulation ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : 'border-green-500/30 bg-green-500/10 text-green-300'
        )}>
          {isSimulation ? 'Preview' : 'Created'}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-400" />
              <div className="text-sm font-semibold text-white">Priority Deal</div>
            </div>
            {value && (
              <span className="text-sm font-semibold text-emerald-400">{formatCurrency(Number(value))}</span>
            )}
          </div>
          <div className="text-sm text-gray-100 font-medium">{dealName}</div>
          <div className="text-xs text-gray-400 mt-1">
            {company ? `${company} • ` : ''}{stage ? `${stage} • ` : ''}{closeDate ? `Close: ${closeDate}` : ''}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
            {health && (
              <span className={cn('flex items-center gap-1', getHealthColor(health))}>
                <AlertCircle className="w-3 h-3" />
                {health}
              </span>
            )}
            {daysSinceActivity && Number(daysSinceActivity) > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <Clock className="w-3 h-3" />
                {daysSinceActivity} days since activity
              </span>
            )}
            {risk && <span className="text-gray-400">Risk: {risk}</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {dealId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (onActionClick) return onActionClick({ action: 'open_deal', data: { dealId } });
                  window.location.href = `/crm/deals/${dealId}`;
                }}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                View deal
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare className="w-4 h-4 text-purple-400" />
            <div className="text-sm font-semibold text-white">Task</div>
          </div>
          <div className="text-sm text-gray-100 font-medium">{title}</div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {due ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" /> {due}
              </span>
            ) : null}
            {priority ? <span>Priority: {priority}</span> : null}
          </div>
          {description ? (
            <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-48 overflow-auto">
              {description}
            </pre>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {isSimulation ? (
              <>
                <Button
                  size="sm"
                  onClick={() => sendMessage('Confirm')}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <CheckSquare className="w-4 h-4" />
                  Create task
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => sendMessage('Edit the task')} 
                  disabled={isLoading} 
                  className="gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => sendMessage("Cancel, I don't need this")} 
                  disabled={isLoading} 
                  className="gap-2 text-gray-400 hover:text-gray-200"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              </>
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
        </div>
      </div>
    </div>
  );
}

