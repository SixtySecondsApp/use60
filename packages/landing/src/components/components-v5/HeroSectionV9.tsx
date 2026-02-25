import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, Play, Clock, Shield, Zap,
  Calendar, FileText, Mail, Check, Square,
  TrendingUp, AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   use60 Hero V9 — Midnight Violet + Living Bento Grid
   Full dark: zinc-950 base, violet accent, centered layout
   4 independent glass cards animating in parallel
   ═══════════════════════════════════════════════════════════════ */

// ─── Design Tokens ────────────────────────────────────────────
const t = {
  bg:             '#09090b',
  surface:        'rgba(255,255,255,0.03)',
  border:         'rgba(255,255,255,0.08)',
  borderSubtle:   'rgba(255,255,255,0.05)',

  textPrimary:    '#FAFAFA',
  textSecondary:  '#A1A1AA',
  textTertiary:   '#52525B',
  textMuted:      '#3F3F46',

  violet:         '#8B5CF6',
  violetLight:    '#A78BFA',
  violetSoft:     'rgba(139,92,246,0.12)',
  violetBorder:   'rgba(139,92,246,0.20)',

  cyan:           '#22D3EE',
  cyanSoft:       'rgba(34,211,238,0.10)',

  emerald:        '#34D399',
  emeraldSoft:    'rgba(52,211,153,0.10)',

  warning:        '#FBBF24',
  warningSoft:    'rgba(251,191,36,0.10)',

  blue:           '#60A5FA',
  blueSoft:       'rgba(96,165,250,0.10)',
};

const mono = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";

// ─── Glass Card Shell ────────────────────────────────────────
function GlassCard({
  children, delay = 0, className = '',
}: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{
        backgroundColor: t.surface,
        border: `1px solid ${t.border}`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {children}
    </motion.div>
  );
}

function CardHeader({ icon: Icon, title, statusColor, statusLabel }: {
  icon: LucideIcon; title: string; statusColor: string; statusLabel: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${t.borderSubtle}` }}>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${statusColor}15` }}>
        <Icon size={12} style={{ color: statusColor }} />
      </div>
      <span className="text-xs font-semibold" style={{ color: t.textPrimary }}>{title}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="relative w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }}>
          <div className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: statusColor, opacity: 0.4 }} />
        </div>
        <span style={{ fontFamily: mono, fontSize: 9, color: t.textTertiary, letterSpacing: '0.04em' }}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Card 1: Meeting Brief (typing animation) ───────────────
const BRIEF_LINES = [
  { text: 'Acme Corp · Renewal Call', style: 'heading' as const },
  { text: '' },
  { text: 'Account: £128k ARR · 14 months' },
  { text: 'Champion: Sarah Chen, VP Ops' },
  { text: '' },
  { text: '⚠ Risk: NPS dropped 22pts last qtr' },
  { text: '' },
  { text: 'Talking points:' },
  { text: '1. Address Q3 support backlog' },
  { text: '2. Present automation ROI data' },
  { text: '3. Propose 2-year lock at £118k' },
];

