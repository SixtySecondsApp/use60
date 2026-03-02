/**
 * AutonomySimulator (AP-029)
 *
 * Animated 90-day autonomy progression demo component.
 * Shows prospects how the autopilot engine learns from approvals and
 * automatically upgrades autonomy tiers over time.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  Clock,
  Zap,
  CheckCircle,
  Play,
  Pause,
  ChevronRight,
  X,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type ActionTier = 'auto' | 'approve' | 'suggest';

interface ActionItem {
  key: string;
  label: string;
  tier: ActionTier;
}

interface DayState {
  day: number;
  autonomyPct: number;
  timeSavedHrs: number;
  actionsAutomated: number;
  actions: ActionItem[];
}

interface ProposalCard {
  day: number;
  actionLabel: string;
  approvalCount: number;
}

interface ChartDataPoint {
  day: number;
  autonomy: number;
}

// ============================================================================
// Props
// ============================================================================

export interface AutonomySimulatorProps {
  className?: string;
  showRealDataButton?: boolean;
}

// ============================================================================
// Simulation data
// ============================================================================

const ALL_ACTIONS: ActionItem[] = [
  { key: 'crm.note_add', label: 'Meeting notes', tier: 'approve' },
  { key: 'crm.activity_log', label: 'Activity logging', tier: 'approve' },
  { key: 'crm.contact_enrich', label: 'Contact enrichment', tier: 'approve' },
  { key: 'crm.next_steps_update', label: 'Next steps', tier: 'approve' },
  { key: 'task.create', label: 'Task creation', tier: 'approve' },
  { key: 'crm.deal_field_update', label: 'Deal field updates', tier: 'approve' },
  { key: 'email.follow_up_send', label: 'Follow-up emails', tier: 'approve' },
  { key: 'email.draft_save', label: 'Email drafts', tier: 'approve' },
  { key: 'analysis.coaching_feedback', label: 'Coaching feedback', tier: 'suggest' },
  { key: 'crm.deal_stage_change', label: 'Deal stage changes', tier: 'suggest' },
  { key: 'crm.deal_amount_change', label: 'Deal amount changes', tier: 'suggest' },
  { key: 'calendar.create_event', label: 'Meeting scheduling', tier: 'suggest' },
];

// Milestones: day -> which action keys become 'auto'
const MILESTONES: Array<{
  day: number;
  autoKeys: string[];
  proposal: ProposalCard;
}> = [
  {
    day: 15,
    autoKeys: ['crm.note_add', 'crm.activity_log'],
    proposal: {
      day: 15,
      actionLabel: 'meeting notes and activity logging',
      approvalCount: 20,
    },
  },
  {
    day: 25,
    autoKeys: ['crm.contact_enrich', 'crm.next_steps_update'],
    proposal: {
      day: 25,
      actionLabel: 'contact enrichment and next steps',
      approvalCount: 18,
    },
  },
  {
    day: 32,
    autoKeys: ['task.create'],
    proposal: {
      day: 32,
      actionLabel: 'task creation',
      approvalCount: 20,
    },
  },
  {
    day: 45,
    autoKeys: ['crm.deal_field_update', 'email.follow_up_send'],
    proposal: {
      day: 45,
      actionLabel: 'deal field updates and follow-up emails',
      approvalCount: 15,
    },
  },
  {
    day: 60,
    autoKeys: ['email.draft_save'],
    proposal: {
      day: 60,
      actionLabel: 'email draft saving',
      approvalCount: 22,
    },
  },
  {
    day: 75,
    autoKeys: ['analysis.coaching_feedback'],
    proposal: {
      day: 75,
      actionLabel: 'coaching feedback notifications',
      approvalCount: 12,
    },
  },
];

/** Build the state for any given simulated day */
function buildDayState(day: number): DayState {
  // Determine which actions are 'auto' at this day
  const autoKeys = new Set<string>();
  for (const milestone of MILESTONES) {
    if (day >= milestone.day) {
      for (const k of milestone.autoKeys) {
        autoKeys.add(k);
      }
    }
  }

  const actions: ActionItem[] = ALL_ACTIONS.map((a) => ({
    ...a,
    tier: autoKeys.has(a.key) ? 'auto' : a.tier,
  }));

  const autoCount = actions.filter((a) => a.tier === 'auto').length;
  const total = actions.length;
  const autonomyPct = Math.round((autoCount / total) * 100);

  // Linear interpolation for time saved: 0 hrs at day 1, 5.1 hrs at day 90
  const timeSavedHrs = Math.round(((5.1 * (day - 1)) / 89) * 10) / 10;

  // Actions automated: roughly 847 at day 90
  const actionsAutomated = Math.round((847 * (day - 1)) / 89);

  return { day, autonomyPct, timeSavedHrs, actionsAutomated, actions };
}

