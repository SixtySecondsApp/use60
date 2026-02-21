import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
  useInView,
  AnimatePresence,
  useReducedMotion,
} from 'framer-motion';
import {
  Check,
  ArrowRight,
  Sparkles,
  Zap,
  Clock,
  Shield,
} from 'lucide-react';

// ═══════════════════════════════════════════
// Animated Stat Counter
// ═══════════════════════════════════════════

function AnimatedStat({
  target,
  label,
  change,
  suffix = '',
  isDecimal = false,
  delay = 0,
}: {
  target: number;
  label: string;
  change: string;
  suffix?: string;
  isDecimal?: boolean;
  delay?: number;
}) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isInView) return;
    if (prefersReducedMotion) {
      setValue(target);
      return;
    }
    const timeout = setTimeout(() => {
      let start: number | null = null;
      const duration = 2000;
      const step = (ts: number) => {
        if (!start) start = ts;
        const progress = Math.min((ts - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        setValue(eased * target);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(timeout);
  }, [isInView, target, delay, prefersReducedMotion]);

  const display = isDecimal ? value.toFixed(2) : Math.floor(value).toString();

  return (
    <div ref={ref} className="p-3 rounded-xl border border-gray-700/30 bg-gray-800/20">
      <span className="text-white text-lg font-bold block tabular-nums">
        {display}{suffix}
      </span>
      <span className="text-gray-500 text-xs block mt-1">{label}</span>
      <span className="text-emerald-400 text-xs font-semibold">{change}</span>
    </div>
  );
}

// ═══════════════════════════════════════════
// Rotating Headline Words
// ═══════════════════════════════════════════

const ROTATING_WORDS = ['Closed Deals', 'Sent Proposals', 'Happy Clients', 'More Revenue'];

function RotatingWords() {
  const [index, setIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="inline-flex relative overflow-hidden align-bottom" style={{ height: '1.2em' }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={ROTATING_WORDS[index]}
          className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent absolute left-0"
          initial={prefersReducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0, rotateX: 45 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { y: '0%', opacity: 1, rotateX: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { y: '-100%', opacity: 0, rotateX: -45 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {ROTATING_WORDS[index]}
        </motion.span>
      </AnimatePresence>
      {/* Invisible placeholder to maintain width */}
      <span className="invisible">{ROTATING_WORDS[index]}</span>
    </span>
  );
}

// ═══════════════════════════════════════════
// Ambient Background
// ═══════════════════════════════════════════

function Background() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{
          top: -300, right: -200, width: 700, height: 700,
          background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
        }}
        animate={prefersReducedMotion ? {} : { x: [0, 30, -20, 0], y: [0, -20, 30, 0], scale: [1, 1.1, 0.95, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{
          bottom: -300, left: -200, width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
        }}
        animate={prefersReducedMotion ? {} : { x: [0, -30, 20, 0], y: [0, 20, -30, 0], scale: [1, 0.95, 1.1, 1] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-gray-950 to-transparent" />
    </div>
  );
}

// ═══════════════════════════════════════════
// Particle Field
// ═══════════════════════════════════════════

function ParticleField() {
  const prefersReducedMotion = useReducedMotion();
  const particles = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2 + 1,
        duration: Math.random() * 20 + 15,
        delay: Math.random() * 10,
      })),
    []
  );

  if (prefersReducedMotion) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-white/5"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          animate={{ y: [0, -40, 0], opacity: [0, 0.8, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// Dashboard Mockup
// ═══════════════════════════════════════════

const MEETINGS = [
  {
    title: 'Discovery Call - Acme Corp',
    time: '10:00 AM',
    sentiment: 'Positive',
    sentimentClasses: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    stage: 'Discovery',
    stageClasses: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  {
    title: 'Demo - TechStart Inc',
    time: '2:00 PM',
    sentiment: 'Positive',
    sentimentClasses: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    stage: 'Demo',
    stageClasses: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  {
    title: 'Negotiation - Global Ltd',
    time: '4:30 PM',
    sentiment: 'At Risk',
    sentimentClasses: 'bg-red-500/10 text-red-400 border-red-500/20',
    stage: 'Negotiation',
    stageClasses: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
];

function DashboardMockup() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const prefersReducedMotion = useReducedMotion();

  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [5, -5]), { stiffness: 100, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [-400, 400], [-5, 5]), { stiffness: 100, damping: 30 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (prefersReducedMotion) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouseX.set(e.clientX - rect.left - rect.width / 2);
      mouseY.set(e.clientY - rect.top - rect.height / 2);
    },
    [mouseX, mouseY, prefersReducedMotion]
  );

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative"
      style={{ perspective: 1200 }}
    >
      <motion.div
        style={{
          rotateX: prefersReducedMotion ? 0 : rotateX,
          rotateY: prefersReducedMotion ? 0 : rotateY,
          transformStyle: 'preserve-3d',
        }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
      >
        <div className="relative rounded-2xl overflow-hidden border border-gray-700/50 bg-gray-900/90 backdrop-blur-xl shadow-2xl">
          {/* Top Bar */}
          <div className="relative z-10 flex items-center gap-2 px-4 py-3 border-b border-gray-800/60 bg-gray-900/50">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="px-4 py-1 rounded-md bg-gray-800/60 border border-gray-700/30 text-gray-500 text-xs font-medium">
                use60.com
              </div>
            </div>
            <div className="w-12" />
          </div>

          {/* Dashboard Content */}
          <div className="relative z-10 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-lg tracking-tight">Meeting Hub</h3>
                <p className="text-gray-500 text-sm mt-1">3 meetings today</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-blue-400 text-xs font-semibold">AI Active</span>
              </div>
            </div>

            <div className="space-y-3">
              {MEETINGS.map((m, i) => (
                <motion.div
                  key={m.title}
                  className="p-4 rounded-xl border border-gray-700/30 bg-gray-800/40 hover:bg-gray-800/60 transition-colors"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <p className="text-gray-200 text-sm font-medium truncate">{m.title}</p>
                      <div className="flex gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${m.sentimentClasses}`}>
                          {m.sentiment}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${m.stageClasses}`}>
                          {m.stage}
                        </span>
                      </div>
                    </div>
                    <span className="text-gray-500 text-xs font-medium">{m.time}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <AnimatedStat target={12} label="Action Items" change="+3" delay={800} />
              <AnimatedStat target={0.72} label="Avg Sentiment" change="+0.1" isDecimal delay={1000} />
              <AnimatedStat target={42} label="Talk Time" change="Optimal" suffix="%" delay={1200} />
            </div>
          </div>
        </div>

        {/* Floating Elements */}
        {!prefersReducedMotion && (
          <>
            <motion.div
              className="absolute z-20"
              style={{ left: -32, top: 120 }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
              transition={{
                opacity: { delay: 1.5 },
                scale: { delay: 1.5, type: 'spring' },
                y: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
              }}
            >
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-900/95 border border-emerald-500/30 shadow-xl backdrop-blur-xl">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="w-4 h-4 text-emerald-400" strokeWidth={3} />
                </div>
                <span className="text-emerald-400 text-sm font-semibold">Proposal Sent</span>
              </div>
            </motion.div>

            <motion.div
              className="absolute z-20"
              style={{ right: -24, bottom: 100 }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, y: [0, 8, 0] }}
              transition={{
                opacity: { delay: 1.8 },
                scale: { delay: 1.8, type: 'spring' },
                y: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
              }}
            >
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-900/95 border border-purple-500/30 shadow-xl backdrop-blur-xl">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <span className="text-purple-300 text-sm font-semibold">AI Analyzing...</span>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Main Hero Section
// ═══════════════════════════════════════════

export default function HeroSectionV5Alt() {
  const prefersReducedMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-gray-950 flex items-center py-24 lg:py-0">
      <Background />
      <ParticleField />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* Left Column */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="max-w-2xl"
          >
            <motion.div variants={itemVariants}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="text-blue-300 text-sm font-medium">Revolutionary AI for Sales</span>
              </div>
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="mt-8 text-5xl sm:text-6xl font-extrabold text-white leading-tight tracking-tight"
            >
              Turn Meetings <br /> Into <RotatingWords />
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="mt-6 text-lg text-gray-400 leading-relaxed max-w-xl"
            >
              Seamlessly connect your Call Recorder, CRM, and Task Manager. Our AI
              auto-generates reports, proposals, and tasks for your entire team.
            </motion.p>

            <motion.div variants={itemVariants} className="mt-10 flex flex-wrap items-center gap-4">
              <button className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-gray-900 font-bold text-base transition-transform hover:scale-105 active:scale-95">
                <span>Start for Free</span>
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
              <button className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-gray-700 text-gray-300 font-bold text-base hover:bg-gray-800 transition-colors">
                Watch Demo
              </button>
            </motion.div>

            <motion.div variants={itemVariants} className="mt-12 flex flex-wrap items-center gap-6">
              {[
                { icon: Clock, label: 'Setup in 60s' },
                { icon: Shield, label: 'No credit card' },
                { icon: Zap, label: 'Early access' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-gray-500">
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right Column */}
          <div className="hidden lg:block relative">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
