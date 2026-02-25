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
 * Stories: CC8-004, DEDUP-003
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
import { createLogger } from '../_shared/logger.ts';

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
// Post-scoring dedup re-check (DEDUP-003)
//
// After an item is scored, check whether its merge group now has enough
// corroborating agents to push merged_confidence above the suggest→approve
// threshold (0.7). If so, update the primary item's status to 'approved'.
//
// Rules:
//  - Only runs when the item belongs to a merge group (merge_group_id IS NOT NULL)
//  - Requires >= 2 agents with individual confidence_score > 0.6
//  - merged_confidence = 1 - ∏(1 - confidence_i), capped at 0.95
//  - If merged_confidence crosses 0.7 AND primary item status is 'ready',
//    promote status to 'approved'
// ---------------------------------------------------------------------------

const MERGE_CONFIDENCE_THRESHOLD = 0.7;
const MERGE_CONFIDENCE_CAP = 0.95;
const MIN_QUALIFYING_AGENTS = 2;
const MIN_AGENT_CONFIDENCE = 0.6;

interface MergeGroupMember {
  id: string;
  is_primary: boolean;
  confidence_score: number | null;
  merged_confidence: number | null;
  status: string;
}

type ItemWithDedupFields = CommandCentreItem & {
  merge_group_id?: string | null;
  is_primary?: boolean;
  merged_confidence?: number | null;
  dedup_key?: string | null;
  contributing_agents?: string[] | null;
  merge_window_expires?: string | null;
};

/**
 * Re-checks the merge group for an item after scoring. If the group now has
 * multi-agent corroboration above the threshold, promotes the primary item.
 *
 * @returns true if a threshold crossing was detected and the primary updated
 */
