// supabase/functions/slack-list-channels/index.ts
// Lists available Slack channels for the settings UI

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';

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

/**
 * Fetch channels from Slack API
 */
async function fetchSlackChannels(botToken: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;

  // Fetch public channels
  do {
    const params = new URLSearchParams({
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '200',
    });
    if (cursor) params.set('cursor', cursor);

    const response = await fetch(`https://slack.com/api/conversations.list?${params}`, {
      headers: {
        'Authorization': `Bearer ${botToken}`,
      },
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Slack API error:', result.error);
      throw new Error(result.error);
    }

    for (const channel of result.channels || []) {
      channels.push({
        id: channel.id,
        name: channel.name,
        is_private: channel.is_private,
        num_members: channel.num_members || 0,
        is_member: channel.is_member || false,
      });
    }

    cursor = result.response_metadata?.next_cursor;
  } while (cursor);

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

    const { orgId } = await req.json();

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'orgId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // External release hardening:
    // - Only org admins (or platform admins) can list channels for configuration.
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

    // Fetch channels
    const channels = await fetchSlackChannels(botToken);

    return new Response(
      JSON.stringify({
        success: true,
        channels,
        total: channels.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching Slack channels:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
