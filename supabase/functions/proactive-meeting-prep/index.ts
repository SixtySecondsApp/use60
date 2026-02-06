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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

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

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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
    .select(`
      id,
      title,
      start_time,
      end_time,
      attendees,
      attendees_count,
      meeting_url,
      user_id,
      external_id
    `)
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString())
    .gt('attendees_count', 1) // Real meetings only
    .order('start_time');

  if (meetingsError) {
    throw new Error(`Failed to fetch meetings: ${meetingsError.message}`);
  }

  console.log(`[MeetingPrep] Found ${meetings?.length || 0} meetings in prep window`);

  const results: MeetingPrepResult[] = [];
  const userMeetings = new Map<string, UpcomingMeeting[]>();

  // Group meetings by user
  for (const meeting of meetings || []) {
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
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString())
    .gt('attendees_count', 1)
    .order('start_time');

  if (error) {
    throw new Error(`Failed to fetch meetings: ${error.message}`);
  }

  const results = await prepMeetingsForUserInternal(supabase, userId, meetings || []);

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

      // Generate prep by running the meeting prep sequence
      console.log(`[MeetingPrep] Generating prep for: ${meeting.title}`);
      
      const prepResult = await generateMeetingPrep(supabase, userId, meeting);
      
      // Send Slack notification
      let slackNotified = false;
      if (prepResult.success) {
        slackNotified = await sendPrepNotification(supabase, userId, meeting, prepResult.brief);
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
  brief?: string
): Promise<boolean> {
  try {
    // Check if user has Slack connected
    const { data: slackAuth } = await supabase
      .from('slack_auth')
      .select('access_token, channel_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!slackAuth?.access_token) {
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

    // Send to Slack
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackAuth.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackAuth.channel_id || userId,
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
