/**
 * Prospecting Clarification Response Component
 *
 * Displays inline chip-select clarifying questions in the copilot chat
 * before executing a prospecting workflow. Users click chips to answer,
 * then hit "Go" to send the enriched prompt to the backend.
 *
 * Pattern: follows EntityDisambiguationResponse — interactive inline
 * response that calls `useCopilot().sendMessage()` on completion.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import {
  enrichPromptWithAnswers,
  type ClarifyingQuestion,
} from '@/lib/utils/prospectingDetector';

export interface ProspectingClarificationData {
  original_prompt: string;
  questions: ClarifyingQuestion[];
}

interface ProspectingClarificationResponseProps {
  data: ProspectingClarificationData;
}

export const ProspectingClarificationResponse: React.FC<ProspectingClarificationResponseProps> = ({
  data,
}) => {
  const { sendMessage } = useCopilot();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = data.questions.every((q) => answers[q.key]);

  const handleSelect = (key: string, value: string) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleGo = async () => {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    const enrichedPrompt = enrichPromptWithAnswers(data.original_prompt, answers);
    // Send silently — don't show the enriched prompt as a visible user message
    await sendMessage(enrichedPrompt, { silent: true });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <Search className="w-4 h-4" />
        <span>Before I search, a few quick questions:</span>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {data.questions.map((question, qIndex) => (
          <motion.div
            key={question.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: qIndex * 0.08 }}
            className="space-y-2"
          >
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {question.question}
            </p>
            <div className="flex flex-wrap gap-2">
              {question.options?.map((option) => {
                const isSelected = answers[question.key] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={submitted}
                    onClick={() => handleSelect(question.key, option)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
                      'border focus:outline-none focus:ring-2 focus:ring-blue-500/40',
                      isSelected
                        ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500',
                      submitted && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Go button — appears when all questions answered */}
      {allAnswered && !submitted && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            onClick={handleGo}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
              'bg-blue-500 text-white hover:bg-blue-600',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40'
            )}
          >
            Go
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Submitted state */}
      {submitted && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-gray-400 dark:text-gray-500"
        >
          Searching...
        </motion.p>
      )}
    </div>
  );
};

export default ProspectingClarificationResponse;
