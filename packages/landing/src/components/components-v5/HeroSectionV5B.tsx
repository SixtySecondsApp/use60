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
  Play,
  X,
  FileText,
  CheckCircle2,
} from 'lucide-react';

// ═══════════════════════════════════════════
// Hero Visual CSS (injected once)
// ═══════════════════════════════════════════

const HERO_STYLE_ID = 'hero-v5b-styles';
const heroStyles = `
  @keyframes v5b-scan-text {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @keyframes v5b-pulse-ring {
    0% { transform: scale(0.8); opacity: 0.5; }
    100% { transform: scale(2); opacity: 0; }
  }
  @keyframes v5b-slide-up {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes v5b-highlight {
    0% { background-color: transparent; color: inherit; }
    100% { background-color: rgba(16,185,129,0.2); color: #10b981; }
  }
  @keyframes v5b-grow-line {
    from { height: 0; opacity: 0; }
    to { height: 24px; opacity: 1; }
  }
  @keyframes v5b-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  @keyframes v5b-alt-scan {
    0% { top: 0%; opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }
  .v5b-scan { background: linear-gradient(90deg, transparent, rgba(59,130,246,0.3), transparent); background-size: 200% 100%; animation: v5b-scan-text 2s infinite linear; }
  .v5b-pulse-dot::before { content: ''; position: absolute; left: 0; top: 0; width: 100%; height: 100%; background-color: #ef4444; border-radius: 50%; z-index: -1; animation: v5b-pulse-ring 2s cubic-bezier(0.215,0.61,0.355,1) infinite; }
  .v5b-step-1 { animation: v5b-slide-up 0.7s cubic-bezier(0.22,1,0.36,1) forwards; animation-delay: 0.4s; opacity: 0; }
  .v5b-step-2 { animation: v5b-slide-up 0.7s cubic-bezier(0.22,1,0.36,1) forwards; animation-delay: 2.0s; opacity: 0; }
  .v5b-step-3 { animation: v5b-slide-up 0.7s cubic-bezier(0.22,1,0.36,1) forwards; animation-delay: 3.6s; opacity: 0; }
  .v5b-trigger { animation: v5b-highlight 0.8s cubic-bezier(0.22,1,0.36,1) forwards; animation-delay: 1.2s; padding: 0 4px; border-radius: 4px; }
  .v5b-line-1 { animation: v5b-grow-line 0.5s cubic-bezier(0.22,1,0.36,1) forwards; animation-delay: 1.4s; opacity: 0; height: 0; }
  .v5b-line-2 { animation: v5b-grow-line 0.5s cubic-bezier(0.22,1,0.36,1) forwards; animation-delay: 3.0s; opacity: 0; height: 0; }
  .v5b-float { animation: v5b-float 3s ease-in-out infinite; }
  .v5b-float-delay { animation: v5b-float 4s ease-in-out infinite 1s; }
  .v5b-scan-line { animation: v5b-alt-scan 3s linear infinite; }
`;

