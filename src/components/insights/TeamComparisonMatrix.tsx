/**
 * TeamComparisonMatrix - Sortable comparison table for all team reps
 * Shows all key metrics with mini sparklines and color coding
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Users,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useTeamComparison, type TimePeriod, type RepComparisonData } from '@/lib/hooks/useTeamAnalytics';

interface TeamComparisonMatrixProps {
  period: TimePeriod;
  onRepClick?: (userId: string, userName: string) => void;
  className?: string;
}

type SortField = 'name' | 'meetings' | 'sentiment' | 'talkTime' | 'forwardMovement' | 'positiveOutcome';
type SortDirection = 'asc' | 'desc';

// Get initials from name
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Get color class based on value vs team average
function getValueColor(value: number | null, avg: number | null, invertColors = false): string {
  if (value === null || avg === null) return 'text-gray-500';
  const diff = value - avg;
  const threshold = Math.abs(avg) * 0.1; // 10% threshold

  if (invertColors) {
    if (diff > threshold) return 'text-red-600 dark:text-red-400';
    if (diff < -threshold) return 'text-emerald-600 dark:text-emerald-400';
  } else {
    if (diff > threshold) return 'text-emerald-600 dark:text-emerald-400';
    if (diff < -threshold) return 'text-red-600 dark:text-red-400';
  }
  return 'text-gray-900 dark:text-gray-100';
}

// Skeleton for loading state
export const TeamComparisonMatrixSkeleton = () => (
  <div className="bg-white dark:bg-gray-900/40 rounded-2xl border border-gray-200 dark:border-gray-700/30 overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/30">
      <div className="h-6 w-48 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
    </div>
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700/30">
            {[...Array(7)].map((_, i) => (
              <th key={i} className="px-4 py-3">
                <div className="h-4 w-20 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...Array(5)].map((_, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-800/30">
              {[...Array(7)].map((_, j) => (
                <td key={j} className="px-4 py-4">
                  <div className="h-6 w-16 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// Column header with sort indicator
function SortableHeader({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDirection: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = currentSort === field;

  return (
    <th
      onClick={() => onSort(field)}
      className={cn(
        'px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors select-none',
        className
      )}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {isActive ? (
          currentDirection === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-blue-500" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-blue-500" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-30" />
        )}
      </div>
    </th>
  );
}

// Mini sparkline for 7-day trend using Recharts
function MiniSparkline({ data }: { data: Array<{ count: number }> }) {
  if (!data || data.length < 2) return null;

  return (
    <div className="w-16 h-6">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="count"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TeamComparisonMatrix({ period, onRepClick, className }: TeamComparisonMatrixProps) {
  const { data, isLoading, error } = useTeamComparison(period);
  const [sortField, setSortField] = useState<SortField>('meetings');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Calculate team averages
  const teamAverages = useMemo(() => {
    if (!data || data.length === 0) return null;

    const withMeetings = data.filter((r) => r.totalMeetings > 0);
    if (withMeetings.length === 0) return null;

    const avgMeetings = withMeetings.reduce((sum, r) => sum + r.totalMeetings, 0) / withMeetings.length;

    const withSentiment = withMeetings.filter((r) => r.avgSentiment !== null);
    const avgSentiment = withSentiment.length > 0
      ? withSentiment.reduce((sum, r) => sum + (r.avgSentiment || 0), 0) / withSentiment.length
      : null;

    const withTalkTime = withMeetings.filter((r) => r.avgTalkTime !== null);
    const avgTalkTime = withTalkTime.length > 0
      ? withTalkTime.reduce((sum, r) => sum + (r.avgTalkTime || 0), 0) / withTalkTime.length
      : null;

    const withFM = withMeetings.filter((r) => r.forwardMovementRate !== null);
    const avgFM = withFM.length > 0
      ? withFM.reduce((sum, r) => sum + (r.forwardMovementRate || 0), 0) / withFM.length
      : null;

    const withPO = withMeetings.filter((r) => r.positiveOutcomeRate !== null);
    const avgPO = withPO.length > 0
      ? withPO.reduce((sum, r) => sum + (r.positiveOutcomeRate || 0), 0) / withPO.length
      : null;

    return { avgMeetings, avgSentiment, avgTalkTime, avgFM, avgPO };
  }, [data]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!data) return [];

    return [...data].sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortField) {
        case 'name':
          return sortDirection === 'asc'
            ? a.userName.localeCompare(b.userName)
            : b.userName.localeCompare(a.userName);
        case 'meetings':
          aVal = a.totalMeetings;
          bVal = b.totalMeetings;
          break;
        case 'sentiment':
          aVal = a.avgSentiment ?? -999;
          bVal = b.avgSentiment ?? -999;
          break;
        case 'talkTime':
          aVal = a.avgTalkTime ?? -999;
          bVal = b.avgTalkTime ?? -999;
          break;
        case 'forwardMovement':
          aVal = a.forwardMovementRate ?? -999;
          bVal = b.forwardMovementRate ?? -999;
          break;
        case 'positiveOutcome':
          aVal = a.positiveOutcomeRate ?? -999;
          bVal = b.positiveOutcomeRate ?? -999;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  if (isLoading) {
    return <TeamComparisonMatrixSkeleton />;
  }

  if (error || !data) {
    return (
      <div className={cn(
        'bg-white dark:bg-gray-900/40 rounded-2xl border border-red-200 dark:border-red-800/30 p-6',
        className
      )}>
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span>Failed to load team comparison data</span>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn(
        'bg-white dark:bg-gray-900/40 rounded-2xl border border-gray-200 dark:border-gray-700/30 p-8',
        className
      )}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-900 dark:text-gray-100 font-medium">No team data available</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Complete some meetings to see team comparisons
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className={cn(
        'bg-white dark:bg-gray-900/40 rounded-2xl border border-gray-200 dark:border-gray-700/30 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-lg dark:shadow-black/10 overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200/50 dark:border-blue-500/20">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Team Comparison</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Compare rep performance across key metrics
              </p>
            </div>
          </div>
          <Badge className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/20">
            {data.length} reps
          </Badge>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800/30">
            <tr>
              <SortableHeader
                label="Rep"
                field="name"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="min-w-[100px] sm:min-w-[140px]"
              />
              <SortableHeader
                label="Meetings"
                field="meetings"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="min-w-[70px]"
              />
              <SortableHeader
                label="Sentiment"
                field="sentiment"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="min-w-[70px]"
              />
              <SortableHeader
                label="Talk"
                field="talkTime"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="min-w-[60px]"
              />
              <SortableHeader
                label="Forward"
                field="forwardMovement"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="min-w-[70px]"
              />
              <SortableHeader
                label="Positive"
                field="positiveOutcome"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={handleSort}
                className="min-w-[70px]"
              />
              <th className="hidden sm:table-cell px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[60px]">
                Trend
              </th>
              <th className="px-3 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/30">
            {sortedData.map((rep, index) => (
              <motion.tr
                key={rep.userId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => onRepClick?.(rep.userId, rep.userName)}
                className={cn(
                  'hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors',
                  onRepClick && 'cursor-pointer'
                )}
              >
                {/* Rep - First Name Only */}
                <td className="px-3 py-3 sm:px-4 sm:py-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border border-gray-200 dark:border-gray-700 flex-shrink-0">
                      <AvatarImage src={rep.avatarUrl || undefined} alt={rep.userName} />
                      <AvatarFallback className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        {getInitials(rep.userName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate text-sm">
                        {rep.userName.split(' ')[0]}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Meetings */}
                <td className="px-3 py-3 sm:px-4 sm:py-4">
                  <span
                    className={cn(
                      'font-medium text-sm',
                      getValueColor(rep.totalMeetings, teamAverages?.avgMeetings ?? null)
                    )}
                  >
                    {rep.totalMeetings}
                  </span>
                </td>

                {/* Sentiment */}
                <td className="px-3 py-3 sm:px-4 sm:py-4">
                  <span
                    className={cn(
                      'font-medium text-sm',
                      getValueColor(rep.avgSentiment, teamAverages?.avgSentiment ?? null)
                    )}
                  >
                    {rep.avgSentiment !== null
                      ? (rep.avgSentiment > 0 ? '+' : '') + rep.avgSentiment.toFixed(2)
                      : '—'}
                  </span>
                </td>

                {/* Talk Time */}
                <td className="px-3 py-3 sm:px-4 sm:py-4">
                  <span
                    className={cn(
                      'font-medium text-sm',
                      // Talk time: ideal is 45-55%, so we use special coloring
                      rep.avgTalkTime !== null
                        ? rep.avgTalkTime >= 45 && rep.avgTalkTime <= 55
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : rep.avgTalkTime < 40 || rep.avgTalkTime > 60
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-600 dark:text-amber-400'
                        : 'text-gray-500'
                    )}
                  >
                    {rep.avgTalkTime !== null ? `${rep.avgTalkTime.toFixed(1)}%` : '—'}
                  </span>
                </td>

                {/* Forward Movement */}
                <td className="px-3 py-3 sm:px-4 sm:py-4">
                  <span
                    className={cn(
                      'font-medium text-sm',
                      getValueColor(rep.forwardMovementRate, teamAverages?.avgFM ?? null)
                    )}
                  >
                    {rep.forwardMovementRate !== null
                      ? `${rep.forwardMovementRate.toFixed(1)}%`
                      : '—'}
                  </span>
                </td>

                {/* Positive Outcome */}
                <td className="px-3 py-3 sm:px-4 sm:py-4">
                  <span
                    className={cn(
                      'font-medium text-sm',
                      getValueColor(rep.positiveOutcomeRate, teamAverages?.avgPO ?? null)
                    )}
                  >
                    {rep.positiveOutcomeRate !== null
                      ? `${rep.positiveOutcomeRate.toFixed(1)}%`
                      : '—'}
                  </span>
                </td>

                {/* Mini Sparkline - Hidden on Mobile */}
                <td className="hidden sm:table-cell px-3 py-3 sm:px-4 sm:py-4">
                  <MiniSparkline data={rep.trendData} />
                </td>

                {/* Action */}
                <td className="px-3 py-3 sm:px-4 sm:py-4 text-center">
                  {onRepClick && (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Team Average Footer */}
      {teamAverages && (
        <div className="px-3 sm:px-5 py-2 sm:py-3 border-t border-gray-200 dark:border-gray-700/30 bg-gray-50 dark:bg-gray-800/30">
          <div className="flex items-center gap-2 sm:gap-4 text-xs overflow-x-auto">
            <span className="font-medium text-gray-600 dark:text-gray-400 flex-shrink-0">Avg:</span>
            <span className="text-gray-700 dark:text-gray-300 flex-shrink-0">
              {teamAverages.avgMeetings.toFixed(1)} meet
            </span>
            {teamAverages.avgSentiment !== null && (
              <span className="text-gray-700 dark:text-gray-300 flex-shrink-0">
                {teamAverages.avgSentiment > 0 ? '+' : ''}
                {teamAverages.avgSentiment.toFixed(2)} sent
              </span>
            )}
            {teamAverages.avgTalkTime !== null && (
              <span className="text-gray-700 dark:text-gray-300">
                {teamAverages.avgTalkTime.toFixed(1)}% talk time
              </span>
            )}
            {teamAverages.avgFM !== null && (
              <span className="text-gray-700 dark:text-gray-300">
                {teamAverages.avgFM.toFixed(1)}% forward
              </span>
            )}
            {teamAverages.avgPO !== null && (
              <span className="text-gray-700 dark:text-gray-300">
                {teamAverages.avgPO.toFixed(1)}% positive
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
