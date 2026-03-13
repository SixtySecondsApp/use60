/**
 * InteractiveDemoV15 — Dense, app-realistic demos
 *
 * Fixes from user feedback:
 * - Progress bar no longer reverses on hover (uses CSS animation, paused via class)
 * - Section heading is punchier
 * - Follow Up uses the real "Generating Proposal" modal (5 steps + dual page preview)
 * - Chapter nav items are cleaner
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Search, Send, Mic, BarChart3, Reply, TrendingUp,
  Check, Play, FileText, Clock, MessageSquare, Zap,
  ArrowRight, Loader2, Star, Mic2, Video,
  CheckCircle2, Globe, Users, ChevronRight, X,
  Mail, Paperclip, DollarSign, Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────

const CHAPTER_DURATION = 6000;

interface Chapter {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

const CHAPTERS: Chapter[] = [
  { id: 'find', icon: Search, label: 'Find Prospects', description: 'AI-powered prospecting across 150M+ profiles' },
  { id: 'send', icon: Send, label: 'Send Messages', description: 'Personalized outreach with video at scale' },
  { id: 'record', icon: Mic, label: 'Record Meetings', description: 'Every word captured automatically' },
  { id: 'analyze', icon: BarChart3, label: 'Analyze Meetings', description: 'Turn conversations into intelligence' },
  { id: 'followup', icon: Reply, label: 'Follow Up', description: 'Emails and proposals, drafted for you' },
  { id: 'nurture', icon: TrendingUp, label: 'Nurture Pipeline', description: 'Spot deals about to slip' },
];

// ─── Animation helpers ──────────────────────────────────────

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

// ─── Shared: Enrichment Cell ────────────────────────────────

type CellState = 'empty' | 'loading' | 'done';

function EnrichCell({ state, value, className = '' }: { state: CellState; value: string; className?: string }) {
  if (state === 'empty') return <span className={`text-gray-600 font-mono ${className}`}>---</span>;
  if (state === 'loading') return <Loader2 className={`w-3 h-3 text-violet-400 animate-spin ${className}`} />;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`text-emerald-400 font-medium ${className}`}
    >
      {value}
    </motion.span>
  );
}

// ═══════════════════════════════════════════════════════════
// Chapter 1: Find Prospects — Ops Table with Enrichment
// ═══════════════════════════════════════════════════════════

const PROSPECTS = [
  { initials: 'JK', name: 'Jessica Kim', title: 'CEO', company: 'DataForge', bg: 'bg-blue-600', source: 'Apollo' },
  { initials: 'MR', name: 'Marcus Rivera', title: 'Founder', company: 'NeuralPath', bg: 'bg-violet-600', source: 'AI Ark' },
  { initials: 'AL', name: 'Aisha Lewis', title: 'CTO', company: 'ScaleOps', bg: 'bg-emerald-600', source: 'Apollo' },
  { initials: 'TP', name: 'Tom Park', title: 'CEO', company: 'CloudSync', bg: 'bg-amber-600', source: 'Explorium' },
  { initials: 'SN', name: 'Sara Nakamura', title: 'Founder', company: 'MetricFlow', bg: 'bg-rose-600', source: 'AI Ark' },
];

const PHONES = ['(415) 555-0142', '(212) 555-0198', '(310) 555-0167', '(617) 555-0201', '(503) 555-0134'];
const EMAILS_ENRICHED = ['jessica@dataforge.io', 'marcus@neuralpath.ai', 'aisha@scaleops.com', 'tom@cloudsync.io', 'sara@metricflow.co'];

function FindProspectsDemo({ isActive }: { isActive: boolean }) {
  const [visibleRows, setVisibleRows] = useState(0);
  const [enrichPhase, setEnrichPhase] = useState<Record<number, Record<string, CellState>>>({});
  const [showCount, setShowCount] = useState(false);

  useEffect(() => {
    if (!isActive) { setVisibleRows(0); setEnrichPhase({}); setShowCount(false); return; }
    const timers: ReturnType<typeof setTimeout>[] = [];

    PROSPECTS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleRows(i + 1), 200 + i * 180));
    });

    PROSPECTS.forEach((_, i) => {
      const base = 200 + i * 180 + 400;
      timers.push(setTimeout(() => setEnrichPhase(p => ({ ...p, [i]: { ...p[i], email: 'loading' } })), base));
      timers.push(setTimeout(() => setEnrichPhase(p => ({ ...p, [i]: { ...p[i], email: 'done' } })), base + 350));
      timers.push(setTimeout(() => setEnrichPhase(p => ({ ...p, [i]: { ...p[i], phone: 'loading' } })), base + 200));
      timers.push(setTimeout(() => setEnrichPhase(p => ({ ...p, [i]: { ...p[i], phone: 'done' } })), base + 600));
    });

    timers.push(setTimeout(() => setShowCount(true), 2800));
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <motion.div {...fadeIn} className="space-y-2">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
        <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        <span className="text-xs text-gray-400 truncate">SaaS founders in New York raising Series A</span>
        {showCount && (
          <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="ml-auto text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 dark:bg-emerald-500/10 dark:text-emerald-400 font-medium whitespace-nowrap">
            47 results
          </motion.span>
        )}
      </div>

      {/* Ops table */}
      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_90px_60px] gap-px bg-white/[0.03]">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Contact</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Email</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Phone</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Source</div>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {PROSPECTS.slice(0, visibleRows).map((p, i) => {
            const phase = enrichPhase[i] || {};
            return (
              <motion.div key={p.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}
                className="grid grid-cols-[1fr_100px_90px_60px] gap-px items-center bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-2 px-3 py-2 min-w-0">
                  <div className={`w-6 h-6 rounded-full ${p.bg} flex items-center justify-center text-[9px] font-bold text-white shrink-0`}>{p.initials}</div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-gray-200 truncate">{p.name}</p>
                    <p className="text-[9px] text-gray-500 truncate">{p.title} · {p.company}</p>
                  </div>
                </div>
                <div className="px-2 py-2">
                  <EnrichCell state={(phase.email as CellState) || 'empty'} value={EMAILS_ENRICHED[i]} className="text-[10px] truncate" />
                </div>
                <div className="px-2 py-2">
                  <EnrichCell state={(phase.phone as CellState) || 'empty'} value={PHONES[i]} className="text-[10px] truncate" />
                </div>
                <div className="px-2 py-2 flex justify-center">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">{p.source}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Enrichment status */}
      {visibleRows >= 3 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-[11px] text-emerald-400">
          <Check className="w-3.5 h-3.5" />
          <span className="font-medium">Enriching contacts across 3 data providers...</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Chapter 2: Send Messages — Outreach Table with Video
// ═══════════════════════════════════════════════════════════

const OUTREACH = [
  { name: 'Jessica Kim', company: 'DataForge', msg: 'Personalized intro', videoState: 'ready' },
  { name: 'Marcus Rivera', company: 'NeuralPath', msg: 'Follow-up angle', videoState: 'generating' },
  { name: 'Aisha Lewis', company: 'ScaleOps', msg: 'Pain point focus', videoState: 'scripting' },
  { name: 'Tom Park', company: 'CloudSync', msg: 'Referral hook', videoState: 'idle' },
  { name: 'Sara Nakamura', company: 'MetricFlow', msg: 'Case study', videoState: 'idle' },
];

function SendMessagesDemo({ isActive }: { isActive: boolean }) {
  const [visibleRows, setVisibleRows] = useState(0);
  const [sentRows, setSentRows] = useState<Set<number>>(new Set());
  const [sendingRow, setSendingRow] = useState(-1);

  useEffect(() => {
    if (!isActive) { setVisibleRows(0); setSentRows(new Set()); setSendingRow(-1); return; }
    const timers: ReturnType<typeof setTimeout>[] = [];
    OUTREACH.forEach((_, i) => timers.push(setTimeout(() => setVisibleRows(i + 1), 200 + i * 200)));
    OUTREACH.forEach((_, i) => {
      const base = 1800 + i * 600;
      timers.push(setTimeout(() => setSendingRow(i), base));
      timers.push(setTimeout(() => { setSentRows(prev => new Set([...prev, i])); setSendingRow(-1); }, base + 400));
    });
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  const videoConfig: Record<string, { label: string; color: string }> = {
    idle: { label: 'Pending', color: 'text-gray-500 bg-gray-500/10' },
    scripting: { label: 'Scripting', color: 'text-yellow-400 bg-yellow-500/10' },
    generating: { label: 'Rendering', color: 'text-violet-400 bg-violet-500/10' },
    ready: { label: 'Ready', color: 'text-emerald-400 bg-emerald-500/10' },
  };

  return (
    <motion.div {...fadeIn} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-blue-400 dark:text-emerald-400" />
          <span className="text-xs font-medium text-gray-200">Outreach Campaign</span>
        </div>
        <span className="text-[10px] text-gray-500">{sentRows.size}/{OUTREACH.length} sent</span>
      </div>

      <div className="rounded-lg border border-white/[0.06] overflow-hidden text-[10px]">
        <div className="grid grid-cols-[1fr_80px_70px_50px] bg-white/[0.03] px-3 py-1.5 gap-2 border-b border-white/[0.04]">
          <span className="font-semibold text-gray-500 uppercase tracking-wider">Contact</span>
          <span className="font-semibold text-gray-500 uppercase tracking-wider">Message</span>
          <span className="font-semibold text-gray-500 uppercase tracking-wider">Video</span>
          <span className="font-semibold text-gray-500 uppercase tracking-wider text-center">Sent</span>
        </div>
        <div className="divide-y divide-white/[0.03]">
          {OUTREACH.slice(0, visibleRows).map((row, i) => {
            const vc = videoConfig[row.videoState];
            const isSent = sentRows.has(i);
            const isSending = sendingRow === i;
            return (
              <motion.div key={row.name} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                className={`grid grid-cols-[1fr_80px_70px_50px] px-3 py-1.5 gap-2 items-center transition-colors ${isSent ? 'bg-emerald-500/[0.03]' : 'hover:bg-white/[0.02]'}`}>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-gray-200 truncate">{row.name}</p>
                  <p className="text-[9px] text-gray-500 truncate">{row.company}</p>
                </div>
                <p className="text-[10px] text-gray-400 truncate">{row.msg}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${vc.color} text-center`}>{vc.label}</span>
                <div className="flex justify-center">
                  {isSent ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    </motion.div>
                  ) : isSending ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-gray-700" />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {visibleRows >= 2 && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-2.5 rounded-lg border border-violet-500/20 bg-violet-500/[0.04]">
          <div className="w-16 h-10 rounded bg-violet-500/10 flex items-center justify-center shrink-0 border border-violet-500/10">
            <Play className="w-4 h-4 text-violet-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-300">AI Video for Jessica Kim</p>
            <p className="text-[9px] text-gray-500">15s personalized intro · Ready to send</p>
          </div>
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 shrink-0">Ready</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Chapter 3: Record Meetings — Compact Card + Transcript
// ═══════════════════════════════════════════════════════════

const ATTENDEES = [
  { initials: 'YO', color: 'bg-blue-600' },
  { initials: 'ST', color: 'bg-emerald-600' },
  { initials: 'JC', color: 'bg-amber-600' },
  { initials: 'LP', color: 'bg-violet-600' },
];

const LIVE_TRANSCRIPT = [
  { speaker: 'You', text: 'Tell me about your current sales stack.' },
  { speaker: 'Sarah', text: "We use Salesforce but it's barely configured." },
  { speaker: 'You', text: "What's the biggest time sink for your team?" },
  { speaker: 'Sarah', text: 'Follow-ups. Nobody does them consistently.' },
  { speaker: 'You', text: "I'll send you a proposal this afternoon." },
];

function RecordMeetingsDemo({ isActive }: { isActive: boolean }) {
  const [timer, setTimer] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (!isActive) { setTimer(0); setVisibleLines(0); return; }
    const interval = setInterval(() => setTimer(t => t + 1), 1000);
    const lineTimers = LIVE_TRANSCRIPT.map((_, i) => setTimeout(() => setVisibleLines(i + 1), 1000 + i * 900));
    return () => { clearInterval(interval); lineTimers.forEach(clearTimeout); };
  }, [isActive]);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <motion.div {...fadeIn} className="space-y-3">
      <div className="rounded-xl border border-gray-700/30 overflow-hidden">
        <div className="relative h-32 sm:h-36 bg-[#0f172a]">
          <div className="grid grid-cols-4 h-full">
            {ATTENDEES.map((a, i) => (
              <div key={i} className="flex items-center justify-center border-r last:border-r-0 border-gray-800/40">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${a.color} flex items-center justify-center text-white text-xs font-bold`}>{a.initials}</div>
              </div>
            ))}
          </div>
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-900/80 backdrop-blur-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[9px] font-semibold text-red-400">REC</span>
          </div>
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-900/80 backdrop-blur-sm text-[9px] text-gray-300">
            <Clock className="w-2.5 h-2.5" /><span className="font-mono">{fmt(timer)}</span>
          </div>
          <div className="absolute bottom-2 left-2">
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 backdrop-blur-sm">Zoom</span>
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
          <span className="text-[9px] text-gray-600">{visibleLines}/{LIVE_TRANSCRIPT.length}</span>
        </div>
        {LIVE_TRANSCRIPT.slice(0, visibleLines).map((line, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
            <span className={`text-[9px] font-bold shrink-0 w-8 ${line.speaker === 'You' ? 'text-blue-400' : 'text-emerald-400'}`}>{line.speaker}</span>
            <p className="text-[10px] text-gray-400 leading-relaxed">{line.text}</p>
          </motion.div>
        ))}
        {visibleLines < LIVE_TRANSCRIPT.length && isActive && (
          <div className="flex items-center gap-1.5 text-[9px] text-gray-600">
            <div className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1 h-1 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-1 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            Transcribing...
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Chapter 4: Analyze Meetings — Analytics Dashboard
// ═══════════════════════════════════════════════════════════

function AnalyzeMeetingsDemo({ isActive }: { isActive: boolean }) {
  const [ready, setReady] = useState(false);
  const [barsReady, setBarsReady] = useState(false);
  const [momentsReady, setMomentsReady] = useState(0);

  useEffect(() => {
    if (!isActive) { setReady(false); setBarsReady(false); setMomentsReady(0); return; }
    const t1 = setTimeout(() => setReady(true), 600);
    const t2 = setTimeout(() => setBarsReady(true), 1000);
    const mt = [0, 1, 2].map(i => setTimeout(() => setMomentsReady(i + 1), 2200 + i * 300));
    return () => { clearTimeout(t1); clearTimeout(t2); mt.forEach(clearTimeout); };
  }, [isActive]);

  if (!ready) {
    return (
      <motion.div {...fadeIn} className="flex items-center justify-center h-48 gap-3">
        <Loader2 className="w-4 h-4 text-blue-400 dark:text-emerald-400 animate-spin" />
        <span className="text-xs text-gray-500 font-mono">Analyzing transcript...</span>
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeIn} className="space-y-3">
      {/* Meeting header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-200">Q2 Strategy — MicroQuant</p>
          <p className="text-[10px] text-gray-500">32 min · 4 attendees · Sarah Thompson</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Positive</span>
      </div>

      {/* Analytics card — single container like V14 */}
      <div className="space-y-2.5 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
        {/* Sentiment */}
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500">Sentiment</span>
            <span className="text-emerald-400 font-medium">82%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div className="h-full rounded-full bg-emerald-500" initial={{ width: '0%' }} animate={{ width: barsReady ? '82%' : '0%' }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </div>

        {/* Coach Rating */}
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500 flex items-center gap-1"><Star className="w-3 h-3" /> Coach Rating</span>
            <span className="text-emerald-400 font-medium">8.5/10</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div className="h-full rounded-full bg-emerald-500" initial={{ width: '0%' }} animate={{ width: barsReady ? '85%' : '0%' }} transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </div>

        {/* Talk Time */}
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500 flex items-center gap-1"><Mic2 className="w-3 h-3" /> Talk Time</span>
            <span className="text-emerald-400 font-medium">Balanced</span>
          </div>
          <div className="flex gap-1">
            <div className="flex-1">
              <div className="text-[9px] text-gray-600 mb-0.5">Rep (38%)</div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div className="h-full rounded-full bg-blue-500" initial={{ width: '0%' }} animate={{ width: barsReady ? '38%' : '0%' }} transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[9px] text-gray-600 mb-0.5">Customer (62%)</div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div className="h-full rounded-full bg-violet-500" initial={{ width: '0%' }} animate={{ width: barsReady ? '62%' : '0%' }} transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key moments */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Key Moments</p>
        {[
          { icon: Zap, label: 'Intent Detected', text: '"I\'ll send you a proposal"', color: 'text-emerald-400 bg-emerald-500/10' },
          { icon: DollarSign, label: 'Budget Confirmed', text: '$18-24K annual range', color: 'text-blue-400 bg-blue-500/10' },
          { icon: Calendar, label: 'Timeline Set', text: 'Q2 rollout target', color: 'text-amber-400 bg-amber-500/10' },
        ].slice(0, momentsReady).map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }}
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
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Chapter 5: Follow Up — Real Proposal Generation Modal
// Matches the actual "Generating Proposal" UI from screenshots
// ═══════════════════════════════════════════════════════════

const PROPOSAL_STEPS = [
  { icon: Search, label: 'Context Assembly', desc: 'Gathering deal context, meeting notes, and company data...' },
  { icon: FileText, label: 'AI Composition', desc: 'Writing proposal sections with your style preferences...' },
  { icon: Zap, label: 'Template Merge', desc: 'Applying your brand template and formatting...' },
  { icon: FileText, label: 'PDF Rendering', desc: 'Generating pixel-perfect PDF via Gotenberg...' },
  { icon: CheckCircle2, label: 'Delivery', desc: 'Preparing download and notifications...' },
];

function FollowUpDemo({ isActive }: { isActive: boolean }) {
  const [activeStep, setActiveStep] = useState(-1);
  const [pageLines, setPageLines] = useState(0); // Lines revealed on right page
  const [coverReady, setCoverReady] = useState(false);
  const [done, setDone] = useState(false);
  const [statusText, setStatusText] = useState('Gathering context...');

  useEffect(() => {
    if (!isActive) { setActiveStep(-1); setPageLines(0); setCoverReady(false); setDone(false); setStatusText('Gathering context...'); return; }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let delay = 300;

    // Step through each phase
    PROPOSAL_STEPS.forEach((step, i) => {
      timers.push(setTimeout(() => { setActiveStep(i); setStatusText(step.desc); }, delay));
      delay += 800;
    });

    // Cover page elements appear
    timers.push(setTimeout(() => setCoverReady(true), 1100));
    // Right page content lines fill in progressively
    for (let l = 1; l <= 8; l++) {
      timers.push(setTimeout(() => setPageLines(l), 1800 + l * 200));
    }
    // Done
    timers.push(setTimeout(() => { setDone(true); setStatusText('Proposal ready!'); }, delay + 200));

    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  const progress = activeStep >= 0 ? Math.round(((activeStep + 1) / PROPOSAL_STEPS.length) * 100) : 0;

  return (
    <motion.div {...fadeIn} className="space-y-0">
      {/* Modal header — matches screenshot */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-300" />
          <div>
            <p className="text-xs font-bold text-gray-200">Generating Proposal</p>
            <p className="text-[10px] text-gray-500">Sit tight — this usually takes under a minute.</p>
          </div>
        </div>
        <div className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center">
          <X className="w-3 h-3 text-gray-500" />
        </div>
      </div>

      {/* Main content: steps on left, page previews on right */}
      <div className="flex gap-5">
        {/* Left: step timeline */}
        <div className="w-[155px] shrink-0 space-y-0.5 relative">
          {/* Vertical connector line */}
          <div className="absolute left-[11px] top-4 bottom-4 w-px bg-white/[0.06]" />
          {PROPOSAL_STEPS.map((step, i) => {
            const isActive2 = i === activeStep;
            const isDone2 = i < activeStep || done;
            const isPending = i > activeStep && !done;
            return (
              <div key={i} className="flex items-start gap-2.5 py-1.5 relative">
                {/* Icon */}
                <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  isDone2 ? 'bg-emerald-500/20 text-emerald-400'
                  : isActive2 ? 'bg-blue-500/20 text-blue-400 ring-2 ring-blue-500/30'
                  : 'bg-white/[0.06] text-gray-600'
                }`}>
                  {isDone2 ? (
                    <Check className="w-3 h-3" />
                  ) : isActive2 ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <step.icon className="w-3 h-3" />
                  )}
                </div>
                {/* Label */}
                <div className="min-w-0 pt-0.5">
                  <p className={`text-[10px] font-semibold leading-tight transition-colors ${
                    isActive2 ? 'text-blue-400' : isDone2 ? 'text-gray-300' : 'text-gray-600'
                  }`}>{step.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: dual page preview */}
        <div className="flex-1 flex gap-2.5 items-start">
          {/* Cover page */}
          <div className="flex-1 bg-white rounded-lg border border-gray-200/80 overflow-hidden shadow-md" style={{ aspectRatio: '8.5/11' }}>
            <div className="p-3 h-full flex flex-col justify-between">
              {coverReady ? (
                <>
                  <div>
                    <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="h-1.5 w-2/3 bg-blue-500 rounded-full origin-left mb-6" />
                    <div className="space-y-2 mt-8">
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
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-400 rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="h-1 bg-gray-100">
              <motion.div className="h-full bg-blue-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
            </div>
          </div>

          {/* Content page */}
          <div className="flex-1 bg-white rounded-lg border border-gray-200/80 overflow-hidden shadow-md" style={{ aspectRatio: '8.5/11' }}>
            <div className="p-3 h-full">
              {pageLines > 0 ? (
                <div className="space-y-3">
                  {pageLines >= 1 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-gray-300 rounded-sm" />
                      <div className="h-1 w-16 bg-gray-400 rounded-full" />
                    </motion.div>
                  )}
                  {pageLines >= 2 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <div className="w-0.5 h-3 bg-blue-400 rounded-full" />
                        <div className="h-0.5 w-20 bg-gray-400 rounded-full" />
                      </div>
                    </motion.div>
                  )}
                  {pageLines >= 3 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1.5 mt-2">
                      <div className="h-0.5 w-full bg-gray-300 rounded-full" />
                      <div className="h-0.5 w-11/12 bg-gray-300 rounded-full" />
                      <div className="h-0.5 w-full bg-gray-300 rounded-full" />
                    </motion.div>
                  )}
                  {pageLines >= 5 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1.5 mt-1">
                      <div className="flex items-center gap-1">
                        <div className="w-0.5 h-3 bg-blue-400 rounded-full" />
                        <div className="h-0.5 w-24 bg-gray-400 rounded-full" />
                      </div>
                      <div className="h-0.5 w-full bg-gray-300 rounded-full" />
                      <div className="h-0.5 w-4/5 bg-gray-300 rounded-full" />
                    </motion.div>
                  )}
                  {pageLines >= 7 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1.5 mt-1">
                      <div className="flex items-center gap-1">
                        <div className="w-0.5 h-3 bg-blue-400 rounded-full" />
                        <div className="h-0.5 w-16 bg-gray-400 rounded-full" />
                      </div>
                      <div className="h-0.5 w-full bg-gray-300 rounded-full" />
                      <div className="h-0.5 w-3/4 bg-gray-300 rounded-full" />
                      <div className="h-0.5 w-full bg-gray-300 rounded-full" />
                    </motion.div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-400 rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="flex items-center justify-between px-1 pt-2">
        <p className={`text-[10px] ${done ? 'text-emerald-400 font-semibold' : 'text-gray-500'}`}>
          {done && <Check className="w-3 h-3 inline mr-1" />}
          {statusText}
        </p>
        <span className="text-[10px] font-mono text-gray-600">{progress}%</span>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Chapter 6: Nurture Pipeline — Kanban Board
// ═══════════════════════════════════════════════════════════

const STAGES = [
  { label: 'Discovery', deals: [{ name: 'MetricFlow', val: '$12K', h: 72 }] },
  { label: 'Proposal', deals: [{ name: 'DataForge', val: '$18K', h: 87 }, { name: 'ScaleOps', val: '$24K', h: 65 }] },
  { label: 'Negotiation', deals: [{ name: 'NeuralPath', val: '$32K', h: 91 }] },
  { label: 'Closed Won', deals: [] as { name: string; val: string; h: number }[] },
];

function NurturePipelineDemo({ isActive }: { isActive: boolean }) {
  const [stagesVisible, setStagesVisible] = useState(0);
  const [dealMoved, setDealMoved] = useState(false);
  const [alertShown, setAlertShown] = useState(false);

  useEffect(() => {
    if (!isActive) { setStagesVisible(0); setDealMoved(false); setAlertShown(false); return; }
    const timers: ReturnType<typeof setTimeout>[] = [];
    STAGES.forEach((_, i) => timers.push(setTimeout(() => setStagesVisible(i + 1), 200 + i * 200)));
    timers.push(setTimeout(() => setDealMoved(true), 2000));
    timers.push(setTimeout(() => setAlertShown(true), 3200));
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <motion.div {...fadeIn} className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-blue-400 dark:text-emerald-400" />
          <span className="text-xs font-medium text-gray-200">Pipeline</span>
        </div>
        <span className="text-[10px] text-gray-500">4 deals · $86K total</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {STAGES.map((stage, si) => {
          if (si >= stagesVisible) return <div key={si} />;
          const deals = [...stage.deals];
          if (dealMoved && si === 3) deals.push({ name: 'NeuralPath', val: '$32K', h: 91 });
          const hideFromNeg = dealMoved && si === 2;

          return (
            <motion.div key={si} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: si * 0.1 }} className="rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              <div className="px-2 py-1.5 border-b border-white/[0.04]">
                <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider truncate">{stage.label}</p>
                <p className="text-[9px] text-gray-600">{deals.length} {deals.length === 1 ? 'deal' : 'deals'}</p>
              </div>
              <div className="p-1 space-y-1 min-h-[60px]">
                {deals.map(d => {
                  if (hideFromNeg && d.name === 'NeuralPath') {
                    return <motion.div key={d.name} animate={{ opacity: 0, scale: 0.8, height: 0 }} transition={{ duration: 0.3 }} className="p-1.5 rounded bg-white/[0.04]"><p className="text-[9px] text-gray-400">{d.name}</p></motion.div>;
                  }
                  const isNew = dealMoved && si === 3 && d.name === 'NeuralPath';
                  return (
                    <motion.div key={d.name} initial={isNew ? { opacity: 0, x: -12 } : { opacity: 0, y: 4 }} animate={{ opacity: 1, x: 0, y: 0 }}
                      transition={isNew ? { type: 'spring', stiffness: 300, damping: 25 } : {}}
                      className={`p-1.5 rounded border ${isNew ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/[0.04] border-white/[0.06]'}`}>
                      <p className="text-[9px] font-medium text-gray-300 truncate">{d.name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[8px] font-mono text-gray-500">{d.val}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${d.h >= 80 ? 'bg-emerald-500' : d.h >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} />
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

      {alertShown && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="p-2.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/15">
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
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <Check className="w-3.5 h-3.5" />
          <span className="font-medium">NeuralPath moved to Closed Won · $32K</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Chapter Navigation — Fixed progress bar (CSS animation, no reversal)
// ═══════════════════════════════════════════════════════════

const DEMO_COMPONENTS = [
  FindProspectsDemo, SendMessagesDemo, RecordMeetingsDemo,
  AnalyzeMeetingsDemo, FollowUpDemo, NurturePipelineDemo,
];

function ChapterNav({ activeIndex, onSelect, progressKey, isPaused }: {
  activeIndex: number; onSelect: (i: number) => void; progressKey: number; isPaused: boolean;
}) {
  return (
    <>
      {/* Mobile pills */}
      <div className="flex lg:hidden gap-2 overflow-x-auto pb-3 scrollbar-hide">
        {CHAPTERS.map((ch, i) => {
          const Icon = ch.icon;
          const active = i === activeIndex;
          const done = i < activeIndex;
          return (
            <button key={ch.id} onClick={() => onSelect(i)}
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                active ? 'bg-blue-600 dark:bg-emerald-500 text-white'
                : done ? 'bg-blue-50 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
              }`}>
              {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              {ch.label}
            </button>
          );
        })}
      </div>

      {/* Desktop timeline */}
      <div className="hidden lg:flex flex-col relative">
        <div className="absolute left-[19px] top-6 bottom-6 w-px bg-gray-200 dark:bg-white/[0.06]" />

        {CHAPTERS.map((ch, i) => {
          const Icon = ch.icon;
          const active = i === activeIndex;
          const done = i < activeIndex;

          return (
            <button key={ch.id} onClick={() => onSelect(i)}
              className={`relative w-full text-left px-4 py-3 rounded-xl transition-all ${
                active ? 'bg-blue-50 dark:bg-white/[0.06] border border-blue-200 dark:border-white/10'
                : 'hover:bg-gray-50 dark:hover:bg-white/[0.03] border border-transparent'
              }`}>
              <div className="flex items-center gap-3">
                <div className={`relative z-10 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  active ? 'bg-blue-100 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 ring-2 ring-blue-200 dark:ring-emerald-500/20'
                  : done ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500'
                }`}>
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${active ? 'text-gray-900 dark:text-white' : done ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                    {ch.label}
                  </p>
                  <p className={`text-xs mt-0.5 truncate ${active ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    {ch.description}
                  </p>
                </div>
              </div>

              {/* Progress bar — CSS animation, paused on hover. No framer-motion to avoid reversal. */}
              {active && (
                <div className="mt-2.5 ml-11 h-1 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
                  <div
                    key={`p-${progressKey}`}
                    className="h-full rounded-full bg-blue-600 dark:bg-emerald-500"
                    style={{
                      animation: `progressFill ${CHAPTER_DURATION}ms linear forwards`,
                      animationPlayState: isPaused ? 'paused' : 'running',
                    }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* CSS keyframe for progress bar */}
      <style>{`
        @keyframes progressFill {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// Demo Viewport
// ═══════════════════════════════════════════════════════════

function DemoViewport({ activeIndex }: { activeIndex: number }) {
  const DemoComponent = DEMO_COMPONENTS[activeIndex];
  const chapter = CHAPTERS[activeIndex];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[#0f0f1a] shadow-lg dark:shadow-2xl">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-[#141425]">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="px-4 py-1 rounded-md bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06]">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">app.use60.com</span>
          </div>
        </div>
        <div className="w-[54px]" />
      </div>

      {/* App chrome: sidebar hint + breadcrumb */}
      <div className="flex border-b border-gray-100 dark:border-white/[0.06]">
        <div className="hidden sm:flex w-10 shrink-0 flex-col items-center gap-3 py-3 border-r border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02]">
          <Globe className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
          <div className="w-3.5 h-0.5 rounded-full bg-gray-200 dark:bg-white/[0.06]" />
          <div className="w-3.5 h-0.5 rounded-full bg-gray-200 dark:bg-white/[0.06]" />
          <div className="w-3.5 h-0.5 rounded-full bg-gray-200 dark:bg-white/[0.06]" />
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">
          <span>60</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600 dark:text-gray-300 font-medium">{chapter.label}</span>
        </div>
      </div>

      {/* Demo content */}
      <div className="p-4 sm:p-5 min-h-[380px] sm:min-h-[420px] bg-gradient-to-b from-gray-50 to-white dark:from-[#0f0f1a] dark:to-[#0a0a16]">
        <AnimatePresence mode="wait">
          <DemoComponent key={chapter.id} isActive />
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════

export function InteractiveDemoV15() {
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
    <section ref={sectionRef} className="relative bg-gray-50 dark:bg-[#111] py-24 md:py-32 overflow-hidden" id="demo">
      {/* Subtle background glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse,rgba(59,130,246,0.04),transparent_70%)] dark:bg-[radial-gradient(ellipse,rgba(16,185,129,0.06),transparent_70%)]" />
      </div>
      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} className="text-center mb-12 md:mb-16">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">The full sales cycle</p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            Six steps. Zero busywork.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            Watch 60 handle prospecting, outreach, meetings, analysis, follow-ups, and pipeline — automatically.
          </p>
        </motion.div>

        {/* Mobile dots */}
        <div className="flex items-center justify-center gap-1.5 mb-8 lg:hidden">
          {CHAPTERS.map((_, i) => (
            <button key={i} onClick={() => handleSelect(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === activeIndex ? 'bg-blue-600 dark:bg-emerald-500 w-6'
                : i < activeIndex ? 'bg-blue-300 dark:bg-emerald-500/40'
                : 'bg-gray-300 dark:bg-white/20'
              }`} />
          ))}
        </div>

        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="flex flex-col lg:flex-row gap-6 lg:gap-8"
          onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
          <div className="lg:w-[300px] shrink-0">
            <ChapterNav activeIndex={activeIndex} onSelect={handleSelect} progressKey={progressKey} isPaused={isPaused} />
          </div>
          <div className="flex-1 min-w-0">
            <DemoViewport activeIndex={activeIndex} />
          </div>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} className="text-center mt-10">
          <a href="https://app.use60.com/signup"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-emerald-400 hover:text-blue-700 dark:hover:text-emerald-300 transition-colors">
            Try it yourself — free forever
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