const WORKFLOW_DURATION = 4500;
const DASHBOARD_HOLD = 5000;
const WORKFLOW_HOLD = 4000;

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
    <span
      className="relative inline-block overflow-hidden whitespace-nowrap"
      style={{ height: '1.1em', verticalAlign: 'text-bottom' }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={ROTATING_WORDS[index]}
          className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent absolute top-0 left-0 whitespace-nowrap leading-none"
          initial={prefersReducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0, rotateX: 45 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { y: '0%', opacity: 1, rotateX: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { y: '-100%', opacity: 0, rotateX: -45 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {ROTATING_WORDS[index]}
        </motion.span>
      </AnimatePresence>
      <span className="invisible whitespace-nowrap leading-none">{ROTATING_WORDS[index]}</span>
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
        animate={prefersReducedMotion ? {} : { x: [0, 30, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.1, 0.95, 1] }}
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
// Dashboard Visual (View 1)
// ═══════════════════════════════════════════

function DashboardVisual() {
  return (
    <div className="relative w-full max-w-lg">
      <div className="relative w-full bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
        {/* Window Controls */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800/50 bg-gray-800/30">
          <div className="w-3 h-3 rounded-full bg-red-400/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
          <div className="w-3 h-3 rounded-full bg-green-400/80" />
          <div className="ml-auto text-xs font-medium text-gray-500">use60.com</div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-gray-100">Meeting Hub</h3>
              <p className="text-xs text-gray-400 mt-0.5">3 meetings processed today</p>
            </div>
            <div className="px-2 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
              AI Active
            </div>
          </div>

          <div className="space-y-3 relative">
            {/* Scanning line */}
            <div className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500 to-transparent z-20 v5b-scan-line opacity-60" />

            <div className="p-3 rounded-xl border border-gray-800 bg-gray-800/30">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium text-sm text-gray-200">Discovery - Acme Corp</div>
                <span className="text-xs text-gray-500">10:00 AM</span>
              </div>
              <div className="flex gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400">Positive</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400">Proposal Sent</span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-gray-800 bg-gray-900/40">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium text-sm text-gray-200">Demo - TechStart Inc</div>
                <span className="text-xs text-gray-500">2:00 PM</span>
              </div>
              <div className="flex gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400">High Intent</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400">Processing...</span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-gray-800 bg-gray-900/40 opacity-50">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium text-sm text-gray-200">Sync - Global Ltd</div>
                <span className="text-xs text-gray-500">4:30 PM</span>
              </div>
              <div className="flex gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700 text-gray-400">Scheduled</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { label: 'Action Items', value: '12', color: 'text-gray-100' },
              { label: 'Sentiment', value: '0.72', color: 'text-emerald-400' },
              { label: 'Talk Time', value: '42%', color: 'text-blue-400' },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-lg bg-gray-800/30 border border-gray-800">
                <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <div className="hidden sm:flex absolute -right-12 top-12 items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-800 border border-emerald-500/20 shadow-xl v5b-float-delay z-20">
        <div className="p-1.5 rounded-full bg-emerald-500/10">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-100">Proposal Sent</div>
          <div className="text-[10px] text-gray-400">Acme Corp • $12k</div>
        </div>
      </div>

      <div className="hidden sm:flex absolute -left-12 bottom-24 items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-800 border border-purple-500/20 shadow-xl v5b-float z-20">
        <div className="p-1.5 rounded-full bg-purple-500/10">
          <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-100">AI Analyzing</div>
          <div className="text-[10px] text-gray-400">Extracting tasks...</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Workflow Visual (View 2)
// ═══════════════════════════════════════════

function WorkflowVisual() {
  return (
    <div className="relative w-full max-w-md">
      <div className="relative w-full bg-gray-900/80 backdrop-blur-sm rounded-2xl shadow-2xl shadow-black/50 border border-gray-700/50 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-800/50 px-6 py-4 border-b border-gray-700/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-red-500 rounded-full relative v5b-pulse-dot" />
            <span className="font-semibold text-gray-200">Completed: Discovery Call</span>
          </div>
          <div className="text-xs font-mono text-gray-500">32:05</div>
        </div>

        <div className="p-6 space-y-0">
          {/* Step 1: Transcript */}
          <div className="space-y-4 mb-2 v5b-step-1">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-xs font-bold text-purple-400 flex-shrink-0">JD</div>
              <div className="bg-gray-800 p-3 rounded-lg rounded-tl-none text-sm text-gray-300 w-full">
                That sounds exactly like what we need. What are the next steps?
              </div>
            </div>
            <div className="flex gap-3 flex-row-reverse">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">YOU</div>
              <div className="bg-blue-500/10 p-3 rounded-lg rounded-tr-none text-sm text-gray-200 w-full border border-blue-500/20">
                Great. <span className="v5b-trigger font-medium">I'll send you a proposal</span> with the pricing breakdown we discussed by EOD.
              </div>
            </div>
          </div>

          {/* Connector 1 */}
          <div className="flex justify-center my-1 v5b-line-1">
            <div className="w-0.5 bg-gradient-to-b from-emerald-400 to-blue-500 rounded-full" style={{ height: 24 }} />
          </div>

          {/* Step 2: AI Detection */}
          <div className="v5b-step-2 relative z-10">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-3">
              <div className="bg-emerald-500/20 p-2 rounded-md">
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Intent Detected</div>
                <div className="text-sm text-gray-200">Action: Create & Send Proposal</div>
              </div>
            </div>
          </div>

          {/* Connector 2 */}
          <div className="flex justify-center my-1 v5b-line-2">
            <div className="w-0.5 bg-gray-600 rounded-full" style={{ height: 24 }} />
          </div>

          {/* Step 3: Result */}
          <div className="v5b-step-3">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[#5B5FC7] text-white text-[10px] px-2 py-1 rounded-bl-lg font-medium flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.625 8.073c.574 0 1.125.224 1.531.623.407.4.637.943.637 1.51v5.139c0 .566-.23 1.11-.637 1.51a2.175 2.175 0 01-1.531.623h-.417v2.084c0 .567-.23 1.11-.637 1.51a2.175 2.175 0 01-1.531.623H5.958a2.175 2.175 0 01-1.531-.623 2.12 2.12 0 01-.637-1.51v-2.084h-.415c-.574 0-1.125-.224-1.531-.623A2.12 2.12 0 011.207 15.344V10.206c0-.567.23-1.11.637-1.51a2.175 2.175 0 011.531-.623h.415V6.422c0-.283.057-.564.168-.826a2.13 2.13 0 01.469-.701 2.18 2.18 0 01.71-.463c.265-.11.55-.165.836-.165h5.569c.287 0 .571.056.836.165.266.11.507.267.71.463.204.197.365.44.469.701.111.262.168.543.168.826v1.65h5.484zM8.542 6.422v1.65h2.916v-1.65H8.542zm9.375 7.29V10.205H6.083v6.773h-.29v2.584h12.332v-2.584h-.208v-3.266zm-7.709 0v2.083h2.084v-2.083h-2.084z" />
                </svg>
                Sent to Teams
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                  <FileText className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-100 text-sm">Acme_Proposal_v1.pdf</h4>
                  <p className="text-xs text-gray-400 mt-1 mb-3">Generated from template "Standard Enterprise"</p>
                  <div className="flex gap-2">
                    <button className="text-xs bg-gray-700 text-white px-3 py-1.5 rounded-md hover:bg-gray-600 transition-colors">Review</button>
                    <button className="text-xs border border-gray-600 text-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors">Edit</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom scan bar */}
        <div className="h-1 w-full bg-gray-800">
          <div className="h-full v5b-scan w-full" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Hero Visual — cycles between Dashboard & Workflow
// ═══════════════════════════════════════════

function HeroVisual() {
  const [activeView, setActiveView] = useState<'dashboard' | 'workflow'>('dashboard');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [workflowKey, setWorkflowKey] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const transitionTo = useCallback((view: 'dashboard' | 'workflow') => {
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveView(view);
      if (view === 'workflow') setWorkflowKey((k) => k + 1);
      setIsTransitioning(false);
    }, 400);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    if (activeView === 'dashboard' && !isTransitioning) {
      timer = setTimeout(() => transitionTo('workflow'), DASHBOARD_HOLD);
    } else if (activeView === 'workflow' && !isTransitioning) {
      timer = setTimeout(() => transitionTo('dashboard'), WORKFLOW_DURATION + WORKFLOW_HOLD);
    }
    return () => clearTimeout(timer);
  }, [activeView, isTransitioning, prefersReducedMotion, transitionTo]);

  const show = (view: 'dashboard' | 'workflow') =>
    activeView === view && !isTransitioning;

  return (
    <div className="relative h-[520px] flex items-center justify-center">
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-400 ${show('dashboard') ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
      >
        <DashboardVisual />
      </div>
      <div
        key={workflowKey}
        className={`absolute inset-0 flex items-center justify-center transition-all duration-400 ${show('workflow') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
      >
        <WorkflowVisual />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Demo Modal
// ═══════════════════════════════════════════

function DemoModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal Container */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="relative w-full max-w-4xl bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-700 pointer-events-auto"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                <h3 className="text-white font-semibold">Product Demo</h3>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Video Placeholder */}
              <div className="aspect-video bg-gray-950 relative group cursor-pointer">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform duration-300">
                    <Play className="w-8 h-8 text-white fill-white ml-1" />
                  </div>
                </div>
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full w-1/3 bg-blue-500" />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-400 font-mono">
                    <span>01:24</span>
                    <span>04:12</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════
// Main Hero Section
// ═══════════════════════════════════════════

export default function HeroSectionV5B() {
  const [isDemoOpen, setDemoOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!document.getElementById(HERO_STYLE_ID)) {
      const el = document.createElement('style');
      el.id = HERO_STYLE_ID;
      el.textContent = heroStyles;
      document.head.appendChild(el);
    }
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-gray-950 flex items-center py-24 lg:py-0">
      <Background />
      <ParticleField />

      <DemoModal isOpen={isDemoOpen} onClose={() => setDemoOpen(false)} />

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
              <button
                onClick={() => setDemoOpen(true)}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-gray-700 text-gray-300 font-bold text-base hover:bg-gray-800 transition-colors"
              >
                <Play className="w-5 h-5" />
                <span>Watch Demo</span>
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
            <HeroVisual />
          </div>
        </div>
      </div>
    </section>
  );
}
