/**
 * AnswerHistoryTimeline — LEARN-UI-005
 *
 * Shows a chronological list of previously answered config questions.
 * Uses the useAnsweredQuestions hook from configQuestionService.
 */

import { Loader2, CheckCircle2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  useAnsweredQuestions,
  type AnsweredQuestion,
  type QuestionCategory,
} from '@/lib/services/configQuestionService';

// ============================================================================
// Helpers
// ============================================================================

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  revenue_pipeline: 'Revenue & Pipeline',
  daily_rhythm: 'Daily Rhythm',
  agent_behaviour: 'Agent Behaviour',
  methodology: 'Methodology',
  signals: 'Signals',
};

function formatAnswerValue(answer: unknown): string {
  if (answer === null || answer === undefined) return '';
  if (typeof answer === 'object' && answer !== null && 'value' in answer) {
    return String((answer as { value: unknown }).value);
  }
  if (typeof answer === 'string') return answer;
  return JSON.stringify(answer);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ============================================================================
// Single timeline entry
// ============================================================================

function TimelineEntry({ item }: { item: AnsweredQuestion }) {
  const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;
  const answerDisplay = formatAnswerValue(item.answer_value);

  return (
    <div className="flex gap-3 py-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1">
        <div className="h-2 w-2 rounded-full bg-indigo-500" />
        <div className="flex-1 w-px bg-gray-800 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm text-gray-200">{item.question}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            {answerDisplay}
          </span>
          <span className="text-xs text-gray-600">
            {categoryLabel}
          </span>
          {item.answered_at && (
            <span className="text-xs text-gray-600">
              {formatDate(item.answered_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function AnswerHistoryTimeline() {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();

  const { data: answered = [], isLoading, isError } = useAnsweredQuestions(
    activeOrgId ?? '',
    user?.id
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading history...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">
        Could not load answer history
      </div>
    );
  }

  if (answered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-500">
        <MessageSquare className="h-5 w-5 text-gray-600" />
        <p className="text-sm">No answers yet. Answer some questions to build your history.</p>
      </div>
    );
  }

  return (
    <div className={cn('divide-y divide-gray-800/40')}>
      {answered.map((item) => (
        <TimelineEntry key={item.id} item={item} />
      ))}
    </div>
  );
}
