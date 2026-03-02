/**
 * memory-snapshot-generator — Edge function for deal memory snapshot generation.
 *
 * Two modes:
 *   Single deal: POST { deal_id, org_id, on_demand?: boolean }
 *   Batch:       POST { org_id, batch: true }
 *
 * Auth: service role only. This function is intended to be called by scheduled
 * cron jobs or other server-side agents, not directly by browser clients.
 *
 * Deploy: npx supabase functions deploy memory-snapshot-generator \
 *           --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { shouldRegenerateSnapshot, generateSnapshot } from '../_shared/memory/snapshot.ts';
import { createRAGClient } from '../_shared/memory/ragClient.ts';

// ---- Rate-limiting: small delay between batch items to respect model limits --
const BATCH_DELAY_MS = 2000;

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  try {
    // ---- Auth: service role only ------------------------------------------
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!serviceKey || !authHeader.includes(serviceKey)) {
      return new Response(
        JSON.stringify({ error: 'Service role required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- Shared resources ------------------------------------------------
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceKey,
    );

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

    // ---- Parse request body ----------------------------------------------
    const body = await req.json();
    const { deal_id, org_id, batch, on_demand } = body as {
      deal_id?: string;
      org_id?: string;
      batch?: boolean;
      on_demand?: boolean;
    };

    const ragClient = createRAGClient(org_id ?? '');

    // ---- Batch mode -------------------------------------------------------
    if (batch && org_id) {
      // Find all distinct deal IDs that have active events for this org
      const { data: dealRows, error: dealErr } = await supabase
        .from('deal_memory_events')
        .select('deal_id')
        .eq('org_id', org_id)
        .eq('is_active', true);

      if (dealErr) {
        console.error('[memory-snapshot-generator] Failed to query deal IDs:', dealErr.message);
        return new Response(
          JSON.stringify({ error: dealErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const uniqueDealIds = [...new Set((dealRows ?? []).map((r) => r.deal_id as string))];

      let generated = 0;
      let skipped = 0;

      for (const did of uniqueDealIds) {
        const shouldRegen = await shouldRegenerateSnapshot({
          dealId: did,
          orgId: org_id,
          supabase,
        });

        if (shouldRegen) {
          const result = await generateSnapshot({
            dealId: did,
            orgId: org_id,
            supabase,
            ragClient,
            anthropicApiKey,
            generatedBy: 'scheduled',
          });
          if (result?.id) generated++;

          // Small delay to avoid hitting model rate limits in rapid succession
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        } else {
          skipped++;
        }
      }

      return new Response(
        JSON.stringify({ generated, skipped, total: uniqueDealIds.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- Single deal mode ------------------------------------------------
    if (deal_id && org_id) {
      const shouldRegen = await shouldRegenerateSnapshot({
        dealId: deal_id,
        orgId: org_id,
        supabase,
        onDemand: on_demand,
      });

      if (!shouldRegen) {
        return new Response(
          JSON.stringify({ skipped: true, reason: 'No regeneration needed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const snapshot = await generateSnapshot({
        dealId: deal_id,
        orgId: org_id,
        supabase,
        ragClient,
        anthropicApiKey,
        generatedBy: on_demand ? 'on_demand' : 'event_threshold',
      });

      return new Response(
        JSON.stringify({ snapshot: snapshot?.id ?? null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- Missing parameters ----------------------------------------------
    return new Response(
      JSON.stringify({ error: 'Missing deal_id+org_id or batch+org_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[memory-snapshot-generator] Unhandled error:', message);

    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      },
    );
  }
});
