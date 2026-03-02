import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

// Helper function to generate PKCE challenge
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
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Get request body to extract redirect URI and scope tier
    let requestOrigin: string | undefined;
    let scopeTier: 'base' | 'full' = 'base';
    try {
      const requestBody = await req.json();
      requestOrigin = requestBody.origin;
      if (requestBody.scope_tier === 'full') {
        scopeTier = 'full';
      }
    } catch (error) {
      // If JSON parsing fails, continue with defaults
    }

    // Allowlist of valid origins to prevent open redirect attacks
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

    // Validate the origin against the allowlist
    if (requestOrigin && !ALLOWED_ORIGINS.includes(requestOrigin)) {
      // Also allow project-specific Vercel preview deployments
      const isVercelPreview = /^https:\/\/[a-z0-9-]+-sixty-sales-dashboard\.vercel\.app$/.test(requestOrigin);
      if (!isVercelPreview) {
        console.warn(`[google-oauth-initiate] Rejected disallowed origin: ${requestOrigin}`);
        requestOrigin = undefined; // Fall back to default
      }
    }

    // Dynamically determine redirect URI based on validated request origin
    let redirectUri: string;
    if (requestOrigin) {
      redirectUri = `${requestOrigin}/auth/google/callback`;
    } else {
      // Fallback to environment variable or localhost
      redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI') || 'http://localhost:5173/auth/google/callback';
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
    // Generate PKCE parameters
    const { codeVerifier, codeChallenge } = await generatePKCEChallenge();
    
    // Generate a secure random state
    const state = crypto.randomUUID();
    
    // Store the state and PKCE verifier in the database with dynamic redirect URI
    // OAuth states expire after 10 minutes
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const { error: stateError } = await supabase
      .from('google_oauth_states')
      .insert({
        user_id: user.id,
        state: state,
        code_verifier: codeVerifier,
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
        expires_at: expiresAt.toISOString(),
      });

    if (stateError) {
      console.error('[google-oauth-initiate] Failed to store state:', stateError);
      throw new Error(`Failed to initialize OAuth flow: ${stateError.message}`);
    }

    console.log('[google-oauth-initiate] OAuth state created successfully:', {
      state: state.slice(0, 8) + '...',
      userId: user.id,
      expiresAt: expiresAt.toISOString(),
    });

    // Get Google OAuth configuration
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    
    if (!clientId) {
      throw new Error('Google OAuth not configured');
    }

    // Define the base scopes (sensitive-tier only — no restricted scopes)
    // NOTE: gmail.compose and gmail.send are restricted-tier scopes requiring Google CASA verification.
    // Phase 1 uses base tier only. Phase 2 will allow opting into 'full' tier once verification completes.
    const baseScopes = [
      // User info
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',

      // Gmail (sensitive-tier scopes only)
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.labels',

      // Google Calendar
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',

      // Google Drive
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/drive.file',

      // Google Docs
      'https://www.googleapis.com/auth/documents',

      // Google Tasks
      'https://www.googleapis.com/auth/tasks',
    ];

    // Full tier adds restricted Gmail send/compose scopes (requires Google app verification)
    const fullScopes = [
      ...baseScopes,
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
    ];

    const scopes = scopeTier === 'full' ? fullScopes : baseScopes;

    // Build the authorization URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline'); // To get refresh token
    authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    // Preserve previously granted scopes when requesting additional ones (incremental auth)
    authUrl.searchParams.set('include_granted_scopes', 'true');
    return new Response(
      JSON.stringify({ 
        authUrl: authUrl.toString(),
        state: state 
      }),
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error' 
      }),
      {
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
      }
    );
  }
});