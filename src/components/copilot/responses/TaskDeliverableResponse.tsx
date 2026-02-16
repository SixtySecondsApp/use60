/**
 * Task Deliverable Response Component
 * Renders AI-generated deliverables (email drafts, research briefs, meeting prep, etc.)
 * with approve/edit/dismiss actions following the preview -> confirm HITL pattern.
 */

import React, { useState } from 'react';
import {
  Mail, FileText, Calendar, Database, PenTool, Lightbulb,
  CheckCircle2, XCircle, Edit3, Copy, Bot, AlertTriangle,
  ChevronDown, ChevronUp, ExternalLink, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { ActionButtons } from '../ActionButtons';
import type { QuickActionResponse, CopilotResponse } from '../types';

// ─── Data Interface ──────────────────────────────────────────

export interface TaskDeliverableResponseData {
  task_id: string;
  task_title: string;
  deliverable_type: 'email_draft' | 'research_brief' | 'meeting_prep' | 'crm_update' | 'content_draft' | 'action_plan' | 'insight';
  ai_status: 'draft_ready' | 'approved' | 'working' | 'failed';
  confidence_score?: number;
  reasoning?: string;
  deliverable: Record<string, any>;
  is_simulation?: boolean;
}

// ─── Props ───────────────────────────────────────────────────

interface Props {
  data: CopilotResponse & { data: TaskDeliverableResponseData };
  onActionClick?: (action: QuickActionResponse) => void;
}

// ─── Deliverable Configs ─────────────────────────────────────

const deliverableConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  email_draft: { icon: <Mail className="w-4 h-4" />, label: 'Email Draft', color: 'text-blue-400' },
  research_brief: { icon: <FileText className="w-4 h-4" />, label: 'Research Brief', color: 'text-purple-400' },
  meeting_prep: { icon: <Calendar className="w-4 h-4" />, label: 'Meeting Prep', color: 'text-emerald-400' },
  crm_update: { icon: <Database className="w-4 h-4" />, label: 'CRM Update', color: 'text-amber-400' },
  content_draft: { icon: <PenTool className="w-4 h-4" />, label: 'Content Draft', color: 'text-pink-400' },
  action_plan: { icon: <FileText className="w-4 h-4" />, label: 'Action Plan', color: 'text-cyan-400' },
  insight: { icon: <Lightbulb className="w-4 h-4" />, label: 'Insight', color: 'text-yellow-400' },
};

// ─── Sub-Renderers ───────────────────────────────────────────

function EmailDraftView({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5 text-xs">
        <div className="flex gap-2"><span className="text-gray-500 w-8">To:</span><span className="text-gray-300">{data.to}</span></div>
        {data.cc && <div className="flex gap-2"><span className="text-gray-500 w-8">CC:</span><span className="text-gray-300">{data.cc}</span></div>}
        <div className="flex gap-2"><span className="text-gray-500 w-8">Subj:</span><span className="text-gray-200 font-medium">{data.subject}</span></div>
      </div>
      <div className="bg-gray-900/80 border border-gray-800/50 rounded-lg p-3">
        <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{data.body}</div>
      </div>
    </div>
  );
}

