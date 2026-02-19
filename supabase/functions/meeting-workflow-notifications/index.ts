/**
 * Meeting Workflow Notifications Edge Function
 *
 * Sends multi-channel notifications for workflow checklist results:
 * - In-app notifications
 * - Email notifications
 * - Slack notifications
 *
 * Can be triggered:
 * - Immediately after workflow results are saved (with delay)
 * - Periodically via cron to process pending notifications
 * - On-demand for a specific meeting
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { captureException } from '../_shared/sentryEdge.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RequestBody {
  meetingId?: string;
  processAllPending?: boolean;
  testMode?: boolean; // Don't actually send, just return what would be sent
}

interface MeetingWorkflowResult {
  id: string;
  meeting_id: string;
  call_type_id: string | null;
  org_id: string;
  checklist_results: ChecklistItem[];
  coverage_score: number | null;
  required_coverage_score: number | null;
  missing_required_items: string[] | null;
  notifications_scheduled_at: string | null;
  notifications_sent_at: string | null;
  notifications_sent: Record<string, string>;
  created_at: string;
}

interface ChecklistItem {
  item_id: string;
  label: string;
  category: string;
  required: boolean;
  covered: boolean;
  timestamp?: string;
  evidence_quote?: string;
}

interface NotificationConfig {
  enabled: boolean;
  channels: ('in_app' | 'email' | 'slack')[];
  delay_minutes: number;
}

interface Meeting {
  id: string;
  title: string;
  start_time: string;
  owner_user_id: string;
  company_id: string | null;
}

interface CallType {
  id: string;
  name: string;
  workflow_config: {
    notifications?: {
      on_missing_required?: NotificationConfig;
    };
  };
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
}

interface SlackOrgSettings {
  org_id: string;
  bot_access_token: string;
  is_connected: boolean;
}

interface SlackUserMapping {
  sixty_user_id: string;
  slack_user_id: string;
}

/**
 * Get workflow results that need notifications sent
 */
async function getPendingNotifications(
  supabase: ReturnType<typeof createClient>,
  meetingId?: string
): Promise<MeetingWorkflowResult[]> {
  const now = new Date();

  let query = supabase
    .from('meeting_workflow_results')
    .select('*')
    .is('notifications_sent_at', null)
    .not('notifications_scheduled_at', 'is', null);

  if (meetingId) {
    query = query.eq('meeting_id', meetingId);
  } else {
    // Only get results where scheduled time has passed
    query = query.lte('notifications_scheduled_at', now.toISOString());
  }

  const { data, error } = await query.limit(50);

  if (error) {
    console.error('Error fetching pending notifications:', error);
    return [];
  }

  // Filter to only those with missing required items
  return (data || []).filter(
    (r: MeetingWorkflowResult) =>
      r.missing_required_items && r.missing_required_items.length > 0
  );
}

/**
 * Get meeting details
 */
async function getMeeting(
  supabase: ReturnType<typeof createClient>,
  meetingId: string
): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select('id, title, start_time, owner_user_id, company_id')
    .eq('id', meetingId)
    .single();

  if (error) {
    console.error('Error fetching meeting:', error);
    return null;
  }

  return data;
}

/**
 * Get call type with workflow config
 */
async function getCallType(
  supabase: ReturnType<typeof createClient>,
  callTypeId: string
): Promise<CallType | null> {
  const { data, error } = await supabase
    .from('org_call_types')
    .select('id, name, workflow_config')
    .eq('id', callTypeId)
    .single();

  if (error) {
    console.error('Error fetching call type:', error);
    return null;
  }

  return data;
}

/**
 * Get user profile
 */
async function getUserProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, display_name')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return data;
}

/**
 * Send in-app notification
 */
async function sendInAppNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  meeting: Meeting,
  missingItems: string[],
  callTypeName: string
): Promise<boolean> {
  const title = 'Missing Checklist Items';
  const message = `Your ${callTypeName} call "${meeting.title || 'Untitled'}" is missing ${missingItems.length} required item(s): ${missingItems.slice(0, 3).join(', ')}${missingItems.length > 3 ? '...' : ''}`;

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type: 'warning',
    category: 'workflow',
    entity_type: 'meeting',
    entity_id: meeting.id,
    metadata: {
      missing_items: missingItems,
      call_type: callTypeName,
      meeting_title: meeting.title,
    },
    action_url: `/meetings/${meeting.id}`,
    read: false,
  });

  if (error) {
    console.error('Error creating in-app notification:', error);
    return false;
  }

  return true;
}

