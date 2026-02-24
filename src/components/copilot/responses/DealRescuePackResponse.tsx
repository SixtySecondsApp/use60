import React from 'react';
import { AlertTriangle, Briefcase, CheckSquare, ExternalLink, Sparkles } from 'lucide-react';
import type { DealRescuePackResponse as DealRescuePackResponseType } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';

interface Props {
  data: DealRescuePackResponseType;
  onActionClick?: (action: any) => void;
}

export function DealRescuePackResponse({ data, onActionClick }: Props) {
  const { sendMessage, isLoading } = useCopilot();
  const { deal, plan, taskPreview, isSimulation } = data.data;

  const dealId = deal?.id ? String(deal.id) : null;
  const dealName = deal?.name ? String(deal.name) : 'Deal';
  const company = deal?.company ? String(deal.company) : null;
  const closeDate = deal?.expected_close_date ? String(deal.expected_close_date) : null;
  const stage = deal?.stage_name ? String(deal.stage_name) : null;
  const health = deal?.health_status ? String(deal.health_status) : null;
  const risk = deal?.risk_level ? String(deal.risk_level) : null;

  const diagnosis = plan?.diagnosis || null;
  const rescuePlan = plan?.rescue_plan || plan?.rescuePlan || null;

  const taskTitle = taskPreview?.title ? String(taskPreview.title) : 'Rescue task';
  const taskDesc = taskPreview?.description ? String(taskPreview.description) : '';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white truncate">Deal Rescue Pack</h3>
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

      <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Briefcase className="w-4 h-4 text-blue-400" />
          <div className="text-sm font-semibold text-white">Deal</div>
        </div>
        <div className="text-sm text-gray-100 font-medium">{dealName}</div>
        <div className="text-xs text-gray-400 mt-1">
          {company ? `${company} • ` : ''}{stage ? `${stage} • ` : ''}{closeDate ? `Close: ${closeDate}` : ''}
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
          {health ? <span>Health: {health}</span> : null}
          {risk ? <span>Risk: {risk}</span> : null}
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

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <div className="text-sm font-semibold text-white">Diagnosis</div>
          </div>
          {diagnosis ? (
            <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-52 overflow-auto">
              {JSON.stringify(diagnosis, null, 2)}
            </pre>
          ) : (
            <div className="text-xs text-gray-400">No diagnosis details returned (yet).</div>
          )}
        </div>

        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <div className="text-sm font-semibold text-white">Rescue plan</div>
          </div>
          {rescuePlan ? (
            <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-52 overflow-auto">
              {JSON.stringify(rescuePlan, null, 2)}
            </pre>
          ) : (
            <div className="text-xs text-gray-400">No rescue plan details returned (yet).</div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckSquare className="w-4 h-4 text-purple-400" />
          <div className="text-sm font-semibold text-white">Task</div>
        </div>
        <div className="text-sm text-gray-100 font-medium">{taskTitle}</div>
        {taskDesc ? (
          <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-48 overflow-auto">
            {taskDesc}
          </pre>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {isSimulation ? (
            <Button
              size="sm"
              onClick={() => sendMessage('Confirm')}
              disabled={isLoading}
              className="gap-2"
            >
              <CheckSquare className="w-4 h-4" />
              Create task
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
      </div>
    </div>
  );
}

