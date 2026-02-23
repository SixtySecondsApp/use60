/**
 * DateRangeFilter — Reusable date range picker with preset buttons and heatmap-styled calendar.
 *
 * Usage:
 *   const dateFilter = useDateRangeFilter('30d');
 *   <DateRangeFilter {...dateFilter} />
 *   // Use dateFilter.period and dateFilter.dateRange for data fetching
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  format, startOfDay, endOfDay, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, addMonths, subMonths, isSameDay,
  isAfter, isBefore, isWithinInterval, isToday, subDays,
} from 'date-fns';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type DatePreset = '7d' | '30d' | '90d' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface UseDateRangeFilterReturn {
  datePreset: DatePreset;
  calendarStart: Date | null;
  calendarEnd: Date | null;
  period: number;
  dateRange: DateRange | undefined;
  dateDisplayText: string;
  isDatePickerOpen: boolean;
  setIsDatePickerOpen: (open: boolean) => void;
  handlePresetClick: (preset: DatePreset) => void;
  handleCalendarSelect: (date: Date) => void;
  handleClear: () => void;
}

// ============================================================================
// Hook — manages all date range filter state
// ============================================================================

export function useDateRangeFilter(defaultPreset: DatePreset = '30d'): UseDateRangeFilterReturn {
  const [datePreset, setDatePreset] = useState<DatePreset>(defaultPreset);
  const [calendarStart, setCalendarStart] = useState<Date | null>(null);
  const [calendarEnd, setCalendarEnd] = useState<Date | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpenRaw] = useState(false);

  // Snapshot of the last valid state before opening, so we can restore on incomplete close
  const lastValidState = useRef<{ preset: DatePreset; start: Date | null; end: Date | null }>({
    preset: defaultPreset, start: null, end: null,
  });

  const period = useMemo(() => {
    if (datePreset === '7d') return 7;
    if (datePreset === '90d') return 90;
    if (datePreset === 'custom' && calendarStart && calendarEnd) {
      const s = isBefore(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      const e = isAfter(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000));
      if (days <= 7) return 7;
      if (days <= 30) return 30;
      return 90;
    }
    return 30;
  }, [datePreset, calendarStart, calendarEnd]);

  const dateRange = useMemo<DateRange | undefined>(() => {
    if (datePreset === 'custom' && calendarStart && calendarEnd) {
      const s = isBefore(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      const e = isAfter(calendarStart, calendarEnd) ? calendarStart : calendarEnd;
      return { start: startOfDay(s), end: endOfDay(e) };
    }
    // For preset periods, compute the range
    if (datePreset !== 'custom') {
      const end = new Date();
      const start = subDays(end, period);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    return undefined;
  }, [datePreset, calendarStart, calendarEnd, period]);

  // Wrap setIsDatePickerOpen to handle cleanup on close
  const setIsDatePickerOpen = useCallback((open: boolean) => {
    if (open) {
      // Snapshot current valid state before user starts interacting
      lastValidState.current = { preset: datePreset, start: calendarStart, end: calendarEnd };
    } else {
      // Closing: if selection is incomplete (custom with no end date), restore previous state
      // This prevents the filter from getting "stuck" when user browses months without completing a selection
      if (datePreset === 'custom' && (!calendarStart || !calendarEnd)) {
        setDatePreset(lastValidState.current.preset);
        setCalendarStart(lastValidState.current.start);
        setCalendarEnd(lastValidState.current.end);
      }
    }
    setIsDatePickerOpenRaw(open);
  }, [datePreset, calendarStart, calendarEnd]);

  const handlePresetClick = useCallback((preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
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
      setCalendarEnd(date);
      setDatePreset('custom');
    }
  }, [calendarStart, calendarEnd]);

  const handleClear = useCallback(() => {
    setDatePreset(defaultPreset);
    setCalendarStart(null);
    setCalendarEnd(null);
    setIsDatePickerOpenRaw(false);
  }, [defaultPreset]);

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

  return {
    datePreset, calendarStart, calendarEnd,
    period, dateRange, dateDisplayText,
    isDatePickerOpen, setIsDatePickerOpen,
    handlePresetClick, handleCalendarSelect, handleClear,
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
  /** Extra preset options beyond the default 7d/30d/90d */
  extraPresets?: Array<{ key: string; label: string; onClick: () => void }>;
}

export function DateRangeFilter({
  datePreset,
  calendarStart,
  calendarEnd,
  dateDisplayText,
  isDatePickerOpen,
  setIsDatePickerOpen,
  handlePresetClick,
  handleCalendarSelect,
  handleClear,
  className,
  variant = 'light',
  extraPresets,
}: DateRangeFilterProps) {
  const isDark = variant === 'dark';

  return (
    <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all',
            isDark
              ? cn(
                  'bg-gray-800/50 backdrop-blur-xl border shadow-sm',
                  datePreset === 'custom'
                    ? 'border-emerald-500/50 text-emerald-400'
                    : 'border-gray-700/50 text-gray-300',
                  'hover:border-emerald-500/30'
                )
              : cn(
                  'bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl border shadow-sm',
                  datePreset === 'custom'
                    ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400'
                    : 'border-gray-200/50 dark:border-gray-700/30 text-gray-700 dark:text-gray-300',
                  'hover:border-emerald-300/50 dark:hover:border-emerald-500/30'
                ),
            className
          )}
        >
          <Calendar className="w-4 h-4 dark:text-white" />
          <span>{dateDisplayText}</span>
          {datePreset === 'custom' && (
            <X
              className="w-3.5 h-3.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
            />
          )}
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </PopoverTrigger>
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
                    : isDark
                      ? 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
                      : 'bg-gray-100/80 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-700/50'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Extra presets (e.g. thisMonth, lastMonth for VSL) */}
          {extraPresets && extraPresets.length > 0 && (
            <div className="flex gap-2">
              {extraPresets.map(({ key, label, onClick }) => (
                <button
                  key={key}
                  onClick={onClick}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-sm rounded-lg font-medium transition-all',
                    isDark
                      ? 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
                      : 'bg-gray-100/80 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-700/50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Calendar range picker — key forces remount on reopen so viewMonth resets */}
          <div className="pt-2 border-t border-gray-200/50 dark:border-gray-700/30">
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
