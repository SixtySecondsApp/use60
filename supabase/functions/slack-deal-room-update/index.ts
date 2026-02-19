// supabase/functions/slack-deal-room-update/index.ts
// Posts updates to deal room channels for various deal events

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  buildDealStageChangeMessage,
  buildDealActivityMessage,
  buildWinProbabilityChangeMessage,
  buildDealWonMessage,
  buildDealLostMessage,
  buildMeetingDebriefMessage,
  type DealStageChangeData,
  type DealActivityData,
  type WinProbabilityChangeData,
  type DealWonData,
  type DealLostData,
  type MeetingDebriefData,
} from '../_shared/slackBlocks.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://use60.com';

type UpdateType = 'stage_change' | 'activity' | 'win_probability' | 'deal_won' | 'deal_lost' | 'meeting_summary';

interface UpdateRequest {
  dealId: string;
  orgId?: string;
  updateType: UpdateType;
  data: Record<string, unknown>;
}

/**
 * Get deal room channel ID
 */
async function getDealRoomChannel(
  supabase: ReturnType<typeof createClient>,
  dealId: string
): Promise<{ channelId: string; orgId: string } | null> {
  const { data } = await supabase
    .from('slack_deal_rooms')
    .select('slack_channel_id, org_id')
    .eq('deal_id', dealId)
    .eq('is_archived', false)
    .single();

  if (!data) return null;

  return {
    channelId: data.slack_channel_id,
    orgId: data.org_id,
  };
}

/**
 * Get Slack bot token for org
 */
async function getSlackBotToken(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .single();

  return data?.bot_access_token || null;
}

async function getOrgMoneyConfig(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ currencyCode: string; currencyLocale: string }> {
  try {
    const { data } = await supabase
      .from('organizations')
      .select('currency_code, currency_locale')
      .eq('id', orgId)
      .single();

    const currencyCode = ((data as any)?.currency_code as string | null | undefined) || 'GBP';
    const currencyLocale =
      ((data as any)?.currency_locale as string | null | undefined) ||
      (currencyCode === 'USD'
        ? 'en-US'
        : currencyCode === 'EUR'
          ? 'en-IE'
          : currencyCode === 'AUD'
            ? 'en-AU'
            : currencyCode === 'CAD'
              ? 'en-CA'
              : 'en-GB');

    return { currencyCode: currencyCode.toUpperCase(), currencyLocale };
  } catch {
    return { currencyCode: 'GBP', currencyLocale: 'en-GB' };
  }
}

