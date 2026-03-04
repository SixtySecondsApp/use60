/**
 * InAppQuestionCard — LEARN-UI-002
 *
 * Renders a single agent_config_question in-app.
 * Mirrors Slack Block Kit layout: question text, answer options, submit/skip.
 * Supports: single_select, multi_select, free_text, scale (1-10).
 *
 * LEARN-UI-006: submit calls answer-config-question edge function via useSubmitAnswer.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Brain,
  CheckCircle2,
  Circle,
  Send,
  SkipForward,
  Loader2,
} from 'lucide-react';
import {
  type AgentConfigQuestion,
  type QuestionOption,
  useSubmitAnswer,
  useSkipQuestion,
} from '@/lib/services/configQuestionService';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/hooks/useAuth';

// ============================================================================
// Category label
// ============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  revenue_pipeline: 'Revenue & Pipeline',
  daily_rhythm: 'Daily Rhythm',
  agent_behaviour: 'Agent Behaviour',
  methodology: 'Methodology',
  signals: 'Signals',
};

// ============================================================================
// Option pill (single/multi select)
// ============================================================================

function OptionPill({
  option,
  selected,
  multi,
  onClick,
}: {
  option: QuestionOption;
  selected: boolean;
  multi: boolean;
  onClick: () => void;
}) {
  const Icon = multi
    ? selected
      ? CheckCircle2
      : Circle
    : selected
    ? CheckCircle2
    : Circle;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border text-sm transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        selected
          ? 'border-indigo-500/50 bg-indigo-500/10 text-gray-900 dark:text-gray-100'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/70'
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 flex-shrink-0 mt-0.5',
          selected ? 'text-indigo-400' : 'text-gray-400 dark:text-gray-600'
        )}
      />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{option.label}</span>
        {option.description && (
          <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
        )}
      </div>
    </button>
  );
}

// ============================================================================
// Scale selector (1-10)
// ============================================================================

function ScaleSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            'h-9 w-9 rounded-lg border text-sm font-medium transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
            value === n
              ? 'border-indigo-500 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200'
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface InAppQuestionCardProps {
  question: AgentConfigQuestion;
  /** Called after successful submission or skip */
  onDone?: () => void;
  className?: string;
}

export function InAppQuestionCard({ question, onDone, className }: InAppQuestionCardProps) {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();

  const submitMutation = useSubmitAnswer(activeOrgId ?? '', user?.id);
  const skipMutation = useSkipQuestion(activeOrgId ?? '', user?.id);

  // Answer state
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [scaleValue, setScaleValue] = useState<number | null>(null);

  const categoryLabel = CATEGORY_LABELS[question.category] ?? question.category;

  // Derive the answer value to submit
  const getAnswerValue = (): string | null => {
    switch (question.answer_type) {
      case 'single_select':
        return selectedValues[0] ?? null;
      case 'multi_select':
        return selectedValues.length > 0 ? selectedValues.join(',') : null;
      case 'free_text':
        return freeText.trim() || null;
      case 'scale':
        return scaleValue !== null ? String(scaleValue) : null;
      default:
        return null;
    }
  };

  const canSubmit = (() => {
    const v = getAnswerValue();
    return v !== null && v !== '';
  })();

  const handleSubmit = async () => {
    const answer = getAnswerValue();
    if (!answer) return;
    await submitMutation.mutateAsync({
      question_id: question.id,
      answer_value: answer,
      answered_via: 'in_app',
    });
    onDone?.();
  };

  const handleSkip = async () => {
    await skipMutation.mutateAsync({ question_id: question.id });
    onDone?.();
  };

  const toggleOption = (value: string) => {
    if (question.answer_type === 'single_select') {
      setSelectedValues([value]);
    } else {
      setSelectedValues((prev) =>
        prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
      );
    }
  };

  const isBusy = submitMutation.isPending || skipMutation.isPending;

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-5 space-y-4',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="flex-shrink-0 h-7 w-7 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center mt-0.5">
          <Brain className="h-3.5 w-3.5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-medium text-indigo-400 uppercase tracking-wider">
            {categoryLabel}
          </span>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5 leading-snug">
            {question.question_text}
          </p>
        </div>
      </div>

      {/* Answer area */}
      <div className="space-y-2">
        {/* Single or multi select */}
        {(question.answer_type === 'single_select' || question.answer_type === 'multi_select') &&
          (question.options ?? []).map((opt) => (
            <OptionPill
              key={opt.value}
              option={opt}
              selected={selectedValues.includes(opt.value)}
              multi={question.answer_type === 'multi_select'}
              onClick={() => toggleOption(opt.value)}
            />
          ))}

        {/* Free text */}
        {question.answer_type === 'free_text' && (
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={3}
            placeholder="Type your answer…"
            className={cn(
              'w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60',
              'text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 resize-none',
              'focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40',
              'transition-colors'
            )}
          />
        )}

        {/* Scale */}
        {question.answer_type === 'scale' && (
          <div className="space-y-1.5">
            <ScaleSelector value={scaleValue} onChange={setScaleValue} />
            <div className="flex justify-between text-[10px] text-gray-600 px-0.5">
              <span>Not at all</span>
              <span>Extremely</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || isBusy}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
            canSubmit && !isBusy
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
          )}
        >
          {submitMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Submit
        </button>

        <button
          type="button"
          onClick={handleSkip}
          disabled={isBusy}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-500',
            'hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-600'
          )}
        >
          {skipMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <SkipForward className="h-3.5 w-3.5" />
          )}
          Skip
        </button>
      </div>
    </div>
  );
}
