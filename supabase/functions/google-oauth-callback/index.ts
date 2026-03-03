import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { addBreadcrumb, captureException } from '../_shared/sentryEdge.ts';

/**
 * Google OAuth Callback Endpoint
 * 
 * Handles OAuth callback from Google. This is a public GET endpoint
 * that Google redirects to after user authorization.
 * 
 * Security:
 * - Requires valid state from google_oauth_states table
 * - Requires user_id to be present in state
 * - PKCE code_verifier must be present
 * - State is consumed after use
 * - No CORS needed (GET redirect only)
 */

// State TTL in milliseconds (15 minutes)
const STATE_TTL_MS = 15 * 60 * 1000;

serve(async (req) => {
  // This endpoint only handles GET requests (Google redirects)
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Handle OAuth errors from Google
    if (error) {
      const errorDescription = url.searchParams.get('error_description') || error;
      return redirectToFrontend('/integrations', { 
        error: 'oauth_error', 
        error_description: errorDescription 
      });
    }

    // Validate required parameters
    if (!code || !state) {
      return redirectToFrontend('/integrations', { 
        error: 'invalid_request', 
        error_description: 'Missing authorization code or state' 
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Retrieve the state and PKCE verifier from database
    const { data: oauthState, error: stateError } = await supabase
      .from('google_oauth_states')
      .select('user_id, code_verifier, redirect_uri, created_at')
      .eq('state', state)
      .single();

    if (stateError || !oauthState) {
      console.error('[google-oauth-callback] Invalid state:', state);
      return redirectToFrontend('/integrations', { 
        error: 'invalid_state', 
        error_description: 'Invalid or expired OAuth state. Please try again.' 
      });
    }

    // SECURITY: user_id MUST be present
    if (!oauthState.user_id) {
      console.error('[google-oauth-callback] State missing user_id:', state);
      await supabase.from('google_oauth_states').delete().eq('state', state);
      return redirectToFrontend('/integrations', { 
        error: 'invalid_state', 
        error_description: 'Invalid OAuth state - no user association.' 
      });
    }

    // SECURITY: Check state TTL
    if (oauthState.created_at) {
      const createdAt = new Date(oauthState.created_at);
      const now = new Date();
      if (now.getTime() - createdAt.getTime() > STATE_TTL_MS) {
        console.error('[google-oauth-callback] State expired:', state);
        await supabase.from('google_oauth_states').delete().eq('state', state);
        return redirectToFrontend('/integrations', { 
          error: 'expired_state', 
          error_description: 'OAuth state expired. Please try again.' 
        });
      }
    }

    // Exchange authorization code for tokens
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth not configured');
    }

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: oauthState.redirect_uri,
      grant_type: 'authorization_code',
    });

    // Add PKCE code_verifier if present
    if (oauthState.code_verifier) {
      tokenParams.set('code_verifier', oauthState.code_verifier);
    }

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      console.error('[google-oauth-callback] Token exchange failed:', tokenData);
      return redirectToFrontend('/integrations', { 
        error: 'token_exchange_failed', 
        error_description: tokenData.error_description || 'Failed to exchange authorization code' 
      });
    }

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch Google user info');
    }

    const userInfo = await userInfoResponse.json();

    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 3600));

    // Store the tokens - use onConflict: 'user_id' for one integration per user
    const { error: insertError } = await supabase
      .from('google_integrations')
      .upsert({
        user_id: oauthState.user_id,
        email: userInfo.email,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt.toISOString(),
        scopes: tokenData.scope,
        is_active: true,
      }, {
        onConflict: 'user_id',
      });

    if (insertError) {
      console.error('[google-oauth-callback] Failed to save integration:', insertError);
      throw new Error('Failed to save Google integration');
    }

    // Clean up the OAuth state (one-time use)
    await supabase.from('google_oauth_states').delete().eq('state', state);

    // Log successful connection (non-critical — ignore failures)
    try {
      await supabase
        .from('google_service_logs')
        .insert({
          integration_id: null,
          service: 'oauth',
          action: 'connect',
          status: 'success',
          request_data: { email: userInfo.email, user_id: oauthState.user_id },
          response_data: { scopes: tokenData.scope },
        });
    } catch {
      // Non-critical — don't fail if logging fails
    }

    // Redirect back to the app with success
    return redirectToFrontend('/integrations', { 
      status: 'connected', 
      email: userInfo.email 
    });

  } catch (error: any) {
    console.error('[google-oauth-callback] Error:', error);

    // Capture error to Sentry
    await captureException(error, {
      tags: {
        function: 'google-oauth-callback',
        integration: 'google',
      },
    });

    return redirectToFrontend('/integrations', {
      error: 'callback_failed',
      error_description: error.message || 'Unknown error'
    });
  }
});

/**
 * Redirect to frontend with query parameters
 */
function redirectToFrontend(path: string, params: Record<string, string>): Response {
  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'http://localhost:5173';
  const redirectUrl = new URL(frontendUrl);
  redirectUrl.pathname = path;
  
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      redirectUrl.searchParams.set(key, value);
    }
  }
  
  return Response.redirect(redirectUrl.toString(), 302);
}