/**
 * Send email notification via Gmail API
 */
async function sendEmailNotification(
  supabase: ReturnType<typeof createClient>,
  user: UserProfile,
  meeting: Meeting,
  missingItems: string[],
  callTypeName: string
): Promise<boolean> {
  // Get user's Gmail credentials
  const { data: userIntegration } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .single();

  if (!userIntegration) {
    console.log(`No Gmail integration for user ${user.id}, skipping email`);
    return false;
  }

  // Check if access token is expired and refresh if needed
  let accessToken = userIntegration.access_token;
  const expiresAt = new Date(userIntegration.expires_at);

  if (expiresAt < new Date()) {
    try {
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
          refresh_token: userIntegration.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (!refreshResponse.ok) {
        console.error('Failed to refresh Google access token');
        return false;
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;

      // Update stored token
      await supabase
        .from('user_integrations')
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
        })
        .eq('user_id', user.id)
        .eq('provider', 'google');
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }

  // Build email content
  const baseUrl = Deno.env.get('PUBLIC_URL') || 'https://app.sixty.app';
  const meetingUrl = `${baseUrl}/meetings/${meeting.id}`;

  const subject = `Missing Checklist Items - ${meeting.title || 'Your Call'}`;
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #f59e0b;">⚠️ Missing Required Items</h2>
      <p>Your <strong>${callTypeName}</strong> call "${meeting.title || 'Untitled'}" is missing the following required checklist items:</p>
      <ul style="background: #fef3c7; padding: 15px 30px; border-radius: 8px; margin: 15px 0;">
        ${missingItems.map(item => `<li style="color: #92400e; margin: 8px 0;">${item}</li>`).join('')}
      </ul>
      <p>Consider following up with the participant(s) to address these items.</p>
      <a href="${meetingUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 15px;">View Meeting Details</a>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 14px;">This notification was sent by Sixty based on your call type workflow configuration.</p>
    </div>
  `;

  // Build email in RFC 2822 format
  const emailLines = [
    `To: ${user.email}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ];

  const rawMessage = emailLines.join('\r\n');
  const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const gmailResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedMessage }),
      }
    );

    if (!gmailResponse.ok) {
      const errorText = await gmailResponse.text();
      console.error('Gmail API error:', errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Send Slack notification
 */
async function sendSlackNotification(
  supabase: ReturnType<typeof createClient>,
  user: UserProfile,
  meeting: Meeting,
  missingItems: string[],
  callTypeName: string,
  orgId: string
): Promise<boolean> {
  // Get Slack org settings
  const { data: slackSettings } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token, is_connected')
    .eq('org_id', orgId)
    .single();

  if (!slackSettings?.is_connected || !slackSettings?.bot_access_token) {
    console.log(`Slack not connected for org ${orgId}, skipping`);
    return false;
  }

  // Get user's Slack mapping
  const { data: slackMapping } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('sixty_user_id', user.id)
    .eq('org_id', orgId)
    .single();

  if (!slackMapping?.slack_user_id) {
    console.log(`No Slack mapping for user ${user.id}, skipping`);
    return false;
  }

  const baseUrl = Deno.env.get('PUBLIC_URL') || 'https://app.sixty.app';
  const meetingUrl = `${baseUrl}/meetings/${meeting.id}`;

  // Build Slack message blocks
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⚠️ Missing Checklist Items',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Your *${callTypeName}* call "${meeting.title || 'Untitled'}" is missing required items:`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: missingItems.map(item => `• ${item}`).join('\n'),
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Meeting',
            emoji: true,
          },
          url: meetingUrl,
          action_id: 'view_meeting',
        },
      ],
    },
  ];

  try {
    // Send DM to user
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${slackSettings.bot_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackMapping.slack_user_id,
        blocks,
        text: `Missing checklist items for your ${callTypeName} call`,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('Slack API error:', data.error);
      return false;
    }

    // Log the sent notification
    await supabase.from('slack_notifications_sent').insert({
      org_id: orgId,
      feature: 'workflow_checklist',
      entity_type: 'meeting',
      entity_id: meeting.id,
      recipient_type: 'user',
      recipient_id: slackMapping.slack_user_id,
      slack_ts: data.ts,
      slack_channel_id: data.channel,
    });

    return true;
  } catch (error) {
    console.error('Error sending Slack notification:', error);
    return false;
  }
}

