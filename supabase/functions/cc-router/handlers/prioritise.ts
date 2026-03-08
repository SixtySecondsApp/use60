/**
 * Handler extracted from cc-prioritise/index.ts
 * CC8-004, DEDUP-003: Command Centre Prioritisation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  jsonResponse,
  errorResponse,
} from '../../_shared/corsHelper.ts';
import { calculatePriority, scoreToUrgency, type DealContext } from '../../_shared/commandCentre/prioritisation.ts';
import type { CommandCentreItem } from '../../_shared/commandCentre/types.ts';
import { createLogger } from '../../_shared/logger.ts';
import { verifyCronSecret } from '../../_shared/edgeAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// ---------------------------------------------------------------------------
// Deal context loader
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
// Core: score and persist
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
// DEDUP-003: Post-scoring dedup re-check
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

async function recheckMergeGroupThreshold(
  supabase: ReturnType<typeof getServiceClient>,
  item: ItemWithDedupFields,
  logger: ReturnType<typeof createLogger>,
): Promise<boolean> {
  if (!item.merge_group_id) return false;

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

  const primary = members.find(m => m.is_primary);
  if (!primary) {
    logger.warn('dedup.recheck.no_primary', {
      merge_group_id: item.merge_group_id,
      member_count: members.length,
    });
    return false;
  }

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

  const updates: Record<string, unknown> = { merged_confidence: newMergedConfidence };

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
// Handler
// ---------------------------------------------------------------------------

export async function handlePrioritise(req: Request): Promise<Response> {
  // Auth: require cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret)) {
    return errorResponse('Unauthorized', req, 401);
  }

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

  // Column list shared by both modes
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

      // DEDUP-003: Post-scoring re-check
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
}
