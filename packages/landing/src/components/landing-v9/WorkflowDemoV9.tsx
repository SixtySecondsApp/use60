import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Check, MessageSquare } from 'lucide-react';

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

const ACT_DURATION = 8000;

const STAGES = [
  { label: 'BEFORE THE CALL', key: 'before' },
  { label: 'DURING THE CALL', key: 'during' },
  { label: 'AFTER THE CALL', key: 'after' },
] as const;

type ActKey = (typeof STAGES)[number]['key'];

/* ------------------------------------------------------------------ */
/*  Act 1 — Before the Call                                            */
/* ------------------------------------------------------------------ */

function ActBefore({ isActive }: { isActive: boolean }) {
  const companyLine = useTypewriter(
    'Series B, 200 employees, expanding into US market',
    20,
    isActive,
  );

  const talkingPoints = [
    'Ask about US logistics timeline',
    'Reference their recent fundraise',
    'Propose pilot for Q2 launch',
  ];

  const [visiblePoints, setVisiblePoints] = useState(0);
  const [showReady, setShowReady] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setVisiblePoints(0);
      setShowReady(false);
      return;
    }
    // Start showing points after 2.5s (typewriter done ~1.5s + buffer)
    const timers: ReturnType<typeof setTimeout>[] = [];
    talkingPoints.forEach((_, i) => {
      timers.push(
        setTimeout(() => setVisiblePoints(i + 1), 2800 + i * 600),
      );
    });
    timers.push(setTimeout(() => setShowReady(true), 2800 + talkingPoints.length * 600 + 400));
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Meeting with Sarah Chen — Bloom & Wild
      </motion.div>

      {/* Company context */}
      <div className="text-xs text-gray-500 dark:text-zinc-400 min-h-[1.25rem] font-mono">
        {companyLine}
        <span className="animate-pulse">|</span>
      </div>

      {/* Talking points */}
      <div className="space-y-2">
        <div className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
          Talking Points
        </div>
        {talkingPoints.map((point, i) => (
          <motion.div
            key={point}
            initial={{ opacity: 0, x: -8 }}
            animate={i < visiblePoints ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-start gap-2.5 text-xs text-gray-600 dark:text-zinc-300"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-emerald-500 mt-1.5 shrink-0" />
            {point}
          </motion.div>
        ))}
      </div>

      {/* Ready badge */}
      <AnimatePresence>
        {showReady && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium rounded-full"
          >
            <Check className="w-3.5 h-3.5" />
            Ready
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Act 2 — During the Call                                            */
/* ------------------------------------------------------------------ */

function ActDuring({ isActive }: { isActive: boolean }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  const timerStr = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  const transcript1 = useTypewriter(
    'Sarah: We\'re looking to launch in the US by Q2...',
    25,
    isActive,
  );

  const [showLine2, setShowLine2] = useState(false);
  const transcript2 = useTypewriter(
    'You: That aligns well with our pilot program...',
    25,
    showLine2,
  );

  const [showInsights, setShowInsights] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setShowLine2(false);
      setShowInsights(false);
      return;
    }
    const t1 = setTimeout(() => setShowLine2(true), 2500);
    const t2 = setTimeout(() => setShowInsights(true), 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isActive]);

  const insights = [
    { label: 'Budget: $120K', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
    { label: 'Timeline: Q2', color: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
    { label: 'Decision maker confirmed', color: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' },
  ];

  return (
    <div className="space-y-4">
      {/* Call header */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          Call with Sarah Chen
        </div>
        <div className="text-xs font-mono text-gray-400 dark:text-zinc-500 tabular-nums">
          {timerStr}
        </div>
      </div>

      {/* Audio waveform */}
      <div className="flex items-center justify-center gap-[3px] h-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-blue-500 dark:bg-emerald-500"
            style={{
              animation: isActive ? `waveform-v9 0.8s ease-in-out infinite` : 'none',
              animationDelay: `${i * 0.07}s`,
              height: isActive ? undefined : '20%',
            }}
          />
        ))}
      </div>

      {/* Transcript */}
      <div className="space-y-2 text-xs text-gray-600 dark:text-zinc-300 min-h-[3rem]">
        <div className="font-mono">{transcript1}</div>
        {showLine2 && <div className="font-mono">{transcript2}</div>}
      </div>

      {/* Insight badges */}
      <AnimatePresence>
        {showInsights && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-wrap gap-2"
          >
            {insights.map((ins, i) => (
              <motion.span
                key={ins.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.2, type: 'spring', stiffness: 400, damping: 20 }}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${ins.color}`}
              >
                {ins.label}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Act 3 — After the Call                                             */
/* ------------------------------------------------------------------ */

function ActAfter({ isActive }: { isActive: boolean }) {
  const emailText = useTypewriter(
    'Hi Sarah, Great speaking today. Here\'s a summary of what we discussed...',
    15,
    isActive,
  );

  const [showProposal, setShowProposal] = useState(false);
  const [checkedTasks, setCheckedTasks] = useState<number[]>([]);
  const [showSlack, setShowSlack] = useState(false);

  const tasks = ['Update CRM', 'Send follow-up', 'Share notes in Slack'];

  useEffect(() => {
    if (!isActive) {
      setShowProposal(false);
      setCheckedTasks([]);
      setShowSlack(false);
      return;
    }
    const timers = [
      setTimeout(() => setShowProposal(true), 2500),
      setTimeout(() => setCheckedTasks([0]), 4000),
      setTimeout(() => setCheckedTasks([0, 1]), 4800),
      setTimeout(() => setCheckedTasks([0, 1, 2]), 5600),
      setTimeout(() => setShowSlack(true), 6400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <div className="space-y-4">
      {/* Follow-up email */}
      <div>
        <div className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
          Follow-up Email
        </div>
        <div className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg p-3 text-xs text-gray-600 dark:text-zinc-300 leading-relaxed min-h-[3.5rem] font-mono">
          {emailText}
          <span className="animate-pulse">|</span>
        </div>
      </div>

      {/* Proposal badge */}
      <AnimatePresence>
        {showProposal && (
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-zinc-300 bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg px-3 py-2"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-emerald-500" />
            Proposal generated — 3 pages
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tasks */}
      <div className="space-y-1.5">
        {tasks.map((task, i) => (
          <motion.div
            key={task}
            className="flex items-center gap-2 text-xs"
            animate={{
              color: checkedTasks.includes(i) ? undefined : undefined,
            }}
          >
            <motion.div
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                checkedTasks.includes(i)
                  ? 'bg-blue-600 dark:bg-emerald-500 border-blue-600 dark:border-emerald-500'
                  : 'border-gray-300 dark:border-zinc-600'
              }`}
            >
              {checkedTasks.includes(i) && (
                <Check className="w-3 h-3 text-white" />
              )}
            </motion.div>
            <span
              className={
                checkedTasks.includes(i)
                  ? 'text-gray-400 dark:text-zinc-500 line-through'
                  : 'text-gray-600 dark:text-zinc-300'
              }
            >
              {task}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Slack notification */}
      <AnimatePresence>
        {showSlack && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400"
          >
            <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />
            Posted to #sales-alerts
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reduced-motion static fallback                                     */
/* ------------------------------------------------------------------ */

function StaticFallback() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {STAGES.map((stage) => (
        <div
          key={stage.key}
          className="bg-white dark:bg-zinc-900/90 border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
            <span className="text-[10px] font-bold tracking-wider text-blue-600 dark:text-emerald-400 uppercase">
              {stage.label}
            </span>
          </div>
          <div className="p-5">
            {stage.key === 'before' && <ActBefore isActive />}
            {stage.key === 'during' && <ActDuring isActive />}
            {stage.key === 'after' && <ActAfter isActive />}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  WorkflowDemoV9                                                     */
/* ------------------------------------------------------------------ */

export function WorkflowDemoV9() {
  const [activeAct, setActiveAct] = useState<number>(0);
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

  // Auto-advance loop
  useEffect(() => {
    if (prefersReducedMotion || !isInView) return;
    const id = setInterval(() => {
      if (!isPaused.current) {
        setActiveAct((prev) => (prev + 1) % 3);
      }
    }, ACT_DURATION);
    return () => clearInterval(id);
  }, [prefersReducedMotion, isInView]);

  const handleMouseEnter = useCallback(() => {
    isPaused.current = true;
  }, []);
  const handleMouseLeave = useCallback(() => {
    isPaused.current = false;
  }, []);

  const currentStage = STAGES[activeAct];

  return (
    <section
      ref={sectionRef}
      className="bg-gray-50 dark:bg-[#111] py-24 md:py-32"
    >
      {/* Waveform keyframes */}
      <style>{`
        @keyframes waveform-v9 {
          0%, 100% { height: 20%; }
          50% { height: 80%; }
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
            See it in action
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            One platform. Every stage of the deal.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-zinc-400 text-lg font-body max-w-2xl mx-auto">
            Watch how 60 works before, during, and after every sales call.
          </p>
        </motion.div>

        {/* Reduced-motion fallback */}
        {prefersReducedMotion ? (
          <StaticFallback />
        ) : (
          /* Demo container */
          <div
            className="max-w-2xl mx-auto"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="bg-white dark:bg-zinc-900/90 border border-gray-200 dark:border-white/[0.06] rounded-xl shadow-sm overflow-hidden">
              {/* Browser chrome + progress indicator */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
                {/* Traffic-light dots */}
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
                </div>

                {/* Stage indicator */}
                <div className="flex items-center gap-2">
                  {STAGES.map((stage, i) => (
                    <button
                      key={stage.key}
                      onClick={() => setActiveAct(i)}
                      className={`w-6 h-1.5 rounded-full transition-colors cursor-pointer ${
                        i === activeAct
                          ? 'bg-blue-600 dark:bg-emerald-500'
                          : 'bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600'
                      }`}
                      aria-label={`Show ${stage.label.toLowerCase()}`}
                    />
                  ))}
                </div>
              </div>

              {/* Stage badge */}
              <div className="px-5 pt-4">
                <span className="text-[10px] font-bold tracking-wider text-blue-600 dark:text-emerald-400 uppercase">
                  {currentStage.label}
                </span>
              </div>

              {/* Act content */}
              <div className="p-5 min-h-[280px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStage.key}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {activeAct === 0 && <ActBefore isActive={activeAct === 0} />}
                    {activeAct === 1 && <ActDuring isActive={activeAct === 1} />}
                    {activeAct === 2 && <ActAfter isActive={activeAct === 2} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
