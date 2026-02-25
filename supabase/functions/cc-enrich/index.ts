/**
 * cc-enrich — Command Centre Enrichment Orchestrator
 *
 * Picks up to 20 pending command_centre_items (enrichment_status='pending'),
 * determines the required context loaders for each item_type, calls them in
 * parallel, merges the results into enrichment_context, and updates the row.
 *
 * Loader implementations: CC10-002 (crm, transcript), CC10-003 (email, calendar),
 * CC10-004 (pipeline, history). Apollo remains stubbed pending credit management wiring.
 *
 * Service role is used deliberately: enrichment reads across org data (deals,
 * contacts, activities) that belong to multiple users. RLS would block the
 * cross-entity reads needed to build enrichment_context.
 *
 * Story: CC10-001
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import {
  getEnrichmentPlan,
  type CreditTier,
  type LoaderName,
} from '../_shared/commandCentre/enrichmentRouter.ts';
import { loadCRMContext } from '../_shared/commandCentre/loaders/crmLoader.ts';
import { loadTranscriptContext as loadTranscriptContextImpl } from '../_shared/commandCentre/loaders/transcriptLoader.ts';
import { loadEmailContext as loadEmailContextImpl } from '../_shared/commandCentre/loaders/emailLoader.ts';
import { loadCalendarContext as loadCalendarContextImpl } from '../_shared/commandCentre/loaders/calendarLoader.ts';
import { loadPipelineContext as loadPipelineContextImpl } from '../_shared/commandCentre/loaders/pipelineLoader.ts';
import { loadPreviousItems as loadHistoryContextImpl } from '../_shared/commandCentre/loaders/historyLoader.ts';
import { synthesiseAndDraft, persistDraftWithConfidence } from '../_shared/commandCentre/actionDrafter.ts';
import { calculateConfidence } from '../_shared/commandCentre/confidenceScorer.ts';
import type { CommandCentreItem } from '../_shared/commandCentre/types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingItem {
  id: string;
  org_id: string;
  user_id: string;
  item_type: string;
  title: string;
  summary: string | null;
  context: Record<string, unknown>;
  deal_id: string | null;
  contact_id: string | null;
  priority_score: number | null;
  urgency: string;
  due_date: string | null;
}

interface LoaderContext {
  supabase: ReturnType<typeof createClient>;
  item: PendingItem;
}

interface EnrichmentResult {
  id: string;
  status: 'enriched' | 'failed';
  error?: string;
}

// ---------------------------------------------------------------------------
// Credit tier detection
//
// TODO CC10-006: read from org_settings / subscription tier once that table
// exists. For now we default to 'insight' as the middle-ground tier.
// ---------------------------------------------------------------------------

async function getOrgCreditTier(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<CreditTier> {
  const { data } = await supabase
    .from('org_settings')
    .select('ai_credit_tier')
    .eq('org_id', orgId)
    .maybeSingle();

  const tier = data?.ai_credit_tier as CreditTier | null;
  if (tier === 'signal' || tier === 'insight' || tier === 'intelligence') {
    return tier;
  }
  return 'insight'; // safe default
}

// ---------------------------------------------------------------------------
// Context loader wrappers
//
// Each loader returns a partial enrichment_context object keyed by loader name.
// CC10-002: crm, transcript — implemented in loaders/crmLoader.ts, loaders/transcriptLoader.ts
// CC10-003: email, calendar — implemented in loaders/emailLoader.ts, loaders/calendarLoader.ts
// CC10-004: pipeline, history — implemented in loaders/pipelineLoader.ts, loaders/historyLoader.ts
// CC10-004: apollo — stub, pending credit management wiring (see apollo-search edge function)
// ---------------------------------------------------------------------------

// CC10-002: CRM loader — deal, contact, recent activities
async function loadCrmContext(ctx: LoaderContext): Promise<Record<string, unknown>> {
  return loadCRMContext(
    ctx.supabase,
    ctx.item.deal_id,
    ctx.item.contact_id,
    ctx.item.org_id,
  ) as Promise<Record<string, unknown>>;
}

// CC10-002: transcript loader — recent meeting transcripts for contact/deal
async function loadTranscriptContext(ctx: LoaderContext): Promise<Record<string, unknown>> {
  return loadTranscriptContextImpl(
    ctx.supabase,
    ctx.item.deal_id,
    ctx.item.contact_id,
  ) as Promise<Record<string, unknown>>;
}

// CC10-003: email loader — recent email threads for contact/deal
async function loadEmailContext(ctx: LoaderContext): Promise<Record<string, unknown>> {
  return loadEmailContextImpl(ctx.supabase, ctx.item.contact_id, ctx.item.org_id) as Promise<Record<string, unknown>>;
}

// CC10-003: calendar loader — upcoming/past calendar events
async function loadCalendarContext(ctx: LoaderContext): Promise<Record<string, unknown>> {
  return loadCalendarContextImpl(ctx.supabase, ctx.item.contact_id, ctx.item.deal_id) as Promise<Record<string, unknown>>;
}

// CC10-004: pipeline loader — stage velocity, peer comparison, snapshot totals
async function loadPipelineContext(ctx: LoaderContext): Promise<Record<string, unknown>> {
  return loadPipelineContextImpl(
    ctx.supabase,
    ctx.item.deal_id,
    ctx.item.org_id,
    ctx.item.user_id,
  ) as Promise<Record<string, unknown>>;
}

// CC10-004: history loader — previous CC items for this deal/contact
async function loadHistoryContext(ctx: LoaderContext): Promise<Record<string, unknown>> {
  return loadHistoryContextImpl(ctx.supabase, ctx.item.deal_id, ctx.item.contact_id) as Promise<Record<string, unknown>>;
}

// TODO CC10-004: implement Apollo loader — external enrichment for outreach (intelligence tier)
async function loadApolloContext(_ctx: LoaderContext): Promise<Record<string, unknown>> {
  return {};
}

// ---------------------------------------------------------------------------
// Loader dispatch map
// ---------------------------------------------------------------------------

const LOADER_FNS: Record<LoaderName, (ctx: LoaderContext) => Promise<Record<string, unknown>>> = {
  crm: loadCrmContext,
  transcript: loadTranscriptContext,
  email: loadEmailContext,
  calendar: loadCalendarContext,
  pipeline: loadPipelineContext,
  history: loadHistoryContext,
  apollo: loadApolloContext,
};

// ---------------------------------------------------------------------------
// Enrich a single item
// ---------------------------------------------------------------------------

async function enrichItem(
  supabase: ReturnType<typeof createClient>,
  item: PendingItem,
  creditTier: CreditTier,
): Promise<EnrichmentResult> {
  const plan = getEnrichmentPlan(item.item_type, creditTier);
  console.log(
    `[cc-enrich] item=${item.id} type=${item.item_type} tier=${creditTier} loaders=[${plan.loaders.join(',')}]`,
  );

  const ctx: LoaderContext = { supabase, item };

  // Run all loaders in parallel (they are independent reads)
  const loaderEntries = plan.loaders.map((name) => ({ name, fn: LOADER_FNS[name] }));
  const results = await Promise.allSettled(
    loaderEntries.map(({ fn }) => fn(ctx)),
  );

  // Merge all fulfilled loader results; log failures but continue
  const enrichment_context: Record<string, unknown> = {};
  let anyLoaderFailed = false;

  for (let i = 0; i < loaderEntries.length; i++) {
    const loaderName = loaderEntries[i].name;
    const result = results[i];
    if (result.status === 'fulfilled') {
      enrichment_context[loaderName] = result.value;
    } else {
      console.error(
        `[cc-enrich] loader=${loaderName} item=${item.id} failed:`,
        result.reason,
      );
      anyLoaderFailed = true;
      enrichment_context[`${loaderName}_error`] = String(result.reason);
    }
  }

  const enrichment_status = anyLoaderFailed ? 'failed' : 'enriched';

  const { error: updateError } = await supabase
    .from('command_centre_items')
    .update({
      enrichment_status,
      enrichment_context,
      enriched_at: new Date().toISOString(),
    })
    .eq('id', item.id);

  if (updateError) {
    console.error(`[cc-enrich] DB update failed for item=${item.id}:`, updateError.message);
    return { id: item.id, status: 'failed', error: updateError.message };
  }

  // AI synthesis + action drafting (skipped for signal tier — requires_ai_synthesis=false)
  if (plan.requires_ai_synthesis) {
    try {
      // Build a minimal CommandCentreItem for the drafter
      const ccItem: CommandCentreItem = {
        id: item.id,
        org_id: item.org_id,
        user_id: item.user_id,
        source_agent: 'pipeline_scan', // placeholder — not used by drafter
        item_type: item.item_type as CommandCentreItem['item_type'],
        title: item.title,
        summary: item.summary ?? undefined,
        context: item.context,
        priority_score: item.priority_score ?? undefined,
        priority_factors: {},
        urgency: (item.urgency as CommandCentreItem['urgency']) ?? 'normal',
        due_date: item.due_date ?? undefined,
        enrichment_status: enrichment_status as CommandCentreItem['enrichment_status'],
        enrichment_context,
        confidence_factors: {},
        status: 'enriching',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const draftResult = await synthesiseAndDraft(ccItem, enrichment_context);
      const confidenceResult = calculateConfidence(ccItem, draftResult.drafted_action, enrichment_context);

      await persistDraftWithConfidence(
        item.id,
        draftResult,
        confidenceResult.score,
        confidenceResult.factors,
      );

      console.log(`[cc-enrich] AI draft complete item=${item.id} confidence=${confidenceResult.score}`);
    } catch (draftErr) {
      // Drafting failure must not block the enrichment result
      console.error(`[cc-enrich] AI draft failed for item=${item.id}:`, String(draftErr));
    }
  }

  return { id: item.id, status: enrichment_status };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  try {
    // Service role client — documented above
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 1. Fetch pending items ordered by priority
    const { data: items, error: fetchError } = await supabase
      .from('command_centre_items')
      .select(
        'id, org_id, user_id, item_type, title, summary, context, deal_id, contact_id, priority_score, urgency, due_date',
      )
      .eq('enrichment_status', 'pending')
      .order('priority_score', { ascending: false, nullsFirst: false })
      .limit(20);

    if (fetchError) {
      console.error('[cc-enrich] Failed to fetch pending items:', fetchError.message);
      return errorResponse('Failed to fetch pending items', req, 500);
    }

    if (!items || items.length === 0) {
      console.log('[cc-enrich] No pending items found');
      return jsonResponse({ enriched: 0, failed: 0, items: [] }, req);
    }

    console.log(`[cc-enrich] Processing ${items.length} pending items`);

    // 2. Resolve credit tier per org (cache within this run)
    const tierCache = new Map<string, CreditTier>();

    async function getTier(orgId: string): Promise<CreditTier> {
      if (!tierCache.has(orgId)) {
        tierCache.set(orgId, await getOrgCreditTier(supabase, orgId));
      }
      return tierCache.get(orgId)!;
    }

    // 3. Mark all fetched items as 'enriched' optimistically with a sentinel value
    // to prevent a concurrent cc-enrich run from double-processing the same batch.
    // We use 'skipped' as a temporary in-flight marker and overwrite with the real
    // outcome ('enriched' or 'failed') once each item completes.
    const itemIds = items.map((i: PendingItem) => i.id);
    await supabase
      .from('command_centre_items')
      .update({ enrichment_status: 'skipped' })
      .in('id', itemIds);

    // 4. Enrich each item — one failure must not block others
    const results: EnrichmentResult[] = [];

    for (const item of items as PendingItem[]) {
      try {
        const tier = await getTier(item.org_id);
        const result = await enrichItem(supabase, item, tier);
        results.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cc-enrich] Unexpected error for item=${item.id}:`, message);

        // Mark as failed so it's not retried indefinitely
        await supabase
          .from('command_centre_items')
          .update({
            enrichment_status: 'failed',
            enriched_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        results.push({ id: item.id, status: 'failed', error: message });
      }
    }

    const enriched = results.filter((r) => r.status === 'enriched').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    console.log(`[cc-enrich] Done — enriched=${enriched} failed=${failed}`);

    return jsonResponse({ enriched, failed, items: results }, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cc-enrich] Unhandled error:', message);
    return errorResponse(message, req, 500);
  }
});
