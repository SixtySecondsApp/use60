// supabase/functions/meter-storage/index.ts
// Monthly storage metering cron — deducts storage credits from orgs on the 1st of each month.
// Triggered by pg_cron or a Supabase cron schedule.
//
// Storage credit costs (from creditPacks.ts):
//   0.5 credits/hour of audio/month
//   0.1 credits/100 transcripts/month
//   0.05 credits/100 documents/month
//   0.1 credits/500 enrichment records/month
//
// Idempotent: skips org+month combos already processed.

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { STORAGE_CREDIT_COSTS } from '../_shared/creditPacks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface StorageMetrics {
  org_id: string;
  recording_hours: number;
  transcript_count: number;
  document_count: number;
  enrichment_count: number;
}

interface MeterResult {
  org_id: string;
  credits_deducted: number;
  skipped?: string;
  error?: string;
}

// Build the billing period key: "YYYY-MM"
function getBillingPeriodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Check if storage deduction already ran for this org+month
async function alreadyMetered(
  supabase: SupabaseClient,
  orgId: string,
  periodKey: string
): Promise<boolean> {
  const { data } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('org_id', orgId)
    .eq('feature_key', 'storage_metering')
    .ilike('description', `%[${periodKey}]%`)
    .limit(1)
    .maybeSingle();

  return data !== null;
}

// Gather storage metrics for a single org
async function getStorageMetrics(
  supabase: SupabaseClient,
  orgId: string
): Promise<StorageMetrics> {
  // Recording hours: sum duration_seconds from meetings where org_id matches,
  // divided by 3600. Use maybeSingle fallback to 0.
  const [recordingsResult, transcriptsResult, docsResult, enrichmentResult] = await Promise.all([
    // Audio hours: sum recording duration from meetings
    supabase
      .from('meetings')
      .select('duration_seconds')
      .eq('org_id', orgId)
      .not('duration_seconds', 'is', null),

    // Transcript count: count meeting_transcripts rows for this org's meetings
    supabase
      .from('meeting_transcripts')
      .select('id', { count: 'exact', head: true })
      .in(
        'meeting_id',
        supabase
          .from('meetings')
          .select('id')
          .eq('org_id', orgId)
      ),

    // Document count: count documents (e.g. attachments, notes) for this org
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),

    // Enrichment records: count contacts enriched for this org
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .not('enriched_at', 'is', null),
  ]);

  const recordingSeconds = (recordingsResult.data ?? []).reduce(
    (sum: number, row: { duration_seconds: number | null }) => sum + (row.duration_seconds ?? 0),
    0
  );
  const recordingHours = recordingSeconds / 3600;

  return {
    org_id: orgId,
    recording_hours: recordingHours,
    transcript_count: transcriptsResult.count ?? 0,
    document_count: docsResult.count ?? 0,
    enrichment_count: enrichmentResult.count ?? 0,
  };
}

// Calculate total credit cost for the metrics
function calculateStorageCost(metrics: StorageMetrics): number {
  const audioCost = metrics.recording_hours * STORAGE_CREDIT_COSTS.audio_per_hour_month;
  const transcriptCost = (metrics.transcript_count / 100) * STORAGE_CREDIT_COSTS.transcripts_per_100_month;
  const docCost = (metrics.document_count / 100) * STORAGE_CREDIT_COSTS.docs_per_100_month;
  const enrichmentCost = (metrics.enrichment_count / 500) * STORAGE_CREDIT_COSTS.enrichment_per_500_month;

  return audioCost + transcriptCost + docCost + enrichmentCost;
}

