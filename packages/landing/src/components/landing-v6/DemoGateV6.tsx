import { motion } from 'framer-motion';
import { transitions } from '../../lib/animation-tokens';
import { DemoUrlInput } from '../landing-v5/DemoUrlInput';

interface DemoGateV6Props {
  onSubmit: (url: string) => void;
}

const viewport = { once: true, margin: '-60px' as const };

export function DemoGateV6({ onSubmit }: DemoGateV6Props) {
  return (
    <section className="relative py-24 sm:py-32 px-5 sm:px-6 overflow-hidden">
      {/* Atmosphere: violet glow */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-violet-500/[0.05] blur-3xl" />
      </div>

      {/* Atmosphere: grid lines */}
      <div
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px]
          [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_20%,transparent_80%)]"
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={transitions.reveal}
          className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight text-balance"
        >
          See what 60 finds for your company
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.1 }}
          className="mt-4 text-base sm:text-lg text-zinc-400 text-pretty"
        >
          Enter any company URL. 60 researches them in 30 seconds.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewport}
          transition={{ ...transitions.reveal, delay: 0.2 }}
          className="mt-10"
        >
          <DemoUrlInput onSubmit={onSubmit} showExamples={false} />
        </motion.div>
      </div>
    </section>
  );
}
