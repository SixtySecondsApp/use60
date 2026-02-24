/**
 * DateRangeFilter — Reusable date range picker with preset buttons and heatmap-styled calendar.
 *
 * Usage:
 *   const dateFilter = useDateRangeFilter(); // defaults to 'month' mode (current calendar month)
 *   <DateRangeFilter {...dateFilter} />
 *   // Use dateFilter.period and dateFilter.dateRange for data fetching
 *
 *   Month navigation:
 *   dateFilter.navigateMonth(-1) // go to previous month
 *   dateFilter.navigateMonth(1)  // go to next month (disabled if would be future)
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  format, startOfDay, endOfDay, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, addMonths, subMonths, isSameDay,
  isAfter, isBefore, isWithinInterval, isToday, subDays,
} from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type DatePreset = '7d' | '30d' | '90d' | 'month' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface UseDateRangeFilterReturn {
  datePreset: DatePreset;
  calendarStart: Date | null;
  calendarEnd: Date | null;
  /** Current month being displayed in month navigation mode */
  currentMonth: Date;
  /** Navigate months: -1 for previous, +1 for next. Disabled if would exceed current month. */
  navigateMonth: (direction: -1 | 1) => void;
  /** True when next month navigation would exceed today's month */
  isCurrentMonth: boolean;
  period: number;
  dateRange: DateRange | undefined;
  dateDisplayText: string;
  isDatePickerOpen: boolean;
  setIsDatePickerOpen: (open: boolean) => void;
  handlePresetClick: (preset: DatePreset) => void;
  handleCalendarSelect: (date: Date) => void;
  /** Atomically set both start and end of a custom range (avoids intermediate "select end" state) */
  setCustomRange: (start: Date, end: Date) => void;
  handleClear: () => void;
}

// ============================================================================
// Hook — manages all date range filter state
// ============================================================================

