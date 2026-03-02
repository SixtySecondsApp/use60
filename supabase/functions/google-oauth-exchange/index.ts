import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse } from '../_shared/corsHelper.ts';

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Get CORS headers for actual request
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    // Get the authorization header - this is an authenticated endpoint
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Get the request body
    let body: any;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('[google-oauth-exchange] Failed to parse JSON body:', parseError);
      throw new Error('Invalid JSON body');
    }

    const { code, state } = body;

    console.log('[google-oauth-exchange] Received request:', {
      hasCode: !!code,
      codeLength: code?.length || 0,
      hasState: !!state,
      stateLength: state?.length || 0,
      bodyKeys: Object.keys(body || {}),
    });

    if (!code || !state) {
      console.error('[google-oauth-exchange] Missing parameters:', {
        code: code ? `present (${code.length} chars)` : 'MISSING',
        state: state ? `present (${state.length} chars)` : 'MISSING',
        receivedBody: JSON.stringify(body).slice(0, 200),
      });
      throw new Error('Missing code or state parameter');
    }
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Verify the JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid authentication token');
    }
    // Retrieve the state and PKCE verifier from database
    const { data: oauthState, error: stateError } = await supabase
      .from('google_oauth_states')
      .select('user_id, code_verifier, redirect_uri')
      .eq('state', state)
      .eq('user_id', user.id) // Ensure the state belongs to this user
      .single();

    if (stateError || !oauthState) {
      console.error('[google-oauth-exchange] State lookup failed:', {
        state,
        userId: user.id,
        error: stateError,
        oauthState,
      });
      throw new Error(`Invalid or expired state parameter. State: ${state?.slice(0, 8)}...`);
    }
    // Exchange authorization code for tokens
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
    const redirectUri = oauthState.redirect_uri;

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: oauthState.code_verifier,
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
      throw new Error(tokenData.error_description || 'Failed to exchange authorization code');
    }
    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    const userInfo = await userInfoResponse.json();
    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

    // Store or update the Google integration
    const { data: existingIntegration } = await supabase
      .from('google_integrations')
      .select('id')
      .eq('user_id', user.id)
      .single();

    let integrationResult;
    
    if (existingIntegration) {
      // Update existing integration
      integrationResult = await supabase
        .from('google_integrations')
        .update({
          email: userInfo.email,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          expires_at: expiresAt.toISOString(),
          scopes: tokenData.scope || '',
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingIntegration.id)
        .select()
        .single();
    } else {
      // Create new integration
      integrationResult = await supabase
        .from('google_integrations')
        .insert({
          user_id: user.id,
          email: userInfo.email,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          expires_at: expiresAt.toISOString(),
          scopes: tokenData.scope || '',
          is_active: true,
        })
        .select()
        .single();
    }

    if (integrationResult.error) {
      throw new Error('Failed to save Google integration');
    }
    // Clean up the OAuth state
    await supabase
      .from('google_oauth_states')
      .delete()
      .eq('state', state);

    // Log the successful integration
    await supabase
      .from('google_service_logs')
      .insert({
        integration_id: integrationResult.data.id,
        service: 'oauth',
        action: 'connect',
        status: 'success',
        request_data: { email: userInfo.email },
        response_data: { scopes: tokenData.scope },
      });
    return new Response(
      JSON.stringify({
        success: true,
        email: userInfo.email,
        integration_id: integrationResult.data.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});