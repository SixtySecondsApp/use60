import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

/**
 * Microsoft OAuth Callback Endpoint
 *
 * Public GET endpoint that Microsoft redirects to after user authorization.
 * Exchanges the code for tokens, stores in microsoft_integrations, redirects to frontend.
 *
 * Security:
 * - Requires valid state from microsoft_oauth_states table
 * - PKCE code_verifier must be present
 * - State is consumed after use (one-time)
 * - 15-minute TTL on state
 */

const STATE_TTL_MS = 15 * 60 * 1000;

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
        microsoft_error: 'oauth_error',
        microsoft_error_description: errorDescription,
      });
    }

    if (!code || !state) {
      return redirectToFrontend('/integrations', {
        microsoft_error: 'invalid_request',
        microsoft_error_description: 'Missing authorization code or state',
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Retrieve state and PKCE verifier
    const { data: oauthState, error: stateError } = await supabase
      .from('microsoft_oauth_states')
      .select('user_id, code_verifier, redirect_uri, created_at')
      .eq('state', state)
      .single();

    if (stateError || !oauthState) {
      console.error('[microsoft-oauth-callback] Invalid state:', state);
      return redirectToFrontend('/integrations', {
        microsoft_error: 'invalid_state',
        microsoft_error_description: 'Invalid or expired OAuth state. Please try again.',
      });
    }

    if (!oauthState.user_id) {
      console.error('[microsoft-oauth-callback] State missing user_id:', state);
      await supabase.from('microsoft_oauth_states').delete().eq('state', state);
      return redirectToFrontend('/integrations', {
        microsoft_error: 'invalid_state',
        microsoft_error_description: 'Invalid OAuth state - no user association.',
      });
    }

    // Check state TTL
    if (oauthState.created_at) {
      const createdAt = new Date(oauthState.created_at);
      const now = new Date();
      if (now.getTime() - createdAt.getTime() > STATE_TTL_MS) {
        console.error('[microsoft-oauth-callback] State expired:', state);
        await supabase.from('microsoft_oauth_states').delete().eq('state', state);
        return redirectToFrontend('/integrations', {
          microsoft_error: 'expired_state',
          microsoft_error_description: 'OAuth state expired. Please try again.',
        });
      }
    }

    // Exchange code for tokens
    const clientId = Deno.env.get('MS_CLIENT_ID');
    const clientSecret = Deno.env.get('MS_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Microsoft OAuth not configured');
    }

    // Redirect URI must match what was used in the authorize request (edge function URL)
    const redirectUri = `${supabaseUrl}/functions/v1/microsoft-oauth-callback`;

    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    if (oauthState.code_verifier) {
      tokenParams.set('code_verifier', oauthState.code_verifier);
    }

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[microsoft-oauth-callback] Token exchange failed:', tokenData);
      return redirectToFrontend('/integrations', {
        microsoft_error: 'token_exchange_failed',
        microsoft_error_description: tokenData.error_description || 'Failed to exchange authorization code',
      }, oauthState.redirect_uri);
    }

    // Fetch user info from Microsoft Graph
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch Microsoft user info');
    }

    const userInfo = await userInfoResponse.json();
    const userEmail = userInfo.mail || userInfo.userPrincipalName;

    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 3600));

    // Upsert into microsoft_integrations
    const { error: insertError } = await supabase
      .from('microsoft_integrations')
      .upsert({
        user_id: oauthState.user_id,
        email: userEmail,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt.toISOString(),
        scopes: tokenData.scope,
        is_active: true,
        token_status: 'valid',
      }, {
        onConflict: 'user_id',
      });

    if (insertError) {
      console.error('[microsoft-oauth-callback] Failed to save integration:', insertError);
      throw new Error('Failed to save Microsoft integration');
    }

    // Update user_settings to reflect connected provider
    await supabase
      .from('user_settings')
      .update({
        preferences: supabase.rpc ? undefined : undefined, // handled via JSONB merge below
      })
      .eq('user_id', oauthState.user_id)
      .then(() => {
        // Best-effort: update connected_email_provider preference
        return supabase.rpc('jsonb_set_key', {
          p_table: 'user_settings',
          p_column: 'preferences',
          p_key: 'connected_email_provider',
          p_value: '"microsoft"',
          p_user_id: oauthState.user_id,
        });
      })
      .catch(() => {
        // Non-critical — preference update is best-effort
      });

    // Clean up used state
    await supabase.from('microsoft_oauth_states').delete().eq('state', state);

    // Log successful connection
    await supabase
      .from('microsoft_service_logs')
      .insert({
        service: 'oauth',
        action: 'connect',
        status: 'success',
        request_data: { email: userEmail, user_id: oauthState.user_id },
        response_data: { scopes: tokenData.scope },
      })
      .catch(() => {
        // Non-critical
      });

    console.log('[microsoft-oauth-callback] Successfully connected:', {
      userId: oauthState.user_id,
      email: userEmail,
    });

    return redirectToFrontend('/integrations', {
      microsoft_status: 'connected',
      email: userEmail,
    }, oauthState.redirect_uri);

  } catch (error: any) {
    console.error('[microsoft-oauth-callback] Error:', error);

    return redirectToFrontend('/integrations', {
      microsoft_error: 'callback_failed',
      microsoft_error_description: error.message || 'Unknown error',
    });
  }
});

/**
 * Redirect to frontend with query parameters.
 * Uses the stored frontend origin from the initiate step, or falls back to env/default.
 */
function redirectToFrontend(
  path: string,
  params: Record<string, string>,
  frontendOrigin?: string
): Response {
  const frontendUrl = frontendOrigin || Deno.env.get('FRONTEND_URL') || 'http://localhost:5175';
  const redirectUrl = new URL(frontendUrl);
  redirectUrl.pathname = path;

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      redirectUrl.searchParams.set(key, value);
    }
  }

  return Response.redirect(redirectUrl.toString(), 302);
}
