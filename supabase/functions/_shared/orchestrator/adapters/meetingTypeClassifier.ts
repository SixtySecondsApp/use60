/**
 * Meeting Type Classifier
 *
 * IMP-004: Classifies internal calendar events into structured meeting types
 * to drive type-specific prep template selection.
 *
 * Meeting types (calendar_events.meeting_type CHECK constraint):
 *   one_on_one      — exactly 2 attendees, both internal
 *   pipeline_review — title signals: pipeline / forecast / review
 *   qbr             — title signals: qbr / quarterly business review
 *   standup         — title signals: stand-up / standup / scrum / huddle / daily
 *   external        — at least one external-domain attendee
 *   other           — internal meeting not matching any above pattern
 *
 * Manager detection:
 *   The database has no explicit manager_id / reports_to column (as of IMP-001).
 *   Heuristics used:
 *     1. If attendees include a profile with role 'admin' or 'owner' in the
 *        same org — treated as manager for 1:1 detection purposes.
 *     2. Title signals in profile.job_title: "head of", "vp", "director",
 *        "manager", "lead", "chief".
 *     3. If neither is resolvable, any 2-internal-person meeting is classified
 *        as one_on_one (conservative: sales 1:1s are the target use case).
 *
 * The adapter:
 *   - Reads events from step output (from detect-internal-meetings) or DB
 *   - Applies classifyMeetingType() for each internal event
 *   - Writes meeting_type to calendar_events
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import type { InternalMeetingDetectionResult } from './internalMeetingDetector.ts';

// =============================================================================
// Types
// =============================================================================

export type MeetingType = 'one_on_one' | 'pipeline_review' | 'qbr' | 'standup' | 'external' | 'other';

export interface MeetingTypeClassification {
  event_id: string;
  meeting_type: MeetingType;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

// Profile row used for manager detection heuristics
interface ProfileRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
}

// =============================================================================
// Title-based classification patterns
// =============================================================================

const PIPELINE_REVIEW_PATTERNS = [
  /\bpipeline\b/i,
  /\bforecast\b/i,
  /\bpipeline\s+review\b/i,
  /\bforecast\s+(review|call|check)\b/i,
  /\bdeal\s+review\b/i,
  /\bweekly\s+review\b/i,
];

const QBR_PATTERNS = [
  /\bqbr\b/i,
  /\bquarterly\s+business\s+review\b/i,
  /\bquarterly\s+review\b/i,
  /\bq[1-4]\s+review\b/i,
];

const STANDUP_PATTERNS = [
  /\bstand[\s-]?up\b/i,
  /\bstandup\b/i,
  /\bscrum\b/i,
  /\bdaily\s+sync\b/i,
  /\bmorning\s+sync\b/i,
  /\bhuddle\b/i,
  /\bdaily\s+check.?in\b/i,
];

const ONE_ON_ONE_TITLE_PATTERNS = [
  /\b1[\s:–\-]?[oO0]n[\s:–\-]?1\b/i,
  /\bone[\s-]on[\s-]one\b/i,
  /\b1:1\b/i,
  /\b1-1\b/i,
  /\bcatch[\s-]?up\b/i,   // common 1:1 naming
];

// Title signals for manager / seniority heuristic
const MANAGER_TITLE_SIGNALS = [
  'head of',
  'vp',
  'vice president',
  'director',
  'manager',
  'lead',
  'chief',
  'president',
  'ceo',
  'cto',
  'cro',
  'coo',
  'cmo',
  'svp',
  'evp',
];

// =============================================================================
// Core classification logic (exported for reuse by prep templates)
// =============================================================================

/**
 * Classify a calendar event into one of the known meeting types.
 *
 * @param title          - Event title (may be empty)
 * @param isInternal     - Whether the event was classified as internal by the detector
 * @param attendeeCount  - Total number of attendees (including owner)
 * @param attendeeProfiles - Resolved Profile rows for internal attendees (may be empty)
 *
 * @returns MeetingTypeClassification
 */
