/**
 * RelationshipPulseGraph — Sparkline showing relationship strength over time (NL-002b)
 *
 * Renders a compact Recharts AreaChart with gradient fill:
 *   green (>=0.7), amber (0.4-0.7), red (<0.4)
 * Dashed reference line at 0.4 (decay alert threshold).
 * Custom tooltip shows date, strength %, and event label.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { Calendar, TrendingDown, Mail, ArrowDownRight } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface StrengthHistoryPoint {
  strength: number;
  date: string;
  event?: string;
}

interface RelationshipPulseGraphProps {
  strengthHistory: StrengthHistoryPoint[];
  currentStrength: number;
}

// ============================================================================
// Helpers
// ============================================================================

/** Map data for recharts — ensures 0-1 range */
function toChartData(history: StrengthHistoryPoint[]) {
  return history.map((pt) => ({
    date: pt.date,
    strength: Math.max(0, Math.min(1, pt.strength)),
    event: pt.event,
  }));
}

/**
 * Build a linearGradient stop list based on the min/max of the data range.
 * Gradient maps strength values to colors:
 *   >= 0.7 green, 0.4-0.7 amber, < 0.4 red
 */
function gradientStops(data: { strength: number }[]) {
  const min = Math.min(...data.map((d) => d.strength));
  const max = Math.max(...data.map((d) => d.strength));
  const range = max - min || 0.01;

  // Normalize a strength value to 0-1 within the data range (inverted for SVG gradient: 0=top, 1=bottom)
  const norm = (v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    return 1 - (clamped - min) / range;
  };

  const stops: { offset: string; color: string }[] = [];

  // Always add top (highest strength) and bottom (lowest strength)
  if (max >= 0.7) {
    stops.push({ offset: '0%', color: '#10b981' }); // emerald-500
  } else if (max >= 0.4) {
    stops.push({ offset: '0%', color: '#f59e0b' }); // amber-500
  } else {
    stops.push({ offset: '0%', color: '#ef4444' }); // red-500
  }

  // Add transition points if they fall within the data range
  if (max > 0.7 && min < 0.7) {
    const pct = `${Math.round(norm(0.7) * 100)}%`;
    stops.push({ offset: pct, color: '#10b981' });
    stops.push({ offset: pct, color: '#f59e0b' });
  }

  if (max > 0.4 && min < 0.4) {
    const pct = `${Math.round(norm(0.4) * 100)}%`;
    stops.push({ offset: pct, color: '#f59e0b' });
    stops.push({ offset: pct, color: '#ef4444' });
  }

  if (min < 0.4) {
    stops.push({ offset: '100%', color: '#ef4444' });
  } else if (min < 0.7) {
    stops.push({ offset: '100%', color: '#f59e0b' });
  } else {
    stops.push({ offset: '100%', color: '#10b981' });
  }

  return stops;
}

/** Icon for event type */
function eventIcon(event?: string) {
  switch (event) {
    case 'meeting':
      return <Calendar className="h-3 w-3 text-slate-500 dark:text-gray-400" />;
    case 'email':
      return <Mail className="h-3 w-3 text-slate-500 dark:text-gray-400" />;
    case 'decay':
      return <TrendingDown className="h-3 w-3 text-red-500" />;
    default:
      return <ArrowDownRight className="h-3 w-3 text-slate-400 dark:text-gray-500" />;
  }
}

// ============================================================================
// Custom Tooltip
// ============================================================================

function PulseTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { date: string; strength: number; event?: string } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;

  let dateLabel: string;
  try {
    dateLabel = format(new Date(pt.date), 'MMM d, yyyy');
  } catch {
    dateLabel = pt.date;
  }

  const pct = Math.round(pt.strength * 100);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 mb-1 text-slate-500 dark:text-gray-400">
        {dateLabel}
      </div>
      <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-gray-100 tabular-nums">
        {pct}%
      </div>
      {pt.event && (
        <div className="flex items-center gap-1 mt-1 text-slate-500 dark:text-gray-400 capitalize">
          {eventIcon(pt.event)}
          {pt.event}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyPulse({ currentStrength }: { currentStrength: number }) {
  const pct = Math.round(currentStrength * 100);
  return (
    <div className="h-[120px] w-full flex flex-col items-center justify-center">
      <div className="w-full h-px bg-slate-200 dark:bg-gray-700 relative">
        <div
          className="absolute w-2 h-2 rounded-full bg-slate-400 dark:bg-gray-500 -translate-y-1/2"
          style={{ left: '50%', transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-3">
        Not enough history yet ({pct}%)
      </p>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function RelationshipPulseGraph({
  strengthHistory,
  currentStrength,
}: RelationshipPulseGraphProps) {
  // Need at least 2 points for a meaningful sparkline
  if (!strengthHistory || strengthHistory.length < 2) {
    return <EmptyPulse currentStrength={currentStrength} />;
  }

  const chartData = toChartData(strengthHistory);
  const stops = gradientStops(chartData);

  return (
    <div className="w-full" style={{ height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
        >
          <defs>
            <linearGradient id="pulseGradient" x1="0" y1="0" x2="0" y2="1">
              {stops.map((stop, i) => (
                <stop
                  key={i}
                  offset={stop.offset}
                  stopColor={stop.color}
                  stopOpacity={0.3}
                />
              ))}
            </linearGradient>
            <linearGradient id="pulseStroke" x1="0" y1="0" x2="0" y2="1">
              {stops.map((stop, i) => (
                <stop
                  key={i}
                  offset={stop.offset}
                  stopColor={stop.color}
                  stopOpacity={1}
                />
              ))}
            </linearGradient>
          </defs>

          <XAxis dataKey="date" hide />
          <YAxis domain={[0, 1]} hide />

          <ReferenceLine
            y={0.4}
            stroke="#ef4444"
            strokeDasharray="4 3"
            strokeWidth={1}
            strokeOpacity={0.5}
          />

          <Tooltip
            content={<PulseTooltip />}
            cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
          />

          <Area
            type="monotone"
            dataKey="strength"
            stroke="url(#pulseStroke)"
            strokeWidth={2}
            fill="url(#pulseGradient)"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
