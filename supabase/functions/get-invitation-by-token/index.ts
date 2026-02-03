// Edge function to look up invitation details by token
// Uses service role to bypass RLS and return org name
// Safe because invitation tokens are 256-bit cryptographically random

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabase
      .from('organization_invitations')
      .select('id, org_id, email, role, token, expires_at, accepted_at, created_at, organizations(id, name)')
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

    const org = (data as any).organizations;

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
          org_name: org?.name || null,
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
