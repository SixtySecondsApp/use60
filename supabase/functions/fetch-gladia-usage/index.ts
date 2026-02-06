/**
 * Fetch Gladia Usage Edge Function
 *
 * Tracks transcription usage from our database since Gladia doesn't have a public usage API.
 * Queries meetings table to calculate total transcription hours based on meeting durations.
 *
 * Gladia free tier: 10 hours/month
 * Paid tiers: $0.15/hour (Growth), $0.10/hour (Enterprise)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gladia pricing tiers
const PLAN_LIMITS = {
  free: 10, // 10 hours/month free tier
  growth: 100, // Typical growth plan allocation
  enterprise: 500, // Typical enterprise allocation
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

    console.log('[fetch-gladia-usage] Calculating usage from database...');

    // Get current month boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const periodStart = monthStart.toISOString();
    const periodEnd = monthEnd.toISOString();

    // Query meetings that have transcripts (transcription was performed)
    // These are meetings that used Gladia for transcription
    const { data: meetings, error: meetingsError } = await supabase
      .from('meetings')
      .select('id, duration_seconds, created_at, source_type')
      .not('transcript', 'is', null)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (meetingsError) {
      console.error('[fetch-gladia-usage] Meetings query error:', meetingsError);
    }

    // Also check recordings table for 60 Notetaker transcriptions
    const { data: recordings, error: recordingsError } = await supabase
      .from('recordings')
      .select('id, duration_seconds, created_at, transcript_status')
      .eq('transcript_status', 'completed')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (recordingsError) {
      console.error('[fetch-gladia-usage] Recordings query error:', recordingsError);
    }

    // Calculate total transcription hours
    let totalSeconds = 0;
    let transcriptionCount = 0;

    // Count from meetings with transcripts
    if (meetings && meetings.length > 0) {
      transcriptionCount += meetings.length;
      totalSeconds += meetings.reduce((sum, m) => {
        return sum + (m.duration_seconds || 0);
      }, 0);
    }

    // Count from recordings with completed transcripts
    if (recordings && recordings.length > 0) {
      transcriptionCount += recordings.length;
      totalSeconds += recordings.reduce((sum, r) => {
        return sum + (r.duration_seconds || 0);
      }, 0);
    }

    const transcriptionHours = Math.round((totalSeconds / 3600) * 100) / 100;

    console.log('[fetch-gladia-usage] Usage calculated:', {
      transcriptionCount,
      transcriptionHours,
      totalSeconds,
      periodStart,
      periodEnd,
    });

    const nowIso = now.toISOString();
    const snapshots = [];

    // Determine plan based on usage (default to free tier limit for monitoring)
    const planLimit = PLAN_LIMITS.free;
    const planName = 'free';

    // Transcription hours metric
    snapshots.push({
      provider: 'gladia',
      metric_name: 'transcription_hours',
      metric_value: transcriptionHours,
      metric_unit: 'hours',
      plan_name: planName,
      plan_limit: planLimit,
      period_start: periodStart,
      period_end: periodEnd,
      fetched_at: nowIso,
      metadata: {
        source: 'database',
        query: 'meetings.transcript IS NOT NULL + recordings.transcript_status=completed',
        transcription_count: transcriptionCount,
        total_seconds: totalSeconds,
      },
    });

    // Transcription count metric
    snapshots.push({
      provider: 'gladia',
      metric_name: 'transcription_count',
      metric_value: transcriptionCount,
      metric_unit: 'count',
      plan_name: planName,
      plan_limit: null,
      period_start: periodStart,
      period_end: periodEnd,
      fetched_at: nowIso,
      metadata: {
        source: 'database',
        meetings_with_transcript: meetings?.length || 0,
        recordings_with_transcript: recordings?.length || 0,
      },
    });

    // Usage percentage for alerting
    const usagePercent = planLimit > 0 ? Math.round((transcriptionHours / planLimit) * 100) : 0;
    snapshots.push({
      provider: 'gladia',
      metric_name: 'usage_percent',
      metric_value: usagePercent,
      metric_unit: 'percent',
      plan_name: planName,
      plan_limit: 100,
      period_start: periodStart,
      period_end: periodEnd,
      fetched_at: nowIso,
      metadata: {
        source: 'calculated',
        formula: 'transcription_hours / plan_limit * 100',
      },
    });

    // Insert snapshots
    const { error: insertError } = await supabase.from('api_usage_snapshots').insert(snapshots);

    if (insertError) {
      console.error('[fetch-gladia-usage] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[fetch-gladia-usage] Stored ${snapshots.length} snapshots`);

    return new Response(
      JSON.stringify({
        success: true,
        provider: 'gladia',
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
    console.error('[fetch-gladia-usage] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        provider: 'gladia',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
