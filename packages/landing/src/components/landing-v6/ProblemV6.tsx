import { motion } from 'framer-motion';
import { Mail, Clock, BarChart3, FolderOpen } from 'lucide-react';
import { staggers, transitions } from '../../lib/animation-tokens';
import { SvgWrapper } from '../landing-v5/SvgWrapper';
import chaosToolsSvg from '../../svg/chaos-tools.svg?raw';

const painPoints = [
  {
    icon: Mail,
    title: 'Follow-ups forgotten',
    description: 'Deals die in silence because no one sent the next email.',
  },
  {
    icon: Clock,
    title: 'Meeting prep takes hours',
    description: 'You scramble to piece together context from five different tabs.',
  },
  {
    icon: BarChart3,
    title: 'Pipeline goes stale',
    description: "Deals sit untouched for weeks. You don't notice until it's too late.",
  },
  {
    icon: FolderOpen,
    title: 'Context is everywhere',
    description: 'Notes in one app, emails in another, tasks in a third. Nothing connects.',
  },
];

const viewport = { once: true, margin: '-80px' as const };

export function ProblemV6() {
  return (
    <section className="py-24 sm:py-32 px-5 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header — centered */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={transitions.reveal}
          className="text-xs uppercase tracking-widest text-zinc-600 font-medium text-center"
        >
          The problem
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.08 }}
          className="mt-4 font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-[1.1] text-balance text-center"
        >
          Five tools. Zero awareness of each other.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.15 }}
          className="mt-4 text-base sm:text-lg text-zinc-400 max-w-xl mx-auto text-pretty leading-relaxed text-center"
        >
          CRM, calendar, email, notetaker, task list — all disconnected.
          Nothing knows what anything else is doing.
        </motion.p>

        {/* SVG illustration — full width, commanding */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.15 }}
          className="mt-12 sm:mt-16"
        >
          <SvgWrapper
            svg={chaosToolsSvg}
            ariaLabel="Disconnected tools illustration"
            className="w-full max-w-5xl mx-auto h-[320px] sm:h-[420px] md:h-[500px]"
          />
        </motion.div>

        {/* Pain point cards — 4 columns on desktop, 2 on tablet */}
        <div className="mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                className="rounded-xl border border-zinc-800 bg-white/[0.02] p-5
                  hover:border-zinc-700 hover:bg-white/[0.03] transition-colors duration-200"
              >
                <div className="flex flex-col gap-3">
                  <div className="shrink-0 rounded-lg bg-white/[0.04] p-2.5 w-fit">
                    <Icon className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{point.title}</h3>
                    <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">{point.description}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
