/**
 * SandboxEntrance
 *
 * Animated transition from the research phase into the interactive sandbox.
 * Shows a "building your demo" state, then morphs into the full SandboxApp.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2 } from 'lucide-react';

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface SandboxEntranceProps {
  /** Company name from research */
  companyName: string;
  /** When true, the entrance has loaded and should begin revealing */
  isReady: boolean;
  /** Called when entrance animation completes and sandbox should mount */
  onComplete: () => void;
}

const BUILD_STEPS = [
  { label: 'Building your pipeline', delay: 0 },
  { label: 'Importing contacts & deals', delay: 400 },
  { label: 'Preparing meeting briefs', delay: 800 },
  { label: 'Drafting follow-up emails', delay: 1200 },
  { label: 'Launching your command center', delay: 1600 },
];

export function SandboxEntrance({ companyName, isReady, onComplete }: SandboxEntranceProps) {
  const [completedSteps, setCompletedSteps] = useState<number>(0);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!isReady) return;

    // Animate each step completing
    BUILD_STEPS.forEach((step, i) => {
      setTimeout(() => {
        setCompletedSteps(i + 1);
      }, step.delay + 300);
    });

    // Mark done and trigger callback
    const totalTime = BUILD_STEPS[BUILD_STEPS.length - 1].delay + 800;
    const timer = setTimeout(() => {
      setIsDone(true);
      setTimeout(onComplete, 400);
    }, totalTime);

    return () => clearTimeout(timer);
  }, [isReady, onComplete]);

  return (
    <AnimatePresence>
      {!isDone && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
          className="min-h-[60vh] flex flex-col items-center justify-center px-5 py-20"
        >
          {/* Glow background */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
              w-[90vw] max-w-[500px] h-[70vh] max-h-[400px] rounded-full pointer-events-none
              bg-[radial-gradient(ellipse,rgba(55,189,126,0.12),transparent_70%)]
              blur-3xl"
          />

          <div className="relative z-10 text-center">
            {/* Spinner / icon */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
              className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#37bd7e]/20 to-emerald-500/20 border border-[#37bd7e]/20 flex items-center justify-center"
            >
              <Sparkles className="w-7 h-7 text-[#37bd7e]" />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, ease: EASE_OUT_EXPO }}
              className="text-xl sm:text-2xl font-bold text-white mb-2"
            >
              Building {companyName}&apos;s demo
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="text-sm text-gray-500 mb-8"
            >
              Personalizing everything to your business
            </motion.p>

            {/* Build steps */}
            <div className="max-w-xs mx-auto space-y-3">
              {BUILD_STEPS.map((step, i) => {
                const isComplete = completedSteps > i;
                const isActive = completedSteps === i;

                return (
                  <motion.div
                    key={step.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.08, duration: 0.3, ease: EASE_OUT_EXPO }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {isComplete ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        </motion.div>
                      ) : isActive ? (
                        <div className="w-4 h-4 border-2 border-[#37bd7e]/30 border-t-[#37bd7e] rounded-full animate-spin" />
                      ) : (
                        <div className="w-3 h-3 rounded-full bg-gray-800 border border-gray-700" />
                      )}
                    </div>
                    <span
                      className={`text-sm transition-colors duration-200 ${
                        isComplete
                          ? 'text-gray-300'
                          : isActive
                          ? 'text-gray-200'
                          : 'text-gray-600'
                      }`}
                    >
                      {step.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="mt-6 max-w-xs mx-auto">
              <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#37bd7e] to-emerald-400 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${(completedSteps / BUILD_STEPS.length) * 100}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
