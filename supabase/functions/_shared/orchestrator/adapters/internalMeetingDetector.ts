/**
 * Internal Meeting Detector
 *
 * IMP-003: Classifies a calendar event as internal or external by comparing
 * attendee email domains against the organisation's own domain(s).
 *
 * Detection rules (in priority order):
 *   1. Events with attendees_count <= 1 are skipped (solo / focus blocks).
 *   2. The org domain is resolved from organizations.company_website (stripped
 *      to bare domain) or, as a fallback, from the user's own email domain.
 *   3. Every attendee email is compared to the org domain set. If ALL attendees
 *      share an org domain, the event is internal. If ANY attendee comes from
 *      an outside domain, the event is external.
 *   4. Domain aliases: a secondary alias set is built from all distinct domains
 *      present in the attendee list that the org admin has registered
 *      (future-proofing — not yet stored; hook is left for extension).
 *
 * The function writes is_internal back to calendar_events so subsequent
 * classifier steps can read it without repeating the lookup.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Types
// =============================================================================

export interface InternalMeetingDetectionResult {
  event_id: string;
  is_internal: boolean;
  org_domain: string;
  attendee_count: number;
  internal_attendees: string[];
  external_attendees: string[];
  skipped: boolean;
  skip_reason?: string;
}

// Shape of an attendee entry in calendar_events.attendees (JSONB)
type AttendeeEntry =
  | string                                         // plain email string
  | { email?: string; name?: string; [key: string]: unknown }; // object with email field

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract the bare domain from an email or website URL.
 *
 * Examples:
 *   "alice@example.com"       → "example.com"
 *   "https://www.example.com" → "example.com"
 *   "example.com"             → "example.com"
 */
function extractDomain(input: string): string {
  if (!input) return '';
  const lower = input.toLowerCase().trim();

  // If it looks like an email, take the part after @
  if (lower.includes('@')) {
    const parts = lower.split('@');
    return (parts[1] || '').replace(/\/.*$/, '').trim();
  }

  // Strip protocol and trailing path
  return lower
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();
}

/**
 * Extract all attendee email addresses from the JSONB attendees array.
 * Handles both plain string arrays and object arrays with an `email` key.
 */
function extractAttendeeEmails(attendees: AttendeeEntry[]): string[] {
  const emails: string[] = [];

  for (const entry of attendees) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.includes('@')) emails.push(trimmed.toLowerCase());
    } else if (typeof entry === 'object' && entry !== null) {
      const email = (entry as { email?: string }).email;
      if (email && typeof email === 'string' && email.includes('@')) {
        emails.push(email.trim().toLowerCase());
      }
    }
  }

  return emails;
}

// =============================================================================
// Core detection logic (exported for reuse by classifier)
// =============================================================================

/**
 * Resolve the organisation's primary domain and classify attendees.
 *
 * @param supabase  - Service-role Supabase client
 * @param event     - The calendar event row (must include id, user_id, attendees, attendees_count)
 * @param orgId     - The org's UUID string
 *
 * @returns Detection result with is_internal, internal/external attendee lists
 */
export async function detectInternalMeeting(
  supabase: ReturnType<typeof getServiceClient>,
  event: {
    id: string;
    user_id: string;
    attendees: AttendeeEntry[] | null;
    attendees_count: number | null;
  },
  orgId: string,
): Promise<InternalMeetingDetectionResult> {
  const attendeeCount = event.attendees_count ?? 0;

  // 1. Skip solo events — they are not meetings
  if (attendeeCount <= 1) {
    return {
      event_id: event.id,
      is_internal: false,
      org_domain: '',
      attendee_count: attendeeCount,
      internal_attendees: [],
      external_attendees: [],
      skipped: true,
      skip_reason: 'attendees_count <= 1',
    };
  }

  // 2. Resolve org domain
  //    Primary: organizations.company_website stripped to bare domain
  //    Fallback: auth.users email domain for the event owner
  let orgDomain = '';

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('company_website')
    .eq('id', orgId)
    .maybeSingle();

  if (orgRow?.company_website) {
    orgDomain = extractDomain(orgRow.company_website);
  }

  if (!orgDomain) {
    // Fallback to user's own email domain
    const { data: userRow } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', event.user_id)
      .maybeSingle();

    if (userRow?.email) {
      orgDomain = extractDomain(userRow.email);
    }
  }

  if (!orgDomain) {
    // Cannot determine org domain — treat as external to be conservative
    return {
      event_id: event.id,
      is_internal: false,
      org_domain: '',
      attendee_count: attendeeCount,
      internal_attendees: [],
      external_attendees: [],
      skipped: true,
      skip_reason: 'org_domain_unresolvable',
    };
  }

  // 3. Classify each attendee
  const rawAttendees: AttendeeEntry[] = Array.isArray(event.attendees) ? event.attendees : [];
  const attendeeEmails = extractAttendeeEmails(rawAttendees);

  const internalAttendees: string[] = [];
  const externalAttendees: string[] = [];

  for (const email of attendeeEmails) {
    const domain = extractDomain(email);
    if (domain === orgDomain) {
      internalAttendees.push(email);
    } else {
      externalAttendees.push(email);
    }
  }

  // 4. Decision: internal only if ALL resolvable attendees are on the org domain
  //    (and there is at least one internal attendee so we don't treat an empty
  //    attendee list as "all internal by default")
  const isInternal =
    attendeeEmails.length > 0 &&
    externalAttendees.length === 0;

  return {
    event_id: event.id,
    is_internal: isInternal,
    org_domain: orgDomain,
    attendee_count: attendeeCount,
    internal_attendees: internalAttendees,
    external_attendees: externalAttendees,
    skipped: false,
  };
}

