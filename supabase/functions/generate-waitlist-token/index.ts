/**
 * Generate Waitlist Token Edge Function
 *
 * Generates a custom magic token for waitlist invitations
 * Tokens expire after 24 hours and can only be used once
 * This allows full control over the signup flow without Supabase auto-creating users
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
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface GenerateTokenRequest {
  waitlist_entry_id?: string; // Optional - for waitlist invites
  user_id?: string; // Optional - for direct user invites
  email: string;
}

// Generate a secure random token (64-character hex string)
function generateSecureToken(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate the request - require EDGE_FUNCTION_SECRET, service role, or valid user JWT with admin access
    const authHeader = req.headers.get('Authorization');
    const apikeyHeader = req.headers.get('apikey');

    // Check for EDGE_FUNCTION_SECRET (inter-function calls from other edge functions)
    const isEdgeFunctionAuth = (() => {
      if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
      const token = authHeader.replace(/^Bearer\s+/i, '');
      return token === EDGE_FUNCTION_SECRET;
    })();

    if (isEdgeFunctionAuth) {
      // Authenticated via EDGE_FUNCTION_SECRET - proceed
    } else {
      // Check if service role
      const isServiceRole = authHeader?.replace(/^Bearer\s+/i, '') === SUPABASE_SERVICE_ROLE_KEY ||
                            apikeyHeader === SUPABASE_SERVICE_ROLE_KEY;

      if (!isServiceRole) {
        // If not service role or edge function secret, validate as user JWT and check admin status
        if (!authHeader) {
          return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized: authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

        if (authError || !user) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Unauthorized: invalid authentication',
              details: { message: authError?.message || 'User not found' }
            }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if user is an admin
        const { data: profile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();

        if (profileError || !profile?.is_admin) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Unauthorized: admin access required',
              details: { message: 'Only administrators can generate waitlist tokens' }
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    const request: GenerateTokenRequest = await req.json();

    // Must have either waitlist_entry_id OR user_id, plus email
    if ((!request.waitlist_entry_id && !request.user_id) || !request.email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing (waitlist_entry_id or user_id) and email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with explicit service role configuration
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      db: {
        schema: 'public',
      },
    });

    // Generate token
    const token = generateSecureToken();

    // Calculate expiry (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Verify the waitlist entry exists if provided
    if (request.waitlist_entry_id) {
      const { data: entryExists, error: entryCheckError } = await supabaseAdmin
        .from('meetings_waitlist')
        .select('id')
        .eq('id', request.waitlist_entry_id)
        .maybeSingle();

      if (entryCheckError) {
        console.error('Error checking waitlist entry:', entryCheckError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Failed to verify waitlist entry',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!entryExists) {
        console.error('Waitlist entry not found:', request.waitlist_entry_id);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Waitlist entry not found',
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If user_id provided, verify the user exists
    if (request.user_id) {
      const { data: userExists, error: userCheckError } = await supabaseAdmin.auth.admin.getUserById(request.user_id);

      if (userCheckError || !userExists?.user) {
        console.error('User not found:', request.user_id, userCheckError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'User not found',
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Insert token into database (either with waitlist_entry_id OR user_id)
    const tokenRecord: any = {
      token,
      email: request.email.toLowerCase(),
      expires_at: expiresAt.toISOString(),
    };

    // Add the appropriate ID field
    if (request.waitlist_entry_id) {
      tokenRecord.waitlist_entry_id = request.waitlist_entry_id;
    }
    if (request.user_id) {
      tokenRecord.user_id = request.user_id;
    }

    const { data, error } = await supabaseAdmin
      .from('waitlist_magic_tokens')
      .insert(tokenRecord)
      .select()
      .single();

    if (error) {
      console.error('Failed to create token:', {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || 'Failed to generate token',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token generated successfully for:', request.email);

    return new Response(
      JSON.stringify({
        success: true,
        token: data.token,
        expiresAt: data.expires_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error generating token:', {
      message: error.message,
      stack: error.stack,
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