/** Build full chart data for days 1-90 */
function buildChartData(): ChartDataPoint[] {
  const points: ChartDataPoint[] = [];
  for (let d = 1; d <= 90; d++) {
    points.push({ day: d, autonomy: buildDayState(d).autonomyPct });
  }
  return points;
}

const CHART_DATA = buildChartData();

// ============================================================================
// Custom tooltip for chart
// ============================================================================

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: number;
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900/95 rounded-lg px-2.5 py-1.5 text-xs shadow-lg border border-gray-700/50">
      <p className="text-gray-300">
        Day {label} — <span className="text-white font-semibold">{payload[0].value}%</span>
      </p>
    </div>
  );
}

// ============================================================================
// Tier badge
// ============================================================================

function TierBadge({ tier }: { tier: ActionTier }) {
  if (tier === 'auto') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
        <Zap className="h-3 w-3" />
        AUTO
      </span>
    );
  }
  if (tier === 'approve') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
        <CheckCircle className="h-3 w-3" />
        APPROVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 border border-gray-500/20">
      SUGGEST
    </span>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function AutonomySimulator({
  className,
  showRealDataButton = true,
}: AutonomySimulatorProps) {
  const [currentDay, setCurrentDay] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dismissedProposals, setDismissedProposals] = useState<Set<number>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dayState = buildDayState(currentDay);

  // Proposal to show at this day (if not dismissed)
  const activeProposal =
    MILESTONES.find(
      (m) => m.day === currentDay && !dismissedProposals.has(m.day),
    )?.proposal ?? null;

  // Auto-play logic: advance 1 day every 200ms
  const tick = useCallback(() => {
    setCurrentDay((prev) => {
      if (prev >= 90) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, []);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(tick, 200);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, tick]);

  // Stop playing when we reach day 90
  useEffect(() => {
    if (currentDay >= 90 && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentDay, isPlaying]);

  function handlePlayPause() {
    if (currentDay >= 90) {
      setCurrentDay(1);
      setDismissedProposals(new Set());
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const day = parseInt(e.target.value, 10);
    setCurrentDay(day);
    setIsPlaying(false);
  }

  function dismissProposal(day: number) {
    setDismissedProposals((prev) => new Set(prev).add(day));
  }

  const autoActions = dayState.actions.filter((a) => a.tier === 'auto');
  const approveActions = dayState.actions.filter((a) => a.tier === 'approve');
  const suggestActions = dayState.actions.filter((a) => a.tier === 'suggest');

  const projectedState = buildDayState(90);

  return (
    <div className={cn('bg-gray-900 rounded-2xl border border-gray-700/50 overflow-hidden', className)}>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-700/50">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">
            Autonomy Progression — See How 60 Learns
          </h2>
        </div>
        <p className="text-sm text-gray-400">
          Watch how a typical sales rep's copilot evolves from cautious assistant to autonomous teammate.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Day slider + Play/Pause */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Day 1</span>
            <span className="text-white font-medium text-sm">
              Currently: Day {currentDay}
            </span>
            <span>Day 90</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayPause}
              className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-colors text-white"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>

            <input
              type="range"
              min={1}
              max={90}
              value={currentDay}
              onChange={handleSliderChange}
              className="flex-1 h-2 rounded-full appearance-none bg-gray-700 cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-indigo-500
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:border-2
                [&::-webkit-slider-thumb]:border-white
                [&::-moz-range-thumb]:w-4
                [&::-moz-range-thumb]:h-4
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-indigo-500
                [&::-moz-range-thumb]:border-2
                [&::-moz-range-thumb]:border-white"
              style={{
                background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${((currentDay - 1) / 89) * 100}%, #374151 ${((currentDay - 1) / 89) * 100}%, #374151 100%)`,
              }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-800/60 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{dayState.autonomyPct}%</p>
            <p className="text-xs text-gray-400 mt-0.5">Autonomy</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Clock className="h-4 w-4 text-sky-400" />
              <p className="text-2xl font-bold text-white">{dayState.timeSavedHrs}</p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">hrs/week saved</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Zap className="h-4 w-4 text-emerald-400" />
              <p className="text-2xl font-bold text-white">{dayState.actionsAutomated.toLocaleString()}</p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">actions automated</p>
          </div>
        </div>

        {/* Autonomy progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">Autonomy level</span>
            <span className="text-xs font-medium text-white">{dayState.autonomyPct}%</span>
          </div>
          <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
              initial={false}
              animate={{ width: `${dayState.autonomyPct}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Progression chart */}
        <div className="bg-gray-800/40 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-3">90-day autonomy curve</p>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={CHART_DATA} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="simGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(v: number) => `D${v}`}
                  ticks={[1, 15, 30, 45, 60, 75, 90]}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(v: number) => `${v}%`}
                  width={32}
                  ticks={[0, 25, 50, 75, 100]}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="autonomy"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#simGradient)"
                  dot={false}
                  activeDot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                />
                {/* Current day marker */}
                <ReferenceLine
                  x={currentDay}
                  stroke="#a5b4fc"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Action tiers */}
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {autoActions.length > 0 && (
              <motion.div
                key="auto-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4"
              >
                <p className="text-xs font-semibold text-emerald-400 mb-2">
                  Handled automatically
                </p>
                <div className="flex flex-wrap gap-2">
                  {autoActions.map((a) => (
                    <motion.span
                      key={a.key}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                    >
                      {a.label}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {approveActions.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-400 mb-2">
                Needs your approval
              </p>
              <div className="flex flex-wrap gap-2">
                {approveActions.map((a) => (
                  <span
                    key={a.key}
                    className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  >
                    {a.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {suggestActions.length > 0 && (
            <div className="bg-gray-500/5 border border-gray-500/20 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 mb-2">
                Suggestions only — more data needed
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestActions.map((a) => (
                  <span
                    key={a.key}
                    className="text-xs px-2.5 py-1 rounded-lg bg-gray-500/10 text-gray-400 border border-gray-500/20"
                  >
                    {a.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Proposal card — shown at milestone days */}
        <AnimatePresence>
          {activeProposal && (
            <motion.div
              key={`proposal-${activeProposal.day}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="relative bg-indigo-600/15 border border-indigo-500/30 rounded-xl p-4"
            >
              <button
                onClick={() => dismissProposal(activeProposal.day)}
                className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-sm text-indigo-200 pr-6">
                You've approved{' '}
                <span className="font-semibold text-white">
                  {activeProposal.approvalCount} {activeProposal.actionLabel}
                </span>{' '}
                actions with no changes — want me to handle these automatically?
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => dismissProposal(activeProposal.day)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Accept
                </button>
                <button
                  onClick={() => dismissProposal(activeProposal.day)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Not yet
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Projected end state */}
        <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
            Projected end state (Day 90)
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-bold text-white">{projectedState.autonomyPct}%</p>
              <p className="text-xs text-gray-400">Autonomy</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white">{projectedState.timeSavedHrs}</p>
              <p className="text-xs text-gray-400">hrs/week saved</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white">
                {projectedState.actionsAutomated.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400">actions automated</p>
            </div>
          </div>
        </div>

        {/* CTA buttons */}
        {showRealDataButton && (
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="/settings/autonomy"
              className="flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <TrendingUp className="h-4 w-4" />
              Use my real data
              <ChevronRight className="h-4 w-4" />
            </a>
            <a
              href="/signup"
              className="flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              Start free trial
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
