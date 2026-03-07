import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

/**
 * Nylas OAuth Callback
 *
 * Handles redirect from Nylas after user authorizes Gmail read access.
 * Exchanges code for grant_id and stores in nylas_integrations.
 * Updates google_integrations.scope_tier to 'paid'.
 *
 * This endpoint must have verify_jwt = false (redirect from Nylas, no Supabase JWT).
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
      const desc = url.searchParams.get('error_description') || error;
      return redirectToFrontend('/integrations', { error: 'nylas_oauth_error', error_description: desc });
    }

    if (!code || !state) {
      return redirectToFrontend('/integrations', {
        error: 'invalid_request',
        error_description: 'Missing authorization code or state',
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

    // Look up state (stored by nylas-oauth-initiate, code_verifier='nylas')
    const { data: oauthState, error: stateError } = await supabase
      .from('google_oauth_states')
      .select('user_id, redirect_uri, created_at')
      .eq('state', state)
      .eq('code_verifier', 'nylas')
      .maybeSingle();

    if (stateError || !oauthState) {
      console.error('[nylas-oauth-callback] Invalid state:', state);
      return redirectToFrontend('/integrations', {
        error: 'invalid_state',
        error_description: 'Invalid or expired OAuth state. Please try again.',
      });
    }

    // Check TTL
    if (oauthState.created_at) {
      const age = Date.now() - new Date(oauthState.created_at).getTime();
      if (age > STATE_TTL_MS) {
        await supabase.from('google_oauth_states').delete().eq('state', state);
        return redirectToFrontend('/integrations', {
          error: 'expired_state',
          error_description: 'OAuth state expired. Please try again.',
        });
      }
    }

    // Exchange code for token via Nylas v3
    const clientId = Deno.env.get('NYLAS_CLIENT_ID');
    const apiKey = Deno.env.get('NYLAS_API_KEY');
    if (!clientId || !apiKey) {
      throw new Error('Nylas not configured');
    }

    const tokenResponse = await fetch('https://api.us.nylas.com/v3/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: oauthState.redirect_uri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[nylas-oauth-callback] Token exchange failed:', tokenData);
      return redirectToFrontend('/integrations', {
        error: 'token_exchange_failed',
        error_description: tokenData.message || 'Failed to exchange Nylas authorization code',
      });
    }

    const grantId = tokenData.grant_id;
    if (!grantId) {
      throw new Error('No grant_id returned from Nylas token exchange');
    }

    // Get email from the grant
    const grantEmail = tokenData.email || '';

    // Upsert into nylas_integrations
    const { error: upsertError } = await supabase
      .from('nylas_integrations')
      .upsert({
        user_id: oauthState.user_id,
        grant_id: grantId,
        provider: 'google',
        email: grantEmail,
        is_active: true,
      }, {
        onConflict: 'user_id,provider',
      });

    if (upsertError) {
      console.error('[nylas-oauth-callback] Failed to save Nylas integration:', upsertError);
      throw new Error('Failed to save Nylas integration');
    }

    // Update google_integrations scope_tier to 'paid'
    const { error: updateError } = await supabase
      .from('google_integrations')
      .update({ scope_tier: 'paid' })
      .eq('user_id', oauthState.user_id)
      .eq('is_active', true);

    if (updateError) {
      console.warn('[nylas-oauth-callback] Failed to update scope_tier:', updateError.message);
      // Non-critical — Nylas integration still works
    }

    // Clean up state
    await supabase.from('google_oauth_states').delete().eq('state', state);

    console.log('[nylas-oauth-callback] Nylas integration saved for user:', oauthState.user_id);

    return redirectToFrontend('/integrations', { nylas_status: 'connected' });

  } catch (error) {
    console.error('[nylas-oauth-callback] Error:', error.message);
    return redirectToFrontend('/integrations', {
      error: 'server_error',
      error_description: error.message,
    });
  }
});

function redirectToFrontend(path: string, params: Record<string, string>): Response {
  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'http://localhost:5175';
  const url = new URL(path, frontendUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() },
  });
}
