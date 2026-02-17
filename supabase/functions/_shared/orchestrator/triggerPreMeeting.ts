/**
 * Shared helper: triggerPreMeetingIfSoon()
 *
 * Fires a `pre_meeting_90min` event to the agent-orchestrator if a calendar
 * event is within the next 4 hours, has 2+ attendees, and hasn't already
 * been triggered (idempotency key: `pre_meeting:{meeting_id}`).
 *
 * Fire-and-forget — errors are logged but never thrown.
 */

interface PreMeetingEvent {
  start_time: string;
  user_id: string;
  org_id: string | null;
  meeting_id: string;
  title: string;
  attendees?: unknown[] | null;
  attendees_count: number;
  meeting_url?: string | null;
}

/** Window in ms — 4 hours (wider than the cron's 2h to catch same-day bookings) */
const PRE_MEETING_WINDOW_MS = 4 * 60 * 60 * 1000;

/** Minimum lead time — don't trigger for meetings starting in <15 min */
const MIN_LEAD_TIME_MS = 15 * 60 * 1000;

/**
 * If the meeting qualifies, POST to agent-orchestrator with the
 * `pre_meeting_90min` event type. Uses an idempotency key so
 * duplicate calls (cron + webhook) are safely deduplicated.
 */
export async function triggerPreMeetingIfSoon(
  event: PreMeetingEvent,
): Promise<void> {
  try {
    // Gate: must have org_id
    if (!event.org_id) return;

    // Gate: must have 2+ attendees
    if (event.attendees_count < 2) return;

    // Gate: must be within the lookahead window
    const now = Date.now();
    const startMs = new Date(event.start_time).getTime();
    const delta = startMs - now;

    if (delta < MIN_LEAD_TIME_MS || delta > PRE_MEETING_WINDOW_MS) return;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      console.warn('[triggerPreMeeting] Missing SUPABASE_URL or SERVICE_ROLE_KEY');
      return;
    }

    await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'pre_meeting_90min',
        source: 'webhook:calendar-sync',
        org_id: event.org_id,
        user_id: event.user_id,
        payload: {
          meeting_id: event.meeting_id,
          title: event.title,
          start_time: event.start_time,
          attendees: event.attendees,
        },
        idempotency_key: `pre_meeting:${event.meeting_id}`,
      }),
    });

    console.log(`[triggerPreMeeting] Fired pre_meeting_90min for "${event.title}" (${event.meeting_id})`);
  } catch (err) {
    // Fire-and-forget — never let this break the caller
    console.error('[triggerPreMeeting] Error (non-fatal):', err);
  }
}
