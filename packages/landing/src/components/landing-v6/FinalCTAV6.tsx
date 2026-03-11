import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { springs, transitions } from '../../lib/animation-tokens';

interface FinalCTAV6Props {
  onTryFree: () => void;
}

const viewport = { once: true, margin: '-40px' as const };

export function FinalCTAV6({ onTryFree }: FinalCTAV6Props) {
  return (
    <section className="relative py-24 sm:py-32 px-5 sm:px-6 overflow-hidden">
      {/* Atmosphere: grid lines */}
      <div
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px]
          [mask-image:radial-gradient(ellipse_50%_40%_at_50%_50%,black_20%,transparent_80%)]"
        aria-hidden="true"
      />

      {/* Atmosphere: violet glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] rounded-full
          bg-violet-500/[0.06] blur-[100px] pointer-events-none"
        aria-hidden="true"
      />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewport}
        transition={transitions.reveal}
        className="relative z-10 max-w-2xl mx-auto text-center flex flex-col items-center gap-8"
      >
        <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight
          bg-gradient-to-b from-white via-white to-zinc-600 bg-clip-text text-transparent text-balance leading-[1.1]">
          Your next follow-up is 60 seconds away.
        </h2>

        <p className="text-base sm:text-lg text-zinc-400 max-w-md text-pretty">
          Enter a website, watch 60 work. No signup, no credit card, no sales call.
        </p>

        {/* CTA button with gradient border */}
        <div className="relative rounded-xl p-px bg-gradient-to-r from-violet-500 via-teal-500 to-violet-500 bg-[length:200%_auto] animate-[gradient-shift_3s_linear_infinite] motion-reduce:animate-none">
          <motion.button
            onClick={onTryFree}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={springs.press}
            className="relative inline-flex items-center gap-2.5 bg-zinc-950 text-white font-semibold
              rounded-[11px] px-8 sm:px-10 py-3.5 sm:py-4 text-sm sm:text-base cursor-pointer
              hover:bg-zinc-900 transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
              focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
              motion-reduce:transform-none"
          >
            Try it free
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </motion.button>
        </div>

        <p className="text-xs text-zinc-600">
          Just results.
        </p>
      </motion.div>
    </section>
  );
}
