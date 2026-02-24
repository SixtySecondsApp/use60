/**
 * DemoSignup V2
 *
 * Clean, focused signup — no distracting cards above the form.
 * Just the value prop, benefits, and a clear CTA.
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchData } from './demo-types';

interface DemoSignupProps {
  companyName: string;
  stats: ResearchData['stats'] | null;
}

const BENEFITS = [
  'Walk into every meeting already briefed',
  'Catch deals slipping before they cost you',
  'Send emails that sound like you wrote them',
  'Get nudged in Slack when something needs you',
  'Never drop a follow-up again',
];

export function DemoSignup({ companyName, stats }: DemoSignupProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setState('loading');
    await new Promise((r) => setTimeout(r, 1500));
    setState('success');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6 py-8"
    >
      {/* Background glow */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-[500px] sm:w-[700px] h-[500px] sm:h-[700px] rounded-full pointer-events-none
          bg-[radial-gradient(ellipse,rgba(139,92,246,0.06),transparent_70%)]
          blur-3xl"
      />

      <div className="relative z-10 w-full max-w-sm sm:max-w-md mx-auto">
        {state === 'success' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="bg-zinc-900/80 backdrop-blur-sm border border-white/[0.06]
              rounded-2xl p-6 sm:p-8 text-center"
          >
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
              <Check className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 tracking-tight">You're in.</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Check your email for the login link.
              <br />
              Your agents are already watching {companyName || 'your pipeline'}.
            </p>
            <div className="mt-5 p-3 rounded-lg bg-zinc-800/50 border border-white/[0.06]">
              <p className="text-xs text-zinc-500 font-mono truncate">{email}</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-zinc-900/80 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-6 sm:p-8"
          >
            <div className="w-11 h-11 rounded-xl bg-violet-500/15 flex items-center justify-center mx-auto mb-5">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-white text-center mb-1.5 tracking-tight">
              Now do this with your real deals.
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 text-center mb-5 text-pretty">
              Everything you just saw. Running on {companyName || 'your company'}. Every single day.
            </p>

            {/* Benefits */}
            <div className="space-y-2.5 mb-6">
              {BENEFITS.map((benefit, i) => (
                <motion.div
                  key={benefit}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.06 }}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span className="text-xs sm:text-sm text-zinc-300">{benefit}</span>
                </motion.div>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="you@company.com"
                  className={cn(
                    'w-full px-4 py-3.5 rounded-xl text-sm text-white',
                    'bg-white/[0.04] border placeholder-zinc-500',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:border-transparent',
                    'transition-colors',
                    error ? 'border-red-500/50' : 'border-white/[0.08]'
                  )}
                  autoFocus
                />
                {error && (
                  <p className="text-xs text-red-400 mt-1.5 ml-1">{error}</p>
                )}
              </div>

              <motion.button
                type="submit"
                disabled={state === 'loading'}
                whileHover={{ scale: state === 'loading' ? 1 : 1.02 }}
                whileTap={{ scale: state === 'loading' ? 1 : 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                className={cn(
                  'w-full py-3.5 rounded-xl font-semibold text-sm transition-colors',
                  'flex items-center justify-center gap-2',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  'bg-white text-zinc-950 hover:bg-zinc-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
                  'motion-reduce:transform-none'
                )}
              >
                {state === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                    Setting up your agents...
                  </>
                ) : (
                  <>
                    Start for free
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </form>

            <p className="text-[10px] text-zinc-600 text-center mt-4">
              No card needed. Cancel anytime.
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
