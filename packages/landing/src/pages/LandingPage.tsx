/**
 * LandingPage — use60.com primary landing page
 *
 * Strategy: hero with URL input → proof bar → differentiator → inline demo-v2 → testimonials → final CTA
 * The demo IS the page. Everything above the demo exists to get visitors to enter a URL.
 *
 * Three visitor paths:
 *   Ideal:    Hero input → Demo flow → Signup (~90s)
 *   Cautious: Hero → Proof → Differentiator → "See it work" → Demo → Signup (~2-3min)
 *   Skeptic:  Full scroll → Testimonials → Final CTA (~3-4min)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Sparkles, Clock, TrendingUp, Shield, Zap, Eye, Bot, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useForceDarkMode } from '../lib/hooks/useForceDarkMode';
import { getLoginUrl } from '../lib/utils/siteUrl';
import { useDemoResearch } from '../demo/useDemoResearch';
import { AgentResearch } from '../demo-v2/AgentResearch';
import { ProductShowcase } from '../demo-v2/ProductShowcase';
import { WeekRecap } from '../demo-v2/WeekRecap';
import { DemoSignup } from '../demo-v2/DemoSignup';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type DemoPhase = 'idle' | 'research' | 'showcase' | 'recap' | 'signup';

const EXAMPLE_DOMAINS = ['stripe.com', 'notion.com', 'linear.app', 'figma.com'];

const EASE_OUT_QUINT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ─────────────────────────────────────────────────────────────
// Navbar
// ─────────────────────────────────────────────────────────────

function Navbar({ onTryFree }: { onTryFree: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-colors duration-300',
        scrolled ? 'bg-zinc-950/80 backdrop-blur-lg border-b border-white/[0.06]' : 'bg-transparent'
      )}
    >
      <nav className="max-w-6xl mx-auto px-5 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 text-white font-bold text-lg tracking-tight">
          60
        </a>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-6">
          <a href="/pricing" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Pricing
          </a>
          <a href={getLoginUrl()} className="text-sm text-zinc-400 hover:text-white transition-colors">
            Log in
          </a>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            onClick={onTryFree}
            className="px-5 py-2 rounded-lg bg-white text-zinc-950 text-sm font-semibold
              hover:bg-zinc-100 transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
              motion-reduce:transform-none"
          >
            Try free
          </motion.button>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="sm:hidden p-2 -mr-2 text-zinc-400 hover:text-white transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT_QUINT }}
            className="sm:hidden overflow-hidden bg-zinc-950/95 backdrop-blur-lg border-b border-white/[0.06]"
          >
            <div className="px-5 py-4 flex flex-col gap-3">
              <a href="/pricing" onClick={() => setMobileOpen(false)} className="text-sm text-zinc-400 py-2">
                Pricing
              </a>
              <a href={getLoginUrl()} onClick={() => setMobileOpen(false)} className="text-sm text-zinc-400 py-2">
                Log in
              </a>
              <button
                onClick={() => { setMobileOpen(false); onTryFree(); }}
                className="w-full py-3 rounded-lg bg-white text-zinc-950 text-sm font-semibold"
              >
                Try free
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// Hero Section
// ─────────────────────────────────────────────────────────────

interface HeroProps {
  onSubmit: (url: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function HeroSection({ onSubmit, inputRef }: HeroProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter a website to get started');
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
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6 pt-16">
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
          transition={{ delay: 0.1, duration: 0.5, ease: EASE_OUT_EXPO }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full
            border border-violet-500/20 bg-violet-500/[0.06] text-xs sm:text-sm text-violet-300 mb-6 sm:mb-8
            motion-reduce:transition-none"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Early access
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7, ease: EASE_OUT_EXPO }}
          className="text-[2.5rem] sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.08]
            bg-clip-text text-transparent
            bg-gradient-to-b from-white via-white to-zinc-500
            text-balance
            motion-reduce:transition-none"
        >
          You sell.
          <br />
          60 does the rest.
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6, ease: EASE_OUT_QUINT }}
          className="mt-5 sm:mt-6 text-base sm:text-lg text-zinc-400 max-w-lg mx-auto text-pretty
            motion-reduce:transition-none"
        >
          AI that handles follow-ups, meeting prep, pipeline tracking and outreach. You focus on the conversation.
        </motion.p>

        {/* URL Input */}
        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6, ease: EASE_OUT_QUINT }}
          onSubmit={handleSubmit}
          className="mt-8 sm:mt-10 motion-reduce:transition-none"
        >
          <div className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                placeholder="yourcompany.com"
                className={cn(
                  'w-full px-5 py-3.5 sm:py-4 rounded-xl text-base',
                  'bg-white/[0.05] border placeholder-zinc-500 text-white',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70 focus-visible:border-transparent',
                  'transition-all duration-200',
                  error
                    ? 'border-red-500/50'
                    : 'border-white/10 hover:border-white/20 focus:shadow-[0_0_20px_rgba(139,92,246,0.15)]'
                )}
              />
              {error && (
                <p className="absolute -bottom-6 left-1 text-xs text-red-400">{error}</p>
              )}
            </div>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              className="px-7 py-3.5 sm:py-4 rounded-xl font-semibold text-base
                bg-white text-zinc-950 hover:bg-zinc-100 transition-colors
                flex items-center justify-center gap-2 shrink-0
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
                motion-reduce:transform-none"
            >
              Show me
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Example domains */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65, duration: 0.5 }}
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
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                {domain}
              </button>
            ))}
          </motion.div>
        </motion.form>

        {/* Micro-copy */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.4 }}
          className="mt-6 text-xs text-zinc-600 motion-reduce:transition-none"
        >
          30 seconds. No signup required.
        </motion.p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Proof Bar