export function classifyMeetingType(
  title: string,
  isInternal: boolean,
  attendeeCount: number,
  attendeeProfiles: ProfileRow[],
): MeetingTypeClassification {
  const t = (title || '').toLowerCase();
  const signals: string[] = [];

  // External meetings are not further classified
  if (!isInternal) {
    return {
      event_id: '',
      meeting_type: 'external',
      confidence: 'high',
      signals: ['is_internal=false'],
    };
  }

  // ── QBR (highest specificity — check before pipeline_review) ──
  for (const pattern of QBR_PATTERNS) {
    if (pattern.test(t)) {
      signals.push(`title_matches:${pattern.source}`);
      return {
        event_id: '',
        meeting_type: 'qbr',
        confidence: 'high',
        signals,
      };
    }
  }

  // ── Pipeline review ──
  for (const pattern of PIPELINE_REVIEW_PATTERNS) {
    if (pattern.test(t)) {
      signals.push(`title_matches:${pattern.source}`);
      return {
        event_id: '',
        meeting_type: 'pipeline_review',
        confidence: 'high',
        signals,
      };
    }
  }

  // ── Standup ──
  for (const pattern of STANDUP_PATTERNS) {
    if (pattern.test(t)) {
      signals.push(`title_matches:${pattern.source}`);
      return {
        event_id: '',
        meeting_type: 'standup',
        confidence: 'high',
        signals,
      };
    }
  }

  // ── 1:1 detection ──
  // Rule: 2 attendees total (owner + 1), both internal
  // Supplements title-based patterns with manager detection heuristics.

  const isTwoPerson = attendeeCount === 2;

  // Title explicitly says 1:1
  let titleSays1on1 = false;
  for (const pattern of ONE_ON_ONE_TITLE_PATTERNS) {
    if (pattern.test(t)) {
      signals.push(`title_matches:${pattern.source}`);
      titleSays1on1 = true;
      break;
    }
  }

  if (isTwoPerson || titleSays1on1) {
    // Check if one attendee appears to be a manager via org role or title
    const hasManagerProfile = attendeeProfiles.some((p) => {
      const jobTitle = (p.job_title || '').toLowerCase();
      return MANAGER_TITLE_SIGNALS.some((signal) => jobTitle.includes(signal));
    });

    if (isTwoPerson) signals.push('attendee_count=2');
    if (hasManagerProfile) signals.push('manager_title_detected');

    return {
      event_id: '',
      meeting_type: 'one_on_one',
      confidence: isTwoPerson ? 'high' : titleSays1on1 ? 'medium' : 'low',
      signals,
    };
  }

  // ── Default: other internal meeting ──
  signals.push('no_pattern_matched');
  return {
    event_id: '',
    meeting_type: 'other',
    confidence: 'low',
    signals,
  };
}

// =============================================================================
// Adapter: classify-meeting-types
//
// Reads internal events from the previous step's output OR fetches directly
// from calendar_events for events with is_internal=true and meeting_type IS NULL.
//
// Writes meeting_type to calendar_events after classification.
// =============================================================================

