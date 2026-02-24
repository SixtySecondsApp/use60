import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  motion,
  useInView,
  AnimatePresence,
  useReducedMotion
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
  Mail,
  MessageSquare,
  Database,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';

// ═══════════════════════════════════════════
// Custom Icons (not in lucide-react)
// ═══════════════════════════════════════════

function PhoneIcon({ size, width, height, ...props }: { size?: number; width?: number; height?: number } & React.SVGProps<SVGSVGElement>) {
  const s = size ?? (width as number) ?? (height as number) ?? 24;
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ListIcon({ size, width, height, ...props }: { size?: number; width?: number; height?: number } & React.SVGProps<SVGSVGElement>) {
  const s = size ?? (width as number) ?? (height as number) ?? 24;
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

// ═══════════════════════════════════════════
// Background & Atmosphere
// ═══════════════════════════════════════════

function Background() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Blue glow – top right */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          top: -300, right: -200, width: 700, height: 700,
          background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
        }}
        animate={prefersReducedMotion ? {} : { x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.1, 0.95, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Emerald glow – bottom left */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          bottom: -300, left: -200, width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)',
        }}
        animate={prefersReducedMotion ? {} : { x: [0, -30, 20, 0], y: [0, 20, -30, 0], scale: [1, 0.95, 1.1, 1] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

function ParticleField() {
  const prefersReducedMotion = useReducedMotion();
  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 10,
    })),
  []);

  if (prefersReducedMotion) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-white/10"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          animate={{ y: [0, -40, 0], opacity: [0, 0.8, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// Agent Simulation
// ═══════════════════════════════════════════

const AGENT_STEPS = [
  { id: 'call',    icon: PhoneIcon,     label: 'Analysing call transcript',  detail: 'Meeting with Sarah Chen',      delay: 400,  status: 'done' },
  { id: 'actions', icon: ListIcon,      label: 'Extracting action items',     detail: '4 items found',                delay: 1800, status: 'done' },
  { id: 'crm',     icon: Database,      label: 'Updating HubSpot',           detail: 'Deal record + timeline',       delay: 3200, status: 'done' },
  { id: 'email',   icon: Mail,          label: 'Drafting follow-up email',   detail: 'Personalised to Sarah',        delay: 4800, status: 'typing' },
  { id: 'slack',   icon: MessageSquare, label: 'Posting to #sales-team',     detail: 'Summary + action items',       delay: 8200, status: 'done' },
  { id: 'flag',    icon: AlertTriangle, label: 'Deal risk flagged',          detail: 'Budget approval is a blocker', delay: 9600, status: 'warning' },
];

const EMAIL_LINES = [
  'Hi Sarah,',
  '',
  'Thanks for the call today. As discussed,',
  "I've attached the ROI calculator configured",
  'for your 200-seat deployment.',
  '',
  "I'll circle back on the Q2 budget timeline",
  'next Tuesday as agreed.',
];

