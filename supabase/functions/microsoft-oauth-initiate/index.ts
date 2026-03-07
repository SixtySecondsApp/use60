import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

async function generatePKCEChallenge() {
  const codeVerifier = crypto.randomUUID() + crypto.randomUUID(); // 72 chars
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { codeVerifier, codeChallenge };
}

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

    let requestOrigin: string | undefined;
    try {
      const requestBody = await req.json();
      requestOrigin = requestBody.origin;
    } catch {
      // Continue without origin
    }

    const ALLOWED_ORIGINS = [
      'http://localhost:5173',
      'http://localhost:5175',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5175',
      'https://app.use60.com',
      'https://use60.com',
      'https://www.use60.com',
      'https://staging.use60.com',
      'https://sixty-sales-dashboard.vercel.app',
    ];

    if (requestOrigin && !ALLOWED_ORIGINS.includes(requestOrigin)) {
      const isVercelPreview = /^https:\/\/[a-z0-9-]+-sixty-sales-dashboard\.vercel\.app$/.test(requestOrigin);
      if (!isVercelPreview) {
        console.warn(`[microsoft-oauth-initiate] Rejected disallowed origin: ${requestOrigin}`);
        requestOrigin = undefined;
      }
    }

    // Build redirect URI — Microsoft callback goes through our edge function
    let redirectUri: string;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    // The callback is an edge function, not a frontend route
    redirectUri = `${supabaseUrl}/functions/v1/microsoft-oauth-callback`;

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Invalid authentication token');
    }

    const { codeVerifier, codeChallenge } = await generatePKCEChallenge();
    const state = crypto.randomUUID();

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Store the frontend origin so the callback knows where to redirect
    const frontendRedirectUri = requestOrigin || Deno.env.get('FRONTEND_URL') || 'http://localhost:5175';

    const { error: stateError } = await supabase
      .from('microsoft_oauth_states')
      .insert({
        user_id: user.id,
        state,
        code_verifier: codeVerifier,
        code_challenge: codeChallenge,
        redirect_uri: frontendRedirectUri,
        expires_at: expiresAt.toISOString(),
      });

    if (stateError) {
      console.error('[microsoft-oauth-initiate] Failed to store state:', stateError);
      throw new Error(`Failed to initialize OAuth flow: ${stateError.message}`);
    }

    console.log('[microsoft-oauth-initiate] OAuth state created:', {
      state: state.slice(0, 8) + '...',
      userId: user.id,
      expiresAt: expiresAt.toISOString(),
    });

    const clientId = Deno.env.get('MS_CLIENT_ID');
    if (!clientId) {
      throw new Error('Microsoft OAuth not configured');
    }

    const scopes = [
      'offline_access',
      'openid',
      'profile',
      'email',
      'User.Read',
      'Mail.Read',
      'Mail.ReadWrite',
      'Mail.Send',
      'Calendars.ReadWrite',
    ];

    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString(), state }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
