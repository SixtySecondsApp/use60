import { motion } from 'framer-motion';
import { Clock, TrendingUp, Shield } from 'lucide-react';
import { transitions } from '../../lib/animation-tokens';

const metrics = [
  { value: '15h', label: 'back every week', icon: Clock },
  { value: '41%', label: 'more deals closed', icon: TrendingUp },
  { value: '0', label: 'dropped follow-ups', icon: Shield },
];

const viewport = { once: true, margin: '-40px' as const };

export function ProofBarV6() {
  return (
    <section className="border-y border-zinc-800 py-10 sm:py-12 px-5 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-4">
          {metrics.map((metric, i) => {
            const Icon = metric.icon;
            return (
              <motion.div
                key={metric.value}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewport}
                transition={{ ...transitions.reveal, delay: i * 0.08 }}
                className="flex flex-col items-center text-center gap-2"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                  <span className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight tabular-nums">
                    {metric.value}
                  </span>
                </div>
                <span className="text-sm text-zinc-400">{metric.label}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