function ResearchBriefView({ data }: { data: Record<string, any> }) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const sections = data.sections || [];
  return (
    <div className="space-y-2">
      {data.company_overview && (
        <p className="text-sm text-gray-300">{data.company_overview}</p>
      )}
      {sections.map((section: any, i: number) => (
        <div key={i} className="border border-gray-800/50 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === section.title ? null : section.title)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-200">{section.title}</span>
              {section.status === 'generating' && (
                <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">Generating...</span>
              )}
            </div>
            {expandedSection === section.title ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
          </button>
          {expandedSection === section.title && (
            <div className="px-3 pb-3 text-sm text-gray-400 whitespace-pre-wrap">{section.content}</div>
          )}
        </div>
      ))}
      {data.key_people && data.key_people.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Key People</div>
          <div className="space-y-1">
            {data.key_people.map((person: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 bg-gray-900/40 rounded">
                <span className="text-gray-300">{person.name}</span>
                <span className="text-gray-500">{person.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingPrepView({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-3">
      {data.deal_context && (
        <p className="text-sm text-gray-400">{data.deal_context}</p>
      )}
      {data.talking_points && data.talking_points.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Talking Points</div>
          <ul className="space-y-1">
            {data.talking_points.map((point: string, i: number) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.risks && data.risks.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Risks</div>
          {data.risks.map((risk: any, i: number) => (
            <div key={i} className="flex items-start gap-2 text-sm mb-1">
              <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${risk.severity === 'high' ? 'text-red-400' : risk.severity === 'medium' ? 'text-amber-400' : 'text-gray-400'}`} />
              <span className="text-gray-300">{risk.description}</span>
            </div>
          ))}
        </div>
      )}
      {data.attendees && data.attendees.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Attendees</div>
          <div className="flex flex-wrap gap-1.5">
            {data.attendees.map((a: any, i: number) => (
              <span key={i} className="text-xs bg-gray-800/60 text-gray-300 px-2 py-1 rounded">
                {a.name} — {a.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CrmUpdateView({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-300">
        Update <span className="font-medium text-gray-200">{data.entity_name}</span>
        <span className="text-gray-500 ml-1">({data.entity_type})</span>
      </div>
      <div className="space-y-1.5">
        {(data.changes || []).map((change: any, i: number) => (
          <div key={i} className="bg-gray-900/60 border border-gray-800/50 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 mb-1">{change.field}</div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-red-400/70 line-through">{change.old_value || '(empty)'}</span>
              <span className="text-gray-600">→</span>
              <span className="text-emerald-400">{change.new_value}</span>
            </div>
            {change.reason && <div className="text-[11px] text-gray-500 mt-1">{change.reason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightView({ data }: { data: Record<string, any> }) {
  const trendIcon = (trend?: string) => {
    if (trend === 'up') return <TrendingUp className="w-3 h-3 text-emerald-400" />;
    if (trend === 'down') return <TrendingDown className="w-3 h-3 text-red-400" />;
    return <Minus className="w-3 h-3 text-gray-500" />;
  };

  return (
    <div className="space-y-3">
      {data.summary && <p className="text-sm text-gray-300">{data.summary}</p>}
      {data.data_points && data.data_points.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {data.data_points.map((dp: any, i: number) => (
            <div key={i} className="bg-gray-900/60 border border-gray-800/50 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500">{dp.label}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-medium text-gray-200">{dp.value}</span>
                {trendIcon(dp.trend)}
              </div>
            </div>
          ))}
        </div>
      )}
      {data.recommendations && data.recommendations.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Recommendations</div>
          <ul className="space-y-1">
            {data.recommendations.map((rec: string, i: number) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GenericView({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-2">
      {data.title && <div className="text-sm font-medium text-gray-200">{data.title}</div>}
      {data.body && <div className="text-sm text-gray-300 whitespace-pre-wrap">{data.body}</div>}
      {data.summary && <p className="text-sm text-gray-300">{data.summary}</p>}
      {data.options && data.options.length > 0 && (
        <div className="space-y-1.5">
          {data.options.map((opt: any, i: number) => (
            <div key={i} className={`px-3 py-2 rounded-lg border text-sm ${opt.recommended ? 'border-blue-500/30 bg-blue-500/5' : 'border-gray-800/50 bg-gray-900/40'}`}>
              <div className="flex items-center gap-2">
                <span className="text-gray-200">{opt.label}</span>
                {opt.recommended && <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">Recommended</span>}
              </div>
              {opt.description && <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export const TaskDeliverableResponse: React.FC<Props> = React.memo(({ data, onActionClick }) => {
  const d = data.data;
  const config = deliverableConfig[d.deliverable_type] || deliverableConfig.insight;
  const [copied, setCopied] = useState(false);

  const handleApprove = () => {
    onActionClick?.({
      id: `approve-${d.task_id}`,
      label: 'Approve',
      type: 'primary',
      callback: 'approve_deliverable',
      params: { taskId: d.task_id, deliverableType: d.deliverable_type },
    });
  };

  const handleDismiss = () => {
    onActionClick?.({
      id: `dismiss-${d.task_id}`,
      label: 'Dismiss',
      type: 'secondary',
      callback: 'dismiss_deliverable',
      params: { taskId: d.task_id },
    });
  };

  const handleEdit = () => {
    onActionClick?.({
      id: `edit-${d.task_id}`,
      label: 'Edit in Command Centre',
      type: 'secondary',
      callback: 'navigate',
      params: { path: `/command-centre?task=${d.task_id}` },
    });
  };

  const handleCopy = () => {
    const text = d.deliverable_type === 'email_draft'
      ? `Subject: ${d.deliverable.subject}\n\n${d.deliverable.body}`
      : JSON.stringify(d.deliverable, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderDeliverable = () => {
    switch (d.deliverable_type) {
      case 'email_draft':
        return <EmailDraftView data={d.deliverable} />;
      case 'research_brief':
        return <ResearchBriefView data={d.deliverable} />;
      case 'meeting_prep':
        return <MeetingPrepView data={d.deliverable} />;
      case 'crm_update':
        return <CrmUpdateView data={d.deliverable} />;
      case 'insight':
        return <InsightView data={d.deliverable} />;
      default:
        return <GenericView data={d.deliverable} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data.summary && <p className="text-sm text-gray-300">{data.summary}</p>}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={config.color}>{config.icon}</div>
          <span className="text-sm font-medium text-gray-200">{config.label}</span>
          {d.ai_status === 'draft_ready' && (
            <span className="text-[10px] bg-emerald-400/10 text-emerald-400 px-1.5 py-0.5 rounded">Ready for review</span>
          )}
          {d.is_simulation && (
            <span className="text-[10px] bg-amber-400/10 text-amber-400 px-1.5 py-0.5 rounded">Preview</span>
          )}
        </div>
        {d.confidence_score != null && (
          <div className="flex items-center gap-1">
            <Bot className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs text-gray-500">{d.confidence_score}% confidence</span>
          </div>
        )}
      </div>

      {/* Task title */}
      <div className="text-xs text-gray-500">
        Task: <span className="text-gray-400">{d.task_title}</span>
      </div>

      {/* Deliverable Content */}
      <div className="border border-gray-800/50 rounded-lg p-4 bg-gray-900/40">
        {renderDeliverable()}
      </div>

      {/* AI Reasoning */}
      {d.reasoning && (
        <div className="flex items-start gap-2 px-3 py-2 bg-blue-500/5 border border-blue-500/10 rounded-lg">
          <Bot className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-400">{d.reasoning}</p>
        </div>
      )}

      {/* Action Bar */}
      {d.ai_status === 'draft_ready' && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleApprove}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approve
          </button>
          <button
            onClick={handleEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 text-sm transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 text-sm transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDismiss}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/60 text-gray-400 hover:bg-red-500/10 hover:text-red-400 text-sm transition-colors ml-auto"
          >
            <XCircle className="w-3.5 h-3.5" />
            Dismiss
          </button>
        </div>
      )}

      {/* Standard Actions */}
      <ActionButtons actions={data.actions} onActionClick={onActionClick} />
    </div>
  );
});

TaskDeliverableResponse.displayName = 'TaskDeliverableResponse';

export default TaskDeliverableResponse;
