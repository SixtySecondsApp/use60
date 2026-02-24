import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, useInView, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, Sparkles, Zap, Shield, Check, Clock,
  MessageSquare, Database, Mail, AlertTriangle, Play,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   use60 Hero V8
   Layout:   Full landing page section (hero + how it works)
   Hero copy/CTA:   V7 concept — bold sans-serif, white primary button
   Hero panel:      V6 AgentDemo — email draft, approve bar, floating badges
   Atmosphere:      V6 grain + glow + dot grid
   How It Works:    V6 step cards with StepVisual animations
   ═══════════════════════════════════════════════════════════════ */

// ─── Design Tokens ──────────────────────────────────────────
const tokens = {
  bg:            '#06060C',
  bgSurface:     '#0D0D18',
  bgCard:        '#0F0F1A',
  bgElevated:    '#141428',
  border:        'rgba(255,255,255,0.08)',
  borderActive:  'rgba(79,124,255,0.25)',
  accent:        '#4F7CFF',
  accentGlow:    'rgba(79,124,255,0.12)',
  success:       '#34D399',
  successGlow:   'rgba(52,211,153,0.12)',
  warning:       '#FBBF24',
  warningGlow:   'rgba(251,191,36,0.12)',
  textPrimary:   '#F1F1F3',
  textSecondary: '#8B8B9E',
  textTertiary:  '#4E4E6A',
};

const monoFont = "'JetBrains Mono', 'SF Mono', monospace";
const bodyFont = "-apple-system, 'Segoe UI', sans-serif";

// ─── Agent Demo Data ─────────────────────────────────────────
const AGENT_STEPS = [
  { id: 'call',    icon: '📞', label: 'Call ended',               detail: 'Sarah Chen, Acme Corp — 32 min', delay: 400,  status: 'done' },
  { id: 'actions', icon: '📋', label: 'Extracting action items',  detail: '4 items found',                  delay: 1800, status: 'done' },
  { id: 'crm',     icon: '🔄', label: 'Updating HubSpot',         detail: 'Deal record + timeline',         delay: 3200, status: 'done' },
  { id: 'email',   icon: '✉️', label: 'Drafting follow-up email', detail: 'Personalised to Sarah',          delay: 4800, status: 'typing' },
  { id: 'slack',   icon: '💬', label: 'Posting to #sales-team',   detail: 'Summary + action items',         delay: 8200, status: 'done' },
  { id: 'flag',    icon: '⚠️', label: 'Deal risk flagged',        detail: 'Budget approval is a blocker',   delay: 9600, status: 'warning' },
];

const EMAIL_LINES = [
  'Hi Sarah,',
  '',
  'Thanks for the call today. As discussed,',
  "I've attached the ROI calculator configured",
  'for your 200-seat deployment. The pricing',
  'breakdown reflects the multi-year discount',
  'we talked through.',
  '',
  "I'll circle back on the Q2 budget timeline",
  'next Tuesday as agreed.',
];

const TRUST_LOGOS = ['HubSpot', 'Fathom', 'Slack', 'Apollo', 'Instantly'];

