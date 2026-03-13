/**
 * InteractiveDemoV17 — Clean step cards + page-consistent design
 *
 * Changes from V16:
 * - Matches page design language (white/dark, blue accent, clean cards)
 * - Left sidebar with clean numbered step cards (not horizontal pills)
 * - Personalized video appears row-by-row in outreach table
 * - Record → post-call transcript analysis with action items + intent detection
 * - Full light mode support
 * - 5 polish improvements: gradient section divider, active card slide indicator,
 *   count-up stat in heading, smoother chapter transitions, keyboard nav
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Search, Send, Mic, BarChart3, Reply, TrendingUp,
  Check, Play, FileText, Clock, MessageSquare, Zap,
  Loader2, Star, Mic2, Video,
  CheckCircle2, Globe, ChevronRight,
  Mail, Paperclip, DollarSign, Calendar, Sparkles,
  ListChecks, Target, AlertTriangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const LOGO_ICON = 'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png';

// ─── Constants ──────────────────────────────────────────────

const CHAPTER_DURATION = 6000;

interface Chapter {
  id: string;
  step: number;
  icon: LucideIcon;
  label: string;
  subtitle: string;
}

const CHAPTERS: Chapter[] = [
  { id: 'find', step: 1, icon: Search, label: 'Find Prospects', subtitle: 'Search & enrich 150M+ contacts' },
  { id: 'send', step: 2, icon: Send, label: 'Send Messages', subtitle: 'Personalized outreach with video' },
  { id: 'record', step: 3, icon: Mic, label: 'Record Meetings', subtitle: 'Capture and transcribe every call' },
  { id: 'analyze', step: 4, icon: BarChart3, label: 'Analyze Meetings', subtitle: 'Action items & intent detection' },
  { id: 'followup', step: 5, icon: Reply, label: 'Follow Up', subtitle: 'Proposals & emails, auto-drafted' },
  { id: 'nurture', step: 6, icon: TrendingUp, label: 'Nurture Pipeline', subtitle: 'Spot risks, close deals faster' },
];

// ─── Animation Config ───────────────────────────────────────

const demoEnter = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

const sectionFade = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const spring = { type: 'spring' as const, stiffness: 500, damping: 25 };

// ─── Shared: Enrichment Cell ────────────────────────────────

type CellState = 'empty' | 'loading' | 'done';

function EnrichCell({ state, value, className = '' }: { state: CellState; value: string; className?: string }) {
  if (state === 'empty') return <span className={`text-[#94A3B8] dark:text-gray-600 font-mono text-[10px] ${className}`}>---</span>;
  if (state === 'loading') return <Loader2 className={`w-3 h-3 text-blue-500 dark:text-blue-400 animate-spin ${className}`} />;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring}
      className={`text-emerald-600 dark:text-emerald-400 font-medium text-[10px] truncate ${className}`}
    >
      {value}
    </motion.span>
  );
}

// ─── Polish: Count-up stat ──────────────────────────────────

function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let frame: number;
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, target]);

  return <span ref={ref}>{count}{suffix}</span>;
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
      {/* Search bar — matches app Input style */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-white dark:bg-gray-800/50 border border-[#E2E8F0] dark:border-gray-700/50 transition-colors">
        <Search className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
        <span className="text-xs text-[#94A3B8] truncate">SaaS founders in New York raising Series A</span>
        <Sparkles className="w-3 h-3 text-violet-500 dark:text-violet-400 ml-auto shrink-0" />
        {badge && (
          <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
            className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium border border-blue-200 dark:border-blue-500/20 whitespace-nowrap">
            47 results
          </motion.span>
        )}
      </div>

      {/* Table — matches app Table primitives */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 overflow-hidden bg-white dark:bg-gray-900/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none">
        <div className="grid grid-cols-[1fr_100px_90px_56px] bg-slate-50 dark:bg-gray-800/50">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-[#64748B] dark:text-gray-300 tracking-wider">Contact</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-[#64748B] dark:text-gray-300 tracking-wider">Email</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-[#64748B] dark:text-gray-300 tracking-wider">Phone</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-[#64748B] dark:text-gray-300 tracking-wider">Source</div>
        </div>
        <div className="divide-y divide-[#E2E8F0] dark:divide-gray-800">
          {PROSPECTS.slice(0, rows).map((p, i) => {
            const s = cells[i] || {};
            return (
              <motion.div key={p.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="grid grid-cols-[1fr_100px_90px_56px] items-center hover:bg-slate-50 dark:hover:bg-gray-800/30 transition-colors">
                <div className="flex items-center gap-2 px-3 py-2 min-w-0">
                  <div className={`w-6 h-6 rounded-lg ${p.bg} flex items-center justify-center text-[9px] font-bold text-white shrink-0`}>{p.initials}</div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[#1E293B] dark:text-gray-200 truncate">{p.name}</p>
                    <p className="text-[9px] text-[#94A3B8] truncate">{p.title} · {p.company}</p>
                  </div>
                </div>
                <div className="px-2 py-2 bg-blue-500/[0.02] dark:bg-blue-500/5"><EnrichCell state={(s.email as CellState) || 'empty'} value={EMAILS[i]} /></div>
                <div className="px-2 py-2 bg-blue-500/[0.02] dark:bg-blue-500/5"><EnrichCell state={(s.phone as CellState) || 'empty'} value={PHONES[i]} /></div>
                <div className="px-2 py-2 flex justify-center">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-500/20">{p.source}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {rows >= 3 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <Check className="w-3.5 h-3.5" />
          <span className="font-medium">Enriching across Apollo, AI Ark &amp; Explorium...</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CHAPTER 2: Send Messages — Outreach with row-by-row video
// ═══════════════════════════════════════════════════════════

const OUTREACH = [
  { name: 'Jessica Kim', company: 'DataForge', msg: 'Personalized intro', video: 'ready' },
  { name: 'Marcus Rivera', company: 'NeuralPath', msg: 'Follow-up angle', video: 'generating' },
  { name: 'Aisha Lewis', company: 'ScaleOps', msg: 'Pain point focus', video: 'scripting' },
  { name: 'Tom Park', company: 'CloudSync', msg: 'Referral hook', video: 'idle' },
];

const VIDEO_STAGES: Record<string, { label: string; cls: string; lightCls: string }> = {
  idle: { label: 'Pending', cls: 'text-gray-500 bg-gray-500/10', lightCls: 'text-gray-400 bg-gray-100' },
  scripting: { label: 'Scripting', cls: 'text-amber-400 bg-amber-500/10', lightCls: 'text-amber-600 bg-amber-50' },
  generating: { label: 'Rendering', cls: 'text-blue-400 bg-blue-500/10', lightCls: 'text-blue-600 bg-blue-50' },
  ready: { label: 'Ready', cls: 'text-emerald-400 bg-emerald-500/10', lightCls: 'text-emerald-600 bg-emerald-50' },
};

function SendMessagesDemo({ isActive }: { isActive: boolean }) {
  const [rows, setRows] = useState(0);
  const [sent, setSent] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(-1);
  const [videoStates, setVideoStates] = useState<Record<number, string>>({});
  const [expandedVideo, setExpandedVideo] = useState(-1);

  useEffect(() => {
    if (!isActive) { setRows(0); setSent(new Set()); setSending(-1); setVideoStates({}); setExpandedVideo(-1); return; }
    const t: ReturnType<typeof setTimeout>[] = [];

    // Stagger rows
    OUTREACH.forEach((_, i) => t.push(setTimeout(() => setRows(i + 1), 300 + i * 250)));

    // Video generation per row: idle → scripting → generating → ready
    OUTREACH.forEach((r, i) => {
      if (r.video === 'ready') {
        t.push(setTimeout(() => setVideoStates(p => ({ ...p, [i]: 'scripting' })), 600 + i * 250));
        t.push(setTimeout(() => setVideoStates(p => ({ ...p, [i]: 'generating' })), 1200 + i * 250));
        t.push(setTimeout(() => { setVideoStates(p => ({ ...p, [i]: 'ready' })); setExpandedVideo(i); }, 1800 + i * 250));
        t.push(setTimeout(() => setExpandedVideo(-1), 2600 + i * 250));
      } else if (r.video === 'generating') {
        t.push(setTimeout(() => setVideoStates(p => ({ ...p, [i]: 'scripting' })), 800 + i * 250));
        t.push(setTimeout(() => setVideoStates(p => ({ ...p, [i]: 'generating' })), 1600 + i * 250));
      } else if (r.video === 'scripting') {
        t.push(setTimeout(() => setVideoStates(p => ({ ...p, [i]: 'scripting' })), 1000 + i * 250));
      }
    });

    // Sending wave
    OUTREACH.forEach((_, i) => {
      const base = 3000 + i * 500;
      t.push(setTimeout(() => setSending(i), base));
      t.push(setTimeout(() => { setSent(prev => new Set([...prev, i])); setSending(-1); }, base + 350));
    });

    return () => t.forEach(clearTimeout);
  }, [isActive]);

  return (
    <motion.div {...demoEnter} className="space-y-2">
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Outreach Campaign</span>
        </div>
        <span className="text-[10px] text-gray-500">{sent.size}/{OUTREACH.length} sent</span>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr_70px_48px] gap-px bg-gray-50 dark:bg-white/[0.03]">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Contact</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Video</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-center">Sent</div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
          {OUTREACH.slice(0, rows).map((r, i) => {
            const vState = videoStates[i] || 'idle';
            const v = VIDEO_STAGES[vState];
            const isSent = sent.has(i);
            const isExpanded = expandedVideo === i;
            return (
              <div key={r.name}>
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className={`grid grid-cols-[1fr_70px_48px] gap-px items-center transition-colors ${isSent ? 'bg-emerald-50/50 dark:bg-emerald-500/[0.03]' : 'bg-white dark:bg-white/[0.02] hover:bg-gray-50 dark:hover:bg-white/[0.04]'}`}>
                  <div className="px-3 py-2 min-w-0">
                    <p className="text-[11px] font-medium text-gray-900 dark:text-gray-200 truncate">{r.name}</p>
                    <p className="text-[9px] text-gray-500 truncate">{r.company} · {r.msg}</p>
                  </div>
                  <div className="px-2 py-2 flex justify-center">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium dark:${v.cls} ${v.lightCls}`}>{v.label}</span>
                  </div>
                  <div className="px-2 py-2 flex justify-center">
                    {isSent ? (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring}>
                        <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                      </motion.div>
                    ) : sending === i ? (
                      <Loader2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 animate-spin" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700" />
                    )}
                  </div>
                </motion.div>

                {/* Row-by-row video preview — expands inline when ready */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden border-t border-gray-100 dark:border-white/[0.04]"
                    >
                      <div className="p-2.5 flex items-center gap-3 bg-blue-50/50 dark:bg-blue-500/[0.04]">
                        <div className="w-16 h-10 rounded bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-500/20">
                          <Play className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-700 dark:text-gray-300">AI video for {r.name}</p>
                          <p className="text-[9px] text-gray-500">15s · Personalized with company data</p>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium ml-auto shrink-0">Ready</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CHAPTER 3: Record Meetings — Call capture (simpler)
// ═══════════════════════════════════════════════════════════

const ATTENDEES = [
  { initials: 'You', color: 'bg-blue-600' },
  { initials: 'ST', color: 'bg-emerald-600' },
  { initials: 'JC', color: 'bg-amber-600' },
  { initials: 'LP', color: 'bg-violet-600' },
];

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-5">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-emerald-500/60 dark:bg-emerald-400/60"
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
  const [recording, setRecording] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!isActive) { setTimer(0); setRecording(false); setComplete(false); return; }
    const t1 = setTimeout(() => setRecording(true), 500);
    const tick = setInterval(() => setTimer(t => t + 1), 1000);
    const t2 = setTimeout(() => { setRecording(false); setComplete(true); }, 4500);
    return () => { clearTimeout(t1); clearInterval(tick); clearTimeout(t2); };
  }, [isActive]);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <motion.div {...demoEnter} className="space-y-3">
      {/* Video call — 50% width, centered */}
      <div className="w-3/5 mx-auto">
        <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 overflow-hidden">
          <div className="relative bg-slate-800 dark:bg-slate-900" style={{ aspectRatio: '16/9' }}>
            <div className="grid grid-cols-2 grid-rows-2 h-full gap-px bg-slate-700/30 dark:bg-white/[0.06]">
              {ATTENDEES.map((a, i) => (
                <div key={i} className="flex flex-col items-center justify-center bg-slate-800 dark:bg-slate-900 gap-1 relative">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full ${a.color} flex items-center justify-center text-white text-[8px] font-bold ring-2 ring-white/10 shadow-lg`}>
                    {a.initials}
                  </div>
                  <span className="text-[7px] text-gray-400 font-medium">{a.initials === 'You' ? 'You' : a.initials}</span>
                  {recording && i === (Math.floor(timer / 2) % 4) && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                      <div className="flex items-end gap-[1px] h-2">
                        {[0,1,2,3,4].map(j => (
                          <div key={j} className="w-[1.5px] rounded-full bg-emerald-400/70"
                            style={{ height: '100%', animation: `waveform ${0.4 + j * 0.1}s ease-in-out infinite`, animationDelay: `${j * 50}ms` }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Overlays */}
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-900/80 backdrop-blur-sm border border-white/[0.06]">
              <div className={`w-1 h-1 rounded-full ${recording ? 'bg-red-500 animate-pulse' : complete ? 'bg-gray-500' : 'bg-gray-600'}`} />
              <span className={`text-[7px] font-semibold ${recording ? 'text-red-400' : 'text-gray-400'}`}>{complete ? 'DONE' : recording ? 'REC' : 'READY'}</span>
            </div>
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-900/80 backdrop-blur-sm text-[7px] text-gray-300 border border-white/[0.06]">
              <Clock className="w-2 h-2" /><span className="font-mono">{complete ? '32:14' : fmt(timer)}</span>
            </div>
          </div>

          <div className="px-2 py-1.5 bg-white dark:bg-slate-900/80 flex items-center justify-between border-t border-[#E2E8F0] dark:border-gray-700/50">
            <div>
              <p className="text-[9px] font-medium text-[#1E293B] dark:text-gray-200">Q2 Strategy — Campium</p>
              <p className="text-[7px] text-[#94A3B8]">4 attendees · Sarah Thompson</p>
            </div>
            <div className={`flex items-center gap-1 text-[7px] ${complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>
              {complete ? <><Check className="w-2.5 h-2.5" />Captured</> : <><div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />Recording</>}
            </div>
          </div>
        </div>
      </div>

      {/* Post-recording status */}
      {complete && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/[0.06] border border-emerald-200 dark:border-emerald-500/20">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Meeting recorded &amp; queued for analysis</span>
          </div>
          <p className="text-[9px] text-emerald-600/80 dark:text-emerald-400/70 ml-5.5">Full transcript, action items &amp; intent detection available in Analyze.</p>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CHAPTER 4: Analyze Meetings — Post-call analysis with
//  action items & intent detection (not live transcript)
// ═══════════════════════════════════════════════════════════

const ACTION_ITEMS = [
  { text: 'Send proposal with custom pricing', owner: 'You', due: 'Today', icon: FileText },
  { text: 'Share case study deck', owner: 'You', due: 'Tomorrow', icon: Mail },
  { text: 'Schedule technical demo with CTO', owner: 'Sarah', due: 'This week', icon: Calendar },
];

const INTENTS = [
  { label: 'Commitment', text: '"I\'ll send you a proposal this afternoon"', color: 'emerald' as const },
  { label: 'Budget signal', text: '"We\'re looking at $18-24K annually"', color: 'blue' as const },
  { label: 'Timeline', text: '"We need this in place for Q2"', color: 'amber' as const },
  { label: 'Blocker', text: '"CRM adoption is our biggest concern"', color: 'red' as const },
];

const INTENT_COLORS = {
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/20' },
  blue: { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-500/20' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/20' },
  red: { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-500/20' },
};

function AnalyzeMeetingsDemo({ isActive }: { isActive: boolean }) {
  const [phase, setPhase] = useState<'loading' | 'summary' | 'actions' | 'intents'>('loading');
  const [actionCount, setActionCount] = useState(0);
  const [intentCount, setIntentCount] = useState(0);

  useEffect(() => {
    if (!isActive) { setPhase('loading'); setActionCount(0); setIntentCount(0); return; }
    const t: ReturnType<typeof setTimeout>[] = [];
    t.push(setTimeout(() => setPhase('summary'), 800));
    t.push(setTimeout(() => setPhase('actions'), 1600));
    ACTION_ITEMS.forEach((_, i) => t.push(setTimeout(() => setActionCount(i + 1), 2000 + i * 300)));
    t.push(setTimeout(() => setPhase('intents'), 3200));
    INTENTS.forEach((_, i) => t.push(setTimeout(() => setIntentCount(i + 1), 3500 + i * 350)));
    return () => t.forEach(clearTimeout);
  }, [isActive]);

  if (phase === 'loading') {
    return (
      <motion.div {...demoEnter} className="flex items-center justify-center h-48 gap-3">
        <Loader2 className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin" />
        <span className="text-xs text-gray-500 font-mono">Analyzing 32-minute transcript...</span>
      </motion.div>
    );
  }

  return (
    <motion.div {...demoEnter} className="space-y-3">
      {/* Meeting header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-200">Q2 Strategy — Campium</p>
          <p className="text-[10px] text-gray-500">32 min · 4 attendees · Sarah Thompson</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-medium">
          Positive
        </span>
      </div>

      {/* AI Summary */}
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-blue-500 dark:text-blue-400" />
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">AI Summary</p>
        </div>
        <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
          Strong buying signals from Sarah. Budget confirmed at $18-24K. Primary blocker is CRM adoption timeline — proposal should address migration support.
        </p>
      </motion.div>

      {/* Action Items */}
      {(phase === 'actions' || phase === 'intents') && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Action Items</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">{actionCount}</span>
          </div>
          {ACTION_ITEMS.slice(0, actionCount).map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.05]">
              <div className="w-5 h-5 rounded bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                <item.icon className="w-3 h-3 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-gray-900 dark:text-gray-300 truncate">{item.text}</p>
                <p className="text-[9px] text-gray-500">{item.owner} · {item.due}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Intent Detection */}
      {phase === 'intents' && intentCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Intent Detected</p>
          </div>
          {INTENTS.slice(0, intentCount).map((intent, i) => {
            const colors = INTENT_COLORS[intent.color];
            return (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className={`flex items-center gap-2 p-2 rounded-lg ${colors.bg} border ${colors.border}`}>
                <Zap className={`w-3.5 h-3.5 ${colors.text} shrink-0`} />
                <div className="min-w-0">
                  <p className={`text-[10px] font-semibold ${colors.text}`}>{intent.label}</p>
                  <p className="text-[9px] text-gray-500 dark:text-gray-400 truncate">{intent.text}</p>
                </div>
              </motion.div>
            );
          })}
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
  // Flow: intent banner → modal opens → generating → pdf done → email → slack
  const [phase, setPhase] = useState<'intent' | 'modal' | 'pdf' | 'email' | 'slack'>('intent');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!isActive) { setStep(-1); setPageLines(0); setCoverReady(false); setDone(false); setPhase('intent'); setShowModal(false); return; }
    const t: ReturnType<typeof setTimeout>[] = [];

    // Show intent detection banner first
    t.push(setTimeout(() => { setPhase('modal'); setShowModal(true); }, 1200));

    // Start proposal generation inside modal
    PROPOSAL_STEPS.forEach((_, i) => t.push(setTimeout(() => setStep(i), 1600 + i * 350)));
    t.push(setTimeout(() => setCoverReady(true), 1900));
    for (let l = 1; l <= 7; l++) t.push(setTimeout(() => setPageLines(l), 2200 + l * 130));

    // Done → show PDF complete
    t.push(setTimeout(() => { setDone(true); setPhase('pdf'); }, 3400));
    // Email
    t.push(setTimeout(() => setPhase('email'), 4600));
    // Slack
    t.push(setTimeout(() => setPhase('slack'), 5600));

    return () => t.forEach(clearTimeout);
  }, [isActive]);

  const progress = step >= 0 ? Math.round(((step + 1) / PROPOSAL_STEPS.length) * 100) : 0;

  return (
    <motion.div {...demoEnter} className="relative">
      {/* Background: Meetings list view */}
      <div className={`space-y-2 transition-all duration-300 ${showModal ? 'opacity-30 blur-[1px] scale-[0.99]' : ''}`}>
        {/* Meeting header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span className="text-xs font-medium text-[#1E293B] dark:text-gray-200">Recent Meetings</span>
          </div>
          <span className="text-[10px] text-[#94A3B8]">3 this week</span>
        </div>

        {/* Meetings list */}
        <div className="rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 overflow-hidden bg-white dark:bg-white/[0.02]">
          {[
            { name: 'Q2 Strategy — Campium', time: 'Today, 2:30 PM', duration: '32 min', status: 'analyzed', sentiment: 'Positive' },
            { name: 'Product Demo — ScaleOps', time: 'Yesterday, 11:00 AM', duration: '45 min', status: 'analyzed', sentiment: 'Neutral' },
            { name: 'Intro Call — DataForge', time: 'Mon, 3:15 PM', duration: '22 min', status: 'analyzed', sentiment: 'Positive' },
          ].map((m, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? 'border-t border-[#E2E8F0] dark:border-gray-800' : ''} hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors`}>
              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                <Video className="w-3 h-3 text-[#64748B] dark:text-gray-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-[#1E293B] dark:text-gray-200 truncate">{m.name}</p>
                <p className="text-[9px] text-[#94A3B8]">{m.time} · {m.duration}</p>
              </div>
              <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${
                m.sentiment === 'Positive' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-white/[0.06] text-[#64748B] dark:text-gray-400'
              }`}>{m.sentiment}</span>
            </div>
          ))}
        </div>

        {/* Intent detection banner */}
        <AnimatePresence>
          {(phase === 'intent' || showModal) && isActive && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/[0.06] border border-amber-200 dark:border-amber-500/15">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">Intent detected: &quot;I&apos;ll send you a proposal&quot;</p>
                  <p className="text-[9px] text-amber-600/70 dark:text-amber-400/60">Drafting proposal for Campium now...</p>
                </div>
                <div className="flex items-center gap-1 text-[8px] px-2 py-1 rounded-md bg-blue-500 text-white font-medium shrink-0">
                  <FileText className="w-2.5 h-2.5" />Generate
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal overlay — proposal generation */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.3 }}
            className="absolute inset-x-3 top-6 bottom-3 z-10 rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-950/50">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                <span className="text-[11px] font-semibold text-[#1E293B] dark:text-gray-200">{done ? 'Proposal Ready' : 'Generating Proposal'}</span>
                <span className="text-[9px] text-[#94A3B8]">Campium × 60</span>
              </div>
              <span className="text-[9px] font-mono text-[#94A3B8]">{progress}%</span>
            </div>

            {/* Modal body */}
            <div className="flex-1 p-3 overflow-hidden">
              <AnimatePresence mode="wait">
                {(phase === 'modal' || phase === 'intent') && (
                  <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6 }}
                    className="flex gap-3 h-full">
                    {/* Steps */}
                    <div className="w-[110px] shrink-0 relative">
                      <div className="absolute left-[9px] top-2.5 bottom-2.5 w-px bg-[#E2E8F0] dark:bg-white/[0.06]" />
                      {PROPOSAL_STEPS.map((s, i) => {
                        const active2 = i === step;
                        const done2 = i < step || done;
                        return (
                          <div key={i} className="flex items-center gap-1.5 py-1 relative">
                            <div className={`relative z-10 w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 transition-all ${
                              done2 ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : active2 ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-500/30'
                              : 'bg-slate-100 dark:bg-white/[0.06] text-[#94A3B8] dark:text-gray-600'
                            }`}>
                              {done2 ? <Check className="w-2 h-2" /> : active2 ? <Loader2 className="w-2 h-2 animate-spin" /> : <s.icon className="w-2 h-2" />}
                            </div>
                            <p className={`text-[8px] font-medium leading-tight ${active2 ? 'text-blue-600 dark:text-blue-400' : done2 ? 'text-[#1E293B] dark:text-gray-300' : 'text-[#94A3B8] dark:text-gray-600'}`}>{s.label}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* 2-page PDF document assembly */}
                    <div className="flex-1 flex gap-1.5 items-start">
                      {/* Page 1: Cover */}
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: coverReady ? 1 : 0.4, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="flex-1 rounded border border-[#E2E8F0] dark:border-gray-700/30 shadow-sm overflow-hidden bg-white dark:bg-gray-800/30"
                        style={{ aspectRatio: '210 / 297' }}
                      >
                        {coverReady ? (
                          <div className="h-full flex flex-col">
                            <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                              transition={{ duration: 0.4 }} style={{ transformOrigin: 'left' }}
                              className="h-[3%] bg-blue-500 dark:bg-blue-400" />
                            <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2">
                              <motion.div initial={{ width: 0 }} animate={{ width: '35%' }} transition={{ delay: 0.2, duration: 0.3 }} className="h-[1.5px] rounded-full bg-gray-300 dark:bg-gray-600" />
                              <motion.div initial={{ width: 0 }} animate={{ width: '65%' }} transition={{ delay: 0.4, duration: 0.3 }} className="h-[2px] rounded-full bg-gray-500 dark:bg-gray-400" />
                              <motion.div initial={{ width: 0 }} animate={{ width: '25%' }} transition={{ delay: 0.6, duration: 0.3 }} className="h-[1.5px] rounded-full bg-gray-300 dark:bg-gray-600" />
                              <div className="mt-1.5 flex flex-col items-center gap-0.5">
                                <motion.div initial={{ width: 0 }} animate={{ width: '50%' }} transition={{ delay: 0.9, duration: 0.2 }} className="h-[1px] rounded-full bg-gray-200 dark:bg-gray-700" />
                                <motion.div initial={{ width: 0 }} animate={{ width: '35%' }} transition={{ delay: 1.0, duration: 0.2 }} className="h-[1px] rounded-full bg-gray-200 dark:bg-gray-700" />
                              </div>
                            </div>
                            <div className="h-[1.5%] bg-blue-500 dark:bg-blue-400" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <div className="w-3 h-3 border-2 border-gray-200 dark:border-gray-600 border-t-blue-400 rounded-full animate-spin" />
                          </div>
                        )}
                      </motion.div>

                      {/* Page 2: Content sections */}
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: pageLines > 0 ? 1 : 0.3, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className="flex-1 rounded border border-[#E2E8F0] dark:border-gray-700/30 shadow-sm overflow-hidden bg-white dark:bg-gray-800/30"
                        style={{ aspectRatio: '210 / 297' }}
                      >
                        <div className="p-1.5 h-full">
                          {pageLines > 0 ? (
                            <div className="space-y-1.5">
                              {/* Section heading */}
                              {pageLines >= 1 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-0.5">
                                <motion.div initial={{ height: 0 }} animate={{ height: 5 }} transition={{ duration: 0.2 }} className="w-[1.5px] rounded-full bg-blue-500 dark:bg-blue-400 shrink-0" />
                                <motion.div initial={{ width: 0 }} animate={{ width: '45%' }} transition={{ duration: 0.25, delay: 0.1 }} className="h-[1.5px] rounded-full bg-gray-500 dark:bg-gray-400" />
                              </motion.div>}
                              {/* Paragraph lines */}
                              {pageLines >= 2 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="space-y-[2px]">
                                <motion.div initial={{ width: 0 }} animate={{ width: '90%' }} transition={{ duration: 0.2 }} className="h-[1px] rounded-full bg-gray-200 dark:bg-gray-700" />
                                <motion.div initial={{ width: 0 }} animate={{ width: '82%' }} transition={{ duration: 0.2, delay: 0.05 }} className="h-[1px] rounded-full bg-gray-200 dark:bg-gray-700" />
                                <motion.div initial={{ width: 0 }} animate={{ width: '88%' }} transition={{ duration: 0.2, delay: 0.1 }} className="h-[1px] rounded-full bg-gray-200 dark:bg-gray-700" />
                              </motion.div>}
                              {/* Second section */}
                              {pageLines >= 3 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex items-center gap-0.5">
                                <motion.div initial={{ height: 0 }} animate={{ height: 5 }} transition={{ duration: 0.2 }} className="w-[1.5px] rounded-full bg-blue-500 dark:bg-blue-400 shrink-0" />
                                <motion.div initial={{ width: 0 }} animate={{ width: '38%' }} transition={{ duration: 0.25, delay: 0.1 }} className="h-[1.5px] rounded-full bg-gray-500 dark:bg-gray-400" />
                              </motion.div>}
                              {pageLines >= 4 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="space-y-[2px]">
                                <motion.div initial={{ width: 0 }} animate={{ width: '85%' }} transition={{ duration: 0.2 }} className="h-[1px] rounded-full bg-gray-200 dark:bg-gray-700" />
                                <motion.div initial={{ width: 0 }} animate={{ width: '92%' }} transition={{ duration: 0.2, delay: 0.05 }} className="h-[1px] rounded-full bg-gray-200 dark:bg-gray-700" />
                              </motion.div>}
                              {/* Pricing table */}
                              {pageLines >= 5 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                                className="border border-gray-200 dark:border-gray-700/30 rounded-[2px] overflow-hidden mt-1">
                                <div className="bg-blue-500 dark:bg-blue-400 h-[2px]" />
                                {[0, 1, 2].map((i) => (
                                  <div key={i} className={`flex gap-0.5 px-0.5 py-[1px] ${i % 2 === 0 ? 'bg-white dark:bg-gray-800/30' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                                    <div className="h-[1px] rounded-full bg-gray-300 dark:bg-gray-600 flex-[2]" />
                                    <div className="h-[1px] rounded-full bg-gray-200 dark:bg-gray-700 flex-[3]" />
                                    <div className="h-[1px] rounded-full bg-gray-300 dark:bg-gray-600 flex-1" />
                                  </div>
                                ))}
                              </motion.div>}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <div className="w-3 h-3 border-2 border-gray-200 dark:border-gray-600 border-t-blue-400 rounded-full animate-spin" />
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {phase === 'pdf' && (
                  <motion.div key="pdf" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/[0.06] border border-emerald-200 dark:border-emerald-500/20">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">Proposal generated</p>
                      <p className="text-[9px] text-emerald-600/70 dark:text-emerald-400/60">Campium_Proposal_Q2.pdf · 6 pages</p>
                    </div>
                    <div className="flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-500/20">
                      <Paperclip className="w-2 h-2" />PDF
                    </div>
                  </motion.div>
                )}

                {phase === 'email' && (
                  <motion.div key="email" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-800/30 p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                      <span className="text-[10px] font-semibold text-[#1E293B] dark:text-gray-300">Follow-up Email</span>
                      <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-500/20">Ready</span>
                    </div>
                    <div className="text-[9px] text-[#94A3B8] space-y-0.5">
                      <p><span className="text-[#64748B] dark:text-gray-400">To:</span> sarah@microquant.com</p>
                      <p><span className="text-[#64748B] dark:text-gray-400">Subject:</span> Follow-up: 60 × Campium</p>
                    </div>
                    <p className="text-[9px] text-[#64748B] dark:text-gray-400 line-clamp-2 leading-relaxed">
                      Hi Sarah, Great speaking today. As discussed, I&apos;ve attached the proposal with custom pricing...
                    </p>
                    <div className="flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 w-fit">
                      <Paperclip className="w-2 h-2" />Proposal.pdf
                    </div>
                  </motion.div>
                )}

                {phase === 'slack' && (
                  <motion.div key="slack" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="rounded-lg border border-[#4A154B]/15 dark:border-[#4A154B]/30 bg-[#4A154B]/5 dark:bg-[#4A154B]/10 p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded bg-[#4A154B] flex items-center justify-center shrink-0">
                        <MessageSquare className="w-2.5 h-2.5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold text-[#1E293B] dark:text-gray-200">60 Bot</span>
                          <span className="text-[8px] text-[#94A3B8] dark:text-gray-600">#deals</span>
                        </div>
                        <p className="text-[9px] text-[#64748B] dark:text-gray-400 mt-0.5">Follow-up sent to Sarah T. · Proposal attached · CRM updated</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
          <TrendingUp className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          <span className="text-xs font-medium text-gray-900 dark:text-gray-200">Pipeline</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">4 deals</span>
          <motion.span
            key={revenue}
            initial={revenue === '$118K' ? { scale: 1.2, color: '#059669' } : undefined}
            animate={{ scale: 1, color: revenue === '$118K' ? '#059669' : '#6b7280' }}
            transition={spring}
            className="text-[10px] font-bold"
          >
            {revenue}
          </motion.span>
        </div>
      </div>

      {/* Kanban columns — matches real app pipeline view */}
      <div className="grid grid-cols-4 gap-1.5">
        {STAGES.map((stage, si) => {
          if (si >= cols) return <div key={si} />;
          const deals = [...stage.deals];
          if (dealMoved && si === 3) deals.push({ name: 'NeuralPath', val: '$32K', health: 91 });
          const hideFromNeg = dealMoved && si === 2;
          const stageColors = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981'];

          return (
            <motion.div key={si} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: si * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
              {/* Stage color stripe */}
              <div className="h-[2.5px]" style={{ background: `linear-gradient(to right, ${stageColors[si]}, ${stageColors[si]}40)` }} />
              <div className="px-2 py-1.5 border-b border-gray-200/80 dark:border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-semibold text-[#64748B] uppercase tracking-wider truncate">{stage.label}</p>
                  <span className="text-[9px] font-bold px-1.5 py-[1px] rounded-full" style={{ backgroundColor: `${stageColors[si]}1F`, color: stageColors[si] }}>{deals.length}</span>
                </div>
              </div>
              <div className="p-1 space-y-1 min-h-[60px]">
                {deals.map(d => {
                  if (hideFromNeg && d.name === 'NeuralPath') {
                    return <motion.div key={d.name} animate={{ opacity: 0, scale: 0.8, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.3 }} className="p-1.5 rounded-xl bg-white dark:bg-white/[0.03] border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
                      <p className="text-[9px] text-[#64748B]">{d.name}</p>
                    </motion.div>;
                  }
                  const isNew = dealMoved && si === 3 && d.name === 'NeuralPath';
                  return (
                    <motion.div key={d.name}
                      initial={isNew ? { opacity: 0, x: -16, scale: 0.9 } : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                      transition={isNew ? { type: 'spring', stiffness: 300, damping: 22 } : { delay: 0.05 }}
                      className={`p-1.5 rounded-xl border backdrop-blur-xl transition-all duration-200 ${
                        isNew
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
                          : 'bg-white dark:bg-white/[0.03] border-gray-200/80 dark:border-white/[0.06] hover:border-gray-300 dark:hover:border-white/[0.1]'
                      }`}>
                      <p className="text-[9px] font-medium text-[#1E293B] dark:text-gray-300 truncate">{d.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[8px] font-mono text-[#64748B]">{d.val}</span>
                        {/* Health bar like the real app */}
                        <div className="w-8 h-[2.5px] rounded-full bg-gray-100 dark:bg-white/[0.03] overflow-hidden">
                          <div className={`h-full rounded-full ${d.health >= 80 ? 'bg-emerald-500' : d.health >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${d.health}%` }} />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                {si === 3 && !dealMoved && (
                  <div className="flex items-center justify-center h-10 border border-dashed border-gray-200 dark:border-white/[0.08] rounded-xl">
                    <span className="text-[8px] text-[#94A3B8] dark:text-gray-700">Drop zone</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {alert && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ ease: [0.22, 1, 0.36, 1] }}
          className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/[0.06] border border-amber-200 dark:border-amber-500/15">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">At-risk: ScaleOps ($24K)</p>
              <p className="text-[9px] text-gray-500">No activity in 7 days · Auto-scheduling check-in</p>
            </div>
          </div>
        </motion.div>
      )}

      {dealMoved && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-medium">NeuralPath moved to Closed Won · $32K</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  Clean Step Card Navigation (left sidebar)
// ═══════════════════════════════════════════════════════════

const DEMO_COMPONENTS = [
  FindProspectsDemo, SendMessagesDemo, RecordMeetingsDemo,
  AnalyzeMeetingsDemo, FollowUpDemo, NurturePipelineDemo,
];

function StepCardNav({ activeIndex, onSelect, progressKey, isPaused }: {
  activeIndex: number; onSelect: (i: number) => void; progressKey: number; isPaused: boolean;
}) {
  return (
    <>
      {/* Mobile: scrollable pills */}
      <div className="flex lg:hidden gap-2 overflow-x-auto pb-3 scrollbar-hide">
        {CHAPTERS.map((ch, i) => {
          const active = i === activeIndex;
          const done = i < activeIndex;
          return (
            <button key={ch.id} onClick={() => onSelect(i)}
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                active ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 dark:shadow-blue-500/10'
                : done ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
              }`}>
              {done ? <Check className="w-3.5 h-3.5" /> : <ch.icon className="w-3.5 h-3.5" />}
              {ch.label}
            </button>
          );
        })}
      </div>

      {/* Desktop: numbered step cards */}
      <div className="hidden lg:flex flex-col gap-1">
        {CHAPTERS.map((ch, i) => {
          const Icon = ch.icon;
          const active = i === activeIndex;
          const done = i < activeIndex;
          return (
            <button key={ch.id} onClick={() => onSelect(i)}
              className={`relative w-full text-left px-3.5 py-3 rounded-xl transition-all duration-200 group ${
                active
                  ? 'bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 shadow-sm dark:shadow-none'
                  : 'hover:bg-gray-50 dark:hover:bg-white/[0.03] border border-transparent'
              }`}>
              {/* Active slide indicator */}
              {active && (
                <motion.div
                  layoutId="step-indicator"
                  className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-blue-500 dark:bg-blue-400"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}

              <div className="flex items-center gap-3">
                {/* Step number circle */}
                <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                  active ? 'bg-blue-500 text-white shadow-sm'
                  : done ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 group-hover:bg-gray-200 dark:group-hover:bg-white/10'
                }`}>
                  {done ? <Check className="w-3.5 h-3.5" /> : active ? <Icon className="w-3.5 h-3.5" /> : <span>{ch.step}</span>}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold transition-colors ${
                    active ? 'text-gray-900 dark:text-white' : done ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400'
                  }`}>{ch.label}</p>
                  {active && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{ch.subtitle}</motion.p>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {active && (
                <div className="mt-2.5 ml-11 h-1 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                  <div
                    key={`p-${progressKey}`}
                    className="h-full rounded-full bg-blue-500 dark:bg-blue-400"
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
    </>
  );
}

// ═══════════════════════════════════════════════════════════
//  Demo Viewport
// ═══════════════════════════════════════════════════════════

// Sidebar nav items matching the real 60 app
const SIDEBAR_ITEMS: { icon: LucideIcon; label: string; chapterId?: string }[] = [
  { icon: Globe, label: 'Dashboard' },
  { icon: Search, label: 'Prospects', chapterId: 'find' },
  { icon: Send, label: 'Outreach', chapterId: 'send' },
  { icon: Mic, label: 'Meetings', chapterId: 'record' },
  { icon: BarChart3, label: 'Analytics', chapterId: 'analyze' },
  { icon: Mail, label: 'Follow-ups', chapterId: 'followup' },
  { icon: TrendingUp, label: 'Pipeline', chapterId: 'nurture' },
];

function DemoViewport({ activeIndex }: { activeIndex: number }) {
  const DemoComponent = DEMO_COMPONENTS[activeIndex];
  const chapter = CHAPTERS[activeIndex];

  return (
    <div className="rounded-2xl border border-[#E2E8F0] dark:border-gray-700/50 overflow-hidden bg-white dark:bg-gray-900/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05),0_25px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-sm aspect-video flex flex-col">
      {/* Browser chrome — minimal */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-950/80 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="px-3 py-0.5 rounded-md bg-white dark:bg-gray-800/50 border border-[#E2E8F0] dark:border-gray-700/50">
            <span className="text-[10px] text-[#94A3B8] font-mono">app.use60.com</span>
          </div>
        </div>
        <div className="w-[42px]" />
      </div>

      {/* App shell — real sidebar + content area */}
      <div className="flex flex-1 min-h-0">
        {/* Mini sidebar matching actual app */}
        <div className="hidden sm:flex w-12 shrink-0 flex-col border-r border-[#E2E8F0] dark:border-gray-700/50 bg-white/80 dark:bg-gray-900/95 backdrop-blur-xl">
          {/* Logo area */}
          <div className="flex items-center justify-center h-10 border-b border-[#E2E8F0] dark:border-gray-700/50">
            <img src={LOGO_ICON} alt="60" className="h-5 w-auto" />
          </div>
          {/* Nav icons */}
          <div className="flex flex-col items-center gap-0.5 py-2 px-1">
            {SIDEBAR_ITEMS.map((item, idx) => {
              const isActive = item.chapterId === chapter.id;
              return (
                <div key={idx} className={`w-full flex items-center justify-center py-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-[#37bd7e]/10'
                    : 'hover:bg-slate-50 dark:hover:bg-gray-800/20'
                }`}>
                  <item.icon className={`w-3.5 h-3.5 ${
                    isActive ? 'text-indigo-700 dark:text-[#37bd7e]' : 'text-[#94A3B8] dark:text-gray-500'
                  }`} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Top bar with breadcrumb */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-[#94A3B8]">60</span>
              <ChevronRight className="w-3 h-3 text-[#CBD5E1]" />
              <span className="text-[#1E293B] dark:text-white font-medium">{chapter.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">JD</span>
              </div>
            </div>
          </div>

          {/* Demo content */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 bg-[#F8FAFC] dark:bg-gradient-to-br dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
            <AnimatePresence mode="wait">
              <DemoComponent key={chapter.id} isActive />
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════

export function InteractiveDemoV17() {
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

  // Auto-cycle
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

  // Polish: keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, CHAPTERS.length - 1));
        setProgressKey(k => k + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        setProgressKey(k => k + 1);
      }
    };
    // Only when section is in view
    if (isInView) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isInView]);

  const handleSelect = useCallback((index: number) => {
    setActiveIndex(index);
    setProgressKey(k => k + 1);
  }, []);

  const handleMouseEnter = useCallback(() => { isPausedRef.current = true; setIsPaused(true); }, []);
  const handleMouseLeave = useCallback(() => { isPausedRef.current = false; setIsPaused(false); }, []);

  return (
    <section ref={sectionRef} className="relative bg-gray-50/50 dark:bg-[#0a1020] py-24 md:py-32 overflow-hidden" id="demo">
      {/* Gradient section divider at top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 dark:via-blue-400/10 to-transparent" />

      {/* Subtle background glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] bg-[radial-gradient(ellipse,rgba(59,130,246,0.04),transparent_70%)] dark:bg-[radial-gradient(ellipse,rgba(59,130,246,0.04),transparent_70%)]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div variants={sectionFade} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} className="text-center mb-12 md:mb-16">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-4 tracking-wide uppercase">
            How it works
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            <CountUp target={6} /> steps to close more deals
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            From first contact to closed deal — watch 60 handle every step automatically.
          </p>
        </motion.div>

        {/* Mobile dots */}
        <div className="flex items-center justify-center gap-1.5 mb-8 lg:hidden">
          {CHAPTERS.map((_, i) => (
            <button key={i} onClick={() => handleSelect(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === activeIndex ? 'bg-blue-500 w-6'
                : i < activeIndex ? 'bg-blue-300 dark:bg-blue-500/40'
                : 'bg-gray-300 dark:bg-white/20'
              }`} />
          ))}
        </div>

        <motion.div variants={sectionFade} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="flex flex-col lg:flex-row gap-6 lg:gap-8"
          onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
          <div className="lg:w-[280px] shrink-0">
            <StepCardNav activeIndex={activeIndex} onSelect={handleSelect} progressKey={progressKey} isPaused={isPaused} />
          </div>
          <div className="flex-1 min-w-0">
            <DemoViewport activeIndex={activeIndex} />
          </div>
        </motion.div>

      </div>

      {/* Gradient section divider at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 dark:via-blue-400/10 to-transparent" />

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
      `}</style>
    </section>
  );
}