// Meter a single org
async function meterOrg(
  supabase: SupabaseClient,
  orgId: string,
  periodKey: string
): Promise<MeterResult> {
  // Idempotency check
  const done = await alreadyMetered(supabase, orgId, periodKey);
  if (done) {
    return { org_id: orgId, credits_deducted: 0, skipped: `Already metered for ${periodKey}` };
  }

  // Get metrics
  const metrics = await getStorageMetrics(supabase, orgId);

  const totalCost = calculateStorageCost(metrics);

  if (totalCost <= 0) {
    return { org_id: orgId, credits_deducted: 0, skipped: 'No storage usage' };
  }

  // Deduct credits in separate line items for each storage type (better UX in transaction log)
  const lineItems: Array<{ cost: number; feature: string; description: string }> = [];

  if (metrics.recording_hours > 0) {
    lineItems.push({
      cost: metrics.recording_hours * STORAGE_CREDIT_COSTS.audio_per_hour_month,
      feature: 'storage_audio',
      description: `[${periodKey}] Audio storage: ${metrics.recording_hours.toFixed(1)}h`,
    });
  }
  if (metrics.transcript_count > 0) {
    lineItems.push({
      cost: (metrics.transcript_count / 100) * STORAGE_CREDIT_COSTS.transcripts_per_100_month,
      feature: 'storage_transcripts',
      description: `[${periodKey}] Transcript storage: ${metrics.transcript_count} records`,
    });
  }
  if (metrics.document_count > 0) {
    lineItems.push({
      cost: (metrics.document_count / 100) * STORAGE_CREDIT_COSTS.docs_per_100_month,
      feature: 'storage_docs',
      description: `[${periodKey}] Document storage: ${metrics.document_count} docs`,
    });
  }
  if (metrics.enrichment_count > 0) {
    lineItems.push({
      cost: (metrics.enrichment_count / 500) * STORAGE_CREDIT_COSTS.enrichment_per_500_month,
      feature: 'storage_enrichment',
      description: `[${periodKey}] Enrichment storage: ${metrics.enrichment_count} records`,
    });
  }

  // Add a sentinel entry with feature_key='storage_metering' for idempotency detection
  lineItems.push({
    cost: 0,
    feature: 'storage_metering',
    description: `[${periodKey}] Storage metering sentinel`,
  });

  let totalDeducted = 0;

  for (const item of lineItems) {
    if (item.cost <= 0) {
      // Insert zero-amount sentinel as a credit_transactions row directly
      await supabase.from('credit_transactions').insert({
        org_id: orgId,
        type: 'deduction',
        amount: 0,
        balance_after: 0, // will be stale but sentinel rows are for idempotency only
        description: item.description,
        feature_key: item.feature,
      });
      continue;
    }

    const { error } = await supabase.rpc('deduct_credits_fifo', {
      p_org_id: orgId,
      p_amount: item.cost,
      p_description: item.description,
      p_feature_key: item.feature,
      p_cost_event_id: null,
    });

    if (error) {
      console.error(`[meter-storage] deduct error for ${orgId} / ${item.feature}:`, error.message);
      // Continue with other line items even if one fails
    } else {
      totalDeducted += item.cost;
    }
  }

  return { org_id: orgId, credits_deducted: totalDeducted };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const targetOrgId: string | undefined = body.org_id;

    // Determine billing period
    const now = new Date();
    const periodKey = getBillingPeriodKey(now);

    // Get orgs to meter: either a specific org or all orgs with a balance record
    let orgIds: string[];

    if (targetOrgId) {
      orgIds = [targetOrgId];
    } else {
      const { data: balances, error: balError } = await supabase
        .from('org_credit_balance')
        .select('org_id');

      if (balError) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch orgs', details: balError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      orgIds = (balances ?? []).map((r: { org_id: string }) => r.org_id);
    }

    const results: MeterResult[] = [];

    for (const orgId of orgIds) {
      try {
        const result = await meterOrg(supabase, orgId, periodKey);
        results.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[meter-storage] Error for org ${orgId}:`, msg);
        results.push({ org_id: orgId, credits_deducted: 0, error: msg });
      }
    }

    const totalDeducted = results.reduce((sum, r) => sum + r.credits_deducted, 0);

    return new Response(
      JSON.stringify({
        period: periodKey,
        orgs_processed: results.length,
        total_credits_deducted: totalDeducted,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[meter-storage] Error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
