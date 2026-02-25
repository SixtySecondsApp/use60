/**
 * cc-prioritise — Command Centre Prioritisation Edge Function
 *
 * Scores command_centre_items rows using the shared prioritisation engine.
 * Supports single-item and batch modes.
 *
 * POST body (JSON):
 *   { item_id: string }                — score / update a single item
 *   { batch: true, user_id: string }   — re-score all open items for a user
 *   { batch: true }                    — re-score ALL open items (service-to-service only)
 *
 * Returns:
 *   { scored: number, items: { id: string, score: number, urgency: string }[] }
 *
 * Story: CC8-004
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { calculatePriority, scoreToUrgency, type DealContext } from '../_shared/commandCentre/prioritisation.ts';
import type { CommandCentreItem } from '../_shared/commandCentre/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Service role required: batch mode processes multiple users' items.
function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// ---------------------------------------------------------------------------
// Deal context loader — batch-friendly single query
// ---------------------------------------------------------------------------

interface DealRow {
  id: string;
  amount?: number;
  stage?: string;
  stage_probability?: number;
  is_target_account?: boolean;
}

async function loadDealContextMap(
  supabase: ReturnType<typeof getServiceClient>,
  dealIds: string[],
  orgId?: string
): Promise<Map<string, DealContext>> {
  if (dealIds.length === 0) return new Map();

  const { data: deals, error } = await supabase
    .from('deals')
    .select('id, amount, stage, stage_probability, is_target_account')
    .in('id', dealIds);

  if (error) {
    console.warn('[cc-prioritise] Failed to load deals for context', error.message);
    return new Map();
  }

  // Load org average deal value once if we have an org scope
  let orgAvgDealValue: number | undefined;
  if (orgId) {
    const { data: avgRow } = await supabase
      .from('deals')
      .select('amount')
      .eq('org_id', orgId)
      .not('amount', 'is', null);

    if (avgRow && avgRow.length > 0) {
      const total = (avgRow as { amount: number }[]).reduce((sum, r) => sum + (r.amount ?? 0), 0);
      orgAvgDealValue = total / avgRow.length;
    }
  }

  const map = new Map<string, DealContext>();
  for (const deal of (deals ?? []) as DealRow[]) {
    map.set(deal.id, {
      amount: deal.amount,
      stage: deal.stage,
      stage_probability: deal.stage_probability,
      org_avg_deal_value: orgAvgDealValue,
      is_target_account: deal.is_target_account,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Core: score and persist a list of items
// ---------------------------------------------------------------------------

interface ScoredItem {
  id: string;
  score: number;
  urgency: string;
}

async function scoreAndPersistItems(
  supabase: ReturnType<typeof getServiceClient>,
  items: CommandCentreItem[],
  orgId?: string
): Promise<ScoredItem[]> {
  if (items.length === 0) return [];

  // Collect deal IDs so we can batch-load deal context
  const dealIds = [...new Set(items.map(i => i.deal_id).filter((id): id is string => !!id))];
  const dealContextMap = await loadDealContextMap(supabase, dealIds, orgId);

  const updates: Array<{ id: string; priority_score: number; priority_factors: Record<string, unknown>; urgency: string }> = [];
  const scored: ScoredItem[] = [];

  for (const item of items) {
    const dealContext = item.deal_id ? dealContextMap.get(item.deal_id) : undefined;
    const { score, factors } = calculatePriority(item, dealContext);
    const urgency = scoreToUrgency(score);

    updates.push({
      id: item.id,
      priority_score: score,
      priority_factors: factors as unknown as Record<string, unknown>,
      urgency,
    });

    scored.push({ id: item.id, score, urgency });
  }

  // Persist updates — one upsert per item (Supabase JS v2 doesn't support
  // bulk UPDATE with different values per row, so we fan out in parallel batches)
  const BATCH_SIZE = 50;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(({ id, priority_score, priority_factors, urgency }) =>
        supabase
          .from('command_centre_items')
          .update({ priority_score, priority_factors, urgency })
          .eq('id', id)
      )
    );
  }

  return scored;
}

// ---------------------------------------------------------------------------
// serve
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  let body: { item_id?: string; batch?: boolean; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', req, 400);
  }

  const supabase = getServiceClient();

  // ------------------------------------------------------------------
  // Single-item mode
  // ------------------------------------------------------------------
  if (body.item_id) {
    console.log('[cc-prioritise] Single item mode', { item_id: body.item_id });

    const { data: item, error } = await supabase
      .from('command_centre_items')
      .select(
        'id, org_id, user_id, source_agent, source_event_id, item_type, title, summary, context, priority_score, priority_factors, urgency, due_date, enrichment_status, enrichment_context, drafted_action, confidence_score, confidence_factors, requires_human_input, status, resolution_channel, created_at, updated_at, enriched_at, resolved_at, deal_id, contact_id, parent_item_id'
      )
      .eq('id', body.item_id)
      .maybeSingle();

    if (error) {
      console.error('[cc-prioritise] Failed to load item', error.message);
      return errorResponse('Failed to load item', req, 500);
    }

    if (!item) {
      return errorResponse('Item not found', req, 404);
    }

    const scored = await scoreAndPersistItems(supabase, [item as CommandCentreItem], item.org_id);

    return jsonResponse({ scored: scored.length, items: scored }, req);
  }

  // ------------------------------------------------------------------
  // Batch mode
  // ------------------------------------------------------------------
  if (body.batch) {
    const filter = body.user_id ? { user_id: body.user_id } : null;
    console.log('[cc-prioritise] Batch mode', { user_id: body.user_id ?? 'all' });

    let query = supabase
      .from('command_centre_items')
      .select(
        'id, org_id, user_id, source_agent, source_event_id, item_type, title, summary, context, priority_score, priority_factors, urgency, due_date, enrichment_status, enrichment_context, drafted_action, confidence_score, confidence_factors, requires_human_input, status, resolution_channel, created_at, updated_at, enriched_at, resolved_at, deal_id, contact_id, parent_item_id'
      )
      .in('status', ['open', 'enriching', 'ready']);

    if (filter?.user_id) {
      query = query.eq('user_id', filter.user_id);
    }

    const { data: items, error } = await query;

    if (error) {
      console.error('[cc-prioritise] Failed to load items for batch', error.message);
      return errorResponse('Failed to load items', req, 500);
    }

    if (!items || items.length === 0) {
      console.log('[cc-prioritise] No open items to score');
      return jsonResponse({ scored: 0, items: [] }, req);
    }

    // Group by org to batch deal-context lookups per org
    const byOrg = new Map<string, CommandCentreItem[]>();
    for (const item of items as CommandCentreItem[]) {
      const group = byOrg.get(item.org_id) ?? [];
      group.push(item);
      byOrg.set(item.org_id, group);
    }

    const allScored: ScoredItem[] = [];
    for (const [orgId, orgItems] of byOrg) {
      const scored = await scoreAndPersistItems(supabase, orgItems, orgId);
      allScored.push(...scored);
    }

    console.log('[cc-prioritise] Batch complete', { scored: allScored.length });

    return jsonResponse({ scored: allScored.length, items: allScored }, req);
  }

  return errorResponse('Provide item_id or batch:true', req, 400);
});
