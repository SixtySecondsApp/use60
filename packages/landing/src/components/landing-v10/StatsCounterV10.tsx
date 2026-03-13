import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Clock, Zap, TrendingUp, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCountUp } from './hooks/useCountUp';

/* ------------------------------------------------------------------ */
/*  Stat definitions                                                   */
/* ------------------------------------------------------------------ */

interface StatDef {
  icon: LucideIcon;
  target: number;
  suffix: string;
  prefix: string;
  label: string;
}

const STATS: StatDef[] = [
  { icon: Clock, target: 15, suffix: '+', prefix: '', label: 'hours saved per rep, per week' },
  { icon: Zap, target: 3, suffix: 'x', prefix: '', label: 'faster meeting prep' },
  { icon: TrendingUp, target: 94, suffix: '%', prefix: '', label: 'follow-up rate (vs 40% industry avg)' },
  { icon: Shield, target: 0, suffix: '', prefix: '', label: 'deals dropped from stale pipeline' },
];

/* ------------------------------------------------------------------ */
/*  Single stat component                                              */
/* ------------------------------------------------------------------ */

function StatItem({ stat, index, isInView }: { stat: StatDef; index: number; isInView: boolean }) {
  const Icon = stat.icon;
  const count = useCountUp(stat.target, 2000, isInView);

  const formatted = stat.target >= 1000
    ? count.toLocaleString()
    : String(count);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.5,
        delay: index * 0.2,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="text-center"
    >
      <div className="flex justify-center mb-3">
        <div className="w-10 h-10 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl flex items-center justify-center">
          <Icon className="w-5 h-5 text-gray-500 dark:text-zinc-400" />
        </div>
      </div>
      <div className="text-3xl md:text-4xl font-display font-bold text-blue-600 dark:text-emerald-400 tabular-nums">
        {stat.prefix}{formatted}{stat.suffix}
      </div>
      <div className="mt-1 text-sm text-gray-500 dark:text-zinc-400 font-body">
        {stat.label}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  StatsCounterV10                                                    */
/* ------------------------------------------------------------------ */

export function StatsCounterV10() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="bg-gray-50 dark:bg-[#111] py-16">
      <div ref={ref} className="max-w-4xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {STATS.map((stat, i) => (
            <StatItem key={stat.label} stat={stat} index={i} isInView={isInView} />
          ))}
        </div>
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          Based on teams using 60 for 30+ days
        </p>
      </div>
    </section>
  );
}
