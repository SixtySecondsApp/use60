import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';
import {
  Brain,
  Calendar,
  TrendingUp,
  Users,
  FileText,
  Check,
  Send,
  ArrowRight,
  Clock,
  CreditCard,
  Zap,
  MessageSquare,
} from 'lucide-react';

/* ─── Design Tokens ─── */
const t = {
  bg: '#06060C',
  bgCard: '#0F0F1A',
  bgElevated: '#141428',
  border: 'rgba(255,255,255,0.08)',
  borderActive: 'rgba(108,92,231,0.30)',
  accent: '#6C5CE7',
  accentGlow: 'rgba(108,92,231,0.15)',
  accentSubtle: 'rgba(108,92,231,0.08)',
  success: '#34D399',
  successGlow: 'rgba(52,211,153,0.12)',
  textPrimary: '#F1F1F3',
  textSecondary: '#8B8B9E',
  textTertiary: '#4E4E6A',
  mono: "'JetBrains Mono', 'SF Mono', monospace",
};

/* ─── Spring Configs ─── */
const spring = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 0.8 };
const springStep = { type: 'spring' as const, stiffness: 280, damping: 26 };
const springCheck = { type: 'spring' as const, stiffness: 500, damping: 18 };
const springCard = { type: 'spring' as const, stiffness: 220, damping: 28 };

/* ─── Cascade Step Data ─── */
const cascadeSteps = [
  { icon: Calendar, loading: 'Searching meetings...', done: 'Meeting found: Acme Corp Demo, 2pm' },
  { icon: TrendingUp, loading: 'Pulling deal context...', done: '$95K — Stage: Negotiation' },
  { icon: Users, loading: 'Researching contacts...', done: '3 attendees identified' },
  { icon: FileText, loading: 'Generating prep doc...', done: 'Talking points, risks, objectives ready' },
];

const typedText = 'Prepare for my meeting with Acme Corp tomorrow';