// =============================================================================
// Adapter: detect-internal-meetings
//
// Reads upcoming events from calendar_events (where is_internal IS NULL),
// applies the domain detector, and writes results back.
//
// Expected event payload:
//   { user_id, org_id, lookahead_hours? (default 24) }
// =============================================================================

export const internalMeetingDetectorAdapter: SkillAdapter = {
  name: 'detect-internal-meetings',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[internal-meeting-detector] Starting detection run...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;
      const userId = state.event.user_id;

      if (!orgId || !userId) {
        throw new Error('org_id and user_id are required in event payload');
      }

      const lookaheadHours = typeof state.event.payload?.lookahead_hours === 'number'
        ? state.event.payload.lookahead_hours
        : 24;

      const now = new Date();
      const windowEnd = new Date(now.getTime() + lookaheadHours * 60 * 60 * 1000);

      // Fetch unclassified upcoming events for this user
      // (is_internal IS NULL means not yet classified)
      const { data: events, error: fetchError } = await supabase
        .from('calendar_events')
        .select('id, user_id, title, attendees, attendees_count, start_time')
        .eq('user_id', userId)
        .is('is_internal', null)
        .gte('start_time', now.toISOString())
        .lte('start_time', windowEnd.toISOString())
        .order('start_time', { ascending: true });

      if (fetchError) {
        throw new Error(`Failed to fetch calendar events: ${fetchError.message}`);
      }

      if (!events || events.length === 0) {
        console.log('[internal-meeting-detector] No unclassified upcoming events found');
        return {
          success: true,
          output: {
            events_evaluated: 0,
            events_classified: 0,
            events_skipped: 0,
            results: [],
          },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[internal-meeting-detector] Evaluating ${events.length} events...`);

      const results: InternalMeetingDetectionResult[] = [];
      let classifiedCount = 0;
      let skippedCount = 0;

      for (const event of events) {
        const result = await detectInternalMeeting(supabase, event, orgId);
        results.push(result);

        if (result.skipped) {
          skippedCount++;
          console.log(
            `[internal-meeting-detector] Skipped event ${event.id}: ${result.skip_reason}`
          );
          continue;
        }

        // Write is_internal back to calendar_events
        const { error: updateError } = await supabase
          .from('calendar_events')
          .update({ is_internal: result.is_internal })
          .eq('id', event.id);

        if (updateError) {
          console.error(
            `[internal-meeting-detector] Failed to update event ${event.id}: ${updateError.message}`
          );
          // Non-fatal — continue to next event
          continue;
        }

        classifiedCount++;
        console.log(
          `[internal-meeting-detector] Event ${event.id} (${(event as Record<string, unknown>).title ?? 'untitled'}): ` +
          `is_internal=${result.is_internal} ` +
          `(${result.internal_attendees.length} internal, ${result.external_attendees.length} external)`
        );
      }

      console.log(
        `[internal-meeting-detector] Complete: ` +
        `${events.length} evaluated, ${classifiedCount} classified, ${skippedCount} skipped`
      );

      return {
        success: true,
        output: {
          events_evaluated: events.length,
          events_classified: classifiedCount,
          events_skipped: skippedCount,
          org_domain: results[0]?.org_domain ?? '',
          results,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[internal-meeting-detector] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
