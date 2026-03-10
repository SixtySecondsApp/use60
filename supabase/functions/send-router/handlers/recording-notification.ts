import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { corsHeaders, handleCorsPreflightWithResponse } from '../../_shared/corsHelper.ts';
import { postToChannel, postEphemeralToChannel } from '../../_shared/slackAuth.ts';

// =============================================================================
// Types
// =============================================================================

type NotificationType =
  | 'bot_joining'
  | 'bot_failed'
  | 'recording_ready'
  | 'hitl_deal_selection'
  | 'hitl_speaker_confirmation';

interface NotificationRequest {
  type: NotificationType;
  recording_id: string;
  user_id: string;
  org_id: string;
  data?: Record<string, unknown>;
}

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

interface NotificationSettings {
  enabled: boolean;
  channel_id?: string;
  events: {
    bot_joining: boolean;
    bot_failed: boolean;
    recording_ready: boolean;
    hitl_required: boolean;
  };
}

// =============================================================================
// Slack Block Builders
// =============================================================================

const truncate = (text: string, max: number): string => {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
};

function buildBotJoiningBlocks(data: {
  meetingTitle: string;
  platform: string;
  attendees: string[];
  recordingUrl: string;
}): SlackBlock[] {
  const attendeeText = data.attendees.length > 0
    ? data.attendees.slice(0, 3).join(', ') + (data.attendees.length > 3 ? ` +${data.attendees.length - 3} more` : '')
    : 'Unknown attendees';

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🎬 *Recording bot joining*\n\n*${truncate(data.meetingTitle, 100)}*`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📍 ${data.platform} • 👥 ${attendeeText}`,
        },
      ],
    },
  ];
}

function buildBotFailedBlocks(data: {
  meetingTitle: string;
  platform: string;
  errorMessage: string;
  recordingUrl: string;
}): SlackBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `❌ *Recording bot failed to join*\n\n*${truncate(data.meetingTitle, 100)}*`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Error:* ${truncate(data.errorMessage, 200)}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📍 ${data.platform}`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '🔄 Retry', emoji: true },
          action_id: 'retry_recording',
          value: JSON.stringify({ recordingUrl: data.recordingUrl }),
        },
      ],
    },
  ];
}

function buildRecordingReadyBlocks(data: {
  meetingTitle: string;
  duration: string;
  summary: string;
  highlights: Array<{ type?: string; text: string }>;
  actionItemCount: number;
  recordingUrl: string;
  appUrl: string;
}): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *Recording ready*\n\n*${truncate(data.meetingTitle, 100)}*\n⏱️ ${data.duration}`,
      },
    },
  ];

  if (data.summary) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary*\n${truncate(data.summary, 500)}`,
      },
    });
  }

  if (data.highlights && data.highlights.length > 0) {
    const highlightText = data.highlights
      .slice(0, 3)
      .map((h) => `• ${truncate(h.text, 150)}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Key Highlights*\n${highlightText}`,
      },
    });
  }

  if (data.actionItemCount > 0) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📋 ${data.actionItemCount} action item${data.actionItemCount > 1 ? 's' : ''} identified`,
        },
      ],
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '▶️ View Recording', emoji: true },
        url: data.appUrl,
        action_id: 'view_recording',
      },
    ],
  });

  return blocks;
}

