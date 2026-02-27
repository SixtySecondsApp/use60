/**
 * DailyFocusPlanResponse
 *
 * Interactive, grouped daily priority view replacing the old flat list.
 *
 * Sections:
 *   1. One-Thing Hero  — single most critical action today
 *   2. Urgency Tiers   — Critical / High / Medium collapsible groups
 *   3. Contacts        — at-risk contacts with re-engagement CTA chips
 *   4. Task Pack       — ready-to-create tasks with per-task confirm
 *   5. Day Sequence    — morning / midday / afternoon / EOD guide
 *   6. Time Budget     — capacity bar (total minutes vs available)
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Mail,
  Phone,
  Sparkles,
  Target,
  User,
  Users,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import type { DailyFocusPlanResponse as DailyFocusPlanResponseType } from '../types';

interface Props {
  data: DailyFocusPlanResponseType;
  onActionClick?: (action: any) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function urgencyConfig(urgency: string) {
  switch (urgency) {
    case 'critical':
      return {
        dot: 'bg-red-500',
        badge: 'bg-red-500/15 text-red-400 border-red-500/30',
        label: 'Critical',
        border: 'border-l-red-500',
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
      };
    case 'high':
      return {
        dot: 'bg-orange-500',
        badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
        label: 'High',
        border: 'border-l-orange-500',
        icon: <Zap className="w-3.5 h-3.5" />,
      };
    default:
      return {
        dot: 'bg-yellow-500',
        badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
        label: 'Medium',
        border: 'border-l-yellow-500',
        icon: <Target className="w-3.5 h-3.5" />,
      };
  }
}

function entityIcon(type: string) {
  switch (type) {
    case 'deal':
      return <Briefcase className="w-3.5 h-3.5 text-violet-400" />;
    case 'contact':
      return <User className="w-3.5 h-3.5 text-cyan-400" />;
    default:
      return <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />;
  }
}

function priorityBadge(p: string) {
  switch (p) {
    case 'urgent':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'high':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'low':
      return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
    default:
      return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
  }
}

const DAY_BLOCKS = [
  { key: 'morning', label: 'Morning', sub: 'Clear urgent emails & calls', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  { key: 'midday', label: 'Midday', sub: 'Re-engage at-risk contacts', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  { key: 'afternoon', label: 'Afternoon', sub: 'Prepare proposals & meetings', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  { key: 'eod', label: 'EOD', sub: 'Admin, CRM updates, next-day prep', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  iconColor,
  title,
  count,
  badge,
  isOpen,
  onToggle,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  count?: number;
  badge?: { text: string; cls: string };
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 hover:bg-gray-800/30 transition-colors text-left rounded-t-xl"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className={cn('w-4 h-4 shrink-0', iconColor)} />
        <span className="text-sm font-semibold text-white">{title}</span>
        {typeof count === 'number' && (
          <span className="text-xs text-gray-400 bg-gray-800/60 px-2 py-0.5 rounded-full shrink-0">
            {count}
          </span>
        )}
        {badge && (
          <span className={cn('text-xs px-2 py-0.5 rounded-full border shrink-0', badge.cls)}>
            {badge.text}
          </span>
        )}
      </div>
      {isOpen ? (
        <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
      ) : (
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      )}
    </button>
  );
}

function CollapsibleSection({
  icon,
  iconColor,
  title,
  count,
  badge,
  defaultOpen = true,
  children,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  count?: number;
  badge?: { text: string; cls: string };
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 overflow-hidden">
      <SectionHeader
        icon={icon}
        iconColor={iconColor}
        title={title}
        count={count}
        badge={badge}
        isOpen={isOpen}
        onToggle={() => setIsOpen((v) => !v)}
      />
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-3 pb-3 pt-1 space-y-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Priority item row (deal / contact / task in urgency tiers) ───────────────

function PriorityRow({
  item,
  onActionClick,
}: {
  item: any;
  onActionClick?: (action: any) => void;
}) {
  const cfg = urgencyConfig(item.urgency || 'medium');

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg bg-black/20 border border-l-2 border-gray-800/50 hover:bg-black/30 transition-colors',
        cfg.border,
      )}
    >
      <div className="flex flex-col items-center gap-1 pt-0.5">
        {entityIcon(item.type)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-white leading-snug">{item.name}</span>
            {item.context && (
              <p className="text-xs text-gray-400 mt-0.5 leading-snug">{item.context}</p>
            )}
            {item.reason && (
              <p className="text-xs text-cyan-400/80 mt-1 leading-snug">{item.reason}</p>
            )}
          </div>
          <span
            className={cn(
              'flex-shrink-0 text-xs px-1.5 py-0.5 rounded border flex items-center gap-1',
              cfg.badge,
            )}
          >
            {cfg.icon}
            {cfg.label}
          </span>
        </div>
        {/* Contextual action chips */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {item.type === 'deal' && item.id && (
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-colors flex items-center gap-1"
              onClick={() =>
                onActionClick?.({ callback: 'open_deal', params: { dealId: item.id } })
              }
            >
              <ExternalLink className="w-3 h-3" /> View Deal
            </button>
          )}
          {item.type === 'contact' && item.id && (
            <>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors flex items-center gap-1"
                onClick={() =>
                  onActionClick?.({ callback: 'open_contact', params: { contactId: item.id } })
                }
              >
                <User className="w-3 h-3" /> View
              </button>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                onClick={() =>
                  onActionClick?.({
                    callback: 'send_message',
                    params: {
                      prompt: `Draft a re-engagement email for ${item.name}. Use my personal writing style. Keep it warm and concise.`,
                    },
                  })
                }
              >
                <Mail className="w-3 h-3" /> Draft Email
              </button>
            </>
          )}
          {item.type === 'task' && (
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
              onClick={() => onActionClick?.({ callback: 'open_task', params: {} })}
            >
              <CheckSquare className="w-3 h-3" /> View Tasks
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Action row (next best actions) ──────────────────────────────────────────

function ActionRow({
  action,
  index,
  onActionClick,
}: {
  action: any;
  index: number;
  onActionClick?: (action: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const p = action.priority || 'medium';

  return (
    <div className="rounded-lg bg-black/20 border border-gray-800/50 overflow-hidden">
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-black/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-300">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-white leading-snug">{action.title}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {action.estimated_time && (
                <span className="text-xs text-gray-500 flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {action.estimated_time}m
                </span>
              )}
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded border capitalize',
                  priorityBadge(p),
                )}
              >
                {p}
              </span>
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              )}
            </div>
          </div>
          {!expanded && action.description && (
            <p className="text-xs text-gray-400 mt-0.5 leading-snug line-clamp-1">
              {action.description}
            </p>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="px-3 pb-3"
          >
            {action.description && (
              <p className="text-xs text-gray-300 leading-relaxed mb-2">{action.description}</p>
            )}
            {action.roi_rationale && (
              <p className="text-xs text-emerald-400/80 italic mb-2">{action.roi_rationale}</p>
            )}
            {action.pipeline_impact && (
              <p className="text-xs text-blue-400/70 mb-3">
                Impact: {action.pipeline_impact}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {action.entity_type === 'deal' && action.entity_id && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-colors flex items-center gap-1"
                  onClick={() =>
                    onActionClick?.({
                      callback: 'open_deal',
                      params: { dealId: action.entity_id },
                    })
                  }
                >
                  <Briefcase className="w-3 h-3" /> Open Deal
                </button>
              )}
              {action.entity_type === 'contact' && action.entity_id && (
                <>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors flex items-center gap-1"
                    onClick={() =>
                      onActionClick?.({
                        callback: 'open_contact',
                        params: { contactId: action.entity_id },
                      })
                    }
                  >
                    <User className="w-3 h-3" /> Open Contact
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                    onClick={() =>
                      onActionClick?.({
                        callback: 'send_message',
                        params: { prompt: `Draft an email for: ${action.title}` },
                      })
                    }
                  >
                    <Mail className="w-3 h-3" /> Draft Email
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Task pack card ───────────────────────────────────────────────────────────

function TaskPackCard({
  task,
  index,
  onActionClick,
  sendMessage,
  isLoading,
}: {
  task: any;
  index: number;
  onActionClick?: (action: any) => void;
  sendMessage: (msg: string) => void;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg bg-black/20 border border-gray-800/50 overflow-hidden">
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-black/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-300">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-white leading-snug">{task.title}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {task.due_date && (
                <span className="text-xs text-gray-500 flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {task.due_date}
                </span>
              )}
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded border capitalize',
                  priorityBadge(task.priority || 'medium'),
                )}
              >
                {task.priority || 'medium'}
              </span>
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="px-3 pb-3"
          >
            {task.description && (
              <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed mb-3 bg-black/20 rounded-lg p-2 max-h-40 overflow-auto">
                {task.description}
              </pre>
            )}
            <div className="flex flex-wrap gap-1.5">
              {task.deal_id && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-colors flex items-center gap-1"
                  onClick={() =>
                    onActionClick?.({ callback: 'open_deal', params: { dealId: task.deal_id } })
                  }
                >
                  <Briefcase className="w-3 h-3" /> Open Deal
                </button>
              )}
              {task.contact_id && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors flex items-center gap-1"
                  onClick={() =>
                    onActionClick?.({
                      callback: 'open_contact',
                      params: { contactId: task.contact_id },
                    })
                  }
                >
                  <User className="w-3 h-3" /> Open Contact
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Time budget bar ──────────────────────────────────────────────────────────

function TimeBudgetBar({ budget }: { budget: any }) {
  if (!budget || !budget.total_action_minutes || !budget.available_minutes) return null;

  const used = Math.min(budget.total_action_minutes, budget.available_minutes);
  const pct = Math.round((used / budget.available_minutes) * 100);
  const over = budget.total_action_minutes > budget.available_minutes;

  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-semibold text-white">Time Budget</span>
        </div>
        <span
          className={cn(
            'text-xs px-1.5 py-0.5 rounded border capitalize',
            budget.capacity_assessment === 'busy'
              ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
              : budget.capacity_assessment === 'available'
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-blue-500/15 text-blue-400 border-blue-500/30',
          )}
        >
          {budget.capacity_assessment || 'normal'}
        </span>
      </div>
      <div className="h-2 bg-gray-800/60 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            over ? 'bg-red-500' : pct > 80 ? 'bg-orange-500' : 'bg-emerald-500',
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-gray-500">
          {budget.total_action_minutes}m planned
        </span>
        <span className={cn('text-xs', over ? 'text-red-400' : 'text-gray-500')}>
          {budget.available_minutes}m available
          {over && ' — trimmed to fit'}
        </span>
      </div>
    </div>
  );
}

// ─── Day sequence strip ───────────────────────────────────────────────────────

function DaySequenceStrip({ actions }: { actions: any[] }) {
  if (!actions || actions.length === 0) return null;

  // Distribute actions across blocks by index
  const slots = [[], [], [], []] as any[][];
  actions.forEach((a, i) => slots[Math.min(i % 4, 3)].push(a));

  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold text-white">Recommended Sequence</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {DAY_BLOCKS.map((block, bi) => (
          <div
            key={block.key}
            className={cn('rounded-lg border p-2.5', block.bg)}
          >
            <div className={cn('text-xs font-bold mb-0.5', block.color)}>{block.label}</div>
            <div className="text-xs text-gray-400 leading-snug mb-1.5">{block.sub}</div>
            {slots[bi].length > 0 ? (
              <div className="space-y-1">
                {slots[bi].map((a: any, ai: number) => (
                  <div
                    key={ai}
                    className="text-xs text-gray-300 bg-black/20 rounded px-1.5 py-1 leading-snug line-clamp-2"
                  >
                    {a.title}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-600 italic">No actions</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function DailyFocusPlanResponse({ data, onActionClick }: Props) {
  const { sendMessage, isLoading } = useCopilot();
  const { pipelineDeals, contactsNeedingAttention, openTasks, plan, isSimulation } = data.data;

  const oneThing = plan?.one_thing;
  const priorities: any[] = plan?.priorities || [];
  const actions: any[] = plan?.actions || [];
  const taskPack: any[] = plan?.task_pack || [];
  const timeBudget = plan?.time_budget;

  // Split priorities by urgency
  const critical = priorities.filter((p) => p.urgency === 'critical');
  const high = priorities.filter((p) => p.urgency === 'high');
  const medium = priorities.filter((p) => !['critical', 'high'].includes(p.urgency));

  // Pull out contact-type priorities for dedicated contacts section
  const contactPriorities = priorities.filter((p) => p.type === 'contact');

  return (
    <motion.div
      className="space-y-4"
      data-testid="daily-focus-plan-response"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white">Daily Focus Plan</h3>
          </div>
          <p className="text-sm text-gray-300 mt-1">{data.summary}</p>
        </div>
        <span
          className={cn(
            'flex-shrink-0 text-xs px-2 py-1 rounded-md border',
            isSimulation
              ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
          )}
        >
          {isSimulation ? 'Preview' : 'Active'}
        </span>
      </div>

      {/* ① The One Thing */}
      {oneThing && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-violet-500/30 bg-violet-500/8 p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-bold text-violet-300 uppercase tracking-wide">
              #1 Priority Today
            </span>
            {oneThing.estimated_time && (
              <span className="ml-auto text-xs text-gray-500 flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {oneThing.estimated_time}m
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-white mb-1">{oneThing.title}</p>
          {oneThing.description && (
            <p className="text-xs text-gray-300 leading-relaxed mb-2">{oneThing.description}</p>
          )}
          {oneThing.rationale && (
            <p className="text-xs text-emerald-400/80 italic mb-3">{oneThing.rationale}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {oneThing.entity_type === 'deal' && oneThing.entity_id && (
              <button
                type="button"
                className="text-xs px-2.5 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-colors flex items-center gap-1.5 font-medium"
                onClick={() =>
                  onActionClick?.({ callback: 'open_deal', params: { dealId: oneThing.entity_id } })
                }
              >
                <Briefcase className="w-3.5 h-3.5" /> Open Deal <ArrowRight className="w-3 h-3" />
              </button>
            )}
            {oneThing.entity_type === 'contact' && oneThing.entity_id && (
              <button
                type="button"
                className="text-xs px-2.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/30 transition-colors flex items-center gap-1.5 font-medium"
                onClick={() =>
                  onActionClick?.({ callback: 'open_contact', params: { contactId: oneThing.entity_id } })
                }
              >
                <User className="w-3.5 h-3.5" /> Open Contact <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* ② Urgency Tiers */}
      {critical.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <CollapsibleSection
            icon={AlertTriangle}
            iconColor="text-red-400"
            title="Urgent — Do These First"
            count={critical.length}
            badge={{ text: 'Overdue or time-critical', cls: 'bg-red-500/15 text-red-400 border-red-500/30' }}
            defaultOpen={true}
          >
            {critical.map((item, i) => (
              <PriorityRow key={i} item={item} onActionClick={onActionClick} />
            ))}
          </CollapsibleSection>
        </motion.div>
      )}

      {high.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <CollapsibleSection
            icon={Zap}
            iconColor="text-orange-400"
            title="High Priority — Complete Today"
            count={high.length}
            defaultOpen={true}
          >
            {high.map((item, i) => (
              <PriorityRow key={i} item={item} onActionClick={onActionClick} />
            ))}
          </CollapsibleSection>
        </motion.div>
      )}

      {medium.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <CollapsibleSection
            icon={Target}
            iconColor="text-yellow-400"
            title="Medium Priority"
            count={medium.length}
            defaultOpen={false}
          >
            {medium.map((item, i) => (
              <PriorityRow key={i} item={item} onActionClick={onActionClick} />
            ))}
          </CollapsibleSection>
        </motion.div>
      )}

      {/* ③ At-risk contacts section (if not already covered by priorities) */}
      {contactPriorities.length === 0 && contactsNeedingAttention && contactsNeedingAttention.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
          <CollapsibleSection
            icon={Users}
            iconColor="text-cyan-400"
            title="Critical Contacts — Re-engage Now"
            count={contactsNeedingAttention.length}
            badge={{ text: 'at risk of going cold', cls: 'bg-red-500/15 text-red-400 border-red-500/30' }}
            defaultOpen={true}
          >
            {contactsNeedingAttention.slice(0, 6).map((c: any, i: number) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 p-3 rounded-lg bg-black/20 border border-gray-800/50 hover:bg-black/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{c.name || c.contact_name}</span>
                    {(c.riskLevel === 'high' || c.urgency === 'critical') && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">
                        Critical
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                    {(c.company || c.company_name) && <span>{c.company || c.company_name}</span>}
                    {c.lastSeen && (
                      <>
                        <span>•</span>
                        <span>Last seen {c.lastSeen}</span>
                      </>
                    )}
                    {c.daysSinceContact && (
                      <>
                        <span>•</span>
                        <span>{c.daysSinceContact}d since contact</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {c.id && (
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors flex items-center gap-1"
                        onClick={() =>
                          onActionClick?.({ callback: 'open_contact', params: { contactId: c.id } })
                        }
                      >
                        <User className="w-3 h-3" /> View
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                      onClick={() =>
                        onActionClick?.({
                          callback: 'send_message',
                          params: {
                            prompt: `Draft a warm re-engagement email for ${c.name || c.contact_name}${c.company || c.company_name ? ` at ${c.company || c.company_name}` : ''}. Use my personal writing style.`,
                          },
                        })
                      }
                    >
                      <Mail className="w-3 h-3" /> Draft Email
                    </button>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-md bg-gray-700/30 border border-gray-700/40 text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors flex items-center gap-1"
                      onClick={() =>
                        onActionClick?.({
                          callback: 'send_message',
                          params: {
                            prompt: `What do I need to know about ${c.name || c.contact_name}? Give me relationship context and recent activity.`,
                          },
                        })
                      }
                    >
                      Get Context
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </CollapsibleSection>
        </motion.div>
      )}

      {/* ④ Next Best Actions */}
      {actions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <CollapsibleSection
            icon={Sparkles}
            iconColor="text-blue-400"
            title="Next Best Actions"
            count={actions.length}
            defaultOpen={priorities.length === 0}
          >
            {actions.map((action, i) => (
              <ActionRow key={i} action={action} index={i} onActionClick={onActionClick} />
            ))}
          </CollapsibleSection>
        </motion.div>
      )}

      {/* ⑤ Day Sequence */}
      {actions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <DaySequenceStrip actions={actions} />
        </motion.div>
      )}

      {/* ⑥ Task Pack */}
      {taskPack.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <CollapsibleSection
            icon={CheckSquare}
            iconColor="text-emerald-400"
            title="Task Pack"
            count={taskPack.length}
            badge={
              isSimulation
                ? { text: 'Preview — confirm to create', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
                : { text: 'Created', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
            }
            defaultOpen={true}
          >
            {taskPack.map((task, i) => (
              <TaskPackCard
                key={i}
                task={task}
                index={i}
                onActionClick={onActionClick}
                sendMessage={sendMessage}
                isLoading={isLoading}
              />
            ))}
            <div className="flex gap-2 pt-1">
              {isSimulation ? (
                <Button
                  size="sm"
                  onClick={() => sendMessage('Confirm')}
                  disabled={isLoading}
                  className="gap-2"
                  data-testid="daily-focus-plan-confirm-btn"
                >
                  <CheckSquare className="w-4 h-4" />
                  Create {taskPack.length} task{taskPack.length !== 1 ? 's' : ''}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onActionClick?.({ callback: 'open_task', params: {} })}
                  className="gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  View all tasks
                </Button>
              )}
            </div>
          </CollapsibleSection>
        </motion.div>
      )}

      {/* ⑦ Time Budget */}
      {timeBudget && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <TimeBudgetBar budget={timeBudget} />
        </motion.div>
      )}

      {/* Empty state */}
      {priorities.length === 0 && actions.length === 0 && taskPack.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <Sparkles className="w-8 h-8 mx-auto mb-3 text-violet-400/50" />
          <p className="text-sm">All caught up! Nothing urgent right now.</p>
        </div>
      )}
    </motion.div>
  );
}
