import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LayoutDashboard, FileText, Wand2, ClipboardList, Search, Database, RefreshCw, Loader2, AlertCircle, Calendar, ChevronLeft, ChevronRight, ChevronDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useMeetingIntelligence } from '@/lib/hooks/useMeetingIntelligence';
import {
  format, startOfDay, endOfDay, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, addMonths, subMonths, isSameDay,
  isAfter, isBefore, isWithinInterval, isToday,
} from 'date-fns';
import type { TimePeriod } from '@/lib/hooks/useTeamAnalytics';

import { SearchHero } from '@/components/meeting-analytics/SearchHero';
import { DashboardTab } from '@/components/meeting-analytics/DashboardTab';
import { TranscriptsTab } from '@/components/meeting-analytics/TranscriptsTab';
import { InsightsTab } from '@/components/meeting-analytics/InsightsTab';
import { ReportsTab } from '@/components/meeting-analytics/ReportsTab';
import { TranscriptDetailSheet } from '@/components/meeting-analytics/TranscriptDetailSheet';

type DatePreset = '7d' | '30d' | '90d' | 'custom';

// ============================================================================
// Inline Calendar Range Picker (heatmap-inspired)
// ============================================================================

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface CalendarRangePickerProps {
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onSelect: (date: Date) => void;
}