// ─── Atmosphere ───────────────────────────────────────────────
function Atmosphere() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Dot grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
        backgroundSize: '32px 32px',
        opacity: 0.4,
      }} />
      {/* Primary glow — top right */}
      <div className="absolute" style={{
        top: '-20%', right: '-10%', width: '60vw', height: '60vw', maxWidth: 800, maxHeight: 800,
        background: `radial-gradient(circle, ${tokens.accentGlow} 0%, transparent 70%)`,
        filter: 'blur(60px)',
      }} />
      {/* Secondary glow — bottom left */}
      <div className="absolute" style={{
        bottom: '-15%', left: '-5%', width: '40vw', height: '40vw', maxWidth: 600, maxHeight: 600,
        background: 'radial-gradient(circle, rgba(52,211,153,0.05) 0%, transparent 70%)',
        filter: 'blur(80px)',
      }} />
      {/* Grain */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
        opacity: 0.4,
      }} />
      {/* Particles */}
      {!prefersReducedMotion && Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${15 + (i * 7) % 70}%`,
            top: `${10 + (i * 11) % 80}%`,
            width: (i % 3) + 1,
            height: (i % 3) + 1,
            backgroundColor: `rgba(79,124,255,${0.1 + (i % 3) * 0.1})`,
          }}
          animate={{ y: [0, -30 - (i % 3) * 10, 0], opacity: [0, 0.6, 0] }}
          transition={{ duration: 12 + (i % 4) * 2, repeat: Infinity, delay: i * 0.8, ease: 'easeInOut' }}
        />
      ))}
      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32" style={{
        background: `linear-gradient(to top, ${tokens.bg}, transparent)`,
      }} />
    </div>
  );
}

// ─── Agent Step Row ──────────────────────────────────────────
function AgentStep({ step, isVisible }: { step: typeof AGENT_STEPS[0]; isVisible: boolean; index: number }) {
  const statusStyles: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    done:    { bg: tokens.successGlow, color: tokens.success,         icon: <Check size={10} strokeWidth={3} /> },
    typing:  { bg: tokens.accentGlow,  color: tokens.accent,          icon: <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: tokens.accent }} /> },
    warning: { bg: tokens.warningGlow, color: tokens.warning,         icon: <AlertTriangle size={10} /> },
    pending: { bg: 'rgba(255,255,255,0.05)', color: tokens.textTertiary, icon: <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: tokens.textTertiary }} /> },
  };
  const s = statusStyles[step.status] ?? statusStyles.pending;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-3 py-1.5"
    >
      <span className="text-sm flex-shrink-0 w-5 text-center">{step.icon}</span>
      <span className="text-sm flex-shrink-0" style={{ color: tokens.textPrimary, fontFamily: bodyFont, fontWeight: 500 }}>
        {step.label}
      </span>
      <span className="flex-1 border-b border-dotted" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
      <span className="text-xs flex-shrink-0" style={{ color: tokens.textTertiary, fontFamily: monoFont, fontSize: 11 }}>
        {step.detail}
      </span>
      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: s.bg, color: s.color }}>
        {s.icon}
      </span>
    </motion.div>
  );
}

// ─── Email Draft Card ────────────────────────────────────────
function EmailDraft({ isVisible, emailText }: { isVisible: boolean; emailText: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={isVisible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 16, scale: 0.97 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="mt-3 rounded-xl overflow-hidden"
      style={{ border: `1px solid ${tokens.borderActive}`, backgroundColor: 'rgba(79,124,255,0.04)' }}
    >
      <div className="px-4 py-2.5 flex items-center gap-3" style={{ borderBottom: `1px solid ${tokens.border}` }}>
        <Mail size={13} style={{ color: tokens.accent }} />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span style={{ color: tokens.textTertiary, fontFamily: monoFont, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>To:</span>
          <span style={{ color: tokens.textSecondary, fontFamily: monoFont, fontSize: 11 }}>sarah.chen@acme.com</span>
        </div>
        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: tokens.accentGlow, color: tokens.accent, fontFamily: monoFont, fontSize: 10 }}>DRAFT</span>
      </div>
      <div className="px-4 py-2" style={{ borderBottom: `1px solid ${tokens.border}` }}>
        <span style={{ color: tokens.textTertiary, fontFamily: monoFont, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Subject: </span>
        <span style={{ color: tokens.textPrimary, fontFamily: bodyFont, fontSize: 12, fontWeight: 500 }}>
          Great chat — ROI calculator + next steps
        </span>
      </div>
      <div className="px-4 py-3" style={{ minHeight: 100 }}>
        <pre style={{ color: tokens.textSecondary, fontFamily: bodyFont, fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0 }}>
          {emailText}
          <span className="inline-block w-0.5 h-3.5 ml-0.5 animate-pulse" style={{ backgroundColor: tokens.accent, verticalAlign: 'text-bottom' }} />
        </pre>
      </div>
    </motion.div>
  );
}

// ─── Agent Demo Panel ─────────────────────────────────────────
function AgentDemo() {
  const [visibleSteps, setVisibleSteps] = useState<string[]>([]);
  const [showEmail, setShowEmail] = useState(false);
  const [emailText, setEmailText] = useState('');
  const [cycleKey, setCycleKey] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, amount: 0.3 });
  const fullEmailText = useMemo(() => EMAIL_LINES.join('\n'), []);

  useEffect(() => {
    if (!isInView) return;
    if (prefersReducedMotion) {
      setVisibleSteps(AGENT_STEPS.map(s => s.id));
      setShowEmail(true);
      setEmailText(fullEmailText);
      return;
    }

    setVisibleSteps([]);
    setShowEmail(false);
    setEmailText('');
    const timers: ReturnType<typeof setTimeout>[] = [];
    let typeInterval: ReturnType<typeof setInterval> | null = null;

    AGENT_STEPS.forEach(step => {
      timers.push(setTimeout(() => setVisibleSteps(prev => [...prev, step.id]), step.delay));
    });
    timers.push(setTimeout(() => setShowEmail(true), 4800));
    timers.push(setTimeout(() => {
      let i = 0;
      typeInterval = setInterval(() => {
        if (i < fullEmailText.length) { setEmailText(fullEmailText.slice(0, i + 1)); i++; }
        else if (typeInterval) clearInterval(typeInterval);
      }, 28);
    }, 5200));
    timers.push(setTimeout(() => setCycleKey(k => k + 1), 15000));

    return () => { timers.forEach(clearTimeout); if (typeInterval) clearInterval(typeInterval); };
  }, [isInView, cycleKey, prefersReducedMotion, fullEmailText]);

  return (
    <div ref={ref} className="relative w-full max-w-xl mx-auto lg:mx-0">
      {/* Glow behind card */}
      <div className="absolute -inset-8 rounded-3xl pointer-events-none" style={{
        background: `radial-gradient(ellipse at center, ${tokens.accentGlow} 0%, transparent 70%)`,
        filter: 'blur(40px)', opacity: 0.5,
      }} />

      <motion.div
        key={cycleKey}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-2xl overflow-hidden"
        style={{
          backgroundColor: tokens.bgCard,
          border: `1px solid ${tokens.border}`,
          backdropFilter: 'blur(24px)',
          boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 24px 64px -16px rgba(0,0,0,0.6), 0 0 80px -20px ${tokens.accentGlow}`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${tokens.border}` }}>
          <div className="flex items-center gap-2.5">
            <div className="relative w-2 h-2 rounded-full" style={{ backgroundColor: tokens.accent }}>
              <div className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: tokens.accent, opacity: 0.4 }} />
            </div>
            <span style={{ fontFamily: monoFont, fontSize: 12, fontWeight: 600, color: tokens.textPrimary, letterSpacing: '0.02em' }}>@60</span>
            <span style={{ fontFamily: monoFont, fontSize: 11, color: tokens.textTertiary }}>— processing call</span>
          </div>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map(i => <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />)}
          </div>
        </div>

        {/* Steps */}
        <div className="px-5 py-4 space-y-0.5">
          {AGENT_STEPS.map((step, i) => (
            <AgentStep key={step.id} step={step} index={i} isVisible={visibleSteps.includes(step.id)} />
          ))}
        </div>

        {/* Email draft */}
        <div className="px-5 pb-5">
          <EmailDraft isVisible={showEmail} emailText={emailText} />
        </div>

        {/* Action bar */}
        <AnimatePresence>
          {visibleSteps.includes('flag') && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="px-5 py-3 flex items-center gap-2"
              style={{ borderTop: `1px solid ${tokens.border}`, backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <button className="px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all hover:scale-105" style={{
                backgroundColor: tokens.accent, color: '#fff', fontFamily: bodyFont,
                boxShadow: `0 0 20px ${tokens.accentGlow}`,
              }}>
                <Check size={12} /> Approve & Send
              </button>
              <button className="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5" style={{
                border: `1px solid ${tokens.border}`, color: tokens.textSecondary, fontFamily: bodyFont,
              }}>
                Edit First
              </button>
              <button className="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5 ml-auto" style={{
                color: tokens.textTertiary, fontFamily: bodyFont,
              }}>
                View Full Summary →
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Shimmer line */}
        <div className="h-px w-full overflow-hidden" style={{ backgroundColor: tokens.border }}>
          <motion.div
            className="h-full w-1/3"
            style={{ background: `linear-gradient(90deg, transparent, ${tokens.accent}40, transparent)` }}
            animate={{ x: ['-100%', '400%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      </motion.div>

      {/* Floating: HubSpot Updated */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="hidden xl:flex absolute -right-16 top-8 items-center gap-2.5 px-3 py-2 rounded-xl"
        style={{ backgroundColor: tokens.bgElevated, border: 'solid 1px rgba(52,211,153,0.15)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
      >
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: tokens.successGlow }}>
          <Database size={11} style={{ color: tokens.success }} />
        </div>
        <div>
          <div style={{ fontFamily: bodyFont, fontSize: 11, fontWeight: 600, color: tokens.textPrimary }}>HubSpot Updated</div>
          <div style={{ fontFamily: monoFont, fontSize: 9, color: tokens.textTertiary }}>Deal: Acme Corp • £42k</div>
        </div>
      </motion.div>

      {/* Floating: Slack Posted */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 2.2, duration: 0.6 }}
        className="hidden xl:flex absolute -left-14 bottom-32 items-center gap-2.5 px-3 py-2 rounded-xl"
        style={{ backgroundColor: tokens.bgElevated, border: '1px solid rgba(79,124,255,0.15)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
      >
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: tokens.accentGlow }}>
          <MessageSquare size={11} style={{ color: tokens.accent }} />
        </div>
        <div>
          <div style={{ fontFamily: bodyFont, fontSize: 11, fontWeight: 600, color: tokens.textPrimary }}>Slack Posted</div>
          <div style={{ fontFamily: monoFont, fontSize: 9, color: tokens.textTertiary }}>#sales-team • 4 items</div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Stats Row ────────────────────────────────────────────────
function CountUp({ target, suffix = '', isDecimal = false, isActive = false, delay = 0 }: {
  target: number; suffix?: string; isDecimal?: boolean; isActive?: boolean; delay?: number;
}) {
  const [value, setValue] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  useEffect(() => {
    if (!isActive) return;
    if (prefersReducedMotion) { setValue(target); return; }
    const t = setTimeout(() => {
      let start: number | null = null;
      const step = (ts: number) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / 1800, 1);
        setValue((1 - Math.pow(1 - p, 4)) * target);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(t);
  }, [isActive, target, delay, prefersReducedMotion]);
  return (
    <span className="text-3xl font-bold tracking-tight text-white tabular-nums">
      {isDecimal ? value.toFixed(1) : Math.floor(value)}{suffix}
    </span>
  );
}

function StatsRow() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const stats = [
    { value: 2.1, suffix: 'hrs', label: 'Saved per rep, per day', isDecimal: true },
    { value: 47,  suffix: '%',   label: 'Of follow-ups never sent on time' },
    { value: 3.2, suffix: 'x',   label: 'Pipeline velocity increase', isDecimal: true },
  ];
  return (
    <div ref={ref} className="mt-12 grid grid-cols-3 gap-4 max-w-lg">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.0 + i * 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <CountUp target={stat.value} suffix={stat.suffix} isDecimal={stat.isDecimal} isActive={isInView} delay={i * 200} />
          <div className="text-xs mt-1 leading-snug" style={{ color: tokens.textTertiary }}>{stat.label}</div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Trust Bar ────────────────────────────────────────────────
function TrustBar() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : {}}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="pt-8 pb-6"
      style={{ borderTop: `1px solid ${tokens.border}` }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <span style={{ fontFamily: monoFont, fontSize: 11, color: tokens.textTertiary, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
            Integrates with
          </span>
          <div className="flex items-center gap-8">
            {TRUST_LOGOS.map((name, i) => (
              <motion.span
                key={name}
                initial={{ opacity: 0, y: 8 }}
                animate={isInView ? { opacity: 0.4, y: 0 } : {}}
                whileHover={{ opacity: 0.9 }}
                transition={{ delay: 0.6 + i * 0.1, duration: 0.4 }}
                className="cursor-default font-semibold text-sm tracking-tight"
                style={{ color: tokens.textPrimary }}
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

// ─── Step Visuals ─────────────────────────────────────────────
function StepVisual({ type, accent }: { type: string; accent: string }) {
  if (type === 'connect') {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: 120, height: 120 }}>
          <motion.div
            className="absolute w-12 h-12 rounded-xl flex items-center justify-center z-10"
            style={{ left: 36, top: 36, backgroundColor: `${accent}15`, border: `1px solid ${accent}30` }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Zap size={20} style={{ color: accent }} />
          </motion.div>
          {['H', 'F', 'S'].map((letter, i) => {
            const angle = (i * 120 - 90) * (Math.PI / 180);
            const radius = 52;
            return (
              <motion.div
                key={letter}
                className="absolute w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  left: Math.cos(angle) * radius + 44,
                  top: Math.sin(angle) * radius + 44,
                  backgroundColor: tokens.bgElevated,
                  border: `1px solid ${tokens.border}`,
                  fontFamily: monoFont, fontSize: 11, fontWeight: 700, color: tokens.textSecondary,
                }}
                animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.4, ease: 'easeInOut' }}
              >
                {letter}
              </motion.div>
            );
          })}
          <svg className="absolute" style={{ inset: -8, width: 136, height: 136 }} viewBox="-68 -68 136 136">
            {[0, 120, 240].map(deg => {
              const rad = ((deg - 90) * Math.PI) / 180;
              return (
                <line key={deg} x1="0" y1="0" x2={Math.cos(rad) * 52} y2={Math.sin(rad) * 52}
                  stroke={accent} strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
              );
            })}
          </svg>
        </div>
      </div>
    );
  }

  if (type === 'learn') {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: 160, height: 96 }}>
          {Array.from({ length: 8 }).map((_, i) => {
            const col = i < 3 ? 0 : i < 5 ? 1 : 2;
            const rowOffset = i < 3 ? i : i < 5 ? (i - 3) + 0.5 : i - 5;
            const x = col * 64;
            const y = col === 0 ? rowOffset * 36 : col === 1 ? rowOffset * 48 + 8 : rowOffset * 32 + 8;
            return (
              <motion.div
                key={i}
                className="absolute w-3 h-3 rounded-full"
                style={{ left: x, top: y, backgroundColor: `${accent}30`, border: `1px solid ${accent}50` }}
                animate={{ scale: [1, 1.3, 1], backgroundColor: [`${accent}20`, `${accent}50`, `${accent}20`] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  if (type === 'approve') {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
          <div className="w-48 rounded-xl overflow-hidden" style={{ backgroundColor: tokens.bgElevated, border: `1px solid ${tokens.border}` }}>
            <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${tokens.border}` }}>
              <Mail size={10} style={{ color: accent }} />
              <span style={{ fontFamily: monoFont, fontSize: 9, color: tokens.textTertiary }}>Follow-up ready</span>
            </div>
            <div className="p-3">
              <div className="h-2 w-3/4 rounded mb-1.5" style={{ backgroundColor: `${tokens.textTertiary}20` }} />
              <div className="h-2 w-1/2 rounded mb-3" style={{ backgroundColor: `${tokens.textTertiary}15` }} />
              <motion.div
                className="flex items-center justify-center gap-1.5 py-1.5 rounded-md cursor-pointer"
                style={{ backgroundColor: `${accent}15`, border: `1px solid ${accent}30` }}
                whileHover={{ scale: 1.03 }}
              >
                <Check size={10} style={{ color: accent }} />
                <span style={{ fontFamily: bodyFont, fontSize: 10, fontWeight: 600, color: accent }}>Approve</span>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return null;
}

