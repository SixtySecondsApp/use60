/**
 * AutonomyProgressionChart — Area chart of autonomy score over time (AP-023).
 *
 * Renders a Recharts AreaChart showing how the user's autonomy % has evolved
 * across the last N days, with data points at each promotion/demotion event.
 */

import { useMemo } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';
import { useAutopilotHistory, type AutonomyHistoryPoint } from '@/lib/hooks/useAutopilotHistory';

// ============================================================================
// Props
// ============================================================================

interface AutonomyProgressionChartProps {
  days?: number;
}

// ============================================================================
// Helpers
// ============================================================================

const ACTION_DISPLAY: Record<string, string> = {
  'crm.note_add': 'Meeting notes',
  'crm.activity_log': 'Activity logging',
  'crm.contact_enrich': 'Contact enrichment',
  'crm.next_steps_update': 'Next steps',
  'crm.deal_field_update': 'Deal field updates',
  'crm.deal_stage_change': 'Deal stage changes',
  'crm.deal_amount_change': 'Deal amount changes',
  'crm.deal_close_date_change': 'Close date changes',
  'email.draft_save': 'Email drafts',
  'email.send': 'Email sending',
  'email.follow_up_send': 'Follow-up emails',
  'email.check_in_send': 'Check-in emails',
  'task.create': 'Task creation',
  'task.assign': 'Task assignment',
  'calendar.create_event': 'Meeting scheduling',
  'calendar.reschedule': 'Meeting rescheduling',
  'analysis.risk_assessment': 'Risk assessment',
  'analysis.coaching_feedback': 'Coaching feedback',
};

const EVENT_LABELS: Record<string, string> = {
  promotion_accepted: 'Promoted to auto',
  demotion_auto: 'Auto-demoted',
  demotion_emergency: 'Emergency demotion',
  current: 'Current score',
};

function formatDateLabel(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimestamp(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function dotColorForEvent(eventType: string): string {
  switch (eventType) {
    case 'promotion_accepted':
      return '#10b981'; // emerald-500
    case 'demotion_auto':
    case 'demotion_emergency':
      return '#f59e0b'; // amber-500
    default:
      return '#6366f1'; // indigo-500
  }
}

// ============================================================================
// Custom tooltip
// ============================================================================

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as AutonomyHistoryPoint | undefined;
  if (!point) return null;

  const isCurrent = point.event_type === 'current';
  const eventLabel = EVENT_LABELS[point.event_type] ?? point.event_type;
  const actionName = point.action_type ? (ACTION_DISPLAY[point.action_type] ?? point.action_type) : null;

  return (
    <div className="bg-gray-900/95 rounded-lg px-3 py-2.5 text-xs shadow-lg border border-gray-700/50 min-w-[160px]">
      <p className="text-gray-300 font-medium mb-1.5">
        {formatTimestamp(point.timestamp)}
      </p>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-2xl font-bold text-white leading-none">
          {point.autonomy_score}%
        </span>
        <span className="text-gray-400 mt-1">autonomy</span>
      </div>
      {!isCurrent && (
        <>
          <p className="text-gray-400 mt-1.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mr-1"
              style={{ backgroundColor: dotColorForEvent(point.event_type) }}
            />
            {eventLabel}
          </p>
          {actionName && (
            <p className="text-gray-500 mt-0.5 pl-2.5">{actionName}</p>
          )}
          {point.from_tier && point.to_tier && (
            <p className="text-gray-600 mt-0.5 pl-2.5">
              {point.from_tier} → {point.to_tier}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Expand sparse history into a full date series
// ============================================================================

/**
 * Given an array of events (sparse), produce a chart-friendly array that
 * carries the score forward for every date in the window so the area chart
 * renders a continuous line.
 */
function buildChartSeries(
  points: AutonomyHistoryPoint[],
  days: number,
): AutonomyHistoryPoint[] {
  if (points.length === 0) return [];

  const todayMs = Date.now();
  const startMs = todayMs - days * 24 * 60 * 60 * 1000;

  // Build a lookup: date -> point
  const byDate = new Map<string, AutonomyHistoryPoint>();
  for (const p of points) {
    // If multiple events on the same date, keep the last one (most recent state)
    byDate.set(p.date, p);
  }

  // Collect all dates in the window
  const series: AutonomyHistoryPoint[] = [];
  let runningScore = 0;
  let runningPoint: AutonomyHistoryPoint | null = null;

  // Walk from startDate to today, one day at a time
  for (let ms = startMs; ms <= todayMs + 86400 * 1000; ms += 86400 * 1000) {
    const d = new Date(ms);
    const key = d.toISOString().slice(0, 10);

    if (byDate.has(key)) {
      runningPoint = byDate.get(key)!;
      runningScore = runningPoint.autonomy_score;
      series.push(runningPoint);
    } else if (runningPoint || series.length === 0) {
      // Fill forward with the last known score (no event label)
      series.push({
        date: key,
        timestamp: d.toISOString(),
        autonomy_score: runningScore,
        event_type: 'fill',
        action_type: '',
        from_tier: '',
        to_tier: '',
      });
    }
  }

  return series;
}

// ============================================================================
// Main component
// ============================================================================

export default function AutonomyProgressionChart({ days = 90 }: AutonomyProgressionChartProps) {
  const { data: history, isLoading } = useAutopilotHistory(days);

  const hasRealEvents = useMemo(() => {
    if (!history) return false;
    return history.some(
      (p) => p.event_type !== 'current' && p.event_type !== 'fill',
    );
  }, [history]);

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];
    return buildChartSeries(history, days);
  }, [history, days]);

  // Event-only points used for reference dots
  const eventPoints = useMemo(
    () => (history ?? []).filter((p) => p.event_type !== 'current' && p.event_type !== 'fill'),
    [history],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!hasRealEvents) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] gap-2 text-center px-4">
        <TrendingUp className="h-8 w-8 text-gray-300 dark:text-gray-700" />
        <p className="text-sm text-gray-500 dark:text-gray-500">
          No progression data yet.
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-600 max-w-xs">
          Check back after your first promotion — each time the agent earns
          autonomous trust you'll see the score climb here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="autonomyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-gray-200 dark:text-gray-700/60"
          />

          <XAxis
            dataKey="date"
            tickFormatter={formatDateLabel}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            interval="preserveStartEnd"
            minTickGap={60}
          />

          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            width={38}
            ticks={[0, 25, 50, 75, 100]}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Area — autonomy score over time */}
          <Area
            type="stepAfter"
            dataKey="autonomy_score"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#autonomyGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
            connectNulls
          />

          {/* Event dots — one per real promotion/demotion */}
          {eventPoints.map((pt) => (
            <ReferenceDot
              key={`${pt.timestamp}-${pt.action_type}`}
              x={pt.date}
              y={pt.autonomy_score}
              r={5}
              fill={dotColorForEvent(pt.event_type)}
              stroke="#fff"
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
