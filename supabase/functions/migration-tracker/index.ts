import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

/**
 * Migration Tracker
 *
 * Platform-admin-only edge function that queries the Supabase Management API
 * to compare applied migrations across dev / staging / production environments.
 *
 * Requires secret: SB_MANAGEMENT_TOKEN (personal access token from supabase.com/dashboard/account/tokens)
 */

const ENVIRONMENTS: Record<string, string> = {
  development: 'wbgmnyekgqklggilgqag',
  staging: 'caerqjzvuerejfrdtygb',
  production: 'ygdpgliavpxeugaajgrb',
};

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Platform admin check — verify is_admin flag on user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Management API token
    const accessToken = Deno.env.get('SB_MANAGEMENT_TOKEN');
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'SB_MANAGEMENT_TOKEN not configured. Add it via: npx supabase secrets set SB_MANAGEMENT_TOKEN=sbp_...' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action = 'compare' } = body;

    if (action === 'compare') {
      const results: Record<string, { migrations: Array<{ version: string; name: string }>; error: string | null }> = {};

      // Fetch migrations from all environments in parallel
      const entries = Object.entries(ENVIRONMENTS);
      const fetches = entries.map(async ([env, ref]) => {
        try {
          const response = await fetch(
            `https://api.supabase.com/v1/projects/${ref}/database/migrations`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`[migration-tracker] ${env} (${ref}) HTTP ${response.status}:`, errorText);
            results[env] = { error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`, migrations: [] };
            return;
          }

          const data = await response.json();
          // Management API returns array of { version, name, statements }
          const migrations = (Array.isArray(data) ? data : []).map((m: any) => ({
            version: m.version || '',
            name: m.name || '',
          }));

          results[env] = { migrations, error: null };
        } catch (err) {
          console.error(`[migration-tracker] ${env} fetch error:`, err.message);
          results[env] = { error: err.message, migrations: [] };
        }
      });

      await Promise.all(fetches);

      return new Response(
        JSON.stringify({ environments: results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[migration-tracker] Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
