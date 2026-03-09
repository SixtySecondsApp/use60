/**
 * Handler: calendar_events
 * Extracted from process-calendar-events/index.ts
 *
 * Processes calendar events to automatically schedule recordings based on rules.
 * Called by calendar sync jobs to evaluate upcoming meetings.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { corsHeaders } from '../../_shared/corsHelper.ts';
import {
  createMeetingBaaSClient,
  detectMeetingPlatform,
  isValidMeetingUrl,
  formatEntryMessage,
  checkRecordingQuota,
  getPlatformDefaultBotImage,
  extractDomain,
  isInternalEmail,
  DEFAULT_BOT_NAME,
  DEFAULT_BOT_IMAGE,
  DEFAULT_ENTRY_MESSAGE,
  type MeetingBaaSBotConfig,
  type RecordingSettings,
} from '../../_shared/meetingbaas.ts';

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

interface ProcessEventsRequest {
  org_id: string;
  user_id: string;
  events: CalendarEvent[];
  dry_run?: boolean; // If true, only evaluate rules without deploying bots
}

interface EventProcessingResult {
  event_id: string;
  external_id: string;
  title: string;
  should_record: boolean;
  matched_rule?: string;
  reasons: string[];
  recording_id?: string;
  bot_id?: string;
  error?: string;
  already_scheduled?: boolean;
}

interface ProcessEventsResponse {
  success: boolean;
  results: EventProcessingResult[];
  summary: {
    total: number;
    scheduled: number;
    skipped: number;
    errors: number;
    already_scheduled: number;
  };
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

  // Determine internal domain to use
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
): Promise<{ shouldRecord: boolean; matchedRule: RecordingRule | null; reasons: string[] }> {
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
    console.error('[ProcessEvents] Error fetching rules:', error);
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
 * Check if a recording is already scheduled for this event
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

/**
 * Deploy a recording bot for an event
 */
async function deployBotForEvent(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  event: CalendarEvent
): Promise<{ success: boolean; recordingId?: string; botId?: string; error?: string }> {
  // Get recording settings
  const { data: org } = await supabase
    .from('organizations')
    .select('recording_settings, name')
    .eq('id', orgId)
    .single();

  const settings: RecordingSettings | null = org?.recording_settings;
  const orgName = org?.name;

  if (!settings?.webhook_token) {
    return { success: false, error: 'Recording not configured' };
  }

  // Get bot image URL: org override > platform default > code fallback
  const platformDefaultBotImage = await getPlatformDefaultBotImage(supabase);
  const botImageUrl = settings.bot_image_url || platformDefaultBotImage || DEFAULT_BOT_IMAGE;

  const botName = settings.bot_name || DEFAULT_BOT_NAME;

  // Get user profile for entry message
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single();

  // Format entry message
  let entryMessage: string | undefined;
  if (settings.entry_message_enabled) {
    const messageTemplate = settings.entry_message || DEFAULT_ENTRY_MESSAGE;
    entryMessage = formatEntryMessage(messageTemplate, {
      rep_name: profile?.full_name || 'your rep',
      company_name: orgName || undefined,
      meeting_title: event.title || undefined,
    });
  }

  // Detect platform
  const platform = detectMeetingPlatform(event.meeting_url!);
  if (!platform) {
    return { success: false, error: 'Unsupported meeting platform' };
  }

  // Create recording record
  const { data: recording, error: recordingError } = await supabase
    .from('recordings')
    .insert({
      org_id: orgId,
      user_id: userId,
      meeting_platform: platform,
      meeting_url: event.meeting_url,
      meeting_title: event.title || null,
      calendar_event_id: event.id,
      status: 'pending',
    })
    .select('id')
    .single();

  if (recordingError) {
    console.error('[ProcessEvents] Failed to create recording:', recordingError);
    return { success: false, error: 'Failed to create recording' };
  }

  // Build webhook URL
  const baseUrl = Deno.env.get('SUPABASE_URL');
  const webhookUrl = `${baseUrl}/functions/v1/meetingbaas-webhook?org_id=${orgId}&token=${settings.webhook_token}`;

  // Build bot configuration
  const botConfig: MeetingBaaSBotConfig = {
    meeting_url: event.meeting_url!,
    bot_name: botName,
    bot_image: botImageUrl || undefined,
    entry_message: entryMessage,
    recording_mode: 'speaker_view',
    webhook_url: webhookUrl,
    deduplication_key: recording.id,
    reserved: true, // Scheduled meeting
  };

  // Deploy bot
  let meetingBaaSClient;
  try {
    meetingBaaSClient = createMeetingBaaSClient();
  } catch (error) {
    await supabase.from('recordings').delete().eq('id', recording.id);
    return { success: false, error: 'Recording service not configured' };
  }

  const { data: botResponse, error: botError } = await meetingBaaSClient.deployBot(botConfig);

  if (botError || !botResponse) {
    await supabase
      .from('recordings')
      .update({
        status: 'failed',
        error_message: botError?.message || 'Failed to deploy bot',
      })
      .eq('id', recording.id);
    return { success: false, error: botError?.message || 'Failed to deploy bot' };
  }

  // Update recording with bot ID
  await supabase
    .from('recordings')
    .update({
      bot_id: botResponse.id,
      status: 'bot_joining',
    })
    .eq('id', recording.id);

  // Create bot deployment record
  await supabase.from('bot_deployments').insert({
    org_id: orgId,
    recording_id: recording.id,
    bot_id: botResponse.id,
    status: 'scheduled',
    status_history: [{ status: 'scheduled', timestamp: new Date().toISOString() }],
    meeting_url: event.meeting_url,
    scheduled_join_time: event.start_time,
    bot_name: botName,
    bot_image_url: botImageUrl,
    entry_message: entryMessage || null,
  });

  // Increment usage count
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const { data: existing } = await supabase
    .from('recording_usage')
    .select('id, recordings_count')
    .eq('org_id', orgId)
    .eq('period_start', periodStart.toISOString().split('T')[0])
    .maybeSingle();

  if (existing) {
    await supabase
      .from('recording_usage')
      .update({ recordings_count: existing.recordings_count + 1 })
      .eq('id', existing.id);
  } else {
    const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
    await supabase.from('recording_usage').insert({
      org_id: orgId,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      recordings_count: 1,
      recordings_limit: 20,
    });
  }

  return { success: true, recordingId: recording.id, botId: botResponse.id };
}

