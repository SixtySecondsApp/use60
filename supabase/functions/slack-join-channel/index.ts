// supabase/functions/slack-join-channel/index.ts
// Joins the Slack bot to a public channel on behalf of the org

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const auth = await getAuthContext(req, supabase, supabaseServiceKey);

    const { orgId, channelId } = await req.json();

    if (!orgId || !channelId) {
      return new Response(
        JSON.stringify({ error: 'orgId and channelId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only org admins/owners can join the bot to channels
    if (auth.mode === 'user' && auth.userId && !auth.isPlatformAdmin) {
      await requireOrgRole(supabase, orgId, auth.userId, ['owner', 'admin']);
    }

    // Get bot token
    const botToken = await getSlackBotToken(supabase, orgId);
    if (!botToken) {
      return new Response(
        JSON.stringify({ error: 'Slack not connected for this organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Slack conversations.join API
    const slackResponse = await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId }),
    });

    const slackResult = await slackResponse.json();

    if (!slackResult.ok) {
      const slackError = slackResult.error;
      console.error('Slack conversations.join error:', slackError);

      // Map Slack errors to user-friendly messages
      const errorMessages: Record<string, string> = {
        method_not_supported_for_channel_type: 'Cannot join private channels. Type /invite @Sixty in the channel instead.',
        channel_not_found: 'Channel not found. It may have been deleted.',
        is_archived: 'This channel is archived and cannot be joined.',
        already_in_channel: 'Bot is already in this channel.',
        missing_scope: 'Bot lacks the channels:join permission. Please reinstall the Slack app.',
      };

      return new Response(
        JSON.stringify({
          error: errorMessages[slackError] || `Slack error: ${slackError}`,
          slack_error: slackError,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const channel = slackResult.channel;

    return new Response(
      JSON.stringify({
        success: true,
        channel: {
          id: channel.id,
          name: channel.name,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error joining Slack channel:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