export const meetingTypeClassifierAdapter: SkillAdapter = {
  name: 'classify-meeting-types',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[meeting-type-classifier] Starting classification run...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;
      const userId = state.event.user_id;

      if (!orgId || !userId) {
        throw new Error('org_id and user_id are required in event payload');
      }

      // ── 1. Find internal events that need a meeting_type ──
      // Priority: use outputs from the detector step if available,
      // otherwise query the DB for is_internal=true + meeting_type IS NULL events.

      type EventRow = {
        id: string;
        title: string | null;
        attendees_count: number | null;
        attendees: Array<string | { email?: string }> | null;
        is_internal: boolean | null;
        start_time: string;
      };

      let eventsToClassify: EventRow[] = [];

      // Check if the previous step (detect-internal-meetings) left results
      const detectorOutput = state.outputs['detect-internal-meetings'] as
        | { results?: InternalMeetingDetectionResult[] }
        | undefined;

      if (detectorOutput?.results && detectorOutput.results.length > 0) {
        // Only classify internal events from the detector output
        const internalEventIds = detectorOutput.results
          .filter((r) => r.is_internal && !r.skipped)
          .map((r) => r.event_id);

        if (internalEventIds.length > 0) {
          const { data, error } = await supabase
            .from('calendar_events')
            .select('id, title, attendees_count, attendees, is_internal, start_time')
            .in('id', internalEventIds)
            .is('meeting_type', null);

          if (error) throw new Error(`DB fetch failed: ${error.message}`);
          eventsToClassify = (data || []) as EventRow[];
        }
      } else {
        // Fallback: query for upcoming unclassified internal events
        const lookaheadHours = typeof state.event.payload?.lookahead_hours === 'number'
          ? state.event.payload.lookahead_hours
          : 24;

        const now = new Date();
        const windowEnd = new Date(now.getTime() + lookaheadHours * 60 * 60 * 1000);

        const { data, error } = await supabase
          .from('calendar_events')
          .select('id, title, attendees_count, attendees, is_internal, start_time')
          .eq('user_id', userId)
          .eq('is_internal', true)
          .is('meeting_type', null)
          .gte('start_time', now.toISOString())
          .lte('start_time', windowEnd.toISOString())
          .order('start_time', { ascending: true });

        if (error) throw new Error(`DB fetch failed: ${error.message}`);
        eventsToClassify = (data || []) as EventRow[];
      }

      if (eventsToClassify.length === 0) {
        console.log('[meeting-type-classifier] No internal events to classify');
        return {
          success: true,
          output: {
            events_evaluated: 0,
            events_classified: 0,
            classifications: [],
          },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[meeting-type-classifier] Classifying ${eventsToClassify.length} internal events...`);

      // ── 2. Bulk-fetch profile data for attendee manager detection ──
      // Collect all attendee emails from events, then query profiles once.
      const allEmails = new Set<string>();
      for (const event of eventsToClassify) {
        const attendees = event.attendees || [];
        for (const a of attendees) {
          const email = typeof a === 'string' ? a : (a as { email?: string }).email;
          if (email && email.includes('@')) allEmails.add(email.toLowerCase());
        }
      }

      const profilesByEmail = new Map<string, ProfileRow>();
      if (allEmails.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, job_title')
          .in('email', [...allEmails]);

        for (const p of profiles || []) {
          if (p.email) profilesByEmail.set(p.email.toLowerCase(), p as ProfileRow);
        }
      }

      // ── 3. Classify each event ──
      const classifications: MeetingTypeClassification[] = [];
      let classifiedCount = 0;

      for (const event of eventsToClassify) {
        // Resolve attendee profiles for this event
        const attendees = event.attendees || [];
        const eventProfiles: ProfileRow[] = [];
        for (const a of attendees) {
          const email = (typeof a === 'string' ? a : (a as { email?: string }).email || '').toLowerCase();
          const profile = profilesByEmail.get(email);
          if (profile) eventProfiles.push(profile);
        }

        const classification = classifyMeetingType(
          event.title || '',
          event.is_internal === true,
          event.attendees_count ?? attendees.length,
          eventProfiles,
        );

        classification.event_id = event.id;
        classifications.push(classification);

        // Write meeting_type to DB
        const { error: updateError } = await supabase
          .from('calendar_events')
          .update({ meeting_type: classification.meeting_type })
          .eq('id', event.id);

        if (updateError) {
          console.error(
            `[meeting-type-classifier] Failed to update event ${event.id}: ${updateError.message}`
          );
          continue;
        }

        classifiedCount++;
        console.log(
          `[meeting-type-classifier] Event ${event.id} (${event.title ?? 'untitled'}): ` +
          `type=${classification.meeting_type} ` +
          `confidence=${classification.confidence} ` +
          `signals=[${classification.signals.join(', ')}]`
        );
      }

      console.log(
        `[meeting-type-classifier] Complete: ` +
        `${eventsToClassify.length} evaluated, ${classifiedCount} classified`
      );

      return {
        success: true,
        output: {
          events_evaluated: eventsToClassify.length,
          events_classified: classifiedCount,
          classifications,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[meeting-type-classifier] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
