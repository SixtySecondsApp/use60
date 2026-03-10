import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret } from '../../_shared/edgeAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleSlackTaskNotification(req: Request): Promise<Response> {
  // Auth: require cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { notification_id, user_id } = await req.json();

    if (!notification_id || !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get notification details with meeting info
    const { data: notification, error: notificationError } = await supabase
      .from('task_notifications')
      .select(`
        *,
        meeting:meetings(
          id,
          title,
          meeting_start,
          share_url
        )
      `)
      .eq('id', notification_id)
      .single();

    if (notificationError || !notification) {
      return new Response(
        JSON.stringify({ success: false, error: 'Notification not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Slack integration
    const { data: slackConfig, error: slackConfigError } = await supabase
      .from('slack_integrations')
      .select('webhook_url, notifications_enabled, notification_types')
      .eq('user_id', user_id)
      .eq('notifications_enabled', true)
      .single();

    if (slackConfigError || !slackConfig) {
      return new Response(
        JSON.stringify({ success: false, reason: 'No Slack integration enabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this notification type is enabled
    const notificationTypes = slackConfig.notification_types || {};
    if (
      notification.notification_type === 'meeting_tasks_available' &&
      !notificationTypes.meeting_tasks
    ) {
      return new Response(
        JSON.stringify({ success: false, reason: 'Notification type disabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get app URL from environment
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
    const meetingUrl = notification.meeting_id
      ? `${appUrl}/meetings/${notification.meeting_id}`
      : null;

    // Format meeting date
    const meetingDate = notification.meeting?.meeting_start
      ? new Date(notification.meeting.meeting_start).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'N/A';

    // Build Slack message with rich formatting
    const slackMessage: any = {
      text: notification.title, // Fallback text for notifications
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🎯 New Meeting Tasks Available',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${notification.title}*\n${notification.message}`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Meeting:*\n${notification.meeting?.title || 'Unknown Meeting'}`,
            },
            {
              type: 'mrkdwn',
              text: `*Date:*\n${meetingDate}`,
            },
            {
              type: 'mrkdwn',
              text: `*Tasks Available:*\n${notification.task_count || 0}`,
            },
            {
              type: 'mrkdwn',
              text: `*Source:*\n${notification.metadata?.source || 'AI Analysis'}`,
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '💡 Click the button below to review and create tasks in your CRM',
            },
          ],
        },
      ],
    };

    // Add action buttons if meeting URL is available
    if (meetingUrl) {
      slackMessage.blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📋 View Meeting & Tasks',
              emoji: true,
            },
            url: meetingUrl,
            style: 'primary',
          },
        ],
      });
    }

    // Add Fathom share link if available
    if (notification.meeting?.share_url) {
      slackMessage.blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<${notification.meeting.share_url}|🎥 Watch Recording on Fathom>`,
          },
        ],
      });
    }
    // Send to Slack
    const slackResponse = await fetch(slackConfig.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      throw new Error(`Slack API error: ${slackResponse.status} - ${errorText}`);
    }
    // Update notification to mark as sent to Slack
    await supabase
      .from('task_notifications')
      .update({
        metadata: {
          ...notification.metadata,
          slack_sent: true,
          slack_sent_at: new Date().toISOString(),
        },
      })
      .eq('id', notification_id);

    return new Response(
      JSON.stringify({
        success: true,
        notification_id,
        slack_sent: true,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}
