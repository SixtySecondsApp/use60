/**
 * Proactive Meeting Prep Edge Function
 * 
 * PROACTIVE-003: Auto-run meeting prep 2 hours before meetings with no prep.
 * 
 * Runs as a cron job (every 30 min) and:
 * 1. Checks calendar for upcoming meetings (2 hours out)
 * 2. Detects if meeting has prep completed
 * 3. If no prep, runs meeting prep sequence automatically
 * 4. Sends Slack notification with brief summary and link
 * 
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

// ============================================================================
// Types
// ============================================================================

interface UpcomingMeeting {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  attendees: any[];
  attendees_count: number;
  meeting_url?: string;
  user_id: string;
  external_id?: string;
  // IMP-001: classification columns
  is_internal?: boolean | null;
  meeting_type?: string | null;
}

interface MeetingPrepResult {
  meetingId: string;
  title: string;
  prepGenerated: boolean;
  slackNotified: boolean;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

// How far ahead to look for meetings (in minutes)
const PREP_WINDOW_MINUTES = 120; // 2 hours

// Minimum time before meeting to trigger prep (avoid last-minute preps)
const MIN_LEAD_TIME_MINUTES = 30;

// Meeting titles that are clearly not business-related — skip prep entirely
const PERSONAL_TITLE_PATTERNS = [
  /\b(doctor|dentist|gp|physio|therapist|counsell?or|optician|vet)\b/i,
  /\b(school run|pickup|drop.?off|childcare|daycare|nursery)\b/i,
  /\b(haircut|salon|barber|gym|yoga|pilates|massage)\b/i,
  /\b(lunch with|dinner with|coffee with|drinks with)\b/i,
  /\b(home visit|house viewing|plumber|electrician|builder)\b/i,
  /\b(birthday|anniversary|wedding|funeral|ceremony)\b/i,
  /\b(flight|hotel|holiday|vacation|leave)\b/i,
  /\bpersonal\b/i,
  /\bblock(ed)?\s*(time|out|calendar)\b/i,
  /\b(focus time|do not disturb|busy|out of office)\b/i,
];

// Meeting titles that are clearly business-related — always prep
const BUSINESS_TITLE_PATTERNS = [
  /\b(demo|discovery|proposal|negotiation|pricing|pitch|close|renewal|qbr)\b/i,
  /\b(pipeline|forecast|deal|revenue|quarter|sprint|standup|retro|planning)\b/i,
  /\b(onboarding|kickoff|kick-off|implementation|training|review)\b/i,
  /\b(interview|candidate|hiring)\b/i,
  /\b(board|investor|advisory|partner)\b/i,
];

/**
 * Classify whether a meeting is likely business-related.
 * Returns: 'business' | 'personal' | 'unknown'
 */
