/**
 * ResultsSummary — Step 5
 *
 * Consolidates research stats into a "Sales Intelligence Report" card
 * with animated counters and a CTA to proceed to onboarding.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Zap, Users, Target, BarChart3, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchData } from './demo-types';

// ============================================================================
// Animated counter (safe rAF with cleanup)
// ============================================================================

function AnimatedStat({
  icon: Icon,
  value,
  label,
  delay,
}: {
  icon: typeof Zap;
  value: number;
  label: string;
  delay: number;
}) {
  const [count, setCount] = useState(0);
  const frameRef = useRef(0);

  const animate = useCallback(() => {
    const start = performance.now();
    const duration = 1200;

    const tick = (now: number) => {
      const elapsed = now - start - delay * 1000;
      if (elapsed < 0) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      // Smooth ease-out cubic for satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * value));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [value, delay]);

  useEffect(() => {
    animate();
    return () => cancelAnimationFrame(frameRef.current);
  }, [animate]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay + 0.2, duration: 0.4 }}
      className="flex flex-col items-center gap-2 p-4 sm:p-5 motion-reduce:transition-none"
    >
      <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-violet-400" />
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums">{count}</p>
      <p className="text-[11px] sm:text-xs text-gray-400 text-center">{label}</p>
    </motion.div>
  );
}

// ============================================================================
// Component
// ============================================================================

interface ResultsSummaryProps {
  stats: ResearchData['stats'];
  companyName: string;
  onContinue: () => void;
}

export function ResultsSummary({ stats, companyName, onContinue }: ResultsSummaryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6"
    >
      <div className="w-full max-w-md sm:max-w-lg mx-auto">
        <div
          className="bg-gray-900/80 backdrop-blur-sm border border-white/[0.06]
            rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 sm:px-6 py-5 border-b border-white/[0.05] text-center">
            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1">
              {companyName}
            </p>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Here's what we found
            </h2>
          </div>

          {/* Stats grid — 2x2 with dividers that work on mobile */}
          <div className="grid grid-cols-2">
            <div className="border-b border-r border-white/[0.04]">
              <AnimatedStat
                icon={Zap}
                value={stats.signals_found}
                label="Signals found"
                delay={0}
              />
            </div>
            <div className="border-b border-white/[0.04]">
              <AnimatedStat
                icon={Target}
                value={stats.actions_queued}
                label="Actions queued"
                delay={0.15}
              />
            </div>
            <div className="border-r border-white/[0.04]">
              <AnimatedStat
                icon={Users}
                value={stats.contacts_identified}
                label="Contacts identified"
                delay={0.3}
              />
            </div>
            <div>
              <AnimatedStat
                icon={BarChart3}
                value={stats.opportunities_mapped}
                label="Opportunities mapped"
                delay={0.45}
              />
            </div>
          </div>

          {/* CTA */}
          <div className="px-5 sm:px-6 py-5 border-t border-white/[0.05] space-y-4">
            <p className="text-sm text-gray-400 text-center text-pretty leading-relaxed">
              This took 30 seconds. Imagine this running on every deal, every day.
            </p>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              onClick={onContinue}
              className={cn(
                'w-full py-3 rounded-xl font-semibold text-sm',
                'bg-white text-gray-950',
                'hover:bg-gray-100 transition-colors',
                'flex items-center justify-center gap-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                'motion-reduce:transform-none'
              )}
            >
              Try the Copilot
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
