/**
 * InteractiveDemoV16 — Cinematic full-width demo showcase
 *
 * Visual redesign vs V15:
 * - Always-dark cinematic section with gradient mesh background
 * - "Your AI sales engine" gradient headline (not "Six steps. Zero busywork.")
 * - Horizontal numbered step pills with connecting line (not vertical sidebar)
 * - Full-width demo viewport with animated gradient border
 * - Stacked layout (heading → steps → demo) instead of sidebar + viewport
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Search, Send, Mic, BarChart3, Reply, TrendingUp,
  Check, Play, FileText, Clock, MessageSquare, Zap,
  ArrowRight, Loader2, Star, Mic2, Video,
  CheckCircle2, Globe, Users, ChevronRight,
  Mail, Paperclip, DollarSign, Calendar, Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────

const CHAPTER_DURATION = 6000;

interface Chapter {
  id: string;
  icon: LucideIcon;
  label: string;
  shortLabel: string;
  subtitle: string;
}

const CHAPTERS: Chapter[] = [
  { id: 'find', icon: Search, label: 'Find Prospects', shortLabel: 'Find', subtitle: 'AI-powered search across 150M+ contacts' },
  { id: 'send', icon: Send, label: 'Send Messages', shortLabel: 'Send', subtitle: 'Personalized outreach with video at scale' },
  { id: 'record', icon: Mic, label: 'Record Meetings', shortLabel: 'Record', subtitle: 'Every word captured and transcribed live' },
  { id: 'analyze', icon: BarChart3, label: 'Analyze Meetings', shortLabel: 'Analyze', subtitle: 'Turn conversations into deal intelligence' },
  { id: 'followup', icon: Reply, label: 'Follow Up', shortLabel: 'Follow Up', subtitle: 'Proposals and emails, drafted automatically' },
  { id: 'nurture', icon: TrendingUp, label: 'Nurture Pipeline', shortLabel: 'Nurture', subtitle: 'Spot risks and close deals faster' },
];

// ─── Animation Config ───────────────────────────────────────

const demoEnter = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

const spring = { type: 'spring' as const, stiffness: 500, damping: 25 };

// ─── Shared: Enrichment Cell ────────────────────────────────

type CellState = 'empty' | 'loading' | 'done';

function EnrichCell({ state, value, className = '' }: { state: CellState; value: string; className?: string }) {
  if (state === 'empty') return <span className={`text-gray-600 font-mono text-[10px] ${className}`}>---</span>;
  if (state === 'loading') return <Loader2 className={`w-3 h-3 text-violet-400 animate-spin ${className}`} />;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring}
      className={`text-emerald-400 font-medium text-[10px] truncate ${className}`}
    >
      {value}
    </motion.span>
  );
}

// ═══════════════════════════════════════════════════════════
//  CHAPTER 1: Find Prospects — Enrichment Ops Table
// ═══════════════════════════════════════════════════════════

const PROSPECTS = [
  { initials: 'JK', name: 'Jessica Kim', title: 'CEO', company: 'DataForge', bg: 'bg-blue-600', source: 'Apollo' },
  { initials: 'MR', name: 'Marcus Rivera', title: 'Founder', company: 'NeuralPath', bg: 'bg-violet-600', source: 'AI Ark' },
  { initials: 'AL', name: 'Aisha Lewis', title: 'CTO', company: 'ScaleOps', bg: 'bg-emerald-600', source: 'Apollo' },
  { initials: 'TP', name: 'Tom Park', title: 'CEO', company: 'CloudSync', bg: 'bg-amber-600', source: 'Explorium' },
  { initials: 'SN', name: 'Sara Nakamura', title: 'Founder', company: 'MetricFlow', bg: 'bg-rose-600', source: 'AI Ark' },
];
const EMAILS = ['jessica@dataforge.io', 'marcus@neuralpath.ai', 'aisha@scaleops.com', 'tom@cloudsync.io', 'sara@metricflow.co'];
const PHONES = ['+1 (415) 555-0142', '+1 (212) 555-0198', '+1 (310) 555-0167', '+1 (617) 555-0201', '+1 (503) 555-0134'];

function FindProspectsDemo({ isActive }: { isActive: boolean }) {
  const [rows, setRows] = useState(0);
  const [cells, setCells] = useState<Record<number, Record<string, CellState>>>({});
  const [badge, setBadge] = useState(false);

  useEffect(() => {
    if (!isActive) { setRows(0); setCells({}); setBadge(false); return; }
    const t: ReturnType<typeof setTimeout>[] = [];

    PROSPECTS.forEach((_, i) => t.push(setTimeout(() => setRows(i + 1), 250 + i * 160)));

    PROSPECTS.forEach((_, i) => {
      const base = 250 + i * 160 + 500;
      t.push(setTimeout(() => setCells(p => ({ ...p, [i]: { ...p[i], email: 'loading' } })), base));
      t.push(setTimeout(() => setCells(p => ({ ...p, [i]: { ...p[i], email: 'done' } })), base + 400));
      t.push(setTimeout(() => setCells(p => ({ ...p, [i]: { ...p[i], phone: 'loading' } })), base + 200));
      t.push(setTimeout(() => setCells(p => ({ ...p, [i]: { ...p[i], phone: 'done' } })), base + 650));
    });

    t.push(setTimeout(() => setBadge(true), 2600));
    return () => t.forEach(clearTimeout);
  }, [isActive]);

  return (
    <motion.div {...demoEnter} className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
        <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        <span className="text-xs text-gray-400 truncate">SaaS founders in New York raising Series A</span>
        <Sparkles className="w-3 h-3 text-violet-400 ml-auto shrink-0" />
        {badge && (
          <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
            className="text-[10px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 font-medium whitespace-nowrap">
            47 results
          </motion.span>
        )}
      </div>

      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_90px_56px] gap-px bg-white/[0.03]">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Contact</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Email</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Phone</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Source</div>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {PROSPECTS.slice(0, rows).map((p, i) => {
            const s = cells[i] || {};
            return (
              <motion.div key={p.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="grid grid-cols-[1fr_100px_90px_56px] gap-px items-center bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-2 px-3 py-2 min-w-0">
                  <div className={`w-6 h-6 rounded-full ${p.bg} flex items-center justify-center text-[9px] font-bold text-white shrink-0`}>{p.initials}</div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-gray-200 truncate">{p.name}</p>
                    <p className="text-[9px] text-gray-500 truncate">{p.title} · {p.company}</p>
                  </div>
                </div>
                <div className="px-2 py-2"><EnrichCell state={(s.email as CellState) || 'empty'} value={EMAILS[i]} /></div>
                <div className="px-2 py-2"><EnrichCell state={(s.phone as CellState) || 'empty'} value={PHONES[i]} /></div>
                <div className="px-2 py-2 flex justify-center">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">{p.source}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {rows >= 3 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-[11px] text-emerald-400">
          <Check className="w-3.5 h-3.5" />
          <span className="font-medium">Enriching across Apollo, AI Ark &amp; Explorium...</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CHAPTER 2: Send Messages — Outreach Campaign Table
// ═══════════════════════════════════════════════════════════

const OUTREACH = [
  { name: 'Jessica Kim', company: 'DataForge', msg: 'Personalized intro', video: 'ready' },
  { name: 'Marcus Rivera', company: 'NeuralPath', msg: 'Follow-up angle', video: 'generating' },
  { name: 'Aisha Lewis', company: 'ScaleOps', msg: 'Pain point focus', video: 'scripting' },
  { name: 'Tom Park', company: 'CloudSync', msg: 'Referral hook', video: 'idle' },
];

const VIDEO_BADGES: Record<string, { label: string; cls: string }> = {
  idle: { label: 'Pending', cls: 'text-gray-500 bg-gray-500/10' },
  scripting: { label: 'Scripting', cls: 'text-yellow-400 bg-yellow-500/10' },
  generating: { label: 'Rendering', cls: 'text-violet-400 bg-violet-500/10' },
  ready: { label: 'Ready', cls: 'text-emerald-400 bg-emerald-500/10' },
};

function SendMessagesDemo({ isActive }: { isActive: boolean }) {
  const [rows, setRows] = useState(0);
  const [sent, setSent] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(-1);

  useEffect(() => {
    if (!isActive) { setRows(0); setSent(new Set()); setSending(-1); return; }
    const t: ReturnType<typeof setTimeout>[] = [];
    OUTREACH.forEach((_, i) => t.push(setTimeout(() => setRows(i + 1), 300 + i * 220)));
    OUTREACH.forEach((_, i) => {
      const base = 1800 + i * 550;
      t.push(setTimeout(() => setSending(i), base));
      t.push(setTimeout(() => { setSent(prev => new Set([...prev, i])); setSending(-1); }, base + 380));
    });
    return () => t.forEach(clearTimeout);
  }, [isActive]);

  return (
    <motion.div {...demoEnter} className="space-y-2">
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-medium text-gray-300">Outreach Campaign</span>
        </div>
        <span className="text-[10px] text-gray-500">{sent.size}/{OUTREACH.length} sent</span>
      </div>

      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_70px_48px] gap-px bg-white/[0.03]">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Contact</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Message</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Video</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-center">Sent</div>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {OUTREACH.slice(0, rows).map((r, i) => {
            const v = VIDEO_BADGES[r.video];
            const isSent = sent.has(i);
            return (
              <motion.div key={r.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={`grid grid-cols-[1fr_80px_70px_48px] gap-px items-center transition-colors ${isSent ? 'bg-emerald-500/[0.03]' : 'bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                <div className="px-3 py-2 min-w-0">
                  <p className="text-[11px] font-medium text-gray-200 truncate">{r.name}</p>
                  <p className="text-[9px] text-gray-500 truncate">{r.company}</p>
                </div>
                <div className="px-2 py-2"><p className="text-[10px] text-gray-400 truncate">{r.msg}</p></div>
                <div className="px-2 py-2 flex justify-center">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${v.cls}`}>{v.label}</span>
                </div>
                <div className="px-2 py-2 flex justify-center">
                  {isSent ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring}>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    </motion.div>
                  ) : sending === i ? (
                    <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-gray-700" />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {rows >= 2 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-violet-500/10">
            <Video className="w-3 h-3 text-violet-400" />
            <span className="text-[10px] font-medium text-violet-300">Personalized Video</span>
            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Ready</span>
          </div>
          <div className="p-2 flex items-center gap-3">
            <div className="w-20 h-12 rounded bg-violet-500/10 flex items-center justify-center shrink-0 border border-violet-500/10">
              <Play className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] text-gray-300">AI-generated intro for Jessica</p>
              <p className="text-[9px] text-gray-500">15s · Uses company data &amp; pain points</p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CHAPTER 3: Record Meetings — Live Call + Waveform + Transcript
// ═══════════════════════════════════════════════════════════

const ATTENDEES = [
  { initials: 'You', color: 'bg-blue-600' },
  { initials: 'ST', color: 'bg-emerald-600' },
  { initials: 'JC', color: 'bg-amber-600' },
  { initials: 'LP', color: 'bg-violet-600' },
];

const TRANSCRIPT = [
  { speaker: 'You', text: 'Tell me about your current sales stack.' },
  { speaker: 'Sarah', text: "We use Salesforce but it's barely configured." },
  { speaker: 'You', text: "What's the biggest time sink for your team?" },
  { speaker: 'Sarah', text: 'Follow-ups. Nobody does them consistently.' },
  { speaker: 'You', text: "I'll send you a proposal this afternoon." },
];

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-5">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-emerald-400/60"
          style={{
            height: '100%',
            animation: active ? `waveform ${0.5 + (i % 4) * 0.15}s ease-in-out infinite` : 'none',
            animationDelay: `${i * 60}ms`,
            transform: active ? undefined : 'scaleY(0.15)',
            transition: 'transform 0.3s',
          }}
        />
      ))}
    </div>
  );
}

function RecordMeetingsDemo({ isActive }: { isActive: boolean }) {
  const [timer, setTimer] = useState(0);
  const [lines, setLines] = useState(0);
  const [keyMoment, setKeyMoment] = useState(false);

  useEffect(() => {
    if (!isActive) { setTimer(0); setLines(0); setKeyMoment(false); return; }
    const tick = setInterval(() => setTimer(t => t + 1), 1000);
    const lt = TRANSCRIPT.map((_, i) => setTimeout(() => setLines(i + 1), 800 + i * 900));
    const km = setTimeout(() => setKeyMoment(true), 800 + 4 * 900 + 400);
    return () => { clearInterval(tick); lt.forEach(clearTimeout); clearTimeout(km); };
  }, [isActive]);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <motion.div {...demoEnter} className="space-y-3">
      <div className="rounded-xl border border-white/[0.08] overflow-hidden">
        <div className="relative h-28 sm:h-32 bg-[#0c1425]">
          <div className="grid grid-cols-4 h-full">
            {ATTENDEES.map((a, i) => (
              <div key={i} className="flex flex-col items-center justify-center border-r last:border-r-0 border-white/[0.04] gap-1.5">
                <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${a.color} flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white/10`}>
                  {a.initials}
                </div>
              </div>
            ))}
          </div>

          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-900/80 backdrop-blur-sm border border-white/[0.06]">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[9px] font-semibold text-red-400">REC</span>
          </div>
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-900/80 backdrop-blur-sm text-[10px] text-gray-300 border border-white/[0.06]">
            <Clock className="w-2.5 h-2.5" /><span className="font-mono">{fmt(timer)}</span>
          </div>
          <div className="absolute bottom-2.5 left-2.5">
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 backdrop-blur-sm">Zoom</span>
          </div>
          <div className="absolute bottom-2.5 right-2.5">
            <Waveform active={isActive && lines < TRANSCRIPT.length} />
          </div>
        </div>

        <div className="px-3 py-2 bg-white/[0.02] flex items-center justify-between border-t border-white/[0.04]">
          <div>
            <p className="text-[11px] font-medium text-gray-200">Q2 Strategy — MicroQuant</p>
            <p className="text-[9px] text-gray-500">4 attendees · Sarah Thompson</p>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-emerald-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Live Transcript</span>
          <span className="text-[9px] text-gray-600">{lines}/{TRANSCRIPT.length}</span>
        </div>
        {TRANSCRIPT.slice(0, lines).map((l, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex gap-2">
            <span className={`text-[9px] font-bold shrink-0 w-10 ${l.speaker === 'You' ? 'text-blue-400' : 'text-emerald-400'}`}>{l.speaker}</span>
            <p className="text-[10px] text-gray-400 leading-relaxed">{l.text}</p>
          </motion.div>
        ))}
        {lines < TRANSCRIPT.length && isActive && (
          <div className="flex items-center gap-1.5 text-[9px] text-gray-600">
            <div className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1 h-1 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-1 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            Transcribing...
          </div>
        )}
      </div>

      {keyMoment && (
        <motion.div
          initial={{ opacity: 0, x: 20, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-emerald-400">Intent Detected</p>
            <p className="text-[9px] text-gray-500">&ldquo;I&rsquo;ll send you a proposal&rdquo; — Commitment to next step</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CHAPTER 4: Analyze Meetings — Intelligence Dashboard
// ═══════════════════════════════════════════════════════════

function AnalyzeMeetingsDemo({ isActive }: { isActive: boolean }) {
  const [ready, setReady] = useState(false);
  const [bars, setBars] = useState(false);
  const [summary, setSummary] = useState(false);
  const [moments, setMoments] = useState(0);

  useEffect(() => {
    if (!isActive) { setReady(false); setBars(false); setSummary(false); setMoments(0); return; }
    const t1 = setTimeout(() => setReady(true), 700);
    const t2 = setTimeout(() => setBars(true), 1100);
    const t3 = setTimeout(() => setSummary(true), 2000);
    const mt = [0, 1, 2].map(i => setTimeout(() => setMoments(i + 1), 3200 + i * 300));
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); mt.forEach(clearTimeout); };
  }, [isActive]);

  if (!ready) {
    return (
      <motion.div {...demoEnter} className="flex items-center justify-center h-48 gap-3">
        <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
        <span className="text-xs text-gray-500 font-mono">Analyzing transcript...</span>
      </motion.div>
    );
  }

  const MOMENTS = [
    { icon: Zap, label: 'Intent Detected', text: '"I\'ll send you a proposal"', color: 'text-emerald-400 bg-emerald-500/10' },
    { icon: DollarSign, label: 'Budget Confirmed', text: '$18-24K annual range', color: 'text-blue-400 bg-blue-500/10' },
    { icon: Calendar, label: 'Timeline Set', text: 'Q2 rollout target', color: 'text-amber-400 bg-amber-500/10' },
  ];

  return (
    <motion.div {...demoEnter} className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-200">Q2 Strategy — MicroQuant</p>
          <p className="text-[10px] text-gray-500">32 min · 4 attendees · Sarah Thompson</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
          Positive
        </span>
      </div>

      <div className="space-y-2.5 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500">Sentiment</span>
            <span className="text-emerald-400 font-medium">82%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div className="h-full rounded-full bg-emerald-500" initial={{ width: '0%' }}
              animate={{ width: bars ? '82%' : '0%' }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500 flex items-center gap-1"><Star className="w-3 h-3" /> Coach Rating</span>
            <span className="text-emerald-400 font-medium">8.5/10</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div className="h-full rounded-full bg-emerald-500" initial={{ width: '0%' }}
              animate={{ width: bars ? '85%' : '0%' }}
              transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500 flex items-center gap-1"><Mic2 className="w-3 h-3" /> Talk Time</span>
            <span className="text-emerald-400 font-medium">Balanced</span>
          </div>
          <div className="flex gap-1">
            <div className="flex-1">
              <div className="text-[9px] text-gray-600 mb-0.5">Rep (38%)</div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div className="h-full rounded-full bg-blue-500" initial={{ width: '0%' }}
                  animate={{ width: bars ? '38%' : '0%' }}
                  transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[9px] text-gray-600 mb-0.5">Customer (62%)</div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div className="h-full rounded-full bg-violet-500" initial={{ width: '0%' }}
                  animate={{ width: bars ? '62%' : '0%' }}
                  transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {summary && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] space-y-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-violet-400" />
            <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">AI Summary</p>
          </div>
          <p className="text-[10px] text-gray-300 leading-relaxed">
            Strong buying signals from Sarah. Budget confirmed at $18-24K. Key blocker is CRM adoption timeline.
          </p>
          <p className="text-[10px] text-emerald-400 font-medium">Next: Send proposal with custom pricing by EOD Friday.</p>
        </motion.div>
      )}

      {moments > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Key Moments</p>
          {MOMENTS.slice(0, moments).map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${m.color}`}>
                <m.icon className="w-3 h-3" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-gray-300">{m.label}</p>
                <p className="text-[9px] text-gray-500 truncate">{m.text}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CHAPTER 5: Follow Up — Proposal + Email + Slack Flow
// ═══════════════════════════════════════════════════════════

const PROPOSAL_STEPS = [
  { icon: Search, label: 'Context Assembly' },
  { icon: FileText, label: 'AI Composition' },
  { icon: Sparkles, label: 'Template Merge' },
  { icon: FileText, label: 'PDF Rendering' },
  { icon: CheckCircle2, label: 'Delivery' },
];

function FollowUpDemo({ isActive }: { isActive: boolean }) {
  const [step, setStep] = useState(-1);
  const [pageLines, setPageLines] = useState(0);
  const [coverReady, setCoverReady] = useState(false);
  const [done, setDone] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showSlack, setShowSlack] = useState(false);

  useEffect(() => {
    if (!isActive) { setStep(-1); setPageLines(0); setCoverReady(false); setDone(false); setShowEmail(false); setShowSlack(false); return; }
    const t: ReturnType<typeof setTimeout>[] = [];

    PROPOSAL_STEPS.forEach((_, i) => t.push(setTimeout(() => setStep(i), 300 + i * 450)));

    t.push(setTimeout(() => setCoverReady(true), 900));
    for (let l = 1; l <= 7; l++) t.push(setTimeout(() => setPageLines(l), 1400 + l * 180));

    t.push(setTimeout(() => setDone(true), 2800));
    t.push(setTimeout(() => setShowEmail(true), 3400));
    t.push(setTimeout(() => setShowSlack(true), 4400));

    return () => t.forEach(clearTimeout);
  }, [isActive]);

  const progress = step >= 0 ? Math.round(((step + 1) / PROPOSAL_STEPS.length) * 100) : 0;

  return (
    <motion.div {...demoEnter} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-300" />
          <div>
            <p className="text-xs font-bold text-gray-200">{done ? 'Proposal Ready' : 'Generating Proposal'}</p>
            <p className="text-[10px] text-gray-500">MicroQuant × 60</p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-gray-500">{progress}%</span>
      </div>

      <div className="flex gap-5">
        <div className="w-[140px] shrink-0 relative">
          <div className="absolute left-[11px] top-3 bottom-3 w-px bg-white/[0.06]" />
          {PROPOSAL_STEPS.map((s, i) => {
            const active2 = i === step;
            const done2 = i < step || done;
            return (
              <div key={i} className="flex items-center gap-2.5 py-1.5 relative">
                <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  done2 ? 'bg-emerald-500/20 text-emerald-400'
                  : active2 ? 'bg-violet-500/20 text-violet-400 ring-2 ring-violet-500/30'
                  : 'bg-white/[0.06] text-gray-600'
                }`}>
                  {done2 ? <Check className="w-3 h-3" /> : active2 ? <Loader2 className="w-3 h-3 animate-spin" /> : <s.icon className="w-3 h-3" />}
                </div>
                <p className={`text-[10px] font-medium leading-tight ${active2 ? 'text-violet-400' : done2 ? 'text-gray-300' : 'text-gray-600'}`}>{s.label}</p>
              </div>
            );
          })}
        </div>

        <div className="flex-1 flex gap-2 items-start">
          <div className="flex-1 bg-white rounded-lg border border-gray-200/80 overflow-hidden shadow-md" style={{ aspectRatio: '8.5/11' }}>
            <div className="p-2.5 h-full flex flex-col justify-between">
              {coverReady ? (
                <>
                  <div>
                    <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="h-1.5 w-2/3 bg-violet-500 rounded-full origin-left mb-5" />
                    <div className="space-y-2 mt-6">
                      <motion.div initial={{ width: 0 }} animate={{ width: '80%' }} transition={{ duration: 0.3, delay: 0.2 }} className="h-1 bg-gray-400 rounded-full" />
                      <motion.div initial={{ width: 0 }} animate={{ width: '50%' }} transition={{ duration: 0.3, delay: 0.3 }} className="h-1 bg-gray-300 rounded-full" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <motion.div initial={{ width: 0 }} animate={{ width: '40%' }} transition={{ duration: 0.3, delay: 0.5 }} className="h-0.5 bg-gray-300 rounded-full" />
                    <motion.div initial={{ width: 0 }} animate={{ width: '30%' }} transition={{ duration: 0.3, delay: 0.6 }} className="h-0.5 bg-gray-300 rounded-full" />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-violet-400 rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="h-1 bg-gray-100">
              <motion.div className="h-full bg-violet-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
            </div>
          </div>
          <div className="flex-1 bg-white rounded-lg border border-gray-200/80 overflow-hidden shadow-md" style={{ aspectRatio: '8.5/11' }}>
            <div className="p-2.5 h-full">
              {pageLines > 0 ? (
                <div className="space-y-2.5">
                  {pageLines >= 1 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-gray-300 rounded-sm" /><div className="h-0.5 w-14 bg-gray-400 rounded-full" /></motion.div>}
                  {pageLines >= 2 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="flex items-center gap-1"><div className="w-0.5 h-2.5 bg-violet-400 rounded-full" /><div className="h-0.5 w-16 bg-gray-400 rounded-full" /></div></motion.div>}
                  {pageLines >= 3 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1 mt-1"><div className="h-0.5 w-full bg-gray-200 rounded-full" /><div className="h-0.5 w-11/12 bg-gray-200 rounded-full" /><div className="h-0.5 w-full bg-gray-200 rounded-full" /></motion.div>}
                  {pageLines >= 5 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1 mt-1"><div className="flex items-center gap-1"><div className="w-0.5 h-2.5 bg-violet-400 rounded-full" /><div className="h-0.5 w-20 bg-gray-400 rounded-full" /></div><div className="h-0.5 w-full bg-gray-200 rounded-full" /><div className="h-0.5 w-4/5 bg-gray-200 rounded-full" /></motion.div>}
                  {pageLines >= 7 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1 mt-1"><div className="flex items-center gap-1"><div className="w-0.5 h-2.5 bg-violet-400 rounded-full" /><div className="h-0.5 w-14 bg-gray-400 rounded-full" /></div><div className="h-0.5 w-full bg-gray-200 rounded-full" /><div className="h-0.5 w-3/4 bg-gray-200 rounded-full" /></motion.div>}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-violet-400 rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showEmail && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: [0.22, 1, 0.36, 1] }}
          className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] font-medium text-gray-300">Follow-up Email</span>
            <span className="ml-auto text-[9px] text-emerald-400 font-medium">Ready to send</span>
          </div>
          <div className="text-[10px] text-gray-500 space-y-0.5">
            <p><span className="text-gray-400">To:</span> sarah@microquant.com</p>
            <p><span className="text-gray-400">Subject:</span> Follow-up: 60 × MicroQuant</p>
          </div>
          <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
            Hi Sarah, Great speaking today. As discussed, I&apos;ve attached the proposal with custom pricing for your team...
          </p>
          <div className="flex items-center gap-1.5 pt-0.5">
            <div className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">
              <Paperclip className="w-2.5 h-2.5" />Proposal.pdf
            </div>
          </div>
        </motion.div>
      )}

      {showSlack && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: [0.22, 1, 0.36, 1] }}
          className="rounded-lg border border-[#4A154B]/30 bg-[#4A154B]/10 p-2.5">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded bg-[#4A154B] flex items-center justify-center shrink-0">
              <MessageSquare className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-200">60 Bot</span>
                <span className="text-[9px] text-gray-600">#deals</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">Follow-up sent to Sarah T. · Proposal attached · CRM updated</p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CHAPTER 6: Nurture Pipeline — Kanban + Deal Movement
// ═══════════════════════════════════════════════════════════

const STAGES = [
  { label: 'Discovery', deals: [{ name: 'MetricFlow', val: '$12K', health: 72 }] },
  { label: 'Proposal', deals: [{ name: 'DataForge', val: '$18K', health: 87 }, { name: 'ScaleOps', val: '$24K', health: 65 }] },
  { label: 'Negotiation', deals: [{ name: 'NeuralPath', val: '$32K', health: 91 }] },
  { label: 'Closed Won', deals: [] as { name: string; val: string; health: number }[] },
];

function NurturePipelineDemo({ isActive }: { isActive: boolean }) {
  const [cols, setCols] = useState(0);
  const [dealMoved, setDealMoved] = useState(false);
  const [alert, setAlert] = useState(false);
  const [revenue, setRevenue] = useState('$86K');

  useEffect(() => {
    if (!isActive) { setCols(0); setDealMoved(false); setAlert(false); setRevenue('$86K'); return; }
    const t: ReturnType<typeof setTimeout>[] = [];
    STAGES.forEach((_, i) => t.push(setTimeout(() => setCols(i + 1), 250 + i * 250)));
    t.push(setTimeout(() => setDealMoved(true), 2200));
    t.push(setTimeout(() => setRevenue('$118K'), 2800));
    t.push(setTimeout(() => setAlert(true), 3500));
    return () => t.forEach(clearTimeout);
  }, [isActive]);

  return (
    <motion.div {...demoEnter} className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-medium text-gray-200">Pipeline</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">4 deals</span>
          <motion.span
            key={revenue}
            initial={revenue === '$118K' ? { scale: 1.2, color: '#34d399' } : undefined}
            animate={{ scale: 1, color: revenue === '$118K' ? '#34d399' : '#6b7280' }}
            transition={spring}
            className="text-[10px] font-bold"
          >
            {revenue}
          </motion.span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {STAGES.map((stage, si) => {
          if (si >= cols) return <div key={si} />;
          const deals = [...stage.deals];
          if (dealMoved && si === 3) deals.push({ name: 'NeuralPath', val: '$32K', health: 91 });
          const hideFromNeg = dealMoved && si === 2;

          return (
            <motion.div key={si} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: si * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              <div className="px-2 py-1.5 border-b border-white/[0.04]">
                <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider truncate">{stage.label}</p>
                <p className="text-[9px] text-gray-600">{deals.length} {deals.length === 1 ? 'deal' : 'deals'}</p>
              </div>
              <div className="p-1 space-y-1 min-h-[60px]">
                {deals.map(d => {
                  if (hideFromNeg && d.name === 'NeuralPath') {
                    return <motion.div key={d.name} animate={{ opacity: 0, scale: 0.8, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.3 }} className="p-1.5 rounded bg-white/[0.04] overflow-hidden">
                      <p className="text-[9px] text-gray-400">{d.name}</p>
                    </motion.div>;
                  }
                  const isNew = dealMoved && si === 3 && d.name === 'NeuralPath';
                  return (
                    <motion.div key={d.name}
                      initial={isNew ? { opacity: 0, x: -16, scale: 0.9 } : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                      transition={isNew ? { type: 'spring', stiffness: 300, damping: 22 } : { delay: 0.05 }}
                      className={`p-1.5 rounded border ${isNew ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/[0.04] border-white/[0.06]'}`}>
                      <p className="text-[9px] font-medium text-gray-300 truncate">{d.name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[8px] font-mono text-gray-500">{d.val}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${d.health >= 80 ? 'bg-emerald-500' : d.health >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} />
                      </div>
                    </motion.div>
                  );
                })}
                {si === 3 && !dealMoved && <div className="flex items-center justify-center h-10"><span className="text-[8px] text-gray-700">Drop zone</span></div>}
              </div>
            </motion.div>
          );
        })}
      </div>

      {alert && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ ease: [0.22, 1, 0.36, 1] }}
          className="p-2.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/15">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-amber-400">At-risk: ScaleOps ($24K)</p>
              <p className="text-[9px] text-gray-500">No activity in 7 days · Auto-scheduling check-in</p>
            </div>
          </div>
        </motion.div>
      )}

      {dealMoved && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-medium">NeuralPath moved to Closed Won · $32K</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  Horizontal Step Navigation (V16 — replaces V15 sidebar)
// ═══════════════════════════════════════════════════════════

const DEMO_COMPONENTS = [
  FindProspectsDemo, SendMessagesDemo, RecordMeetingsDemo,
  AnalyzeMeetingsDemo, FollowUpDemo, NurturePipelineDemo,
];

function StepNav({ activeIndex, onSelect, progressKey, isPaused }: {
  activeIndex: number; onSelect: (i: number) => void; progressKey: number; isPaused: boolean;
}) {
  return (
    <div className="w-full">
      {/* Mobile: scrollable pills */}
      <div className="flex lg:hidden gap-2 overflow-x-auto pb-3 scrollbar-hide px-1">
        {CHAPTERS.map((ch, i) => {
          const active = i === activeIndex;
          const done = i < activeIndex;
          return (
            <button key={ch.id} onClick={() => onSelect(i)}
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium transition-all ${
                active ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                : done ? 'bg-violet-500/10 text-violet-400'
                : 'bg-white/5 text-gray-500 hover:bg-white/10'
              }`}>
              {done ? <Check className="w-3.5 h-3.5" /> : <ch.icon className="w-3.5 h-3.5" />}
              {ch.shortLabel}
            </button>
          );
        })}
      </div>

      {/* Desktop: horizontal numbered steps with connecting line */}
      <div className="hidden lg:block">
        <div className="relative flex items-start justify-between max-w-4xl mx-auto">
          {/* Connecting line */}
          <div className="absolute top-5 left-[40px] right-[40px] h-px bg-white/[0.08]" />
          <div className="absolute top-5 left-[40px] h-px bg-gradient-to-r from-violet-500 to-violet-500/0 transition-all duration-500"
            style={{ width: `${Math.max(0, (activeIndex / (CHAPTERS.length - 1)) * 100)}%`, maxWidth: 'calc(100% - 80px)' }} />

          {CHAPTERS.map((ch, i) => {
            const Icon = ch.icon;
            const active = i === activeIndex;
            const done = i < activeIndex;
            return (
              <button key={ch.id} onClick={() => onSelect(i)}
                className="relative flex flex-col items-center gap-2 group z-10 w-[120px]">
                {/* Numbered circle */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  active
                    ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/40 scale-110'
                    : done
                    ? 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30'
                    : 'bg-white/[0.06] text-gray-600 group-hover:bg-white/[0.1] group-hover:text-gray-400'
                }`}>
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>

                {/* Label */}
                <span className={`text-[11px] font-semibold text-center leading-tight transition-colors ${
                  active ? 'text-white' : done ? 'text-violet-400/80' : 'text-gray-600 group-hover:text-gray-400'
                }`}>{ch.shortLabel}</span>

                {/* Active glow ring */}
                {active && (
                  <motion.div
                    layoutId="step-glow"
                    className="absolute -top-1 w-12 h-12 rounded-full border-2 border-violet-400/30"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Active chapter info + progress bar below steps */}
        <div className="mt-6 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              <p className="text-lg font-bold text-white">{CHAPTERS[activeIndex].label}</p>
              <p className="text-sm text-gray-500 mt-1">{CHAPTERS[activeIndex].subtitle}</p>
            </motion.div>
          </AnimatePresence>

          {/* Progress bar */}
          <div className="mt-3 max-w-xs mx-auto h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              key={`p-${progressKey}`}
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
              style={{
                animation: `progressFill ${CHAPTER_DURATION}ms linear forwards`,
                animationPlayState: isPaused ? 'paused' : 'running',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  Demo Viewport (V16 — gradient border, wider, minimal chrome)
// ═══════════════════════════════════════════════════════════

function DemoViewport({ activeIndex }: { activeIndex: number }) {
  const DemoComponent = DEMO_COMPONENTS[activeIndex];
  const chapter = CHAPTERS[activeIndex];

  return (
    <div className="relative max-w-3xl mx-auto">
      {/* Animated gradient border glow */}
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-violet-500/30 blur-sm" />
      <div className="absolute -inset-px rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/20 via-fuchsia-500/20 to-violet-500/20"
          style={{ animation: 'borderRotate 6s linear infinite' }} />
      </div>

      {/* Main card */}
      <div className="relative rounded-2xl border border-white/[0.1] overflow-hidden bg-[#0c0c1a] shadow-2xl shadow-violet-500/10">
        {/* Minimal browser chrome */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-[#111128]">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-4 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
              <span className="text-[11px] text-gray-500 font-mono">app.use60.com / {chapter.id}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-violet-400 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Live
          </div>
        </div>

        {/* Demo content */}
        <div className="p-5 sm:p-6 min-h-[400px] sm:min-h-[440px] bg-gradient-to-b from-[#0c0c1a] to-[#080816]">
          <AnimatePresence mode="wait">
            <DemoComponent key={chapter.id} isActive />
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  Main Component (V16 — cinematic stacked layout)
// ═══════════════════════════════════════════════════════════

export function InteractiveDemoV16() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const isPausedRef = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: false, margin: '-100px' });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || !isInView) return;
    const id = setInterval(() => {
      if (!isPausedRef.current) {
        setActiveIndex(i => (i + 1) % CHAPTERS.length);
        setProgressKey(k => k + 1);
      }
    }, CHAPTER_DURATION);
    return () => clearInterval(id);
  }, [prefersReducedMotion, isInView]);

  const handleSelect = useCallback((index: number) => {
    setActiveIndex(index);
    setProgressKey(k => k + 1);
  }, []);

  const handleMouseEnter = useCallback(() => { isPausedRef.current = true; setIsPaused(true); }, []);
  const handleMouseLeave = useCallback(() => { isPausedRef.current = false; setIsPaused(false); }, []);

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32 overflow-hidden bg-[#060612]" id="demo">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-violet-600/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-fuchsia-600/[0.05] rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-violet-500/[0.03] rounded-full blur-[80px]" />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" aria-hidden="true"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Heading — gradient text, completely different from V15 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-16 md:mb-20"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/[0.06] mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs font-medium text-violet-400 tracking-wide">See it in action</span>
          </div>
          <h2 className="font-display font-black text-4xl md:text-6xl lg:text-7xl tracking-tight leading-[0.95]">
            <span className="bg-gradient-to-r from-white via-violet-200 to-white bg-clip-text text-transparent">
              Your AI sales engine
            </span>
          </h2>
          <p className="mt-5 text-gray-500 text-base md:text-lg font-body max-w-xl mx-auto leading-relaxed">
            From first contact to closed deal — watch every step happen automatically.
          </p>
        </motion.div>

        {/* Horizontal step nav */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-10"
        >
          <StepNav activeIndex={activeIndex} onSelect={handleSelect} progressKey={progressKey} isPaused={isPaused} />
        </motion.div>

        {/* Full-width demo viewport */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, delay: 0.2 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <DemoViewport activeIndex={activeIndex} />
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ delay: 0.3 }}
          className="text-center mt-12"
        >
          <a href="https://app.use60.com/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-violet-500 text-white text-sm font-semibold hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/25 group">
            Start automating your sales
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </a>
          <p className="text-xs text-gray-600 mt-3">Free forever · No credit card required</p>
        </motion.div>
      </div>

      {/* CSS keyframes */}
      <style>{`
        @keyframes progressFill {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes waveform {
          0%, 100% { transform: scaleY(0.15); }
          50% { transform: scaleY(1); }
        }
        @keyframes borderRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}
