/**
 * SocialProofBar
 *
 * Subtle sticky bar that slides up from the bottom after 90s in the sandbox.
 * Shows a social-proof stat to nudge visitors toward signup.
 */

import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface SocialProofBarProps {
  isVisible: boolean;
  onClose: () => void;
}

export function SocialProofBar({ isVisible, onClose }: SocialProofBarProps) {
  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-20 md:bottom-16 left-0 right-0 z-30 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto relative mx-4 md:mx-0 max-w-md w-full rounded-xl overflow-hidden">
        {/* Gradient border top */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-500/60 via-violet-500/60 to-indigo-500/60" />

        <div className="bg-gray-900/90 backdrop-blur-xl border border-gray-800/50 rounded-xl px-4 py-3 flex items-center gap-3">
          <p className="text-sm text-gray-300 flex-1">
            <span className="text-white font-medium">Teams using 60</span>{' '}
            save 15h/week on sales admin
          </p>

          <button
            onClick={onClose}
            className="shrink-0 p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
