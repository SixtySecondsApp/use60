/**
 * InteractiveDemoV14 — Level-up rewrite
 *
 * 10 improvements over original:
 * 1. Ops table grid for Find Prospects (enrichment cell animations: --- → spinner → ✓)
 * 2. Ops table grid for Send Messages (video/sequence columns, row-by-row)
 * 3. CallGridThumbnail for Record Meetings (2x2 avatar grid, REC indicator, source badge)
 * 4. Full SandboxProposals animation for Follow Up (10-step generation, cover, content, sidebar)
 * 5. No typewriter effects — data-fill animations only
 * 6. Real app chrome + sidebar hint + breadcrumbs
 * 7. MeetingDetail analytics for Analyze chapter (sentiment bar, coach rating, talk time, moment cards)
 * 8. Email + Slack Block Kit for Follow Up chapter
 * 9. Mini Kanban for Nurture Pipeline (deal cards moving between stages)
 * 10. Vertical timeline connector + progress dots on chapter nav
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Search, Send, Mic, BarChart3, Reply, TrendingUp,
  Check, Play, FileText, Clock, MessageSquare, Zap,
  ArrowRight, Loader2, Star, Mic2, Video,
  CheckCircle2, Globe, Users, ChevronRight,
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

// ─── Mock Data ──────────────────────────────────────────────

const PROSPECT_ROWS = [
  { initials: 'JK', name: 'Jessica Kim', title: 'CEO', company: 'DataForge', email: 'jessica@dataforge.io', phone: '---', linkedin: '---', enrichColor: 'bg-blue-500/10 text-blue-400' },
  { initials: 'MR', name: 'Marcus Rivera', title: 'Founder', company: 'NeuralPath', email: 'marcus@neuralpath.ai', phone: '---', linkedin: '---', enrichColor: 'bg-violet-500/10 text-violet-400' },
  { initials: 'AL', name: 'Aisha Lewis', title: 'CTO', company: 'ScaleOps', email: 'aisha@scaleops.com', phone: '---', linkedin: '---', enrichColor: 'bg-emerald-500/10 text-emerald-400' },
  { initials: 'TP', name: 'Tom Park', title: 'CEO', company: 'CloudSync', email: 'tom@cloudsync.io', phone: '---', linkedin: '---', enrichColor: 'bg-amber-500/10 text-amber-400' },
  { initials: 'SN', name: 'Sara Nakamura', title: 'Founder', company: 'MetricFlow', email: 'sara@metricflow.co', phone: '---', linkedin: '---', enrichColor: 'bg-rose-500/10 text-rose-400' },
];

const OUTREACH_ROWS = [
  { name: 'Jessica Kim', company: 'DataForge', email: 'Personalized intro', video: 'scripting', sequence: 'Step 1 of 3', status: 'pending' },
  { name: 'Marcus Rivera', company: 'NeuralPath', email: 'Follow-up angle', video: 'generating', sequence: 'Step 1 of 3', status: 'pending' },
  { name: 'Aisha Lewis', company: 'ScaleOps', email: 'Pain point focus', video: 'ready', sequence: 'Step 1 of 3', status: 'pending' },
  { name: 'Tom Park', company: 'CloudSync', email: 'Referral hook', video: 'idle', sequence: 'Step 1 of 3', status: 'pending' },
];

const MEETING_ATTENDEES = [
  { initials: 'YO', color: 'bg-blue-600' },
  { initials: 'SK', color: 'bg-emerald-600' },
  { initials: 'JC', color: 'bg-amber-600' },
  { initials: 'LP', color: 'bg-violet-600' },
];

const KANBAN_STAGES = [
  { label: 'Discovery', deals: [{ name: 'MetricFlow', value: '$12K', health: 72 }] },
  { label: 'Proposal', deals: [{ name: 'DataForge', value: '$18K', health: 87 }, { name: 'ScaleOps', value: '$24K', health: 65 }] },
  { label: 'Negotiation', deals: [{ name: 'NeuralPath', value: '$32K', health: 91 }] },
  { label: 'Closed Won', deals: [] },
];

const PROPOSAL_GEN_STEPS = [
  { label: 'Analyzing deal context...', duration: 400 },
  { label: 'Pulling meeting transcripts...', duration: 350 },
  { label: 'Extracting key requirements...', duration: 450 },
  { label: 'Generating executive summary...', duration: 500 },
  { label: 'Writing problem statement...', duration: 400 },
  { label: 'Crafting solution overview...', duration: 450 },
  { label: 'Building timeline...', duration: 350 },
  { label: 'Calculating pricing...', duration: 400 },
  { label: 'Applying brand styling...', duration: 250 },
  { label: 'Finalizing proposal...', duration: 200 },
];

// ─── Animation ──────────────────────────────────────────────

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

function EnrichmentCell({ state, value }: { state: CellState; value: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      {state === 'empty' && (
        <span className="text-[10px] text-gray-600 font-mono">---</span>
      )}
      {state === 'loading' && (
        <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
      )}
      {state === 'done' && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className="text-[10px] text-emerald-400 font-medium truncate"
        >
          {value}
        </motion.span>
      )}
    </div>
  );
}

// ─── Shared: Video Status Badge ─────────────────────────────

function VideoStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    idle: { label: 'Ready', className: 'bg-gray-700/50 text-gray-400' },
    scripting: { label: 'Scripting', className: 'bg-yellow-500/10 text-yellow-400' },
    generating: { label: 'Generating', className: 'bg-violet-500/10 text-violet-400' },
    ready: { label: 'Ready', className: 'bg-emerald-500/10 text-emerald-400' },
  };
  const c = config[status] || config.idle;
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

// ─── Chapter 1: Find Prospects (Ops Table) ──────────────────

function FindProspectsDemo({ isActive }: { isActive: boolean }) {
  const [visibleRows, setVisibleRows] = useState(0);
  const [enrichStates, setEnrichStates] = useState<Record<string, Record<string, CellState>>>({});

  useEffect(() => {
    if (!isActive) { setVisibleRows(0); setEnrichStates({}); return; }

    // Stagger row appearance
    const rowTimers = PROSPECT_ROWS.map((_, i) =>
      setTimeout(() => setVisibleRows(i + 1), 300 + i * 250),
    );

    // Stagger enrichment per row: phone → linkedin
    const enrichTimers: ReturnType<typeof setTimeout>[] = [];
    PROSPECT_ROWS.forEach((row, i) => {
      const baseDelay = 300 + i * 250 + 600;
      // Phone: loading
      enrichTimers.push(setTimeout(() => {
        setEnrichStates(prev => ({
          ...prev,
          [row.name]: { ...prev[row.name], phone: 'loading' },
        }));
      }, baseDelay));
      // Phone: done
      enrichTimers.push(setTimeout(() => {
        setEnrichStates(prev => ({
          ...prev,
          [row.name]: { ...prev[row.name], phone: 'done' },
        }));
      }, baseDelay + 500));
      // LinkedIn: loading
      enrichTimers.push(setTimeout(() => {
        setEnrichStates(prev => ({
          ...prev,
          [row.name]: { ...prev[row.name], linkedin: 'loading' },
        }));
      }, baseDelay + 300));
      // LinkedIn: done
      enrichTimers.push(setTimeout(() => {
        setEnrichStates(prev => ({
          ...prev,
          [row.name]: { ...prev[row.name], linkedin: 'done' },
        }));
      }, baseDelay + 800));
    });

    return () => { rowTimers.forEach(clearTimeout); enrichTimers.forEach(clearTimeout); };
  }, [isActive]);

  const phoneValues = ['+1 (415) 555-0142', '+1 (212) 555-0198', '+1 (310) 555-0167', '+1 (617) 555-0201', '+1 (503) 555-0134'];
  const linkedinValues = ['/in/jessicakim', '/in/marcusrivera', '/in/aishalewis', '/in/tompark', '/in/saranakamura'];

  return (
    <motion.div {...fadeIn} className="space-y-2">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
        <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        <span className="text-xs text-gray-400">SaaS founders in New York raising Series A</span>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">47 results</span>
      </div>

      {/* Ops table header */}
      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_100px_90px] gap-px bg-white/[0.03]">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Contact</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Phone</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">LinkedIn</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Source</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-white/[0.04]">
          {PROSPECT_ROWS.slice(0, visibleRows).map((row, i) => {
            const states = enrichStates[row.name] || {};
            return (
              <motion.div
                key={row.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-[1fr_80px_100px_90px] gap-px items-center bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
              >
                {/* Contact cell */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${row.enrichColor}`}>
                    {row.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-gray-200 truncate">{row.name}</p>
                    <p className="text-[9px] text-gray-500 truncate">{row.title} · {row.company}</p>
                  </div>
                </div>

                {/* Phone cell */}
                <div className="px-2 py-2">
                  <EnrichmentCell
                    state={(states.phone as CellState) || 'empty'}
                    value={phoneValues[i]}
                  />
                </div>

                {/* LinkedIn cell */}
                <div className="px-2 py-2">
                  <EnrichmentCell
                    state={(states.linkedin as CellState) || 'empty'}
                    value={linkedinValues[i]}
                  />
                </div>

                {/* Source badge */}
                <div className="px-2 py-2 flex justify-center">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                    {i % 2 === 0 ? 'Apollo' : 'AI Ark'}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Enrichment status */}
      {visibleRows >= 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 text-[11px] text-emerald-400"
        >
          <Check className="w-3.5 h-3.5" />
          <span className="font-medium">Enriching contacts across 3 data providers...</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Chapter 2: Send Messages (Ops Table) ───────────────────

function SendMessagesDemo({ isActive }: { isActive: boolean }) {
  const [visibleRows, setVisibleRows] = useState(0);
  const [rowStatuses, setRowStatuses] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!isActive) { setVisibleRows(0); setRowStatuses({}); return; }

    const timers: ReturnType<typeof setTimeout>[] = [];
    OUTREACH_ROWS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleRows(i + 1), 400 + i * 400));
      // Animate status: pending → sending → sent
      timers.push(setTimeout(() => setRowStatuses(prev => ({ ...prev, [i]: 'sending' })), 400 + i * 400 + 800));
      timers.push(setTimeout(() => setRowStatuses(prev => ({ ...prev, [i]: 'sent' })), 400 + i * 400 + 1400));
    });

    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <motion.div {...fadeIn} className="space-y-2">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-medium text-gray-300">Outreach Sequence</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">4 contacts</span>
      </div>

      {/* Ops table */}
      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr_90px_70px_60px] gap-px bg-white/[0.03]">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Contact</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Message</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Video</div>
          <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Status</div>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {OUTREACH_ROWS.slice(0, visibleRows).map((row, i) => {
            const status = rowStatuses[i] || 'pending';
            return (
              <motion.div
                key={row.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-[1fr_90px_70px_60px] gap-px items-center bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
              >
                <div className="px-3 py-2">
                  <p className="text-[11px] font-medium text-gray-200 truncate">{row.name}</p>
                  <p className="text-[9px] text-gray-500 truncate">{row.company}</p>
                </div>
                <div className="px-2 py-2">
                  <p className="text-[10px] text-gray-400 truncate">{row.email}</p>
                </div>
                <div className="px-2 py-2 flex justify-center">
                  <VideoStatusBadge status={row.video} />
                </div>
                <div className="px-2 py-2 flex justify-center">
                  {status === 'pending' && <div className="w-2 h-2 rounded-full bg-gray-600" />}
                  {status === 'sending' && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                  {status === 'sent' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Video preview card */}
      {visibleRows >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-violet-500/20 bg-violet-500/5 overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-violet-500/10">
            <Video className="w-3 h-3 text-violet-400" />
            <span className="text-[10px] font-medium text-violet-300">Personalized Video</span>
            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Ready</span>
          </div>
          <div className="p-2 flex items-center gap-3">
            <div className="w-20 h-12 rounded bg-violet-500/10 flex items-center justify-center shrink-0">
              <Play className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] text-gray-300">AI-generated intro for Jessica</p>
              <p className="text-[9px] text-gray-500">15s · Personalized with company data</p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Chapter 3: Record Meetings (CallGridThumbnail) ─────────

function RecordMeetingsDemo({ isActive }: { isActive: boolean }) {
  const [timer, setTimer] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showBadges, setShowBadges] = useState(false);

  useEffect(() => {
    if (!isActive) { setTimer(0); setShowOverlay(false); setShowBadges(false); return; }
    const timerInterval = setInterval(() => setTimer(t => t + 1), 1000);
    const t1 = setTimeout(() => setShowOverlay(true), 1000);
    const t2 = setTimeout(() => setShowBadges(true), 2500);
    return () => { clearInterval(timerInterval); clearTimeout(t1); clearTimeout(t2); };
  }, [isActive]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div {...fadeIn} className="space-y-3">
      {/* CallGridThumbnail — 2x2 avatar grid */}
      <div className="relative rounded-xl overflow-hidden border border-gray-700/30">
        <div className="aspect-video bg-[#0f172a]">
          <div className="grid grid-cols-2 grid-rows-2 h-full divide-x divide-y divide-gray-800/50">
            {MEETING_ATTENDEES.map((attendee, i) => (
              <div key={i} className="flex items-center justify-center relative">
                <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full ${attendee.color} flex items-center justify-center text-white text-sm font-bold`}>
                  {attendee.initials}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/70 via-transparent to-transparent pointer-events-none" />

        {/* REC indicator */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-900/80 backdrop-blur-sm border border-gray-700/30">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-semibold text-red-400">REC</span>
        </div>

        {/* Timer */}
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-900/80 backdrop-blur-sm text-[10px] text-gray-300 border border-gray-700/30">
          <Clock className="w-3 h-3" />
          <span className="font-mono">{formatTime(timer)}</span>
        </div>

        {/* Source badge */}
        <div className="absolute bottom-3 left-3">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-blue-500/20 text-blue-300 border-blue-500/30 backdrop-blur-sm">
            Zoom
          </span>
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-3 right-3">
          <span className="px-2 py-1 bg-gray-900/70 backdrop-blur-md rounded-lg text-[10px] text-gray-300 flex items-center gap-1 border border-gray-700/30">
            <Users className="h-3 w-3" />
            4 attendees
          </span>
        </div>
      </div>

      {/* Meeting info + live transcript hint */}
      {showOverlay && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-200">Q2 Strategy — MicroQuant</p>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live transcribing
            </span>
          </div>
        </motion.div>
      )}

      {/* Badges — source, participants */}
      {showBadges && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-1.5"
        >
          <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Check className="w-3 h-3" />
            Auto-recording
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <FileText className="w-3 h-3" />
            AI notes enabled
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Chapter 4: Analyze Meetings (Analytics View) ───────────

function AnalyzeMeetingsDemo({ isActive }: { isActive: boolean }) {
  const [analysisReady, setAnalysisReady] = useState(false);
  const [barsAnimated, setBarsAnimated] = useState(false);
  const [showMoments, setShowMoments] = useState(false);

  useEffect(() => {
    if (!isActive) { setAnalysisReady(false); setBarsAnimated(false); setShowMoments(false); return; }
    const t1 = setTimeout(() => setAnalysisReady(true), 800);
    const t2 = setTimeout(() => setBarsAnimated(true), 1200);
    const t3 = setTimeout(() => setShowMoments(true), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isActive]);

  if (!analysisReady) {
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
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Positive
        </span>
      </div>

      {/* Analytics bars */}
      <div className="space-y-2.5 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
        {/* Sentiment */}
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500">Sentiment</span>
            <span className="text-emerald-400">Positive</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              initial={{ width: '0%' }}
              animate={{ width: barsAnimated ? '82%' : '0%' }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* Coach Rating */}
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500 flex items-center gap-1"><Star className="w-3 h-3" /> Coach Rating</span>
            <span className="text-emerald-400">8.5/10</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              initial={{ width: '0%' }}
              animate={{ width: barsAnimated ? '85%' : '0%' }}
              transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* Talk Time */}
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500 flex items-center gap-1"><Mic2 className="w-3 h-3" /> Talk Time</span>
            <span className="text-emerald-400">Balanced</span>
          </div>
          <div className="flex gap-1">
            <div className="flex-1">
              <div className="text-[9px] text-gray-600 mb-0.5">Rep (38%)</div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-blue-500"
                  initial={{ width: '0%' }}
                  animate={{ width: barsAnimated ? '38%' : '0%' }}
                  transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[9px] text-gray-600 mb-0.5">Customer (62%)</div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-violet-500"
                  initial={{ width: '0%' }}
                  animate={{ width: barsAnimated ? '62%' : '0%' }}
                  transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key moments */}
      {showMoments && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-1.5"
        >
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Key Moments</p>
          {[
            { icon: Zap, label: 'Intent Detected', text: '"I\'ll send you a proposal"', color: 'text-emerald-400 bg-emerald-500/10' },
            { icon: DollarSign, label: 'Budget Confirmed', text: '$18-24K annual range', color: 'text-blue-400 bg-blue-500/10' },
            { icon: Calendar, label: 'Timeline', text: 'Q2 rollout target', color: 'text-amber-400 bg-amber-500/10' },
          ].map((moment, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15 }}
              className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]"
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${moment.color}`}>
                <moment.icon className="w-3 h-3" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-gray-300">{moment.label}</p>
                <p className="text-[9px] text-gray-500 truncate">{moment.text}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Chapter 5: Follow Up (Proposal Gen + Email + Slack) ────

function FollowUpDemo({ isActive }: { isActive: boolean }) {
  const [genStep, setGenStep] = useState(-1);
  const [showProposal, setShowProposal] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showSlack, setShowSlack] = useState(false);

  useEffect(() => {
    if (!isActive) { setGenStep(-1); setShowProposal(false); setShowEmail(false); setShowSlack(false); return; }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Fast-forward proposal generation steps
    let cumDelay = 200;
    PROPOSAL_GEN_STEPS.forEach((step, i) => {
      timers.push(setTimeout(() => setGenStep(i), cumDelay));
      cumDelay += step.duration;
    });

    // Show proposal preview
    timers.push(setTimeout(() => setShowProposal(true), cumDelay + 100));
    // Show email
    timers.push(setTimeout(() => setShowEmail(true), cumDelay + 500));
    // Show slack
    timers.push(setTimeout(() => setShowSlack(true), cumDelay + 900));

    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  // Phase 1: Generation progress
  if (!showProposal) {
    const progress = genStep >= 0 ? Math.round(((genStep + 1) / PROPOSAL_GEN_STEPS.length) * 100) : 0;
    return (
      <motion.div {...fadeIn} className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400 dark:text-emerald-400" />
          <span className="text-xs font-medium text-gray-200">Generating Proposal...</span>
          <span className="ml-auto text-[10px] font-mono text-gray-500">{progress}%</span>
        </div>

        <div className="space-y-1.5">
          {PROPOSAL_GEN_STEPS.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              {i < genStep ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : i === genStep ? (
                <Loader2 className="w-3.5 h-3.5 text-blue-400 dark:text-emerald-400 animate-spin shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-white/10 shrink-0" />
              )}
              <span className={`text-[10px] ${i <= genStep ? 'text-gray-300' : 'text-gray-600'}`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-blue-500 dark:bg-emerald-500"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </motion.div>
    );
  }

  // Phase 2: Proposal + Email + Slack
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2.5"
    >
      {/* Mini proposal preview */}
      <div className="rounded-lg border border-white/[0.06] overflow-hidden bg-white/[0.03]">
        {/* Proposal header — brand strip */}
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-blue-600 to-violet-500 dark:from-emerald-500 dark:via-emerald-600 dark:to-teal-500" />
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-gray-200">Proposal — MicroQuant x 60</p>
              <p className="text-[9px] text-gray-500">Generated from meeting insights</p>
            </div>
            <FileText className="w-4 h-4 text-gray-500" />
          </div>
          {/* Section previews */}
          <div className="space-y-1.5">
            {['Executive Summary', 'Solution Overview', 'Investment'].map((section, i) => (
              <motion.div
                key={section}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-2"
              >
                <div className="w-0.5 h-3 rounded-full bg-blue-500/40 dark:bg-emerald-500/40" />
                <span className="text-[10px] text-gray-400">{section}</span>
              </motion.div>
            ))}
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-emerald-500/5 border border-emerald-500/10 mt-1">
            <span className="text-[10px] text-gray-400">Annual License</span>
            <span className="text-xs font-bold text-emerald-400">$18,000/yr</span>
          </div>
        </div>
      </div>

      {/* Email preview */}
      {showEmail && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-1.5"
        >
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] font-medium text-gray-300">Follow-up Email</span>
            <span className="ml-auto text-[9px] text-emerald-400">Ready to send</span>
          </div>
          <div className="text-[10px] text-gray-500 space-y-0.5">
            <p><span className="text-gray-400">To:</span> sarah@microquant.com</p>
            <p><span className="text-gray-400">Subject:</span> Follow-up: 60 x MicroQuant</p>
          </div>
          <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
            Hi Sarah, Great speaking with you today. As discussed, I&apos;ve attached the proposal with custom pricing...
          </p>
          <div className="flex items-center gap-1.5 pt-1">
            <div className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
              <Paperclip className="w-2.5 h-2.5" />
              Proposal.pdf
            </div>
          </div>
        </motion.div>
      )}

      {/* Slack notification */}
      {showSlack && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-[#4A154B]/30 bg-[#4A154B]/10 p-2.5"
        >
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded bg-[#4A154B] flex items-center justify-center shrink-0">
              <MessageSquare className="w-3 h-3 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-200">60 Bot</span>
                <span className="text-[9px] text-gray-600">#deals</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">Follow-up sent to Sarah T. at MicroQuant · Proposal attached · CRM updated</p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Chapter 6: Nurture Pipeline (Mini Kanban) ──────────────

function NurturePipelineDemo({ isActive }: { isActive: boolean }) {
  const [visibleStages, setVisibleStages] = useState(0);
  const [movingDeal, setMovingDeal] = useState(false);
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    if (!isActive) { setVisibleStages(0); setMovingDeal(false); setShowAlert(false); return; }

    const timers: ReturnType<typeof setTimeout>[] = [];
    KANBAN_STAGES.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleStages(i + 1), 300 + i * 300));
    });
    // Animate deal moving to Closed Won
    timers.push(setTimeout(() => setMovingDeal(true), 2500));
    // Show risk alert
    timers.push(setTimeout(() => setShowAlert(true), 3500));

    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <motion.div {...fadeIn} className="space-y-3">
      {/* Pipeline header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-blue-400 dark:text-emerald-400" />
          <span className="text-xs font-medium text-gray-200">Pipeline Board</span>
        </div>
        <span className="text-[10px] text-gray-500">4 deals · $86K</span>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-4 gap-1.5">
        {KANBAN_STAGES.map((stage, stageIdx) => {
          if (stageIdx >= visibleStages) return <div key={stageIdx} />;

          const deals = [...stage.deals];
          // Move NeuralPath to Closed Won
          if (movingDeal && stageIdx === 3) {
            deals.push({ name: 'NeuralPath', value: '$32K', health: 91 });
          }
          const hideNeuralPath = movingDeal && stageIdx === 2;

          return (
            <motion.div
              key={stageIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: stageIdx * 0.1 }}
              className="rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden"
            >
              {/* Column header */}
              <div className="px-2 py-1.5 border-b border-white/[0.04]">
                <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider truncate">{stage.label}</p>
                <p className="text-[9px] text-gray-600">{deals.length} {deals.length === 1 ? 'deal' : 'deals'}</p>
              </div>

              {/* Cards */}
              <div className="p-1 space-y-1 min-h-[60px]">
                {deals.map((deal, dealIdx) => {
                  // Skip moved deal from source column
                  if (hideNeuralPath && deal.name === 'NeuralPath') {
                    return (
                      <motion.div
                        key={deal.name}
                        initial={{ opacity: 1, scale: 1 }}
                        animate={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.3 }}
                        className="p-1.5 rounded bg-white/[0.04] border border-white/[0.06]"
                      >
                        <p className="text-[9px] font-medium text-gray-400">{deal.name}</p>
                      </motion.div>
                    );
                  }

                  const isNewlyMoved = movingDeal && stageIdx === 3 && deal.name === 'NeuralPath';

                  return (
                    <motion.div
                      key={deal.name}
                      initial={isNewlyMoved ? { opacity: 0, x: -20, scale: 0.9 } : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                      transition={isNewlyMoved ? { type: 'spring', stiffness: 300, damping: 25 } : { delay: dealIdx * 0.1 }}
                      className={`p-1.5 rounded border ${
                        isNewlyMoved
                          ? 'bg-emerald-500/10 border-emerald-500/20'
                          : 'bg-white/[0.04] border-white/[0.06]'
                      }`}
                    >
                      <p className="text-[9px] font-medium text-gray-300 truncate">{deal.name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[8px] font-mono text-gray-500">{deal.value}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          deal.health >= 80 ? 'bg-emerald-500' : deal.health >= 60 ? 'bg-amber-500' : 'bg-red-500'
                        }`} />
                      </div>
                    </motion.div>
                  );
                })}

                {/* Empty state for Closed Won before deal moves */}
                {stageIdx === 3 && !movingDeal && stage.deals.length === 0 && (
                  <div className="flex items-center justify-center h-10">
                    <span className="text-[8px] text-gray-700">Drop zone</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Risk alert */}
      {showAlert && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-amber-400">At-risk: ScaleOps ($24K)</p>
              <p className="text-[9px] text-gray-500">No activity in 7 days · Auto-scheduling check-in</p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Chapter Navigation (Left Panel with Timeline) ──────────

const DEMO_COMPONENTS = [
  FindProspectsDemo,
  SendMessagesDemo,
  RecordMeetingsDemo,
  AnalyzeMeetingsDemo,
  FollowUpDemo,
  NurturePipelineDemo,
];

function ChapterNav({
  activeIndex,
  onSelect,
  progressKey,
  isHovered,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  progressKey: number;
  isHovered: boolean;
}) {
  return (
    <>
      {/* Mobile: horizontal pills */}
      <div className="flex lg:hidden gap-2 overflow-x-auto pb-3 scrollbar-hide">
        {CHAPTERS.map((chapter, i) => {
          const Icon = chapter.icon;
          const active = i === activeIndex;
          const completed = i < activeIndex;
          return (
            <button
              key={chapter.id}
              onClick={() => onSelect(i)}
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                active
                  ? 'bg-blue-600 dark:bg-emerald-500 text-white'
                  : completed
                  ? 'bg-blue-100 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {chapter.label}
            </button>
          );
        })}
      </div>

      {/* Desktop: vertical list with timeline connector */}
      <div className="hidden lg:flex flex-col relative">
        {/* Vertical timeline line */}
        <div className="absolute left-[19px] top-6 bottom-6 w-px bg-gray-200 dark:bg-white/[0.06]" />

        {CHAPTERS.map((chapter, i) => {
          const Icon = chapter.icon;
          const active = i === activeIndex;
          const completed = i < activeIndex;

          return (
            <button
              key={chapter.id}
              onClick={() => onSelect(i)}
              className={`relative w-full text-left px-4 py-3 rounded-xl transition-all ${
                active
                  ? 'bg-blue-50 dark:bg-white/[0.06] border border-blue-200 dark:border-white/10'
                  : 'hover:bg-gray-50 dark:hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Progress dot / icon */}
                <div
                  className={`relative z-10 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    active
                      ? 'bg-blue-100 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 ring-2 ring-blue-200 dark:ring-emerald-500/20'
                      : completed
                      ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {completed ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold transition-colors ${
                    active ? 'text-gray-900 dark:text-white' : completed ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {chapter.label}
                  </p>
                  <p className={`text-xs mt-0.5 truncate transition-colors ${
                    active ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {chapter.description}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              {active && (
                <div className="mt-2.5 ml-11 h-1 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
                  <motion.div
                    key={`progress-${progressKey}`}
                    className="h-full rounded-full bg-blue-600 dark:bg-emerald-500"
                    initial={{ width: '0%' }}
                    animate={{ width: isHovered ? undefined : '100%' }}
                    transition={{ duration: CHAPTER_DURATION / 1000, ease: 'linear' }}
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

// ─── Demo Viewport (Right Panel with App Chrome) ────────────

function DemoViewport({ activeIndex }: { activeIndex: number }) {
  const DemoComponent = DEMO_COMPONENTS[activeIndex];
  const chapter = CHAPTERS[activeIndex];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[#0f0f1a] shadow-lg dark:shadow-none">
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
        {/* Sidebar hint */}
        <div className="hidden sm:flex w-10 shrink-0 flex-col items-center gap-3 py-3 border-r border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02]">
          <Globe className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
          <div className="w-3.5 h-0.5 rounded-full bg-gray-200 dark:bg-white/[0.06]" />
          <div className="w-3.5 h-0.5 rounded-full bg-gray-200 dark:bg-white/[0.06]" />
          <div className="w-3.5 h-0.5 rounded-full bg-gray-200 dark:bg-white/[0.06]" />
        </div>
        {/* Breadcrumb */}
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

// ─── Main Component ─────────────────────────────────────────

export function InteractiveDemoV14() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const isPaused = useRef(false);
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
      if (!isPaused.current) {
        setActiveIndex((i) => (i + 1) % CHAPTERS.length);
        setProgressKey((k) => k + 1);
      }
    }, CHAPTER_DURATION);
    return () => clearInterval(id);
  }, [prefersReducedMotion, isInView]);

  const handleSelect = useCallback((index: number) => {
    setActiveIndex(index);
    setProgressKey((k) => k + 1);
  }, []);

  const handleMouseEnter = useCallback(() => {
    isPaused.current = true;
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    isPaused.current = false;
    setIsHovered(false);
  }, []);

  return (
    <section ref={sectionRef} className="bg-gray-50 dark:bg-[#111] py-24 md:py-32" id="demo">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12 md:mb-16"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">
            How it works
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            See 60 in action
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            From prospecting to proposal — watch the full sales cycle, automated.
          </p>
        </motion.div>

        {/* Step indicator dots — mobile only */}
        <div className="flex items-center justify-center gap-1.5 mb-8 lg:hidden">
          {CHAPTERS.map((_, i) => (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === activeIndex
                  ? 'bg-blue-600 dark:bg-emerald-500 w-6'
                  : i < activeIndex
                  ? 'bg-blue-300 dark:bg-emerald-500/40'
                  : 'bg-gray-300 dark:bg-white/20'
              }`}
            />
          ))}
        </div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="flex flex-col lg:flex-row gap-6 lg:gap-8"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Left: Chapter nav */}
          <div className="lg:w-[300px] shrink-0">
            <ChapterNav
              activeIndex={activeIndex}
              onSelect={handleSelect}
              progressKey={progressKey}
              isHovered={isHovered}
            />
          </div>

          {/* Right: Demo viewport */}
          <div className="flex-1 min-w-0">
            <DemoViewport activeIndex={activeIndex} />
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mt-10"
        >
          <a
            href="https://app.use60.com/signup"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-emerald-400 hover:text-blue-700 dark:hover:text-emerald-300 transition-colors"
          >
            Try it yourself — free forever
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