function formatMoney(value: number, currencyCode: string, currencyLocale: string): string {
  try {
    return new Intl.NumberFormat(currencyLocale || 'en-GB', {
      style: 'currency',
      currency: (currencyCode || 'GBP').toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value}`;
  }
}

type DealRoomArchiveMode = 'immediate' | 'delayed';

/**
 * Get deal room archive behavior for org
 * (configured on slack_notification_settings.feature = 'deal_rooms')
 */
async function getDealRoomArchiveSettings(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ mode: DealRoomArchiveMode; delayHours: number }> {
  const { data } = await supabase
    .from('slack_notification_settings')
    .select('deal_room_archive_mode, deal_room_archive_delay_hours')
    .eq('org_id', orgId)
    .eq('feature', 'deal_rooms')
    .single();

  const rawMode = (data as any)?.deal_room_archive_mode as string | null | undefined;
  const rawDelay = (data as any)?.deal_room_archive_delay_hours as number | null | undefined;

  const mode: DealRoomArchiveMode = rawMode === 'immediate' ? 'immediate' : 'delayed';
  const delayHours =
    typeof rawDelay === 'number' && Number.isFinite(rawDelay)
      ? Math.min(168, Math.max(0, Math.floor(rawDelay)))
      : 24;

  return { mode, delayHours };
}

/**
 * Get Slack user ID for a Sixty user
 */
async function getSlackUserId(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  sixtyUserId: string
): Promise<string | undefined> {
  const { data } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('org_id', orgId)
    .eq('sixty_user_id', sixtyUserId)
    .single();

  return data?.slack_user_id;
}

/**
 * Mark a deal room for archiving (either immediately or scheduled)
 */
async function applyDealRoomArchivePolicy(params: {
  supabase: ReturnType<typeof createClient>;
  botToken: string;
  dealId: string;
  orgId: string;
  channelId: string;
  reasonLabel: string; // "WON", "LOST", "SIGNED"
  archiveImmediatelyRequested?: boolean;
}): Promise<{ archived: boolean; scheduledFor?: string }> {
  const {
    supabase,
    botToken,
    dealId,
    orgId,
    channelId,
    reasonLabel,
    archiveImmediatelyRequested,
  } = params;

  const settings = await getDealRoomArchiveSettings(supabase, orgId);

  const effectiveMode: DealRoomArchiveMode =
    archiveImmediatelyRequested === true || settings.mode === 'immediate' || settings.delayHours === 0
      ? 'immediate'
      : 'delayed';

  if (effectiveMode === 'immediate') {
    const topic = `🏁 ${reasonLabel} - Channel archived`;
    await updateChannelTopic(botToken, channelId, topic);

    const archiveResult = await archiveChannel(botToken, channelId);
    if (!archiveResult.ok) {
      console.warn('Failed to archive channel:', archiveResult.error);
    }

    await supabase
      .from('slack_deal_rooms')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archive_scheduled_for: null,
      })
      .eq('deal_id', dealId);

    return { archived: true };
  }

  const scheduledFor = new Date(Date.now() + settings.delayHours * 60 * 60 * 1000).toISOString();
  const topic =
    settings.delayHours === 1
      ? `🏁 ${reasonLabel} - Auto-archive in ~1 hour`
      : `🏁 ${reasonLabel} - Auto-archive in ~${settings.delayHours} hours`;

  await updateChannelTopic(botToken, channelId, topic);

  await supabase
    .from('slack_deal_rooms')
    .update({
      archive_scheduled_for: scheduledFor,
    })
    .eq('deal_id', dealId);

  return { archived: false, scheduledFor };
}

/**
 * Post message to Slack channel
 */
async function postToChannel(
  botToken: string,
  channelId: string,
  message: { blocks: unknown[]; text: string }
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      blocks: message.blocks,
      text: message.text,
    }),
  });

  return response.json();
}

/**
 * Archive a Slack channel
 */
async function archiveChannel(
  botToken: string,
  channelId: string
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch('https://slack.com/api/conversations.archive', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
    }),
  });

  return response.json();
}

/**
 * Update channel topic
 */
async function updateChannelTopic(
  botToken: string,
  channelId: string,
  topic: string
): Promise<void> {
  await fetch('https://slack.com/api/conversations.setTopic', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      topic,
    }),
  });
}

/**
 * Build message based on update type
 */
function buildUpdateMessage(
  updateType: UpdateType,
  data: Record<string, unknown>
): { blocks: unknown[]; text: string } {
  switch (updateType) {
    case 'stage_change':
      return buildDealStageChangeMessage(data as DealStageChangeData);
    case 'activity':
      return buildDealActivityMessage(data as DealActivityData);
    case 'win_probability':
      return buildWinProbabilityChangeMessage(data as WinProbabilityChangeData);
    case 'deal_won':
      return buildDealWonMessage(data as DealWonData);
    case 'deal_lost':
      return buildDealLostMessage(data as DealLostData);
    case 'meeting_summary':
      return buildMeetingDebriefMessage(data as MeetingDebriefData);
    default:
      return {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📢 *Deal Update*\n${JSON.stringify(data)}`,
            },
          },
        ],
        text: 'Deal Update',
      };
  }
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { dealId, orgId, updateType, data } = await req.json() as UpdateRequest;

    if (!dealId || !updateType) {
      return new Response(
        JSON.stringify({ error: 'dealId and updateType required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const auth = await getAuthContext(req, supabase, supabaseServiceKey);

    // Get deal room channel
    const dealRoom = await getDealRoomChannel(supabase, dealId);
    if (!dealRoom) {
      console.log('No deal room exists for deal:', dealId);
      return new Response(
        JSON.stringify({ success: false, message: 'No deal room for this deal' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // External release hardening: only org admins (or platform admins) can post deal-room updates manually.
    // (Service-role callers like triggers/cron are allowed.)
    if (auth.mode === 'user' && auth.userId && !auth.isPlatformAdmin) {
      await requireOrgRole(supabase, dealRoom.orgId, auth.userId, ['owner', 'admin']);
    }

    // Get bot token
    const botToken = await getSlackBotToken(supabase, dealRoom.orgId);
    if (!botToken) {
      return new Response(
        JSON.stringify({ success: false, message: 'No Slack bot token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const money = await getOrgMoneyConfig(supabase, dealRoom.orgId);

    // Enrich data with common fields
    const enrichedData = {
      ...data,
      appUrl,
      dealId,
      currencyCode: money.currencyCode,
      currencyLocale: money.currencyLocale,
    };

    // If there's a user_id in data, try to get their Slack ID for @mention
    if (data.userId && typeof data.userId === 'string') {
      const slackUserId = await getSlackUserId(supabase, dealRoom.orgId, data.userId);
      if (slackUserId) {
        enrichedData.slackUserId = slackUserId;
      }
    }

    // Build the message
    const message = buildUpdateMessage(updateType, enrichedData);

    // Post to channel
    const postResult = await postToChannel(botToken, dealRoom.channelId, message);

    if (!postResult.ok) {
      console.error('Failed to post update:', postResult.error);
      return new Response(
        JSON.stringify({ success: false, error: postResult.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle special cases for deal won/lost
    if (updateType === 'deal_won' || updateType === 'deal_lost') {
      const reasonLabel = updateType === 'deal_won' ? 'WON' : 'LOST';
      const archiveImmediatelyRequested =
        (data as any)?.archiveImmediately === true || (data as any)?.archive_immediately === true;
      await applyDealRoomArchivePolicy({
        supabase,
        botToken,
        dealId,
        orgId: dealRoom.orgId,
        channelId: dealRoom.channelId,
        reasonLabel,
        archiveImmediatelyRequested,
      });
    }

    // Update channel topic for stage changes
    if (updateType === 'stage_change') {
      const { dealName, dealValue, newStage } = data as { dealName?: string; dealValue?: number; newStage?: string };
      if (dealName && dealValue && newStage) {
        const topic = `💰 ${dealName} | ${formatMoney(dealValue, money.currencyCode, money.currencyLocale)} | Stage: ${newStage}`;
        await updateChannelTopic(botToken, dealRoom.channelId, topic);
      }

      // If a deal enters Signed stage, apply the same archive policy as a "close"
      if (newStage && typeof newStage === 'string' && newStage.toLowerCase() === 'signed') {
        const archiveImmediatelyRequested =
          (data as any)?.archiveImmediately === true || (data as any)?.archive_immediately === true;
        await applyDealRoomArchivePolicy({
          supabase,
          botToken,
          dealId,
          orgId: dealRoom.orgId,
          channelId: dealRoom.channelId,
          reasonLabel: 'SIGNED',
          archiveImmediatelyRequested,
        });
      }
    }

    // Record notification
    await supabase.from('slack_notifications_sent').insert({
      org_id: dealRoom.orgId,
      feature: 'deal_rooms',
      entity_type: updateType,
      entity_id: dealId,
      recipient_type: 'channel',
      recipient_id: dealRoom.channelId,
      slack_ts: postResult.ts || '',
      slack_channel_id: dealRoom.channelId,
    });

    console.log(`Deal room update posted: ${updateType} for deal ${dealId}`);
    return new Response(
      JSON.stringify({
        success: true,
        slackTs: postResult.ts,
        channelId: dealRoom.channelId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error posting deal room update:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
