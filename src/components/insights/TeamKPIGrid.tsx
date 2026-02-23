/**
 * TeamKPIGrid - Enhanced KPI cards with period comparison for Team Analytics
 * Shows 8 key metrics with trend indicators and click-to-drill-down
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Smile,
  Clock,
  Star,
  TrendingUp,
  Target,
  AlertCircle,
  Users,
  TrendingDown,
  Minus,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamAggregates, type TimePeriod, type DrillDownMetricType } from '@/lib/hooks/useTeamAnalytics';

interface TeamKPIGridProps {
  period: TimePeriod;
  dateRange?: { start: Date; end: Date };
  onCardClick?: (metricType: DrillDownMetricType) => void;
  className?: string;
}

interface KPICardData {
  title: string;
  value: string | number;
  subtitle?: string;
  trendPct: number | null;
  icon: React.ElementType;
  color: 'blue' | 'emerald' | 'purple' | 'amber' | 'cyan' | 'green' | 'orange' | 'slate';
  metricType: DrillDownMetricType;
  invertTrend?: boolean; // For metrics where lower is better
  clickable?: boolean; // defaults to true
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    border: 'border-blue-200 dark:border-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    accent: 'text-blue-600 dark:text-blue-400',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    border: 'border-emerald-200 dark:border-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    accent: 'text-emerald-600 dark:text-emerald-400',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    border: 'border-purple-200 dark:border-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
    accent: 'text-purple-600 dark:text-purple-400',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
    accent: 'text-amber-600 dark:text-amber-400',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-900/30',
    border: 'border-cyan-200 dark:border-cyan-500/20',
    text: 'text-cyan-600 dark:text-cyan-400',
    accent: 'text-cyan-600 dark:text-cyan-400',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/30',
    border: 'border-green-200 dark:border-green-500/20',
    text: 'text-green-600 dark:text-green-400',
    accent: 'text-green-600 dark:text-green-400',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/30',
    border: 'border-orange-200 dark:border-orange-500/20',
    text: 'text-orange-600 dark:text-orange-400',
    accent: 'text-orange-600 dark:text-orange-400',
  },
  slate: {
    bg: 'bg-slate-50 dark:bg-slate-900/30',
    border: 'border-slate-200 dark:border-slate-500/20',
    text: 'text-slate-600 dark:text-slate-400',
    accent: 'text-slate-600 dark:text-slate-400',
  },
} as const;

const periodLabels: Record<TimePeriod, string> = {
  7: 'vs prev 7d',
  30: 'vs prev 30d',
  90: 'vs prev 90d',
};

// Skeleton for loading state
export const TeamKPIGridSkeleton = () => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {[...Array(8)].map((_, i) => (
      <div
        key={i}
        className="bg-white dark:bg-gray-900/40 rounded-2xl border border-gray-200 dark:border-gray-700/30 p-5"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800/50 animate-pulse" />
          <div className="flex flex-col items-end gap-1">
            <div className="h-6 w-16 bg-gray-100 dark:bg-gray-800/50 rounded-full animate-pulse" />
            <div className="h-4 w-20 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
          <div className="h-8 w-16 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

// Individual KPI Card
function KPICard({
  data,
  periodLabel,
  onClick,
  index,
}: {
  data: KPICardData;
  periodLabel: string;
  onClick?: () => void;
  index: number;
}) {
  const colors = colorClasses[data.color];
  const { title, value, subtitle, trendPct, icon: Icon, invertTrend } = data;

  const getTrendIcon = () => {
    if (trendPct === null || trendPct === 0) return Minus;
    return trendPct > 0 ? TrendingUp : TrendingDown;
  };

  const getTrendColor = () => {
    if (trendPct === null || trendPct === 0) return 'text-gray-500';
    const isPositive = trendPct > 0;
    if (invertTrend) {
      return isPositive ? 'text-red-500' : 'text-emerald-500';
    }
    return isPositive ? 'text-emerald-500' : 'text-red-500';
  };

  const formatTrendText = () => {
    if (trendPct === null) return 'N/A';
    if (trendPct === 0) return '0%';
    const prefix = trendPct > 0 ? '+' : '';
    return `${prefix}${trendPct.toFixed(1)}%`;
  };

  const TrendIcon = getTrendIcon();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={cn(
        'group bg-white dark:bg-gray-900/40 rounded-2xl border transition-all duration-300',
        colors.border,
        'shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-lg dark:shadow-black/10',
        'hover:shadow-[0_8px_12px_-3px_rgba(0,0,0,0.08)] dark:hover:shadow-black/20',
        onClick && 'cursor-pointer'
      )}
    >
      <div className="p-5">
        {/* Header with Icon and Trend */}
        <div className="flex items-start justify-between mb-4">
          <div
            className={cn(
              'p-3 rounded-xl border transition-transform duration-300 group-hover:scale-110',
              colors.bg,
              colors.border
            )}
          >
            <Icon className={cn('w-6 h-6', colors.text)} />
          </div>

          {/* Trend Indicator */}
          <div className="flex flex-col items-end">
            <div
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                getTrendColor(),
                'bg-gray-100 dark:bg-gray-800/50'
              )}
            >
              <TrendIcon className="w-3 h-3" />
              {formatTrendText()}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-500">
              <Calendar className="w-3 h-3" />
              {periodLabel}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {title}
          </h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-600 dark:text-gray-500">{subtitle}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function TeamKPIGrid({ period, dateRange, onCardClick, className }: TeamKPIGridProps) {
  const { data, isLoading, error } = useTeamAggregates(period, dateRange);

  // Compute the comparison period label based on dateRange or period
  const periodLabel = useMemo(() => {
    if (dateRange) {
      const days = Math.round((dateRange.end.getTime() - dateRange.start.getTime()) / 86400000);
      if (days >= 28 && days <= 31) return 'vs prev month';
      return `vs prev ${days}d`;
    }
    return periodLabels[period];
  }, [dateRange, period]);

  if (isLoading) {
    return <TeamKPIGridSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-700 dark:text-red-400">Failed to load team metrics</p>
      </div>
    );
  }

  const { current, changes } = data;

  // Build KPI card data
  // Note: Uses totalMeetings as denominator for percentage subtitles (includes unclassified meetings).
  // This shows the rate across all meetings, not just classified ones.
  // TODO: If a classifiedMeetings count becomes available from the RPC, use it as denominator instead.
  const kpiCards: KPICardData[] = [
    {
      title: 'Total Meetings',
      value: current.totalMeetings,
      subtitle: `${current.teamMembers} team members`,
      trendPct: changes.meetingsChangePct,
      icon: BarChart3,
      color: 'blue',
      metricType: 'all',
    },
    {
      title: 'Avg Sentiment',
      value: current.avgSentiment !== null ? (current.avgSentiment * 10 > 0 ? '+' : '') + (current.avgSentiment * 10).toFixed(1) : 'N/A',
      subtitle: current.avgSentiment !== null ? `${current.positiveCount} positive calls (scale: -10 to +10)` : `${current.positiveCount} positive calls`,
      trendPct: changes.sentimentChangePct,
      icon: Smile,
      color: 'emerald',
      metricType: 'sentiment_extremes',
    },
    {
      title: 'Avg Talk Time',
      value: current.avgTalkTime !== null ? `${current.avgTalkTime.toFixed(1)}%` : 'N/A',
      subtitle: 'Ideal: 45-55%',
      trendPct: changes.talkTimeChangePct,
      icon: Clock,
      color: 'purple',
      metricType: 'talk_time_extremes',
    },
    {
      title: 'Coach Rating',
      value: current.avgCoachRating !== null ? Math.min(current.avgCoachRating, 10).toFixed(1) : 'N/A',
      subtitle: 'Out of 10',
      trendPct: changes.coachRatingChangePct,
      icon: Star,
      color: 'amber',
      metricType: 'coach_rating_summary',
    },
    {
      title: 'Forward Movement',
      value: current.forwardMovementCount,
      subtitle: current.totalMeetings > 0
        ? `${((current.forwardMovementCount / current.totalMeetings) * 100).toFixed(0)}% of meetings`
        : 'No meetings',
      trendPct: changes.forwardMovementChangePct,
      icon: TrendingUp,
      color: 'cyan',
      metricType: 'forward_movement',
    },
    {
      title: 'Positive Outcomes',
      value: current.positiveOutcomeCount,
      subtitle: current.totalMeetings > 0
        ? `${((current.positiveOutcomeCount / current.totalMeetings) * 100).toFixed(0)}% success rate`
        : 'No meetings',
      trendPct: changes.positiveOutcomeChangePct,
      icon: Target,
      color: 'green',
      metricType: 'positive_outcome',
    },
    {
      title: 'Objections Handled',
      value: current.objectionCount,
      subtitle: current.totalMeetings > 0
        ? `${((current.objectionCount / current.totalMeetings) * 100).toFixed(0)}% of meetings`
        : 'No meetings',
      trendPct: null, // We don't have change data for objections yet
      icon: AlertCircle,
      color: 'orange',
      metricType: 'objection_details',
    },
    {
      title: 'Team Members',
      value: current.teamMembers,
      subtitle: `${current.totalMeetings > 0 && current.teamMembers > 0
        ? Math.round(current.totalMeetings / current.teamMembers)
        : 0} avg meetings/rep`,
      trendPct: null, // Team count doesn't have trend
      icon: Users,
      color: 'slate',
      metricType: 'all',
      clickable: false,
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {kpiCards.map((card, index) => (
        <KPICard
          key={card.title}
          data={card}
          periodLabel={periodLabel}
          onClick={onCardClick && card.clickable !== false ? () => onCardClick(card.metricType) : undefined}
          index={index}
        />
      ))}
    </div>
  );
}
