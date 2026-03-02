import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { springs, easings, transitions } from '../../lib/animation-tokens';
import { SvgWrapper } from './SvgWrapper';
import brandConstellationSvg from '../../svg/brand-constellation.svg?raw';

interface FinalCTAV5Props {
  onTryFree: () => void;
}

export function FinalCTAV5({ onTryFree }: FinalCTAV5Props) {
  return (
    <section className="relative py-20 sm:py-28 px-5 sm:px-6 overflow-hidden">
      {/* Background constellation */}
      <SvgWrapper
        svg={brandConstellationSvg}
        ariaLabel=""
        className="absolute inset-0 w-full h-full opacity-50 pointer-events-none"
      />

      {/* Violet glow behind CTA */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-violet-500/[0.06] blur-[100px] pointer-events-none" />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={transitions.reveal}
        className="relative z-10 max-w-2xl mx-auto text-center flex flex-col items-center gap-6"
      >
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent">
          Your next follow-up is 60 seconds away.
        </h2>

        <motion.button
          onClick={onTryFree}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          transition={springs.press}
          className="inline-flex items-center gap-2.5 bg-white text-zinc-950 font-semibold rounded-xl px-8 sm:px-10 py-3.5 sm:py-4 text-sm sm:text-base cursor-pointer"
        >
          Try it free
          <ArrowRight className="w-4 h-4" />
        </motion.button>

        <p className="text-xs text-zinc-600">
          No credit card. No sales call. Just results.
        </p>
      </motion.div>
    </section>
  );
}
