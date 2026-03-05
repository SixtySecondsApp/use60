/**
 * Scheduled Health Refresh Edge Function
 * 
 * Refreshes health scores for active users (logged in last 7 days).
 * Called daily via GitHub Actions cron job.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify cron secret (if set)
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');
    
    if (cronSecret && providedSecret !== cronSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Get active users (logged in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: activeUsers, error: usersError } = await supabase
      .from('profiles')
      .select('id')
      .gte('last_login_at', sevenDaysAgo.toISOString())
      .not('last_login_at', 'is', null);

    if (usersError) {
      throw new Error(`Failed to fetch active users: ${usersError.message}`);
    }

    if (!activeUsers || activeUsers.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active users to refresh',
          usersProcessed: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh health scores for each active user
    const results = {
      usersProcessed: 0,
      dealsRefreshed: 0,
      relationshipsRefreshed: 0,
      errors: [] as string[],
    };

    for (const user of activeUsers) {
      try {
        // Refresh deal health scores using PostgreSQL RPC function
        const { data: dealResults, error: dealError } = await supabase
          .rpc('refresh_deal_health_scores', {
            p_user_id: user.id,
            p_max_age_hours: 24
          });

        if (dealError) {
          throw new Error(`Deal health refresh failed: ${dealError.message}`);
        }

        // Count deals that were actually updated
        const dealsUpdated = (dealResults || []).filter((r: any) => r.updated === true).length;
        results.dealsRefreshed += dealsUpdated;

        // Refresh relationship health scores using PostgreSQL RPC function
        const { data: relationshipResults, error: relationshipError } = await supabase
          .rpc('refresh_relationship_health_scores', {
            p_user_id: user.id,
            p_max_age_hours: 24
          });

        if (relationshipError) {
          throw new Error(`Relationship health refresh failed: ${relationshipError.message}`);
        }

        // Count relationships that were actually updated
        const relationshipsUpdated = (relationshipResults || []).filter((r: any) => r.updated === true).length;
        results.relationshipsRefreshed += relationshipsUpdated;

        results.usersProcessed++;
      } catch (error: any) {
        results.errors.push(`User ${user.id}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: results.errors.length === 0,
        ...results,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Health refresh error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

