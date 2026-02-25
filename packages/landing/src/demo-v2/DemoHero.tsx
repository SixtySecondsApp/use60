/**
 * DemoHero V2
 *
 * Premium dark hero with:
 *   - Social proof bar (company logos or stats)
 *   - Outcome-focused headline (not feature-focused)
 *   - URL input with "Try stripe.com" as primary example
 *   - Subtle grid + radial glow atmosphere
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Clock, TrendingUp, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DemoHeroProps {
  onSubmit: (url: string) => void;
}

const EXAMPLE_DOMAINS = ['stripe.com', 'notion.com', 'linear.app', 'figma.com'];

const PROOF_STATS = [
  { icon: Clock, value: '15h', label: 'back every week' },
  { icon: TrendingUp, value: '40%', label: 'more deals closed' },
  { icon: Shield, value: '0', label: 'dropped follow-ups' },
];

export function DemoHero({ onSubmit }: DemoHeroProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter a website URL to get started');
      return;
    }
    setError('');
    onSubmit(trimmed);
  };

  const handleExample = (domain: string) => {
    setUrl(domain);
    onSubmit(domain);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6 overflow-hidden"
    >
      {/* Background atmosphere */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/4
          w-[700px] sm:w-[1000px] h-[500px] sm:h-[700px] rounded-full pointer-events-none
          bg-[radial-gradient(ellipse,rgba(139,92,246,0.10),transparent_70%)]
          blur-3xl"
      />
      <div
        className="absolute inset-0 pointer-events-none
          bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)]
          bg-[size:64px_64px]
          [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black_20%,transparent_100%)]"
      />

      <div className="relative z-10 w-full max-w-2xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full
            border border-violet-500/20 bg-violet-500/[0.06] text-xs sm:text-sm text-violet-300 mb-6 sm:mb-8
            motion-reduce:transition-none"
        >
          <Sparkles className="w-3.5 h-3.5" />
          30 seconds. Any company. Real results.
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-[2rem] sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]
            bg-clip-text text-transparent
            bg-gradient-to-b from-white via-white to-zinc-500
            motion-reduce:transition-none"
        >
          You sell.
          <br />
          We do the rest.
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mt-4 sm:mt-5 text-base sm:text-lg text-zinc-400 max-w-lg mx-auto text-pretty
            motion-reduce:transition-none"
        >
          Drop in a website. Watch 6 AI agents research the company, write your first email, and show you what they'd do every day.
        </motion.p>

        {/* URL Input */}
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          onSubmit={handleSubmit}
          className="mt-8 sm:mt-10 motion-reduce:transition-none"
        >
          <div className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <div className="flex-1 relative">
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError('');
                }}
                placeholder="yourcompany.com"
                className={cn(
                  'w-full px-5 py-3.5 rounded-xl text-base',
                  'bg-white/[0.05] border placeholder-zinc-500 text-white',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:border-transparent',
                  'transition-colors',
                  error
                    ? 'border-red-500/50'
                    : 'border-white/10 hover:border-white/20'
                )}
                autoFocus
              />
              {error && (
                <p className="absolute -bottom-6 left-1 text-xs text-red-400">
                  {error}
                </p>
              )}
            </div>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              className={cn(
                'px-7 py-3.5 rounded-xl font-semibold text-base',
                'bg-white text-zinc-950',
                'hover:bg-zinc-100 transition-colors',
                'flex items-center justify-center gap-2 shrink-0',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                'motion-reduce:transform-none'
              )}
            >
              Go
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Example domains */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.4 }}
            className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-500
              motion-reduce:transition-none"
          >
            <span className="text-zinc-600">Try:</span>
            {EXAMPLE_DOMAINS.map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => handleExample(domain)}
                className="px-2.5 py-1 rounded-lg border border-white/[0.06] bg-white/[0.02]
                  text-zinc-400 hover:text-white hover:border-white/15 hover:bg-white/[0.04]
                  transition-all duration-150
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:rounded-lg"
              >
                {domain}
              </button>
            ))}
          </motion.div>
        </motion.form>

        {/* Social proof stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.4 }}
          className="mt-12 sm:mt-16 flex items-center justify-center gap-6 sm:gap-10
            motion-reduce:transition-none"
        >
          {PROOF_STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-2.5 text-zinc-500">
              <Icon className="w-4 h-4 text-zinc-600" />
              <div className="text-left">
                <p className="text-sm sm:text-base font-semibold text-zinc-300 tabular-nums">{value}</p>
                <p className="text-[10px] sm:text-xs">{label}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
