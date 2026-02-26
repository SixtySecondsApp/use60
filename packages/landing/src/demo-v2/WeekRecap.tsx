/**
 * WeekRecap — "Your Week with 60"
 *
 * The emotional peak before signup. Shows what 60 would have done
 * for their company THIS WEEK with animated counters and a strong CTA.
 * This is the "holy shit" moment.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Mail,
  Calendar,
  AlertTriangle,
  Shield,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchData } from './demo-types';

// ============================================================================
// Animated counter
// ============================================================================

function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  delay = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  delay?: number;
}) {
  const [count, setCount] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 1400;

    const tick = (now: number) => {
      const elapsed = now - start - delay * 1000;
      if (elapsed < 0) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * value));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, delay]);

  return (
    <span className="tabular-nums">
      {prefix}{count}{suffix}
    </span>
  );
}

// ============================================================================
// Component
// ============================================================================

interface WeekRecapProps {
  data: ResearchData;
  onContinue: () => void;
}

export function WeekRecap({ data, onContinue }: WeekRecapProps) {
  const companyName = data.company?.name ?? 'your company';
  const stats = data.stats;
  const [showCta, setShowCta] = useState(false);

  // Derive weekly projections from research stats
  const weekStats = [
    {
      icon: Mail,
      value: stats.actions_queued + 4,
      suffix: '',
      label: 'emails sent for you',
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
    },
    {
      icon: Calendar,
      value: Math.max(stats.opportunities_mapped + 1, 4),
      suffix: '',
      label: 'meetings prepped',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      icon: AlertTriangle,
      value: Math.max(Math.floor(stats.signals_found * 0.12), 3),
      suffix: '',
      label: 'deals saved from slipping',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
    {
      icon: Shield,
      value: Math.floor(stats.signals_found * 2.7),
      prefix: '$',
      suffix: 'K',
      label: 'pipeline protected',
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
    },
  ];

  // Show CTA after counters finish
  useEffect(() => {
    const t = setTimeout(() => setShowCta(true), 2200);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6"
    >
      {/* Background glow */}
      <div
        className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-[600px] sm:w-[900px] h-[400px] sm:h-[600px] rounded-full pointer-events-none
          bg-[radial-gradient(ellipse,rgba(139,92,246,0.08),transparent_70%)]
          blur-3xl"
      />

      <div className="relative z-10 w-full max-w-sm sm:max-w-md mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-center mb-6 sm:mb-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full
            border border-violet-500/20 bg-violet-500/[0.06] text-xs text-violet-300 mb-4">
            <Sparkles className="w-3 h-3" />
            Based on what we just found
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight text-balance">
            One week.
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
              Zero admin.
            </span>
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            This is what gets done while you focus on selling.
          </p>
        </motion.div>

        {/* Stats cards — 2x2 grid to keep CTA in viewport */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {weekStats.map(({ icon: Icon, value, prefix, suffix, label, color, bg }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.12, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="p-3.5 sm:p-4 rounded-xl bg-zinc-900/80 border border-white/[0.06] text-center"
            >
              <div className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mx-auto mb-2', bg)}>
                <Icon className={cn('w-4.5 h-4.5 sm:w-5 sm:h-5', color)} />
              </div>
              <p className={cn('text-2xl sm:text-3xl font-bold', color)}>
                <AnimatedCounter value={value} prefix={prefix ?? ''} suffix={suffix ?? ''} delay={0.3 + i * 0.12} />
              </p>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">{label}</p>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        {showCta && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-8 text-center"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              onClick={onContinue}
              className={cn(
                'w-full sm:w-auto px-10 py-3.5 rounded-xl font-semibold text-sm',
                'bg-white text-zinc-950',
                'hover:bg-zinc-100 transition-colors',
                'inline-flex items-center justify-center gap-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                'motion-reduce:transform-none'
              )}
            >
              Make it real
              <ArrowRight className="w-4 h-4" />
            </motion.button>
            <p className="text-[11px] text-zinc-500 mt-3">
              Free to start. Takes 60 seconds.
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
