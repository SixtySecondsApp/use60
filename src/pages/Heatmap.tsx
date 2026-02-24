import { motion } from 'framer-motion';
import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ActivityHeatmapCell } from '@/components/ActivityHeatmapCell';
import { useUser } from '@/lib/hooks/useUser';
import { useActivities } from '@/lib/hooks/useActivities';
import { useActivityFilters } from '@/lib/hooks/useActivityFilters';
import { useNavigate } from 'react-router-dom';
import { useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
// Note: Only using the hook for month navigation state — no calendar popover on this page

function HeatmapSkeleton() {
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Render 6 week rows to cover worst-case months (e.g. Feb starting on Wed = 4 rows but Oct with 31 days starting on Sat = 6 rows)
  const WEEK_ROWS = 6;

  return (
    <div className="p-4 sm:p-6 lg:p-8 mt-12 lg:mt-0 flex flex-col">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header — icon + title/subtitle + month nav pill + legend pill */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-2xl" />
              <div>
                <Skeleton className="h-7 w-44 mb-1.5" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Month navigator pill */}
              <div className="flex items-center gap-1 bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/30 rounded-xl px-2 py-1.5 shadow-sm">
                <Skeleton className="w-7 h-7 rounded-lg" />
                <Skeleton className="h-5 w-32 mx-2" />
                <Skeleton className="w-7 h-7 rounded-lg" />
              </div>
              {/* Legend pill */}
              <Skeleton className="h-9 w-72 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Calendar grid — same structure as real: grid-cols-[30px_repeat(7,1fr)] gap-1 */}
        <div className="flex-1 bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none p-3 sm:p-4 overflow-hidden flex flex-col">
          <div className="grid grid-cols-[30px_repeat(7,1fr)] gap-1">
            {/* Header row: empty week-label cell + 7 day labels */}
            <div className="py-2" />
            {DAY_LABELS.map((day) => (
              <Skeleton key={day} className="h-5 w-full rounded" />
            ))}

            {/* Week rows */}
            {Array.from({ length: WEEK_ROWS }).map((_, w) => (
              <React.Fragment key={w}>
                {/* Week number label */}
                <Skeleton className="h-full w-5 rounded justify-self-end" />
                {/* 7 day cells — aspect-square matches the real ActivityHeatmapCell */}
                {Array.from({ length: 7 }).map((_, d) => (
                  <Skeleton key={d} className="aspect-square w-full rounded" />
                ))}
              </React.Fragment>
            ))}
          </div>

          {/* Legend row placeholder */}
          <div className="flex items-center gap-2 mt-3 p-2 bg-gray-100 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700/50">
            <Skeleton className="h-3 w-6 rounded" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="w-3 h-3 rounded" />
            ))}
            <Skeleton className="h-3 w-6 rounded" />
            <Skeleton className="h-3 w-24 rounded ml-2" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Heatmap() {
  const { userData } = useUser();
  const dateFilter = useDateRangeFilter('month');
  const { activities, isLoading: isLoadingActivities } = useActivities();

  const startDate = startOfMonth(dateFilter.currentMonth);
  const endDate = endOfMonth(dateFilter.currentMonth);

  const { setFilters } = useActivityFilters();
  const navigate = useNavigate();

  const firstDayOfMonth = getDay(startDate);
  const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });

  // Calculate empty days at the start (if month doesn't start on Monday)
  const emptyDays = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const totalDays = emptyDays + daysInMonth.length;
  const totalWeeks = Math.ceil(totalDays / 7);

  const calculateDayPoints = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayActivities = activities.filter(a =>
      format(new Date(a.date), 'yyyy-MM-dd') === dateStr
    );

    const outboundCalls = dayActivities
      .filter(a => a.type === 'outbound')
      .reduce((sum, a) => sum + (a.quantity || 1), 0);
    const meetings = dayActivities
      .filter(a => a.type === 'meeting')
      .reduce((sum, a) => sum + (a.quantity || 1), 0);
    const proposals = dayActivities
      .filter(a => a.type === 'proposal')
      .reduce((sum, a) => sum + (a.quantity || 1), 0);
    const deals = dayActivities
      .filter(a => a.type === 'sale')
      .reduce((sum, a) => sum + (a.quantity || 1), 0);

    return {
      points: outboundCalls * 1 + meetings * 5 + proposals * 10 + deals * 20,
      activities: {
        outbound: outboundCalls,
        meetings: meetings,
        proposals: proposals,
        deals: deals
      }
    };
  };

  if (isLoadingActivities || !userData) {
    return <HeatmapSkeleton />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 mt-12 lg:mt-0 flex flex-col">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 dark:bg-emerald-500/20 border border-emerald-600/20 dark:border-emerald-500/30 flex items-center justify-center">
                <Activity className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Activity Heatmap</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Track your daily sales performance</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-1 bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/30 rounded-xl px-2 py-1.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => dateFilter.navigateMonth(-1)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-700/50 transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[130px] text-center">
                  {dateFilter.dateDisplayText}
                </span>
                <button
                  type="button"
                  onClick={() => dateFilter.navigateMonth(1)}
                  disabled={dateFilter.isCurrentMonth}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm px-3 py-2.5 rounded-xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm whitespace-nowrap">
                Outbound: 1pt · Meeting: 5pts · Proposal: 10pts · Deal: 20pts
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none p-3 sm:p-4 overflow-hidden flex flex-col">
          <div className="grid grid-cols-[30px_repeat(7,1fr)] gap-1 flex-1 min-h-0">
            {/* Header row */}
            <div className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm py-2" />
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-gray-600 dark:text-gray-400 text-xs text-center py-2">{day}</div>
            ))}

            {/* Calendar grid */}
            {Array.from({ length: totalWeeks }).map((_, week) => (
              <React.Fragment key={`week-${week}`}>
                <div className="text-gray-600 dark:text-gray-400 text-xs text-right pr-2 flex items-center justify-end">
                  W{week + 1}
                </div>
                {Array.from({ length: 7 }).map((_, day) => {
                  const dayNumber = week * 7 + day - emptyDays + 1;
                  const currentDate = new Date(startDate);
                  currentDate.setDate(dayNumber);

                  if (dayNumber <= 0 || dayNumber > daysInMonth.length) {
                    return <div key={`empty-${week}-${day}`} className="aspect-square" />;
                  }

                  const { points, activities } = calculateDayPoints(currentDate);
                  return (
                    <ActivityHeatmapCell
                      key={format(currentDate, 'yyyy-MM-dd')}
                      date={currentDate}
                      points={points}
                      activities={activities}
                      onClick={() => {
                        setFilters({
                          searchQuery: '',
                          type: undefined,
                          dateRange: {
                            start: new Date(currentDate.getTime()),
                            end: new Date(currentDate.getTime() + 24 * 60 * 60 * 1000 - 1)
                          }
                        });
                        navigate('/dashboard?tab=activity');
                      }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-gray-600 dark:text-gray-400 mt-3 p-2 bg-gray-100 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700/50">
            <span>Less</span>
            <div className="w-3 h-3 rounded bg-gray-300 dark:bg-gray-800" />
            <div className="w-3 h-3 rounded bg-emerald-500 opacity-20" />
            <div className="w-3 h-3 rounded bg-emerald-500 opacity-40" />
            <div className="w-3 h-3 rounded bg-emerald-500 opacity-60" />
            <div className="w-3 h-3 rounded bg-emerald-500 opacity-80" />
            <div className="w-3 h-3 rounded bg-emerald-500" />
            <div className="w-3 h-3 rounded bg-gradient-to-r from-amber-400 to-amber-500 shadow-sm" />
            <span>More</span>
            <span className="ml-2 text-amber-500 dark:text-amber-400">★ 100+ points</span>
          </div>
        </div>
      </div>
    </div>
  );
}
