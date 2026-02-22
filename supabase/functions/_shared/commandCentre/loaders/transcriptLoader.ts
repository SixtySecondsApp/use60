/**
 * Transcript Context Loader
 *
 * Loads recent meeting transcripts linked to a deal or contact for Command
 * Centre enrichment. Used by cc-enrich to populate enrichment_context.transcript.
 *
 * Column notes (critical):
 *   - meetings: owner_user_id  (NOT user_id or owner_id)
 *   - meeting_contacts: meeting_id, contact_id (junction table)
 *   - Transcripts live in meetings.transcript_text (full text)
 *   - No meeting_transcript_chunks table exists; use meetings.transcript_text
 *
 * We link meetings to a deal via meetings.contact_id / primary_contact_id when
 * no direct deal FK exists (deals has a primary_contact_id that can be matched).
 *
 * Story: CC10-002
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeetingSummary {
  id: string;
  title: string | null;
  meeting_start: string | null;
  meeting_end: string | null;
  duration_minutes: number | null;
  owner_user_id: string | null;
  summary: string | null;
  summary_oneliner: string | null;
  next_steps_oneliner: string | null;
  sentiment_score: number | null;
  /** Truncated to 2,000 chars to keep enrichment_context lean */
  transcript_snippet: string | null;
  attendees: AttendeeRef[];
}

export interface AttendeeRef {
  contact_id: string;
  is_primary: boolean;
  role: string | null;
}

export interface TranscriptEnrichment {
  meetings: MeetingSummary[];
  total_found: number;
}

// Truncate long transcripts so enrichment_context rows stay manageable
const TRANSCRIPT_SNIPPET_LIMIT = 2000;

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/**
 * Load recent transcript context for a command centre item.
 *
 * Looks up meetings linked to the deal (via deal.primary_contact_id) or directly
 * to the contact (via meeting_contacts junction). Returns the last 3 meetings
 * that have a non-empty transcript.
 *
 * @param supabase  Service-role client (passed from cc-enrich orchestrator)
 * @param dealId    Optional deal UUID from command_centre_items.deal_id
 * @param contactId Optional contact UUID from command_centre_items.contact_id
 */
export async function loadTranscriptContext(
  supabase: ReturnType<typeof createClient>,
  dealId?: string | null,
  contactId?: string | null,
): Promise<TranscriptEnrichment> {
  const result: TranscriptEnrichment = { meetings: [], total_found: 0 };

  // Resolve the contact ID to use for meeting lookup
  const resolvedContactId = await resolveContactId(supabase, dealId, contactId);

  if (!resolvedContactId) {
    console.log('[cc-loader:transcript] No contact ID resolvable from deal or contact', { dealId, contactId });
    return result;
  }

  try {
    // Get meeting IDs linked to this contact via meeting_contacts junction
    const { data: junctionRows, error: junctionError } = await supabase
      .from('meeting_contacts')
      .select('meeting_id, is_primary, role')
      .eq('contact_id', resolvedContactId)
      .limit(20); // fetch more than we need; filter down after

    if (junctionError) {
      console.error('[cc-loader:transcript] junction query error:', junctionError.message, { resolvedContactId });
      return result;
    }

    if (!junctionRows || junctionRows.length === 0) {
      console.log('[cc-loader:transcript] No meetings found for contact', { resolvedContactId });
      return result;
    }

    const meetingIds = junctionRows.map((r: { meeting_id: string }) => r.meeting_id);

    // Build a lookup of attendee role info keyed by meeting_id
    const attendeeMap = new Map<string, AttendeeRef[]>();
    for (const row of junctionRows) {
      const list = attendeeMap.get(row.meeting_id) ?? [];
      list.push({
        contact_id: resolvedContactId,
        is_primary: row.is_primary ?? false,
        role: row.role ?? null,
      });
      attendeeMap.set(row.meeting_id, list);
    }

    // Fetch meetings with transcript, ordered by most recent first
    const { data: meetings, error: meetingError } = await supabase
      .from('meetings')
      .select(
        `id,
         title,
         meeting_start,
         meeting_end,
         duration_minutes,
         owner_user_id,
         summary,
         summary_oneliner,
         next_steps_oneliner,
         sentiment_score,
         transcript_text`,
      )
      .in('id', meetingIds)
      .not('transcript_text', 'is', null)
      .order('meeting_start', { ascending: false })
      .limit(3);

    if (meetingError) {
      console.error('[cc-loader:transcript] meetings query error:', meetingError.message, { meetingIds });
      return result;
    }

    result.total_found = meetings?.length ?? 0;

    result.meetings = (meetings ?? []).map((m) => {
      const transcript: string | null = m.transcript_text ?? null;
      const snippet = transcript
        ? transcript.slice(0, TRANSCRIPT_SNIPPET_LIMIT)
        : null;

      return {
        id: m.id,
        title: m.title ?? null,
        meeting_start: m.meeting_start ?? null,
        meeting_end: m.meeting_end ?? null,
        duration_minutes: m.duration_minutes ?? null,
        owner_user_id: m.owner_user_id ?? null,
        summary: m.summary ?? null,
        summary_oneliner: m.summary_oneliner ?? null,
        next_steps_oneliner: m.next_steps_oneliner ?? null,
        sentiment_score: m.sentiment_score ?? null,
        transcript_snippet: snippet,
        attendees: attendeeMap.get(m.id) ?? [],
      };
    });

    console.log('[cc-loader:transcript] loaded', result.meetings.length, 'meetings', { resolvedContactId, dealId });
  } catch (err) {
    console.error('[cc-loader:transcript] unexpected error:', String(err), { dealId, contactId });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the most relevant contact ID to drive meeting lookup.
 *
 * Priority:
 *   1. contactId if provided directly
 *   2. deal.primary_contact_id if dealId is provided
 *   3. deals.contact_id (legacy fallback) if primary_contact_id is null
 */
async function resolveContactId(
  supabase: ReturnType<typeof createClient>,
  dealId?: string | null,
  contactId?: string | null,
): Promise<string | null> {
  if (contactId) return contactId;

  if (!dealId) return null;

  try {
    const { data, error } = await supabase
      .from('deals')
      .select('primary_contact_id, contact_id')
      .eq('id', dealId)
      .maybeSingle();

    if (error) {
      console.error('[cc-loader:transcript] resolveContactId deal query error:', error.message, { dealId });
      return null;
    }

    return (data?.primary_contact_id ?? data?.contact_id) ?? null;
  } catch (err) {
    console.error('[cc-loader:transcript] resolveContactId unexpected error:', String(err), { dealId });
    return null;
  }
}
