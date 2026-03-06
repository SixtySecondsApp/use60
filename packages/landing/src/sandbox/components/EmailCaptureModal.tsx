/**
 * EmailCaptureModal (FNL-006)
 *
 * Mid-funnel email capture triggered by engagement score thresholds.
 * NOT a gate — always has a clear dismiss option.
 *
 * Trigger conditions (checked externally):
 *   engagement score > 40 AND 3+ views visited AND 60+ seconds elapsed
 *
 * Stores email via campaign_visitors.signup_email upsert.
 * Shows only once per session (localStorage flag managed by parent).
 */

import { useState, useCallback, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bookmark, ArrowRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Trigger condition helper (exported for parent to evaluate)
// ---------------------------------------------------------------------------

const EMAIL_CAPTURE_STORAGE_KEY = 'sbx_email_shown';

/**
 * Returns true when the email capture modal should appear.
 * Caller is responsible for also checking the localStorage one-show flag.
 */
export function shouldShowEmailCapture(
  score: number,
  viewCount: number,
  elapsedMs: number,
): boolean {
  return score > 40 && viewCount >= 3 && elapsedMs >= 60000;
}

/**
 * Returns true if the modal has already been shown this session.
 */
export function wasEmailCaptureShown(): boolean {
  try {
    return localStorage.getItem(EMAIL_CAPTURE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Marks the modal as shown for this session.
 */
export function markEmailCaptureShown(): void {
  try {
    localStorage.setItem(EMAIL_CAPTURE_STORAGE_KEY, '1');
  } catch {
    // localStorage unavailable — ignore
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EmailCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
}

export function EmailCaptureModal({ isOpen, onClose, onSubmit }: EmailCaptureModalProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) return;

      setIsSubmitting(true);
      try {
        onSubmit(trimmed);
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, onSubmit],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm bg-gray-900/95 backdrop-blur-xl border border-gray-800/50 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
              {/* Close button */}
              <div className="flex justify-end p-3 pb-0">
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.05] transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 pb-6 pt-2 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#37bd7e]/10 border border-[#37bd7e]/20 flex items-center justify-center">
                  <Bookmark className="w-6 h-6 text-[#37bd7e]" />
                </div>

                <h3 className="text-lg font-bold text-white mb-2">
                  Save your demo
                </h3>
                <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                  Enter your email to pick up where you left off.
                </p>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-800/60 border border-gray-700/50 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#37bd7e]/40 focus:border-[#37bd7e]/50 transition-colors"
                    autoFocus
                  />

                  <button
                    type="submit"
                    disabled={isSubmitting || !email.trim()}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#37bd7e] hover:bg-[#2da76c] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                  >
                    {isSubmitting ? 'Saving...' : 'Save my spot'}
                    {!isSubmitting && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>

                <button
                  onClick={onClose}
                  className="mt-3 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                >
                  No thanks, keep exploring
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
