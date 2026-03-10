// supabase/functions/microsoft-oauth-callback/index.ts
// WS-007: Microsoft OAuth Callback — exchanges code for tokens, stores integration

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const STATE_TTL_MS = 15 * 60 * 1000;
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID') || '';
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET') || '';

serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      const errorDescription = url.searchParams.get('error_description') || error;
      return redirectToFrontend('/integrations', {
        error: 'oauth_error',
        error_description: errorDescription,
      });
    }

    if (!code || !state) {
      return redirectToFrontend('/integrations', {
        error: 'invalid_request',
        error_description: 'Missing authorization code or state',
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Retrieve stored OAuth state
    const { data: oauthState, error: stateError } = await supabase
      .from('microsoft_oauth_states')
      .select('user_id, code_verifier, redirect_uri, created_at')
      .eq('state', state)
      .single();

    if (stateError || !oauthState) {
      console.error('[microsoft-oauth-callback] Invalid state:', state);
      return redirectToFrontend('/integrations', {
        error: 'invalid_state',
        error_description: 'Invalid or expired OAuth state. Please try again.',
      });
    }

    if (!oauthState.user_id) {
      await supabase.from('microsoft_oauth_states').delete().eq('state', state);
      return redirectToFrontend('/integrations', {
        error: 'invalid_state',
        error_description: 'Invalid OAuth state - no user association.',
      });
    }

    // Check state TTL
    if (oauthState.created_at) {
      const createdAt = new Date(oauthState.created_at);
      if (Date.now() - createdAt.getTime() > STATE_TTL_MS) {
        await supabase.from('microsoft_oauth_states').delete().eq('state', state);
        return redirectToFrontend('/integrations', {
          error: 'expired_state',
          error_description: 'OAuth state expired. Please try again.',
        });
      }
    }

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      code,
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      redirect_uri: oauthState.redirect_uri,
      grant_type: 'authorization_code',
    });
    if (oauthState.code_verifier) {
      tokenParams.set('code_verifier', oauthState.code_verifier);
    }

    const tokenResponse = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      }
    );

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error('[microsoft-oauth-callback] Token exchange failed:', tokenData);
      return redirectToFrontend('/integrations', {
        error: 'token_exchange_failed',
        error_description: tokenData.error_description || 'Failed to exchange authorization code',
      });
    }

    // Get user info from Microsoft Graph
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch Microsoft user info');
    }

    const userInfo = await userInfoResponse.json();
    const email = userInfo.mail || userInfo.userPrincipalName || '';

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 3600));

    // Upsert integration
    const { error: insertError } = await supabase
      .from('microsoft_integrations')
      .upsert(
        {
          user_id: oauthState.user_id,
          email,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: expiresAt.toISOString(),
          scopes: tokenData.scope || '',
          is_active: true,
          token_status: 'valid',
        },
        { onConflict: 'user_id' }
      );

    if (insertError) {
      console.error('[microsoft-oauth-callback] Failed to save integration:', insertError);
      throw new Error('Failed to save Microsoft integration');
    }

    // Cleanup state
    await supabase.from('microsoft_oauth_states').delete().eq('state', state);

    return redirectToFrontend('/integrations', {
      status: 'connected',
      provider: 'microsoft',
      email,
    });
  } catch (error) {
    console.error('[microsoft-oauth-callback] Error:', error);
    return redirectToFrontend('/integrations', {
      error: 'callback_failed',
      error_description: (error as Error).message || 'Unknown error',
    });
  }
});

function redirectToFrontend(path: string, params: Record<string, string>): Response {
  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'http://localhost:5173';
  const redirectUrl = new URL(frontendUrl);
  redirectUrl.pathname = path;
  for (const [key, value] of Object.entries(params)) {
    if (value) redirectUrl.searchParams.set(key, value);
  }
  return Response.redirect(redirectUrl.toString(), 302);
}