export function useDateRangeFilter(defaultPreset: DatePreset = 'month'): UseDateRangeFilterReturn {
  const [datePreset, setDatePreset] = useState<DatePreset>(defaultPreset);
  const [calendarStart, setCalendarStart] = useState<Date | null>(null);
  const [calendarEnd, setCalendarEnd] = useState<Date | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpenRaw] = useState(false);
  // Month navigation: start at current month (beginning of today's month)
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));

  // Snapshot of the last valid state before opening, so we can restore on incomplete close
  const lastValidState = useRef<{ preset: DatePreset; start: Date | null; end: Date | null; month: Date }>({
    preset: defaultPreset, start: null, end: null, month: startOfMonth(new Date()),
  });

  // True when the current navigated month is the same as today's month (can't go forward)
  const isCurrentMonth = useMemo(() => {
    const todayMonthStart = startOfMonth(new Date());
    return !isBefore(currentMonth, todayMonthStart);
  }, [currentMonth]);

  const navigateMonth = useCallback((direction: -1 | 1) => {
    setCurrentMonth(prev => {
      const next = direction === 1 ? addMonths(prev, 1) : subMonths(prev, 1);
      // Clamp: never allow navigating past the current calendar month
      const todayMonthStart = startOfMonth(new Date());
      if (isAfter(next, todayMonthStart)) return prev;
      return next;
    });
    // Ensure we switch to month mode when using navigation
    setDatePreset('month');
    setCalendarStart(null);
    setCalendarEnd(null);
  }, []);

  const period = useMemo(() => {
    if (datePreset === '7d') return 7;
    if (datePreset === '90d') return 90;
    if (datePreset === 'month') {
      // Return actual days in the current navigated month
      const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }).length;
      return days;
    }
    if (datePreset === 'custom' && calendarStart && calendarEnd) {
      const s = isBefore(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      const e = isAfter(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000));
      if (days <= 7) return 7;
      if (days <= 30) return 30;
      return 90;
    }
    return 30;
  }, [datePreset, calendarStart, calendarEnd, currentMonth]);

  const dateRange = useMemo<DateRange | undefined>(() => {
    if (datePreset === 'month') {
      return { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) };
    }
    if (datePreset === 'custom' && calendarStart && calendarEnd) {
      const s = isBefore(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      const e = isAfter(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      return { start: startOfDay(s), end: endOfDay(e) };
    }
    // For rolling preset periods, compute the range
    if (datePreset !== 'custom') {
      const end = new Date();
      const start = subDays(end, period);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    return undefined;
  }, [datePreset, calendarStart, calendarEnd, period, currentMonth]);

  // Wrap setIsDatePickerOpen to handle cleanup on close
  const setIsDatePickerOpen = useCallback((open: boolean) => {
    if (open) {
      // Snapshot current valid state before user starts interacting
      lastValidState.current = { preset: datePreset, start: calendarStart, end: calendarEnd, month: currentMonth };
    } else {
      // Closing: if selection is incomplete (custom with no end date), restore previous state
      // This prevents the filter from getting "stuck" when user browses months without completing a selection
      if (datePreset === 'custom' && (!calendarStart || !calendarEnd)) {
        setDatePreset(lastValidState.current.preset);
        setCalendarStart(lastValidState.current.start);
        setCalendarEnd(lastValidState.current.end);
        setCurrentMonth(lastValidState.current.month);
      }
    }
    setIsDatePickerOpenRaw(open);
  }, [datePreset, calendarStart, calendarEnd, currentMonth]);

  const handlePresetClick = useCallback((preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === 'month') {
      // Reset to current calendar month when switching to month mode
      setCurrentMonth(startOfMonth(new Date()));
      setCalendarStart(null);
      setCalendarEnd(null);
      setIsDatePickerOpenRaw(false);
    } else if (preset !== 'custom') {
      setCalendarStart(null);
      setCalendarEnd(null);
      setIsDatePickerOpenRaw(false);
    }
  }, []);

  const handleCalendarSelect = useCallback((date: Date) => {
    if (!calendarStart || (calendarStart && calendarEnd)) {
      setCalendarStart(date);
      setCalendarEnd(null);
      setDatePreset('custom');
    } else {
      // Allow start === end (single-day selection is valid)
      setCalendarEnd(date);
      setDatePreset('custom');
    }
  }, [calendarStart, calendarEnd]);

  const setCustomRange = useCallback((start: Date, end: Date) => {
    setCalendarStart(start);
    setCalendarEnd(end);
    setDatePreset('custom');
  }, []);

  const handleClear = useCallback(() => {
    setDatePreset(defaultPreset);
    setCalendarStart(null);
    setCalendarEnd(null);
    setCurrentMonth(startOfMonth(new Date()));
    setIsDatePickerOpenRaw(false);
  }, [defaultPreset]);

  const dateDisplayText = useMemo(() => {
    if (datePreset === 'month') {
      return format(currentMonth, 'MMMM yyyy');
    }
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
  }, [datePreset, calendarStart, calendarEnd, currentMonth]);

  return {
    datePreset, calendarStart, calendarEnd,
    currentMonth, navigateMonth, isCurrentMonth,
    period, dateRange, dateDisplayText,
    isDatePickerOpen, setIsDatePickerOpen,
    handlePresetClick, handleCalendarSelect, setCustomRange, handleClear,
  };
}

