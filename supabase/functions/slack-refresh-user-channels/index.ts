// supabase/functions/slack-refresh-user-channels/index.ts
// Refreshes Slack channels for a user's OAuth integration and caches them in slack_channels

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getAuthContext } from '../_shared/edgeAuth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members: number;
  is_member: boolean;
}

/**
 * Fetch channels from Slack API using user's OAuth token
 * Fetches both public and private channels the bot can access
 */
async function fetchSlackChannels(accessToken: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;

  // Fetch public channels first (bot can see all public channels)
  do {
    const params = new URLSearchParams({
      types: 'public_channel',
      exclude_archived: 'true',
      limit: '1000', // Max limit to get all channels
    });
    if (cursor) params.set('cursor', cursor);

    const response = await fetch(`https://slack.com/api/conversations.list?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Slack API error (public):', result.error);
      throw new Error(result.error);
    }

    for (const channel of result.channels || []) {
      channels.push({
        id: channel.id,
        name: channel.name,
        is_private: false,
        num_members: channel.num_members || 0,
        is_member: channel.is_member || false,
      });
    }

    cursor = result.response_metadata?.next_cursor;
  } while (cursor);

  // Also fetch private channels the bot is a member of
  cursor = undefined;
  do {
    const params = new URLSearchParams({
      types: 'private_channel',
      exclude_archived: 'true',
      limit: '1000',
    });
    if (cursor) params.set('cursor', cursor);

    const response = await fetch(`https://slack.com/api/conversations.list?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const result = await response.json();

    if (!result.ok) {
      // Private channel access might fail if bot doesn't have permission, that's ok
      console.log('Slack API (private channels):', result.error || 'no private channels');
      break;
    }

    for (const channel of result.channels || []) {
      channels.push({
        id: channel.id,
        name: channel.name,
        is_private: true,
        num_members: channel.num_members || 0,
        is_member: channel.is_member || false,
      });
    }

    cursor = result.response_metadata?.next_cursor;
  } while (cursor);

  console.log(`Found ${channels.length} total channels`);

  // Sort by name
  channels.sort((a, b) => a.name.localeCompare(b.name));

  return channels;
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

    if (!auth.userId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { teamId } = await req.json();

    // Get the user's Slack integration
    const query = supabase
      .from('slack_integrations')
      .select('id, access_token, team_id, team_name')
      .eq('user_id', auth.userId)
      .eq('is_active', true);

    if (teamId) {
      query.eq('team_id', teamId);
    }

    const { data: integration, error: integrationError } = await query.single();

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ error: 'No active Slack integration found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch channels from Slack API
    console.log(`Fetching channels for team ${integration.team_name} (${integration.team_id})`);
    const channels = await fetchSlackChannels(integration.access_token);
    console.log(`Found ${channels.length} channels`);

    // Upsert channels to slack_channels table
    const channelsToUpsert = channels.map((channel) => ({
      integration_id: integration.id,
      channel_id: channel.id,
      channel_name: channel.name,
      is_private: channel.is_private,
      is_member: channel.is_member,
      is_archived: false,
      num_members: channel.num_members,
    }));

    if (channelsToUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('slack_channels')
        .upsert(channelsToUpsert, {
          onConflict: 'integration_id,channel_id',
        });

      if (upsertError) {
        console.error('Error upserting channels:', upsertError);
        // Don't fail the request, just log the error
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        channels: channels.map((ch) => ({
          id: ch.id,
          name: ch.name,
          is_private: ch.is_private,
          is_member: ch.is_member,
        })),
        total: channels.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error refreshing Slack channels:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