function classifyMeetingRelevance(
  title: string,
  hasKnownContacts: boolean,
  hasDeal: boolean
): 'business' | 'personal' | 'unknown' {
  // If there's an active deal, it's business
  if (hasDeal) return 'business';

  // Check title against personal patterns
  if (PERSONAL_TITLE_PATTERNS.some(p => p.test(title))) return 'personal';

  // Check title against business patterns
  if (BUSINESS_TITLE_PATTERNS.some(p => p.test(title))) return 'business';

  // If attendees are in our CRM, likely business
  if (hasKnownContacts) return 'business';

  // Can't tell — ask the user
  return 'unknown';
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'check_and_prep', userId, organizationId } = body;

    let response;

    switch (action) {
      case 'check_and_prep':
        // Check all users for upcoming meetings needing prep
        response = await checkAndPrepAllUsers(supabase);
        break;

      case 'prep_single':
        // Prep a specific meeting
        if (!userId) throw new Error('userId required');
        response = await prepMeetingsForUser(supabase, userId, organizationId);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[proactive-meeting-prep] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// Check All Users
// ============================================================================

async function checkAndPrepAllUsers(supabase: any): Promise<{
  success: boolean;
  usersProcessed: number;
  meetingsPrepped: number;
  results: MeetingPrepResult[];
}> {
  console.log('[MeetingPrep] Starting check for all users...');

  const now = new Date();
  const windowStart = new Date(now.getTime() + MIN_LEAD_TIME_MINUTES * 60 * 1000);
  const windowEnd = new Date(now.getTime() + PREP_WINDOW_MINUTES * 60 * 1000);

  // Find all calendar events in the prep window with 2+ attendees
  const { data: meetings, error: meetingsError } = await supabase
    .from('calendar_events')
    .select(
      'id, title, start_time, end_time, attendees, attendees_count, ' +
      'meeting_url, user_id, external_id, is_internal, meeting_type'
    )
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString())
    .gt('attendees_count', 0) // Any meeting with attendees (relaxed from > 1 — Google Cal sync may not populate count)
    .order('start_time');

  if (meetingsError) {
    throw new Error(`Failed to fetch meetings: ${meetingsError.message}`);
  }

  // If no meetings found with attendees_count filter, try without it (staging workaround)
  let effectiveMeetings = meetings || [];
  if (effectiveMeetings.length === 0) {
    console.log('[MeetingPrep] No meetings with attendees_count > 0, retrying without filter...');
    const { data: fallbackMeetings } = await supabase
      .from('calendar_events')
      .select(
        'id, title, start_time, end_time, attendees, attendees_count, ' +
        'meeting_url, user_id, external_id, is_internal, meeting_type'
      )
      .gte('start_time', windowStart.toISOString())
      .lte('start_time', windowEnd.toISOString())
      .order('start_time');
    effectiveMeetings = fallbackMeetings || [];
  }

  console.log(`[MeetingPrep] Found ${effectiveMeetings.length} meetings in prep window`);

  const results: MeetingPrepResult[] = [];
  const userMeetings = new Map<string, UpcomingMeeting[]>();

  // Group meetings by user
  for (const meeting of effectiveMeetings) {
    const userId = meeting.user_id;
    if (!userMeetings.has(userId)) {
      userMeetings.set(userId, []);
    }
    userMeetings.get(userId)!.push(meeting);
  }

  // Process each user's meetings
  for (const [userId, userMeetingList] of userMeetings) {
    try {
      const userResults = await prepMeetingsForUserInternal(supabase, userId, userMeetingList);
      results.push(...userResults);
    } catch (err) {
      console.error(`[MeetingPrep] Failed for user ${userId}:`, err);
    }
  }

  const meetingsPrepped = results.filter(r => r.prepGenerated).length;

  console.log(`[MeetingPrep] Complete. Users: ${userMeetings.size}, Prepped: ${meetingsPrepped}`);

  return {
    success: true,
    usersProcessed: userMeetings.size,
    meetingsPrepped,
    results,
  };
}

// ============================================================================
// Prep Meetings for User
// ============================================================================

async function prepMeetingsForUser(
  supabase: any,
  userId: string,
  organizationId?: string
): Promise<{ success: boolean; results: MeetingPrepResult[] }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + MIN_LEAD_TIME_MINUTES * 60 * 1000);
  const windowEnd = new Date(now.getTime() + PREP_WINDOW_MINUTES * 60 * 1000);

  // Find this user's upcoming meetings
  const { data: meetings, error } = await supabase
    .from('calendar_events')
    .select(
      'id, title, start_time, end_time, attendees, attendees_count, ' +
      'meeting_url, user_id, external_id, is_internal, meeting_type'
    )
    .eq('user_id', userId)
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString())
    .order('start_time');

  if (error) {
    throw new Error(`Failed to fetch meetings: ${error.message}`);
  }

  // Filter to real meetings — use attendees_count if populated, otherwise include all
  const effectiveMeetings = (meetings || []).filter(m =>
    !m.attendees_count || m.attendees_count > 0
  );

  const results = await prepMeetingsForUserInternal(supabase, userId, effectiveMeetings);

  return { success: true, results };
}