// ============================================================================
// Calendar Grid Component
// ============================================================================

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function CalendarRangePicker({
  rangeStart,
  rangeEnd,
  onSelect,
}: {
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onSelect: (date: Date) => void;
}) {
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
                selected && 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30',
                inRange && 'bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                !selected && !inRange && 'text-gray-700 dark:text-gray-300 bg-gray-100/50 dark:bg-gray-800/30',
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

// ============================================================================
// DateRangeFilter Component
// ============================================================================

interface DateRangeFilterProps extends UseDateRangeFilterReturn {
  className?: string;
  /** 'dark' variant for platform pages with dark backgrounds */
  variant?: 'light' | 'dark';
}

export function DateRangeFilter({
  datePreset,
  calendarStart,
  calendarEnd,
  currentMonth,
  navigateMonth,
  isCurrentMonth,
  dateDisplayText,
  isDatePickerOpen,
  setIsDatePickerOpen,
  handlePresetClick,
  handleCalendarSelect,
  handleClear,
  className,
  variant = 'light',
}: DateRangeFilterProps) {
  const isDark = variant === 'dark';
  const isCustom = datePreset === 'custom';
  const isMonthMode = datePreset === 'month';

  // Shared classes for the outer wrapper and chevron buttons
  const wrapperBase = cn(
    'flex items-center rounded-xl border backdrop-blur-xl shadow-sm transition-all',
    isDark
      ? cn(
          'bg-gray-800/50',
          isCustom ? 'border-emerald-500/50' : 'border-gray-700/50',
        )
      : cn(
          'bg-white/60 dark:bg-gray-900/40',
          isCustom
            ? 'border-emerald-500/50'
            : 'border-gray-200/50 dark:border-gray-700/30',
        ),
    className,
  );

  const chevronBtn = cn(
    'flex items-center justify-center w-7 h-8 rounded-lg transition-colors',
    isDark
      ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60 disabled:opacity-30 disabled:cursor-not-allowed'
      : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed',
  );

  return (
    <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
      <div className={wrapperBase}>
        {/* ── Month navigation arrows (month mode only) ── */}
        {isMonthMode && (
          <>
            <button
              type="button"
              onClick={() => navigateMonth(-1)}
              className={cn(chevronBtn, 'ml-1')}
              aria-label="Previous month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Month label — clicking opens the popover */}
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'px-2 py-1.5 text-sm font-medium transition-colors',
                  isDark
                    ? 'text-gray-200 hover:text-emerald-400'
                    : 'text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400',
                )}
                aria-label="Open date picker"
              >
                {dateDisplayText}
              </button>
            </PopoverTrigger>

            <button
              type="button"
              onClick={() => navigateMonth(1)}
              disabled={isCurrentMonth}
              className={cn(chevronBtn, 'mr-1')}
              aria-label="Next month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {/* ── Custom / rolling preset label ── */}
        {!isMonthMode && (
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-sm font-medium transition-colors',
                isCustom
                  ? isDark
                    ? 'text-emerald-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                  : isDark
                    ? 'text-gray-300'
                    : 'text-gray-700 dark:text-gray-300',
              )}
            >
              <span>{dateDisplayText}</span>
            </button>
          </PopoverTrigger>
        )}

        {/* ── X to clear custom range ── */}
        {isCustom && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            className={cn(
              'flex items-center justify-center w-5 h-5 mr-1 rounded transition-colors',
              isDark
                ? 'text-gray-500 hover:text-gray-200 hover:bg-gray-700/60'
                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-700/50',
            )}
            aria-label="Clear date range"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        {/* ── Calendar icon — always opens popover ── */}
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
              isDark
                ? 'text-gray-400 hover:text-emerald-400 hover:bg-gray-700/60'
                : 'text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100/80 dark:hover:bg-gray-700/50',
              isMonthMode ? 'border-l border-gray-200/50 dark:border-gray-700/30 rounded-l-none ml-0' : 'ml-0',
            )}
            aria-label="Open date picker"
          >
            <Calendar className="w-4 h-4" />
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent
        className={cn(
          'w-80 p-0 backdrop-blur-xl shadow-xl rounded-xl',
          isDark
            ? 'bg-gray-900/95 border-gray-700/50'
            : 'bg-white/95 dark:bg-gray-900/95 border-gray-200/50 dark:border-gray-700/30'
        )}
        align="end"
      >
        <div className="p-4 space-y-3">
          {/* Calendar range picker — key forces remount on reopen so viewMonth resets */}
          <div>
            <CalendarRangePicker
              key={isDatePickerOpen ? 'open' : 'closed'}
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
                onClick={handleClear}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 h-7 px-2"
              >
                Reset
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
