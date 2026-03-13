import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Mic, Search, Sparkles, Send, Check, Database, Zap } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Typewriter hook                                                    */
/* ------------------------------------------------------------------ */

function useTypewriter(text: string, speed: number, isActive: boolean) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!isActive) {
      setDisplayed('');
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, isActive]);
  return displayed;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ACT_DURATION = 6000;

const STAGES = [
  { label: 'FIND', key: 'find' },
  { label: 'ENRICH', key: 'enrich' },
  { label: 'ENGAGE', key: 'engage' },
] as const;

type ActKey = (typeof STAGES)[number]['key'];

/* ------------------------------------------------------------------ */
/*  Table data                                                         */
/* ------------------------------------------------------------------ */

const TABLE_ROWS = [
  { name: 'Sarah Chen', company: 'TechFlow', stage: 'Series A', industry: 'SaaS' },
  { name: 'James Liu', company: 'Propel AI', stage: 'Series A', industry: 'SaaS' },
  { name: 'Maria Torres', company: 'CloudBase', stage: 'Series A', industry: 'SaaS' },
  { name: 'David Kim', company: 'Relay.io', stage: 'Seed+', industry: 'SaaS' },
  { name: 'Anika Patel', company: 'VaultHQ', stage: 'Series A', industry: 'SaaS' },
];

const ENRICHMENT_DATA = [
  { email: 'sarah@techflow.co', phone: '+1 (212) 555-0142', linkedin: '/in/sarachen' },
  { email: 'james@propelai.com', phone: '+1 (646) 555-0198', linkedin: '/in/jamesliu' },
  { email: 'maria@cloudbase.io', phone: null, linkedin: '/in/mariat' },
  { email: 'david@relay.io', phone: '+1 (917) 555-0233', linkedin: '/in/davidkim' },
  { email: 'anika@vaulthq.com', phone: '+1 (347) 555-0177', linkedin: '/in/anikapatel' },
];

/* ------------------------------------------------------------------ */
/*  Waveform bar component                                             */
/* ------------------------------------------------------------------ */

