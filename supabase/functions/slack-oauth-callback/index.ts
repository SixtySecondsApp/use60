import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { captureException } from '../_shared/sentryEdge.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // For OAuth callbacks, we don't need JWT verification
  // Slack will call this directly without any auth headers
  if (req.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const publicUrl = Deno.env.get('PUBLIC_URL') || 'https://app.use60.com';

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // Contains user_id and org_id
    const error = url.searchParams.get('error');

    // Handle user cancellation or errors from Slack
    if (error) {
      const redirectUrl = `${publicUrl}/settings/integrations/slack?slack_error=${encodeURIComponent(error)}`;
      return new Response(null, {
        status: 302,
        headers: { 'Location': redirectUrl, ...corsHeaders },
      });
    }

    if (!code) {
      throw new Error('No authorization code provided');
    }

    // Parse state to get user_id and org_id
    let userId: string;
    let orgId: string | undefined;
    try {
      const stateData = JSON.parse(atob(state || ''));
      userId = stateData.user_id;
      orgId = stateData.org_id;
    } catch (e) {
      throw new Error('Invalid state parameter');
    }

    // Exchange code for access token
    const clientId = Deno.env.get('SLACK_CLIENT_ID')!;
    const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET')!;
    const redirectUri = `${supabaseUrl}/functions/v1/slack-oauth-callback`;

    const slackResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const slackData = await slackResponse.json();
    console.log('Slack OAuth response:', JSON.stringify(slackData, null, 2));

    if (!slackData.ok) {
      throw new Error(`Slack OAuth failed: ${slackData.error}`);
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user's org if not provided in state
    if (!orgId) {
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .limit(1)
        .single();

      orgId = membership?.org_id;
    }

    if (!orgId) {
      throw new Error('Could not determine organization for user');
    }

    // External release hardening:
    // Ensure the user completing OAuth is actually a member of the org they are connecting.
    const { data: membershipCheck } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single();

    if (!membershipCheck?.role) {
      throw new Error('Unauthorized: user is not a member of this organization');
    }

    // Store in slack_org_settings (org-level)
    const { error: orgSettingsError } = await supabase
      .from('slack_org_settings')
      .upsert({
        org_id: orgId,
        slack_team_id: slackData.team?.id,
        slack_team_name: slackData.team?.name,
        bot_access_token: slackData.access_token,
        bot_user_id: slackData.bot_user_id,
        is_connected: true,
        connected_at: new Date().toISOString(),
        connected_by: userId,
      }, {
        onConflict: 'org_id',
      });

    if (orgSettingsError) {
      console.error('Error saving org settings:', orgSettingsError);
      throw new Error(`Database error: ${orgSettingsError.message}`);
    }

    // Also store in legacy slack_integrations for backward compatibility
    const { error: legacyError } = await supabase
      .from('slack_integrations')
      .upsert({
        user_id: userId,
        team_id: slackData.team?.id,
        team_name: slackData.team?.name,
        access_token: slackData.access_token,
        bot_user_id: slackData.bot_user_id || '',
        app_id: slackData.app_id || '',
        authed_user: slackData.authed_user || {},
        scope: slackData.scope || '',
        token_type: 'bot',
        is_active: true,
      }, {
        onConflict: 'user_id,team_id',
        ignoreDuplicates: false,
      });

    // Ignore legacy table errors (table might not exist)
    if (legacyError) {
      console.warn('Legacy table error (non-critical):', legacyError.message);
    }

    // Fetch workspace users and create mappings
    try {
      const usersResponse = await fetch('https://slack.com/api/users.list', {
        headers: {
          'Authorization': `Bearer ${slackData.access_token}`,
        },
      });

      const usersData = await usersResponse.json();

      if (usersData.ok && usersData.members) {
        const userMappings = usersData.members
          .filter((member: any) => !member.is_bot && !member.deleted && member.id !== 'USLACKBOT')
          .map((member: any) => ({
            org_id: orgId,
            slack_user_id: member.id,
            slack_username: member.name,
            slack_display_name: member.profile?.display_name || member.real_name,
            slack_email: member.profile?.email,
            slack_avatar_url: member.profile?.image_72,
            is_auto_matched: false,
          }));

        if (userMappings.length > 0) {
          await supabase
            .from('slack_user_mappings')
            .upsert(userMappings, {
              onConflict: 'org_id,slack_user_id',
            });
        }

        // Try to auto-match users by email
        for (const mapping of userMappings) {
          if (mapping.slack_email) {
            const { data: sixtyUser } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', mapping.slack_email)
              .single();

            if (sixtyUser) {
              await supabase
                .from('slack_user_mappings')
                .update({
                  sixty_user_id: sixtyUser.id,
                  is_auto_matched: true,
                })
                .eq('org_id', orgId)
                .eq('slack_user_id', mapping.slack_user_id);
            }
          }
        }
      }
    } catch (userError) {
      console.warn('Error fetching Slack users (non-critical):', userError);
    }

    // Redirect back to the app with success
    const redirectUrl = `${publicUrl}/settings/integrations/slack?slack_connected=true`;

    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        ...corsHeaders,
      },
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    await captureException(error, {
      tags: {
        function: 'slack-oauth-callback',
        integration: 'slack',
      },
    });

    // Redirect with error
    const redirectUrl = `${publicUrl}/settings/integrations/slack?slack_error=${encodeURIComponent(error.message)}`;

    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        ...corsHeaders,
      },
    });
  }
});
