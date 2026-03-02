import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse } from '../_shared/corsHelper.ts';

/**
 * Google OAuth Callback - Public Endpoint
 * 
 * SECURITY: This endpoint handles Google OAuth redirects. It is public but hardened:
 * - Requires valid state parameter from google_oauth_states table
 * - Requires user_id to be associated with the state
 * - Requires PKCE code_verifier to be present
 * - State is consumed (deleted) after use to prevent replay attacks
 * - Narrow CORS (allowlist-based)
 */

// State TTL in milliseconds (15 minutes)
const STATE_TTL_MS = 15 * 60 * 1000;

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Only allow GET (Google redirect) and POST (frontend exchange)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url);
    
    // Handle GET (direct callback from Google)
    if (req.method === 'GET') {
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
          error_description: 'Missing code or state parameter' 
        });
      }

      // Process the OAuth callback
      const result = await processOAuthCallback(code, state);
      
      if (result.success) {
        return redirectToFrontend('/integrations', { 
          status: 'connected', 
          email: result.email || '' 
        });
      } else {
        return redirectToFrontend('/integrations', { 
          error: 'callback_failed', 
          error_description: result.error || 'Unknown error' 
        });
      }
    } 
    
    // Handle POST (frontend exchange)
    if (req.method === 'POST') {
      const body = await req.json();
      const { code, state } = body;
      
      if (!code || !state) {
        return new Response(
          JSON.stringify({ error: 'Missing code or state parameter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await processOAuthCallback(code, state);
      
      if (result.success) {
        return new Response(
          JSON.stringify({ success: true, email: result.email }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({ error: result.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return errorResponse('Method not allowed', req, 405);
  } catch (error: any) {
    console.error('[google-oauth-callback-public] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

/**
 * Process OAuth callback securely
 */
async function processOAuthCallback(
  code: string, 
  state: string
): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    // Initialize Supabase client with service role key
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

    // Retrieve the state from database - REQUIRED
    const { data: oauthState, error: stateError } = await supabase
      .from('google_oauth_states')
      .select('user_id, code_verifier, redirect_uri, created_at')
      .eq('state', state)
      .single();

    // SECURITY: State MUST exist
    if (stateError || !oauthState) {
      console.error('[google-oauth-callback-public] Invalid state:', state);
      return { success: false, error: 'Invalid or expired OAuth state. Please try again.' };
    }

    // SECURITY: user_id MUST be present
    if (!oauthState.user_id) {
      console.error('[google-oauth-callback-public] State missing user_id:', state);
      // Clean up the invalid state
      await supabase.from('google_oauth_states').delete().eq('state', state);
      return { success: false, error: 'Invalid OAuth state - no user association. Please try again.' };
    }

    // SECURITY: PKCE code_verifier MUST be present
    if (!oauthState.code_verifier) {
      console.error('[google-oauth-callback-public] State missing code_verifier:', state);
      // Clean up the invalid state
      await supabase.from('google_oauth_states').delete().eq('state', state);
      return { success: false, error: 'Invalid OAuth state - missing PKCE. Please try again.' };
    }

    // SECURITY: Check state TTL (15 minutes)
    if (oauthState.created_at) {
      const createdAt = new Date(oauthState.created_at);
      const now = new Date();
      if (now.getTime() - createdAt.getTime() > STATE_TTL_MS) {
        console.error('[google-oauth-callback-public] State expired:', state);
        // Clean up expired state
        await supabase.from('google_oauth_states').delete().eq('state', state);
        return { success: false, error: 'OAuth state expired. Please try again.' };
      }
    }

    // Exchange code for tokens
    const result = await exchangeCodeForTokens(
      code, 
      oauthState.redirect_uri, 
      oauthState.code_verifier, 
      supabase, 
      oauthState.user_id
    );
    
    // Clean up the OAuth state after use (one-time use)
    await supabase.from('google_oauth_states').delete().eq('state', state);
    
    return result;
  } catch (error: any) {
    console.error('[google-oauth-callback-public] processOAuthCallback error:', error);
    return { success: false, error: error.message || 'Failed to process OAuth callback' };
  }
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string, 
  redirectUri: string, 
  codeVerifier: string,
  supabase: any,
  userId: string
): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth not configured');
    }

    // Exchange authorization code for tokens with PKCE
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      console.error('[google-oauth-callback-public] Token exchange failed:', tokenData);
      return { 
        success: false, 
        error: tokenData.error_description || 'Failed to exchange authorization code' 
      };
    }

    // Get user info from Google to verify and get email
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      return { success: false, error: 'Failed to fetch Google user info' };
    }

    const userInfo = await userInfoResponse.json();

    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 3600));

    // Store the tokens in the database
    const { error: insertError } = await supabase
      .from('google_integrations')
      .upsert({
        user_id: userId,
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
      console.error('[google-oauth-callback-public] Failed to save integration:', insertError);
      return { success: false, error: 'Failed to save Google integration' };
    }

    // Log successful connection
    await supabase
      .from('google_service_logs')
      .insert({
        integration_id: null,
        service: 'oauth',
        action: 'connect',
        status: 'success',
        request_data: { email: userInfo.email, user_id: userId },
        response_data: { scopes: tokenData.scope },
      }).catch(() => {
        // Non-critical - don't fail if logging fails
      });

    return { success: true, email: userInfo.email };
  } catch (error: any) {
    console.error('[google-oauth-callback-public] exchangeCodeForTokens error:', error);
    return { success: false, error: error.message || 'Token exchange failed' };
  }
}