// ─────────────────────────────────────────────────────────────

const PROOF_METRICS = [
  { value: '15h', label: 'back every week', icon: Clock },
  { value: '41%', label: 'more deals closed', icon: TrendingUp },
  { value: '0', label: 'dropped follow-ups', icon: Shield },
];

function ProofBar() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: EASE_OUT_QUINT }}
      className="py-12 sm:py-16 border-y border-white/[0.04]"
    >
      <div className="max-w-3xl mx-auto px-5 sm:px-6 flex items-center justify-center gap-8 sm:gap-14">
        {PROOF_METRICS.map(({ value, label, icon: Icon }) => (
          <div key={label} className="flex items-center gap-3 text-zinc-500">
            <Icon className="w-4 h-4 text-zinc-600 hidden sm:block" />
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-xl font-bold text-white tabular-nums">{value}</p>
              <p className="text-[11px] sm:text-xs text-zinc-500">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

// ─────────────────────────────────────────────────────────────
// Differentiator Section
// ─────────────────────────────────────────────────────────────

const DIFFERENTIATORS = [
  {
    icon: Eye,
    title: 'One place, full context',
    description: 'Deals, contacts, meetings, emails. All in one view. Nothing falls between tools.',
  },
  {
    icon: Bot,
    title: 'AI that acts, not advises',
    description: 'Follow-ups get sent. Briefs get built. Deals get flagged. Without you lifting a finger.',
  },
  {
    icon: Zap,
    title: '60 seconds, not 60 minutes',
    description: 'Meeting prep in 30 seconds. Follow-up emails before you leave the call.',
  },
];

interface DifferentiatorProps {
  onSeeItWork: () => void;
}

function DifferentiatorSection({ onSeeItWork }: DifferentiatorProps) {
  return (
    <section className="py-20 sm:py-28 px-5 sm:px-6">
      <div className="max-w-4xl mx-auto">
        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE_OUT_QUINT }}
          className="text-center mb-12 sm:mb-16"
        >
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight text-balance">
            Your tools don't talk to each other.
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
              60 does.
            </span>
          </h2>
          <p className="mt-4 sm:mt-5 text-base sm:text-lg text-zinc-400 max-w-xl mx-auto text-pretty">
            CRM, calendar, email, notetaker, task list — five apps that know nothing about each other.
            60 pulls it all into one place where AI can see everything and act on it.
          </p>
        </motion.div>

        {/* Three points */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {DIFFERENTIATORS.map(({ icon: Icon, title, description }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: EASE_OUT_QUINT }}
              className="p-5 sm:p-6 rounded-xl bg-white/[0.02] border border-white/[0.06]
                hover:border-white/[0.1] hover:bg-white/[0.03] transition-colors duration-200"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1.5">{title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ delay: 0.3, duration: 0.5, ease: EASE_OUT_QUINT }}
          className="mt-10 sm:mt-12 text-center"
        >
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            onClick={onSeeItWork}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl
              border border-white/10 bg-white/[0.04] text-sm font-medium text-white
              hover:border-white/20 hover:bg-white/[0.06] transition-all duration-200
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
              motion-reduce:transform-none"
          >
            See it work on your company
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Testimonials
// ─────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote: 'I used to spend Sunday nights prepping for Monday meetings. Now I show up with better notes than I ever wrote myself.',
    name: 'Early access user',
    title: 'Founder',
  },
  {
    quote: "I was skeptical about AI writing my follow-ups. Then a prospect replied 'this is the most thoughtful email I've gotten.' It was 60.",
    name: 'Early access user',
    title: 'Head of Sales',
  },
  {
    quote: 'Three deals were about to die. 60 flagged all three before I noticed. Two of them closed.',
    name: 'Early access user',
    title: 'CEO',
  },
];

function TestimonialsSection() {
  return (
    <section className="py-20 sm:py-28 px-5 sm:px-6 border-t border-white/[0.04]">
      <div className="max-w-5xl mx-auto">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-xs text-zinc-600 uppercase tracking-widest text-center mb-10 sm:mb-12"
        >
          From early users
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {TESTIMONIALS.map(({ quote, name, title }, i) => (
            <motion.blockquote
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: EASE_OUT_QUINT }}
              className="p-5 sm:p-6 rounded-xl bg-white/[0.02] border border-white/[0.06]"
            >
              <p className="text-sm text-zinc-300 leading-relaxed mb-4">"{quote}"</p>
              <footer className="text-xs text-zinc-500">
                <span className="text-zinc-400 font-medium">{name}</span>
                <span className="mx-1.5">·</span>
                {title}
              </footer>
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Final CTA
// ─────────────────────────────────────────────────────────────

interface FinalCTAProps {
  onTryFree: () => void;
}

function FinalCTASection({ onTryFree }: FinalCTAProps) {
  return (
    <section className="py-20 sm:py-28 px-5 sm:px-6">
      <div className="max-w-2xl mx-auto text-center relative">
        {/* Background glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-[400px] h-[300px] rounded-full pointer-events-none
            bg-[radial-gradient(ellipse,rgba(139,92,246,0.08),transparent_70%)]
            blur-3xl"
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: EASE_OUT_QUINT }}
          className="relative z-10"
        >
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight text-balance">
            Your next follow-up is
            <br />
            60 seconds away.
          </h2>

          <div className="mt-8 sm:mt-10">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              onClick={onTryFree}
              className="px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl font-semibold text-base
                bg-white text-zinc-950 hover:bg-zinc-100 transition-colors
                inline-flex items-center gap-2
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
                motion-reduce:transform-none"
            >
              Try it free
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>

          <p className="mt-4 text-xs text-zinc-600">
            No credit card. No sales call. Just results.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/[0.04] py-8 px-5 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm font-bold text-zinc-600 tracking-tight">60</span>
        <div className="flex items-center gap-6 text-xs text-zinc-600">
          <a href="/privacy-policy" className="hover:text-zinc-400 transition-colors">Privacy</a>
          <a href="/pricing" className="hover:text-zinc-400 transition-colors">Pricing</a>
          <span>&copy; {new Date().getFullYear()} Sixty AI</span>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Landing Page
// ─────────────────────────────────────────────────────────────

export function LandingPage() {
  useForceDarkMode();

  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle');
  const research = useDemoResearch();
  const heroInputRef = useRef<HTMLInputElement | null>(null);
  const demoRef = useRef<HTMLDivElement>(null);

  // Focus hero input when "Try Free" clicked
  const handleTryFree = useCallback(() => {
    if (demoPhase !== 'idle') return;
    heroInputRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [demoPhase]);

  // Start demo when URL submitted from hero
  const handleUrlSubmit = useCallback((url: string) => {
    research.start(url);
    setDemoPhase('research');

    // Scroll to demo area
    setTimeout(() => {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [research]);

  // "See it work" button — use stripe.com as example
  const handleSeeItWork = useCallback(() => {
    handleUrlSubmit('stripe.com');
  }, [handleUrlSubmit]);

  // Demo phase transitions
  const handleResearchComplete = useCallback(() => setDemoPhase('showcase'), []);
  const handleShowcaseComplete = useCallback(() => setDemoPhase('recap'), []);
  const handleRecapContinue = useCallback(() => setDemoPhase('signup'), []);

  // Scroll to top on demo phase change
  useEffect(() => {
    if (demoPhase !== 'idle') {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [demoPhase]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-x-hidden">
      <Navbar onTryFree={handleTryFree} />

      {/* Pre-demo sections — hidden once demo starts */}
      {demoPhase === 'idle' && (
        <>
          <HeroSection onSubmit={handleUrlSubmit} inputRef={heroInputRef} />
          <ProofBar />
          <DifferentiatorSection onSeeItWork={handleSeeItWork} />
        </>
      )}

      {/* Demo area */}
      <div ref={demoRef}>
        <AnimatePresence mode="wait">
          {demoPhase === 'research' && (
            <AgentResearch
              key="research"
              agents={research.agents}
              isComplete={research.isComplete}
              isAnimationDone={research.isAnimationDone}
              stats={research.research?.stats ?? null}
              companyName={research.research?.company?.name ?? null}
              onComplete={handleResearchComplete}
            />
          )}

          {demoPhase === 'showcase' && research.research && (
            <ProductShowcase
              key="showcase"
              data={research.research}
              onComplete={handleShowcaseComplete}
            />
          )}

          {demoPhase === 'recap' && research.research && (
            <WeekRecap
              key="recap"
              data={research.research}
              onContinue={handleRecapContinue}
            />
          )}

          {demoPhase === 'signup' && (
            <DemoSignup
              key="signup"
              companyName={research.research?.company.name ?? ''}
              stats={research.research?.stats ?? null}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Post-demo sections — always visible when demo is idle */}
      {demoPhase === 'idle' && (
        <>
          <TestimonialsSection />
          <FinalCTASection onTryFree={handleTryFree} />
          <Footer />
        </>
      )}
    </div>
  );
}

export default LandingPage;