/**
 * Process notifications for a single workflow result
 */
async function processWorkflowNotifications(
  supabase: ReturnType<typeof createClient>,
  workflowResult: MeetingWorkflowResult,
  testMode: boolean = false
): Promise<{ sent: string[]; failed: string[] }> {
  const result = { sent: [] as string[], failed: [] as string[] };

  // Get meeting details
  const meeting = await getMeeting(supabase, workflowResult.meeting_id);
  if (!meeting) {
    console.error(`Meeting not found: ${workflowResult.meeting_id}`);
    return result;
  }

  // Get call type config
  let callTypeName = 'Call';
  let notificationConfig: NotificationConfig = {
    enabled: true,
    channels: ['in_app'],
    delay_minutes: 15,
  };

  if (workflowResult.call_type_id) {
    const callType = await getCallType(supabase, workflowResult.call_type_id);
    if (callType) {
      callTypeName = callType.name;
      if (callType.workflow_config?.notifications?.on_missing_required) {
        notificationConfig = callType.workflow_config.notifications.on_missing_required;
      }
    }
  }

  if (!notificationConfig.enabled) {
    console.log(`Notifications disabled for call type ${callTypeName}`);
    return result;
  }

  // Get user profile
  const user = await getUserProfile(supabase, meeting.owner_user_id);
  if (!user) {
    console.error(`User not found: ${meeting.owner_user_id}`);
    return result;
  }

  const missingItems = workflowResult.missing_required_items || [];
  if (missingItems.length === 0) {
    console.log(`No missing items for meeting ${meeting.id}`);
    return result;
  }

  const notificationsSent: Record<string, string> = { ...workflowResult.notifications_sent };

  // Process each channel
  for (const channel of notificationConfig.channels) {
    // Skip if already sent
    if (notificationsSent[channel]) {
      console.log(`${channel} notification already sent for ${meeting.id}`);
      continue;
    }

    if (testMode) {
      result.sent.push(channel);
      continue;
    }

    let success = false;

    switch (channel) {
      case 'in_app':
        success = await sendInAppNotification(supabase, user.id, meeting, missingItems, callTypeName);
        break;
      case 'email':
        success = await sendEmailNotification(supabase, user, meeting, missingItems, callTypeName);
        break;
      case 'slack':
        success = await sendSlackNotification(
          supabase,
          user,
          meeting,
          missingItems,
          callTypeName,
          workflowResult.org_id
        );
        break;
    }

    if (success) {
      result.sent.push(channel);
      notificationsSent[channel] = new Date().toISOString();
    } else {
      result.failed.push(channel);
    }
  }

  // Update workflow result with notifications sent status
  if (!testMode && result.sent.length > 0) {
    const allChannelsSent = notificationConfig.channels.every(c => notificationsSent[c]);

    await supabase
      .from('meeting_workflow_results')
      .update({
        notifications_sent: notificationsSent,
        notifications_sent_at: allChannelsSent ? new Date().toISOString() : null,
      })
      .eq('id', workflowResult.id);
  }

  return result;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { meetingId, processAllPending = false, testMode = false }: RequestBody =
      await req.json();

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let workflowResults: MeetingWorkflowResult[] = [];

    if (meetingId) {
      // Process single meeting
      workflowResults = await getPendingNotifications(supabase, meetingId);
    } else if (processAllPending) {
      // Process all pending notifications
      workflowResults = await getPendingNotifications(supabase);
    } else {
      return new Response(
        JSON.stringify({ error: 'Either meetingId or processAllPending is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (workflowResults.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending notifications to process',
          processed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      processed: 0,
      total_sent: 0,
      total_failed: 0,
      details: [] as any[],
    };

    for (const workflowResult of workflowResults) {
      const { sent, failed } = await processWorkflowNotifications(
        supabase,
        workflowResult,
        testMode
      );

      results.processed++;
      results.total_sent += sent.length;
      results.total_failed += failed.length;
      results.details.push({
        meeting_id: workflowResult.meeting_id,
        sent,
        failed,
      });
    }

    console.log(
      `Processed ${results.processed} workflow notifications: ${results.total_sent} sent, ${results.total_failed} failed`
    );

    return new Response(
      JSON.stringify({
        success: true,
        testMode,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in meeting-workflow-notifications:', error);
    await captureException(error, {
      tags: {
        function: 'meeting-workflow-notifications',
        integration: 'supabase',
      },
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
