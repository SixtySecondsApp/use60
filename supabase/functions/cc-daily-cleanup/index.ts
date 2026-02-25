/**
 * cc-daily-cleanup
 *
 * CC9-004: Daily cleanup cron for Command Centre items.
 *
 * Runs daily at 6:00 AM UTC (before the morning briefing cycle) to:
 *   1. Auto-resolve stale items where the underlying action is already done
 *      (deal closed, contact responded externally)
 *   2. Re-score ALL open items using the prioritisation engine
 *      (priority_score, priority_factors, urgency updated in batches)
 *   3. Delete conversation_context entries older than 14 days (XCHAN-002)
 *
 * Service role client is used intentionally — this processes items across
 * all users and orgs. No user-scoped operation is appropriate here.
 *
 * Triggered by:
 *   - pg_cron daily at 6:00 AM UTC
 *   - Manual POST {} for on-demand runs (admin / testing)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import {
  calculatePriority,
  scoreToUrgency,
  type DealContext,
} from '../_shared/commandCentre/prioritisation.ts';
import type { CommandCentreItem } from '../_shared/commandCentre/types.ts';
import { createLogger } from '../_shared/logger.ts';

// ============================================================================
// Constants
// ============================================================================

/** Process at most this many items per page to avoid memory pressure */
const PAGE_SIZE = 500;

/** Deals in these stages are considered terminal — auto-resolve any linked CC items */
const CLOSED_STAGES = new Set(['Closed Won', 'Closed Lost', 'closed_won', 'closed_lost']);

// ============================================================================
// Types
// ============================================================================

interface DealRow {
  id: string;
  stage: string | null;
  close_date: string | null;
  owner_id: string | null;
  amount: number | null;
  stage_probability: number | null;
}

interface ContactRow {
  id: string;
  owner_id: string | null;
  last_activity_date: string | null;
}

interface CleanupStats {
  stale_checked: number;
  auto_resolved: number;
  re_scored: number;
  context_entries_deleted: number;
  errors: number;
}

// ============================================================================
// Helpers
// ============================================================================

function buildDealContext(deal: DealRow | undefined): DealContext | undefined {
  if (!deal) return undefined;
  return {
    amount: deal.amount ?? undefined,
    stage: deal.stage ?? undefined,
    stage_probability: deal.stage_probability ?? undefined,
  };
}

// ============================================================================
// Core: load stale items (open/ready/enriching, older than 24 hours)
// ============================================================================

async function loadStaleItems(
  supabase: ReturnType<typeof createClient>,
  offset: number,
): Promise<CommandCentreItem[]> {
  const { data, error } = await supabase
    .from('command_centre_items')
    .select(
      'id, org_id, user_id, source_agent, item_type, title, summary, context, ' +
      'priority_score, priority_factors, urgency, due_date, enrichment_status, ' +
      'enrichment_context, drafted_action, confidence_score, confidence_factors, ' +
      'requires_human_input, status, resolution_channel, created_at, updated_at, ' +
      'enriched_at, resolved_at, deal_id, contact_id, parent_item_id',
    )
    .in('status', ['open', 'ready', 'enriching'])
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error('[cc-daily-cleanup] Error loading stale items:', error.message);
    return [];
  }
  return (data ?? []) as CommandCentreItem[];
}

// ============================================================================
// Core: load ALL open items (for re-scoring, including non-stale)
// ============================================================================

async function loadOpenItems(
  supabase: ReturnType<typeof createClient>,
  offset: number,
): Promise<CommandCentreItem[]> {
  const { data, error } = await supabase
    .from('command_centre_items')
    .select(
      'id, org_id, user_id, source_agent, item_type, title, summary, context, ' +
      'priority_score, priority_factors, urgency, due_date, enrichment_status, ' +
      'enrichment_context, drafted_action, confidence_score, confidence_factors, ' +
      'requires_human_input, status, resolution_channel, created_at, updated_at, ' +
      'enriched_at, resolved_at, deal_id, contact_id, parent_item_id',
    )
    .in('status', ['open', 'ready', 'enriching'])
    .order('created_at', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error('[cc-daily-cleanup] Error loading open items:', error.message);
    return [];
  }
  return (data ?? []) as CommandCentreItem[];
}

// ============================================================================
// Core: fetch deal rows for a batch of deal IDs
// ============================================================================

