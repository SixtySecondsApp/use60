import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      throw new Error('No authorization provided');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      channel,
      message,
      blocks,
      attachments,
      team_id,
      user_id: bodyUserId,
      org_id: bodyOrgId,
    } = body;

    // Support service role auth (orchestrator inter-function calls)
    const isServiceRole = authHeader === supabaseServiceKey;
    let userId: string;

    if (isServiceRole) {
      if (!bodyUserId) {
        throw new Error('Service role calls must include user_id');
      }
      userId = bodyUserId;
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
      if (authError || !user) {
        throw new Error('Unauthorized');
      }
      userId = user.id;
    }

    // Get the user's Slack integration (needed early for DM fallback)
    let { data: integration, error: integrationError } = await supabase
      .from('slack_integrations')
      .select('id, user_id, team_id, team_name, access_token, bot_user_id, authed_user, scope, is_active')
      .eq('user_id', userId)
      .eq('team_id', team_id || '')
      .eq('is_active', true)
      .maybeSingle();

    if (integrationError || !integration) {
      // If no team_id provided, try to get the first active integration
      const { data: firstIntegration, error: firstError } = await supabase
        .from('slack_integrations')
        .select('id, user_id, team_id, team_name, access_token, bot_user_id, authed_user, scope, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (firstError || !firstIntegration) {
        throw new Error('No active Slack integration found. Please connect Slack first.');
      }

      integration = firstIntegration;
    }

    // Support orchestrator-style calls with message_type + data (no explicit channel)
    let resolvedChannel = channel;
    let resolvedMessage = message;
    let resolvedBlocks = blocks;

    if (!channel && body.message_type) {
      // Look up org's default Slack channel
      if (!bodyOrgId) {
        throw new Error('org_id required for message_type calls');
      }
      const { data: orgSettings } = await supabase
        .from('organization_settings')
        .select('slack_default_channel_id')
        .eq('organization_id', bodyOrgId)
        .maybeSingle();

      resolvedChannel = orgSettings?.slack_default_channel_id;

      if (!resolvedChannel) {
        // Fallback: DM the user directly via Slack
        console.log('[send-slack-message] No default channel for org, falling back to user DM');

        // Try to get user's Slack user ID from profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('slack_user_id')
          .eq('id', userId)
          .maybeSingle();

        let slackUserId = profile?.slack_user_id;

        // Fallback: try authed_user from the OAuth integration
        if (!slackUserId && integration.authed_user) {
          const authedUser = typeof integration.authed_user === 'string'
            ? JSON.parse(integration.authed_user)
            : integration.authed_user;
          slackUserId = authedUser?.id;
        }

        if (slackUserId) {
          // Open a DM channel with the user
          const dmResponse = await fetch('https://slack.com/api/conversations.open', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${integration.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ users: slackUserId }),
          });
          const dmData = await dmResponse.json();
          if (dmData.ok && dmData.channel?.id) {
            resolvedChannel = dmData.channel.id;
            console.log(`[send-slack-message] Opened DM channel: ${resolvedChannel}`);
          }
        }
      }

      // Format message based on message_type
      const data = body.data || {};
      switch (body.message_type) {
        case 'coaching_digest':
          resolvedMessage = `*Weekly Coaching Digest*\n${data.summary || data.executive_summary || JSON.stringify(data).substring(0, 500)}`;
          break;
        case 'campaign_report':
          resolvedMessage = `*Campaign Report*\n${data.summary || data.executive_summary || JSON.stringify(data).substring(0, 500)}`;
          break;
        default:
          resolvedMessage = `*${body.message_type}*\n${JSON.stringify(data).substring(0, 500)}`;
      }
    }

    if (!resolvedChannel || !resolvedMessage) {
      throw new Error('Channel and message are required');
    }

    // Prepare the Slack message
    const slackMessage: any = {
      channel: resolvedChannel,
      text: resolvedMessage,
    };

    if (resolvedBlocks) {
      slackMessage.blocks = resolvedBlocks;
    }

    if (attachments) {
      slackMessage.attachments = attachments;
    }

    // Send message to Slack using Web API
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    const slackData = await slackResponse.json();

    if (!slackData.ok) {
      // Handle specific Slack errors
      if (slackData.error === 'not_in_channel') {
        // Try to join the channel first
        const joinResponse = await fetch('https://slack.com/api/conversations.join', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${integration.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channel: resolvedChannel }),
        });

        const joinData = await joinResponse.json();
        
        if (joinData.ok) {
          // Retry sending the message
          const retryResponse = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${integration.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(slackMessage),
          });

          const retryData = await retryResponse.json();
          
          if (!retryData.ok) {
            throw new Error(`Slack API error: ${retryData.error}`);
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'Message sent after joining channel',
              ts: retryData.ts,
              channel: retryData.channel 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }
      }

      throw new Error(`Slack API error: ${slackData.error}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Message sent to Slack',
        ts: slackData.ts,
        channel: slackData.channel 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});