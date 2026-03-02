import { motion } from 'framer-motion';
import { DemoUrlInput } from './DemoUrlInput';
import { easings, transitions } from '../../lib/animation-tokens';

interface DemoGateV5Props {
  onSubmit: (url: string) => void;
}

export function DemoGateV5({ onSubmit }: DemoGateV5Props) {
  return (
    <section className="relative py-24 sm:py-32 px-5 sm:px-6 overflow-hidden">
      {/* Faint violet radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-violet-500/[0.04] blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={transitions.reveal}
          className="text-3xl sm:text-4xl font-bold text-white tracking-tight"
        >
          See what 60 finds for your company
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ ...transitions.reveal, delay: 0.1 }}
          className="mt-4 text-base sm:text-lg text-zinc-400"
        >
          Enter any company URL. 60 researches them in 30 seconds.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ ...transitions.reveal, delay: 0.2 }}
          className="mt-10"
        >
          <DemoUrlInput onSubmit={onSubmit} />
        </motion.div>
      </div>
    </section>
  );
}