async function prepMeetingsForUserInternal(
  supabase: any,
  userId: string,
  meetings: UpcomingMeeting[]
): Promise<MeetingPrepResult[]> {
  const results: MeetingPrepResult[] = [];

  for (const meeting of meetings) {
    try {
      // Check if prep already exists for this meeting
      const hasPrep = await checkPrepExists(supabase, meeting.id, userId);

      if (hasPrep) {
        console.log(`[MeetingPrep] Prep already exists for meeting: ${meeting.title}`);
        results.push({
          meetingId: meeting.id,
          title: meeting.title,
          prepGenerated: false,
          slackNotified: false,
        });
        continue;
      }

      // Get org_id for the user (needed for internal meeting check and orchestrator)
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      const orgId = membership?.org_id;

      // ── IMP-006: Internal meeting routing ──────────────────────────────────
      // If the event is classified as internal (is_internal = true), check
      // whether internal_meeting_prep is enabled for this org and route to the
      // internal prep orchestrator sequence instead of the external prep flow.
      if (meeting.is_internal === true) {
        console.log(`[MeetingPrep] Internal meeting detected: ${meeting.title}`);

        // Check agent config: internal_prep_enabled (default: true)
        let internalPrepEnabled = true;
        if (orgId) {
          try {
            const { data: configVal } = await supabase.rpc('resolve_agent_config', {
              p_org_id: orgId,
              p_user_id: userId,
              p_agent_type: 'internal_meeting_prep',
              p_config_key: 'internal_prep_enabled',
            });
            if (configVal === false || configVal === 'false') {
              internalPrepEnabled = false;
            }
          } catch { /* non-fatal: default to enabled */ }
        }

        if (!internalPrepEnabled) {
          console.log(`[MeetingPrep] internal_prep_enabled=false — skipping internal prep for: ${meeting.title}`);
          results.push({
            meetingId: meeting.id,
            title: meeting.title,
            prepGenerated: false,
            slackNotified: false,
          });
          continue;
        }

        // Trigger orchestrator with internal_meeting_prep event type
        if (orgId) {
          try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

            await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'internal_meeting_prep',
                source: 'cron:proactive-meeting-prep',
                org_id: orgId,
                user_id: userId,
                payload: {
                  meeting_id: meeting.id,
                  title: meeting.title,
                  start_time: meeting.start_time,
                  meeting_type: meeting.meeting_type,
                  attendees: meeting.attendees,
                  lookahead_hours: 4,
                },
                idempotency_key: `internal_prep:${meeting.id}`,
              }),
            });

            console.log(`[MeetingPrep] Internal prep orchestrator triggered for: ${meeting.title}`);
            results.push({
              meetingId: meeting.id,
              title: meeting.title,
              prepGenerated: true,
              slackNotified: false, // Orchestrator handles delivery
            });
          } catch (err) {
            console.error('[MeetingPrep] Failed to trigger internal prep orchestrator:', err);
            results.push({
              meetingId: meeting.id,
              title: meeting.title,
              prepGenerated: false,
              slackNotified: false,
              error: String(err),
            });
          }
        } else {
          console.warn(`[MeetingPrep] No org_id for user ${userId} — cannot trigger internal prep`);
          results.push({
            meetingId: meeting.id,
            title: meeting.title,
            prepGenerated: false,
            slackNotified: false,
          });
        }
        continue;
      }
      // ── END: Internal meeting routing ──────────────────────────────────────

      // Check business relevance before generating external meeting prep
      const { hasKnownContacts, hasDeal } = await quickRelevanceCheck(supabase, meeting);
      const relevance = classifyMeetingRelevance(meeting.title, hasKnownContacts, hasDeal);

      if (relevance === 'personal') {
        console.log(`[MeetingPrep] Skipping personal meeting: ${meeting.title}`);
        results.push({
          meetingId: meeting.id,
          title: meeting.title,
          prepGenerated: false,
          slackNotified: false,
        });
        continue;
      }

      if (relevance === 'unknown') {
        console.log(`[MeetingPrep] Unknown relevance, asking user: ${meeting.title}`);
        const asked = await sendRelevanceQuestion(supabase, userId, meeting, orgId);
        results.push({
          meetingId: meeting.id,
          title: meeting.title,
          prepGenerated: false,
          slackNotified: asked,
        });
        continue;
      }

      // Feature flag: use orchestrator if enabled (safe rollout)
      const useOrchestrator = true; // TODO: read from notification_feature_settings

      if (useOrchestrator) {
        // ORCH-010: Trigger orchestrator for meeting prep workflow
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

          if (orgId) {
            await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'pre_meeting_90min',
                source: 'cron:proactive-meeting-prep',
                org_id: orgId,
                user_id: userId,
                payload: {
                  meeting_id: meeting.id,
                  title: meeting.title,
                  start_time: meeting.start_time,
                  attendees: meeting.attendees,
                },
                idempotency_key: `pre_meeting:${meeting.id}`,
              }),
            });

            console.log(`[MeetingPrep] Orchestrator triggered for: ${meeting.title}`);
            results.push({
              meetingId: meeting.id,
              title: meeting.title,
              prepGenerated: true,
              slackNotified: false, // Orchestrator handles notification
            });
            continue;
          } else {
            console.warn(`[MeetingPrep] No org_id found for user ${userId}, falling back to legacy`);
          }
        } catch (err) {
          console.error('[MeetingPrep] Failed to trigger orchestrator:', err);
          // Fall through to legacy implementation
        }
      }

      // Fallback: Generate prep by running the meeting prep sequence (legacy)
      console.log(`[MeetingPrep] Generating prep for: ${meeting.title} (legacy mode)`);

      const prepResult = await generateMeetingPrep(supabase, userId, meeting);
      
      // Send Slack notification
      let slackNotified = false;
      if (prepResult.success) {
        slackNotified = await sendPrepNotification(supabase, userId, meeting, prepResult.brief, orgId || prepResult.organizationId);
      }

      // Log engagement event
      await supabase.rpc('log_copilot_engagement', {
        p_org_id: prepResult.organizationId,
        p_user_id: userId,
        p_event_type: 'message_sent',
        p_trigger_type: 'proactive',
        p_channel: slackNotified ? 'slack' : 'in_app',
        p_sequence_key: 'seq-next-meeting-command-center',
        p_estimated_time_saved: 5, // Estimate 5 min saved
        p_outcome_type: 'prep_generated',
        p_metadata: {
          meeting_id: meeting.id,
          meeting_title: meeting.title,
        },
      });

      results.push({
        meetingId: meeting.id,
        title: meeting.title,
        prepGenerated: prepResult.success,
        slackNotified,
        error: prepResult.error,
      });

    } catch (err) {
      console.error(`[MeetingPrep] Failed for meeting ${meeting.id}:`, err);
      results.push({
        meetingId: meeting.id,
        title: meeting.title,
        prepGenerated: false,
        slackNotified: false,
        error: String(err),
      });
    }
  }

  return results;
}