async function fetchDeals(
  supabase: ReturnType<typeof createClient>,
  dealIds: string[],
): Promise<Map<string, DealRow>> {
  if (dealIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('deals')
    .select('id, stage, close_date, owner_id, amount, stage_probability')
    .in('id', dealIds);

  if (error) {
    console.error('[cc-daily-cleanup] Error fetching deals:', error.message);
    return new Map();
  }

  const map = new Map<string, DealRow>();
  for (const row of data ?? []) {
    map.set(row.id, row as DealRow);
  }
  return map;
}

// ============================================================================
// Core: fetch contact rows for a batch of contact IDs
// ============================================================================

async function fetchContacts(
  supabase: ReturnType<typeof createClient>,
  contactIds: string[],
): Promise<Map<string, ContactRow>> {
  if (contactIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('contacts')
    .select('id, owner_id, last_activity_date')
    .in('id', contactIds);

  if (error) {
    console.error('[cc-daily-cleanup] Error fetching contacts:', error.message);
    return new Map();
  }

  const map = new Map<string, ContactRow>();
  for (const row of data ?? []) {
    map.set(row.id, row as ContactRow);
  }
  return map;
}

// ============================================================================
// Auto-resolve logic
// ============================================================================

/**
 * Determine whether a stale item should be auto-resolved and return a reason,
 * or null if it should remain open.
 */
function shouldAutoResolve(
  item: CommandCentreItem,
  deal: DealRow | undefined,
  contact: ContactRow | undefined,
): string | null {
  // 1. Deal-linked items: auto-resolve if deal moved to a closed stage
  if (item.deal_id && deal) {
    const stage = (deal.stage ?? '').trim();
    if (CLOSED_STAGES.has(stage)) {
      return `Deal reached closed stage: ${stage}`;
    }
    // Also auto-resolve deal_action items where close_date is in the past
    if (item.item_type === 'deal_action' && deal.close_date) {
      const closeDate = new Date(deal.close_date);
      if (closeDate < new Date()) {
        return `Deal close_date passed: ${deal.close_date}`;
      }
    }
  }

  // 2. Contact-linked items: if contact has newer activity than when the CC item
  //    was created, an action was likely taken externally — auto-resolve outreach items.
  if (item.contact_id && contact && contact.last_activity_date) {
    const activityDate = new Date(contact.last_activity_date);
    const itemCreated = new Date(item.created_at);
    if (
      activityDate > itemCreated &&
      (item.item_type === 'follow_up' || item.item_type === 'outreach')
    ) {
      return `Contact activity newer than item (${contact.last_activity_date})`;
    }
  }

  return null;
}

// ============================================================================
// Batch update helpers
// ============================================================================

async function batchAutoResolve(
  supabase: ReturnType<typeof createClient>,
  resolveMap: Map<string, string>, // itemId -> reason
): Promise<number> {
  if (resolveMap.size === 0) return 0;

  const now = new Date().toISOString();
  let resolved = 0;

  // Build batch of update objects; Supabase client doesn't support bulk update
  // with different values per row, so we use a single IN + shared values approach
  // for items with the same resolution_channel. All auto-resolves use the same channel.
  const ids = Array.from(resolveMap.keys());

  const { error } = await supabase
    .from('command_centre_items')
    .update({
      status: 'auto_resolved',
      resolution_channel: 'stale_auto_resolve',
      resolved_at: now,
      updated_at: now,
    })
    .in('id', ids);

  if (error) {
    console.error('[cc-daily-cleanup] Error batch auto-resolving items:', error.message);
  } else {
    resolved = ids.length;
    for (const [id, reason] of resolveMap) {
      console.log(`[cc-daily-cleanup] Auto-resolved item ${id}: ${reason}`);
    }
  }

  return resolved;
}

interface RescoredItem {
  id: string;
  priority_score: number;
  priority_factors: Record<string, unknown>;
  urgency: string;
  updated_at: string;
}

async function batchRescoreUpdate(
  supabase: ReturnType<typeof createClient>,
  rescored: RescoredItem[],
): Promise<number> {
  if (rescored.length === 0) return 0;

  // Upsert via update per item — Supabase doesn't support multi-row update with
  // different values. We chunk into groups of 50 parallel updates for efficiency.
  const CHUNK = 50;
  let updated = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < rescored.length; i += CHUNK) {
    const chunk = rescored.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (row) => {
        const { error } = await supabase
          .from('command_centre_items')
          .update({
            priority_score: row.priority_score,
            priority_factors: row.priority_factors,
            urgency: row.urgency,
            updated_at: now,
          })
          .eq('id', row.id);

        if (error) {
          console.error(`[cc-daily-cleanup] Error re-scoring item ${row.id}:`, error.message);
        } else {
          updated++;
        }
      }),
    );
  }

  return updated;
}

