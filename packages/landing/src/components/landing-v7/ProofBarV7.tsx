import { motion } from 'framer-motion';
import { Clock, TrendingUp, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Stat {
  icon: LucideIcon;
  value: string;
  description: string;
}

const STATS: Stat[] = [
  {
    icon: Clock,
    value: '15h back every week',
    description: 'Less admin, more selling',
  },
  {
    icon: TrendingUp,
    value: '41% more deals closed',
    description: 'Nothing falls through the cracks',
  },
  {
    icon: Shield,
    value: '0 dropped follow-ups',
    description: 'Every meeting gets a next step',
  },
];

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function ProofBarV7() {
  return (
    <section className="bg-[#0c0c0c] border-y border-white/[0.08] py-8">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
        className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-0"
      >
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.value}
              variants={fadeUp}
              className={`flex items-center gap-4 justify-center ${
                i > 0 ? 'md:border-l md:border-white/[0.08]' : ''
              } ${i < STATS.length - 1 ? 'border-b md:border-b-0 border-white/[0.08] pb-8 md:pb-0' : ''}`}
            >
              <Icon className="w-5 h-5 text-stone-500 shrink-0" />
              <div>
                <p className="font-display font-bold text-stone-100 text-2xl leading-tight">
                  {stat.value}
                </p>
                <p className="text-stone-500 text-sm font-body mt-0.5">
                  {stat.description}
                </p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