function MeetingBriefCard() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [cursorLine, setCursorLine] = useState(0);
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, amount: 0.3 });

  useEffect(() => {
    if (!isInView) return;
    if (prefersReduced) { setVisibleLines(BRIEF_LINES.length); return; }

    setVisibleLines(0);
    setCursorLine(0);
    const timers: ReturnType<typeof setTimeout>[] = [];

    BRIEF_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setVisibleLines(i + 1);
        setCursorLine(i);
      }, 800 + i * 400));
    });

    // Loop
    timers.push(setTimeout(() => {
      setVisibleLines(0);
      setCursorLine(0);
    }, 800 + BRIEF_LINES.length * 400 + 4000));

    return () => timers.forEach(clearTimeout);
  }, [isInView, prefersReduced]);

  // Re-trigger loop
  useEffect(() => {
    if (!isInView || prefersReduced) return;
    if (visibleLines === 0) {
      const timer = setTimeout(() => {
        // restart
        let i = 0;
        const interval = setInterval(() => {
          if (i < BRIEF_LINES.length) {
            setVisibleLines(i + 1);
            setCursorLine(i);
            i++;
          } else {
            clearInterval(interval);
            setTimeout(() => { setVisibleLines(0); setCursorLine(0); }, 4000);
          }
        }, 400);
        return () => clearInterval(interval);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [visibleLines, isInView, prefersReduced]);

  return (
    <GlassCard delay={0.5}>
      <CardHeader icon={FileText} title="Meeting Brief" statusColor={t.violet} statusLabel="GENERATING" />
      <div ref={ref} className="px-4 py-3 space-y-0.5" style={{ minHeight: 200 }}>
        {BRIEF_LINES.slice(0, visibleLines).map((line, i) => (
          <div key={i} className="flex items-center">
            <span
              className={line.style === 'heading' ? 'text-xs font-semibold' : 'text-xs'}
              style={{
                color: line.text.startsWith('⚠') ? t.warning : (line.style === 'heading' ? t.textPrimary : t.textSecondary),
                fontFamily: line.style === 'heading' ? undefined : mono,
                fontSize: line.style === 'heading' ? 13 : 11,
                lineHeight: '1.7',
              }}
            >
              {line.text}
            </span>
            {i === cursorLine && visibleLines < BRIEF_LINES.length && (
              <span className="inline-block w-0.5 h-3 ml-0.5 animate-pulse" style={{ backgroundColor: t.violet }} />
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// ─── Card 2: Deal Intelligence (score animation) ────────────
function DealIntelCard() {
  const [score, setScore] = useState(0);
  const [signals, setSignals] = useState(0);
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, amount: 0.3 });

  const targetScore = 72;
  const dealSignals = [
    { label: 'Champion engaged', positive: true },
    { label: 'NPS declining', positive: false },
    { label: 'Usage up 18%', positive: true },
    { label: 'Competitor mentioned', positive: false },
    { label: 'Budget approved', positive: true },
  ];

  useEffect(() => {
    if (!isInView) return;
    if (prefersReduced) { setScore(targetScore); setSignals(dealSignals.length); return; }

    setScore(0);
    setSignals(0);

    // Animate score
    let start: number | null = null;
    let raf: number;
    const animateScore = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 2000, 1);
      setScore(Math.floor((1 - Math.pow(1 - p, 3)) * targetScore));
      if (p < 1) raf = requestAnimationFrame(animateScore);
    };
    const scoreTimer = setTimeout(() => {
      raf = requestAnimationFrame(animateScore);
    }, 1200);

    // Animate signals
    const signalTimers = dealSignals.map((_, i) =>
      setTimeout(() => setSignals(i + 1), 1800 + i * 600)
    );

    // Loop
    const loopTimer = setTimeout(() => {
      setScore(0);
      setSignals(0);
    }, 1800 + dealSignals.length * 600 + 4000);

    return () => {
      clearTimeout(scoreTimer);
      clearTimeout(loopTimer);
      signalTimers.forEach(clearTimeout);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isInView, prefersReduced]);

  const scoreColor = score >= 70 ? t.emerald : score >= 40 ? t.warning : '#EF4444';

  return (
    <GlassCard delay={0.65}>
      <CardHeader icon={TrendingUp} title="Deal Intelligence" statusColor={t.cyan} statusLabel="ANALYZING" />
      <div ref={ref} className="px-4 py-3" style={{ minHeight: 200 }}>
        {/* Deal name + value */}
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-xs font-semibold" style={{ color: t.textPrimary }}>Acme Corp</span>
          <span className="text-xs tabular-nums font-semibold" style={{ color: t.textPrimary }}>£128k</span>
        </div>

        {/* Score bar */}
        <div className="mb-1.5">
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontFamily: mono, fontSize: 10, color: t.textTertiary }}>Health Score</span>
            <span className="tabular-nums font-bold text-sm" style={{ color: scoreColor }}>{score}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: scoreColor }}
              animate={{ width: `${(score / 100) * 100}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Score change */}
        <div className="flex items-center gap-1 mb-3">
          <TrendingUp size={10} style={{ color: t.emerald }} />
          <span style={{ fontFamily: mono, fontSize: 9, color: t.emerald }}>+8 pts this week</span>
        </div>

        {/* Signals */}
        <div className="space-y-1.5">
          <span style={{ fontFamily: mono, fontSize: 9, color: t.textTertiary, letterSpacing: '0.05em' }}>SIGNALS</span>
          {dealSignals.slice(0, signals).map((sig, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2"
            >
              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: sig.positive ? t.emerald : t.warning }} />
              <span style={{ fontSize: 11, color: sig.positive ? t.textSecondary : t.warning }}>
                {sig.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Card 3: Follow-Up Email Draft (typing) ─────────────────
const EMAIL_CHARS = `Hi Sarah,

Thanks for the call today. As discussed, I've attached the ROI calculator for your 200-seat deployment.

Next steps:
• ROI breakdown by Tuesday
• Budget approval meeting
• Technical review w/ your team`;

function FollowUpCard() {
  const [charIndex, setCharIndex] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, amount: 0.3 });

  useEffect(() => {
    if (!isInView) return;
    if (prefersReduced) { setCharIndex(EMAIL_CHARS.length); setShowActions(true); return; }

    setCharIndex(0);
    setShowActions(false);

    const startTimer = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        if (i < EMAIL_CHARS.length) {
          setCharIndex(i + 1);
          i++;
        } else {
          clearInterval(interval);
          setShowActions(true);
          // Loop after pause
          setTimeout(() => { setCharIndex(0); setShowActions(false); }, 5000);
        }
      }, 18);
      return () => clearInterval(interval);
    }, 1600);

    return () => clearTimeout(startTimer);
  }, [isInView, prefersReduced]);

  return (
    <GlassCard delay={0.8}>
      <CardHeader icon={Mail} title="Follow-Up Draft" statusColor={t.emerald} statusLabel="COMPOSING" />
      <div ref={ref} className="px-4 py-3 flex flex-col" style={{ minHeight: 200 }}>
        {/* Email header */}
        <div className="flex items-center gap-2 mb-2 pb-2" style={{ borderBottom: `1px solid ${t.borderSubtle}` }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: t.textTertiary }}>TO:</span>
          <span style={{ fontSize: 11, color: t.textSecondary }}>sarah.chen@acme.com</span>
        </div>

        {/* Email body */}
        <div className="flex-1 min-h-0">
          <pre style={{
            color: t.textSecondary, fontSize: 11, lineHeight: 1.6,
            whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit',
          }}>
            {EMAIL_CHARS.slice(0, charIndex)}
            {charIndex < EMAIL_CHARS.length && (
              <span className="inline-block w-0.5 h-3 ml-px animate-pulse" style={{ backgroundColor: t.emerald, verticalAlign: 'text-bottom' }} />
            )}
          </pre>
        </div>

        {/* Actions */}
        {showActions && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 mt-2 pt-2"
            style={{ borderTop: `1px solid ${t.borderSubtle}` }}
          >
            <button className="px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1" style={{
              backgroundColor: t.emerald, color: '#fff', fontSize: 10,
            }}>
              <Check size={10} /> Approve & Send
            </button>
            <button className="px-2.5 py-1 rounded-md text-xs font-medium" style={{
              border: `1px solid ${t.border}`, color: t.textTertiary, fontSize: 10,
            }}>
              Edit
            </button>
          </motion.div>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Card 4: Task Queue (checkbox animation) ────────────────
const TASKS = [
  { text: 'Send ROI calculator to Sarah', done: false },
  { text: 'Book technical review meeting', done: false },
  { text: 'Update deal forecast in CRM', done: false },
  { text: 'Prep QBR deck for Thursday', done: false },
  { text: 'Share call summary on Slack', done: false },
];

function TaskQueueCard() {
  const [completedCount, setCompletedCount] = useState(0);
  const [visibleTasks, setVisibleTasks] = useState(0);
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, amount: 0.3 });

  useEffect(() => {
    if (!isInView) return;
    if (prefersReduced) { setVisibleTasks(TASKS.length); setCompletedCount(3); return; }

    setVisibleTasks(0);
    setCompletedCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Tasks appear one by one
    TASKS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleTasks(i + 1), 1000 + i * 500));
    });

    // Then first 3 get checked off
    timers.push(setTimeout(() => setCompletedCount(1), 1000 + TASKS.length * 500 + 800));
    timers.push(setTimeout(() => setCompletedCount(2), 1000 + TASKS.length * 500 + 1400));
    timers.push(setTimeout(() => setCompletedCount(3), 1000 + TASKS.length * 500 + 2000));

    // Loop
    timers.push(setTimeout(() => {
      setVisibleTasks(0);
      setCompletedCount(0);
    }, 1000 + TASKS.length * 500 + 2000 + 4000));

    return () => timers.forEach(clearTimeout);
  }, [isInView, prefersReduced]);

  return (
    <GlassCard delay={0.95}>
      <CardHeader icon={Calendar} title="Task Queue" statusColor={t.blue} statusLabel="AUTO-CREATING" />
      <div ref={ref} className="px-4 py-3" style={{ minHeight: 200 }}>
        {/* Counter */}
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontFamily: mono, fontSize: 10, color: t.textTertiary }}>
            {completedCount}/{visibleTasks} completed
          </span>
          <span className="tabular-nums text-xs font-semibold" style={{ color: t.blue }}>
            +{visibleTasks} auto-created
          </span>
        </div>

        {/* Tasks */}
        <div className="space-y-2">
          {TASKS.slice(0, visibleTasks).map((task, i) => {
            const isDone = i < completedCount;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-start gap-2.5"
              >
                <div className="mt-0.5 flex-shrink-0">
                  {isDone ? (
                    <motion.div
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      className="w-4 h-4 rounded flex items-center justify-center"
                      style={{ backgroundColor: t.violet }}
                    >
                      <Check size={10} color="#fff" strokeWidth={3} />
                    </motion.div>
                  ) : (
                    <Square size={16} style={{ color: t.textMuted }} />
                  )}
                </div>
                <span
                  className="text-xs leading-snug"
                  style={{
                    color: isDone ? t.textTertiary : t.textSecondary,
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}
                >
                  {task.text}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Bento Grid ──────────────────────────────────────────────
function BentoDemo() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
      <MeetingBriefCard />
      <DealIntelCard />
      <FollowUpCard />
      <TaskQueueCard />
    </div>
  );
}

// ─── Stats Counter ───────────────────────────────────────────
function CountUp({
  target, suffix = '', isDecimal = false, isActive = false, delay = 0,
}: {
  target: number; suffix?: string; isDecimal?: boolean; isActive?: boolean; delay?: number;
}) {
  const [value, setValue] = useState(0);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (!isActive) return;
    if (prefersReduced) { setValue(target); return; }
    const timer = setTimeout(() => {
      let start: number | null = null;
      const step = (ts: number) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / 1600, 1);
        setValue((1 - Math.pow(1 - p, 4)) * target);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(timer);
  }, [isActive, target, delay, prefersReduced]);

  return (
    <span className="text-3xl font-bold tracking-tight tabular-nums" style={{ color: t.textPrimary }}>
      {isDecimal ? value.toFixed(1) : Math.floor(value)}{suffix}
    </span>
  );
}

// ─── Trust Bar ───────────────────────────────────────────────
const INTEGRATIONS = ['HubSpot', 'Fathom', 'Slack', 'Apollo', 'Instantly'];

function TrustBar() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : {}}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="pt-8 pb-6"
      style={{ borderTop: `1px solid ${t.border}` }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <span className="text-xs font-medium tracking-widest uppercase" style={{
            fontFamily: mono, fontSize: 11, color: t.textTertiary, letterSpacing: '0.08em',
          }}>
            Integrates with
          </span>
          <div className="flex items-center gap-8">
            {INTEGRATIONS.map((name, i) => (
              <motion.span
                key={name}
                initial={{ opacity: 0, y: 8 }}
                animate={isInView ? { opacity: 0.35, y: 0 } : {}}
                whileHover={{ opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                className="cursor-default font-semibold text-sm tracking-tight motion-reduce:transition-none"
                style={{ color: t.textSecondary }}
              >
                {name}
              </motion.span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  HERO SECTION V9 — Midnight Violet + Living Bento
// ═══════════════════════════════════════════════════════════════
export default function HeroSectionV9() {
  const prefersReduced = useReducedMotion();
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true, amount: 0.5 });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: prefersReduced ? 0 : 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
  };

  const stats = [
    { value: 2.1, suffix: 'hrs', label: 'Saved per rep daily', isDecimal: true },
    { value: 47, suffix: '%', label: 'Follow-ups sent on time' },
    { value: 3.2, suffix: 'x', label: 'Pipeline velocity lift', isDecimal: true },
  ];

  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: t.bg }}>
      {/* ─── Atmosphere ─── */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[900px] h-[600px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.08) 0%, transparent 70%)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.4]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-8 pt-32 lg:pt-44 pb-8">
        {/* ─── Centered Hero Copy ─── */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="text-center max-w-3xl mx-auto">
          {/* Badge */}
          <motion.div variants={itemVariants} className="mb-8">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full" style={{
              backgroundColor: t.violetSoft, border: `1px solid ${t.violetBorder}`,
            }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: t.violet }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: t.violet }} />
              </span>
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: t.violetLight }}>
                Now in Early Access
              </span>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={itemVariants}
            className="font-heading text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.04] tracking-tight text-balance mb-7"
            style={{
              backgroundImage: 'linear-gradient(to bottom, #FAFAFA 30%, #71717A 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Your AI teammate{' '}
            <br className="hidden sm:block" />
            that never forgets{' '}
            <br className="hidden sm:block" />
            a follow-up.
          </motion.h1>

          {/* Subhead */}
          <motion.p
            variants={itemVariants}
            className="text-lg lg:text-xl leading-relaxed text-pretty mb-10 mx-auto max-w-xl"
            style={{ color: t.textSecondary }}
          >
            60 joins every sales call, extracts what matters, updates your CRM,
            and queues follow-ups — before you finish your coffee.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <button
              className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-sm text-white transition-all hover:scale-[1.03] active:scale-[0.98] motion-reduce:transition-none"
              style={{
                backgroundColor: t.violet,
                boxShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 32px rgba(139,92,246,0.15)',
              }}
            >
              <span>Get Early Access</span>
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </button>
            <button
              className="inline-flex items-center gap-2 px-7 py-4 rounded-xl font-medium text-sm transition-all hover:bg-white/5 motion-reduce:transition-none"
              style={{ border: `1px solid ${t.border}`, color: t.textSecondary }}
            >
              <Play size={14} />
              <span>Watch Demo</span>
            </button>
          </motion.div>

          {/* Trust signals */}
          <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-center gap-5">
            {[
              { icon: Clock, text: 'Setup in 5 min' },
              { icon: Shield, text: 'No credit card' },
              { icon: Zap, text: 'SOC 2 ready' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5">
                <Icon size={13} style={{ color: t.textTertiary }} />
                <span className="text-xs font-medium" style={{ color: t.textTertiary }}>{text}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* ─── Living Bento Grid ─── */}
        <div className="mt-16 lg:mt-20">
          <BentoDemo />
        </div>

        {/* ─── Stats ─── */}
        <div ref={statsRef} className="mt-16 lg:mt-20 grid grid-cols-3 gap-6 max-w-lg mx-auto text-center">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={statsInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 1.0 + i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <CountUp target={stat.value} suffix={stat.suffix} isDecimal={stat.isDecimal} isActive={statsInView} delay={i * 180} />
              <div className="text-xs mt-1.5 leading-snug" style={{ color: t.textTertiary }}>{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>

      <TrustBar />
    </section>
  );
}