// =============================================================================
// Exported Handler
// =============================================================================

export async function handleCalendarEvents(req: Request): Promise<Response> {
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

    const body: ProcessEventsRequest = await req.json();
    const { org_id, user_id, events, dry_run = false } = body;

    if (!org_id || !user_id || !events || !Array.isArray(events)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request. Required: org_id, user_id, events[]' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check quota once for all events
    const quota = await checkRecordingQuota(supabase, org_id);
    let remainingQuota = quota.remaining;

    const results: EventProcessingResult[] = [];
    let scheduled = 0;
    let skipped = 0;
    let errors = 0;
    let alreadyScheduled = 0;

    for (const event of events) {
      const result: EventProcessingResult = {
        event_id: event.id,
        external_id: event.external_id,
        title: event.title,
        should_record: false,
        reasons: [],
      };

      // Skip events without meeting URLs
      if (!event.meeting_url) {
        result.reasons = ['No meeting URL'];
        results.push(result);
        skipped++;
        continue;
      }

      // Skip unsupported platforms
      if (!isValidMeetingUrl(event.meeting_url)) {
        result.reasons = ['Unsupported meeting platform'];
        results.push(result);
        skipped++;
        continue;
      }

      // Skip if already scheduled
      if (await isAlreadyScheduled(supabase, org_id, event.id)) {
        result.reasons = ['Recording already scheduled'];
        result.already_scheduled = true;
        results.push(result);
        alreadyScheduled++;
        continue;
      }

      // Evaluate rules
      const evaluation = await evaluateRecordingRules(supabase, org_id, user_id, event);
      result.should_record = evaluation.shouldRecord;
      result.reasons = evaluation.reasons;
      result.matched_rule = evaluation.matchedRule?.name;

      if (!evaluation.shouldRecord) {
        results.push(result);
        skipped++;
        continue;
      }

      // Check remaining quota
      if (remainingQuota <= 0) {
        result.should_record = false;
        result.reasons = ['Recording quota exceeded'];
        result.error = 'Quota exceeded';
        results.push(result);
        skipped++;
        continue;
      }

      // Deploy bot if not dry run
      if (!dry_run) {
        const deployResult = await deployBotForEvent(supabase, org_id, user_id, event);

        if (deployResult.success) {
          result.recording_id = deployResult.recordingId;
          result.bot_id = deployResult.botId;
          remainingQuota--;
          scheduled++;
        } else {
          result.should_record = false;
          result.error = deployResult.error;
          result.reasons = [deployResult.error || 'Deployment failed'];
          errors++;
        }
      } else {
        // Dry run - just mark as would be scheduled
        scheduled++;
      }

      results.push(result);
    }

    const response: ProcessEventsResponse = {
      success: true,
      results,
      summary: {
        total: events.length,
        scheduled,
        skipped,
        errors,
        already_scheduled: alreadyScheduled,
      },
    };

    console.log('[ProcessEvents] Completed:', response.summary);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ProcessEvents] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}