function VoiceWaveform({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[3px] h-6 mb-3">
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-blue-500 dark:bg-emerald-500"
          style={{
            animation: isActive ? 'waveform-v11 0.6s ease-in-out infinite' : 'none',
            animationDelay: `${i * 0.05}s`,
            height: isActive ? undefined : '15%',
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Act 1 — Find                                                       */
/* ------------------------------------------------------------------ */

function ActFind({ isActive }: { isActive: boolean }) {
  const voiceText = useTypewriter(
    'Find me 10 SaaS founders in New York raising Series A',
    22,
    isActive,
  );

  const [visibleRows, setVisibleRows] = useState(0);
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setVisibleRows(0);
      setShowStatus(false);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    TABLE_ROWS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleRows(i + 1), 2400 + i * 350));
    });
    timers.push(setTimeout(() => setShowStatus(true), 2400 + TABLE_ROWS.length * 350 + 200));
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <div className="space-y-3">
      {/* Voice waveform */}
      <VoiceWaveform isActive={isActive} />

      {/* Voice command typewriter */}
      <div className="flex items-center gap-2 mb-3">
        <Mic className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400 shrink-0" />
        <div className="text-xs text-gray-600 dark:text-zinc-300 font-mono min-h-[1.25rem]">
          {voiceText}
          <span className="animate-pulse">|</span>
        </div>
      </div>

      {/* Mini ops table */}
      <div className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-4 gap-2 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06]">
          {['Name', 'Company', 'Stage', 'Industry'].map((col) => (
            <div key={col} className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
              {col}
            </div>
          ))}
        </div>

        {/* Table rows */}
        <div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
          {TABLE_ROWS.map((row, i) => (
            <motion.div
              key={row.name}
              initial={{ opacity: 0, x: -8 }}
              animate={i < visibleRows ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-4 gap-2 px-3 py-1.5"
            >
              <div className="text-xs text-gray-900 dark:text-white font-medium truncate">{row.name}</div>
              <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">{row.company}</div>
              <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">{row.stage}</div>
              <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">{row.industry}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Source badges */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">
          Apollo
        </span>
        <span className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">
          AI Ark
        </span>
      </div>

      {/* Status */}
      <AnimatePresence>
        {showStatus && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium rounded-full"
          >
            <Check className="w-3.5 h-3.5" />
            10 leads found in 4.2 seconds
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Act 2 — Enrich                                                     */
/* ------------------------------------------------------------------ */

function ActEnrich({ isActive }: { isActive: boolean }) {
  const [visibleCells, setVisibleCells] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [showComplete, setShowComplete] = useState(false);

  const totalCells = ENRICHMENT_DATA.length * 3; // email + phone + linkedin per row

  useEffect(() => {
    if (!isActive) {
      setVisibleCells(0);
      setProgressPct(0);
      setShowComplete(false);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < totalCells; i++) {
      timers.push(
        setTimeout(() => {
          setVisibleCells(i + 1);
          setProgressPct(Math.round(((i + 1) / totalCells) * 100));
        }, 600 + i * 250),
      );
    }
    timers.push(setTimeout(() => setShowComplete(true), 600 + totalCells * 250 + 200));
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Enriching 10 leads</span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-blue-600 dark:bg-emerald-500 rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
        <div className="text-[10px] text-gray-400 dark:text-zinc-500 font-mono tabular-nums">
          {progressPct}% enriched
        </div>
      </div>

      {/* Enrichment table */}
      <div className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-4 gap-2 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06]">
          {['Name', 'Email', 'Phone', 'LinkedIn'].map((col) => (
            <div key={col} className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
              {col}
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
          {ENRICHMENT_DATA.map((row, rowIdx) => {
            const emailIdx = rowIdx * 3;
            const phoneIdx = rowIdx * 3 + 1;
            const linkedinIdx = rowIdx * 3 + 2;

            return (
              <div key={TABLE_ROWS[rowIdx].name} className="grid grid-cols-4 gap-2 px-3 py-1.5">
                <div className="text-xs text-gray-900 dark:text-white font-medium truncate">
                  {TABLE_ROWS[rowIdx].name}
                </div>
                <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                  {visibleCells > emailIdx ? (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-1"
                    >
                      <Check className="w-3 h-3 text-green-500 shrink-0" />
                      <span className="truncate">{row.email}</span>
                    </motion.span>
                  ) : (
                    <span className="text-gray-300 dark:text-zinc-700">---</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                  {visibleCells > phoneIdx ? (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-1"
                    >
                      {row.phone ? (
                        <>
                          <Check className="w-3 h-3 text-green-500 shrink-0" />
                          <span className="truncate">{row.phone}</span>
                        </>
                      ) : (
                        <span className="text-gray-300 dark:text-zinc-600">N/A</span>
                      )}
                    </motion.span>
                  ) : (
                    <span className="text-gray-300 dark:text-zinc-700">---</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                  {visibleCells > linkedinIdx ? (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-1"
                    >
                      <Check className="w-3 h-3 text-green-500 shrink-0" />
                      <span className="truncate">{row.linkedin}</span>
                    </motion.span>
                  ) : (
                    <span className="text-gray-300 dark:text-zinc-700">---</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Complete status */}
      <AnimatePresence>
        {showComplete && (
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="bg-green-50 dark:bg-green-500/5 border border-green-200 dark:border-green-500/20 rounded-lg px-3 py-2"
          >
            <p className="text-xs text-green-700 dark:text-green-300 leading-relaxed">
              Enrichment complete: 10/10 emails verified, 8/10 phones found
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Act 3 — Engage                                                     */
/* ------------------------------------------------------------------ */

function ActEngage({ isActive }: { isActive: boolean }) {
  const [visibleIcons, setVisibleIcons] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [showSequence, setShowSequence] = useState(false);
  const [showPushed, setShowPushed] = useState(false);

  const emailText = useTypewriter(
    'Hi Sarah, I saw TechFlow just closed your Series A \u2014 congrats! We help SaaS founders automate outreach so you can focus on building...',
    16,
    showPreview,
  );

  useEffect(() => {
    if (!isActive) {
      setVisibleIcons(0);
      setShowPreview(false);
      setShowSequence(false);
      setShowPushed(false);
      return;
    }
    const timers = [
      setTimeout(() => setVisibleIcons(1), 500),
      setTimeout(() => setVisibleIcons(2), 900),
      setTimeout(() => setVisibleIcons(3), 1300),
      setTimeout(() => setVisibleIcons(4), 1700),
      setTimeout(() => setVisibleIcons(5), 2100),
      setTimeout(() => setShowPreview(true), 2400),
      setTimeout(() => setShowSequence(true), 4200),
      setTimeout(() => setShowPushed(true), 5200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Send className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Creating sequences</span>
      </div>

      {/* Sequence assignments */}
      <div className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg overflow-hidden">
        <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06]">
          {['Name', 'Company', 'Sequence'].map((col) => (
            <div key={col} className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
              {col}
            </div>
          ))}
        </div>
        <div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
          {TABLE_ROWS.map((row, i) => (
            <div key={row.name} className="grid grid-cols-3 gap-2 px-3 py-1.5">
              <div className="text-xs text-gray-900 dark:text-white font-medium truncate">{row.name}</div>
              <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">{row.company}</div>
              <div className="text-xs">
                {i < visibleIcons ? (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-emerald-400"
                  >
                    <Send className="w-3 h-3" />
                    3-step
                  </motion.span>
                ) : (
                  <span className="text-gray-300 dark:text-zinc-700">---</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Email preview */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg p-3"
          >
            <div className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
              Preview: Sarah Chen
            </div>
            <div className="text-xs text-gray-600 dark:text-zinc-300 font-mono leading-relaxed min-h-[2.5rem]">
              {emailText}
              <span className="animate-pulse">|</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sequence badge */}
      <AnimatePresence>
        {showSequence && (
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-zinc-300 bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg px-3 py-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />
            Sequence created: 3-step, personalized for each lead
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pushed badge */}
      <AnimatePresence>
        {showPushed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium rounded-full"
          >
            <Check className="w-3.5 h-3.5" />
            Pushed to Instantly
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pause indicator                                                    */
/* ------------------------------------------------------------------ */

function PauseIndicator({ isPaused }: { isPaused: boolean }) {
  return (
    <div className="flex items-center justify-center h-5 mt-3">
      <AnimatePresence mode="wait">
        {isPaused ? (
          <motion.span
            key="paused"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-[11px] text-gray-400 dark:text-zinc-500"
          >
            Paused — click to resume
          </motion.span>
        ) : (
          <motion.span
            key="auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-[11px] text-gray-400 dark:text-zinc-500 flex items-center gap-1.5"
          >
            Auto-advancing
            <span className="inline-block w-1 h-1 rounded-full bg-blue-600 dark:bg-emerald-500 animate-pulse" />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CommandCenterDemo                                                  */
/* ------------------------------------------------------------------ */

export function CommandCenterDemo() {
  const [activeAct, setActiveAct] = useState<number>(0);
  const [isHovered, setIsHovered] = useState(false);
  const isPaused = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: false, margin: '-100px' });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [progressKey, setProgressKey] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Auto-advance loop
  useEffect(() => {
    if (prefersReducedMotion || !isInView) return;
    const id = setInterval(() => {
      if (!isPaused.current) {
        setActiveAct((prev) => (prev + 1) % 3);
        setProgressKey((k) => k + 1);
      }
    }, ACT_DURATION);
    return () => clearInterval(id);
  }, [prefersReducedMotion, isInView]);

  const handleMouseEnter = useCallback(() => {
    isPaused.current = true;
    setIsHovered(true);
  }, []);
  const handleMouseLeave = useCallback(() => {
    isPaused.current = false;
    setIsHovered(false);
    setProgressKey((k) => k + 1);
  }, []);

  const handleSegmentClick = useCallback((index: number) => {
    setActiveAct(index);
    setProgressKey((k) => k + 1);
  }, []);

  const currentStage = STAGES[activeAct];

  return (
    <section
      ref={sectionRef}
      className="bg-gray-50 dark:bg-[#111] py-24 md:py-32"
    >
      {/* Waveform keyframes */}
      <style>{`
        @keyframes waveform-v11 {
          0%, 100% { height: 15%; }
          50% { height: 85%; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">
            Command Center
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            Speak it. Watch it happen.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-zinc-400 text-lg font-body max-w-2xl mx-auto">
            Tell 60 what you need — leads, research, outreach — and watch it build your pipeline in real time. No spreadsheets. No switching tools. Just results.
          </p>
        </motion.div>

        {/* Demo container */}
        <div
          className="max-w-2xl mx-auto"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-white dark:bg-zinc-900/90 border border-gray-200 dark:border-white/[0.06] rounded-xl shadow-sm overflow-hidden">
            {/* Browser chrome + progress segments */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
              {/* Traffic-light dots */}
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
              </div>

              {/* URL bar */}
              <div className="text-[10px] text-gray-400 dark:text-zinc-600 font-mono bg-gray-100 dark:bg-white/5 px-3 py-1 rounded">
                app.use60.com/ops
              </div>

              {/* Progress segments */}
              <div className="flex items-center gap-1.5">
                {STAGES.map((stage, i) => (
                  <button
                    key={stage.key}
                    onClick={() => handleSegmentClick(i)}
                    className="relative w-8 h-1.5 rounded-full overflow-hidden cursor-pointer bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
                    aria-label={`Show ${stage.label.toLowerCase()}`}
                  >
                    {i === activeAct && (
                      <motion.div
                        key={`fill-${progressKey}`}
                        className="absolute inset-y-0 left-0 bg-blue-600 dark:bg-emerald-500 rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: isHovered ? undefined : '100%' }}
                        transition={{
                          duration: ACT_DURATION / 1000,
                          ease: 'linear',
                        }}
                        style={isHovered ? { width: undefined } : undefined}
                      />
                    )}
                    {i < activeAct && (
                      <div className="absolute inset-0 bg-blue-600 dark:bg-emerald-500 rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Stage badge */}
            <div className="px-5 pt-4 flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider text-blue-600 dark:text-emerald-400 uppercase">
                {currentStage.label}
              </span>
              {activeAct === 0 && <Search className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />}
              {activeAct === 1 && <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />}
              {activeAct === 2 && <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />}
            </div>

            {/* Act content */}
            <div className="p-5 min-h-[340px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStage.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  {activeAct === 0 && <ActFind isActive={activeAct === 0} />}
                  {activeAct === 1 && <ActEnrich isActive={activeAct === 1} />}
                  {activeAct === 2 && <ActEngage isActive={activeAct === 2} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Pause indicator */}
          <PauseIndicator isPaused={isHovered} />
        </div>
      </div>
    </section>
  );
}