// ============================================================================
// Business Relevance Check
// ============================================================================

/**
 * Quick check: are any attendees known CRM contacts? Is there a deal?
 * Uses lightweight queries to avoid expensive enrichment for personal meetings.
 */
async function quickRelevanceCheck(
  supabase: any,
  meeting: UpcomingMeeting
): Promise<{ hasKnownContacts: boolean; hasDeal: boolean }> {
  const attendeeEmails = (meeting.attendees || [])
    .filter((a: any) => a.email && !a.self)
    .map((a: any) => a.email?.toLowerCase())
    .filter(Boolean);

  if (attendeeEmails.length === 0) {
    return { hasKnownContacts: false, hasDeal: false };
  }

  // Check if any attendee email is in our contacts table
  const { count: contactCount } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .in('email', attendeeEmails);

  const hasKnownContacts = (contactCount || 0) > 0;

  // Quick deal check by company name from meeting title or attendee domain
  let hasDeal = false;
  if (hasKnownContacts) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .in('email', attendeeEmails)
      .limit(1)
      .maybeSingle();

    if (contact?.id) {
      const { count: dealCount } = await supabase
        .from('deals')
        .select('id', { count: 'exact', head: true })
        .eq('primary_contact_id', contact.id)
        .not('status', 'in', '("closed_won","closed_lost")');

      hasDeal = (dealCount || 0) > 0;
    }
  }

  return { hasKnownContacts, hasDeal };
}

/**
 * Send a Slack message asking the user if they want prep for an unclassified meeting.
 * Returns true if the message was sent successfully.
 */
