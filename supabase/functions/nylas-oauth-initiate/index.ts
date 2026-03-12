import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getNylasClientId } from '../_shared/nylasClient.ts';

/**
 * Nylas OAuth Initiate
 *
 * Starts the Nylas Hosted OAuth flow for Google or Microsoft provider.
 * Used to access Calendar through Nylas's pre-verified apps
 * (no CASA assessment or Azure app needed).
 *
 * Accepts optional `provider` in request body: 'google' (default) or 'microsoft'.
 */

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const body = await req.json().catch(() => ({}));
    const provider = (body.provider === 'microsoft') ? 'microsoft' : 'google';

    // Authenticate user
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      throw new Error('Invalid authentication token');
    }

    // Build Nylas Hosted OAuth URL
    const clientId = getNylasClientId();
    const state = crypto.randomUUID();

    // Determine callback URL — must point to the edge function, not the frontend
    const redirectUri = `${supabaseUrl}/functions/v1/nylas-oauth-callback`;

    // Store state for callback verification
    // Reuse google_oauth_states table with a provider marker
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const { error: stateError } = await supabase
      .from('google_oauth_states')
      .insert({
        user_id: user.id,
        state,
        code_verifier: 'nylas', // marker to identify Nylas flow in callback
        code_challenge: provider, // store provider for callback to read
        redirect_uri: redirectUri,
        scope_tier: 'paid',
        expires_at: expiresAt.toISOString(),
      });

    if (stateError) {
      console.error('[nylas-oauth-initiate] Failed to store state:', stateError);
      throw new Error('Failed to initialize Nylas OAuth flow');
    }

    // Nylas v3 Hosted OAuth authorization URL
    const authUrl = new URL('https://api.us.nylas.com/v3/connect/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('provider', provider);
    // Request calendar scopes through Nylas
    authUrl.searchParams.set('scope', 'calendar');

    console.log(`[nylas-oauth-initiate] Auth URL generated for user: ${user.id}, provider: ${provider}`);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString(), state }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[nylas-oauth-initiate] Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