// ─── How It Works ─────────────────────────────────────────────
const HOW_IT_WORKS_STEPS = [
  {
    num: '01', visual: 'connect', accent: tokens.accent,
    title: 'Connect Your Stack',
    description: 'Link HubSpot, Fathom, and Slack. use60 starts ingesting your call data and CRM context immediately. Setup takes under 5 minutes.',
  },
  {
    num: '02', visual: 'learn', accent: tokens.success,
    title: 'Your AI Learns the Deals',
    description: 'use60 maps every deal, learns your follow-up patterns, and builds context from your entire history. Within 24 hours, it knows your pipeline better than you do.',
  },
  {
    num: '03', visual: 'approve', accent: '#A78BFA',
    title: 'Review, Approve, Close',
    description: 'Every follow-up, CRM update, and deal alert — queued for your review. One click to approve. Your AI handles the rest while you focus on selling.',
  },
];

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section id="how-it-works" ref={ref} className="relative py-32" style={{ backgroundColor: tokens.bg }}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24" style={{
        background: `linear-gradient(to bottom, transparent, ${tokens.border}, transparent)`,
      }} />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="text-xs font-medium tracking-widest uppercase" style={{ color: tokens.accent, fontFamily: monoFont }}>
            How It Works
          </span>
          <h2 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
            From call to closed in<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400">
              three steps
            </span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {HOW_IT_WORKS_STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
              style={{ backgroundColor: tokens.bgSurface, border: `1px solid ${tokens.border}` }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = `${step.accent}33`;
                (e.currentTarget as HTMLElement).style.boxShadow = `0 0 40px ${step.accent}10`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = tokens.border;
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              {/* Visual area */}
              <div className="relative h-48 overflow-hidden" style={{ background: `linear-gradient(135deg, ${step.accent}08, transparent)` }}>
                <StepVisual type={step.visual} accent={step.accent} />
                <div className="absolute top-4 right-4" style={{ fontFamily: monoFont, fontSize: 64, fontWeight: 700, color: `${step.accent}10`, lineHeight: 1 }}>
                  {step.num}
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: `${step.accent}15` }}>
                    <span style={{ fontFamily: monoFont, fontSize: 10, fontWeight: 700, color: step.accent }}>{step.num}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{step.title}</h3>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: tokens.textSecondary }}>{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  HERO SECTION
// ═══════════════════════════════════════════════════════════════
export default function HeroSectionV8() {
  const prefersReducedMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <div style={{ backgroundColor: tokens.bg }}>
      {/* ─── ABOVE FOLD ─── */}
      <section className="relative overflow-hidden" style={{ backgroundColor: tokens.bg }}>
        <Atmosphere />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 pt-24 lg:pt-32 pb-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* Left: Copy */}
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-xl">

              {/* Badge */}
              <motion.div variants={itemVariants}>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 mb-8">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                  <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Now in Early Access</span>
                </div>
              </motion.div>

              {/* Headline */}
              <motion.h1 variants={itemVariants} className="text-5xl sm:text-6xl font-bold text-white leading-[1.08] tracking-tight mb-6">
                Your AI already <br />
                sat in the meeting. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400">
                  Now watch it work.
                </span>
              </motion.h1>

              {/* Sub */}
              <motion.p variants={itemVariants} className="text-lg text-gray-400 leading-relaxed mb-10 max-w-lg">
                use60 turns your sales calls into closed deals — automatically drafting follow-ups,
                updating your CRM, and surfacing what needs attention.
              </motion.p>

              {/* CTAs */}
              <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3 mb-10">
                <button className="group relative inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-gray-900 font-bold text-sm transition-all hover:scale-[1.03] active:scale-[0.98] shadow-[0_0_24px_rgba(255,255,255,0.25)]">
                  <span>Get Early Access</span>
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                </button>
                <button className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-medium text-sm transition-all hover:bg-white/5" style={{ border: `1px solid ${tokens.border}`, color: tokens.textSecondary }}>
                  <Play size={14} />
                  <span>Watch it Work</span>
                </button>
              </motion.div>

              {/* Trust signals */}
              <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-5">
                {[
                  { icon: Clock,  text: 'Setup in 5 min' },
                  { icon: Shield, text: 'No credit card' },
                  { icon: Zap,    text: 'SOC 2 compliant' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-1.5">
                    <Icon size={13} style={{ color: tokens.textTertiary }} />
                    <span className="text-xs font-medium" style={{ color: tokens.textTertiary }}>{text}</span>
                  </div>
                ))}
              </motion.div>

              {/* Stats */}
              <StatsRow />
            </motion.div>

            {/* Right: Agent Demo */}
            <div className="hidden lg:block">
              <AgentDemo />
            </div>
          </div>
        </div>

        <TrustBar />
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <HowItWorks />
    </div>
  );
}
