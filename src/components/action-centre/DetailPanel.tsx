/**
 * DetailPanel Component
 *
 * Right panel for the Action Centre showing full action details,
 * AI reasoning, type-specific content, and approval actions.
 */

import { motion } from 'framer-motion';
import {
  Eye,
  Clock,
  Sparkles,
  X,
  Send,
  MessageSquare,
  CheckSquare,
  Check,
  Edit,
  Copy,
  Calendar,
  TrendingUp,
  Target,
  AlertCircle,
  Lightbulb,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { typeConfig, riskConfig, approveLabels } from './config';
import { formatTimeAgo } from './utils';
import { EntityBadge } from './EntityBadge';
import type {
  DisplayAction,
  EmailDetails,
  SlackDetails,
  TaskDetails,
  InsightDetails,
  AlertDetails,
  MeetingPrepDetails,
} from './types';

interface DetailPanelProps {
  action: DisplayAction | null;
  onApprove: (id: string, edits?: Record<string, unknown>) => void;
  onDismiss: (id: string) => void;
  isLoading?: boolean;
}

export function DetailPanel({ action, onApprove, onDismiss, isLoading }: DetailPanelProps) {
  if (!action) {
    return <EmptyState />;
  }

  const config = typeConfig[action.action_type];
  const risk = riskConfig[action.risk_level];
  const Icon = config.icon;
  const approveLabel = approveLabels[action.action_type];

  const getApproveIcon = () => {
    switch (action.action_type) {
      case 'email':
        return Send;
      case 'slack_message':
        return MessageSquare;
      case 'task':
        return CheckSquare;
      default:
        return Check;
    }
  };

  const ApproveIcon = getApproveIcon();

  return (
    <motion.div
      key={action.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="p-6 border-b border-gray-800/50">
        <div className="flex items-start gap-4 mb-4">
          {/* Stylish icon with gradient, glow, and shimmer effect */}
          {/* Glassmorphic icon - dark background with colored icon */}
          <div
            className={cn(
              'w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0',
              config.iconBg
            )}
          >
            <Icon className={cn('w-7 h-7', config.iconColor)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-full border',
                  risk.bg,
                  risk.text,
                  risk.border
                )}
              >
                {risk.label}
              </span>
              {action.source && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {action.source}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(action.created_at)} ago
            </span>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-white mb-2">{action.title}</h1>
        {action.description && (
          <p className="text-gray-400 text-sm leading-relaxed mb-4">{action.description}</p>
        )}

        {/* Action buttons in header */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => onDismiss(action.id)}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 h-10 rounded-xl
                      text-gray-400 hover:text-gray-200
                      bg-gray-800/50 hover:bg-gray-800
                      border border-gray-700/50 hover:border-gray-600/50
                      transition-all duration-200 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
            <span className="font-medium text-sm">Dismiss</span>
          </button>

          <button
            onClick={() => onApprove(action.id)}
            disabled={isLoading}
            className={cn(
              'flex items-center gap-2 px-5 h-10 rounded-xl font-semibold text-sm',
              'transition-all duration-200 shadow-lg disabled:opacity-50',
              action.risk_level === 'info'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white shadow-blue-500/25'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-emerald-500/25'
            )}
          >
            <ApproveIcon className="w-4 h-4" />
            {approveLabel}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Entities */}
        {action.entities && action.entities.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Related
            </h3>
            <div className="flex flex-wrap gap-2">
              {action.entities.map((entity) => (
                <EntityBadge key={`${entity.type}-${entity.id || entity.name}`} entity={entity} />
              ))}
            </div>
          </div>
        )}

        {/* AI Reasoning */}
        {action.aiReasoning && (
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-400">AI Reasoning</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{action.aiReasoning}</p>
          </div>
        )}

        {/* Type-specific content */}
        {action.action_type === 'email' && action.details && (
          <EmailContent details={action.details as EmailDetails} />
        )}

        {action.action_type === 'slack_message' && action.details && (
          <SlackContent details={action.details as SlackDetails} />
        )}

        {action.action_type === 'task' && action.details && (
          <TaskContent details={action.details as TaskDetails} />
        )}

        {action.action_type === 'insight' && action.details && (
          <InsightContent details={action.details as InsightDetails} />
        )}

        {action.action_type === 'alert' && action.details && (
          <AlertContent details={action.details as AlertDetails} />
        )}

        {action.action_type === 'meeting_prep' && action.details && (
          <MeetingPrepContent details={action.details as MeetingPrepDetails} />
        )}
      </div>

    </motion.div>
  );
}

