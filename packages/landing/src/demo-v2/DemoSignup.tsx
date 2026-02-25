/**
 * DemoSignup V2
 *
 * Collects name, email, password — creates a real account with
 * demo research data pre-seeded so the user skips skills onboarding.
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Loader2, Sparkles, User, Mail, Lock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchData } from './demo-types';

interface DemoSignupProps {
  researchData: ResearchData | null;
  url: string;
}

const BENEFITS = [
  'Walk into every meeting already briefed',
  'Catch deals slipping before they cost you',
  'Send emails that sound like you wrote them',
  'Get nudged in Slack when something needs you',
  'Never drop a follow-up again',
];

/** Extract domain from a URL string (e.g. "https://stripe.com/pricing" → "stripe.com"). */
function extractDomain(url: string): string {
  try {
    const withProtocol = url.includes('://') ? url : `https://${url}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0] || url;
  }
}

const INPUT_CLASS = cn(
  'w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white',
  'bg-white/[0.04] border border-white/[0.08] placeholder-zinc-500',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:border-transparent',
  'transition-colors',
);

const INPUT_ERROR_CLASS = 'border-red-500/50';

export function DemoSignup({ researchData, url }: DemoSignupProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const companyName = researchData?.company?.name || '';
  const domain = extractDomain(url);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = 'First name is required';
    if (!lastName.trim()) errors.lastName = 'Last name is required';
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) errors.email = 'Enter a valid email address';
    if (password.length < 6) errors.password = 'Must be at least 6 characters';
    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(Object.values(errors)[0]);
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setState('loading');
    setError('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      if (!supabaseUrl || !anonKey) {
        throw new Error('Configuration error — please try again later.');
      }

      // Step 1: Create the auth user via Supabase REST API
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const signupRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          data: {
            full_name: fullName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            company_domain: domain,
            signup_source: 'demo-v2',
          },
        }),
      });

      const signupData = await signupRes.json();

      if (!signupRes.ok) {
        const msg = signupData?.msg || signupData?.error_description || signupData?.message || 'Signup failed';
        if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
          setError('An account with this email already exists.');
          setState('error');
          return;
        }
        throw new Error(msg);
      }

      const userId = signupData?.id || signupData?.user?.id;
      const accessToken = signupData?.access_token || signupData?.session?.access_token;

      if (!userId) {
        throw new Error('Account created but missing user ID — check your email to verify.');
      }

      // Step 2: Auto-verify email (if access token available)
      if (accessToken) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/auto-verify-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
              apikey: anonKey,
            },
            body: JSON.stringify({ userId }),
          });
        } catch {
          // Non-critical — user can verify via email
        }
      }

      // Step 3: Convert account with demo research data
      await fetch(`${supabaseUrl}/functions/v1/demo-convert-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
        },
        body: JSON.stringify({
          user_id: userId,
          domain,
          research_data: researchData,
        }),
      });
      // Non-blocking — if this fails, user still has an account; they'll just go through onboarding

      setState('success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setState('error');
    }
  };

  const appUrl = import.meta.env.VITE_APP_URL || 'https://app.use60.com';

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
            <h2 className="text-xl font-bold text-white mb-2 tracking-tight">You&apos;re in.</h2>
            <p className="text-sm text-zinc-400 leading-relaxed mb-5">
              Your account is ready. Your agents are already watching{' '}
              {companyName || 'your pipeline'}.
            </p>
            <a
              href={`${appUrl}/auth/login?email=${encodeURIComponent(email.trim())}`}
              className={cn(
                'inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-xl',
                'font-semibold text-sm bg-white text-zinc-950 hover:bg-zinc-100',
                'transition-colors focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
              )}
            >
              Log in to 60
              <ExternalLink className="w-4 h-4" />
            </a>
            <div className="mt-4 p-3 rounded-lg bg-zinc-800/50 border border-white/[0.06]">
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
              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); setFieldErrors(p => ({ ...p, firstName: '' })); }}
                    placeholder="First name"
                    className={cn(INPUT_CLASS, fieldErrors.firstName && INPUT_ERROR_CLASS)}
                    autoFocus
                    required
                    disabled={state === 'loading'}
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); setFieldErrors(p => ({ ...p, lastName: '' })); }}
                    placeholder="Last name"
                    className={cn(INPUT_CLASS, fieldErrors.lastName && INPUT_ERROR_CLASS)}
                    required
                    disabled={state === 'loading'}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })); setError(''); }}
                  placeholder="you@company.com"
                  className={cn(INPUT_CLASS, fieldErrors.email && INPUT_ERROR_CLASS)}
                  required
                  disabled={state === 'loading'}
                />
              </div>

              {/* Password */}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                  placeholder="Password (6+ characters)"
                  className={cn(INPUT_CLASS, fieldErrors.password && INPUT_ERROR_CLASS)}
                  required
                  minLength={6}
                  disabled={state === 'loading'}
                />
              </div>

              {/* Confirm password */}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors(p => ({ ...p, confirmPassword: '' })); }}
                  placeholder="Confirm password"
                  className={cn(INPUT_CLASS, fieldErrors.confirmPassword && INPUT_ERROR_CLASS)}
                  required
                  minLength={6}
                  disabled={state === 'loading'}
                />
              </div>

              {/* Error message */}
              {error && (
                <p className="text-xs text-red-400 ml-1">
                  {error}{' '}
                  {error.toLowerCase().includes('already exists') && (
                    <a
                      href={`${appUrl}/auth/login?email=${encodeURIComponent(email.trim())}`}
                      className="underline text-violet-400 hover:text-violet-300"
                    >
                      Log in instead
                    </a>
                  )}
                </p>
              )}

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
                  'motion-reduce:transform-none',
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
