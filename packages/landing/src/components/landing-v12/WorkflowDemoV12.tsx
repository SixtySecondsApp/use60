import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Check,
  MessageSquare,
  Brain,
  TrendingUp,
} from 'lucide-react';

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
const NUM_ACTS = 4;

const STAGES = [
  { label: 'BEFORE THE CALL', key: 'before' },
  { label: 'DURING THE CALL', key: 'during' },
  { label: 'AFTER THE CALL', key: 'after' },
  { label: 'THE INTELLIGENCE LAYER', key: 'intelligence' },
] as const;

/* ------------------------------------------------------------------ */
/*  Act 1 — Before the Call                                            */
/* ------------------------------------------------------------------ */

function ActBefore({ isActive }: { isActive: boolean }) {
  const companyLine = useTypewriter(
    'Series B, 200 employees, expanding into US market',
    18,
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
    const timers: ReturnType<typeof setTimeout>[] = [];
    talkingPoints.forEach((_, i) => {
      timers.push(
        setTimeout(() => setVisiblePoints(i + 1), 2000 + i * 500),
      );
    });
    timers.push(setTimeout(() => setShowReady(true), 2000 + talkingPoints.length * 500 + 300));
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Meeting with Sarah Chen — Bloom & Wild
      </motion.div>

      <div className="text-xs text-gray-500 dark:text-[#8891b0] min-h-[1.25rem] font-mono">
        {companyLine}
        <span className="animate-pulse">|</span>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold text-gray-400 dark:text-[#8891b0] uppercase tracking-wider">
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
            <div className="w-1.5 h-1.5 rounded-full bg-violet-600 dark:bg-violet-400 mt-1.5 shrink-0" />
            {point}
          </motion.div>
        ))}
      </div>

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
    22,
    isActive,
  );

  const [showLine2, setShowLine2] = useState(false);
  const transcript2 = useTypewriter(
    'You: That aligns well with our pilot program...',
    22,
    showLine2,
  );

  const [showInsights, setShowInsights] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setShowLine2(false);
      setShowInsights(false);
      return;
    }
    const t1 = setTimeout(() => setShowLine2(true), 2000);
    const t2 = setTimeout(() => setShowInsights(true), 3800);
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
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          Call with Sarah Chen
        </div>
        <div className="text-xs font-mono text-gray-400 dark:text-[#8891b0] tabular-nums">
          {timerStr}
        </div>
      </div>

      <div className="flex items-center justify-center gap-[3px] h-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-gradient-to-t from-violet-600 to-blue-500"
            style={{
              animation: isActive ? 'waveform-v12-workflow 0.8s ease-in-out infinite' : 'none',
              animationDelay: `${i * 0.07}s`,
              height: isActive ? undefined : '20%',
            }}
          />
        ))}
      </div>

      <div className="space-y-2 text-xs text-gray-600 dark:text-zinc-300 min-h-[3rem]">
        <div className="font-mono">{transcript1}</div>
        {showLine2 && <div className="font-mono">{transcript2}</div>}
      </div>

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
                transition={{ delay: i * 0.15, type: 'spring', stiffness: 400, damping: 20 }}
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
    12,
    isActive,
  );

  const [checkedTasks, setCheckedTasks] = useState<number[]>([]);
  const [showSlack, setShowSlack] = useState(false);

  const tasks = ['Update CRM', 'Send follow-up', 'Share notes in Slack'];

  useEffect(() => {
    if (!isActive) {
      setCheckedTasks([]);
      setShowSlack(false);
      return;
    }
    const timers = [
      setTimeout(() => setCheckedTasks([0]), 2400),
      setTimeout(() => setCheckedTasks([0, 1]), 3000),
      setTimeout(() => setCheckedTasks([0, 1, 2]), 3600),
      setTimeout(() => setShowSlack(true), 4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold text-gray-400 dark:text-[#8891b0] uppercase tracking-wider mb-2">
          Follow-up Email
        </div>
        <div className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg p-3 text-xs text-gray-600 dark:text-zinc-300 leading-relaxed min-h-[3.5rem] font-mono">
          {emailText}
          <span className="animate-pulse">|</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {tasks.map((task, i) => (
          <motion.div
            key={task}
            className="flex items-center gap-2 text-xs"
          >
            <motion.div
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                checkedTasks.includes(i)
                  ? 'bg-gradient-to-r from-violet-600 to-blue-500 border-violet-600 dark:border-violet-500'
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

      <AnimatePresence>
        {showSlack && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 text-xs text-gray-500 dark:text-[#8891b0]"
          >
            <MessageSquare className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            Posted to #sales-alerts
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Act 4 — The Intelligence Layer                                     */
/* ------------------------------------------------------------------ */

function ActIntelligence({ isActive }: { isActive: boolean }) {
  const [healthWidth, setHealthWidth] = useState(0);
  const [visibleSignals, setVisibleSignals] = useState(0);
  const [showAction, setShowAction] = useState(false);
  const [showLearning, setShowLearning] = useState(false);

  const signals = [
    { text: 'Champion went quiet (14 days)', color: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
    { text: 'Competitor mentioned in last call', color: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
    { text: 'Budget approval pending', color: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
  ];

  useEffect(() => {
    if (!isActive) {
      setHealthWidth(0);
      setVisibleSignals(0);
      setShowAction(false);
      setShowLearning(false);
      return;
    }
    const timers = [
      setTimeout(() => setHealthWidth(72), 400),
      setTimeout(() => setVisibleSignals(1), 1200),
      setTimeout(() => setVisibleSignals(2), 1800),
      setTimeout(() => setVisibleSignals(3), 2400),
      setTimeout(() => setShowAction(true), 3200),
      setTimeout(() => setShowLearning(true), 4400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg p-3"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            Acme Corp — $120K
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            <span className="text-xs font-mono font-medium text-violet-600 dark:text-violet-400 tabular-nums">
              {healthWidth}%
            </span>
          </div>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-600 to-blue-500 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${healthWidth}%` }}
          />
        </div>
        <div className="text-[10px] text-gray-400 dark:text-[#8891b0] mt-1.5">Deal Health Score</div>
      </motion.div>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold text-gray-400 dark:text-[#8891b0] uppercase tracking-wider">
          Risk Signals
        </div>
        <div className="flex flex-wrap gap-2">
          {signals.map((signal, i) => (
            <motion.span
              key={signal.text}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={i < visibleSignals ? { opacity: 1, scale: 1 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${signal.color}`}
            >
              {signal.text}
            </motion.span>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showAction && (
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="bg-violet-50 dark:bg-violet-500/5 border border-violet-200 dark:border-violet-500/20 rounded-lg px-3 py-2.5"
          >
            <div className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">
              Suggested Action
            </div>
            <p className="text-xs text-violet-800 dark:text-violet-300 leading-relaxed">
              Re-engage Sarah via LinkedIn with Q2 expansion angle
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLearning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 text-xs text-gray-400 dark:text-[#8891b0]"
          >
            <Brain className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            <span className="italic">
              60 learned: This rep prefers LinkedIn over email for re-engagement
            </span>
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
          className="bg-white dark:bg-[#131a2e] border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
            <span className="text-[10px] font-bold tracking-wider text-violet-600 dark:text-violet-400 uppercase">
              {stage.label}
            </span>
          </div>
          <div className="p-5">
            {stage.key === 'before' && <ActBefore isActive />}
            {stage.key === 'during' && <ActDuring isActive />}
            {stage.key === 'after' && <ActAfter isActive />}
            {stage.key === 'intelligence' && <ActIntelligence isActive />}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pause indicator component                                          */
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
            className="text-[11px] text-gray-400 dark:text-[#8891b0]"
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
            className="text-[11px] text-gray-400 dark:text-[#8891b0] flex items-center gap-1.5"
          >
            Auto-advancing
            <span className="inline-block w-1 h-1 rounded-full bg-gradient-to-r from-violet-600 to-blue-500 animate-pulse" />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  WorkflowDemoV12                                                    */
/* ------------------------------------------------------------------ */

export function WorkflowDemoV12() {
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
        setActiveAct((prev) => (prev + 1) % NUM_ACTS);
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
      className="bg-gray-50 dark:bg-[#0c1222] py-24 md:py-32"
    >
      {/* Waveform keyframes */}
      <style>{`
        @keyframes waveform-v12-workflow {
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
          <p className="text-violet-600 dark:text-violet-400 text-sm font-medium mb-4 tracking-wide uppercase">
            See it in action
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-[#e1f0ff] tracking-tight">
            One platform. Every stage of the deal.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-[#8891b0] text-lg font-body max-w-2xl mx-auto">
            Watch how 60 works across every stage of the deal — from prep to pipeline intelligence.
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
            <div className="bg-white dark:bg-[#131a2e] border border-gray-200 dark:border-white/[0.06] rounded-xl shadow-sm overflow-hidden">
              {/* Browser chrome + progress segments */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
                {/* Traffic-light dots */}
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
                </div>

                {/* Progress segments — 4 clickable segments */}
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
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-600 to-blue-500 rounded-full"
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
                        <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-500 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stage badge */}
              <div className="px-5 pt-4">
                <span className="text-[10px] font-bold tracking-wider text-violet-600 dark:text-violet-400 uppercase">
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
                    {activeAct === 3 && <ActIntelligence isActive={activeAct === 3} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Pause indicator below the card */}
            <PauseIndicator isPaused={isHovered} />
          </div>
        )}
      </div>
    </section>
  );
}
