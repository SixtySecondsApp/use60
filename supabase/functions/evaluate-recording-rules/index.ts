/**
 * Evaluate Recording Rules Edge Function
 *
 * Evaluates calendar events against recording rules to determine
 * if a meeting should be automatically recorded.
 *
 * Endpoint: POST /functions/v1/evaluate-recording-rules
 *
 * @see supabase/migrations/20260104100000_meetingbaas_core_tables.sql
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { corsHeaders, handleCorsPreflightWithResponse } from '../_shared/corsHelper.ts';
import {
  detectMeetingPlatform,
  isValidMeetingUrl,
  extractDomain,
  isInternalEmail,
  hasExternalAttendees,
} from '../_shared/meetingbaas.ts';

// =============================================================================
// Types
// =============================================================================

interface CalendarEvent {
  id: string;
  external_id: string;
  title: string;
  meeting_url: string | null;
  start_time: string;
  end_time: string;
  attendees: CalendarAttendee[];
  organizer_email?: string;
}

interface CalendarAttendee {
  email: string;
  name?: string;
  response_status?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer?: boolean;
}

interface RecordingRule {
  id: string;
  org_id: string;
  user_id: string | null;
  name: string;
  is_active: boolean;
  priority: number;
  domain_mode: 'external_only' | 'internal_only' | 'specific_domains' | 'all';
  specific_domains: string[] | null;
  internal_domain: string | null;
  min_attendee_count: number;
  max_attendee_count: number | null;
  title_keywords: string[] | null;
  title_keywords_exclude: string[] | null;
}

interface RuleEvaluationResult {
  shouldRecord: boolean;
  matchedRule: RecordingRule | null;
  reasons: string[];
}

interface EvaluateRequest {
  org_id: string;
  user_id: string;
  event: CalendarEvent;
}

interface EvaluateBatchRequest {
  org_id: string;
  user_id: string;
  events: CalendarEvent[];
}

interface BatchEvaluationResult {
  eventId: string;
  evaluation: RuleEvaluationResult;
  platform: string | null;
}

// =============================================================================
// Rules Evaluation Engine
// =============================================================================

/**
 * Evaluate a single rule against a calendar event
 */
