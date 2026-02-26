import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, useScroll, useTransform, useSpring, useReducedMotion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Play, Sparkles, Zap, Brain, Mail, Calendar, BarChart3, Users } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   use60 Hero V10 — "The Command Center"
   Cinema-grade hero with:
   • Neural pulse canvas visualization (Rive-ready architecture)
   • 3D perspective orbiting capability cards
   • Scroll-linked parallax dissolve
   • Mouse-reactive particle field
   • Split text reveal with blur-to-sharp
   • Animated gradient mesh background
   ═══════════════════════════════════════════════════════════════ */

// ─── Design Tokens ────────────────────────────────────────────
const t = {
  bg: '#030712',
  surface: 'rgba(255,255,255,0.03)',
  surfaceHover: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
  textPrimary: '#F9FAFB',
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  violet: '#8B5CF6',
  violetGlow: 'rgba(139,92,246,0.25)',
  cyan: '#06B6D4',
  cyanGlow: 'rgba(6,182,212,0.20)',
  emerald: '#10B981',
  emeraldGlow: 'rgba(16,185,129,0.15)',
  amber: '#F59E0B',
};

// ─── Animation Tokens ─────────────────────────────────────────
const ease = {
  default: [0.22, 1, 0.36, 1] as const,
  emphasized: [0.16, 1, 0.3, 1] as const,
  decelerate: [0.0, 0, 0, 1] as const,
};

const spring = {
  smooth: { type: 'spring' as const, stiffness: 200, damping: 25, mass: 1 },
  responsive: { type: 'spring' as const, stiffness: 300, damping: 30, mass: 0.8 },
  gentle: { type: 'spring' as const, stiffness: 100, damping: 20, mass: 1 },
};

// ─── Neural Pulse Canvas ──────────────────────────────────────
// A WebGL-lite canvas visualization that draws pulsing neural
// connections. Architecture is Rive-ready — swap <NeuralPulse />
// for <RiveComponent src="/brain.riv" /> when .riv is designed.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  connections: number[];
  pulse: number;
  pulseSpeed: number;
  baseAlpha: number;
}

