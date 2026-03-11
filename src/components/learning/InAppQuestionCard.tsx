/**
 * InAppQuestionCard — LEARN-UI-005
 *
 * Renders a single config question with optional pre-defined answer buttons
 * and a free-text fallback. Handles answering and skipping via mutations.
 */

import { useState } from 'react';
import { Loader2, SkipForward, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  useAnswerQuestion,
  useSkipQuestion,
  type ConfigQuestion,
} from '@/lib/services/configQuestionService';

// ============================================================================
// Component
// ============================================================================

interface InAppQuestionCardProps {
  question: ConfigQuestion;
}

export function InAppQuestionCard({ question }: InAppQuestionCardProps) {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();
  const answerMutation = useAnswerQuestion();
  const skipMutation = useSkipQuestion();

  const [freeText, setFreeText] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const options = question.options ?? [];
  const isBusy = answerMutation.isPending || skipMutation.isPending;

  function handleAnswer(value: unknown) {
    if (!activeOrgId) return;
    answerMutation.mutate({
      questionId: question.id,
      answerValue: value,
      orgId: activeOrgId,
      userId: user?.id,
    });
  }

  function handleSkip() {
    if (!activeOrgId) return;
    skipMutation.mutate({
      questionId: question.id,
      orgId: activeOrgId,
      userId: user?.id,
    });
  }

  function handleFreeTextSubmit() {
    if (!freeText.trim()) return;
    handleAnswer({ value: freeText.trim() });
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
      {/* Question text */}
      <p className="text-sm text-gray-200 leading-relaxed">
        {question.question}
      </p>

      {/* Option buttons (if pre-defined options exist) */}
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt.value}
              disabled={isBusy}
              onClick={() => {
                setSelectedOption(opt.value);
                handleAnswer({ value: opt.value });
              }}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg border transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                selectedOption === opt.value && answerMutation.isPending
                  ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                  : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
              )}
            >
              {selectedOption === opt.value && answerMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />
              ) : null}
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Free-text input (shown when no options or as fallback) */}
      {options.length === 0 && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleFreeTextSubmit();
              }
            }}
            placeholder="Type your answer..."
            disabled={isBusy}
            className={cn(
              'flex-1 px-3 py-2 text-sm rounded-lg border border-gray-700 bg-gray-800/60',
              'text-gray-200 placeholder:text-gray-500',
              'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
              'disabled:opacity-50'
            )}
          />
          <button
            onClick={handleFreeTextSubmit}
            disabled={isBusy || !freeText.trim()}
            className={cn(
              'p-2 rounded-lg border border-gray-700 bg-gray-800/60 text-gray-400',
              'hover:border-indigo-500 hover:text-indigo-400 transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {answerMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      )}

      {/* Skip action */}
      <div className="flex justify-end">
        <button
          onClick={handleSkip}
          disabled={isBusy}
          className={cn(
            'flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {skipMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <SkipForward className="h-3 w-3" />
          )}
          Skip
        </button>
      </div>
    </div>
  );
}

export default InAppQuestionCard;