function AgentSimulation() {
  const [visibleSteps, setVisibleSteps] = useState<string[]>([]);
  const [showEmail, setShowEmail] = useState(false);
  const [emailText, setEmailText] = useState('');
  const [cycleKey, setCycleKey] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, amount: 0.3 });
  const prefersReducedMotion = useReducedMotion();

  const fullEmailText = EMAIL_LINES.join('\n');

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
      timers.push(setTimeout(() => {
        setVisibleSteps(prev => [...prev, step.id]);
      }, step.delay));
    });

    timers.push(setTimeout(() => setShowEmail(true), 4800));

    timers.push(setTimeout(() => {
      let charIndex = 0;
      typeInterval = setInterval(() => {
        if (charIndex < fullEmailText.length) {
          setEmailText(fullEmailText.slice(0, charIndex + 1));
          charIndex++;
        } else {
          if (typeInterval) clearInterval(typeInterval);
        }
      }, 30);
    }, 5200));

    timers.push(setTimeout(() => setCycleKey(k => k + 1), 14000));

    return () => {
      timers.forEach(t => clearTimeout(t));
      if (typeInterval) clearInterval(typeInterval);
    };
  }, [isInView, cycleKey, prefersReducedMotion]);

  return (
    <div ref={ref} className="relative">
      <motion.div
        key={cycleKey}
        initial={{ opacity: 0, y: 20, rotateX: 5 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.8 }}
        className="relative rounded-2xl overflow-hidden border border-gray-700/50 bg-gray-900/90 backdrop-blur-xl shadow-2xl"
        style={{ perspective: '1000px' }}
      >
        {/* Window chrome */}
        <div className="relative z-10 flex items-center gap-2 px-4 py-3 border-b border-gray-800/60 bg-gray-900/50">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-3 py-1 rounded-md bg-gray-800/60 border border-gray-700/30 text-gray-400 text-xs font-mono">
              agent_active.log
            </div>
          </div>
          <div className="w-12" />
        </div>

        {/* Steps */}
        <div className="p-6 space-y-4 min-h-[420px]">
          {AGENT_STEPS.map((step) => {
            if (!visibleSteps.includes(step.id)) return null;
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-3 group"
              >
                <div className={`mt-0.5 p-1.5 rounded-lg ${
                  step.status === 'done'    ? 'bg-emerald-500/10 text-emerald-400' :
                  step.status === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                                              'bg-blue-500/10 text-blue-400'
                }`}>
                  <step.icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-200">{step.label}</p>
                    {step.status === 'done'    && <Check         size={12} className="text-emerald-500" />}
                    {step.status === 'warning' && <AlertTriangle size={12} className="text-amber-500" />}
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{step.detail}</p>

                  {/* Email preview card */}
                  {step.id === 'email' && showEmail && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-3 rounded-lg border border-gray-700 bg-gray-800/50 overflow-hidden"
                    >
                      <div className="px-3 py-2 border-b border-gray-700/50 bg-gray-800 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Drafting</span>
                      </div>
                      <div className="p-3">
                        <p className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">
                          {emailText}
                          <span className="inline-block w-1.5 h-3 bg-blue-400 ml-1 animate-pulse align-middle" />
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Live badge */}
        <div className="absolute bottom-4 right-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 shadow-lg">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-gray-300">Processing Live</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Demo Modal
// ═══════════════════════════════════════════

function DemoModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="relative w-full max-w-4xl bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-700 pointer-events-auto"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900">
                <h3 className="text-white font-semibold">Product Walkthrough</h3>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="aspect-video bg-gray-950 relative group cursor-pointer">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform duration-300">
                    <Play className="w-8 h-8 text-white fill-white ml-1" />
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
// How It Works
// ═══════════════════════════════════════════

const STEPS = [
  {
    num: '01',
    icon: Zap,
    title: 'Connect Your Stack',
    desc: 'Link your calendar, CRM, and meeting platform in minutes. Works with HubSpot, Salesforce, Google, and more.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  {
    num: '02',
    icon: Sparkles,
    title: 'AI Learns the Deal',
    desc: 'We map every deal, learn your follow-up patterns, and build context from your entire history.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
  {
    num: '03',
    icon: Check,
    title: 'Review & Approve',
    desc: 'Every follow-up, CRM update, and deal alert is queued for your review. One click to approve.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
];

function HowItWorks() {
  return (
    <section className="relative py-24 bg-gray-950 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white tracking-tight sm:text-4xl">
            From call to closed in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              three steps
            </span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
              className="relative p-6 rounded-2xl border border-gray-800 bg-gray-900/50 hover:bg-gray-900 transition-colors group"
            >
              <div className={`w-12 h-12 rounded-xl ${step.bg} ${step.border} border flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                <step.icon className={`w-6 h-6 ${step.color}`} />
              </div>
              <div className="absolute top-6 right-6 text-4xl font-bold text-gray-800 select-none">
                {step.num}
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
              <p className="text-gray-400 leading-relaxed text-sm">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════

export default function HeroSectionV7() {
  const [isDemoOpen, setDemoOpen] = useState(false);

  return (
    <div className="bg-gray-950 min-h-screen">
      {/* Hero */}
      <section className="relative pt-24 pb-32 lg:pt-32 lg:pb-40 overflow-hidden">
        <Background />
        <ParticleField />
        <DemoModal isOpen={isDemoOpen} onClose={() => setDemoOpen(false)} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-xl"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
                <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Now in Early Access</span>
              </div>

              <h1 className="text-5xl sm:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-6">
                Your AI already <br />
                sat in the meeting. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400">
                  Now watch it work.
                </span>
              </h1>

              <p className="text-lg text-gray-400 leading-relaxed mb-10 max-w-lg">
                use60 turns your sales calls into closed deals — automatically drafting follow-ups, updating your CRM, and surfacing what needs attention.
              </p>

              <div className="flex flex-wrap items-center gap-4 mb-12">
                <button className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-gray-900 font-bold text-base transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                  <span>Get Early Access</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  onClick={() => setDemoOpen(true)}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-gray-700 text-gray-300 font-bold text-base hover:bg-gray-800 transition-colors"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Watch Demo</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-6 border-t border-gray-800 pt-8">
                {[
                  { icon: Clock,  label: 'Setup in 5 min' },
                  { icon: Shield, label: 'No credit card' },
                  { icon: Zap,    label: 'SOC 2 Compliant' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-gray-500">
                    <item.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right – Agent Simulation */}
            <div className="hidden lg:block relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-20" />
              <AgentSimulation />
            </div>
          </div>
        </div>
      </section>

      <HowItWorks />
    </div>
  );
}