async function sendRelevanceQuestion(
  supabase: any,
  userId: string,
  meeting: UpcomingMeeting,
  orgId?: string
): Promise<boolean> {
  try {
    if (!orgId) {
      console.log(`[MeetingPrep] No org_id for user ${userId}, cannot send relevance question`);
      return false;
    }

    // Get org-level Slack bot token
    const { data: slackOrg } = await supabase
      .from('slack_org_settings')
      .select('bot_access_token')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();

    if (!slackOrg?.bot_access_token) return false;

    // Get user's Slack user ID for DM
    const { data: slackMapping } = await supabase
      .from('slack_user_mappings')
      .select('slack_user_id')
      .eq('sixty_user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!slackMapping?.slack_user_id) return false;

    const startTime = new Date(meeting.start_time);
    const timeStr = startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Research brief ready for *${meeting.title}* at ${timeStr}. 3 talking points prepared.`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Yes, prep this meeting', emoji: true },
            style: 'primary',
            action_id: 'meeting_prep_confirm',
            value: JSON.stringify({ meeting_id: meeting.id, user_id: userId }),
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'No thanks, skip it', emoji: true },
            action_id: 'meeting_prep_skip',
            value: meeting.id,
          },
        ],
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: "_I wasn't sure if this is a work meeting. Let me know and I'll remember for next time._",
        }],
      },
    ];

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackOrg.bot_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackMapping.slack_user_id,
        blocks,
        text: `Should I prep for "${meeting.title}"?`,
      }),
    });

    const result = await response.json();
    return result.ok === true;
  } catch (err) {
    console.error('[MeetingPrep] Failed to send relevance question:', err);
    return false;
  }
}

// ============================================================================
// Check if Prep Exists
// ============================================================================

async function checkPrepExists(
  supabase: any,
  meetingId: string,
  userId: string
): Promise<boolean> {
  // Check for recent meeting prep in copilot messages
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const { count } = await supabase
    .from('copilot_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneDayAgo.toISOString())
    .or(`content.ilike.%${meetingId}%,metadata->meeting_id.eq.${meetingId}`);

  return (count || 0) > 0;
}

// ============================================================================
// Generate Meeting Prep
// ============================================================================

async function generateMeetingPrep(
  supabase: any,
  userId: string,
  meeting: UpcomingMeeting
): Promise<{ success: boolean; brief?: string; organizationId?: string; error?: string }> {
  try {
    // Get user's org
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    const orgId = membership?.org_id;

    // Extract attendee info for context
    const attendeeEmails = meeting.attendees
      ?.filter((a: any) => a.email && !a.self)
      ?.map((a: any) => a.email)
      ?.slice(0, 3) || [];

    // Call the copilot API to run the meeting prep sequence
    const { data, error } = await supabase.functions.invoke('api-copilot/chat', {
      body: {
        message: `Prep me for my upcoming meeting: "${meeting.title}"`,
        context: {
          orgId,
          userId,
          calendarEventId: meeting.id,
          attendeeEmails,
          isProactivePrep: true,
        },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Extract the brief from the response
    const brief = data?.response?.content || data?.summary || '';

    // Store the prep result
    await supabase
      .from('meeting_preps')
      .upsert({
        calendar_event_id: meeting.id,
        user_id: userId,
        organization_id: orgId,
        brief,
        generated_at: new Date().toISOString(),
        source: 'proactive',
      }, { onConflict: 'calendar_event_id,user_id' });

    return { success: true, brief, organizationId: orgId };

  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ============================================================================
// Send Slack Notification
// ============================================================================

async function sendPrepNotification(
  supabase: any,
  userId: string,
  meeting: UpcomingMeeting,
  brief?: string,
  orgId?: string
): Promise<boolean> {
  try {
    if (!orgId) {
      console.log(`[MeetingPrep] No org_id for user ${userId}, cannot send prep notification`);
      return false;
    }

    // Get org-level Slack bot token
    const { data: slackOrg } = await supabase
      .from('slack_org_settings')
      .select('bot_access_token')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();

    if (!slackOrg?.bot_access_token) {
      return false;
    }

    // Get user's Slack user ID for DM
    const { data: slackMapping } = await supabase
      .from('slack_user_mappings')
      .select('slack_user_id')
      .eq('sixty_user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!slackMapping?.slack_user_id) {
      return false;
    }

    // Calculate time until meeting
    const startTime = new Date(meeting.start_time);
    const now = new Date();
    const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / 60000);
    const timeLabel = minutesUntil >= 60 
      ? `${Math.round(minutesUntil / 60)} hour${minutesUntil >= 120 ? 's' : ''}`
      : `${minutesUntil} min`;

    // Build Slack message
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📅 Meeting in ${timeLabel}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${meeting.title}*\n${new Date(meeting.start_time).toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}`,
        },
      },
    ];

    // Add brief preview if available
    if (brief) {
      const briefPreview = brief.length > 200 ? brief.substring(0, 200) + '...' : brief;
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `I've prepared a brief for you:\n>${briefPreview}`,
        },
      });
    }

    // Add action buttons
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📋 View Full Brief',
            emoji: true,
          },
          url: `https://app.use60.com/meetings/${meeting.id}`,
          action_id: 'view_brief',
        },
        ...(meeting.meeting_url ? [{
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔗 Join Meeting',
            emoji: true,
          },
          url: meeting.meeting_url,
          action_id: 'join_meeting',
        }] : []),
      ],
    } as any);

    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: '_Auto-generated by 60 Copilot • Reply here for more info_',
      }],
    });

    // Send DM to user's Slack user ID
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackOrg.bot_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackMapping.slack_user_id,
        blocks,
        text: `Meeting prep ready: ${meeting.title}`,
      }),
    });

    const result = await response.json();
    return result.ok === true;

  } catch (err) {
    console.error('[MeetingPrep] Slack notification failed:', err);
    return false;
  }
}
