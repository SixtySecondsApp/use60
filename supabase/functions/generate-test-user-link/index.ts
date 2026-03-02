/**
 * Generate Test User Link Edge Function
 *
 * Admin-only endpoint that:
 * 1. Creates a new organization
 * 2. Generates a magic link token for test user signup
 * 3. Returns the link for the admin to share
 *
 * Auth: EDGE_FUNCTION_SECRET, service role, or user JWT + is_admin
 * Tokens expire after 7 days, single use.
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
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

interface GenerateTestLinkRequest {
  email: string;
  org_name: string;
  is_test_user?: boolean;
  credit_amount?: number;
}

function generateSecureToken(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // --- Auth: 3-tier check ---
    const authHeader = req.headers.get('Authorization');
    const apikeyHeader = req.headers.get('apikey');
    let adminUserId: string | null = null;

    const isEdgeFunctionAuth = (() => {
      if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
      const token = authHeader.replace(/^Bearer\s+/i, '');
      return token === EDGE_FUNCTION_SECRET;
    })();

    if (!isEdgeFunctionAuth) {
      const isServiceRole =
        authHeader?.replace(/^Bearer\s+/i, '') === SUPABASE_SERVICE_ROLE_KEY ||
        apikeyHeader === SUPABASE_SERVICE_ROLE_KEY;

      if (!isServiceRole) {
        if (!authHeader) {
          return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized: authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const jwtToken = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwtToken);

        if (authError || !user) {
          return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized: invalid authentication' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: profile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();

        if (profileError || !profile?.is_admin) {
          return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized: platform admin access required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        adminUserId = user.id;
      }
    }

    // --- Parse & validate request ---
    const request: GenerateTestLinkRequest = await req.json();

    if (!request.email || !request.org_name?.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: email and org_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isTestUser = request.is_test_user ?? true;
    const creditAmount = request.credit_amount ?? 500;

    if (creditAmount < 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Credit amount must be non-negative' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Create admin client ---
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // --- Create organization ---
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: request.org_name.trim(),
        is_active: true,
        created_by: adminUserId,
      })
      .select('id, name')
      .single();

    if (orgError) {
      console.error('Failed to create organization:', orgError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create organization: ' + orgError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Generate token ---
    const token = generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

    // --- Insert magic link record ---
    const { data: linkData, error: linkError } = await supabaseAdmin
      .from('test_user_magic_links')
      .insert({
        token,
        org_id: org.id,
        email: request.email.toLowerCase(),
        is_test_user: isTestUser,
        credit_amount: creditAmount,
        expires_at: expiresAt.toISOString(),
        created_by: adminUserId,
        org_name: org.name,
      })
      .select('id, token, expires_at, org_name')
      .single();

    if (linkError) {
      console.error('Failed to create magic link:', linkError);
      // Clean up the org we just created
      await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to generate magic link: ' + linkError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the magic link URL
    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://app.use60.com';
    const magicLink = `${frontendUrl}/auth/test-signup/${token}`;

    console.log('Test user magic link generated for:', request.email, 'org:', org.name);

    return new Response(
      JSON.stringify({
        success: true,
        token: linkData.token,
        link: magicLink,
        org_id: org.id,
        org_name: org.name,
        expires_at: linkData.expires_at,
        is_test_user: isTestUser,
        credit_amount: creditAmount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error generating test user link:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
