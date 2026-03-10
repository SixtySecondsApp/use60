import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { transitions } from '../../lib/animation-tokens';
import { DemoUrlInput } from '../landing-v5/DemoUrlInput';

interface HeroV6Props {
  onSubmit: (url: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { ...transitions.hero, delay },
});

export const HeroV6 = forwardRef<HTMLDivElement, HeroV6Props>(
  function HeroV6({ onSubmit, inputRef }, ref) {
    return (
      <section
        ref={ref}
        className="relative min-h-[100dvh] flex items-center justify-center px-5 sm:px-6 overflow-hidden"
      >
        {/* Atmosphere: dot grid */}
        <div
          className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:32px_32px]
            [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,black_30%,transparent_100%)]"
          aria-hidden="true"
        />

        {/* Atmosphere: radial violet glow */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full
            bg-[radial-gradient(ellipse,rgba(139,92,246,0.06),transparent_70%)] blur-2xl pointer-events-none"
          aria-hidden="true"
        />

        {/* Content */}
        <div className="relative z-10 max-w-3xl w-full text-center flex flex-col items-center gap-7">
          {/* Badge */}
          <motion.div {...fade(0)}>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-zinc-800 bg-white/[0.02] text-sm text-zinc-400">
              <Zap className="w-3.5 h-3.5 text-violet-400" aria-hidden="true" />
              Early access
            </span>
          </motion.div>

          {/* Headline — Clash Display, extreme size */}
          <motion.h1
            {...fade(0.1)}
            className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] text-balance"
          >
            <span className="bg-gradient-to-b from-white via-white to-zinc-600 bg-clip-text text-transparent">
              You sell.
            </span>
            <br />
            <span className="bg-gradient-to-b from-white via-white to-zinc-600 bg-clip-text text-transparent">
              60 does the rest.
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            {...fade(0.25)}
            className="text-base sm:text-lg text-zinc-400 max-w-lg text-pretty leading-relaxed"
          >
            AI that handles follow-ups, meeting prep, pipeline tracking and
            outreach. You focus on the conversation.
          </motion.p>

          {/* URL input — the product-as-hero */}
          <motion.div {...fade(0.4)} className="w-full max-w-xl">
            <DemoUrlInput ref={inputRef} onSubmit={onSubmit} />
          </motion.div>

          {/* Micro-copy */}
          <motion.p {...fade(0.6)} className="text-xs text-zinc-600">
            30 seconds. No signup required.
          </motion.p>
        </div>
      </section>
    );
  }
);
