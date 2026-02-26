/**
 * DemoSignup — Step 8
 *
 * Email capture with magic-link activation (primary) and waitlist (secondary).
 * A/B test-ready: swap `variant` prop between 'activation' and 'waitlist'.
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Loader2, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'activation' | 'waitlist';

const COPY: Record<
  Variant,
  { headline: string; subtext: string; cta: string; successTitle: string; successDesc: string }
> = {
  activation: {
    headline: 'Get this running on your real pipeline.',
    subtext: "One click to log in. No password, no setup call, no credit card.",
    cta: 'Send me a login link',
    successTitle: 'Check your inbox',
    successDesc: 'Click the link to activate your account. Your agents start working immediately.',
  },
  waitlist: {
    headline: "You're early. That's how the best teams operate.",
    subtext: "We'll send your full intelligence report now and your invite as soon as we open up.",
    cta: 'Get early access',
    successTitle: "You're in",
    successDesc: "Check your email for the full report. We'll reach out when your account is ready.",
  },
};

interface DemoSignupProps {
  companyName: string;
  variant?: Variant;
}

export function DemoSignup({ companyName, variant = 'activation' }: DemoSignupProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const copy = COPY[variant];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setState('loading');

    // Simulate API call — replace with real endpoint
    await new Promise((r) => setTimeout(r, 1500));
    setState('success');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6"
    >
      {/* Radial glow */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] rounded-full pointer-events-none
          bg-[radial-gradient(ellipse,rgba(139,92,246,0.08),transparent_70%)]
          blur-3xl"
      />

      <div className="relative z-10 w-full max-w-sm sm:max-w-md mx-auto">
        {state === 'success' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="bg-gray-900/80 backdrop-blur-sm border border-white/[0.06]
              rounded-2xl p-6 sm:p-8 text-center motion-reduce:transition-none"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4 sm:mb-5">
              <Check className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white mb-2 tracking-tight">{copy.successTitle}</h2>
            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">{copy.successDesc}</p>
            <div className="mt-5 sm:mt-6 p-3 rounded-lg bg-gray-800/50 border border-white/[0.06]">
              <p className="text-xs text-gray-500 font-mono truncate">{email}</p>
            </div>
          </motion.div>
        ) : (
          <div
            className="bg-gray-900/80 backdrop-blur-sm border border-white/[0.06]
              rounded-2xl p-6 sm:p-8"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-violet-500/15 flex items-center justify-center mx-auto mb-5 sm:mb-6">
              <Mail className="w-5 h-5 sm:w-6 sm:h-6 text-violet-400" />
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-white text-center mb-2 tracking-tight">
              {copy.headline}
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 text-center mb-6 sm:mb-8">{copy.subtext}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                    'w-full px-4 py-3 rounded-xl text-sm text-white',
                    'bg-white/[0.05] border placeholder-gray-500',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:border-transparent',
                    'transition-colors',
                    error ? 'border-red-500/50' : 'border-white/10'
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
                  'w-full py-3 rounded-xl font-semibold text-sm transition-colors',
                  'flex items-center justify-center gap-2',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
                  'motion-reduce:transform-none',
                  variant === 'activation'
                    ? 'bg-white text-gray-950 hover:bg-gray-100'
                    : 'bg-violet-600 text-white hover:bg-violet-700'
                )}
              >
                {state === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                    {variant === 'activation' ? 'Sending link\u2026' : 'Joining\u2026'}
                  </>
                ) : (
                  <>
                    {copy.cta}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </form>

            {companyName && (
              <p className="text-[10px] text-gray-600 text-center mt-5 font-mono">
                Setting up agents for {companyName}
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
