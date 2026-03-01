/**
 * Discovery Question Card
 *
 * Renders a single discovery question with clickable option cards.
 * Used in the landing page builder's Phase 1 brief to ask questions
 * one at a time with interactive selection.
 *
 * Detected from AI responses containing ```discovery_question blocks.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';

export interface DiscoveryQuestionData {
  question: string;
  options: string[];
  question_number: number;
  total_questions: number;
}

interface DiscoveryQuestionCardProps {
  data: DiscoveryQuestionData;
  onActionClick?: (action: { callback: string; params: Record<string, unknown> }) => void;
}

export const DiscoveryQuestionCard: React.FC<DiscoveryQuestionCardProps> = ({
  data,
  onActionClick,
}) => {
  const { sendMessage } = useCopilot();
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = (option: string) => {
    if (submitted) return;
    setSelected(option);
    setSubmitted(true);

    // Send as a user message
    if (onActionClick) {
      onActionClick({
        callback: 'send_message',
        params: { prompt: option },
      });
    } else {
      sendMessage(option);
    }
  };

  return (
    <div className="space-y-3 py-1">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {Array.from({ length: data.total_questions }, (_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 rounded-full transition-all duration-300',
                i + 1 < data.question_number
                  ? 'w-6 bg-emerald-500'
                  : i + 1 === data.question_number
                    ? 'w-6 bg-violet-500'
                    : 'w-4 bg-gray-200 dark:bg-gray-700'
              )}
            />
          ))}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {data.question_number} of {data.total_questions}
        </span>
      </div>

      {/* Option cards — question text is already shown in the markdown above */}
      <div className="grid grid-cols-2 gap-2">
        {data.options.map((option, index) => {
          const isSelected = selected === option;
          return (
            <motion.button
              key={option}
              type="button"
              disabled={submitted}
              onClick={() => handleSelect(option)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: index * 0.05 }}
              className={cn(
                'px-4 py-3 rounded-lg text-sm font-medium text-left transition-all duration-150',
                'border focus:outline-none focus:ring-2 focus:ring-violet-500/40',
                isSelected
                  ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/50 shadow-sm'
                  : submitted
                    ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700/50'
                    : 'bg-white dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50/50 dark:hover:bg-violet-500/5 cursor-pointer'
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span>{option}</span>
                {isSelected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  >
                    <CheckCircle2 className="w-4 h-4 text-violet-500 flex-shrink-0" />
                  </motion.span>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default DiscoveryQuestionCard;
