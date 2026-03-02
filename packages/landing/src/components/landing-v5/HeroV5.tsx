import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { easings, transitions } from '../../lib/animation-tokens';
import { SvgWrapper } from './SvgWrapper';
import { DemoUrlInput } from './DemoUrlInput';
import heroOrbitalSvg from '../../svg/hero-orbital.svg?raw';

interface HeroV5Props {
  onSubmit: (url: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { ...transitions.hero, delay },
});

export const HeroV5 = forwardRef<HTMLDivElement, HeroV5Props>(
  function HeroV5({ onSubmit, inputRef }, ref) {
    return (
      <section
        ref={ref}
        className="relative min-h-[100dvh] flex items-center justify-center px-5 sm:px-6 overflow-hidden"
      >
        {/* Background orbital SVG */}
        <SvgWrapper
          svg={heroOrbitalSvg}
          ariaLabel="Decorative orbital background"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] opacity-35 pointer-events-none"
        />

        {/* Foreground content */}
        <div className="relative z-10 max-w-2xl w-full text-center flex flex-col items-center gap-6">
          {/* Badge */}
          <motion.div {...fade(0)}>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] text-sm text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              Early access
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            {...fade(0.1)}
            className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]"
          >
            <span className="bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent">
              You sell.
              <br />
              60 does the rest.
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            {...fade(0.25)}
            className="text-base sm:text-lg text-zinc-400 max-w-md"
          >
            AI that handles follow-ups, meeting prep, pipeline tracking and
            outreach. You focus on the conversation.
          </motion.p>

          {/* URL input */}
          <motion.div {...fade(0.4)} className="w-full">
            <DemoUrlInput ref={inputRef} onSubmit={onSubmit} />
          </motion.div>

          {/* Micro-copy */}
          <motion.p {...fade(0.7)} className="text-xs text-zinc-600">
            30 seconds. No signup required.
          </motion.p>
        </div>
      </section>
    );
  }
);
