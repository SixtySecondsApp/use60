import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Calendar,
  Mail,
  Hash,
  Users,
  Clock,
  AlertTriangle,
  Send,
  Edit3,
  Bot,
  ThumbsUp,
  Check,
  MessageSquare,
  X,
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
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */

interface TabDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { key: 'brief', label: 'Meeting Brief', icon: Calendar },
  { key: 'email', label: 'Email Composer', icon: Mail },
  { key: 'slack', label: 'Slack Alert', icon: Hash },
];

const AUTO_ADVANCE_MS = 6000;

/* ------------------------------------------------------------------ */
/*  Countdown hook                                                     */
/* ------------------------------------------------------------------ */

function useCountdown(durationMs: number, isPaused: boolean, resetKey: number) {
  const [remaining, setRemaining] = useState(Math.ceil(durationMs / 1000));

  useEffect(() => {
    setRemaining(Math.ceil(durationMs / 1000));
    if (isPaused) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) return Math.ceil(durationMs / 1000);
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [durationMs, isPaused, resetKey]);

  return remaining;
}

/* ------------------------------------------------------------------ */
/*  Panel 1 — Meeting Brief (animated)                                 */
/* ------------------------------------------------------------------ */

function MeetingBriefAnimated({ isActive }: { isActive: boolean }) {
  const talkingPoints = [
    'Lead with ROI — she mentioned "board presentation" last call',
    'Address Gong comparison proactively — our scope is wider',
    'Offer 15-seat pilot to de-risk the decision',
  ];

  const [visiblePoints, setVisiblePoints] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setVisiblePoints(0);
      return;
    }
    const timers = talkingPoints.map((_, i) =>
      setTimeout(() => setVisiblePoints(i + 1), 800 + i * 700),
    );
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <div>
      {/* Attendee card */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Sarah Chen</div>
          <div className="text-xs text-gray-500 dark:text-[#8891b0]">VP Sales, Bloom & Wild</div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-[#8891b0]">
          <Clock className="w-3.5 h-3.5" />
          Tomorrow 2pm
        </div>
      </div>

      {/* Context alert */}
      <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2.5 mb-4">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Sarah opened your pricing PDF 4 times this week. Likely evaluating budget internally.
        </p>
      </div>

      {/* Talking points — animated */}
      <div>
        <div className="text-[10px] font-semibold text-gray-400 dark:text-[#8891b0] uppercase tracking-wider mb-2">
          Talking Points
        </div>
        <ul className="space-y-2">
          {talkingPoints.map((point, i) => (
            <motion.li
              key={point}
              initial={{ opacity: 0, x: -8 }}
              animate={i < visiblePoints ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-2.5 text-xs text-gray-600 dark:text-zinc-300"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-violet-600 dark:bg-violet-400 mt-1.5 shrink-0" />
              {point}
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel 2 — Email Composer (animated)                                */
/* ------------------------------------------------------------------ */

function EmailComposerAnimated({ isActive }: { isActive: boolean }) {
  const emailBody = useTypewriter(
    'Great conversation on Thursday. You mentioned the team burns ~3 hours a week just on post-call admin \u2014 CRM updates, follow-up emails, Slack summaries. That\'s exactly what 60 automates.',
    20,
    isActive,
  );

  return (
    <div>
      {/* To / Re header */}
      <div className="space-y-1.5 mb-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 dark:text-[#8891b0] w-6">To</span>
          <span className="text-gray-900 dark:text-white font-medium">sarah.chen@bloomandwild.com</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 dark:text-[#8891b0] w-6">Re</span>
          <span className="text-gray-900 dark:text-white font-medium">Following up on Thursday's call</span>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-white/[0.06] pt-4 space-y-3 text-xs text-gray-600 dark:text-zinc-300 leading-relaxed min-h-[6rem]">
        <p>Hi Sarah,</p>
        <p className="font-mono">
          {emailBody}
          <span className="animate-pulse">|</span>
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-5">
        <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-blue-500 text-white text-xs font-medium rounded-lg">
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
        <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-zinc-300 text-xs font-medium rounded-lg">
          <Edit3 className="w-3.5 h-3.5" />
          Edit
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel 3 — Slack Alert (animated)                                   */
/* ------------------------------------------------------------------ */

function SlackAlertAnimated({ isActive }: { isActive: boolean }) {
  const [showMessage, setShowMessage] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setShowMessage(false);
      setShowButtons(false);
      setShowConfirmation(false);
      return;
    }
    const timers = [
      setTimeout(() => setShowMessage(true), 300),
      setTimeout(() => setShowButtons(true), 2000),
      setTimeout(() => setShowConfirmation(true), 4500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-violet-600 dark:text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">60 Bot</span>
          <span className="text-[10px] text-gray-400 dark:text-[#8891b0]">2 min ago</span>
        </div>

        {/* Message body */}
        <AnimatePresence>
          {showMessage && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.06] rounded-lg p-3 space-y-2 text-xs text-gray-700 dark:text-zinc-300"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="font-semibold text-gray-900 dark:text-white">
                  Deal going cold: Bloom & Wild ($48k)
                </span>
              </div>
              <p className="leading-relaxed">
                Sarah Chen hasn't replied in 12 days. Last activity: opened pricing PDF on Mar 1.
                Champion engagement score dropped from 82 to 41.
              </p>
              <p className="leading-relaxed">
                I've drafted a re-engagement email referencing the board timeline she mentioned.
                Want me to send it?
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <AnimatePresence>
          {showButtons && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-2 mt-3"
            >
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-blue-500 text-white text-xs font-medium rounded-lg">
                <ThumbsUp className="w-3.5 h-3.5" />
                Send It
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-zinc-300 text-xs font-medium rounded-lg">
                <X className="w-3.5 h-3.5" />
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirmation */}
        <AnimatePresence>
          {showConfirmation && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-1.5 mt-3 text-[11px] text-gray-400 dark:text-[#8891b0]"
            >
              <Check className="w-3.5 h-3.5 text-green-500" />
              <span>
                <MessageSquare className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                3 deals saved this month with proactive re-engagement
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ShowcaseTabsV12                                                    */
/* ------------------------------------------------------------------ */

export function ShowcaseTabsV12() {
  const [activeTab, setActiveTab] = useState(0);
  const isPaused = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: false, margin: '-100px' });
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<number>();
  const [resetKey, setResetKey] = useState(0);

  const countdown = useCountdown(AUTO_ADVANCE_MS, isHovered, resetKey);

  // Progress bar animation
  useEffect(() => {
    if (isPaused.current || !isInView) {
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(elapsed / AUTO_ADVANCE_MS, 1);
      setProgress(pct);
      if (pct < 1) {
        progressRef.current = requestAnimationFrame(tick);
      }
    };
    progressRef.current = requestAnimationFrame(tick);
    return () => {
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [activeTab, isInView, isPaused.current]);

  // Auto-advance
  useEffect(() => {
    if (!isInView) return;
    const id = setInterval(() => {
      if (!isPaused.current) {
        setActiveTab((prev) => (prev + 1) % TABS.length);
        setProgress(0);
        setResetKey((k) => k + 1);
      }
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [isInView]);

  const handleTabClick = useCallback((index: number) => {
    setActiveTab(index);
    setProgress(0);
    setResetKey((k) => k + 1);
  }, []);

  const handleMouseEnter = useCallback(() => {
    isPaused.current = true;
    setIsHovered(true);
  }, []);
  const handleMouseLeave = useCallback(() => {
    isPaused.current = false;
    setIsHovered(false);
    setResetKey((k) => k + 1);
  }, []);

  return (
    <section ref={sectionRef} className="bg-white dark:bg-[#070b1a] py-24 md:py-32">
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
            Product Showcase
          </p>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-[#e1f0ff] tracking-tight">
            Built for every stage of the deal.
          </h2>
        </motion.div>

        {/* Tabbed container */}
        <div
          className="max-w-2xl mx-auto"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-white dark:bg-[#131a2e] border border-gray-200 dark:border-white/[0.06] rounded-xl shadow-sm overflow-hidden">
            {/* Tab bar */}
            <div className="relative flex border-b border-gray-100 dark:border-white/[0.06]">
              {TABS.map((tab, i) => {
                const Icon = tab.icon;
                const isSelected = i === activeTab;
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleTabClick(i)}
                    className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'text-violet-600 dark:text-violet-400'
                        : 'text-gray-400 dark:text-[#8891b0] hover:text-gray-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{tab.label}</span>

                    {/* Countdown text next to active tab */}
                    {isSelected && !isHovered && (
                      <span className="hidden sm:inline text-[10px] text-gray-300 dark:text-zinc-600 font-normal ml-1 tabular-nums">
                        Next in {countdown}s...
                      </span>
                    )}

                    {/* Animated underline — gradient */}
                    {isSelected && (
                      <motion.div
                        layoutId="tab-indicator-v12"
                        className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-violet-600 to-blue-500"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}

                    {/* Progress bar on active tab */}
                    {isSelected && (
                      <div className="absolute bottom-0 left-0 right-0 h-[3px]">
                        <div
                          className="h-full bg-violet-400/30 dark:bg-violet-400/20"
                          style={{ width: `${progress * 100}%`, transition: 'width 50ms linear' }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="p-5 min-h-[300px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={TABS[activeTab].key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  {activeTab === 0 && <MeetingBriefAnimated isActive={activeTab === 0 && isInView} />}
                  {activeTab === 1 && <EmailComposerAnimated isActive={activeTab === 1 && isInView} />}
                  {activeTab === 2 && <SlackAlertAnimated isActive={activeTab === 2 && isInView} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Pause indicator below card */}
          <div className="flex items-center justify-center h-5 mt-3">
            <AnimatePresence mode="wait">
              {isHovered ? (
                <motion.span
                  key="paused"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-[11px] text-gray-400 dark:text-[#8891b0]"
                >
                  Paused
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
        </div>
      </div>
    </section>
  );
}