function NeuralPulse({ mouseX, mouseY }: { mouseX: number; mouseY: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || shouldReduceMotion) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const size = 600;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Initialize particles in organic cluster pattern
    const particles: Particle[] = [];
    const count = 40;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const radius = 80 + Math.random() * 140;
      particles.push({
        x: size / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 40,
        y: size / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 1.5 + Math.random() * 2,
        connections: [],
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.01 + Math.random() * 0.02,
        baseAlpha: 0.3 + Math.random() * 0.4,
      });
    }

    // Pre-compute connections (closest 3-4 neighbors)
    for (let i = 0; i < particles.length; i++) {
      const distances: { idx: number; dist: number }[] = [];
      for (let j = 0; j < particles.length; j++) {
        if (i === j) continue;
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        distances.push({ idx: j, dist: Math.sqrt(dx * dx + dy * dy) });
      }
      distances.sort((a, b) => a.dist - b.dist);
      particles[i].connections = distances.slice(0, 3 + Math.floor(Math.random() * 2)).map(d => d.idx);
    }

    particlesRef.current = particles;

    let time = 0;
    const draw = () => {
      time += 1;
      ctx.clearRect(0, 0, size, size);

      // Mouse influence (normalized 0-1 to canvas coords)
      const mx = mouseX * size;
      const my = mouseY * size;

      // Update particles
      for (const p of particles) {
        p.pulse += p.pulseSpeed;

        // Gentle orbital drift
        const cx = size / 2;
        const cy = size / 2;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Orbital force
        p.vx += (-dy / dist) * 0.002;
        p.vy += (dx / dist) * 0.002;

        // Center pull
        p.vx += (cx - p.x) * 0.0001;
        p.vy += (cy - p.y) * 0.0001;

        // Mouse attraction (gentle)
        if (mx > 0 && my > 0) {
          const mdx = mx - p.x;
          const mdy = my - p.y;
          const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mDist < 200) {
            const force = (200 - mDist) / 200 * 0.02;
            p.vx += mdx / mDist * force;
            p.vy += mdy / mDist * force;
          }
        }

        // Damping
        p.vx *= 0.98;
        p.vy *= 0.98;

        p.x += p.vx;
        p.y += p.vy;
      }

      // Draw connections
      for (const p of particles) {
        const alpha = (Math.sin(p.pulse) * 0.3 + 0.3) * p.baseAlpha;
        for (const ci of p.connections) {
          const cp = particles[ci];
          const dx = p.x - cp.x;
          const dy = p.y - cp.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 180) continue;

          const lineAlpha = alpha * (1 - d / 180) * 0.5;

          // Gradient line from violet to cyan
          const grad = ctx.createLinearGradient(p.x, p.y, cp.x, cp.y);
          grad.addColorStop(0, `rgba(139, 92, 246, ${lineAlpha})`);
          grad.addColorStop(1, `rgba(6, 182, 212, ${lineAlpha})`);

          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(cp.x, cp.y);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 0.5 + lineAlpha;
          ctx.stroke();

          // Traveling pulse dot along connection
          if (Math.sin(p.pulse * 3 + ci) > 0.7) {
            const progress = (Math.sin(time * 0.02 + ci) + 1) / 2;
            const px = p.x + (cp.x - p.x) * progress;
            const py = p.y + (cp.y - p.y) * progress;
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(139, 92, 246, ${lineAlpha * 2})`;
            ctx.fill();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        const alpha = (Math.sin(p.pulse) * 0.3 + 0.5) * p.baseAlpha;

        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139, 92, 246, ${alpha * 0.1})`;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }

      // Center glow
      const centerX = size / 2;
      const centerY = size / 2;
      const centerGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 120);
      centerGrad.addColorStop(0, `rgba(139, 92, 246, ${0.05 + Math.sin(time * 0.01) * 0.03})`);
      centerGrad.addColorStop(0.5, `rgba(6, 182, 212, ${0.02 + Math.sin(time * 0.01 + 1) * 0.01})`);
      centerGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = centerGrad;
      ctx.fillRect(0, 0, size, size);

      animFrameRef.current = requestAnimationFrame(draw);
    };

    // Observe visibility to pause off-screen
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        animFrameRef.current = requestAnimationFrame(draw);
      } else {
        cancelAnimationFrame(animFrameRef.current);
      }
    });
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      observer.disconnect();
    };
  }, [shouldReduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update mouse position without re-creating the effect
  const mouseRef = useRef({ x: mouseX, y: mouseY });
  mouseRef.current = { x: mouseX, y: mouseY };

  if (shouldReduceMotion) {
    return (
      <div className="w-[600px] h-[600px] rounded-full"
        style={{
          background: `radial-gradient(ellipse, ${t.violetGlow}, ${t.cyanGlow} 60%, transparent 80%)`,
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-[600px] h-[600px]"
      style={{ width: 600, height: 600 }}
      aria-hidden="true"
    />
  );
}

// ─── Split Text Reveal ────────────────────────────────────────
function SplitTextReveal({ text, className, delay = 0 }: {
  text: string; className?: string; delay?: number;
}) {
  const words = text.split(' ');
  return (
    <motion.span
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.04, delayChildren: delay } },
      }}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block mr-[0.3em]"
          variants={{
            hidden: { opacity: 0, y: 12, filter: 'blur(8px)' },
            visible: {
              opacity: 1, y: 0, filter: 'blur(0px)',
              transition: { duration: 0.5, ease: ease.default },
            },
          }}
        >
          {word}
        </motion.span>
      ))}
    </motion.span>
  );
}

// ─── Animated Counter ─────────────────────────────────────────
function AnimatedCounter({ value, suffix = '', prefix = '', duration = 2000 }: {
  value: number; suffix?: string; prefix?: string; duration?: number;
}) {
  const [current, setCurrent] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated.current) {
        hasAnimated.current = true;
        const start = performance.now();
        const animate = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          // easeOutQuint
          const eased = 1 - Math.pow(1 - progress, 5);
          setCurrent(Math.round(eased * value));
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }, { threshold: 0.5 });

    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}{current.toLocaleString()}{suffix}
    </span>
  );
}

// ─── Capability Card (3D Tilt) ────────────────────────────────
interface CapabilityCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  accentColor: string;
  accentGlow: string;
  delay: number;
  stat: string;
  statLabel: string;
}