// Empty state when no action is selected
function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="p-4 rounded-2xl bg-gray-800 border border-gray-700/50 inline-block mb-4">
          <Eye className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-400 mb-1">Select an action</h3>
        <p className="text-sm text-gray-600">Choose an item from the list to preview</p>
      </div>
    </div>
  );
}

// Email content section
function EmailContent({ details }: { details: EmailDetails }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Email Preview
      </h3>
      <div className="rounded-xl border border-gray-800/50 overflow-hidden">
        <div className="p-4 bg-gray-800/30 border-b border-gray-800/50 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 w-12">To:</span>
            <span className="text-gray-200">{details.to}</span>
          </div>
          {details.cc && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-12">CC:</span>
              <span className="text-gray-200">{details.cc}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 w-12">Subject:</span>
            <span className="text-white font-medium">{details.subject}</span>
          </div>
        </div>
        <div className="p-4 bg-gray-900/50">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
            {details.body}
          </pre>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
          <Edit className="w-3 h-3" />
          Edit before sending
        </button>
        <button className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
          <Copy className="w-3 h-3" />
          Copy to clipboard
        </button>
      </div>
    </div>
  );
}

// Slack content section
function SlackContent({ details }: { details: SlackDetails }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Slack Message Preview
      </h3>
      <div className="rounded-xl border border-gray-800/50 overflow-hidden">
        <div className="p-3 bg-gray-800/30 border-b border-gray-800/50 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-gray-200">{details.channel}</span>
        </div>
        <div className="p-4 bg-gray-900/50">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
            {details.message}
          </pre>
        </div>
      </div>
    </div>
  );
}

