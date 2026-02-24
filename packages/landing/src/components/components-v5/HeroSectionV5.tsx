import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
  useInView,
  AnimatePresence,
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

  useEffect(() => {
    if (!isInView) return;
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
  }, [isInView, target, delay]);

  const display = isDecimal ? value.toFixed(2) : Math.floor(value).toString();

  return (
    <div ref={ref} className="p-3 rounded-xl border border-gray-700/30 bg-gray-800/20">
      <span className="text-white text-lg font-bold block tabular-nums">
        {display}{suffix}
      </span>
      <span className="text-gray-500 text-[10px] block mt-0.5">{label}</span>
      <span className="text-emerald-400 text-[10px] font-semibold">{change}</span>
    </div>
  );
}

// ═══════════════════════════════════════════
// Rotating Headline Words
// ═══════════════════════════════════════════

const ROTATING_WORDS = [
  'Closed Deals',
  'Sent Proposals',
  'Happy Clients',
  'More Revenue',
];

function RotatingWords() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="inline-flex relative overflow-hidden h-[1.15em] align-bottom">
      <AnimatePresence mode="wait">
        <motion.span
          key={ROTATING_WORDS[index]}
          className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent"
          initial={{ y: '110%', opacity: 0, rotateX: 45 }}
          animate={{ y: '0%', opacity: 1, rotateX: 0 }}
          exit={{ y: '-110%', opacity: 0, rotateX: -45 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {ROTATING_WORDS[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// ═══════════════════════════════════════════
// Ambient Background
// ═══════════════════════════════════════════

function Background() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Drifting gradient orbs */}
      <motion.div
        className="absolute -top-[300px] -right-[200px] w-[700px] h-[700px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
        }}
        animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0], scale: [1, 1.1, 0.95, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-[300px] -left-[200px] w-[600px] h-[600px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
        }}
        animate={{
          x: [0, -30, 20, 0],
          y: [0, 20, -30, 0],
          scale: [1, 0.95, 1.1, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
        }}
        animate={{ scale: [1, 1.06, 0.97, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-gray-950 to-transparent" />
    </div>
  );
}

// ═══════════════════════════════════════════
// Particle Field (floating ambient dots)
// ═══════════════════════════════════════════

function ParticleField() {
  const particles = React.useMemo(
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

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-white/[0.03]"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
          }}
          animate={{ opacity: [0, 1, 0], y: [0, -30, 0] }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// Meeting Card Data
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
    title: 'Negotiation - GlobalTech',
    time: '4:00 PM',
    sentiment: 'Neutral',
    sentimentClasses: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    stage: 'Negotiation',
    stageClasses: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
];

// ═══════════════════════════════════════════
// Dashboard Mockup with 3D Tilt
// ═══════════════════════════════════════════

function DashboardMockup() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [5, -5]), {
    stiffness: 120,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(mouseX, [-400, 400], [-5, 5]), {
    stiffness: 120,
    damping: 20,
  });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouseX.set(e.clientX - rect.left - rect.width / 2);
      mouseY.set(e.clientY - rect.top - rect.height / 2);
    },
    [mouseX, mouseY]
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
      style={{ perspective: '1200px' }}
    >
      {/* Ambient glow behind the dashboard */}
      <motion.div
        className="absolute -inset-16 rounded-[60px]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.1) 0%, rgba(139,92,246,0.04) 50%, transparent 70%)',
        }}
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 3D tilt wrapper */}
      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        initial={{ opacity: 0, y: 80, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.2, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Gentle float */}
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* ── Browser Frame ── */}
          <div
            className="relative rounded-2xl overflow-hidden border border-gray-700/50
                       bg-gray-900/90 backdrop-blur-xl"
            style={{
              boxShadow: `
                0 25px 60px -12px rgba(0,0,0,0.55),
                0 0 0 1px rgba(255,255,255,0.03) inset,
                0 1px 0 rgba(255,255,255,0.04) inset
              `,
            }}
          >
            {/* Animated rotating border glow */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-0">
              <motion.div
                className="absolute -inset-px rounded-2xl opacity-40"
                style={{
                  background:
                    'conic-gradient(from 0deg, transparent 0%, rgba(59,130,246,0.3) 25%, transparent 50%, rgba(16,185,129,0.2) 75%, transparent 100%)',
                }}
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              />
              <div className="absolute inset-[1px] rounded-2xl bg-gray-900/95 backdrop-blur-xl" />
            </div>

            {/* ── Top Bar ── */}
            <div className="relative z-10 flex items-center gap-2 px-4 py-3 border-b border-gray-800/60">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                <div className="w-3 h-3 rounded-full bg-[#28C840]" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-1 rounded-md bg-gray-800/60 border border-gray-700/30 text-gray-500 text-xs font-medium">
                  use60.com
                </div>
              </div>
              <div className="w-[54px]" />
            </div>

            {/* ── Dashboard Content ── */}
            <div className="relative z-10 p-5 space-y-4">
              {/* Header */}
              <motion.div
                className="flex items-center justify-between"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.6 }}
              >
                <div>
                  <h3 className="text-white font-bold text-base tracking-tight">
                    Meeting Hub
                  </h3>
                  <p className="text-gray-500 text-xs mt-0.5">
                    3 meetings today
                  </p>
                </div>
                <motion.div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                             bg-blue-500/10 border border-blue-500/20"
                  animate={{
                    borderColor: [
                      'rgba(59,130,246,0.2)',
                      'rgba(59,130,246,0.45)',
                      'rgba(59,130,246,0.2)',
                    ],
                  }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                >
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-blue-400"
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-blue-400 text-xs font-semibold">
                    AI Active
                  </span>
                </motion.div>
              </motion.div>

              {/* Meeting Cards */}
              <div className="space-y-2.5">
                {MEETINGS.map((m, i) => (
                  <motion.div
                    key={m.title}
                    className="p-3.5 rounded-xl border border-gray-700/30 bg-gray-800/25
                               hover:bg-gray-800/40 transition-all duration-300"
                    initial={{ opacity: 0, x: 40, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    transition={{
                      delay: 1.1 + i * 0.18,
                      duration: 0.7,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2 min-w-0">
                        <p className="text-gray-200 text-sm font-medium truncate">
                          {m.title}
                        </p>
                        <div className="flex gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${m.sentimentClasses}`}
                          >
                            {m.sentiment}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${m.stageClasses}`}
                          >
                            {m.stage}
                          </span>
                        </div>
                      </div>
                      <span className="text-gray-600 text-xs whitespace-nowrap pt-0.5 font-medium">
                        {m.time}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Stats Row */}
              <motion.div
                className="grid grid-cols-3 gap-2.5"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 1.8,
                  duration: 0.7,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <AnimatedStat
                  target={12}
                  label="Action Items"
                  change="+3"
                  delay={2200}
                />
                <AnimatedStat
                  target={0.72}
                  label="Avg Sentiment"
                  change="+0.1"
                  isDecimal
                  delay={2400}
                />
                <AnimatedStat
                  target={42}
                  label="Talk Time"
                  change="Optimal"
                  suffix="%"
                  delay={2600}
                />
              </motion.div>
            </div>
          </div>

          {/* ── Floating: Proposal Sent ── */}
          <motion.div
            className="absolute -left-8 top-[120px] z-20"
            initial={{ opacity: 0, x: -60, scale: 0.6 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{
              delay: 2.4,
              type: 'spring',
              stiffness: 160,
              damping: 13,
            }}
          >
            <motion.div
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl
                         bg-gray-900/90 border border-emerald-500/30 backdrop-blur-xl"
              style={{
                boxShadow:
                  '0 8px 32px rgba(16,185,129,0.15), 0 0 0 1px rgba(16,185,129,0.08) inset',
              }}
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 3,
              }}
            >
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={3} />
              </div>
              <span className="text-emerald-400 text-sm font-semibold whitespace-nowrap">
                Proposal Sent
              </span>
            </motion.div>
          </motion.div>

          {/* ── Floating: AI Analyzing ── */}
          <motion.div
            className="absolute -right-6 bottom-[130px] z-20"
            initial={{ opacity: 0, x: 60, scale: 0.6 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{
              delay: 2.8,
              type: 'spring',
              stiffness: 160,
              damping: 13,
            }}
          >
            <motion.div
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl
                         bg-gray-900/90 border border-purple-500/25 backdrop-blur-xl"
              style={{
                boxShadow:
                  '0 8px 32px rgba(139,92,246,0.12), 0 0 0 1px rgba(139,92,246,0.06) inset',
              }}
              animate={{
                y: [0, -4, 0],
                boxShadow: [
                  '0 8px 32px rgba(139,92,246,0.12), 0 0 0 1px rgba(139,92,246,0.06) inset',
                  '0 8px 40px rgba(139,92,246,0.22), 0 0 0 1px rgba(139,92,246,0.12) inset',
                  '0 8px 32px rgba(139,92,246,0.12), 0 0 0 1px rgba(139,92,246,0.06) inset',
                ],
              }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 3.5,
              }}
            >
              <motion.div
                animate={{ rotate: [0, 180, 360] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
              </motion.div>
              <span className="text-purple-300 text-sm font-semibold whitespace-nowrap">
                AI Analyzing...
              </span>
            </motion.div>
          </motion.div>

          {/* ── Floating: Follow-up Scheduled ── */}
          <motion.div
            className="absolute -right-3 top-[60px] z-20"
            initial={{ opacity: 0, y: -30, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: 3.2,
              type: 'spring',
              stiffness: 160,
              damping: 13,
            }}
          >
            <motion.div
              className="flex items-center gap-2 px-3 py-2 rounded-xl
                         bg-gray-900/90 border border-blue-500/25 backdrop-blur-xl"
              style={{
                boxShadow:
                  '0 8px 32px rgba(59,130,246,0.1), 0 0 0 1px rgba(59,130,246,0.06) inset',
              }}
              animate={{ y: [0, -3, 0] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 4,
              }}
            >
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-blue-300 text-xs font-semibold whitespace-nowrap">
                Follow-up Scheduled
              </span>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Main Hero Section
// ═══════════════════════════════════════════

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.13, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function HeroSectionV5() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-gray-950 flex items-center">
      <Background />
      <ParticleField />

      <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-0 w-full">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">

          {/* ════════ Left Column: Copy ════════ */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="max-w-xl"
          >
            {/* Badge */}
            <motion.div variants={itemVariants}>
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                           bg-blue-500/10 border border-blue-500/15 backdrop-blur-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-blue-300 text-sm font-medium tracking-wide">
                  Revolutionary AI for Sales Teams
                </span>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={itemVariants}
              className="mt-8 text-[2.75rem] sm:text-5xl lg:text-[3.5rem]
                         font-bold text-white leading-[1.08] tracking-tight"
            >
              Turn Meetings
              <br />
              Into <RotatingWords />
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={itemVariants}
              className="mt-6 text-[17px] text-gray-400 leading-relaxed max-w-[28rem]"
            >
              Seamlessly connect your Call Recorder, CRM, and Task Manager.
              Our AI auto-generates reports, proposals, and tasks for your
              entire team.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              variants={itemVariants}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              {/* Primary CTA */}
              <motion.button
                className="group relative inline-flex items-center gap-2.5 px-7 py-3.5
                           rounded-xl bg-white text-gray-900 font-semibold text-[15px]
                           overflow-hidden cursor-pointer"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  boxShadow:
                    '0 0 24px rgba(255,255,255,0.12), 0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <span className="relative z-10">Start for Free</span>
                <ArrowRight className="w-4 h-4 relative z-10 transition-transform duration-300 group-hover:translate-x-1" />
                {/* Shimmer sweep */}
                <motion.div
                  className="absolute inset-0 z-0"
                  style={{
                    background:
                      'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)',
                    backgroundSize: '200% 100%',
                  }}
                  animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    repeatDelay: 3,
                    ease: 'easeInOut',
                  }}
                />
              </motion.button>

              {/* Secondary CTA */}
              <motion.button
                className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl
                           border border-gray-700/60 text-gray-300 font-semibold text-[15px]
                           hover:bg-white/5 hover:border-gray-600/60 transition-all duration-300
                           cursor-pointer"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Watch Demo
              </motion.button>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div
              variants={itemVariants}
              className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3"
            >
              {[
                { icon: Clock, label: 'Setup in 60 seconds' },
                { icon: Shield, label: 'No credit card' },
                { icon: Zap, label: 'Early adopter perks' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <item.icon className="w-3.5 h-3.5 text-gray-600" />
                  <span className="text-gray-500 text-sm">{item.label}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* ════════ Right Column: Dashboard ════════ */}
          <div className="relative lg:pl-4 hidden md:block">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
