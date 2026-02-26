/**
 * AutopilotNudgeBanner — AP-032
 *
 * Dismissable in-context banner shown inside the copilot assistant when the
 * user hits a milestone number of clean approvals for an action type.
 *
 * Displayed at the top of the message area so it is visible without
 * interrupting the conversation flow.
 */

import React from 'react';
import { X, TrendingUp } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AutopilotNudge } from '@/lib/hooks/useAutopilotNudge';

interface AutopilotNudgeBannerProps {
  nudge: AutopilotNudge | null;
  onDismiss: () => void;
}

export function AutopilotNudgeBanner({ nudge, onDismiss }: AutopilotNudgeBannerProps) {
  return (
    <AnimatePresence>
      {nudge && (
        <motion.div
          key="autopilot-nudge"
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="overflow-hidden flex-shrink-0"
        >
          <div className="mx-5 mt-4 flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3">
            {/* Icon */}
            <div className="mt-0.5 flex-shrink-0 text-violet-400">
              <TrendingUp className="h-4 w-4" />
            </div>

            {/* Message */}
            <p className="flex-1 text-sm leading-relaxed text-violet-200">
              {nudge.message}
            </p>

            {/* Dismiss */}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss promotion nudge"
              className="mt-0.5 flex-shrink-0 rounded p-0.5 text-violet-400 transition-colors hover:bg-violet-500/20 hover:text-violet-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
