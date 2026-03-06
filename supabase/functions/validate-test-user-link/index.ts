/**
 * Validate Test User Link Edge Function
 *
 * Public endpoint that validates a test user magic link token.
 * Checks existence, expiry, and single-use status.
 * Returns org name and email for the signup form.
 */

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ValidateRequest {
  token: string;
}

interface ValidateResponse {
  success: boolean;
  valid: boolean;
  email?: string;
  org_name?: string;
  is_test_user?: boolean;
  error?: string;
}

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, valid: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const request: ValidateRequest = await req.json();

    if (!request.token) {
      return new Response(
        JSON.stringify({ success: false, valid: false, error: 'Missing token' } as ValidateResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up token
    const { data: tokenData, error: lookupError } = await supabaseAdmin
      .from('test_user_magic_links')
      .select('id, token, email, org_name, is_test_user, expires_at, used_at')
      .eq('token', request.token)
      .maybeSingle();

    if (lookupError) {
      console.error('Error looking up test user token:', lookupError);
      return new Response(
        JSON.stringify({ success: false, valid: false, error: 'Failed to validate token' } as ValidateResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenData) {
      return new Response(
        JSON.stringify({ success: true, valid: false, error: 'Token not found' } as ValidateResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiry
    if (new Date() > new Date(tokenData.expires_at)) {
      return new Response(
        JSON.stringify({ success: true, valid: false, error: 'Token has expired' } as ValidateResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already used
    if (tokenData.used_at) {
      return new Response(
        JSON.stringify({ success: true, valid: false, error: 'Token has already been used' } as ValidateResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Valid
    return new Response(
      JSON.stringify({
        success: true,
        valid: true,
        email: tokenData.email,
        org_name: tokenData.org_name,
        is_test_user: tokenData.is_test_user,
      } as ValidateResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error validating test user token:', error);
    return new Response(
      JSON.stringify({ success: false, valid: false, error: error.message || 'Unknown error' } as ValidateResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
