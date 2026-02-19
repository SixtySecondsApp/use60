/**
 * fathom-oauth-token Edge Function
 *
 * JWT-protected endpoint that proxies the Fathom OAuth token exchange server-side.
 * Keeps FATHOM_CLIENT_SECRET out of the browser bundle entirely.
 *
 * Accepts POST with JSON body:
 *   { grant_type: 'authorization_code', code: string, redirect_uri: string }
 *   { grant_type: 'refresh_token', refresh_token: string }
 *
 * Returns the raw Fathom token response:
 *   { access_token, refresh_token, expires_in, token_type, ... }
 *
 * Environment variables required (set via Supabase secrets):
 *   FATHOM_CLIENT_ID      — OAuth application client ID
 *   FATHOM_CLIENT_SECRET  — OAuth application client secret (NEVER use VITE_ prefix)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

// =============================================================================
// Types
// =============================================================================

interface TokenRequestBody {
  grant_type: 'authorization_code' | 'refresh_token';
  code?: string;
  redirect_uri?: string;
  refresh_token?: string;
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Only accept POST requests
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // -------------------------------------------------------------------------
    // JWT Authentication — verify the caller is a logged-in user
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('No authorization header', req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return errorResponse('Invalid authentication token', req, 401);
    }

    // -------------------------------------------------------------------------
    // Parse and validate request body
    // -------------------------------------------------------------------------
    let body: TokenRequestBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', req, 400);
    }

    const { grant_type, code, redirect_uri, refresh_token } = body;

    if (!grant_type) {
      return errorResponse('grant_type is required', req, 400);
    }

    if (grant_type === 'authorization_code' && !code) {
      return errorResponse('code is required for authorization_code grant', req, 400);
    }

    if (grant_type === 'refresh_token' && !refresh_token) {
      return errorResponse('refresh_token is required for refresh_token grant', req, 400);
    }

    if (grant_type !== 'authorization_code' && grant_type !== 'refresh_token') {
      return errorResponse(`Unsupported grant_type: ${grant_type}`, req, 400);
    }

    // -------------------------------------------------------------------------
    // Read server-side secrets — never exposed to the browser
    // -------------------------------------------------------------------------
    const clientId = Deno.env.get('FATHOM_CLIENT_ID');
    const clientSecret = Deno.env.get('FATHOM_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('[fathom-oauth-token] Missing FATHOM_CLIENT_ID or FATHOM_CLIENT_SECRET env vars');
      return errorResponse('OAuth credentials not configured', req, 500);
    }

    // -------------------------------------------------------------------------
    // Build the form body for Fathom's token endpoint
    // -------------------------------------------------------------------------
    const formParams: Record<string, string> = {
      grant_type,
      client_id: clientId,
      client_secret: clientSecret,
    };

    if (grant_type === 'authorization_code') {
      formParams.code = code!;
      if (redirect_uri) {
        formParams.redirect_uri = redirect_uri;
      }
    } else {
      // grant_type === 'refresh_token'
      formParams.refresh_token = refresh_token!;
    }

    // -------------------------------------------------------------------------
    // Forward the request to Fathom's OAuth token endpoint
    // -------------------------------------------------------------------------
    const fathomResponse = await fetch('https://fathom.video/external/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(formParams).toString(),
    });

    const responseText = await fathomResponse.text();

    if (!fathomResponse.ok) {
      console.error(
        `[fathom-oauth-token] Fathom token endpoint error: ${fathomResponse.status} - ${responseText}`
      );

      // Parse the error body if it is JSON so we can surface the detail
      let fathomError: unknown = responseText;
      try {
        fathomError = JSON.parse(responseText);
      } catch {
        // leave as plain text
      }

      return jsonResponse(
        { error: 'Token exchange failed', detail: fathomError },
        req,
        fathomResponse.status
      );
    }

    // -------------------------------------------------------------------------
    // Return the token response to the frontend
    // -------------------------------------------------------------------------
    let tokenData: unknown;
    try {
      tokenData = JSON.parse(responseText);
    } catch {
      return errorResponse('Unexpected response from Fathom token endpoint', req, 502);
    }

    return jsonResponse(tokenData, req, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[fathom-oauth-token] Unhandled error:', message);
    return errorResponse('Internal server error', req, 500);
  }
});
