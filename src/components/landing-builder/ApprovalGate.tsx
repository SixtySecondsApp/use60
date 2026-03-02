/**
 * Approval Gate Component
 * Renders phase completion card with Approve / Iterate / Go Back actions
 * Used as a structured response component within the chat
 */

import React, { useState } from 'react';
import { Check, RefreshCw, ArrowLeft, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LandingPageGateData } from './types';

interface ApprovalGateProps {
  data: LandingPageGateData;
  onActionClick?: (action: { callback: string; params: Record<string, unknown> }) => void;
  isResolved?: boolean;
  resolvedAction?: 'approved' | 'iterating' | 'went_back';
}

export const ApprovalGate: React.FC<ApprovalGateProps> = ({
  data,
  onActionClick,
  isResolved = false,
  resolvedAction,
}) => {
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [resolved, setResolved] = useState(isResolved);
  const [chosenAction, setChosenAction] = useState<string | undefined>(resolvedAction);

  const handleApprove = () => {
    setResolved(true);
    setChosenAction('approved');
    onActionClick?.({
      callback: 'send_message',
      params: { prompt: `Approved. Proceed to Phase ${data.phase + 1}.` },
    });
  };

  const handleIterate = () => {
    if (!showFeedbackInput) {
      setShowFeedbackInput(true);
      return;
    }
    if (!feedback.trim()) return;
    setResolved(true);
    setChosenAction('iterating');
    onActionClick?.({
      callback: 'send_message',
      params: { prompt: `Iterate on Phase ${data.phase}: ${feedback}` },
    });
  };

  const handleGoBack = () => {
    setResolved(true);
    setChosenAction('went_back');
    onActionClick?.({
      callback: 'send_message',
      params: { prompt: `Go back to Phase ${data.phase - 1}.` },
    });
  };

  const handleFeedbackKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleIterate();
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border p-4 sm:p-5 transition-all',
        resolved
          ? 'bg-gray-50 dark:bg-white/[0.02] border-gray-200 dark:border-white/5'
          : 'bg-white dark:bg-white/[0.04] border-gray-200 dark:border-white/10 shadow-sm'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
            resolved
              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400'
          )}
        >
          {resolved ? <Check className="w-3.5 h-3.5" /> : data.phase}
        </div>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          Phase {data.phase} Complete: {data.phaseName}
        </span>
      </div>

      {/* Summary */}
      {data.deliverableSummary && (
        <p className="text-sm text-gray-600 dark:text-slate-400 mb-4 leading-relaxed">
          {data.deliverableSummary}
        </p>
      )}

      {/* Resolved state */}
      {resolved && chosenAction && (
        <div
          className={cn(
            'px-3 py-2 rounded-lg text-xs font-medium',
            chosenAction === 'approved' && 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            chosenAction === 'iterating' && 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
            chosenAction === 'went_back' && 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-slate-400'
          )}
        >
          {chosenAction === 'approved' && 'Approved — proceeding to next phase'}
          {chosenAction === 'iterating' && 'Iterating with feedback'}
          {chosenAction === 'went_back' && 'Went back to previous phase'}
        </div>
      )}

      {/* Action buttons */}
      {!resolved && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {/* Approve */}
            <button
              onClick={handleApprove}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                'bg-emerald-500 hover:bg-emerald-600 text-white',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900'
              )}
            >
              <Check className="w-3.5 h-3.5" />
              Approve
            </button>

            {/* Iterate */}
            <button
              onClick={handleIterate}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400',
                'border border-amber-500/20 hover:border-amber-500/30',
                'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900'
              )}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Iterate
            </button>

            {/* Go Back (only if not phase 1) */}
            {data.phase > 1 && (
              <button
                onClick={handleGoBack}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300',
                  'hover:bg-gray-100 dark:hover:bg-white/5',
                  'focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900'
                )}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Go Back
              </button>
            )}
          </div>

          {/* Feedback input (shown after clicking Iterate) */}
          {showFeedbackInput && (
            <div className="flex items-end gap-2">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={handleFeedbackKeyDown}
                placeholder="What would you like to change?"
                className={cn(
                  'flex-1 resize-none rounded-lg px-3 py-2 text-sm',
                  'bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10',
                  'text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500',
                  'focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50'
                )}
                rows={2}
                autoFocus
              />
              <button
                onClick={handleIterate}
                disabled={!feedback.trim()}
                className={cn(
                  'p-2 rounded-lg transition-all',
                  feedback.trim()
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-gray-200 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                )}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
