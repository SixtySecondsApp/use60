import { motion } from 'framer-motion';
import { Clock, TrendingUp, Shield } from 'lucide-react';
import { easings, transitions } from '../../lib/animation-tokens';

const metrics = [
  { value: '15h', label: 'back every week', icon: Clock },
  { value: '41%', label: 'more deals closed', icon: TrendingUp },
  { value: '0', label: 'dropped follow-ups', icon: Shield },
];

function PulseSeparator() {
  return (
    <div className="hidden sm:flex items-center justify-center">
      <motion.div
        className="w-1 h-1 rounded-full bg-zinc-600"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

export function ProofBarV5() {
  return (
    <section className="border-y border-white/[0.04] py-10 sm:py-12 px-5 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-8 sm:gap-6">
          {metrics.map((metric, i) => (
            <>
              <motion.div
                key={metric.value}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{
                  ...transitions.reveal,
                  delay: i * 0.1,
                }}
                className="flex flex-col items-center text-center gap-1"
              >
                <span className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                  {metric.value}
                </span>
                <span className="text-sm text-zinc-500">{metric.label}</span>
              </motion.div>
              {i < metrics.length - 1 && <PulseSeparator key={`sep-${i}`} />}
            </>
          ))}
        </div>
      </div>
    </section>
  );
}
