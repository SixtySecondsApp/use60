import { useState } from 'react';
import { Mail, FileText, RefreshCw, CheckSquare, Search, ChevronDown, ChevronUp } from 'lucide-react';
import type { GraphNode } from './types';

interface GraphAgentActionsProps {
  node: GraphNode;
}

interface ActionCard {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  credits: number;
  confidence: number;
  getPreview: (node: GraphNode) => string;
}

const ACTION_CARDS: ActionCard[] = [
  {
    id: 'draft-followup',
    label: 'Draft Follow-up',
    icon: Mail,
    color: '#6366f1',
    credits: 2,
    confidence: 0.87,
    getPreview: (node) => {
      const name = node.full_name || node.first_name || 'them';
      const company = node.company_obj?.name || node.company || 'their company';
      const deal = node.deals[0]?.name ?? 'your conversation';
      return `Draft a follow-up email to ${name} at ${company} about ${deal}. 60 will match your tone, reference your last interaction, and suggest the right next step.`;
    },
  },
  {
    id: 'meeting-prep',
    label: 'Meeting Prep',
    icon: FileText,
    color: '#8b5cf6',
    credits: 4,
    confidence: 0.92,
    getPreview: (node) => {
      const name = node.full_name || node.first_name || 'this contact';
      return `Prepare a comprehensive brief for your next meeting with ${name}, including deal history, open questions, recent signals, and suggested talking points.`;
    },
  },
  {
    id: 're-engage',
    label: 'Re-engage',
    icon: RefreshCw,
    color: '#0ea5e9',
    credits: 3,
    confidence: 0.76,
    getPreview: (node) => {
      const name = node.full_name || node.first_name || 'this contact';
      return `Craft a re-engagement message to ${name} who has been cooling. 60 will pick a fresh angle based on recent activity and keep it natural — not salesy.`;
    },
  },
  {
    id: 'create-task',
    label: 'Create Task',
    icon: CheckSquare,
    color: '#22c55e',
    credits: 0,
    confidence: 0.95,
    getPreview: (node) => {
      const name = node.full_name || node.first_name || 'this contact';
      return `Create a follow-up task for ${name} with a suggested due date and action, dropped straight into your pipeline.`;
    },
  },
  {
    id: 'enrich-profile',
    label: 'Enrich Profile',
    icon: Search,
    color: '#f59e0b',
    credits: 1,
    confidence: 0.88,
    getPreview: (node) => {
      const name = node.full_name || node.first_name || 'this contact';
      return `Enrich ${name}'s profile with the latest company and role data, including LinkedIn activity, funding news, and recent job changes.`;
    },
  },
];

export function GraphAgentActions({ node }: GraphAgentActionsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [triggeredIds, setTriggeredIds] = useState<Set<string>>(new Set());

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleTrigger(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setTriggeredIds((prev) => new Set(prev).add(id));
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-gray-400 text-[10px] font-semibold uppercase tracking-wide mb-0.5">
        Agent Actions
      </div>

      {ACTION_CARDS.map((action) => {
        const Icon = action.icon;
        const isExpanded = expandedId === action.id;
        const isTriggered = triggeredIds.has(action.id);
        const confidencePct = Math.round(action.confidence * 100);

        return (
          <div
            key={action.id}
            className="bg-[#1e1e2e]/60 rounded-xl border border-white/[0.04] overflow-hidden cursor-pointer transition-all duration-200"
            style={{
              boxShadow: isExpanded ? `0 0 0 1px ${action.color}22` : undefined,
            }}
            onClick={() => handleToggle(action.id)}
          >
            {/* Collapsed row */}
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              {/* Icon */}
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${action.color}1a` }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: action.color }} />
              </div>

              {/* Label + confidence */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-100 text-xs font-semibold">{action.label}</span>
                  <span className="text-gray-500 text-[10px] ml-2 shrink-0">
                    {confidencePct}% match
                  </span>
                </div>
                {/* Confidence bar */}
                <div className="h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${confidencePct}%`, background: action.color }}
                  />
                </div>
              </div>

              {/* Credits + chevron */}
              <div className="flex items-center gap-2 shrink-0 ml-1">
                <span className="text-gray-500 text-[10px]">
                  {action.credits === 0 ? 'Free' : `${action.credits}cr`}
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3 text-gray-500" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-gray-500" />
                )}
              </div>
            </div>

            {/* Expanded preview */}
            {isExpanded && (
              <div
                className="px-3.5 pb-3.5"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="rounded-lg p-3 mb-3 text-[11px] text-gray-300 leading-relaxed"
                  style={{ background: `${action.color}0d`, borderLeft: `2px solid ${action.color}40` }}
                >
                  {action.getPreview(node)}
                </div>

                {isTriggered ? (
                  <div className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-center bg-green-500/10 text-green-400">
                    Queued via Command Centre
                  </div>
                ) : (
                  <button
                    className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-[0.97]"
                    style={{
                      background: `${action.color}33`,
                      color: action.color,
                    }}
                    onClick={(e) => handleTrigger(e, action.id)}
                  >
                    {action.credits === 0 ? 'Run Free' : `Run · ${action.credits} credit${action.credits !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
