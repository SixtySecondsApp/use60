import React, { useState, useMemo, useCallback } from 'react';
import {
  Clock,
  Calendar,
  Send,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { scheduleEmail } from '@/lib/services/scheduledEmailService';
import { supabase } from '@/lib/supabase/clientV2';
import type { FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';
import { cn } from '@/lib/utils';
import { format, addHours, setHours, setMinutes, startOfTomorrow, nextMonday, isBefore } from 'date-fns';

interface ScheduleSendPickerSingleProps {
  draft: FollowUpDraft;
  drafts?: never;
  orgId: string;
  onScheduled: (draft: FollowUpDraft) => void;
  onCancel?: () => void;
}

interface ScheduleSendPickerBatchProps {
  draft?: never;
  drafts: FollowUpDraft[];
  orgId: string;
  onScheduled: () => void;
  onCancel?: () => void;
}

type ScheduleSendPickerProps = ScheduleSendPickerSingleProps | ScheduleSendPickerBatchProps;

function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function getTimezoneAbbr(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' });
    const parts = formatter.formatToParts(new Date());
    const tz = parts.find((p) => p.type === 'timeZoneName');
    return tz?.value ?? getTimezone();
  } catch {
    return getTimezone();
  }
}

interface QuickOption {
  label: string;
  getDate: () => Date;
}

function useQuickOptions(): QuickOption[] {
  return useMemo(() => {
    const now = new Date();
    const tomorrow = startOfTomorrow();

    const options: QuickOption[] = [
      {
        label: 'In 1 hour',
        getDate: () => addHours(new Date(), 1),
      },
      {
        label: 'Tomorrow 9am',
        getDate: () => setMinutes(setHours(tomorrow, 9), 0),
      },
      {
        label: 'Tomorrow 2pm',
        getDate: () => setMinutes(setHours(tomorrow, 14), 0),
      },
    ];

    // Add "Monday 9am" only if today is not Monday
    const monday = nextMonday(now);
    options.push({
      label: 'Monday 9am',
      getDate: () => setMinutes(setHours(monday, 9), 0),
    });

    return options;
  }, []);
}

function toDatetimeLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

export function ScheduleSendPicker(props: ScheduleSendPickerProps) {
  const { orgId, onCancel } = props;
  const isBatch = 'drafts' in props && Array.isArray(props.drafts);
  const targetDrafts: FollowUpDraft[] = isBatch ? props.drafts! : [props.draft!];

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [customDateStr, setCustomDateStr] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const quickOptions = useQuickOptions();
  const timezoneAbbr = useMemo(() => getTimezoneAbbr(), []);

  const validationError = useMemo(() => {
    if (!selectedDate) return null;
    if (isBefore(selectedDate, new Date())) {
      return 'Selected time is in the past';
    }
    return null;
  }, [selectedDate]);

  const handleQuickSelect = useCallback((option: QuickOption) => {
    const date = option.getDate();
    setSelectedDate(date);
    setCustomDateStr(toDatetimeLocalString(date));
  }, []);

  const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomDateStr(val);
    if (val) {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) {
        setSelectedDate(parsed);
      }
    } else {
      setSelectedDate(null);
    }
  }, []);

  const scheduleOneDraft = useCallback(
    async (draft: FollowUpDraft, scheduledFor: Date): Promise<string | null> => {
      try {
        const result = await scheduleEmail({
          to: draft.to_email,
          subject: draft.subject,
          body: draft.edited_body ?? draft.body,
          scheduledFor,
          contactId: undefined,
          dealId: undefined,
          calendarEventId: undefined,
        });

        // Update the draft status to 'scheduled' and link the scheduled email
        const { error } = await supabase
          .from('follow_up_drafts')
          .update({
            status: 'scheduled',
            scheduled_email_id: result.id,
          })
          .eq('id', draft.id);

        if (error) {
          console.error('[ScheduleSendPicker] Failed to update draft status:', error);
          throw error;
        }

        return result.id;
      } catch (err) {
        console.error('[ScheduleSendPicker] Error scheduling draft:', err);
        throw err;
      }
    },
    []
  );

  const handleSchedule = useCallback(async () => {
    if (!selectedDate || validationError) return;

    setIsScheduling(true);
    setProgress({ current: 0, total: targetDrafts.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetDrafts.length; i++) {
      setProgress({ current: i + 1, total: targetDrafts.length });
      try {
        await scheduleOneDraft(targetDrafts[i], selectedDate);
        successCount++;
      } catch {
        failCount++;
      }
    }

    setIsScheduling(false);
    setProgress({ current: 0, total: 0 });

    if (failCount > 0 && successCount > 0) {
      toast.error(`${successCount} scheduled, ${failCount} failed`);
    } else if (failCount > 0 && successCount === 0) {
      toast.error('Failed to schedule email');
      return;
    } else if (!isBatch) {
      toast.success(
        `Scheduled for ${format(selectedDate, 'MMM d, h:mm a')} ${timezoneAbbr}`
      );
    }

    if (isBatch) {
      (props as ScheduleSendPickerBatchProps).onScheduled();
    } else {
      const draft = targetDrafts[0];
      const updatedDraft: FollowUpDraft = {
        ...draft,
        status: 'scheduled',
        updated_at: new Date().toISOString(),
      };
      (props as ScheduleSendPickerSingleProps).onScheduled(updatedDraft);
    }
  }, [selectedDate, validationError, targetDrafts, scheduleOneDraft, isBatch, props, timezoneAbbr]);

  // Minimum datetime for the picker (now)
  const minDateStr = useMemo(() => toDatetimeLocalString(new Date()), []);

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#37bd7e]" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {isBatch
              ? `Schedule ${targetDrafts.length} draft${targetDrafts.length !== 1 ? 's' : ''}`
              : 'Schedule send'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            <Clock className="w-3 h-3 inline mr-1" />
            {timezoneAbbr}
          </span>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Quick options */}
      <div className="flex flex-wrap gap-2">
        {quickOptions.map((option) => {
          const optionDate = option.getDate();
          const isSelected =
            selectedDate && Math.abs(selectedDate.getTime() - optionDate.getTime()) < 60000;
          return (
            <button
              key={option.label}
              onClick={() => handleQuickSelect(option)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                isSelected
                  ? 'bg-[#37bd7e]/20 text-[#37bd7e] border-[#37bd7e]/30'
                  : 'text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Custom datetime picker */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Custom date & time</label>
          <input
            type="datetime-local"
            value={customDateStr}
            min={minDateStr}
            onChange={handleCustomChange}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#37bd7e]/50 focus:border-[#37bd7e]"
          />
        </div>
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {validationError}
        </div>
      )}

      {/* Selected time summary */}
      {selectedDate && !validationError && (
        <div className="text-xs text-gray-500">
          Will send {format(selectedDate, 'EEEE, MMM d, yyyy')} at{' '}
          {format(selectedDate, 'h:mm a')} {timezoneAbbr}
        </div>
      )}

      {/* Confirm button */}
      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isScheduling}>
            Cancel
          </Button>
        )}
        <Button
          variant="success"
          size="sm"
          onClick={handleSchedule}
          disabled={!selectedDate || !!validationError || isScheduling}
        >
          {isScheduling ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              {targetDrafts.length > 1
                ? `Scheduling ${progress.current} of ${progress.total}...`
                : 'Scheduling...'}
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Schedule
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
