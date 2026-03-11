/**
 * SkillProgressionChart — COACH-UI-007
 *
 * Renders a multi-line Recharts LineChart showing skill dimension scores
 * over time (weekly). Each skill dimension gets its own coloured line.
 * Data comes from useSkillProgression() which returns weekly snapshots.
 */

import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { BarChart3 } from 'lucide-react';
import { useSkillProgression, type SkillProgressionEntry } from '@/lib/services/coachingDashboardService';

interface SkillProgressionChartProps {
  userId: string;
  orgId: string;
}

/** Skill dimension definitions — maps data keys to display labels and colours */
const SKILL_DIMENSIONS = [
  { key: 'overall_score', label: 'Overall', colour: '#6366f1' },           // indigo-500
  { key: 'question_quality_score', label: 'Question Quality', colour: '#3b82f6' }, // blue-500
  { key: 'objection_handling_score', label: 'Objection Handling', colour: '#8b5cf6' }, // violet-500
  { key: 'discovery_depth_score', label: 'Discovery Depth', colour: '#10b981' },  // emerald-500
  { key: 'talk_ratio', label: 'Talk Ratio', colour: '#f59e0b' },           // amber-500
  { key: 'forecast_accuracy', label: 'Forecast Accuracy', colour: '#ec4899' },   // pink-500
  { key: 'competitive_win_rate', label: 'Competitive Win Rate', colour: '#14b8a6' }, // teal-500
] as const;

type SkillKey = typeof SKILL_DIMENSIONS[number]['key'];

/** Transform raw progression entries into chart-ready data points */
function buildChartData(entries: SkillProgressionEntry[]) {
  // Sort by week ascending
  const sorted = [...entries].sort(
    (a, b) => new Date(a.week_start).getTime() - new Date(b.week_start).getTime()
  );

  return sorted.map((entry) => ({
    week: format(parseISO(entry.week_start), 'MMM d'),
    weekRaw: entry.week_start,
    meetings: entry.meetings_analysed,
    overall_score: entry.overall_score,
    question_quality_score: entry.question_quality_score,
    objection_handling_score: entry.objection_handling_score,
    discovery_depth_score: entry.discovery_depth_score,
    talk_ratio: entry.talk_ratio,
    forecast_accuracy: entry.forecast_accuracy,
    competitive_win_rate: entry.competitive_win_rate,
  }));
}

/** Determine which skill dimensions actually have data (at least one non-null value) */
function getActiveSkills(entries: SkillProgressionEntry[]): Set<SkillKey> {
  const active = new Set<SkillKey>();
  for (const entry of entries) {
    for (const dim of SKILL_DIMENSIONS) {
      if (entry[dim.key as keyof SkillProgressionEntry] != null) {
        active.add(dim.key);
      }
    }
  }
  return active;
}

/** Custom tooltip matching codebase patterns */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-[180px]">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
        Week of {label}
      </p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center justify-between gap-4 text-sm py-0.5">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
              {entry.name}
            </span>
          </div>
          <span className="font-medium text-gray-900 dark:text-white">
            {typeof entry.value === 'number' ? entry.value.toFixed(1) : '--'}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Custom legend with click-to-toggle visibility */
function ChartLegend({
  hiddenSkills,
  toggleSkill,
  activeSkills,
}: {
  hiddenSkills: Set<SkillKey>;
  toggleSkill: (key: SkillKey) => void;
  activeSkills: Set<SkillKey>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-3">
      {SKILL_DIMENSIONS.filter((d) => activeSkills.has(d.key)).map((dim) => {
        const hidden = hiddenSkills.has(dim.key);
        return (
          <button
            key={dim.key}
            onClick={() => toggleSkill(dim.key)}
            className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80"
            style={{ opacity: hidden ? 0.35 : 1 }}
          >
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: dim.colour }}
            />
            <span className="text-gray-600 dark:text-gray-400">{dim.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Loading skeleton */
function SkillProgressionSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-64 bg-gray-100 dark:bg-gray-800/50 rounded-xl animate-pulse" />
      <div className="flex justify-center gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 w-20 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function SkillProgressionChart({ userId, orgId }: SkillProgressionChartProps) {
  const { data: entries, isLoading, error } = useSkillProgression(userId, orgId);
  const [hiddenSkills, setHiddenSkills] = useState<Set<SkillKey>>(new Set());

  const chartData = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    return buildChartData(entries);
  }, [entries]);

  const activeSkills = useMemo(() => {
    if (!entries || entries.length === 0) return new Set<SkillKey>();
    return getActiveSkills(entries);
  }, [entries]);

  const toggleSkill = (key: SkillKey) => {
    setHiddenSkills((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (isLoading) {
    return <SkillProgressionSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-red-500 dark:text-red-400">
        Failed to load skill progression data
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400 gap-2">
        <BarChart3 className="h-6 w-6" />
        <p className="text-sm">No progression data yet. Scorecards will build this chart over time.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11 }}
              className="text-gray-600 dark:text-gray-400"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              className="text-gray-600 dark:text-gray-400"
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip content={<ChartTooltip />} />
            {SKILL_DIMENSIONS.filter((d) => activeSkills.has(d.key)).map((dim) => (
              <Line
                key={dim.key}
                type="monotone"
                dataKey={dim.key}
                name={dim.label}
                stroke={dim.colour}
                strokeWidth={dim.key === 'overall_score' ? 2.5 : 1.5}
                dot={{ fill: dim.colour, r: 3 }}
                activeDot={{ r: 5 }}
                hide={hiddenSkills.has(dim.key)}
                connectNulls
              />
            ))}
            {/* Hide default legend — we render our own */}
            <Legend content={() => null} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        hiddenSkills={hiddenSkills}
        toggleSkill={toggleSkill}
        activeSkills={activeSkills}
      />
    </div>
  );
}
