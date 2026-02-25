/**
 * DemoHero — Step 1
 *
 * Minimal hero with a single URL input and an example.com fallback link.
 * Full viewport height, centered content, radial glow background.
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DemoHeroProps {
  onSubmit: (url: string) => void;
}

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

  const handleExample = () => {
    setUrl('example.com');
    onSubmit('example.com');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6 overflow-hidden"
    >
      {/* Radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3
          w-[600px] sm:w-[900px] h-[500px] sm:h-[700px] rounded-full pointer-events-none
          bg-[radial-gradient(ellipse,rgba(139,92,246,0.12),transparent_70%)]
          blur-3xl"
      />

      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none
          bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]
          bg-[size:72px_72px]
          [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black_30%,transparent_100%)]"
      />

      <div className="relative z-10 w-full max-w-2xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full
            border border-white/10 bg-white/[0.04] text-xs sm:text-sm text-gray-400 mb-6 sm:mb-8
            motion-reduce:transition-none"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none" />
          See results in under 30 seconds
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-balance leading-[1.05]
            bg-clip-text text-transparent
            bg-gradient-to-b from-white via-white to-gray-500
            motion-reduce:transition-none"
        >
          Stop losing deals
          <br />
          to busy work
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="mt-4 sm:mt-6 text-base sm:text-xl text-gray-400 max-w-md mx-auto text-pretty
            motion-reduce:transition-none"
        >
          Enter your website. 6 AI agents will research your business, draft outreach, and show you what they'd do every day.
        </motion.p>

        {/* URL Input */}
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          onSubmit={handleSubmit}
          className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto
            motion-reduce:transition-none"
        >
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
                'bg-white/[0.06] border placeholder-gray-500 text-white',
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
              'bg-white text-gray-950',
              'hover:bg-gray-100 transition-colors',
              'flex items-center justify-center gap-2 shrink-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
              'motion-reduce:transform-none'
            )}
          >
            Activate Agents
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.form>

        {/* Example fallback */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65, duration: 0.4 }}
          className="mt-8 sm:mt-10 text-sm text-gray-500 motion-reduce:transition-none"
        >
          Just exploring?{' '}
          <button
            type="button"
            onClick={handleExample}
            className="text-gray-400 underline underline-offset-4 decoration-gray-600
              hover:text-white hover:decoration-gray-400 transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:rounded"
          >
            Try with example.com &rarr;
          </button>
        </motion.p>
      </div>
    </motion.div>
  );
}
