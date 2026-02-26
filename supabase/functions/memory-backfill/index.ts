/**
 * memory-backfill — Retroactively populate deal memory for existing deals.
 *
 * Queries active deals for an org, finds associated meetings with transcripts,
 * runs event extraction via RAG + Claude, then generates initial snapshots.
 * Processes deals in batches with configurable delays to avoid rate limiting.
 *
 * Auth: service role only (not user-facing).
 * Deploy: --no-verify-jwt (staging ES256 JWT issue)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { extractEventsFromMeeting } from '../_shared/memory/writer.ts';
import { generateSnapshot } from '../_shared/memory/snapshot.ts';
import { createRAGClient } from '../_shared/memory/ragClient.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Auth: service role only
  const authHeader = req.headers.get('Authorization');
  if (!isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
    return new Response(JSON.stringify({ error: 'Service role required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  if (!anthropicApiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const {
    org_id,
    limit = 50,          // max deals to process per run
    batch_size = 10,      // deals per batch
    delay_ms = 2000,      // delay between batches (ms)
    skip_existing = true, // skip deals that already have memory events
  } = body as {
    org_id?: string;
    limit?: number;
    batch_size?: number;
    delay_ms?: number;
    skip_existing?: boolean;
  };

  if (!org_id) {
    return new Response(JSON.stringify({ error: 'org_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ragClient = createRAGClient();

  // ── Step 1: Find active deals for this org ──────────────────────────────
  // deals table uses org_id (UUID FK) for org filtering, not clerk_org_id.
  // Status values in use: 'open', 'active'. Exclude closed_won / closed_lost.
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('id, name, stage_id, value, org_id, company_id')
    .eq('org_id', org_id)
    .in('status', ['open', 'active'])
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (dealsError) {
    return new Response(JSON.stringify({ error: 'Failed to fetch deals', detail: dealsError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!deals?.length) {
    return new Response(
      JSON.stringify({ processed: 0, skipped: 0, message: 'No active deals found' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Step 2: Optionally filter out deals that already have memory events ──
  let dealIds: string[] = deals.map((d) => String(d.id));

  if (skip_existing) {
    const { data: existingDeals } = await supabase
      .from('deal_memory_events')
      .select('deal_id')
      .eq('org_id', org_id)
      .in('deal_id', dealIds);

    const existingDealIds = new Set((existingDeals ?? []).map((r) => String(r.deal_id)));
    dealIds = dealIds.filter((id) => !existingDealIds.has(id));
  }

  // ── Step 3: Process deals in batches ─────────────────────────────────────
  let processed = 0;
  let eventsCreated = 0;
  let snapshotsCreated = 0;
  let errors = 0;

  for (let i = 0; i < dealIds.length; i += batch_size) {
    const batch = dealIds.slice(i, i + batch_size);

    for (const dealId of batch) {
      try {
        // ── 3a: Find meetings linked to this deal's company ──────────────
        // Meetings are linked to deals via company_id. Filter by the deal's
        // company to avoid extracting events from unrelated meetings.
        const deal = deals.find((d) => String(d.id) === dealId);
        const companyId = deal?.company_id;

        let meetingsQuery = supabase
          .from('meetings')
          .select('id, title, meeting_start')
          .eq('org_id', org_id)
          .not('transcript_text', 'is', null)
          .order('meeting_start', { ascending: false })
          .limit(10);

        if (companyId) {
          meetingsQuery = meetingsQuery.eq('company_id', companyId);
        }

        const { data: meetings } = await meetingsQuery;

        if (meetings?.length) {
          // ── 3b: Extract memory events from each meeting ──────────────────
          for (const meeting of meetings) {
            try {
              // Derive meeting date for RAG window (YYYY-MM-DD)
              const mDate = meeting.meeting_start
                ? new Date(meeting.meeting_start).toISOString().split('T')[0]
                : undefined;

              const events = await extractEventsFromMeeting({
                meetingId: String(meeting.id),
                dealId,
                orgId: org_id,
                supabase,
                ragClient,
                anthropicApiKey,
                meetingDate: mDate,
                extractedBy: 'memory-backfill',
                confidenceThreshold: 0.6, // slightly lower threshold for backfill
              });
              eventsCreated += events.length;
            } catch (err) {
              console.error(
                `[memory-backfill] Event extraction failed for meeting ${meeting.id} / deal ${dealId}:`,
                (err as Error).message,
              );
              errors++;
            }
          }
        }

        // ── 3c: Generate initial snapshot for this deal ──────────────────
        try {
          const snapshot = await generateSnapshot({
            dealId,
            orgId: org_id,
            supabase,
            ragClient,
            anthropicApiKey,
            generatedBy: 'on_demand',
          });
          if (snapshot) snapshotsCreated++;
        } catch (err) {
          console.error(
            `[memory-backfill] Snapshot generation failed for deal ${dealId}:`,
            (err as Error).message,
          );
          errors++;
        }

        processed++;
        console.log(`[memory-backfill] Processed deal ${dealId} (${processed}/${dealIds.length})`);

      } catch (err) {
        console.error(`[memory-backfill] Deal ${dealId} failed:`, (err as Error).message);
        errors++;
      }
    }

    // Delay between batches to avoid rate limiting
    if (i + batch_size < dealIds.length) {
      await new Promise((r) => setTimeout(r, delay_ms));
    }
  }

  return new Response(
    JSON.stringify({
      processed,
      skipped: deals.length - dealIds.length,
      events_created: eventsCreated,
      snapshots_created: snapshotsCreated,
      errors,
      total_deals: deals.length,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
