/**
 * BentoShowcase — Step 4
 *
 * Sequential full-viewport panels. Each panel gets a contextual headline,
 * plays its animation, then auto-advances to the next panel.
 * No scrolling — one panel at a time, centered in the viewport.
 *
 * Flow:
 *   1. "Start your day informed"       → Meeting Prep panel
 *   2. "Spot risks before they cost you" → Deal Intelligence panel
 *   3. "Never send a generic email"     → Cold Outreach panel
 *   4. "Never forget a follow-up"       → Task Queue panel → Continue CTA
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  TrendingUp,
  Mail,
  ListChecks,
  Check,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTypewriter } from './useTypewriter';
import type { ResearchData } from './demo-types';

// ============================================================================
// Panel Shell (single card, centered, no grid)
// ============================================================================

interface PanelShellProps {
  icon: React.ReactNode;
  title: string;
  status: string;
  children: React.ReactNode;
}

function PanelShell({ icon, title, status, children }: PanelShellProps) {
  return (
    <div
      className={cn(
        'bg-[#0c1017]/90 backdrop-blur-md',
        'border border-white/[0.06]',
        'rounded-xl sm:rounded-2xl overflow-hidden',
        'w-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs sm:text-sm font-semibold text-gray-200">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none" />
          <span className="text-[9px] sm:text-[10px] font-mono tracking-widest text-gray-500 uppercase">
            {status}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

// ============================================================================
// Panel 1: Meeting Prep Brief
// ============================================================================

function MeetingPrepPanel({
  data,
  active,
  onDone,
}: {
  data: ResearchData['demo_actions']['meeting_prep'];
  active: boolean;
  onDone: () => void;
}) {
  const context = data?.context ?? 'Preparing meeting intelligence…';
  const talkingPoints = data?.talking_points ?? [];

  const { displayed: contextText, isDone: contextDone } = useTypewriter(
    context,
    14,
    active
  );

  const [visiblePoints, setVisiblePoints] = useState(0);
  const maxPoints = Math.min(talkingPoints.length, 3);

  useEffect(() => {
    if (!contextDone || !active) return;
    if (visiblePoints >= maxPoints) return;
    const t = setTimeout(() => setVisiblePoints((v) => v + 1), 350);
    return () => clearTimeout(t);
  }, [contextDone, visiblePoints, maxPoints, active]);

  // Signal done when all points revealed
  useEffect(() => {
    if (visiblePoints >= maxPoints && maxPoints > 0 && contextDone) {
      const t = setTimeout(onDone, 1200);
      return () => clearTimeout(t);
    }
  }, [visiblePoints, maxPoints, contextDone, onDone]);

  // Fallback done if no talking points
  useEffect(() => {
    if (contextDone && maxPoints === 0) {
      const t = setTimeout(onDone, 1500);
      return () => clearTimeout(t);
    }
  }, [contextDone, maxPoints, onDone]);

  return (
    <div className="space-y-3">
      <p className="text-sm sm:text-base font-semibold text-white truncate">
        {data?.attendee_company ?? 'Prospect'} &middot; Prep Brief
      </p>

      <div className="font-mono text-[11px] text-gray-400">
        Attendee: <span className="text-gray-200">{data?.attendee_name ?? 'Contact'}</span>
      </div>

      <div className="flex items-start gap-2 text-[11px] sm:text-xs">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
        <p className="font-mono text-amber-400/90 leading-relaxed">
          {contextText}
          {!contextDone && <span className="animate-pulse motion-reduce:animate-none">&block;</span>}
        </p>
      </div>

      {visiblePoints > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] sm:text-[10px] font-mono text-gray-500 uppercase tracking-wider">
            Talking points:
          </p>
          <ol className="space-y-1">
            {talkingPoints.slice(0, visiblePoints).map((point, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="text-[11px] sm:text-xs text-gray-300 font-mono flex gap-2"
              >
                <span className="text-gray-500 shrink-0">{i + 1}.</span>
                <span className="line-clamp-2">{point}</span>
              </motion.li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Panel 2: Deal Intelligence
// ============================================================================

function DealIntelPanel({
  data,
  active,
  onDone,
}: {
  data: ResearchData['demo_actions']['pipeline_action'];
  active: boolean;
  onDone: () => void;
}) {
  const healthScore = data?.health_score ?? 45;
  const signals = data?.signals ?? [];
  const maxSignals = Math.min(signals.length, 4);
  const [scoreWidth, setScoreWidth] = useState(0);
  const [visibleSignals, setVisibleSignals] = useState(0);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setScoreWidth(healthScore), 400);
    return () => clearTimeout(t);
  }, [active, healthScore]);

  useEffect(() => {
    if (!active) return;
    if (visibleSignals >= maxSignals) return;
    const t = setTimeout(
      () => setVisibleSignals((v) => v + 1),
      800 + visibleSignals * 300
    );
    return () => clearTimeout(t);
  }, [active, visibleSignals, maxSignals]);

  // Signal done when all signals revealed
  useEffect(() => {
    if (visibleSignals >= maxSignals && maxSignals > 0 && active) {
      const t = setTimeout(onDone, 1200);
      return () => clearTimeout(t);
    }
  }, [visibleSignals, maxSignals, active, onDone]);

  // Fallback done if no signals
  useEffect(() => {
    if (active && maxSignals === 0) {
      const t = setTimeout(onDone, 2500);
      return () => clearTimeout(t);
    }
  }, [active, maxSignals, onDone]);

  const scoreColor =
    healthScore > 60
      ? 'text-emerald-400'
      : healthScore > 35
        ? 'text-amber-400'
        : 'text-red-400';

  const barColor =
    healthScore > 60
      ? 'bg-emerald-500'
      : healthScore > 35
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm sm:text-base font-semibold text-white truncate">
          {data?.deal_name ?? 'Deal'}
        </p>
        <span className="text-xs sm:text-sm font-semibold text-gray-300 shrink-0 tabular-nums">
          {data?.deal_value ?? '$0'}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] sm:text-[10px] font-mono text-gray-500 uppercase tracking-wider">
            Health Score
          </span>
          <span className={cn('text-base sm:text-lg font-bold tabular-nums', scoreColor)}>
            {scoreWidth}%
          </span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${scoreWidth}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className={cn('h-full rounded-full', barColor)}
          />
        </div>
        <p className="text-[10px] sm:text-[11px] text-gray-500 font-mono truncate">
          Stale {data?.days_stale ?? 0} days &middot; {(data?.risk_signal ?? '').slice(0, 50)}&hellip;
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-[9px] sm:text-[10px] font-mono text-gray-500 uppercase tracking-wider">
          Signals
        </p>
        <ul className="space-y-1">
          {signals.slice(0, visibleSignals).map((sig, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-[11px] sm:text-xs"
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  sig.type === 'positive' && 'bg-emerald-500',
                  sig.type === 'warning' && 'bg-amber-500',
                  sig.type === 'neutral' && 'bg-gray-500'
                )}
              />
              <span className={cn(sig.type === 'warning' ? 'text-amber-400' : 'text-gray-300')}>
                {sig.label}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Panel 3: Cold Outreach Email
// ============================================================================

function OutreachPanel({
  data,
  active,
  onDone,
}: {
  data: ResearchData['demo_actions']['cold_outreach'];
  active: boolean;
  onDone: () => void;
}) {
  const { displayed: emailText, isDone } = useTypewriter(
    data?.email_preview ?? 'Composing personalised outreach…',
    12,
    active
  );

  const targetName = data?.target_name ?? 'Contact';
  const targetCompany = data?.target_company ?? 'Company';

  // Signal done after typewriter finishes + read time
  useEffect(() => {
    if (isDone && active) {
      const t = setTimeout(onDone, 1400);
      return () => clearTimeout(t);
    }
  }, [isDone, active, onDone]);

  return (
    <div className="space-y-3">
      <div className="font-mono text-[11px] text-gray-500">
        TO:{' '}
        <span className="text-gray-300">
          {targetName.toLowerCase().replace(' ', '.')}@
          {targetCompany.toLowerCase().replace(/\s+/g, '')}.com
        </span>
      </div>

      <div className="text-xs sm:text-sm text-gray-300 leading-relaxed whitespace-pre-wrap min-h-[80px] sm:min-h-[100px] max-h-[200px] overflow-y-auto scrollbar-thin">
        {emailText}
        {!isDone && (
          <span className="text-violet-400 animate-pulse motion-reduce:animate-none">&block;</span>
        )}
      </div>

      {isDone && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-3 pt-1"
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[11px] sm:text-xs font-semibold">
            <Check className="w-3 h-3" />
            Approve &amp; Send
          </div>
          <span className="text-[11px] sm:text-xs text-gray-500">Edit</span>
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// Panel 4: Task Queue
// ============================================================================

function TaskQueuePanel({
  data,
  active,
  onDone,
}: {
  data: ResearchData;
  active: boolean;
  onDone: () => void;
}) {
  const targetName = data?.demo_actions?.cold_outreach?.target_name ?? 'prospect';
  const tasks = [
    { label: `Send ROI calculator to ${targetName}` },
    { label: 'Book technical review meeting' },
    { label: 'Update deal forecast in CRM' },
    { label: 'Prep QBR deck for Thursday' },
    { label: 'Share call summary on Slack' },
  ];

  const [checkedCount, setCheckedCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (checkedCount >= 3) return;
    const t = setTimeout(() => setCheckedCount((c) => c + 1), 500 + checkedCount * 450);
    return () => clearTimeout(t);
  }, [active, checkedCount]);

  // Signal done after 3 tasks checked + read time
  useEffect(() => {
    if (checkedCount >= 3 && active) {
      const t = setTimeout(onDone, 1200);
      return () => clearTimeout(t);
    }
  }, [checkedCount, active, onDone]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-mono text-gray-500 tabular-nums">
          {checkedCount}/{tasks.length} completed
        </p>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: checkedCount > 0 ? 1 : 0 }}
          className="text-[11px] font-semibold text-violet-400"
        >
          +5 auto-created
        </motion.span>
      </div>

      <ul className="space-y-2">
        {tasks.map((task, i) => {
          const isChecked = i < checkedCount;
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
              className="flex items-center gap-2.5"
            >
              <div
                className={cn(
                  'w-4 h-4 sm:w-5 sm:h-5 rounded-md border flex items-center justify-center shrink-0 transition-all duration-300',
                  isChecked
                    ? 'bg-violet-500 border-violet-500'
                    : 'border-gray-600 bg-transparent'
                )}
              >
                {isChecked && <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />}
              </div>
              <span
                className={cn(
                  'text-xs sm:text-sm transition-all duration-300 truncate',
                  isChecked ? 'text-gray-500 line-through' : 'text-gray-300'
                )}
              >
                {task.label}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================================
// Panel definitions with contextual headlines
// ============================================================================

interface PanelDef {
  headline: string;
  subtitle: string;
  icon: React.ReactNode;
  title: string;
  status: string;
  render: (data: ResearchData, onDone: () => void) => React.ReactNode;
}

const PANELS: PanelDef[] = [
  {
    headline: 'Start your day informed',
    subtitle: 'AI-generated meeting briefs with real competitive intelligence.',
    icon: <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />,
    title: 'Meeting Brief',
    status: 'Generating',
    render: (data, onDone) => (
      <MeetingPrepPanel data={data.demo_actions.meeting_prep} active onDone={onDone} />
    ),
  },
  {
    headline: 'Spot risks before they cost you',
    subtitle: 'Real-time deal scoring with competitive signals and health tracking.',
    icon: <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />,
    title: 'Deal Intelligence',
    status: 'Analysing',
    render: (data, onDone) => (
      <DealIntelPanel data={data.demo_actions.pipeline_action} active onDone={onDone} />
    ),
  },
  {
    headline: 'Never send a generic email again',
    subtitle: 'Hyper-personalised outreach grounded in real company intelligence.',
    icon: <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-400" />,
    title: 'Follow-Up Draft',
    status: 'Composing',
    render: (data, onDone) => (
      <OutreachPanel data={data.demo_actions.cold_outreach} active onDone={onDone} />
    ),
  },
  {
    headline: 'Never forget a follow-up',
    subtitle: 'Auto-created tasks from meetings, emails, and pipeline signals.',
    icon: <ListChecks className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-400" />,
    title: 'Task Queue',
    status: 'Auto-creating',
    render: (data, onDone) => (
      <TaskQueuePanel data={data} active onDone={onDone} />
    ),
  },
];

// ============================================================================
// Main Sequential Showcase
// ============================================================================

interface BentoShowcaseProps {
  data: ResearchData;
  onComplete: () => void;
}

export function BentoShowcase({ data, onComplete }: BentoShowcaseProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCta, setShowCta] = useState(false);

  const handlePanelDone = useCallback(() => {
    if (currentIndex < PANELS.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setShowCta(true);
    }
  }, [currentIndex]);

  const panel = PANELS[currentIndex];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6"
    >
      <div className="w-full max-w-md sm:max-w-lg mx-auto">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 mb-6 sm:mb-8">
          {PANELS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 rounded-full transition-all duration-500',
                i === currentIndex
                  ? 'w-8 bg-violet-500'
                  : i < currentIndex
                    ? 'w-4 bg-violet-500/40'
                    : 'w-4 bg-gray-700'
              )}
            />
          ))}
        </div>

        {/* Headline — animates per panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-center mb-5 sm:mb-6"
          >
            <p className="text-[10px] sm:text-[11px] font-mono text-gray-500 uppercase tracking-widest mb-2">
              Personalised for {data.company?.name ?? 'your company'}
            </p>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white text-balance tracking-tight">
              {panel.headline}
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-2 text-pretty max-w-sm mx-auto">
              {panel.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Panel card — animates per panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <PanelShell
              icon={panel.icon}
              title={panel.title}
              status={panel.status}
            >
              {panel.render(data, handlePanelDone)}
            </PanelShell>
          </motion.div>
        </AnimatePresence>

        {/* Continue CTA — appears after last panel */}
        <AnimatePresence>
          {showCta && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-6 sm:mt-8 text-center"
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                onClick={onComplete}
                className={cn(
                  'px-8 py-3 rounded-xl font-semibold text-sm',
                  'bg-white text-gray-950',
                  'hover:bg-gray-100 transition-colors',
                  'inline-flex items-center gap-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                  'motion-reduce:transform-none'
                )}
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
