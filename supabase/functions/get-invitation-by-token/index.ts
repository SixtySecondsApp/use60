// Edge function to look up invitation details by token
// Uses service role to bypass RLS and return org name
// Safe because invitation tokens are 256-bit cryptographically random

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Simple in-memory rate limiter per IP (resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // max requests per window per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate token format (must be 64-char hex string)
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return new Response(
        JSON.stringify({ error: 'Invalid token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Query invitation (no join to avoid ambiguous column references)
    const { data, error } = await supabase
      .from('organization_invitations')
      .select('id, org_id, email, role, token, expires_at, accepted_at, created_at')
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      console.error('Error fetching invitation:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch invitation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ data: null, error: 'Invitation not found, expired, or already used' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch org name separately (service role bypasses RLS)
    let orgName: string | null = null;
    if (data.org_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', data.org_id)
        .maybeSingle();
      orgName = org?.name || null;
    }

    return new Response(
      JSON.stringify({
        data: {
          id: data.id,
          org_id: data.org_id,
          email: data.email,
          role: data.role,
          token: data.token,
          expires_at: data.expires_at,
          accepted_at: data.accepted_at,
          created_at: data.created_at,
          org_name: orgName,
        },
        error: null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Exception in get-invitation-by-token:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