function CapabilityCard({
  icon: Icon, title, description, accentColor, accentGlow, delay, stat, statLabel,
}: CapabilityCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (shouldReduceMotion) return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(10px)`;
  }, [shouldReduceMotion]);

  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = 'perspective(800px) rotateY(0deg) rotateX(0deg) translateZ(0px)';
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: ease.default }}
      className="motion-reduce:transform-none"
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="group relative rounded-2xl p-px cursor-default"
        style={{
          transition: 'transform 0.15s ease-out',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Animated border gradient */}
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100"
          style={{
            background: `linear-gradient(135deg, ${accentColor}30, transparent, ${accentColor}15)`,
            transition: 'opacity 0.3s ease-out',
          }}
        />

        {/* Card body */}
        <div
          className="relative rounded-2xl p-5 h-full"
          style={{
            backgroundColor: t.surface,
            border: `1px solid ${t.border}`,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          {/* Icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
            style={{ backgroundColor: `${accentColor}12` }}
          >
            <Icon size={18} style={{ color: accentColor }} />
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold mb-1" style={{ color: t.textPrimary }}>
            {title}
          </h3>

          {/* Description */}
          <p className="text-xs leading-relaxed mb-4 text-pretty" style={{ color: t.textSecondary }}>
            {description}
          </p>

          {/* Stat */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular-nums" style={{ color: accentColor }}>
              {stat}
            </span>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: t.textTertiary }}>
              {statLabel}
            </span>
          </div>

          {/* Subtle glow on hover */}
          <div
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-12 rounded-full opacity-0 group-hover:opacity-100 blur-2xl"
            style={{
              backgroundColor: accentGlow,
              transition: 'opacity 0.4s ease-out',
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Trusted-By Marquee ───────────────────────────────────────
const COMPANIES = [
  'HubSpot', 'Fathom', 'Slack', 'Apollo', 'Instantly',
  'Gmail', 'Google Calendar', 'Attio', 'Stripe',
];

function TrustedMarquee() {
  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]">
      {[0, 1].map((copy) => (
        <div
          key={copy}
          className="flex shrink-0 animate-[marquee_25s_linear_infinite] items-center gap-10 pr-10"
          aria-hidden={copy === 1}
        >
          {COMPANIES.map((name) => (
            <span
              key={name}
              className="text-xs font-medium tracking-wide whitespace-nowrap select-none"
              style={{ color: t.textTertiary }}
            >
              {name}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Floating Status Pill ─────────────────────────────────────
function StatusPill() {
  const [text, setText] = useState('Preparing meeting brief...');
  const texts = useMemo(() => [
    'Preparing meeting brief...',
    'Drafted follow-up email',
    'Updated deal score → 78%',
    'Logged 3 action items',
    'Sent Slack digest',
  ], []);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % texts.length;
      setText(texts[i]);
    }, 3000);
    return () => clearInterval(interval);
  }, [texts]);

  return (
    <div
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
      style={{
        backgroundColor: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.15)',
      }}
    >
      <div className="relative w-2 h-2">
        <div className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: t.violet, opacity: 0.4 }} />
        <div className="relative w-2 h-2 rounded-full" style={{ backgroundColor: t.violet }} />
      </div>
      <AnimatePresence mode="wait">
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: ease.default }}
          className="text-xs font-medium"
          style={{ color: t.violet }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ─── Main Hero Component ──────────────────────────────────────
export default function HeroSectionV10() {
  const heroRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Scroll-linked parallax
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  const heroOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, -60]);
  const smoothY = useSpring(heroY, { stiffness: 100, damping: 30, restDelta: 0.001 });

  // Mouse tracking for neural pulse
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (shouldReduceMotion) return;
    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMouse({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, [shouldReduceMotion]);

  const capabilities: CapabilityCardProps[] = [
    {
      icon: Calendar,
      title: 'Meeting Prep',
      description: 'Full brief with company intel, stakeholder mapping, and risk flags — ready before you are.',
      accentColor: t.violet,
      accentGlow: t.violetGlow,
      delay: 0.5,
      stat: '< 60s',
      statLabel: 'per brief',
    },
    {
      icon: Mail,
      title: 'Follow-Ups',
      description: 'Drafted in your tone with perfect deal context. One click to send. Never drop the ball.',
      accentColor: t.cyan,
      accentGlow: t.cyanGlow,
      delay: 0.6,
      stat: '2.3x',
      statLabel: 'reply rate',
    },
    {
      icon: BarChart3,
      title: 'Deal Intelligence',
      description: 'Health scores, risk signals, and next-best-actions. See what matters before it\'s too late.',
      accentColor: t.emerald,
      accentGlow: t.emeraldGlow,
      delay: 0.7,
      stat: '94%',
      statLabel: 'accuracy',
    },
    {
      icon: Users,
      title: 'Pipeline Ops',
      description: 'Auto-tag, auto-prioritize, auto-update. Your CRM stays current without you lifting a finger.',
      accentColor: t.amber,
      accentGlow: 'rgba(245, 158, 11, 0.15)',
      delay: 0.8,
      stat: '5hrs',
      statLabel: 'saved / week',
    },
  ];

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen overflow-hidden"
      style={{ backgroundColor: t.bg }}
      onMouseMove={handleMouseMove}
    >
      {/* ── Background Layers ── */}

      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Top radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[1000px] h-[600px] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse, ${t.violetGlow}, transparent 70%)`,
          filter: 'blur(80px)',
        }}
      />

      {/* Secondary glow */}
      <div
        className="absolute top-40 right-0 w-[500px] h-[400px] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse, ${t.cyanGlow}, transparent 70%)`,
          filter: 'blur(100px)',
        }}
      />

      {/* ── Content ── */}
      <motion.div
        style={{
          opacity: shouldReduceMotion ? 1 : heroOpacity,
          scale: shouldReduceMotion ? 1 : heroScale,
          y: shouldReduceMotion ? 0 : smoothY,
        }}
        className="relative z-10"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 lg:pt-36">

          {/* ── Top Section: Neural Viz + Copy ── */}
          <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-0">

            {/* Left: Copy */}
            <div className="flex-1 text-center lg:text-left max-w-2xl lg:max-w-none">

              {/* Status Pill */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: ease.emphasized }}
                className="mb-6 motion-reduce:transform-none"
              >
                <StatusPill />
              </motion.div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.05]">
                <SplitTextReveal
                  text="Your AI sales"
                  className="block bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-zinc-400"
                  delay={0.1}
                />
                <SplitTextReveal
                  text="command center"
                  className="block bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-cyan-300 to-violet-400"
                  delay={0.3}
                />
              </h1>

              {/* Subheadline */}
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45, ease: ease.default }}
                className="mt-6 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0 text-pretty motion-reduce:transform-none"
                style={{ color: t.textSecondary }}
              >
                60 automates everything either side of the sales call. Find leads,
                prep for meetings, follow up, keep deals warm. You focus on
                conversations that close revenue.
              </motion.p>

              {/* CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.55, ease: ease.default }}
                className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start motion-reduce:transform-none"
              >
                <motion.a
                  href="https://app.use60.com/signup"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={spring.responsive}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-black motion-reduce:transform-none"
                  style={{
                    background: 'linear-gradient(135deg, #fff 0%, #e2e8f0 100%)',
                    boxShadow: `0 0 40px ${t.violetGlow}, 0 4px 12px rgba(0,0,0,0.3)`,
                  }}
                >
                  Start Free
                  <ArrowRight size={16} />
                </motion.a>
                <motion.a
                  href="/demo-v2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={spring.responsive}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-medium motion-reduce:transform-none"
                  style={{
                    color: t.textSecondary,
                    border: `1px solid ${t.border}`,
                    backgroundColor: t.surface,
                  }}
                >
                  <Play size={14} />
                  Watch Demo
                </motion.a>
              </motion.div>

              {/* Social proof numbers */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.7, ease: ease.default }}
                className="mt-10 flex gap-8 justify-center lg:justify-start motion-reduce:transform-none"
              >
                {[
                  { value: 2847, suffix: '+', label: 'meetings prepped' },
                  { value: 12, suffix: 'k', label: 'follow-ups sent' },
                  { value: 94, suffix: '%', label: 'time saved' },
                ].map((stat) => (
                  <div key={stat.label} className="text-center lg:text-left">
                    <div className="text-xl font-bold" style={{ color: t.textPrimary }}>
                      <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                    </div>
                    <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: t.textTertiary }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right: Neural Pulse Visualization */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.3, ease: ease.decelerate }}
              className="flex-shrink-0 relative hidden lg:block motion-reduce:transform-none"
            >
              {/* Outer glow ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `radial-gradient(circle, ${t.violetGlow} 0%, transparent 70%)`,
                  filter: 'blur(40px)',
                  transform: 'scale(1.3)',
                }}
              />

              {/* Neural Pulse Canvas — swap with Rive when ready:
                  <RiveComponent src="/animations/brain.riv" stateMachines="BrainSM" autoplay /> */}
              <NeuralPulse mouseX={mouse.x} mouseY={mouse.y} />

              {/* Center "60" mark */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative">
                  <motion.div
                    animate={{
                      boxShadow: [
                        `0 0 20px ${t.violetGlow}`,
                        `0 0 40px ${t.violetGlow}`,
                        `0 0 20px ${t.violetGlow}`,
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-20 h-20 rounded-2xl flex items-center justify-center motion-reduce:animate-none"
                    style={{
                      backgroundColor: 'rgba(139, 92, 246, 0.1)',
                      border: `1px solid rgba(139, 92, 246, 0.2)`,
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    <span className="text-2xl font-bold" style={{ color: t.violet }}>60</span>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── Capability Cards ── */}
          <div className="mt-16 sm:mt-20 lg:mt-24">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4, ease: ease.default }}
              className="text-center mb-10 motion-reduce:transform-none"
            >
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: t.violet }}
              >
                Everything in 60 seconds or less
              </span>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {capabilities.map((cap) => (
                <CapabilityCard key={cap.title} {...cap} />
              ))}
            </div>
          </div>

          {/* ── Trusted By ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1, ease: ease.default }}
            className="mt-16 sm:mt-20 pb-16 motion-reduce:transform-none"
          >
            <p
              className="text-center text-[10px] uppercase tracking-[0.2em] mb-6"
              style={{ color: t.textTertiary }}
            >
              Integrates with your stack
            </p>
            <TrustedMarquee />
          </motion.div>
        </div>
      </motion.div>

      {/* ── Marquee Keyframes (injected once) ── */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </section>
  );
}