async function recheckMergeGroupThreshold(
  supabase: ReturnType<typeof getServiceClient>,
  item: ItemWithDedupFields,
  logger: ReturnType<typeof createLogger>,
): Promise<boolean> {
  if (!item.merge_group_id) return false;

  // Load all items in the same merge group
  const { data: groupMembers, error: groupError } = await supabase
    .from('command_centre_items')
    .select('id, is_primary, confidence_score, merged_confidence, status')
    .eq('merge_group_id', item.merge_group_id);

  if (groupError) {
    logger.error('dedup.recheck.group_load_failed', groupError, {
      merge_group_id: item.merge_group_id,
      item_id: item.id,
    });
    return false;
  }

  if (!groupMembers || groupMembers.length === 0) return false;

  const members = groupMembers as MergeGroupMember[];

  // Find primary item
  const primary = members.find(m => m.is_primary);
  if (!primary) {
    logger.warn('dedup.recheck.no_primary', {
      merge_group_id: item.merge_group_id,
      member_count: members.length,
    });
    return false;
  }

  // Count agents with individual confidence > MIN_AGENT_CONFIDENCE
  const qualifyingAgents = members.filter(
    m => (m.confidence_score ?? 0) > MIN_AGENT_CONFIDENCE
  );

  if (qualifyingAgents.length < MIN_QUALIFYING_AGENTS) {
    logger.info('dedup.recheck.insufficient_agents', {
      merge_group_id: item.merge_group_id,
      qualifying_count: qualifyingAgents.length,
      required: MIN_QUALIFYING_AGENTS,
    });
    return false;
  }

  // Recalculate merged_confidence using: 1 - ∏(1 - confidence_i)
  // Only include agents with a meaningful confidence score (> 0)
  const scores = qualifyingAgents
    .map(m => m.confidence_score ?? 0)
    .filter(s => s > 0);

  const product = scores.reduce((acc, s) => acc * (1 - s), 1);
  const newMergedConfidence = Math.min(1 - product, MERGE_CONFIDENCE_CAP);

  logger.info('dedup.recheck.confidence_calculated', {
    merge_group_id: item.merge_group_id,
    qualifying_agents: qualifyingAgents.length,
    scores,
    new_merged_confidence: newMergedConfidence,
    threshold: MERGE_CONFIDENCE_THRESHOLD,
  });

  // Update merged_confidence on the primary item
  const updates: Record<string, unknown> = { merged_confidence: newMergedConfidence };

  // If threshold is crossed and primary is still in 'ready' state, promote to 'approved'
  const crossesThreshold = newMergedConfidence >= MERGE_CONFIDENCE_THRESHOLD;
  const canPromote = primary.status === 'ready';

  if (crossesThreshold && canPromote) {
    updates.status = 'approved';
    logger.info('dedup.recheck.threshold_crossed', {
      merge_group_id: item.merge_group_id,
      primary_id: primary.id,
      merged_confidence: newMergedConfidence,
      previous_status: primary.status,
      new_status: 'approved',
    });
  }

  const { error: updateError } = await supabase
    .from('command_centre_items')
    .update(updates)
    .eq('id', primary.id);

  if (updateError) {
    logger.error('dedup.recheck.primary_update_failed', updateError, {
      primary_id: primary.id,
      merge_group_id: item.merge_group_id,
    });
    return false;
  }

  return crossesThreshold && canPromote;
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

  let body: { item_id?: string; batch?: boolean; user_id?: string; trace_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', req, 400);
  }

  const supabase = getServiceClient();
  const traceId = body.trace_id;
  const logger = createLogger('cc-prioritise', { traceId });

  // Insert pipeline stage execution record (non-fatal)
  const prioritiseTrace = traceId ?? logger.trace_id;
  let prioritiseExecutionId: string | null = null;
  try {
    const { data: execRow, error: execInsertErr } = await supabase
      .from('agent_executions')
      .insert({
        trace_id: prioritiseTrace,
        agent_name: 'cc-prioritise',
        execution_type: 'pipeline_stage',
        triggered_by: body.item_id ? 'single_item' : 'batch',
        started_at: new Date().toISOString(),
        status: 'running',
      })
      .select('id')
      .single();
    if (execInsertErr) {
      logger.warn('executions.insert_failed', { error: execInsertErr.message });
    } else {
      prioritiseExecutionId = (execRow as { id: string }).id;
    }
  } catch (execErr) {
    logger.warn('executions.insert_error', { error: String(execErr) });
  }

  // Column list shared by both modes — includes dedup fields added in DEDUP-001
  const ITEM_COLUMNS = [
    'id', 'org_id', 'user_id', 'source_agent', 'source_event_id', 'item_type',
    'title', 'summary', 'context', 'priority_score', 'priority_factors', 'urgency',
    'due_date', 'enrichment_status', 'enrichment_context', 'drafted_action',
    'confidence_score', 'confidence_factors', 'requires_human_input', 'status',
    'resolution_channel', 'created_at', 'updated_at', 'enriched_at', 'resolved_at',
    'deal_id', 'contact_id', 'parent_item_id',
    // DEDUP-001 columns
    'dedup_key', 'merge_group_id', 'is_primary', 'merged_evidence',
    'merged_confidence', 'contributing_agents', 'merge_window_expires',
  ].join(', ');

  // ------------------------------------------------------------------
  // Single-item mode
  // ------------------------------------------------------------------
  if (body.item_id) {
    logger.info('single_item.start', { item_id: body.item_id });

    const { data: item, error } = await supabase
      .from('command_centre_items')
      .select(ITEM_COLUMNS)
      .eq('id', body.item_id)
      .maybeSingle();

    if (error) {
      logger.error('single_item.load_failed', error, { item_id: body.item_id });
      if (prioritiseExecutionId) {
        await supabase
          .from('agent_executions')
          .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: error.message })
          .eq('id', prioritiseExecutionId);
      }
      await logger.flush();
      return errorResponse('Failed to load item', req, 500);
    }

    if (!item) {
      if (prioritiseExecutionId) {
        await supabase
          .from('agent_executions')
          .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: 'Item not found' })
          .eq('id', prioritiseExecutionId);
      }
      await logger.flush();
      return errorResponse('Item not found', req, 404);
    }

    const typedItem = item as ItemWithDedupFields;

    const scored = await scoreAndPersistItems(supabase, [typedItem], typedItem.org_id);

    // DEDUP-003: Post-scoring re-check for merge group threshold crossing
    await recheckMergeGroupThreshold(supabase, typedItem, logger);

    if (prioritiseExecutionId) {
      await supabase
        .from('agent_executions')
        .update({ status: 'completed', completed_at: new Date().toISOString(), items_processed: 1, items_emitted: scored.length })
        .eq('id', prioritiseExecutionId);
    }
    await logger.flush();
    return jsonResponse({ scored: scored.length, items: scored }, req);
  }

  // ------------------------------------------------------------------
  // Batch mode
  // ------------------------------------------------------------------
  if (body.batch) {
    const filter = body.user_id ? { user_id: body.user_id } : null;
    logger.info('batch.start', { user_id: body.user_id ?? 'all' });

    let query = supabase
      .from('command_centre_items')
      .select(ITEM_COLUMNS)
      .in('status', ['open', 'enriching', 'ready']);

    if (filter?.user_id) {
      query = query.eq('user_id', filter.user_id);
    }

    const { data: items, error } = await query;

    if (error) {
      logger.error('batch.load_failed', error);
      if (prioritiseExecutionId) {
        await supabase
          .from('agent_executions')
          .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: error.message })
          .eq('id', prioritiseExecutionId);
      }
      await logger.flush();
      return errorResponse('Failed to load items', req, 500);
    }

    if (!items || items.length === 0) {
      logger.info('batch.no_items');
      if (prioritiseExecutionId) {
        await supabase
          .from('agent_executions')
          .update({ status: 'completed', completed_at: new Date().toISOString(), items_processed: 0, items_emitted: 0 })
          .eq('id', prioritiseExecutionId);
      }
      await logger.flush();
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
    let thresholdCrossings = 0;

    for (const [orgId, orgItems] of byOrg) {
      const scored = await scoreAndPersistItems(supabase, orgItems, orgId);
      allScored.push(...scored);

      // DEDUP-003: Post-scoring re-check for each item in the org batch
      // Deduplicate by merge_group_id so we don't recheck the same group multiple times
      const seenGroups = new Set<string>();
      for (const orgItem of orgItems) {
        const typedItem = orgItem as ItemWithDedupFields;
        if (!typedItem.merge_group_id) continue;
        if (seenGroups.has(typedItem.merge_group_id)) continue;
        seenGroups.add(typedItem.merge_group_id);

        const promoted = await recheckMergeGroupThreshold(supabase, typedItem, logger);
        if (promoted) thresholdCrossings++;
      }
    }

    logger.info('batch.complete', { scored: allScored.length, threshold_crossings: thresholdCrossings });

    if (prioritiseExecutionId) {
      await supabase
        .from('agent_executions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          items_processed: (items as CommandCentreItem[]).length,
          items_emitted: allScored.length,
          metadata: { threshold_crossings: thresholdCrossings },
        })
        .eq('id', prioritiseExecutionId);
    }
    await logger.flush();

    return jsonResponse({ scored: allScored.length, items: allScored }, req);
  }

  if (prioritiseExecutionId) {
    await supabase
      .from('agent_executions')
      .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: 'Missing item_id or batch:true' })
      .eq('id', prioritiseExecutionId);
  }
  await logger.flush();
  return errorResponse('Provide item_id or batch:true', req, 400);
});
