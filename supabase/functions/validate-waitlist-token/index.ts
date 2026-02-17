/**
 * Validate Waitlist Token Edge Function
 *
 * Validates a custom waitlist magic token before allowing password creation
 * Checks that the token exists, hasn't expired, and hasn't been used
 */

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ValidateTokenRequest {
  token: string;
}

interface ValidateTokenResponse {
  success: boolean;
  valid: boolean;
  waitlist_entry_id?: string;
  user_id?: string; // Added for direct user invitations
  email?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const request: ValidateTokenRequest = await req.json();

    if (!request.token) {
      return new Response(
        JSON.stringify({
          success: false,
          valid: false,
          error: 'Missing token'
        } as ValidateTokenResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for database access
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Look up token (select both waitlist_entry_id and user_id)
    const { data: tokenData, error: lookupError } = await supabaseAdmin
      .from('waitlist_magic_tokens')
      .select('id, token, waitlist_entry_id, user_id, email, expires_at, used_at')
      .eq('token', request.token)
      .maybeSingle();

    if (lookupError) {
      console.error('Error looking up token:', lookupError);
      return new Response(
        JSON.stringify({
          success: false,
          valid: false,
          error: 'Failed to validate token'
        } as ValidateTokenResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenData) {
      return new Response(
        JSON.stringify({
          success: true,
          valid: false,
          error: 'Token not found or expired'
        } as ValidateTokenResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token has expired
    const now = new Date();
    const expiresAt = new Date(tokenData.expires_at);

    if (now > expiresAt) {
      return new Response(
        JSON.stringify({
          success: true,
          valid: false,
          error: 'Token has expired'
        } as ValidateTokenResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token has already been used
    if (tokenData.used_at) {
      return new Response(
        JSON.stringify({
          success: true,
          valid: false,
          error: 'Token has already been used'
        } as ValidateTokenResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Token is valid (return both waitlist_entry_id and user_id if present)
    return new Response(
      JSON.stringify({
        success: true,
        valid: true,
        waitlist_entry_id: tokenData.waitlist_entry_id,
        user_id: tokenData.user_id,
        email: tokenData.email
      } as ValidateTokenResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error validating token:', error);
    return new Response(
      JSON.stringify({
        success: false,
        valid: false,
        error: error.message || 'Unknown error'
      } as ValidateTokenResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
