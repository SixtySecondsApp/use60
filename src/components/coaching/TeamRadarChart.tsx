/**
 * TeamRadarChart — COACH-UI-008
 *
 * Renders a Recharts RadarChart comparing an individual rep's latest
 * skill scores against the team average across all skill dimensions.
 * Data comes from useSkillProgression (rep) and a direct query for
 * org-wide averages from coaching_skill_progression.
 */

import React, { useMemo } from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import {
  useSkillProgression,
  type SkillProgressionEntry,
} from '@/lib/services/coachingDashboardService';

interface TeamRadarChartProps {
  userId: string;
  orgId: string;
}

/** Skill dimensions displayed on the radar — same keys as SkillProgressionChart */
const RADAR_DIMENSIONS = [
  { key: 'overall_score', label: 'Overall' },
  { key: 'question_quality_score', label: 'Questions' },
  { key: 'objection_handling_score', label: 'Objections' },
  { key: 'discovery_depth_score', label: 'Discovery' },
  { key: 'talk_ratio', label: 'Talk Ratio' },
  { key: 'forecast_accuracy', label: 'Forecast' },
  { key: 'competitive_win_rate', label: 'Win Rate' },
] as const;

type DimensionKey = (typeof RADAR_DIMENSIONS)[number]['key'];

/** Fetch the latest skill progression rows for all users in the org (most recent week per user) */
function useTeamSkillAverages(orgId: string) {
  return useQuery<Record<DimensionKey, number | null>>({
    queryKey: ['team-skill-averages', orgId],
    queryFn: async () => {
      // Get the most recent row per user in the org using a window function
      // Since we can't use window functions via the Supabase client directly,
      // query the last 8 weeks and take the latest per-user in JS.
      const { data, error } = await supabase
        .from('coaching_skill_progression')
        .select(
          'user_id, week_start, overall_score, question_quality_score, objection_handling_score, discovery_depth_score, talk_ratio, forecast_accuracy, competitive_win_rate'
        )
        .eq('org_id', orgId)
        .order('week_start', { ascending: false })
        .limit(200);

      if (error) throw error;
      if (!data || data.length === 0) return null as any;

      // Keep only the latest row per user
      const latestByUser = new Map<string, (typeof data)[number]>();
      for (const row of data) {
        if (!latestByUser.has(row.user_id)) {
          latestByUser.set(row.user_id, row);
        }
      }

      const rows = Array.from(latestByUser.values());

      // Average each dimension across all team members
      const averages = {} as Record<DimensionKey, number | null>;
      for (const dim of RADAR_DIMENSIONS) {
        const values = rows
          .map((r) => r[dim.key as keyof typeof r] as number | null)
          .filter((v): v is number => v != null);
        averages[dim.key] = values.length > 0
          ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
          : null;
      }

      return averages;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Extract the latest week's scores for a single rep */
function getLatestRepScores(
  entries: SkillProgressionEntry[] | undefined
): Record<DimensionKey, number | null> {
  const scores = {} as Record<DimensionKey, number | null>;
  for (const dim of RADAR_DIMENSIONS) {
    scores[dim.key] = null;
  }

  if (!entries || entries.length === 0) return scores;

  // entries are ordered by week_start DESC from the RPC
  const latest = entries[0];
  for (const dim of RADAR_DIMENSIONS) {
    scores[dim.key] = (latest[dim.key as keyof SkillProgressionEntry] as number | null) ?? null;
  }

  return scores;
}

/** Build the radar data array from rep scores and team averages */
function buildRadarData(
  repScores: Record<DimensionKey, number | null>,
  teamAverages: Record<DimensionKey, number | null> | null
) {
  return RADAR_DIMENSIONS
    .filter((dim) => {
      // Only include dimensions where at least one value exists
      const repVal = repScores[dim.key];
      const teamVal = teamAverages?.[dim.key] ?? null;
      return repVal != null || teamVal != null;
    })
    .map((dim) => ({
      dimension: dim.label,
      rep: repScores[dim.key] ?? 0,
      team: teamAverages?.[dim.key] ?? 0,
    }));
}

/** Custom tooltip for the radar chart */
function RadarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-[160px]">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center justify-between gap-4 text-sm py-0.5">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-700 dark:text-gray-300">
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

/** Loading skeleton matching codebase pattern */
function RadarSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-72 bg-gray-100 dark:bg-gray-800/50 rounded-xl animate-pulse" />
      <div className="flex justify-center gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-4 w-24 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function TeamRadarChart({ userId, orgId }: TeamRadarChartProps) {
  const { data: repEntries, isLoading: repLoading } = useSkillProgression(userId, orgId);
  const { data: teamAverages, isLoading: teamLoading } = useTeamSkillAverages(orgId);

  const isLoading = repLoading || teamLoading;

  const repScores = useMemo(() => getLatestRepScores(repEntries), [repEntries]);

  const radarData = useMemo(
    () => buildRadarData(repScores, teamAverages ?? null),
    [repScores, teamAverages]
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-400" />
          Peer Benchmarks
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Your scores vs team average (anonymized)
        </p>
        <RadarSkeleton />
      </div>
    );
  }

  if (radarData.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-400" />
          Peer Benchmarks
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Your scores vs team average (anonymized)
        </p>
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400 gap-2">
          <Users className="h-6 w-6" />
          <p className="text-sm">No skill data yet. Scorecards will build this chart over time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-5">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
        <Users className="h-4 w-4 text-indigo-400" />
        Peer Benchmarks
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Your scores vs team average (anonymized)
      </p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid
              className="stroke-gray-200 dark:stroke-gray-700"
            />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickCount={5}
            />
            <Tooltip content={<RadarTooltip />} />
            {/* Team Average — rendered first (behind) */}
            <Radar
              name="Team Average"
              dataKey="team"
              stroke="#94a3b8"
              fill="#94a3b8"
              fillOpacity={0.15}
              strokeWidth={1.5}
              dot={{ r: 3, fill: '#94a3b8' }}
            />
            {/* Individual Rep — rendered second (in front) */}
            <Radar
              name="You"
              dataKey="rep"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.25}
              strokeWidth={2}
              dot={{ r: 3, fill: '#6366f1' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value: string) => (
                <span className="text-gray-600 dark:text-gray-400 text-xs">{value}</span>
              )}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
