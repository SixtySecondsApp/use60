/**
 * FrequencyPicker — Human-friendly cron schedule selector
 *
 * Replaces raw cron expression input with preset dropdowns
 * (Manual, Hourly, Daily, Weekdays, Weekly) plus time/day pickers.
 * Falls back to a raw cron input for power users via "Custom" option.
 *
 * Output: a valid 5-field cron expression string.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

/** Validate a 5-field cron expression */
function isValidCron(cron: string): boolean {
  if (!cron) return false;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const patterns = [
    /^(\*|(\*\/\d+)|(\d+(-\d+)?(,\d+(-\d+)?)*))$/, // minute (0-59)
    /^(\*|(\*\/\d+)|(\d+(-\d+)?(,\d+(-\d+)?)*))$/, // hour (0-23)
    /^(\*|(\*\/\d+)|(\d+(-\d+)?(,\d+(-\d+)?)*))$/, // day of month (1-31)
    /^(\*|(\*\/\d+)|(\d+(-\d+)?(,\d+(-\d+)?)*))$/, // month (1-12)
    /^(\*|(\*\/\d+)|(\d+(-\d+)?(,\d+(-\d+)?)*))$/, // day of week (0-7)
  ];
  return parts.every((part, i) => patterns[i].test(part));
}

/** Get the user's timezone abbreviation */
function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/** Get short timezone label (e.g., "EST", "PST") */
function getTimezoneAbbr(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' });
    const parts = formatter.formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || getUserTimezone();
  } catch {
    return 'UTC';
  }
}

type FrequencyPreset = 'manual' | 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'custom';

interface FrequencyPickerProps {
  value: string;
  onChange: (cronExpression: string) => void;
}

const DAYS_OF_WEEK = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

/** Detect which preset a cron expression represents */
function detectPreset(cron: string): FrequencyPreset {
  if (!cron) return 'daily';
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 'custom';

  const [minute, hour, dom, month, dow] = parts;

  if (dom === '*' && month === '*') {
    if (hour === '*' && dow === '*') return 'hourly';
    if (dow === '1-5' && hour !== '*') return 'weekdays';
    if (dow === '*' && hour !== '*') return 'daily';
    if (dow !== '*' && !dow.includes('-') && !dow.includes(',') && hour !== '*') return 'weekly';
  }
  return 'custom';
}

/** Extract time (HH:MM) from a cron expression */
function extractTime(cron: string): string {
  if (!cron) return '09:00';
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return '09:00';
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  if (isNaN(minute) || isNaN(hour)) return '09:00';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Extract day of week from a cron expression */
function extractDayOfWeek(cron: string): string {
  if (!cron) return '1';
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return '1';
  const dow = parts[4];
  if (dow === '*' || dow === '1-5') return '1';
  return dow;
}

/** Build a cron expression from preset + time + day */
function buildCron(preset: FrequencyPreset, time: string, dayOfWeek: string): string {
  const [hourStr, minuteStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  switch (preset) {
    case 'manual':
      return '';
    case 'hourly':
      return `${minute} * * * *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekdays':
      return `${minute} ${hour} * * 1-5`;
    case 'weekly':
      return `${minute} ${hour} * * ${dayOfWeek}`;
    default:
      return '';
  }
}

/** Human-readable description of a cron expression */
export function describeCron(cron: string): string {
  if (!cron) return 'Manual (run on demand)';
  const preset = detectPreset(cron);
  const time = extractTime(cron);
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const timeStr = `${displayHour}:${String(m).padStart(2, '0')} ${ampm}`;

  switch (preset) {
    case 'hourly': {
      return m === 0 ? 'Every hour on the hour' : `Every hour at :${String(m).padStart(2, '0')}`;
    }
    case 'daily':
      return `Every day at ${timeStr}`;
    case 'weekdays':
      return `Weekdays at ${timeStr}`;
    case 'weekly': {
      const dow = extractDayOfWeek(cron);
      const dayName = DAYS_OF_WEEK.find((d) => d.value === dow)?.label || 'Monday';
      return `Every ${dayName} at ${timeStr}`;
    }
    default:
      return cron;
  }
}

export default function FrequencyPicker({ value, onChange }: FrequencyPickerProps) {
  const [preset, setPreset] = useState<FrequencyPreset>(() => detectPreset(value));
  const [time, setTime] = useState(() => extractTime(value));
  const [dayOfWeek, setDayOfWeek] = useState(() => extractDayOfWeek(value));
  const [customCron, setCustomCron] = useState(value || '');
  const [cronError, setCronError] = useState('');
  const isInitialMount = useRef(true);

  // Rebuild cron when preset/time/day changes (skip initial mount)
  const emitCron = useCallback(() => {
    if (preset === 'custom') {
      if (customCron && !isValidCron(customCron)) {
        setCronError('Invalid cron — expected 5 fields (min hour dom month dow)');
        return;
      }
      setCronError('');
      onChange(customCron);
    } else if (preset === 'manual') {
      setCronError('');
      onChange('');
    } else {
      setCronError('');
      onChange(buildCron(preset, time, dayOfWeek));
    }
  }, [preset, time, dayOfWeek, customCron, onChange]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    emitCron();
  }, [emitCron]);

  const handlePresetChange = (newPreset: FrequencyPreset) => {
    setPreset(newPreset);
    if (newPreset === 'custom') {
      setCustomCron(value || '0 9 * * *');
    }
  };

  const showTimePicker = preset === 'daily' || preset === 'weekdays' || preset === 'weekly';
  const showMinutePicker = preset === 'hourly';
  const showDayPicker = preset === 'weekly';

  // Extract minute from time for the hourly minute-only picker
  const minuteValue = time.split(':')[1] || '00';

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        {/* Preset selector */}
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Frequency</label>
          <Select value={preset} onValueChange={(v) => handlePresetChange(v as FrequencyPreset)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual (on demand)</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekdays">Weekdays</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="custom">Custom cron</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Minute picker for hourly preset */}
        {showMinutePicker && (
          <div className="w-28 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">At minute</label>
            <Select value={minuteValue} onValueChange={(v) => setTime(`09:${v}`)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((m) => (
                  <SelectItem key={m} value={m}>:{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Time picker */}
        {showTimePicker && (
          <div className="w-32 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Time</label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        )}

        {/* Day picker */}
        {showDayPicker && (
          <div className="w-40 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Day</label>
            <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Custom cron input */}
      {preset === 'custom' && (
        <div className="space-y-1">
          <Input
            placeholder="0 9 * * 1-5"
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            className={`font-mono text-sm ${cronError ? 'border-destructive' : ''}`}
          />
          {cronError && (
            <p className="text-xs text-destructive">{cronError}</p>
          )}
        </div>
      )}

      {/* Human-readable summary + timezone */}
      {value && (
        <p className="text-xs text-muted-foreground">
          {describeCron(value)}
          {preset !== 'manual' && preset !== 'hourly' && (
            <span className="ml-1 text-muted-foreground/60">({getTimezoneAbbr()})</span>
          )}
        </p>
      )}
    </div>
  );
}
