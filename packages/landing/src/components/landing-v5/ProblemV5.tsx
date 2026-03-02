import { motion } from 'framer-motion';
import { Mail, Clock, BarChart3, FolderOpen } from 'lucide-react';
import { easings, staggers, transitions } from '../../lib/animation-tokens';
import { SvgWrapper } from './SvgWrapper';
import chaosToolsSvg from '../../svg/chaos-tools.svg?raw';

const painPoints = [
  {
    icon: Mail,
    title: 'Follow-ups forgotten',
    description:
      'Deals die in silence because no one sent the next email.',
  },
  {
    icon: Clock,
    title: 'Meeting prep takes hours',
    description:
      'You scramble to piece together context from five different tabs.',
  },
  {
    icon: BarChart3,
    title: 'Pipeline goes stale',
    description:
      "Deals sit untouched for weeks. You don't notice until it's too late.",
  },
  {
    icon: FolderOpen,
    title: 'Context is everywhere',
    description:
      'Notes in one app, emails in another, tasks in a third. Nothing connects.',
  },
];

const viewport = { once: true, margin: '-80px' as const };

export function ProblemV5() {
  return (
    <section className="py-20 sm:py-28 px-5 sm:px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Content */}
        <div className="order-1 lg:order-1">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={transitions.reveal}
            className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight"
          >
            Five tools. Zero awareness of each other.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ ...transitions.reveal, delay: 0.1 }}
            className="mt-4 text-base sm:text-lg text-zinc-400 max-w-md"
          >
            CRM, calendar, email, notetaker, task list — all disconnected.
            Nothing knows what anything else is doing.
          </motion.p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {painPoints.map((point, i) => {
              const Icon = point.icon;
              return (
                <motion.div
                  key={point.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={viewport}
                  transition={{
                    ...transitions.reveal,
                    delay: 0.2 + i * staggers.slow,
                  }}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 rounded-lg bg-white/[0.04] p-2">
                      <Icon className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {point.title}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500 leading-relaxed">
                        {point.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* SVG illustration */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.15 }}
          className="order-2 lg:order-2"
        >
          <SvgWrapper
            svg={chaosToolsSvg}
            ariaLabel="Disconnected tools illustration"
            className="w-full max-w-md mx-auto lg:max-w-none"
          />
        </motion.div>
      </div>
    </section>
  );
}
