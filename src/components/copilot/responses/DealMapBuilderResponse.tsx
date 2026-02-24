import React from 'react';
import { Briefcase, CalendarDays, CheckSquare, ExternalLink, Sparkles, Target } from 'lucide-react';
import type { DealMapBuilderResponse as DealMapBuilderResponseType } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';

interface Props {
  data: DealMapBuilderResponseType;
  onActionClick?: (action: any) => void;
}

export function DealMapBuilderResponse({ data, onActionClick }: Props) {
  const { sendMessage, isLoading } = useCopilot();
  const { deal, plan, taskPreview, isSimulation } = data.data;

  const dealId = deal?.id ? String(deal.id) : null;
  const dealName = deal?.name ? String(deal.name) : 'Deal';
  const company = deal?.company ? String(deal.company) : null;
  const closeDate = deal?.expected_close_date ? String(deal.expected_close_date) : null;
  const stage = deal?.stage_name ? String(deal.stage_name) : null;
  const health = deal?.health_status ? String(deal.health_status) : null;
  const risk = deal?.risk_level ? String(deal.risk_level) : null;

  const milestones = Array.isArray(plan?.milestones) ? plan.milestones : [];
  const summary = Array.isArray(plan?.summary) ? plan.summary : [];

  const topTaskTitle = taskPreview?.title ? String(taskPreview.title) : (plan?.tasks_to_create?.[0]?.title ? String(plan.tasks_to_create[0].title) : 'MAP task');
  const topTaskDesc = taskPreview?.description ? String(taskPreview.description) : (plan?.tasks_to_create?.[0]?.description ? String(plan.tasks_to_create[0].description) : '');
  const due = taskPreview?.due_date ? String(taskPreview.due_date) : (plan?.tasks_to_create?.[0]?.due_date ? String(plan.tasks_to_create[0].due_date) : null);
  const priority = taskPreview?.priority ? String(taskPreview.priority) : (plan?.tasks_to_create?.[0]?.priority ? String(plan.tasks_to_create[0].priority) : null);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white truncate">Deal MAP Builder</h3>
          </div>
          <p className="text-sm text-gray-300 mt-1">{data.summary}</p>
        </div>
        <div
          className={cn(
            'text-xs px-2 py-1 rounded-md border',
            isSimulation ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : 'border-green-500/30 bg-green-500/10 text-green-300'
          )}
        >
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
            <Target className="w-4 h-4 text-emerald-400" />
            <div className="text-sm font-semibold text-white">Milestones</div>
          </div>
          {milestones.length > 0 ? (
            <div className="space-y-2">
              {milestones.slice(0, 6).map((m: any, idx: number) => (
                <div key={idx} className="text-xs text-gray-300 border border-gray-800/50 bg-black/20 rounded-lg p-2">
                  <div className="text-gray-100 font-medium">{m?.title ? String(m.title) : `Milestone ${idx + 1}`}</div>
                  <div className="text-gray-400 mt-1">
                    {m?.owner ? `Owner: ${String(m.owner)} • ` : ''}{m?.due_date ? `Due: ${String(m.due_date)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400">No milestones returned (yet).</div>
          )}
        </div>

        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare className="w-4 h-4 text-purple-400" />
            <div className="text-sm font-semibold text-white">Top task</div>
          </div>
          <div className="text-sm text-gray-100 font-medium">{topTaskTitle}</div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {due ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" /> {due}
              </span>
            ) : null}
            {priority ? <span>Priority: {priority}</span> : null}
          </div>
          {topTaskDesc ? (
            <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-56 overflow-auto">
              {topTaskDesc}
            </pre>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {isSimulation ? (
              <Button size="sm" onClick={() => sendMessage('Confirm')} disabled={isLoading} className="gap-2">
                <CheckSquare className="w-4 h-4" />
                Create top MAP task
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => {
                if (onActionClick) return onActionClick({ action: 'open_task', data: {} });
                window.location.href = '/tasks';
              }} className="gap-2">
                <ExternalLink className="w-4 h-4" />
                View tasks
              </Button>
            )}
          </div>
        </div>
      </div>

      {summary.length > 0 ? (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="text-sm font-semibold text-white">Plan highlights</div>
          <ul className="mt-2 space-y-1 text-xs text-gray-300 list-disc list-inside">
            {summary.slice(0, 6).map((s: any, idx: number) => (
              <li key={idx}>{String(s)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

