// supabase/functions/oauth-initiate/providers/microsoft.ts
// WS-007: Microsoft OAuth Flow — PKCE to Microsoft Identity Platform

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../../_shared/corsHelper.ts';

const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID') || '';
const MS_SCOPES = [
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.ReadWrite',
  'Files.ReadWrite',
  'Contacts.Read',
  'User.Read',
  'offline_access',
].join(' ');

async function generatePKCEChallenge() {
  const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { codeVerifier, codeChallenge };
}

export async function handleInitiate(req: Request): Promise<Response> {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    let requestOrigin: string | undefined;
    try {
      const body = await req.json();
      requestOrigin = body.origin;
    } catch { /* no body */ }

    // Determine redirect URI (same pattern as Google)
    const origin = requestOrigin || req.headers.get('origin') || 'http://localhost:5175';
    const redirectUri = `${origin}/auth/microsoft/callback`;

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error('Invalid authentication token');

    // Generate PKCE + state
    const { codeVerifier, codeChallenge } = await generatePKCEChallenge();
    const state = crypto.randomUUID();

    // Store state for callback validation
    const { error: stateError } = await supabase
      .from('microsoft_oauth_states')
      .insert({
        user_id: user.id,
        state,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      });

    if (stateError) throw new Error(`Failed to store OAuth state: ${stateError.message}`);

    // Build Microsoft authorization URL
    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.searchParams.set('client_id', MS_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', MS_SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('response_mode', 'query');

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Microsoft OAuth initiate error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
