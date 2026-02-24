/**
 * Fetch MeetingBaaS Usage Edge Function
 *
 * Tracks usage from our database since MeetingBaaS doesn't have a public usage API.
 * Queries recordings and meetings tables to calculate:
 * - Bot deployments this month
 * - Total recording minutes
 * - Number of completed recordings
 *
 * Plan limit: $0.69/hour = ~145 hours for $100 budget
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MeetingBaaS pricing: $0.69/hour recording
// Typical monthly budget allocation
const PLAN_LIMITS = {
  recording_hours: 145, // ~$100/month at $0.69/hour
  bot_deployments: 500, // Soft limit for monitoring
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[fetch-meetingbaas-usage] Calculating usage from database...');

    // Get current month boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const periodStart = monthStart.toISOString();
    const periodEnd = monthEnd.toISOString();

    // Query 1: Count bot deployments this month (meetings with 60_notetaker source)
    const { count: botDeployments, error: deployError } = await supabase
      .from('meetings')
      .select('*', { count: 'exact', head: true })
      .eq('source_type', '60_notetaker')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (deployError) {
      console.error('[fetch-meetingbaas-usage] Bot deployments query error:', deployError);
    }

    // Query 2: Get total recording minutes from recordings table
    const { data: recordings, error: recordingsError } = await supabase
      .from('recordings')
      .select('duration_seconds, created_at')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (recordingsError) {
      console.error('[fetch-meetingbaas-usage] Recordings query error:', recordingsError);
    }

    // Calculate total recording minutes
    let totalMinutes = 0;
    let recordingCount = 0;

    if (recordings && recordings.length > 0) {
      recordingCount = recordings.length;
      totalMinutes = recordings.reduce((sum, r) => {
        const seconds = r.duration_seconds || 0;
        return sum + seconds / 60;
      }, 0);
    }

    // Convert to hours for plan comparison
    const recordingHours = Math.round((totalMinutes / 60) * 100) / 100;

    console.log('[fetch-meetingbaas-usage] Usage calculated:', {
      botDeployments: botDeployments || 0,
      recordingCount,
      recordingHours,
      periodStart,
      periodEnd,
    });

    const nowIso = now.toISOString();
    const snapshots = [];

    // Bot deployments metric
    snapshots.push({
      provider: 'meetingbaas',
      metric_name: 'bot_deployments',
      metric_value: botDeployments || 0,
      metric_unit: 'count',
      plan_name: 'usage_based',
      plan_limit: PLAN_LIMITS.bot_deployments,
      period_start: periodStart,
      period_end: periodEnd,
      fetched_at: nowIso,
      metadata: {
        source: 'database',
        query: 'meetings.source_type=60_notetaker',
      },
    });

    // Recording hours metric (primary cost driver)
    snapshots.push({
      provider: 'meetingbaas',
      metric_name: 'recording_hours',
      metric_value: recordingHours,
      metric_unit: 'hours',
      plan_name: 'usage_based',
      plan_limit: PLAN_LIMITS.recording_hours,
      period_start: periodStart,
      period_end: periodEnd,
      fetched_at: nowIso,
      metadata: {
        source: 'database',
        query: 'recordings.created_at',
        recording_count: recordingCount,
        total_minutes: Math.round(totalMinutes * 100) / 100,
        cost_estimate_usd: Math.round(recordingHours * 0.69 * 100) / 100,
      },
    });

    // Completed recordings count
    snapshots.push({
      provider: 'meetingbaas',
      metric_name: 'completed_recordings',
      metric_value: recordingCount,
      metric_unit: 'count',
      plan_name: 'usage_based',
      plan_limit: null,
      period_start: periodStart,
      period_end: periodEnd,
      fetched_at: nowIso,
      metadata: {
        source: 'database',
      },
    });

    // Insert snapshots
    const { error: insertError } = await supabase.from('api_usage_snapshots').insert(snapshots);

    if (insertError) {
      console.error('[fetch-meetingbaas-usage] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[fetch-meetingbaas-usage] Stored ${snapshots.length} snapshots`);

    return new Response(
      JSON.stringify({
        success: true,
        provider: 'meetingbaas',
        snapshots_stored: snapshots.length,
        metrics: snapshots.map((s) => ({
          name: s.metric_name,
          value: s.metric_value,
          unit: s.metric_unit,
          limit: s.plan_limit,
        })),
        period: {
          start: periodStart,
          end: periodEnd,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[fetch-meetingbaas-usage] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        provider: 'meetingbaas',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