// Task content section
function TaskContent({ details }: { details: TaskDetails }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Task Details
      </h3>
      <div className="rounded-xl border border-gray-800/50 p-4 bg-gray-900/30 space-y-3">
        <div className="flex items-center gap-3">
          <CheckSquare className="w-5 h-5 text-emerald-400" />
          <span className="text-white font-medium">{details.taskTitle}</span>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <span className="text-xs text-gray-500 block mb-1">Due Date</span>
            <span className="text-sm text-gray-200">{details.dueDate}</span>
          </div>
          {details.priority && (
            <div>
              <span className="text-xs text-gray-500 block mb-1">Priority</span>
              <span className="text-sm text-amber-400">{details.priority}</span>
            </div>
          )}
        </div>
        {details.notes && (
          <div className="pt-2 border-t border-gray-800/50">
            <span className="text-xs text-gray-500 block mb-1">Notes</span>
            <p className="text-sm text-gray-300">{details.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Insight content section
function InsightContent({ details }: { details: InsightDetails }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Metrics</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-800/50 p-4 bg-gray-900/30">
          <span className="text-xs text-gray-500 block mb-1">Current</span>
          <span className="text-3xl font-bold text-white">{details.current}</span>
          {details.change && (
            <span className="text-xs text-red-400 flex items-center gap-1 mt-1">
              <TrendingUp
                className={cn('w-3 h-3', details.trend === 'down' && 'rotate-180')}
              />
              {details.change}
            </span>
          )}
        </div>
        <div className="rounded-xl border border-emerald-500/20 p-4 bg-emerald-500/5">
          <span className="text-xs text-gray-500 block mb-1">Target</span>
          <span className="text-3xl font-bold text-emerald-400">{details.target}</span>
          <span className="text-xs text-gray-500 mt-1">Recommended</span>
        </div>
      </div>

      {details.breakdown && details.breakdown.length > 0 && (
        <div className="rounded-xl border border-gray-800/50 p-4 bg-gray-900/30">
          <span className="text-xs text-gray-500 block mb-3">Pipeline Breakdown</span>
          <div className="space-y-2">
            {details.breakdown.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{item.stage}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">{item.count} deals</span>
                  <span className="text-white font-medium">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {details.recommendation && (
        <div className="rounded-xl border border-amber-500/20 p-4 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">Recommendation</span>
          </div>
          <p className="text-sm text-gray-300">{details.recommendation}</p>
        </div>
      )}
    </div>
  );
}

// Alert content section
function AlertContent({ details }: { details: AlertDetails }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Risk Assessment
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-red-500/20 p-4 bg-red-500/5">
          <span className="text-xs text-gray-500 block mb-1">Last Activity</span>
          <span className="text-xl font-bold text-red-400">{details.lastActivity}</span>
        </div>
        <div className="rounded-xl border border-gray-800/50 p-4 bg-gray-900/30">
          <span className="text-xs text-gray-500 block mb-1">Deal Value</span>
          <span className="text-xl font-bold text-white">{details.dealValue}</span>
        </div>
      </div>

      {details.riskFactors.length > 0 && (
        <div className="rounded-xl border border-red-500/20 p-4 bg-red-500/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">Risk Factors</span>
          </div>
          <ul className="space-y-2">
            {details.riskFactors.map((factor, idx) => (
              <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                {factor}
              </li>
            ))}
          </ul>
        </div>
      )}

      {details.suggestedActions.length > 0 && (
        <div className="rounded-xl border border-emerald-500/20 p-4 bg-emerald-500/5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">Suggested Actions</span>
          </div>
          <ul className="space-y-2">
            {details.suggestedActions.map((suggestion, idx) => (
              <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Meeting prep content section
function MeetingPrepContent({ details }: { details: MeetingPrepDetails }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Meeting Details
      </h3>
      <div className="rounded-xl border border-gray-800/50 p-4 bg-gray-900/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-indigo-500/10">
            <Calendar className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <span className="text-white font-medium block">{details.meetingTime}</span>
            <span className="text-sm text-gray-500">
              {details.duration} • {details.meetingType}
            </span>
          </div>
        </div>

        {details.attendees.length > 0 && (
          <div className="border-t border-gray-800/50 pt-4">
            <span className="text-xs text-gray-500 block mb-3">Attendees</span>
            <div className="space-y-2">
              {details.attendees.map((attendee, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-medium text-gray-300">
                      {attendee.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>
                    <div>
                      <span className="text-sm text-white block">{attendee.name}</span>
                      <span className="text-xs text-gray-500">{attendee.title}</span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      attendee.role === 'Champion'
                        ? 'bg-blue-500/10 text-blue-400'
                        : attendee.role === 'Economic Buyer'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-gray-800 text-gray-400'
                    )}
                  >
                    {attendee.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {details.agenda.length > 0 && (
        <div className="rounded-xl border border-gray-800/50 p-4 bg-gray-900/30">
          <span className="text-xs text-gray-500 block mb-3">Agenda</span>
          <ul className="space-y-2">
            {details.agenda.map((item, idx) => (
              <li key={idx} className="text-sm text-gray-300 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-400">
                  {idx + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {details.talkingPoints.length > 0 && (
        <div className="rounded-xl border border-blue-500/20 p-4 bg-blue-500/5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-blue-400">Key Talking Points</span>
          </div>
          <ul className="space-y-2">
            {details.talkingPoints.map((point, idx) => (
              <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                <Check className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {details.competitiveIntel && (
        <div className="rounded-xl border border-amber-500/20 p-4 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">Competitive Intel</span>
          </div>
          <p className="text-sm text-gray-300">{details.competitiveIntel}</p>
        </div>
      )}
    </div>
  );
}
