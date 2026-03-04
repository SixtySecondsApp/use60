/**
 * SkillProgressionChart — COACH-UI-003
 *
 * Line chart of skill scores over weeks from coaching_skill_progression table.
 * Skills: talk_ratio, question_quality, objection_handling, discovery_depth
 * Toggle per-skill visibility.
 */

import React, { useState } from 'react';
import { Loader2, BarChart2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useSkillProgression, type SkillProgressionRow } from '@/lib/services/coachingDashboardService';

const SKILLS = [
  { key: 'talk_ratio_score',         label: 'Talk Ratio',          colour: '#6366f1' },
  { key: 'question_quality_score',   label: 'Question Quality',    colour: '#10b981' },
  { key: 'objection_handling_score', label: 'Objection Handling',  colour: '#f59e0b' },
  { key: 'discovery_depth_score',    label: 'Discovery Depth',     colour: '#ec4899' },
] as const;

type SkillKey = typeof SKILLS[number]['key'];

function formatWeek(weekStart: string): string {
  const d = new Date(weekStart);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toChartData(rows: SkillProgressionRow[]) {
  return rows.map((row) => ({
    week: formatWeek(row.week_start),
    talk_ratio_score: row.talk_ratio_score ?? undefined,
    question_quality_score: row.question_quality_score ?? undefined,
    objection_handling_score: row.objection_handling_score ?? undefined,
    discovery_depth_score: row.discovery_depth_score ?? undefined,
  }));
}

interface SkillProgressionChartProps {
  userId: string;
  orgId: string;
  className?: string;
}

export function SkillProgressionChart({ userId, orgId, className }: SkillProgressionChartProps) {
  const { data: rows, isLoading, error } = useSkillProgression(userId, orgId);
  const [hidden, setHidden] = useState<Set<SkillKey>>(new Set());

  const toggleSkill = (key: SkillKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-48', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error || !rows || rows.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-48 text-gray-600 gap-2', className)}>
        <BarChart2 className="h-6 w-6" />
        <p className="text-sm">No skill progression data yet</p>
      </div>
    );
  }

  const chartData = toChartData(rows);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Skill toggles */}
      <div className="flex flex-wrap gap-2">
        {SKILLS.map((skill) => {
          const active = !hidden.has(skill.key);
          return (
            <button
              key={skill.key}
              onClick={() => toggleSkill(skill.key)}
              className={cn(
                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all',
                active
                  ? 'border-transparent text-white'
                  : 'border-gray-700 text-gray-500 bg-transparent'
              )}
              style={active ? { backgroundColor: skill.colour + '33', borderColor: skill.colour + '66', color: skill.colour } : {}}
            >
              <span
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: active ? skill.colour : '#4b5563' }}
              />
              {skill.label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #1f2937',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#9ca3af' }}
            />
            {SKILLS.map((skill) =>
              hidden.has(skill.key) ? null : (
                <Line
                  key={skill.key}
                  type="monotone"
                  dataKey={skill.key}
                  name={skill.label}
                  stroke={skill.colour}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              )
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
