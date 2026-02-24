/**
 * Fetch Deepgram Usage Edge Function
 *
 * Fetches usage statistics from Deepgram API and stores snapshots
 * for platform admin monitoring.
 *
 * Metrics tracked:
 * - transcription_hours: Hours of audio transcribed
 * - api_requests: Number of API requests
 * - cost_usd: Cost in USD
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeepgramUsageResponse {
  results?: {
    hours?: number;
    total_hours?: number;
    requests?: number;
    total_requests?: number;
  };
  start?: string;
  end?: string;
  resolution?: {
    amount?: number;
    units?: string;
  };
}

interface DeepgramBalanceResponse {
  balances?: Array<{
    balance_id?: string;
    amount?: number;
    units?: string;
  }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');
    if (!deepgramApiKey) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }

    // Deepgram project ID - may need to be configured
    const deepgramProjectId = Deno.env.get('DEEPGRAM_PROJECT_ID');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[fetch-deepgram-usage] Fetching usage from Deepgram API...');

    const now = new Date().toISOString();
    const snapshots = [];

    // Get current month's date range
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    // Format dates for Deepgram API
    const startDate = startOfMonth.toISOString().split('T')[0];
    const endDate = endOfMonth.toISOString().split('T')[0];

    // Fetch usage - try with project ID first, then without
    let usageEndpoint = 'https://api.deepgram.com/v1/projects';
    if (deepgramProjectId) {
      usageEndpoint = `https://api.deepgram.com/v1/projects/${deepgramProjectId}/usage?start=${startDate}&end=${endDate}`;
    }

    const usageResponse = await fetch(usageEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!usageResponse.ok) {
      const errorText = await usageResponse.text();
      console.error('[fetch-deepgram-usage] Usage API failed:', errorText);

      // Try to get project list first to find project ID
      if (!deepgramProjectId) {
        console.log('[fetch-deepgram-usage] No project ID, fetching projects list...');

        const projectsResponse = await fetch('https://api.deepgram.com/v1/projects', {
          method: 'GET',
          headers: {
            Authorization: `Token ${deepgramApiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (projectsResponse.ok) {
          const projectsData = await projectsResponse.json();
          console.log('[fetch-deepgram-usage] Projects response:', JSON.stringify(projectsData).slice(0, 500));

          // Store projects list for reference
          await supabase.from('api_usage_snapshots').insert({
            provider: 'deepgram',
            metric_name: 'projects_list',
            metric_value: projectsData.projects?.length || 0,
            metric_unit: 'count',
            fetched_at: now,
            metadata: {
              projects: projectsData.projects,
              note: 'Set DEEPGRAM_PROJECT_ID to fetch detailed usage',
            },
          });

          // Try to get usage from first project
          if (projectsData.projects?.length > 0) {
            const projectId = projectsData.projects[0].project_id;
            const retryUsageResponse = await fetch(
              `https://api.deepgram.com/v1/projects/${projectId}/usage?start=${startDate}&end=${endDate}`,
              {
                method: 'GET',
                headers: {
                  Authorization: `Token ${deepgramApiKey}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (retryUsageResponse.ok) {
              const usageData: DeepgramUsageResponse = await retryUsageResponse.json();
              console.log('[fetch-deepgram-usage] Got usage data:', JSON.stringify(usageData).slice(0, 500));

              // Extract hours
              const hours = usageData.results?.hours ?? usageData.results?.total_hours ?? 0;
              snapshots.push({
                provider: 'deepgram',
                metric_name: 'transcription_hours',
                metric_value: Math.round(hours * 100) / 100,
                metric_unit: 'hours',
                plan_name: null,
                plan_limit: null, // Deepgram is pay-as-you-go
                period_start: startOfMonth.toISOString(),
                period_end: endOfMonth.toISOString(),
                fetched_at: now,
                metadata: { project_id: projectId, raw_response: usageData },
              });

              // Extract requests
              const requests = usageData.results?.requests ?? usageData.results?.total_requests ?? 0;
              if (requests > 0) {
                snapshots.push({
                  provider: 'deepgram',
                  metric_name: 'api_requests',
                  metric_value: requests,
                  metric_unit: 'count',
                  period_start: startOfMonth.toISOString(),
                  period_end: endOfMonth.toISOString(),
                  fetched_at: now,
                  metadata: { project_id: projectId },
                });
              }
            }
          }
        }
      }

      // If we still have no snapshots, store error status
      if (snapshots.length === 0) {
        await supabase.from('api_usage_snapshots').insert({
          provider: 'deepgram',
          metric_name: 'api_fetch_status',
          metric_value: 0,
          metric_unit: 'status',
          metadata: {
            error: `API request failed: ${usageResponse.status}`,
            error_body: errorText.slice(0, 500),
            note: 'Check DEEPGRAM_PROJECT_ID configuration',
          },
        });

        throw new Error(`Deepgram API error: ${usageResponse.status}`);
      }
    } else {
      const usageData: DeepgramUsageResponse = await usageResponse.json();
      console.log('[fetch-deepgram-usage] Got usage data:', JSON.stringify(usageData).slice(0, 500));

      // Extract hours
      const hours = usageData.results?.hours ?? usageData.results?.total_hours ?? 0;
      snapshots.push({
        provider: 'deepgram',
        metric_name: 'transcription_hours',
        metric_value: Math.round(hours * 100) / 100,
        metric_unit: 'hours',
        plan_name: null,
        plan_limit: null, // Deepgram is pay-as-you-go
        period_start: usageData.start || startOfMonth.toISOString(),
        period_end: usageData.end || endOfMonth.toISOString(),
        fetched_at: now,
        metadata: { raw_response: usageData },
      });

      // Extract requests
      const requests = usageData.results?.requests ?? usageData.results?.total_requests ?? 0;
      if (requests > 0) {
        snapshots.push({
          provider: 'deepgram',
          metric_name: 'api_requests',
          metric_value: requests,
          metric_unit: 'count',
          period_start: usageData.start || startOfMonth.toISOString(),
          period_end: usageData.end || endOfMonth.toISOString(),
          fetched_at: now,
          metadata: {},
        });
      }
    }

    // Try to get balance/credits info
    try {
      if (deepgramProjectId) {
        const balanceResponse = await fetch(`https://api.deepgram.com/v1/projects/${deepgramProjectId}/balances`, {
          method: 'GET',
          headers: {
            Authorization: `Token ${deepgramApiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (balanceResponse.ok) {
          const balanceData: DeepgramBalanceResponse = await balanceResponse.json();
          console.log('[fetch-deepgram-usage] Got balance data:', JSON.stringify(balanceData).slice(0, 500));

          if (balanceData.balances?.length) {
            const balance = balanceData.balances[0];
            snapshots.push({
              provider: 'deepgram',
              metric_name: 'credits_remaining',
              metric_value: balance.amount ?? 0,
              metric_unit: balance.units || 'usd',
              fetched_at: now,
              metadata: { balance_id: balance.balance_id },
            });
          }
        }
      }
    } catch (balanceError) {
      console.log('[fetch-deepgram-usage] Could not fetch balance:', balanceError);
    }

    // Insert snapshots
    if (snapshots.length > 0) {
      const { error: insertError } = await supabase.from('api_usage_snapshots').insert(snapshots);

      if (insertError) {
        console.error('[fetch-deepgram-usage] Insert error:', insertError);
        throw insertError;
      }
    }

    console.log(`[fetch-deepgram-usage] Stored ${snapshots.length} snapshots`);

    return new Response(
      JSON.stringify({
        success: true,
        provider: 'deepgram',
        snapshots_stored: snapshots.length,
        metrics: snapshots.map((s) => ({ name: s.metric_name, value: s.metric_value, unit: s.metric_unit })),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[fetch-deepgram-usage] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        provider: 'deepgram',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
