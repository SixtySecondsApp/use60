/**
 * History Detector — FU-002
 *
 * Classifies whether an incoming meeting is a first-time or return meeting
 * for a given company within an org. This drives tone and framing in
 * follow-up generation: first meetings get introductory framing; return
 * meetings reference prior context and commitments.
 *
 * Logic:
 *   - Queries meetings with matching company_id AND org_id
 *   - Excludes the current meeting (meetingId)
 *   - Only counts meetings that have a transcript (transcript_text is not null)
 *   - Orders by created_at desc to surface the most recent prior meeting date
 *   - Returns zero-safe defaults when no prior meetings exist
 */

// ============================================================================
// Types
// ============================================================================

export interface MeetingHistory {
  /** True when no prior transcribed meetings exist for this company in this org */
  isFirstMeeting: boolean;
  /** Count of prior meetings with a transcript for this company + org */
  priorMeetingCount: number;
  /** ISO date string of the most recent prior meeting, or null if none */
  lastMeetingDate: string | null;
  /** Sum of duration_minutes across all prior transcribed meetings, if available */
  totalMeetingDuration?: number;
}

// ============================================================================
// Row shape returned from Supabase (explicit column selection)
// ============================================================================

interface MeetingRow {
  id: string;
  created_at: string;
  duration_minutes: number | null;
}

// ============================================================================
// Main export
// ============================================================================

/**
 * Detect whether a meeting is the first or a return engagement with a company.
 *
 * @param supabase   - Supabase client (already instantiated by the caller).
 * @param meetingId  - UUID of the current meeting to exclude from the count.
 * @param companyId  - UUID of the company to scope the history query.
 * @param orgId      - UUID of the organisation (tenant) to scope the query.
 * @returns          - MeetingHistory classification; never throws.
 */
export async function detectMeetingHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  meetingId: string,
  companyId: string | null,
  orgId: string,
): Promise<MeetingHistory> {
  const empty: MeetingHistory = {
    isFirstMeeting: true,
    priorMeetingCount: 0,
    lastMeetingDate: null,
  };

  // Guard: no company_id means we cannot scope to a company — treat as first meeting
  if (!companyId) {
    console.log(
      `[historyDetector] meetingId=${meetingId} has no company_id — treating as first meeting`,
    );
    return empty;
  }

  try {
    const { data: rows, error } = await supabase
      .from('meetings')
      .select('id, created_at, duration_minutes')
      .eq('company_id', companyId)
      .eq('org_id', orgId)
      .neq('id', meetingId)
      .not('transcript_text', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(
        `[historyDetector] query error for meetingId=${meetingId}:`,
        error.message,
      );
      return empty;
    }

    // Zero results — no prior transcribed meetings found
    if (!rows || rows.length === 0) {
      console.log(
        `[historyDetector] meetingId=${meetingId} company=${companyId} — first meeting`,
      );
      return empty;
    }

    const meetings = rows as MeetingRow[];
    const priorMeetingCount = meetings.length;

    // Most recent prior meeting is first in the desc-ordered array
    const lastMeetingDate = meetings[0].created_at ?? null;

    // Sum durations where present; undefined if no meeting had a duration set
    const durationsPresent = meetings.filter(
      (m) => m.duration_minutes != null,
    );
    const totalMeetingDuration =
      durationsPresent.length > 0
        ? durationsPresent.reduce(
            (sum, m) => sum + (m.duration_minutes as number),
            0,
          )
        : undefined;

    console.log(
      `[historyDetector] meetingId=${meetingId} company=${companyId} priorCount=${priorMeetingCount} lastDate=${lastMeetingDate}`,
    );

    return {
      isFirstMeeting: false,
      priorMeetingCount,
      lastMeetingDate,
      ...(totalMeetingDuration !== undefined ? { totalMeetingDuration } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[historyDetector] unexpected error for meetingId=${meetingId}:`,
      message,
    );
    return empty;
  }
}