function CalendarRangePicker({ rangeStart, rangeEnd, onSelect }: CalendarRangePickerProps) {
  const [viewMonth, setViewMonth] = useState(rangeEnd ?? rangeStart ?? new Date());

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDayOfWeek = getDay(monthStart);
  const emptyDays = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const isInRange = (date: Date) => {
    if (!rangeStart || !rangeEnd) return false;
    const s = isBefore(rangeStart, rangeEnd) ? rangeStart : rangeEnd;
    const e = isAfter(rangeStart, rangeEnd) ? rangeStart : rangeEnd;
    return isWithinInterval(date, { start: startOfDay(s), end: endOfDay(e) });
  };

  const isStart = (date: Date) => rangeStart && isSameDay(date, rangeStart);
  const isEnd = (date: Date) => rangeEnd && isSameDay(date, rangeEnd);
  const isFuture = (date: Date) => isAfter(startOfDay(date), endOfDay(new Date()));

  return (
    <div className="space-y-2">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => setViewMonth(prev => subMonths(prev, 1))}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-md transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
        <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          {format(viewMonth, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setViewMonth(prev => addMonths(prev, 1))}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-md transition-colors"
          disabled={isAfter(startOfMonth(addMonths(viewMonth, 1)), new Date())}
        >
          <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-[10px] font-medium text-gray-400 dark:text-gray-500 text-center py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: emptyDays }).map((_, i) => (
          <div key={`e-${i}`} className="aspect-square" />
        ))}
        {days.map(date => {
          const disabled = isFuture(date);
          const selected = isStart(date) || isEnd(date);
          const inRange = isInRange(date) && !selected;
          const today = isToday(date);

          return (
            <button
              key={date.toISOString()}
              disabled={disabled}
              onClick={() => onSelect(date)}
              className={cn(
                'aspect-square rounded-lg relative flex items-center justify-center text-xs font-medium transition-all duration-150',
                disabled && 'opacity-30 cursor-not-allowed',
                !disabled && !selected && !inRange && 'hover:bg-emerald-500/20 dark:hover:bg-emerald-500/20',
                // Selected endpoints — emerald filled (heatmap style)
                selected && 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30',
                // In-range days — lighter emerald
                inRange && 'bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                // Default
                !selected && !inRange && 'text-gray-700 dark:text-gray-300 bg-gray-100/50 dark:bg-gray-800/30',
                // Today ring
                today && !selected && 'ring-1 ring-emerald-500/50',
              )}
            >
              {format(date, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const tabs = [
  { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { value: 'transcripts', label: 'Transcripts', icon: FileText },
  { value: 'insights', label: 'Insights', icon: Wand2 },
  { value: 'reports', label: 'Reports', icon: ClipboardList },
] as const;

export default function MeetingAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { transcriptId } = useParams<{ transcriptId?: string }>();
  const navigate = useNavigate();
  const [isIndexing, setIsIndexing] = useState(false);

  const { indexStatus, isLoadingStatus, triggerFullIndex } = useMeetingIntelligence();

  const activeTab = searchParams.get('tab') || 'dashboard';

  // Date range state (shared across tabs)
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [calendarStart, setCalendarStart] = useState<Date | null>(null);
  const [calendarEnd, setCalendarEnd] = useState<Date | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Derive period and dateRange from state
  const period: TimePeriod = useMemo(() => {
    if (datePreset === '7d') return 7;
    if (datePreset === '90d') return 90;
    return 30;
  }, [datePreset]);

  const dateRange = useMemo(() => {
    if (datePreset === 'custom' && calendarStart && calendarEnd) {
      const s = isBefore(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      const e = isAfter(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      return { start: startOfDay(s), end: endOfDay(e) };
    }
    return undefined;
  }, [datePreset, calendarStart, calendarEnd]);

  const handlePresetClick = useCallback((preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      setCalendarStart(null);
      setCalendarEnd(null);
      setIsDatePickerOpen(false);
    }
  }, []);

  const handleCalendarSelect = useCallback((date: Date) => {
    if (!calendarStart || (calendarStart && calendarEnd)) {
      // Starting new selection
      setCalendarStart(date);
      setCalendarEnd(null);
      setDatePreset('custom');
    } else {
      // Completing selection
      setCalendarEnd(date);
      setDatePreset('custom');
    }
  }, [calendarStart, calendarEnd]);

  const handleClearDateRange = useCallback(() => {
    setDatePreset('30d');
    setCalendarStart(null);
    setCalendarEnd(null);
    setIsDatePickerOpen(false);
  }, []);

  const dateDisplayText = useMemo(() => {
    if (datePreset === 'custom' && calendarStart && calendarEnd) {
      const s = isBefore(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      const e = isAfter(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
    }
    if (datePreset === 'custom' && calendarStart) {
      return `${format(calendarStart, 'MMM d')} – select end`;
    }
    if (datePreset === '7d') return 'Last 7 days';
    if (datePreset === '90d') return 'Last 90 days';
    return 'Last 30 days';
  }, [datePreset, calendarStart, calendarEnd]);

  const handleSync = async () => {
    setIsIndexing(true);
    try {
      await triggerFullIndex();
    } finally {
      setIsIndexing(false);
    }
  };

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const handleTranscriptDetailClose = () => {
    navigate('/meeting-analytics');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-gray-50 dark:bg-[#0a0f1e] text-gray-900 dark:text-gray-100 relative"
    >
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[200px] -left-[100px] w-[600px] h-[600px] rounded-full bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06] blur-[120px]" />
        <div className="absolute -bottom-[200px] -right-[100px] w-[500px] h-[500px] rounded-full bg-teal-500/[0.04] dark:bg-teal-500/[0.06] blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header - Intelligence page pattern */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-600/10 dark:bg-emerald-500/20 border border-emerald-600/20 dark:border-emerald-500/30 flex items-center justify-center">
              <Search className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                <span className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent">
                  Meeting
                </span>{' '}
                <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                  Analytics
                </span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  AI-powered search and insights across your meetings
                </p>
              </div>
            </div>
          </div>

          {/* Index Status Indicator */}
          {!isLoadingStatus && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="flex items-center gap-3 bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl px-4 py-2.5 border border-gray-200/50 dark:border-gray-700/30 shadow-sm self-start sm:self-auto"
            >
              {/* Circular progress */}
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30">
                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18" cy="18" r="14"
                      fill="none"
                      className="stroke-gray-200/50 dark:stroke-gray-700/30"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18" cy="18" r="14"
                      fill="none"
                      className="stroke-emerald-500"
                      strokeWidth="3"
                      strokeDasharray={`${indexStatus.total > 0 ? Math.round((indexStatus.indexed / indexStatus.total) * 100) * 0.88 : 0} 88`}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Database className="h-4 w-4 text-emerald-500" />
                </div>
              </div>

              {/* Count + label */}
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {indexStatus.indexed}/{indexStatus.total}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">indexed</span>
              </div>

              {/* Status badge */}
              <div className="flex items-center">
                {indexStatus.indexed === indexStatus.total && indexStatus.total > 0 && (
                  <Badge className="bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/30 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                    Synced
                  </Badge>
                )}
                {indexStatus.status === 'syncing' && (
                  <Badge className="bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/30 font-medium">
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    Syncing
                  </Badge>
                )}
                {indexStatus.status === 'error' && (
                  <Badge className="bg-red-100/80 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200/50 dark:border-red-500/30 font-medium">
                    <AlertCircle className="h-3 w-3 mr-1.5" />
                    Error
                  </Badge>
                )}
              </div>

              {/* Sync button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={isIndexing || indexStatus.status === 'syncing'}
                className="h-9 gap-2 bg-white/80 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/30 hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 hover:border-emerald-300/50 dark:hover:border-emerald-500/30 hover:text-emerald-700 dark:hover:text-emerald-400 rounded-lg transition-all duration-300 dark:text-gray-200"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', (isIndexing || indexStatus.status === 'syncing') && 'animate-spin')} />
                {isIndexing ? 'Indexing...' : 'Sync'}
              </Button>
            </motion.div>
          )}
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <TabsList className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/30 rounded-xl p-1 shadow-sm">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex items-center gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:dark:bg-gray-800/80 data-[state=active]:shadow-sm transition-all"
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Date Range Picker */}
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                    'bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl border shadow-sm',
                    datePreset === 'custom'
                      ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400'
                      : 'border-gray-200/50 dark:border-gray-700/30 text-gray-700 dark:text-gray-300',
                    'hover:border-emerald-300/50 dark:hover:border-emerald-500/30'
                  )}
                >
                  <Calendar className="w-4 h-4 dark:text-white" />
                  <span>{dateDisplayText}</span>
                  {datePreset === 'custom' && (
                    <X
                      className="w-3.5 h-3.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      onClick={(e) => { e.stopPropagation(); handleClearDateRange(); }}
                    />
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-80 p-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-gray-200/50 dark:border-gray-700/30 shadow-xl rounded-xl"
                align="end"
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-200/50 dark:border-gray-700/30">
                    <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-200">Date Range</span>
                  </div>

                  {/* Quick presets */}
                  <div className="flex gap-2">
                    {([['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => handlePresetClick(key)}
                        className={cn(
                          'flex-1 px-3 py-1.5 text-sm rounded-lg font-medium transition-all',
                          datePreset === key
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-gray-100/80 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-700/50'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Calendar range picker */}
                  <div className="pt-2 border-t border-gray-200/50 dark:border-gray-700/30">
                    <CalendarRangePicker
                      rangeStart={calendarStart}
                      rangeEnd={calendarEnd}
                      onSelect={handleCalendarSelect}
                    />
                  </div>

                  {/* Selection summary + reset */}
                  {calendarStart && (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200/50 dark:border-gray-700/30">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {calendarEnd
                          ? `${format(isBefore(calendarStart, calendarEnd) ? calendarStart : calendarEnd, 'MMM d')} – ${format(isAfter(calendarStart, calendarEnd) ? calendarStart : calendarEnd, 'MMM d, yyyy')}`
                          : `${format(calendarStart, 'MMM d')} – select end date`
                        }
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleClearDateRange}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 h-7 px-2"
                      >
                        Reset
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* SearchHero - only on Dashboard tab */}
          <AnimatePresence>
            {activeTab === 'dashboard' && (
              <motion.div
                key="search-hero"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <SearchHero className="mb-6 sm:mb-8" />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              <TabsContent value="dashboard" className="mt-0">
                <DashboardTab period={period} dateRange={dateRange} />
              </TabsContent>

              <TabsContent value="transcripts" className="mt-0">
                <TranscriptsTab />
              </TabsContent>

              <TabsContent value="insights" className="mt-0">
                <InsightsTab />
              </TabsContent>

              <TabsContent value="reports" className="mt-0">
                <ReportsTab />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>

      {/* Transcript Detail Sheet */}
      {transcriptId && (
        <TranscriptDetailSheet
          transcriptId={transcriptId}
          open={true}
          onClose={handleTranscriptDetailClose}
        />
      )}
    </motion.div>
  );
}
