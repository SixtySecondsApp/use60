/**
 * AnswerHistoryTimeline — LEARN-UI-004
 *
 * Paginated reverse-chronological list of all agent_config_questions.
 * Filter by category. Each entry shows: question text, status, answer, date, channel.
 */

import React, { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
  MessageSquare,
  MonitorSmartphone,
  ChevronDown,
  Loader2,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAllConfigQuestions, type QuestionStatus, type QuestionCategory } from '@/lib/services/configQuestionService';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/hooks/useAuth';

// ============================================================================
// Config
// ============================================================================

const STATUS_CONFIG: Record<
  QuestionStatus,
  { label: string; Icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  pending: { label: 'Pending', Icon: Clock, cls: 'text-amber-400' },
  asked: { label: 'Asked', Icon: Clock, cls: 'text-blue-400' },
  answered: { label: 'Answered', Icon: CheckCircle2, cls: 'text-emerald-400' },
  skipped: { label: 'Skipped', Icon: SkipForward, cls: 'text-gray-500' },
  expired: { label: 'Expired', Icon: XCircle, cls: 'text-red-400' },
};

const CATEGORY_LABELS: Record<string, string> = {
  revenue_pipeline: 'Revenue & Pipeline',
  daily_rhythm: 'Daily Rhythm',
  agent_behaviour: 'Agent Behaviour',
  methodology: 'Methodology',
  signals: 'Signals',
};

const ALL_CATEGORIES: QuestionCategory[] = [
  'revenue_pipeline',
  'daily_rhythm',
  'agent_behaviour',
  'methodology',
  'signals',
];

const PAGE_SIZE = 20;

// ============================================================================
// Timeline entry
// ============================================================================

function TimelineEntry({ question }: { question: ReturnType<typeof useAllConfigQuestions>['data'] extends (infer T)[] | undefined ? T : never }) {
  const statusCfg = STATUS_CONFIG[question.status] ?? STATUS_CONFIG.pending;
  const { Icon } = statusCfg;
  const catLabel = CATEGORY_LABELS[question.category] ?? question.category;

  const dateStr = question.answered_at
    ? format(new Date(question.answered_at), 'MMM d, yyyy')
    : question.skipped_at
    ? format(new Date(question.skipped_at), 'MMM d, yyyy')
    : question.asked_at
    ? format(new Date(question.asked_at), 'MMM d, yyyy')
    : format(new Date(question.created_at), 'MMM d, yyyy');

  const relativeDate = question.answered_at
    ? formatDistanceToNow(new Date(question.answered_at), { addSuffix: true })
    : question.skipped_at
    ? formatDistanceToNow(new Date(question.skipped_at), { addSuffix: true })
    : formatDistanceToNow(new Date(question.created_at), { addSuffix: true });

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-800/60 last:border-0">
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        <Icon className={cn('h-4 w-4', statusCfg.cls)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 leading-snug">{question.question_text}</p>

        {/* Answer */}
        {question.answer_value && (
          <p className="text-xs text-indigo-300 mt-1 font-medium">
            &rarr; {question.answer_value}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
            {catLabel}
          </span>
          <span className={cn('text-[10px] font-medium', statusCfg.cls)}>
            {statusCfg.label}
          </span>
          {question.delivery_channel && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-600">
              {question.delivery_channel === 'slack' ? (
                <MessageSquare className="h-2.5 w-2.5" />
              ) : (
                <MonitorSmartphone className="h-2.5 w-2.5" />
              )}
              {question.delivery_channel === 'slack' ? 'Slack' : 'In-app'}
            </span>
          )}
          <span className="text-[10px] text-gray-600 ml-auto" title={dateStr}>
            {relativeDate}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface AnswerHistoryTimelineProps {
  className?: string;
}

export function AnswerHistoryTimeline({ className }: AnswerHistoryTimelineProps) {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<QuestionCategory | 'all'>('all');
  const [page, setPage] = useState(0);

  const { data: questions = [], isLoading, error } = useAllConfigQuestions(
    activeOrgId ?? '',
    user?.id
  );

  // Filter by category
  const filtered =
    activeCategory === 'all'
      ? questions
      : questions.filter((q) => q.category === activeCategory);

  // Paginate
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(0, (page + 1) * PAGE_SIZE);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Category filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => { setActiveCategory('all'); setPage(0); }}
          className={cn(
            'px-2.5 py-1 text-xs rounded-md transition-colors',
            activeCategory === 'all'
              ? 'bg-indigo-500/15 text-indigo-400 font-medium'
              : 'text-gray-500 hover:text-gray-300'
          )}
        >
          All
        </button>
        {ALL_CATEGORIES.map((cat) => {
          const count = questions.filter((q) => q.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); setPage(0); }}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md transition-colors',
                activeCategory === cat
                  ? 'bg-indigo-500/15 text-indigo-400 font-medium'
                  : 'text-gray-500 hover:text-gray-300'
              )}
            >
              {CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-32 text-red-400 text-sm">
          Failed to load history
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-gray-600 gap-2">
          <Inbox className="h-6 w-6" />
          <p className="text-sm">No questions yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
          <div className="divide-y divide-gray-800/0 px-4">
            {paginated.map((q) => (
              <TimelineEntry key={q.id} question={q} />
            ))}
          </div>

          {/* Load more */}
          {page + 1 < totalPages && (
            <div className="px-4 py-3 border-t border-gray-800">
              <button
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Load more ({filtered.length - paginated.length} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
