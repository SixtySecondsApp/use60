/**
 * ScheduleSendPicker — FU-003
 * Date/time picker for scheduling follow-up email sends.
 * Suggests optimal send times from historical reply data.
 * Saves to scheduled_emails table and updates draft status to 'scheduled'.
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { type FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, addHours, addDays, setHours, setMinutes } from 'date-fns';

interface ScheduleSendPickerProps {
  draft: FollowUpDraft;
  orgId: string;
  onScheduled: (updated: FollowUpDraft) => void;
}

// Optimal send time windows derived from industry research / historical data
const OPTIMAL_SUGGESTIONS = [
  { label: 'In 1 hour', getDate: () => addHours(new Date(), 1) },
  { label: 'Tomorrow 9 AM', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
  { label: 'Tomorrow 2 PM', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 14), 0) },
  { label: 'In 2 days', getDate: () => setMinutes(setHours(addDays(new Date(), 2), 9), 0) },
];

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ScheduleSendPicker({ draft, orgId, onScheduled }: ScheduleSendPickerProps) {
  const [scheduledAt, setScheduledAt] = useState<Date>(() => addHours(new Date(), 1));
  const [isScheduling, setIsScheduling] = useState(false);
  const [optimalTime, setOptimalTime] = useState<Date | null>(null);

  // Fetch optimal send time from historical reply data
  useEffect(() => {
    async function fetchOptimalTime() {
      const { data } = await supabase
        .from('sequence_jobs')
        .select('metadata')
        .eq('org_id', orgId)
        .eq('status', 'replied')
        .order('replied_at', { ascending: false })
        .limit(50);

      if (!data || data.length === 0) return;

      // Count replies by hour of day
      const hourCounts: Record<number, number> = {};
      for (const job of data) {
        const meta = job.metadata as Record<string, unknown> | null;
        const repliedAt = meta?.replied_at as string | undefined;
        if (repliedAt) {
          const h = new Date(repliedAt).getHours();
          hourCounts[h] = (hourCounts[h] ?? 0) + 1;
        }
      }

      const bestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (bestHour) {
        const tomorrow = addDays(new Date(), 1);
        setOptimalTime(setMinutes(setHours(tomorrow, parseInt(bestHour)), 0));
      }
    }

    fetchOptimalTime();
  }, [orgId]);

  const handleSchedule = async () => {
    if (scheduledAt <= new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    setIsScheduling(true);
    try {
      const body = draft.edited_body ?? draft.body;

      // Insert into scheduled_emails
      const { data: scheduled, error: scheduleError } = await supabase
        .from('scheduled_emails')
        .insert({
          org_id: orgId,
          user_id: draft.user_id,
          to_email: draft.to_email,
          subject: draft.subject,
          body,
          scheduled_at: scheduledAt.toISOString(),
          meeting_id: draft.meeting_id,
          draft_id: draft.id,
          status: 'pending',
        })
        .select('id')
        .single();

      if (scheduleError) throw scheduleError;

      // Update draft to scheduled
      const { data: updated, error: updateError } = await supabase
        .from('follow_up_drafts')
        .update({
          status: 'scheduled',
          scheduled_email_id: scheduled.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id)
        .select(
          'id, org_id, user_id, meeting_id, to_email, to_name, subject, body, edited_body, status, buying_signals, generated_at, approved_at, sent_at, rejected_at, expires_at, scheduled_email_id, created_at, updated_at'
        )
        .maybeSingle();

      if (updateError) throw updateError;

      toast.success(`Email scheduled for ${formatDistanceToNow(scheduledAt, { addSuffix: true })}`);
      if (updated) onScheduled(updated as FollowUpDraft);
    } catch (err) {
      toast.error(`Failed to schedule: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="p-4 bg-gray-900/60">
      <p className="text-xs font-medium text-gray-400 mb-3 flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5 text-purple-400" />
        Schedule send
      </p>

      {/* Optimal time suggestion */}
      {optimalTime && (
        <button
          onClick={() => setScheduledAt(optimalTime)}
          className="w-full mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 hover:bg-purple-500/20 transition-colors text-left"
        >
          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Optimal time: <strong>{formatDistanceToNow(optimalTime, { addSuffix: true })}</strong> —
            based on your historical reply data
          </span>
        </button>
      )}

      {/* Quick suggestions */}
      <div className="flex flex-wrap gap-2 mb-3">
        {OPTIMAL_SUGGESTIONS.map((s) => {
          const d = s.getDate();
          return (
            <button
              key={s.label}
              onClick={() => setScheduledAt(d)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md border transition-colors',
                scheduledAt.toDateString() === d.toDateString() &&
                  scheduledAt.getHours() === d.getHours()
                  ? 'border-purple-500/40 bg-purple-500/10 text-purple-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Custom datetime */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          <input
            type="datetime-local"
            value={toLocalDatetimeValue(scheduledAt)}
            min={toLocalDatetimeValue(new Date())}
            onChange={(e) => {
              if (e.target.value) setScheduledAt(new Date(e.target.value));
            }}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30"
          />
        </div>

        <button
          onClick={handleSchedule}
          disabled={isScheduling}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          {isScheduling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Calendar className="w-3.5 h-3.5" />
          )}
          Schedule
        </button>
      </div>

      {/* Countdown preview */}
      {scheduledAt > new Date() && (
        <p className="mt-2 text-xs text-gray-500">
          Sends {formatDistanceToNow(scheduledAt, { addSuffix: true })}
        </p>
      )}
    </div>
  );
}
