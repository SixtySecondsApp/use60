/**
 * ValueBridge — Step 2
 *
 * Animated text sequence that bridges between URL submission and agent research.
 * Three lines fade in sequentially with generous read time, then auto-advances.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ValueBridgeProps {
  companyDomain: string;
  onComplete: () => void;
}

const LINES = [
  'Right now, 6 AI agents are pulling everything public about your business\u2026',
  'Finding the people you should talk to, the deals worth chasing, and the follow-ups you forgot\u2026',
  'In a moment, you\'ll see exactly what they\'d handle for you. Every single day.',
];

export function ValueBridge({ companyDomain, onComplete }: ValueBridgeProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= LINES.length) {
      const timer = setTimeout(onComplete, 1800);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(
      () => setVisibleCount((c) => c + 1),
      visibleCount === 0 ? 500 : 1500
    );
    return () => clearTimeout(timer);
  }, [visibleCount, onComplete]);

  const progress = visibleCount / LINES.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6"
    >
      <div className="max-w-lg sm:max-w-xl mx-auto space-y-5 sm:space-y-6">
        {LINES.map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={
              i < visibleCount
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: 10 }
            }
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className={cn(
              'text-base sm:text-lg md:text-xl text-center leading-relaxed',
              i < visibleCount ? 'text-gray-200' : 'text-gray-200',
              'motion-reduce:transition-none'
            )}
          >
            {line}
          </motion.p>
        ))}

        {/* Domain echo + progress */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={
            visibleCount >= LINES.length ? { opacity: 1 } : { opacity: 0 }
          }
          transition={{ delay: 0.2, duration: 0.35 }}
          className="flex flex-col items-center gap-3 pt-3"
        >
          <p className="text-xs sm:text-sm text-gray-500 text-center font-mono">
            Target: {companyDomain}
          </p>
          {/* Progress bar */}
          <div className="w-40 h-0.5 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              className="h-full bg-violet-500/60 rounded-full"
            />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