// ============================================================================
// Phase 1: Stale item check + auto-resolve
// ============================================================================

async function runStaleCheck(
  supabase: ReturnType<typeof createClient>,
  stats: CleanupStats,
): Promise<void> {
  let offset = 0;

  while (true) {
    const items = await loadStaleItems(supabase, offset);
    if (items.length === 0) break;

    stats.stale_checked += items.length;

    // Collect unique IDs needed for lookups
    const dealIds = [...new Set(items.map((i) => i.deal_id).filter(Boolean) as string[])];
    const contactIds = [...new Set(items.map((i) => i.contact_id).filter(Boolean) as string[])];

    const [dealMap, contactMap] = await Promise.all([
      fetchDeals(supabase, dealIds),
      fetchContacts(supabase, contactIds),
    ]);

    const resolveMap = new Map<string, string>();

    for (const item of items) {
      try {
        const deal = item.deal_id ? dealMap.get(item.deal_id) : undefined;
        const contact = item.contact_id ? contactMap.get(item.contact_id) : undefined;
        const reason = shouldAutoResolve(item, deal, contact);
        if (reason) {
          resolveMap.set(item.id, reason);
        }
      } catch (err) {
        console.error(`[cc-daily-cleanup] Error checking item ${item.id}:`, err);
        stats.errors++;
      }
    }

    const resolved = await batchAutoResolve(supabase, resolveMap);
    stats.auto_resolved += resolved;

    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
}

// ============================================================================
// Phase 2: Re-score ALL open items
// ============================================================================

async function runRescoring(
  supabase: ReturnType<typeof createClient>,
  stats: CleanupStats,
): Promise<void> {
  let offset = 0;

  while (true) {
    const items = await loadOpenItems(supabase, offset);
    if (items.length === 0) break;

    // Collect deal IDs for deal-value context
    const dealIds = [...new Set(items.map((i) => i.deal_id).filter(Boolean) as string[])];
    const dealMap = await fetchDeals(supabase, dealIds);

    const rescored: RescoredItem[] = [];

    for (const item of items) {
      try {
        const deal = item.deal_id ? dealMap.get(item.deal_id) : undefined;
        const dealContext = buildDealContext(deal);
        const { score, factors } = calculatePriority(item, dealContext);
        const urgency = scoreToUrgency(score);

        rescored.push({
          id: item.id,
          priority_score: score,
          priority_factors: factors as unknown as Record<string, unknown>,
          urgency,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`[cc-daily-cleanup] Error re-scoring item ${item.id}:`, err);
        stats.errors++;
      }
    }

    const updated = await batchRescoreUpdate(supabase, rescored);
    stats.re_scored += updated;

    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
}

// ============================================================================
// Phase 3: Delete conversation_context entries older than 14 days (XCHAN-002)
// ============================================================================

async function runContextCleanup(
  supabase: ReturnType<typeof createClient>,
  stats: CleanupStats,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabase
    .from('conversation_context')
    .delete({ count: 'exact' })
    .lt('last_updated', cutoff);

  if (error) {
    logger.error('context_cleanup.failed', error, { cutoff });
    stats.errors++;
  } else {
    const deleted = count ?? 0;
    stats.context_entries_deleted += deleted;
    logger.info('context_cleanup.complete', { deleted, cutoff });
  }
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  const logger = createLogger('cc-daily-cleanup');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    await logger.flush();
    return errorResponse('Missing Supabase environment variables', req, 500);
  }

  // Service role client — intentional, documented:
  // This cron processes CC items across ALL users and orgs.
  // No user-scoped RLS client is appropriate for a background sweep.
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stats: CleanupStats = {
    stale_checked: 0,
    auto_resolved: 0,
    re_scored: 0,
    context_entries_deleted: 0,
    errors: 0,
  };

  try {
    // Phase 1: Check stale items (>24h) and auto-resolve where action is done
    await runStaleCheck(supabase, stats);

    // Phase 2: Re-score ALL open items (including fresh ones updated by phase 1)
    await runRescoring(supabase, stats);

    // Phase 3: Delete conversation_context entries older than 14 days (XCHAN-002)
    await runContextCleanup(supabase, stats, logger);

    logger.info('cleanup.complete', { ...stats });
    await logger.flush();

    return jsonResponse(
      {
        success: true,
        message: 'Daily cleanup complete',
        stats,
      },
      req,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('cleanup.unhandled_error', err);
    await logger.flush();
    return errorResponse(`Cleanup failed: ${message}`, req, 500);
  }
});
