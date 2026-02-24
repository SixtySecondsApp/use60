/**
 * SkillCoverageChart Component
 *
 * Visual analytics showing skill coverage across query categories.
 * Displays coverage percentage, category breakdown, and trend indicators.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CoverageStats, CategoryStats } from '@/lib/hooks/useQueryAnalytics';

interface SkillCoverageChartProps {
  stats: CoverageStats | undefined;
  isLoading?: boolean;
  compact?: boolean;
  className?: string;
}

// Category display names and colors
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  'meeting-prep': { label: 'Meeting Prep', color: 'bg-blue-500' },
  'meeting-followup': { label: 'Meeting Follow-up', color: 'bg-indigo-500' },
  'deal-analysis': { label: 'Deal Analysis', color: 'bg-purple-500' },
  'deal-rescue': { label: 'Deal Rescue', color: 'bg-red-500' },
  'pipeline-health': { label: 'Pipeline Health', color: 'bg-green-500' },
  'contact-research': { label: 'Contact Research', color: 'bg-cyan-500' },
  'email-draft': { label: 'Email Draft', color: 'bg-amber-500' },
  'follow-up': { label: 'Follow-up', color: 'bg-orange-500' },
  'task-management': { label: 'Task Management', color: 'bg-teal-500' },
  'reporting': { label: 'Reporting', color: 'bg-pink-500' },
  'forecasting': { label: 'Forecasting', color: 'bg-violet-500' },
  'relationship-health': { label: 'Relationships', color: 'bg-rose-500' },
  'competitive-intel': { label: 'Competitive Intel', color: 'bg-slate-500' },
  'other': { label: 'Other', color: 'bg-gray-500' },
};

function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] || { label: category, color: 'bg-gray-500' };
}

export function SkillCoverageChart({
  stats,
  isLoading,
  compact = false,
  className,
}: SkillCoverageChartProps) {
  const coverageLevel = useMemo(() => {
    if (!stats) return 'unknown';
    const pct = stats.coverage_percentage;
    if (pct >= 80) return 'excellent';
    if (pct >= 60) return 'good';
    if (pct >= 40) return 'moderate';
    return 'low';
  }, [stats]);

  const coverageColor = {
    excellent: 'text-green-600 dark:text-green-400',
    good: 'text-blue-600 dark:text-blue-400',
    moderate: 'text-amber-600 dark:text-amber-400',
    low: 'text-red-600 dark:text-red-400',
    unknown: 'text-gray-500',
  }[coverageLevel];

  const progressColor = {
    excellent: 'bg-green-500',
    good: 'bg-blue-500',
    moderate: 'bg-amber-500',
    low: 'bg-red-500',
    unknown: 'bg-gray-400',
  }[coverageLevel];

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="h-6 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
        <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse w-3/4" />
        <div className="h-20 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={cn('text-center py-8 text-gray-500', className)}>
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No analytics data available</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Main Coverage Display */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={cn('text-3xl font-bold', coverageColor)}>
              {stats.coverage_percentage?.toFixed(0) || 0}%
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">Coverage</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {stats.covered_intents || 0} of {stats.total_intents || 0} intents covered by skills
          </p>
        </div>
        {!compact && (
          <div className="text-right">
            <div className="flex items-center gap-1 text-sm">
              {stats.coverage_percentage >= 60 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : stats.coverage_percentage >= 40 ? (
                <Minus className="w-4 h-4 text-amber-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className="text-gray-600 dark:text-gray-400">
                {stats.total_queries?.toLocaleString() || 0} queries
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className={cn('absolute inset-y-0 left-0 rounded-full', progressColor)}
          initial={{ width: 0 }}
          animate={{ width: `${stats.coverage_percentage || 0}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          <div>
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              {stats.covered_queries?.toLocaleString() || 0}
            </p>
            <p className="text-xs text-green-600/70 dark:text-green-400/70">Covered queries</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              {stats.uncovered_queries?.toLocaleString() || 0}
            </p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70">Uncovered queries</p>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      {!compact && stats.categories && stats.categories.length > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            By Category
          </h4>
          <div className="space-y-2">
            {stats.categories.slice(0, 5).map((cat: CategoryStats) => {
              const config = getCategoryConfig(cat.category);
              const categoryPct =
                cat.total_intents > 0
                  ? ((cat.covered_intents / cat.total_intents) * 100).toFixed(0)
                  : '0';

              return (
                <div key={cat.category} className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full', config.color)} />
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">
                    {config.label}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {cat.covered_intents}/{cat.total_intents}
                  </span>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-10 text-right">
                    {categoryPct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default SkillCoverageChart;