function evaluateSingleRule(
  rule: RecordingRule,
  event: CalendarEvent,
  internalDomain: string | null
): { matches: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Check title exclusions first (these override everything)
  if (rule.title_keywords_exclude && rule.title_keywords_exclude.length > 0) {
    const titleLower = event.title.toLowerCase();
    for (const keyword of rule.title_keywords_exclude) {
      if (titleLower.includes(keyword.toLowerCase())) {
        return {
          matches: false,
          reasons: [`Title contains excluded keyword: "${keyword}"`],
        };
      }
    }
  }

  // Check attendee count
  const attendeeCount = event.attendees.length;
  if (attendeeCount < rule.min_attendee_count) {
    return {
      matches: false,
      reasons: [`Attendee count (${attendeeCount}) below minimum (${rule.min_attendee_count})`],
    };
  }
  if (rule.max_attendee_count !== null && attendeeCount > rule.max_attendee_count) {
    return {
      matches: false,
      reasons: [`Attendee count (${attendeeCount}) above maximum (${rule.max_attendee_count})`],
    };
  }
  reasons.push(`Attendee count (${attendeeCount}) within range`);

  // Determine internal domain to use (rule-specific or org default)
  const effectiveInternalDomain = rule.internal_domain || internalDomain;

  // Check domain rules
  if (rule.domain_mode !== 'all' && effectiveInternalDomain) {
    const attendeeEmails = event.attendees.map((a) => a.email);
    const externalAttendees = attendeeEmails.filter(
      (email) => !isInternalEmail(email, effectiveInternalDomain)
    );
    const hasExternal = externalAttendees.length > 0;

    switch (rule.domain_mode) {
      case 'external_only':
        if (!hasExternal) {
          return {
            matches: false,
            reasons: ['No external attendees (internal meeting only)'],
          };
        }
        reasons.push(`Has ${externalAttendees.length} external attendee(s)`);
        break;

      case 'internal_only':
        if (hasExternal) {
          return {
            matches: false,
            reasons: [`Has external attendees: ${externalAttendees.slice(0, 3).join(', ')}`],
          };
        }
        reasons.push('Internal meeting only');
        break;

      case 'specific_domains':
        if (rule.specific_domains && rule.specific_domains.length > 0) {
          const matchesDomain = externalAttendees.some((email) => {
            const domain = extractDomain(email);
            return domain && rule.specific_domains!.some(
              (d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`)
            );
          });
          if (!matchesDomain) {
            return {
              matches: false,
              reasons: [`No attendees from specified domains: ${rule.specific_domains.join(', ')}`],
            };
          }
          reasons.push('Has attendees from target domains');
        }
        break;
    }
  }

  // Check title keywords (if specified, at least one must match)
  if (rule.title_keywords && rule.title_keywords.length > 0) {
    const titleLower = event.title.toLowerCase();
    const matchedKeyword = rule.title_keywords.find((keyword) =>
      titleLower.includes(keyword.toLowerCase())
    );
    if (!matchedKeyword) {
      return {
        matches: false,
        reasons: ['Title does not contain required keywords'],
      };
    }
    reasons.push(`Title matches keyword: "${matchedKeyword}"`);
  }

  return { matches: true, reasons };
}

/**
 * Evaluate all recording rules for a calendar event
 */
async function evaluateRecordingRules(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  event: CalendarEvent
): Promise<RuleEvaluationResult> {
  // Get org's internal domain
  const { data: org } = await supabase
    .from('organizations')
    .select('company_domain')
    .eq('id', orgId)
    .single();

  const internalDomain = org?.company_domain || null;

  // Get active rules for this org/user, ordered by priority (higher first)
  const { data: rules, error } = await supabase
    .from('recording_rules')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order('priority', { ascending: false });

  if (error) {
    console.error('[EvaluateRules] Error fetching rules:', error);
    return {
      shouldRecord: false,
      matchedRule: null,
      reasons: ['Error fetching recording rules'],
    };
  }

  if (!rules || rules.length === 0) {
    return {
      shouldRecord: false,
      matchedRule: null,
      reasons: ['No active recording rules configured'],
    };
  }

  // Evaluate each rule in priority order
  for (const rule of rules) {
    const result = evaluateSingleRule(rule, event, internalDomain);
    if (result.matches) {
      return {
        shouldRecord: true,
        matchedRule: rule,
        reasons: [`Rule "${rule.name}" matched: ${result.reasons.join(', ')}`],
      };
    }
  }

  return {
    shouldRecord: false,
    matchedRule: null,
    reasons: ['No rules matched this meeting'],
  };
}

/**
 * Check if a bot is already scheduled for this event
 */
async function isAlreadyScheduled(
  supabase: SupabaseClient,
  orgId: string,
  calendarEventId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('recordings')
    .select('id')
    .eq('org_id', orgId)
    .eq('calendar_event_id', calendarEventId)
    .maybeSingle();

  return !!data;
}

// =============================================================================
// Request Handlers
// =============================================================================

/**
 * Evaluate a single calendar event
 */
async function handleSingleEvaluation(
  supabase: SupabaseClient,
  request: EvaluateRequest
): Promise<Response> {
  const { org_id, user_id, event } = request;

  // Validate meeting URL
  if (!event.meeting_url) {
    return new Response(
      JSON.stringify({
        shouldRecord: false,
        matchedRule: null,
        reasons: ['No meeting URL'],
        platform: null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!isValidMeetingUrl(event.meeting_url)) {
    return new Response(
      JSON.stringify({
        shouldRecord: false,
        matchedRule: null,
        reasons: ['Unsupported meeting platform'],
        platform: null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const platform = detectMeetingPlatform(event.meeting_url);

  // Check if already scheduled
  if (await isAlreadyScheduled(supabase, org_id, event.id)) {
    return new Response(
      JSON.stringify({
        shouldRecord: false,
        matchedRule: null,
        reasons: ['Recording already scheduled for this event'],
        platform,
        alreadyScheduled: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Evaluate rules
  const evaluation = await evaluateRecordingRules(supabase, org_id, user_id, event);

  return new Response(
    JSON.stringify({
      ...evaluation,
      platform,
      eventId: event.id,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Evaluate multiple calendar events (batch)
 */
async function handleBatchEvaluation(
  supabase: SupabaseClient,
  request: EvaluateBatchRequest
): Promise<Response> {
  const { org_id, user_id, events } = request;
  const results: BatchEvaluationResult[] = [];

  for (const event of events) {
    // Skip events without meeting URLs
    if (!event.meeting_url) {
      results.push({
        eventId: event.id,
        evaluation: {
          shouldRecord: false,
          matchedRule: null,
          reasons: ['No meeting URL'],
        },
        platform: null,
      });
      continue;
    }

    // Skip unsupported platforms
    if (!isValidMeetingUrl(event.meeting_url)) {
      results.push({
        eventId: event.id,
        evaluation: {
          shouldRecord: false,
          matchedRule: null,
          reasons: ['Unsupported meeting platform'],
        },
        platform: null,
      });
      continue;
    }

    const platform = detectMeetingPlatform(event.meeting_url);

    // Skip if already scheduled
    if (await isAlreadyScheduled(supabase, org_id, event.id)) {
      results.push({
        eventId: event.id,
        evaluation: {
          shouldRecord: false,
          matchedRule: null,
          reasons: ['Recording already scheduled'],
        },
        platform,
      });
      continue;
    }

    // Evaluate rules
    const evaluation = await evaluateRecordingRules(supabase, org_id, user_id, event);
    results.push({
      eventId: event.id,
      evaluation,
      platform,
    });
  }

  // Summary stats
  const toRecord = results.filter((r) => r.evaluation.shouldRecord);
  const skipped = results.filter((r) => !r.evaluation.shouldRecord);

  return new Response(
    JSON.stringify({
      results,
      summary: {
        total: results.length,
        toRecord: toRecord.length,
        skipped: skipped.length,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightWithResponse();
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client with user's JWT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const body = await req.json();

    // Check if batch or single evaluation
    if ('events' in body && Array.isArray(body.events)) {
      return await handleBatchEvaluation(supabase, body as EvaluateBatchRequest);
    } else if ('event' in body) {
      return await handleSingleEvaluation(supabase, body as EvaluateRequest);
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid request. Provide either "event" or "events"' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('[EvaluateRules] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