function buildDealSelectionBlocks(data: {
  meetingTitle: string;
  recordingId: string;
  deals: Array<{ id: string; name: string; stage?: string }>;
  appUrl: string;
}): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🔗 *Link recording to deal*\n\n*${truncate(data.meetingTitle, 100)}*\n\nMultiple deals found. Which should this recording be linked to?`,
      },
    },
  ];

  // Add deal buttons (max 5 to fit Slack's limits)
  const dealButtons = data.deals.slice(0, 5).map((deal) => ({
    type: 'button',
    text: {
      type: 'plain_text',
      text: truncate(`${deal.name}${deal.stage ? ` (${deal.stage})` : ''}`, 75),
      emoji: true,
    },
    action_id: `select_deal_${deal.id}`,
    value: JSON.stringify({ recordingId: data.recordingId, dealId: deal.id }),
  }));

  blocks.push({
    type: 'actions',
    elements: dealButtons,
  });

  // Add skip button
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: "Skip - Don't link to a deal", emoji: true },
        action_id: 'skip_deal_link',
        value: data.recordingId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '🔗 Open in app', emoji: true },
        url: data.appUrl,
        action_id: 'open_in_app',
      },
    ],
  });

  return blocks;
}

function buildSpeakerConfirmationBlocks(data: {
  meetingTitle: string;
  recordingId: string;
  speakers: Array<{
    id: string;
    name: string;
    suggestedEmail?: string;
    confidence: number;
  }>;
  appUrl: string;
}): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `👤 *Confirm speakers*\n\n*${truncate(data.meetingTitle, 100)}*\n\nPlease confirm the speakers identified in this recording:`,
      },
    },
  ];

  // Add speaker info
  for (const speaker of data.speakers.slice(0, 5)) {
    const confidence = Math.round(speaker.confidence * 100);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${speaker.name}*${speaker.suggestedEmail ? `\n📧 ${speaker.suggestedEmail} (${confidence}% confidence)` : ''}`,
      },
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Confirm All', emoji: true },
        style: 'primary',
        action_id: 'confirm_speakers',
        value: data.recordingId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✏️ Edit in App', emoji: true },
        url: data.appUrl,
        action_id: 'edit_speakers',
      },
    ],
  });

  return blocks;
}

// =============================================================================
// Notification Logic
// =============================================================================

async function getNotificationSettings(
  supabase: SupabaseClient,
  orgId: string
): Promise<NotificationSettings | null> {
  const { data } = await supabase
    .from('organizations')
    .select('recording_settings')
    .eq('id', orgId)
    .single();

  const settings = data?.recording_settings?.notifications;
  if (!settings) return null;

  return {
    enabled: settings.enabled ?? true,
    channel_id: settings.slack_channel_id,
    events: {
      bot_joining: settings.notify_bot_joining ?? false,
      bot_failed: settings.notify_bot_failed ?? true,
      recording_ready: settings.notify_recording_ready ?? true,
      hitl_required: settings.notify_hitl_required ?? true,
    },
  };
}

async function getSlackBotToken(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .maybeSingle();

  return data?.bot_access_token || null;
}