/* ─── Cascade Step Component ─── */
function CascadeStep({
  step,
  isComplete,
  isVisible,
}: {
  step: (typeof cascadeSteps)[number];
  isComplete: boolean;
  isVisible: boolean;
}) {
  const Icon = step.icon;
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={springStep}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
          style={{ backgroundColor: t.bgElevated }}
        >
          <div
            className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
            style={{ backgroundColor: isComplete ? t.successGlow : t.accentSubtle }}
          >
            {isComplete ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={springCheck}
              >
                <Check className="w-3.5 h-3.5" style={{ color: t.success }} />
              </motion.div>
            ) : (
              <Icon className="w-3.5 h-3.5" style={{ color: t.accent }} />
            )}
          </div>
          <span
            className="text-xs"
            style={{
              color: isComplete ? t.textPrimary : t.textSecondary,
              fontFamily: t.mono,
            }}
          >
            {isComplete ? step.done : step.loading}
          </span>
          {!isComplete && (
            <motion.div
              className="ml-auto w-3.5 h-3.5 rounded-full border-2 border-t-transparent"
              style={{ borderColor: t.accent, borderTopColor: 'transparent' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Prep Doc Card ─── */
function PrepDocCard({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={springCard}
          className="rounded-xl overflow-hidden"
          style={{
            backgroundColor: t.bgElevated,
            border: `1px solid rgba(108,92,231,0.25)`,
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-2.5" style={{ borderBottom: `1px solid ${t.border}` }}>
            <FileText className="w-4 h-4" style={{ color: t.accent }} />
            <div>
              <div className="text-xs font-medium" style={{ color: t.textPrimary }}>
                Meeting Prep: Acme Corp Demo
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: t.textSecondary, fontFamily: t.mono }}
              >
                Today 2pm · $95K · Negotiation
              </div>
            </div>
          </div>

          {/* Talking Points */}
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${t.border}` }}>
            <div
              className="text-[10px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: t.textTertiary, fontFamily: t.mono }}
            >
              Talking Points
            </div>
            <ul className="space-y-1.5">
              {[
                'Ask about Q2 budget approval process',
                'Reference Series B closing timeline',
                'Lead with ROI data from Pilot Week 3',
              ].map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2 text-xs"
                  style={{ color: t.textSecondary }}
                >
                  <span style={{ color: t.accent }} className="mt-0.5">
                    ·
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Risk Flags + Attendees */}
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="px-4 py-3" style={{ borderRight: `1px solid ${t.border}` }}>
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: t.textTertiary, fontFamily: t.mono }}
              >
                Risk Flags
              </div>
              <div className="flex items-start gap-1.5 text-xs" style={{ color: '#FBBF24' }}>
                <span className="mt-0.5">⚠</span>
                <span style={{ color: t.textSecondary }}>Budget approval pending</span>
              </div>
            </div>
            <div className="px-4 py-3">
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: t.textTertiary, fontFamily: t.mono }}
              >
                Attendees
              </div>
              <div className="space-y-1">
                {[
                  ['J. Torres', 'Champion'],
                  ['S. Chen', 'Economic Buyer'],
                  ['M. Park', 'Legal'],
                ].map(([name, role]) => (
                  <div key={name} className="text-xs" style={{ color: t.textSecondary }}>
                    <span style={{ color: t.textPrimary }}>{name}</span>{' '}
                    <span className="text-[10px]">({role})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Slack Toast ─── */
function SlackToast({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 24, y: 8 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0 }}
          transition={springStep}
          className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg absolute -bottom-3 -right-2"
          style={{
            backgroundColor: t.bgElevated,
            border: `1px solid ${t.borderActive}`,
            boxShadow: `0 8px 32px rgba(0,0,0,0.4)`,
          }}
        >
          <MessageSquare className="w-3.5 h-3.5" style={{ color: t.accent }} />
          <span className="text-[11px]" style={{ color: t.textSecondary, fontFamily: t.mono }}>
            Slack digest sent →{' '}
            <span style={{ color: t.accent }}>#sales-prep</span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Quick Add Demo ─── */
function QuickAddDemo({ cycleKey }: { cycleKey: number }) {
  const [typedChars, setTypedChars] = useState(0);
  const [typingDone, setTypingDone] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState<boolean[]>([false, false, false, false]);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false, false]);
  const [showPrepDoc, setShowPrepDoc] = useState(false);
  const [showSlack, setShowSlack] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const t_ = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
    };

    // Typewriter: 28ms/char starting at 1000ms
    for (let i = 0; i < typedText.length; i++) {
      t_(() => setTypedChars(i + 1), 1000 + i * 28);
    }
    const typeEnd = 1000 + typedText.length * 28;
    t_(() => setTypingDone(true), typeEnd);

    // Cascade steps
    // Step 1: show at 3000, complete at 3600
    t_(() => setVisibleSteps((s) => { const n = [...s]; n[0] = true; return n; }), 3000);
    t_(() => setCompletedSteps((s) => { const n = [...s]; n[0] = true; return n; }), 3600);
    // Step 2: show at 3700, complete at 4300
    t_(() => setVisibleSteps((s) => { const n = [...s]; n[1] = true; return n; }), 3700);
    t_(() => setCompletedSteps((s) => { const n = [...s]; n[1] = true; return n; }), 4300);
    // Step 3: show at 4400, complete at 5000
    t_(() => setVisibleSteps((s) => { const n = [...s]; n[2] = true; return n; }), 4400);
    t_(() => setCompletedSteps((s) => { const n = [...s]; n[2] = true; return n; }), 5000);
    // Step 4: show at 5100, complete at 5700
    t_(() => setVisibleSteps((s) => { const n = [...s]; n[3] = true; return n; }), 5100);
    t_(() => setCompletedSteps((s) => { const n = [...s]; n[3] = true; return n; }), 5700);

    // PrepDocCard at 6200
    t_(() => setShowPrepDoc(true), 6200);
    // SlackToast at 7500
    t_(() => setShowSlack(true), 7500);
    // Fade out at 10000
    t_(() => setFadeOut(true), 10000);

    return () => timers.forEach(clearTimeout);
  }, [cycleKey]);

  return (
    <motion.div
      animate={{ opacity: fadeOut ? 0 : 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: t.bgCard,
          border: `1px solid ${t.border}`,
          boxShadow: `0 0 60px ${t.accentGlow}, 0 24px 48px rgba(0,0,0,0.5)`,
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${t.border}` }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${t.accent}, #8B5CF6)`,
              }}
            >
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium" style={{ color: t.textPrimary }}>
              60 Copilot
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.textTertiary }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.textTertiary }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.textTertiary }} />
          </div>
        </div>

        {/* Input Area */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${t.border}` }}>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center min-h-[36px]">
              <span
                className="text-sm"
                style={{ color: t.textPrimary, fontFamily: t.mono }}
              >
                {typedText.slice(0, typedChars)}
              </span>
              {!typingDone && (
                <span
                  className="inline-block w-[2px] h-4 ml-0.5 animate-pulse"
                  style={{ backgroundColor: t.accent }}
                />
              )}
            </div>
            {typingDone && (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: [1, 1.1, 1], opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: t.accent }}
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </motion.button>
            )}
          </div>
        </div>

        {/* Cascade Steps */}
        <div className="px-4 py-3 space-y-2">
          {cascadeSteps.map((step, i) => (
            <CascadeStep
              key={i}
              step={step}
              isVisible={visibleSteps[i]}
              isComplete={completedSteps[i]}
            />
          ))}
        </div>

        {/* Prep Doc Card */}
        {showPrepDoc && (
          <div className="px-4 pb-4">
            <PrepDocCard visible={showPrepDoc} />
          </div>
        )}
      </motion.div>

      {/* Slack Toast */}
      <SlackToast visible={showSlack} />
    </motion.div>
  );
}

/* ─── Dot Grid Background ─── */
function Atmosphere() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `radial-gradient(${t.textSecondary} 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />
      {/* Violet glow top-right */}
      <div
        className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full"
        style={{
          background: `radial-gradient(circle, ${t.accentGlow} 0%, transparent 70%)`,
        }}
      />
      {/* Violet glow bottom-left */}
      <div
        className="absolute -bottom-48 -left-32 w-[500px] h-[500px] rounded-full"
        style={{
          background: `radial-gradient(circle, ${t.accentGlow} 0%, transparent 70%)`,
        }}
      />
    </div>
  );
}

