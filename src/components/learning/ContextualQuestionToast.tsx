/**
 * ContextualQuestionToast — Non-blocking slide-in prompt
 *
 * Shows at bottom-right when useContextualQuestions surfaces a
 * relevant config question. Supports pre-defined option buttons,
 * free-text input, dismiss, and snooze. Auto-dismisses after 30s
 * if no interaction. Uses framer-motion for entrance/exit.
 *
 * Never interrupts the user — sits unobtrusively in the corner.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  X,
  Clock,
  Send,
  Loader2,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useAnswerQuestion, useSkipQuestion } from '@/lib/services/configQuestionService';
import {
  useContextualQuestions,
  type AutoDetectedSuggestion,
} from '@/lib/hooks/useContextualQuestions';
import { useAutoDetectConfig } from '@/lib/hooks/useAutoDetectConfig';

// ============================================================================
// Constants
// ============================================================================

const AUTO_DISMISS_MS = 30_000;

// ============================================================================
// Component
// ============================================================================

export function ContextualQuestionToast() {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();

  // Auto-detect config suggestions (runs once per session)
  const autoSuggestions = useAutoDetectConfig();

  // Get the current contextual question
  const { currentQuestion, autoSuggestion, markShown, snooze } =
    useContextualQuestions(autoSuggestions);

  // Local state
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQuestionIdRef = useRef<string | null>(null);

  const answerMutation = useAnswerQuestion();
  const skipMutation = useSkipQuestion();

  const isBusy = answerMutation.isPending || skipMutation.isPending;

  // -------------------------------------------------------------------
  // Show/hide logic
  // -------------------------------------------------------------------
  useEffect(() => {
    if (currentQuestion && currentQuestion.id !== lastQuestionIdRef.current) {
      lastQuestionIdRef.current = currentQuestion.id;
      setIsDismissed(false);
      setFreeText('');
      setSelectedOption(null);
      setHasInteracted(false);

      // Small delay so it doesn't flash immediately on navigation
      const showTimer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(showTimer);
    }

    if (!currentQuestion) {
      setIsVisible(false);
    }
  }, [currentQuestion]);

  // Auto-dismiss timer
  useEffect(() => {
    if (isVisible && !hasInteracted) {
      autoDismissTimerRef.current = setTimeout(() => {
        handleDismiss();
      }, AUTO_DISMISS_MS);
    }

    return () => {
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
    };
  }, [isVisible, hasInteracted]);

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------
  const stopAutoTimer = useCallback(() => {
    if (!hasInteracted) setHasInteracted(true);
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  }, [hasInteracted]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setIsDismissed(true);
    markShown();
  }, [markShown]);

  const handleSnooze = useCallback(() => {
    if (currentQuestion) {
      snooze(currentQuestion.id);
    }
    setIsVisible(false);
    setIsDismissed(true);
  }, [currentQuestion, snooze]);

  const handleAnswer = useCallback(
    (value: unknown) => {
      if (!activeOrgId || !currentQuestion) return;
      stopAutoTimer();
      answerMutation.mutate(
        {
          questionId: currentQuestion.id,
          answerValue: value,
          orgId: activeOrgId,
          userId: user?.id,
        },
        {
          onSuccess: () => {
            // Brief delay so user sees the success state
            setTimeout(() => {
              setIsVisible(false);
              setIsDismissed(true);
              markShown();
            }, 600);
          },
        }
      );
    },
    [activeOrgId, currentQuestion, user?.id, answerMutation, stopAutoTimer, markShown]
  );

  const handleSkip = useCallback(() => {
    if (!activeOrgId || !currentQuestion) return;
    skipMutation.mutate(
      {
        questionId: currentQuestion.id,
        orgId: activeOrgId,
        userId: user?.id,
      },
      {
        onSuccess: () => {
          setIsVisible(false);
          setIsDismissed(true);
          markShown();
        },
      }
    );
  }, [activeOrgId, currentQuestion, user?.id, skipMutation, markShown]);

  const handleFreeTextSubmit = useCallback(() => {
    if (!freeText.trim()) return;
    handleAnswer({ value: freeText.trim() });
  }, [freeText, handleAnswer]);

  const handleAcceptSuggestion = useCallback(() => {
    if (autoSuggestion) {
      handleAnswer(autoSuggestion.detectedValue);
    }
  }, [autoSuggestion, handleAnswer]);

  // -------------------------------------------------------------------
  // Don't render if nothing to show
  // -------------------------------------------------------------------
  if (!currentQuestion || isDismissed) return null;

  const options = currentQuestion.options ?? [];
  const isAutoSuggested = !!autoSuggestion;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 80, x: 20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 40, x: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-3rem)]"
          onMouseEnter={stopAutoTimer}
          onFocus={stopAutoTimer}
          role="complementary"
          aria-label="60 is learning"
        >
          <div className="rounded-xl border border-gray-700/80 bg-gray-900/95 backdrop-blur-sm shadow-2xl shadow-black/40 overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/80 bg-gray-900/80">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
                  {isAutoSuggested ? (
                    <Sparkles className="h-3 w-3 text-indigo-400" />
                  ) : (
                    <Brain className="h-3 w-3 text-indigo-400" />
                  )}
                </div>
                <span className="text-xs font-medium text-gray-400">
                  {isAutoSuggested ? '60 noticed a pattern' : '60 wants to learn'}
                </span>
              </div>
              <button
                onClick={handleDismiss}
                className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3 space-y-3">
              {/* Auto-suggestion description (if applicable) */}
              {isAutoSuggested && autoSuggestion && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-indigo-500/8 border border-indigo-500/15">
                  <Lightbulb className="h-3.5 w-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-indigo-300/90 leading-relaxed">
                    {autoSuggestion.description}
                  </p>
                </div>
              )}

              {/* Question text */}
              <p className="text-sm text-gray-200 leading-relaxed">
                {currentQuestion.question}
              </p>

              {/* Auto-suggestion accept button */}
              {isAutoSuggested && (
                <button
                  onClick={handleAcceptSuggestion}
                  disabled={isBusy}
                  className={cn(
                    'w-full px-3 py-2 text-sm rounded-lg border transition-all',
                    'border-indigo-500/40 bg-indigo-500/15 text-indigo-300',
                    'hover:bg-indigo-500/25 hover:border-indigo-500/60',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {answerMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 inline mr-1.5" />
                  )}
                  Yes, apply this
                </button>
              )}

              {/* Option buttons */}
              {options.length > 0 && !isAutoSuggested && (
                <div className="flex flex-wrap gap-1.5">
                  {options.map((opt) => (
                    <button
                      key={opt.value}
                      disabled={isBusy}
                      onClick={() => {
                        stopAutoTimer();
                        setSelectedOption(opt.value);
                        handleAnswer({ value: opt.value });
                      }}
                      className={cn(
                        'px-2.5 py-1.5 text-xs rounded-lg border transition-all',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        selectedOption === opt.value && answerMutation.isPending
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                          : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                      )}
                    >
                      {selectedOption === opt.value && answerMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                      ) : null}
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Free-text input (shown when no options and not auto-suggested) */}
              {options.length === 0 && !isAutoSuggested && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={freeText}
                    onChange={(e) => {
                      setFreeText(e.target.value);
                      stopAutoTimer();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleFreeTextSubmit();
                      }
                    }}
                    placeholder="Type your answer..."
                    disabled={isBusy}
                    className={cn(
                      'flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 bg-gray-800/60',
                      'text-gray-200 placeholder:text-gray-500',
                      'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
                      'disabled:opacity-50'
                    )}
                  />
                  <button
                    onClick={handleFreeTextSubmit}
                    disabled={isBusy || !freeText.trim()}
                    className={cn(
                      'p-1.5 rounded-lg border border-gray-700 bg-gray-800/60 text-gray-400',
                      'hover:border-indigo-500 hover:text-indigo-400 transition-all',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    {answerMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800/60 bg-gray-950/30">
              <button
                onClick={handleSnooze}
                disabled={isBusy}
                className={cn(
                  'flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <Clock className="h-3 w-3" />
                Remind me later
              </button>
              <button
                onClick={handleSkip}
                disabled={isBusy}
                className={cn(
                  'text-[11px] text-gray-500 hover:text-gray-300 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {skipMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                ) : null}
                Skip
              </button>
            </div>

            {/* Auto-dismiss progress bar (only when not interacted) */}
            {!hasInteracted && (
              <div className="h-0.5 bg-gray-800">
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
                  className="h-full bg-indigo-500/40"
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ContextualQuestionToast;