async function getUserSlackId(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('sixty_user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();

  return data?.slack_user_id || null;
}

async function getRecordingDetails(
  supabase: SupabaseClient,
  recordingId: string
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from('recordings')
    .select(`
      id,
      meeting_title,
      meeting_platform,
      meeting_duration_seconds,
      summary,
      highlights,
      action_items,
      speakers,
      status,
      error_message
    `)
    .eq('id', recordingId)
    .single();

  return data;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Unknown duration';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

function buildAppUrl(recordingId: string): string {
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://app.use60.com';
  return `${appUrl}/recordings/${recordingId}`;
}

async function sendNotification(
  request: NotificationRequest,
  supabase: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  // Get notification settings
  const settings = await getNotificationSettings(supabase, request.org_id);
  if (!settings?.enabled) {
    return { success: true }; // Silently succeed if notifications disabled
  }

  // Check if this event type is enabled
  const eventEnabled =
    (request.type === 'bot_joining' && settings.events.bot_joining) ||
    (request.type === 'bot_failed' && settings.events.bot_failed) ||
    (request.type === 'recording_ready' && settings.events.recording_ready) ||
    ((request.type === 'hitl_deal_selection' || request.type === 'hitl_speaker_confirmation') &&
      settings.events.hitl_required);

  if (!eventEnabled) {
    return { success: true }; // Silently succeed if event type disabled
  }

  // Get Slack bot token
  const botToken = await getSlackBotToken(supabase, request.org_id);
  if (!botToken) {
    console.warn('[Notification] No Slack bot token for org:', request.org_id);
    return { success: false, error: 'Slack not connected' };
  }

  // Get recording details
  const recording = await getRecordingDetails(supabase, request.recording_id);
  if (!recording) {
    return { success: false, error: 'Recording not found' };
  }

  const appUrl = buildAppUrl(request.recording_id);
  const meetingTitle = (recording.meeting_title as string) || 'Meeting Recording';
  const platform = (recording.meeting_platform as string) || 'Unknown';

  // Build notification blocks based on type
  let blocks: SlackBlock[];
  let fallbackText: string;

  switch (request.type) {
    case 'bot_joining':
      blocks = buildBotJoiningBlocks({
        meetingTitle,
        platform,
        attendees: ((recording.speakers as unknown[]) || []).map(
          (s: unknown) => (s as Record<string, string>).name
        ),
        recordingUrl: appUrl,
      });
      fallbackText = `🎬 Recording bot joining: ${meetingTitle}`;
      break;

    case 'bot_failed':
      blocks = buildBotFailedBlocks({
        meetingTitle,
        platform,
        errorMessage: (recording.error_message as string) || 'Unknown error',
        recordingUrl: appUrl,
      });
      fallbackText = `❌ Recording bot failed: ${meetingTitle}`;
      break;

    case 'recording_ready':
      blocks = buildRecordingReadyBlocks({
        meetingTitle,
        duration: formatDuration(recording.meeting_duration_seconds as number | null),
        summary: (recording.summary as string) || '',
        highlights: ((recording.highlights as unknown[]) || []) as Array<{ type?: string; text: string }>,
        actionItemCount: ((recording.action_items as unknown[]) || []).length,
        recordingUrl: appUrl,
        appUrl,
      });
      fallbackText = `✅ Recording ready: ${meetingTitle}`;
      break;

    case 'hitl_deal_selection': {
      const deals = (request.data?.deals as Array<{ id: string; name: string; stage?: string }>) || [];
      blocks = buildDealSelectionBlocks({
        meetingTitle,
        recordingId: request.recording_id,
        deals,
        appUrl,
      });
      fallbackText = `🔗 Link recording to deal: ${meetingTitle}`;
      break;
    }

    case 'hitl_speaker_confirmation': {
      const speakers = (request.data?.speakers as Array<{
        id: string;
        name: string;
        suggestedEmail?: string;
        confidence: number;
      }>) || [];
      blocks = buildSpeakerConfirmationBlocks({
        meetingTitle,
        recordingId: request.recording_id,
        speakers,
        appUrl,
      });
      fallbackText = `👤 Confirm speakers: ${meetingTitle}`;
      break;
    }

    default:
      return { success: false, error: 'Unknown notification type' };
  }

  // Send notification
  if (settings.channel_id) {
    const result = await postToChannel(botToken, settings.channel_id, {
      blocks,
      text: fallbackText,
    });

    if (!result.ok) {
      console.error('[Notification] Failed to post to channel:', result.error);
      return { success: false, error: result.error };
    }
  } else {
    // Send to user directly
    const slackUserId = await getUserSlackId(supabase, request.user_id, request.org_id);
    if (slackUserId) {
      const result = await postToChannel(botToken, slackUserId, {
        blocks,
        text: fallbackText,
      });

      if (!result.ok) {
        console.error('[Notification] Failed to DM user:', result.error);
        return { success: false, error: result.error };
      }
    } else {
      console.warn('[Notification] No Slack user mapping for user:', request.user_id);
      return { success: false, error: 'User not mapped to Slack' };
    }
  }

  console.log('[Notification] Sent successfully:', {
    type: request.type,
    recordingId: request.recording_id,
  });

  return { success: true };
}

// =============================================================================
// Exported Handler
// =============================================================================

export async function handleRecordingNotification(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // This function is typically called internally with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: NotificationRequest = await req.json();

    if (!body.type || !body.recording_id || !body.user_id || !body.org_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: type, recording_id, user_id, org_id',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result = await sendNotification(body, supabase);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Notification] Error:', error);
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