/* ─── Main Hero Component ─── */
export default function HeroSectionV11() {
  const [cycleKey, setCycleKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { amount: 0.3 });
  const prefersReducedMotion = useReducedMotion();

  // Loop: restart after 10.8s
  useEffect(() => {
    if (prefersReducedMotion || !isInView) return;

    const timer = setTimeout(() => {
      setCycleKey((k) => k + 1);
    }, 10800);

    return () => clearTimeout(timer);
  }, [cycleKey, isInView, prefersReducedMotion]);

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ backgroundColor: t.bg }}
    >
      <Atmosphere />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column */}
          <div className="max-w-xl">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, ...spring }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6"
              style={{
                backgroundColor: t.accentSubtle,
                border: `1px solid ${t.borderActive}`,
                color: t.accent,
              }}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ backgroundColor: t.accent }}
                />
                <span
                  className="relative inline-flex rounded-full h-2 w-2"
                  style={{ backgroundColor: t.accent }}
                />
              </span>
              Now in Early Access
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, ...spring }}
              className="text-4xl lg:text-5xl xl:text-6xl font-bold leading-[1.1] tracking-tight"
              style={{ color: t.textPrimary }}
            >
              Type a command.
              <br />
              <span
                style={{
                  background: `linear-gradient(135deg, ${t.accent}, #A78BFA, #818CF8)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Watch AI prepare your deal.
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, ...spring }}
              className="mt-5 text-base lg:text-lg leading-relaxed"
              style={{ color: t.textSecondary }}
            >
              One command triggers AI agents that search your calendar, pull deal
              context, research contacts, and generate a full meeting prep — in
              seconds.
            </motion.p>

            {/* CTA Row */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, ...spring }}
              className="flex flex-wrap items-center gap-3 mt-8"
            >
              <a
                href="/waitlist"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110"
                style={{
                  background: `linear-gradient(135deg, ${t.accent}, #8B5CF6)`,
                  boxShadow: `0 4px 24px rgba(108,92,231,0.35)`,
                }}
              >
                Get Early Access
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all hover:brightness-125"
                style={{
                  color: t.textSecondary,
                  border: `1px solid ${t.border}`,
                }}
              >
                See how it works
              </a>
            </motion.div>

            {/* Trust Signals */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="flex flex-wrap items-center gap-3 mt-8"
            >
              {[
                { icon: Zap, label: '5 min setup' },
                { icon: CreditCard, label: 'No credit card' },
                { icon: Clock, label: 'First prep in 60s' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    color: t.textTertiary,
                  }}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right Column — Demo */}
          <div className="max-w-xl mx-auto lg:mx-0 w-full">
            {prefersReducedMotion ? (
              <StaticDemo />
            ) : (
              <QuickAddDemo key={cycleKey} cycleKey={cycleKey} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Static state for reduced motion ─── */
function StaticDemo() {
  return (
    <div className="relative">
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: t.bgCard,
          border: `1px solid ${t.border}`,
          boxShadow: `0 0 60px ${t.accentGlow}, 0 24px 48px rgba(0,0,0,0.5)`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${t.border}` }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${t.accent}, #8B5CF6)` }}
            >
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium" style={{ color: t.textPrimary }}>
              60 Copilot
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.textTertiary }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.textTertiary }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.textTertiary }} />
          </div>
        </div>

        {/* Input (fully typed) */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${t.border}` }}>
          <div className="flex items-center gap-2">
            <span className="text-sm flex-1" style={{ color: t.textPrimary, fontFamily: t.mono }}>
              {typedText}
            </span>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: t.accent }}
            >
              <Send className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
        </div>

        {/* All steps complete */}
        <div className="px-4 py-3 space-y-2">
          {cascadeSteps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                style={{ backgroundColor: t.bgElevated }}
              >
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: t.successGlow }}
                >
                  <Check className="w-3.5 h-3.5" style={{ color: t.success }} />
                </div>
                <span
                  className="text-xs"
                  style={{ color: t.textPrimary, fontFamily: t.mono }}
                >
                  {step.done}
                </span>
              </div>
            );
          })}
        </div>

        {/* Prep Doc */}
        <div className="px-4 pb-4">
          <PrepDocCard visible />
        </div>
      </div>

      {/* Slack Toast (static) */}
      <div
        className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg absolute -bottom-3 -right-2"
        style={{
          backgroundColor: t.bgElevated,
          border: `1px solid ${t.borderActive}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <MessageSquare className="w-3.5 h-3.5" style={{ color: t.accent }} />
        <span className="text-[11px]" style={{ color: t.textSecondary, fontFamily: t.mono }}>
          Slack digest sent → <span style={{ color: t.accent }}>#sales-prep</span>
        </span>
      </div>
    </div>
  );
}
