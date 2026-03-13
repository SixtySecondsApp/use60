import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { staggers, transitions } from '../../lib/animation-tokens';
import { SvgWrapper } from '../landing-v5/SvgWrapper';
import convergenceHubSvg from '../../svg/convergence-hub.svg?raw';

const benefits = [
  'Every deal, contact, and meeting in one view',
  'AI that sees the full picture and takes action',
  'Follow-ups, prep, and pipeline — handled automatically',
];

const viewport = { once: true, margin: '-80px' as const };

export function SolutionV6() {
  return (
    <section className="relative py-24 sm:py-32 px-5 sm:px-6 overflow-hidden">
      {/* Atmosphere: subtle violet glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-violet-500/[0.04] blur-3xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Header — centered */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={transitions.reveal}
          className="text-xs uppercase tracking-widest text-violet-400 font-medium text-center"
        >
          The command center
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.08 }}
          className="mt-4 font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-[1.1] text-balance text-center"
        >
          One place. Full context. AI that acts.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.16 }}
          className="mt-4 text-lg font-semibold text-center"
        >
          <span className="bg-gradient-to-r from-violet-400 to-teal-400 bg-clip-text text-transparent">
            Meet your AI sales teammate.
          </span>
        </motion.p>

        {/* SVG illustration — full width, prominent */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.2 }}
          className="mt-12 sm:mt-16"
        >
          <SvgWrapper
            svg={convergenceHubSvg}
            ariaLabel="Unified command center illustration"
            className="w-full max-w-3xl mx-auto h-[250px] sm:h-[320px] md:h-[380px]"
          />
        </motion.div>

        {/* Benefits — horizontal row below SVG */}
        <div className="mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {benefits.map((benefit, i) => (
            <motion.div
              key={benefit}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewport}
              transition={{
                ...transitions.reveal,
                delay: 0.24 + i * staggers.slow,
              }}
              className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-white/[0.02] p-5
                hover:border-zinc-700 hover:bg-white/[0.03] transition-colors duration-200"
            >
              <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-sm text-zinc-300 leading-relaxed">{benefit}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
