import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { easings, staggers, transitions } from '../../lib/animation-tokens';
import { SvgWrapper } from './SvgWrapper';
import convergenceHubSvg from '../../svg/convergence-hub.svg?raw';

const benefits = [
  'Every deal, contact, and meeting in one view',
  'AI that sees the full picture and takes action',
  'Follow-ups, prep, and pipeline — handled automatically',
];

const viewport = { once: true, margin: '-80px' as const };

export function SolutionV5() {
  return (
    <section className="relative py-20 sm:py-28 px-5 sm:px-6 overflow-hidden">
      {/* Subtle violet radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-violet-500/[0.04] blur-3xl" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Content */}
        <div>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={transitions.reveal}
            className="text-xs uppercase tracking-widest text-violet-400 font-medium"
          >
            The command center
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ ...transitions.reveal, delay: 0.08 }}
            className="mt-4 text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight"
          >
            One place. Full context. AI that acts.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ ...transitions.reveal, delay: 0.16 }}
            className="mt-4 text-lg font-semibold"
          >
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Meet your command center.
            </span>
          </motion.p>

          <ul className="mt-8 flex flex-col gap-4">
            {benefits.map((benefit, i) => (
              <motion.li
                key={benefit}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={viewport}
                transition={{
                  ...transitions.reveal,
                  delay: 0.24 + i * staggers.slow,
                }}
                className="flex items-start gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <span className="text-base text-zinc-300 leading-relaxed">
                  {benefit}
                </span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* SVG illustration */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.15 }}
        >
          <SvgWrapper
            svg={convergenceHubSvg}
            ariaLabel="Unified command center illustration"
            className="w-full max-w-md mx-auto lg:max-w-none"
          />
        </motion.div>
      </div>
    </section>
  );
}
