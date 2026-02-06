/**
 * API Usage Cron Edge Function
 *
 * Orchestrates daily fetching of usage stats from all providers.
 * Can be triggered by:
 * 1. pg_cron scheduled job (daily at 9am UTC)
 * 2. Manual invocation from admin dashboard
 *
 * Calls:
 * - fetch-meetingbaas-usage
 * - fetch-gladia-usage
 * - fetch-deepgram-usage
 * - api-usage-alerts (after fetching)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchResult {
  provider: string;
  success: boolean;
  snapshots_stored?: number;
  metrics?: Array<{ name: string; value: number; unit: string }>;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    console.log('[api-usage-cron] Starting usage fetch for all providers...');

    const startTime = Date.now();
    const results: FetchResult[] = [];

    // List of providers to fetch
    const providers = ['meetingbaas', 'gladia', 'deepgram'];

    // Fetch from each provider in parallel
    const fetchPromises = providers.map(async (provider) => {
      const functionName = `fetch-${provider}-usage`;
      console.log(`[api-usage-cron] Invoking ${functionName}...`);

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
        });

        const result = await response.json();
        console.log(`[api-usage-cron] ${provider} result:`, JSON.stringify(result).slice(0, 200));

        return {
          provider,
          ...result,
        } as FetchResult;
      } catch (error) {
        console.error(`[api-usage-cron] Error fetching ${provider}:`, error);
        return {
          provider,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        } as FetchResult;
      }
    });

    const fetchResults = await Promise.all(fetchPromises);
    results.push(...fetchResults);

    // Check if any succeeded
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`[api-usage-cron] Fetch complete: ${successCount} succeeded, ${failCount} failed`);

    // Trigger alerts check after fetching
    try {
      console.log('[api-usage-cron] Triggering usage alerts check...');

      const alertsResponse = await fetch(`${supabaseUrl}/functions/v1/api-usage-alerts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (alertsResponse.ok) {
        const alertsResult = await alertsResponse.json();
        console.log('[api-usage-cron] Alerts check result:', JSON.stringify(alertsResult).slice(0, 200));
      } else {
        console.log('[api-usage-cron] Alerts function not yet deployed or failed');
      }
    } catch (alertsError) {
      console.log('[api-usage-cron] Could not trigger alerts (function may not exist yet):', alertsError);
    }

    const duration = Date.now() - startTime;
    console.log(`[api-usage-cron] Total duration: ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        message: `Fetched usage from ${successCount}/${providers.length} providers`,
        duration_ms: duration,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[api-usage-cron] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
