import React from 'react';
import { AlertTriangle, Briefcase, CheckSquare, ExternalLink, Sparkles, MessageSquare, Clock, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import type { DealSlippageGuardrailsResponse as DealSlippageGuardrailsResponseType } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';

interface Props {
  data: DealSlippageGuardrailsResponseType;
  onActionClick?: (action: any) => void;
}

export function DealSlippageGuardrailsResponse({ data }: Props) {
  const { sendMessage, isLoading } = useCopilot();
  const { atRiskDeals, diagnosis, taskPreview, slackPreview, isSimulation } = data.data;

  const riskRadar = diagnosis?.risk_radar || [];
  const rescueActions = diagnosis?.rescue_actions || [];
  const taskPreviews = diagnosis?.task_previews || [];

  const topDeal = riskRadar[0];
  const topTask = taskPreview || taskPreviews[0];
  const slackMessage = slackPreview?.message || diagnosis?.slack_update_preview?.message || 'No Slack update generated.';

  const dealId = topDeal?.deal_id || atRiskDeals?.deals?.[0]?.id;
  const dealName = topDeal?.deal_name || atRiskDeals?.deals?.[0]?.name || 'At-risk deal';
  const company = topDeal?.company || atRiskDeals?.deals?.[0]?.company;
  const closeDate = topDeal?.close_date || atRiskDeals?.deals?.[0]?.expected_close_date;
  const riskSignals = topDeal?.risk_signals || [];
  const rootCause = topDeal?.root_cause || '';
  const severity = topDeal?.severity || 'medium';

  const taskTitle = topTask?.title ? String(topTask.title) : 'Rescue task';
  const taskDescription = topTask?.description ? String(topTask.description) : '';
  const taskDueDate = topTask?.due_date ? String(topTask.due_date) : null;
  const taskPriority = topTask?.priority ? String(topTask.priority) : null;

  return (
    <motion.div 
      className="space-y-5" 
      data-testid="deal-slippage-guardrails-response"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white truncate">Deal Slippage Guardrails</h3>
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

      {/* Risk Radar */}
      {riskRadar.length > 0 && (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <div className="text-sm font-semibold text-white">
              Risk Radar ({riskRadar.length} Deal{riskRadar.length !== 1 ? 's' : ''})
            </div>
          </div>
          <div className="space-y-2">
            {riskRadar.slice(0, 5).map((deal: any, index: number) => (
              <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-black/20 border border-gray-800/50">
                <div className={cn(
                  'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                  deal.severity === 'critical' ? 'bg-red-500' :
                  deal.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500'
                )} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-white truncate">{deal.deal_name || `Deal ${index + 1}`}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{deal.root_cause || deal.company || ''}</div>
                  {deal.risk_signals && deal.risk_signals.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {deal.risk_signals.slice(0, 3).map((signal: string, sigIndex: number) => (
                        <span key={sigIndex} className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                          {signal.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Deal Context */}
      {topDeal && (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-4 h-4 text-blue-400" />
            <div className="text-sm font-semibold text-white">Top At-Risk Deal</div>
          </div>
          <div className="text-sm text-gray-100 font-medium">{dealName}</div>
          <div className="text-xs text-gray-400 mt-1">
            {company ? `${company} • ` : ''}{closeDate ? `Close: ${closeDate}` : ''}
          </div>
          {rootCause && (
            <div className="mt-2 text-xs text-gray-300 bg-black/20 border border-gray-800/50 rounded-lg p-2">
              <span className="font-medium">Root cause:</span> {rootCause}
            </div>
          )}
          {riskSignals.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {riskSignals.map((signal: string, index: number) => (
                <span key={index} className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                  {signal.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
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
      )}

      {/* Rescue Actions */}
      {rescueActions.length > 0 && (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <div className="text-sm font-semibold text-white">Rescue Actions</div>
          </div>
          <div className="space-y-2">
            {rescueActions.slice(0, 5).map((action: any, index: number) => (
              <div key={index} className="flex items-start gap-3 p-2 rounded-lg bg-black/20 border border-gray-800/50">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-semibold text-emerald-300">
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
        </div>
      )}

      {/* Task Preview */}
      <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckSquare className="w-4 h-4 text-purple-400" />
          <div className="text-sm font-semibold text-white">Rescue Task</div>
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
      </div>

      {/* Slack Update Preview */}
      {slackMessage && (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-green-400" />
            <div className="text-sm font-semibold text-white">Slack Update</div>
          </div>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-48 overflow-auto">
            {slackMessage}
          </pre>
        </div>
      )}

      {isSimulation && (
        <div className="mt-5 flex justify-end gap-2">
          <Button
            size="sm"
            onClick={() => sendMessage('Confirm')}
            disabled={isLoading}
            className="gap-2"
            data-testid="deal-slippage-guardrails-confirm-btn"
          >
            <CheckSquare className="w-4 h-4" />
            Create rescue task & post Slack update
          </Button>
        </div>
      )}
    </motion.div>
  );
}
