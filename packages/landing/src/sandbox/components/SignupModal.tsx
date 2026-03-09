/**
 * SignupModal
 *
 * Overlay shown when users click locked nav items in the sandbox.
 * Matches the real app's modal styling with dark mode tokens.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, ArrowRight } from 'lucide-react';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
}

export function SignupModal({ isOpen, onClose, featureName = 'this feature' }: SignupModalProps) {
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
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 pb-6 pt-2 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#37bd7e]/10 border border-[#37bd7e]/20 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-[#37bd7e]" />
                </div>

                <h3 className="text-lg font-bold text-white mb-2">
                  Unlock {featureName}
                </h3>
                <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                  Sign up for free to access {featureName} and the full 60 platform. No credit card required.
                </p>

                <a
                  href="https://app.use60.com/signup"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#37bd7e] hover:bg-[#2da76c] text-white text-sm font-semibold transition-colors"
                >
                  Start free trial
                  <ArrowRight className="w-4 h-4" />
                </a>

                <button
                  onClick={onClose}
                  className="mt-3 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                >
                  Continue exploring demo
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
