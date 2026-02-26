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
 * BP-002 additions:
 * - Priority-based fetch: queue_priority ASC, queued_at ASC (P0 first, FIFO within tier)
 * - Max 5 concurrent enrichments (semaphore pattern)
 * - Per-provider rate limits (HubSpot: 8/min, Calendar: 10/min, Slack: 5/min)
 * - Rate-limited items re-queued with 60s delay (processing_attempts NOT incremented)
 * - Structured logging via createLogger({ service: 'cc-enrich' })
 *
 * BP-003 additions:
 * - Batch mode trigger: when queue depth > 20 items at the same priority level
 * - Batch CRM lookups: up to 10 deals in one query instead of per-item queries
 * - Batch calendar lookups: single range query covering all contact/deal IDs
 * - Batch Slack notifications: one summary per channel instead of N individual messages
 * - Queue health metrics: log depth by priority, avg time-in-queue, throughput
 *
 * Story: CC10-001 / BP-002 / BP-003
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
import { createLogger } from '../_shared/logger.ts';

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
  queue_priority: number | null;
  queued_at: string | null;
  processing_attempts: number | null;
  urgency: string;
  due_date: string | null;
  // DEDUP-001 fields
  dedup_key: string | null;
  merge_group_id: string | null;
  is_primary: boolean | null;
  merged_evidence: unknown[] | null;
  merged_confidence: number | null;
  contributing_agents: string[] | null;
  merge_window_expires: string | null;
}

// ---------------------------------------------------------------------------
// Rate limiter — simple per-minute token counter per provider
//
// Providers map to loaders:
//   hubspot  -> crm
//   calendar -> calendar
//   slack    -> (no direct loader yet, reserved)
//
// Rate limits (requests per minute):
//   HubSpot:  8
//   Calendar: 10
//   Slack:    5
// ---------------------------------------------------------------------------

interface RateLimitBucket {
  limit: number;
  count: number;
  windowStart: number; // ms epoch
}

const RATE_LIMITS: Record<string, number> = {
  hubspot: 8,
  calendar: 10,
  slack: 5,
};

// Loader → provider mapping (only loaders that hit an external/rate-limited provider)
const LOADER_PROVIDER_MAP: Partial<Record<LoaderName, string>> = {
  crm: 'hubspot',
  calendar: 'calendar',
};

class RateLimiter {
  private buckets = new Map<string, RateLimitBucket>();

  /**
   * Attempt to consume a request slot for the given provider.
   * Returns true if allowed, false if the rate limit is exceeded.
   */
  tryConsume(provider: string): boolean {
    const limit = RATE_LIMITS[provider];
    if (limit === undefined) return true; // no limit configured — allow

    const now = Date.now();
    let bucket = this.buckets.get(provider);

    if (!bucket || now - bucket.windowStart >= 60_000) {
      // Start a fresh window
      bucket = { limit, count: 0, windowStart: now };
      this.buckets.set(provider, bucket);
    }

    if (bucket.count >= bucket.limit) {
      return false; // rate limited
    }

    bucket.count += 1;
    return true;
  }
}

// ---------------------------------------------------------------------------
// Semaphore — limits concurrent enrichments to MAX_CONCURRENT
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 5;

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (this.active < MAX_CONCURRENT) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
  }

  release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

interface LoaderContext {
  supabase: ReturnType<typeof createClient>;
  item: PendingItem;
}

interface EnrichmentResult {
  id: string;
  status: 'enriched' | 'failed' | 'rate_limited';
  error?: string;
}

// ---------------------------------------------------------------------------
// BP-003: Batch Processing
//
// Trigger: when queue depth > BATCH_MODE_THRESHOLD items at the same priority.
// Batch CRM: fetch up to BATCH_CRM_MAX_DEALS deals in one query, keyed by deal_id.
// Batch calendar: single range query covering all contact/deal IDs.
// Batch Slack: collect notifications, emit one summary per channel at end of run.
//
// BatchContext is built before enrichment and injected into the loader wrappers
// so individual enrichItem calls consume pre-fetched data without extra DB hits.
// ---------------------------------------------------------------------------

const BATCH_MODE_THRESHOLD = 20;
const BATCH_CRM_MAX_DEALS = 10;

interface BatchDealData {
  id: string;
  name: string;
  company: string;
  value: number | null;
  close_date: string | null;
  expected_close_date: string | null;
  owner_id: string;
  status: string | null;
  priority: string | null;
  health_score: number | null;
  risk_level: string | null;
  momentum_score: number | null;
  probability: number | null;
  next_steps: string | null;
  stage_changed_at: string | null;
  deal_stages: { name: string; order_position: number } | null;
}

interface BatchCalendarEvent {
  id: string;
  title: string;
  start_time: string;
  attendees_count: number;
  contact_id: string | null;
  deal_id: string | null;
}

interface BatchContext {
  /** Pre-fetched deal data keyed by deal_id — only populated in batch mode */
  deals: Map<string, BatchDealData>;
  /** Pre-fetched calendar events keyed by contact_id or deal_id */
  calendarEvents: Map<string, BatchCalendarEvent[]>;
  /** Slack notification queue: channel → list of messages */
  slackNotifications: Map<string, string[]>;
  /** Whether batch mode is active for this run */
  active: boolean;
}

function createBatchContext(): BatchContext {
  return {
    deals: new Map(),
    calendarEvents: new Map(),
    slackNotifications: new Map(),
    active: false,
  };
}

/**
 * Pre-fetch deal data for a batch of items (up to BATCH_CRM_MAX_DEALS).
 * Results stored in batchCtx.deals, consumed by the crm loader wrapper.
 */
async function prefetchBatchDeals(
  supabase: ReturnType<typeof createClient>,
  items: PendingItem[],
  batchCtx: BatchContext,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const dealIds = [
    ...new Set(items.map((i) => i.deal_id).filter((id): id is string => id !== null)),
  ].slice(0, BATCH_CRM_MAX_DEALS);

  if (dealIds.length === 0) return;

  const { data, error } = await supabase
    .from('deals')
    .select(
      `id,
       name,
       company,
       value,
       close_date,
       expected_close_date,
       owner_id,
       status,
       priority,
       health_score,
       risk_level,
       momentum_score,
       probability,
       next_steps,
       stage_changed_at,
       deal_stages!stage_id (
         name,
         order_position
       )`,
    )
    .in('id', dealIds);

  if (error) {
    logger.warn('batch.crm_prefetch_failed', { error: error.message, deal_count: dealIds.length });
    return;
  }

  for (const row of data ?? []) {
    batchCtx.deals.set(row.id, row as BatchDealData);
  }

  logger.info('batch.crm_prefetch_complete', {
    requested: dealIds.length,
    fetched: batchCtx.deals.size,
  });
}

/**
 * Pre-fetch calendar events for a batch of items via a single range query.
 * Events are indexed by contact_id and deal_id in batchCtx.calendarEvents.
 */
async function prefetchBatchCalendar(
  supabase: ReturnType<typeof createClient>,
  items: PendingItem[],
  batchCtx: BatchContext,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const contactIds = [...new Set(
    items.map((i) => i.contact_id).filter((id): id is string => id !== null),
  )];
  const dealIds = [...new Set(
    items.map((i) => i.deal_id).filter((id): id is string => id !== null),
  )];

  if (contactIds.length === 0 && dealIds.length === 0) return;

  const now = new Date().toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAhead = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Single range query covering all contacts and deals
  let query = supabase
    .from('calendar_events')
    .select('id, title, start_time, attendees_count, contact_id, deal_id')
    .gt('attendees_count', 1)
    .neq('status', 'cancelled')
    .gte('start_time', ninetyDaysAgo)
    .lte('start_time', thirtyDaysAhead);

  if (contactIds.length > 0 && dealIds.length > 0) {
    query = query.or(
      `contact_id.in.(${contactIds.join(',')}),deal_id.in.(${dealIds.join(',')})`,
    );
  } else if (contactIds.length > 0) {
    query = query.in('contact_id', contactIds);
  } else {
    query = query.in('deal_id', dealIds);
  }

  const { data, error } = await query.order('start_time', { ascending: true }).limit(200);

  if (error) {
    logger.warn('batch.calendar_prefetch_failed', {
      error: error.message,
      contact_count: contactIds.length,
      deal_count: dealIds.length,
    });
    return;
  }

  // Index events by contact_id and deal_id so per-item lookups are O(1)
  for (const event of data ?? []) {
    if (event.contact_id) {
      const existing = batchCtx.calendarEvents.get(event.contact_id) ?? [];
      existing.push(event as BatchCalendarEvent);
      batchCtx.calendarEvents.set(event.contact_id, existing);
    }
    if (event.deal_id) {
      const existing = batchCtx.calendarEvents.get(event.deal_id) ?? [];
      existing.push(event as BatchCalendarEvent);
      batchCtx.calendarEvents.set(event.deal_id, existing);
    }
  }

  logger.info('batch.calendar_prefetch_complete', {
    contacts: contactIds.length,
    deals: dealIds.length,
    events_indexed: (data ?? []).length,
  });
}

/**
 * Queue a Slack notification for batched delivery.
 * Call flushBatchSlackNotifications() after all items are processed.
 */
function queueBatchSlackNotification(
  batchCtx: BatchContext,
  channel: string,
  message: string,
): void {
  const existing = batchCtx.slackNotifications.get(channel) ?? [];
  existing.push(message);
  batchCtx.slackNotifications.set(channel, existing);
}

/**
 * Flush all queued Slack notifications — one summary log per channel.
 * Wire to Slack API in CC10-005 when the Slack loader is implemented.
 */
async function flushBatchSlackNotifications(
  batchCtx: BatchContext,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  if (batchCtx.slackNotifications.size === 0) return;

  for (const [channel, messages] of batchCtx.slackNotifications.entries()) {
    logger.info('batch.slack_summary', {
      channel,
      message_count: messages.length,
      // TODO CC10-005: wire to Slack API — for now we log the summary
      summary: `Batch enrichment complete: ${messages.length} item(s) processed`,
    });
  }

  batchCtx.slackNotifications.clear();
}

// ---------------------------------------------------------------------------
// BP-003: Queue health metrics
// ---------------------------------------------------------------------------

interface QueueHealthMetrics {
  depth_by_priority: Record<string, number>;
  avg_time_in_queue_seconds: number | null;
  throughput: number;
}

function computeQueueHealth(items: PendingItem[]): QueueHealthMetrics {
  const depthByPriority: Record<string, number> = {};
  let totalWaitMs = 0;
  let itemsWithQueuedAt = 0;
  const now = Date.now();

  for (const item of items) {
    const pKey = String(item.queue_priority ?? 'null');
    depthByPriority[pKey] = (depthByPriority[pKey] ?? 0) + 1;

    if (item.queued_at) {
      const waitMs = now - new Date(item.queued_at).getTime();
      if (waitMs >= 0) {
        totalWaitMs += waitMs;
        itemsWithQueuedAt += 1;
      }
    }
  }

  return {
    depth_by_priority: depthByPriority,
    avg_time_in_queue_seconds: itemsWithQueuedAt > 0
      ? Math.round(totalWaitMs / itemsWithQueuedAt / 1000)
      : null,
    throughput: items.length,
  };
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
// In batch mode, uses pre-fetched deal data from batchCtx.deals to avoid redundant queries.
async function loadCrmContext(ctx: LoaderContext, batchCtx?: BatchContext): Promise<Record<string, unknown>> {
  if (batchCtx?.active && ctx.item.deal_id && batchCtx.deals.has(ctx.item.deal_id)) {
    const batchDeal = batchCtx.deals.get(ctx.item.deal_id)!;
    const stage = batchDeal.deal_stages;
    // Fetch contact + activities individually — batch contact fetch adds complexity for minimal gain
    const baseResult = await loadCRMContext(
      ctx.supabase,
      null, // skip individual deal fetch — we have it from the batch
      ctx.item.contact_id,
      ctx.item.org_id,
    ) as Record<string, unknown> & { deal: unknown };

    baseResult.deal = {
      id: batchDeal.id,
      name: batchDeal.name,
      company: batchDeal.company,
      stage_name: stage?.name ?? null,
      stage_order: stage?.order_position ?? null,
      amount: batchDeal.value ?? null,
      close_date: batchDeal.close_date ?? null,
      expected_close_date: batchDeal.expected_close_date ?? null,
      owner_id: batchDeal.owner_id,
      status: batchDeal.status ?? null,
      priority: batchDeal.priority ?? null,
      health_score: batchDeal.health_score ?? null,
      risk_level: batchDeal.risk_level ?? null,
      momentum_score: batchDeal.momentum_score ?? null,
      probability: batchDeal.probability ?? null,
      next_steps: batchDeal.next_steps ?? null,
      stage_changed_at: batchDeal.stage_changed_at ?? null,
    };
    return baseResult;
  }

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
// In batch mode, derives enrichment from pre-fetched events in batchCtx.calendarEvents.
async function loadCalendarContext(ctx: LoaderContext, batchCtx?: BatchContext): Promise<Record<string, unknown>> {
  if (batchCtx?.active) {
    const key = ctx.item.contact_id ?? ctx.item.deal_id;
    if (key && batchCtx.calendarEvents.has(key)) {
      const events = batchCtx.calendarEvents.get(key)!;
      const nowMs = Date.now();
      const upcoming = events.filter((e) => new Date(e.start_time).getTime() >= nowMs);
      const past = events.filter((e) => new Date(e.start_time).getTime() < nowMs);

      const nextEvent = upcoming.length > 0 ? upcoming[0] : null;
      // past is sorted ascending; last element = most recent past meeting
      const lastEvent = past.length > 0 ? past[past.length - 1] : null;

      const daysSinceLastMeeting = lastEvent
        ? Math.floor((nowMs - new Date(lastEvent.start_time).getTime()) / (24 * 60 * 60 * 1000))
        : null;

      return {
        next_meeting: nextEvent ? { title: nextEvent.title, start_time: nextEvent.start_time } : null,
        last_meeting: lastEvent ? { title: lastEvent.title, date: lastEvent.start_time } : null,
        days_since_last_meeting: daysSinceLastMeeting,
        upcoming_meeting_count: upcoming.length,
      };
    }
  }

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
// Loader dispatch — batch-aware factory
// ---------------------------------------------------------------------------

function makeLoaderFns(
  batchCtx: BatchContext,
): Record<LoaderName, (ctx: LoaderContext) => Promise<Record<string, unknown>>> {
  return {
    crm: (ctx) => loadCrmContext(ctx, batchCtx),
    transcript: loadTranscriptContext,
    email: loadEmailContext,
    calendar: (ctx) => loadCalendarContext(ctx, batchCtx),
    pipeline: loadPipelineContext,
    history: loadHistoryContext,
    apollo: loadApolloContext,
  };
}

// ---------------------------------------------------------------------------
// DEDUP-002: Pre-enrichment deduplication
//
// Compute dedup_key from item_type + entity (deal_id or contact_id) + action.
// If an open primary with the same key exists within its merge window:
//   - Merge new evidence + agent into the primary
//   - Aggregate confidence: 1 - prod(1 - ci), capped at 0.95
//   - Archive this item (status='auto_resolved') — skip enrichment
// If primary is already actioned (completed/dismissed):
//   - Archive without merging
// Otherwise:
//   - Stamp dedup_key + merge_window_expires on the item and proceed
// ---------------------------------------------------------------------------

function aggregateConfidence(values: number[]): number {
  if (values.length === 0) return 0;
  const product = values.reduce((acc, v) => acc * (1 - v), 1);
  return Math.min(0.95, 1 - product);
}

type DedupResult = { merged: true; primaryId: string } | { merged: false };

async function runPreEnrichmentDedup(
  supabase: ReturnType<typeof createClient>,
  item: PendingItem,
  logger: ReturnType<typeof createLogger>,
): Promise<DedupResult> {
  const entityPart = item.deal_id ?? item.contact_id ?? 'no_entity';
  const actionPart =
    (item.context?.action_type as string | undefined) ??
    (item.context?.trigger as string | undefined) ??
    'default';
  const dedupKey = `${item.item_type}:${entityPart}:${actionPart}`;
  const now = new Date().toISOString();

  const { data: existing, error } = await supabase
    .from('command_centre_items')
    .select('id, status, merged_evidence, merged_confidence, contributing_agents, queue_priority')
    .eq('dedup_key', dedupKey)
    .eq('is_primary', true)
    .gt('merge_window_expires', now)
    .neq('id', item.id)
    .maybeSingle();

  if (error) {
    // Non-fatal: log and continue without deduplication
    logger.warn('dedup.lookup_failed', { item_id: item.id, error: error.message });
    return { merged: false };
  }

  if (!existing) {
    // No active primary — stamp this item as the new primary
    const windowExpires = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('command_centre_items')
      .update({ dedup_key: dedupKey, is_primary: true, merge_window_expires: windowExpires })
      .eq('id', item.id);
    logger.info('dedup.new_primary', { item_id: item.id, dedup_key: dedupKey });
    return { merged: false };
  }

  // Primary already actioned — archive the duplicate without merging
  if (existing.status === 'completed' || existing.status === 'dismissed') {
    await supabase
      .from('command_centre_items')
      .update({ status: 'auto_resolved', enrichment_status: 'skipped' })
      .eq('id', item.id);
    logger.info('dedup.archived_superseded', {
      item_id: item.id,
      primary_id: existing.id,
      primary_status: existing.status,
    });
    return { merged: true, primaryId: existing.id };
  }

  // Merge into the open primary
  const currentEvidence: unknown[] = Array.isArray(existing.merged_evidence) ? existing.merged_evidence : [];
  const incomingEvidence: unknown[] = Array.isArray(item.context?.evidence)
    ? (item.context.evidence as unknown[])
    : [];
  const mergedEvidence = [...currentEvidence, ...incomingEvidence];

  const currentAgents: string[] = Array.isArray(existing.contributing_agents)
    ? existing.contributing_agents
    : [];
  const incomingAgent = (item.context?.source_agent as string | undefined) ?? item.item_type;
  const contributingAgents = currentAgents.includes(incomingAgent)
    ? currentAgents
    : [...currentAgents, incomingAgent];

  const currentConfidence =
    typeof existing.merged_confidence === 'number' ? existing.merged_confidence : 0;
  const incomingConfidence =
    typeof item.context?.confidence === 'number' ? (item.context.confidence as number) : 0;
  const newConfidence = aggregateConfidence([currentConfidence, incomingConfidence]);

  const mergeUpdates: Record<string, unknown> = {
    merged_evidence: mergedEvidence,
    contributing_agents: contributingAgents,
    merged_confidence: newConfidence,
  };

  // Priority escalation: 3+ contributing agents bumps queue_priority up one level (lower = higher)
  if (contributingAgents.length >= 3) {
    const currentPriority =
      typeof existing.queue_priority === 'number' ? existing.queue_priority : 2;
    mergeUpdates.queue_priority = Math.max(0, currentPriority - 1);
  }

  const { error: mergeError } = await supabase
    .from('command_centre_items')
    .update(mergeUpdates)
    .eq('id', existing.id);

  if (mergeError) {
    // Non-fatal: fall through to normal enrichment rather than losing the item
    logger.warn('dedup.merge_failed', {
      item_id: item.id,
      primary_id: existing.id,
      error: mergeError.message,
    });
    return { merged: false };
  }

  // Archive the incoming duplicate
  await supabase
    .from('command_centre_items')
    .update({ status: 'auto_resolved', enrichment_status: 'skipped', merge_group_id: existing.id })
    .eq('id', item.id);

  logger.info('dedup.merged', {
    item_id: item.id,
    primary_id: existing.id,
    contributing_agents: contributingAgents,
    merged_confidence: newConfidence,
    priority_escalated: contributingAgents.length >= 3,
  });

  return { merged: true, primaryId: existing.id };
}

// ---------------------------------------------------------------------------
// Enrich a single item
// ---------------------------------------------------------------------------

/**
 * Returns 'rate_limited' when any required loader is blocked by a rate limit.
 * The caller is responsible for re-queuing the item.
 */
async function enrichItem(
  supabase: ReturnType<typeof createClient>,
  item: PendingItem,
  creditTier: CreditTier,
  rateLimiter: RateLimiter,
  logger: ReturnType<typeof createLogger>,
  batchCtx: BatchContext,
): Promise<EnrichmentResult | 'rate_limited'> {
  const plan = getEnrichmentPlan(item.item_type, creditTier);

  logger.info('item.processing_start', {
    item_id: item.id,
    item_type: item.item_type,
    tier: creditTier,
    loaders: plan.loaders,
    queue_priority: item.queue_priority,
    batch_mode: batchCtx.active,
  });

  const ctx: LoaderContext = { supabase, item };
  const loaderFns = makeLoaderFns(batchCtx);

  // Check rate limits for all required loaders before starting any work.
  // In batch mode, skip the rate limit check for loaders whose data was pre-fetched.
  for (const loaderName of plan.loaders) {
    const provider = LOADER_PROVIDER_MAP[loaderName];
    if (!provider) continue;

    const hasBatchData =
      batchCtx.active &&
      ((loaderName === 'crm' && item.deal_id !== null && batchCtx.deals.has(item.deal_id)) ||
        (loaderName === 'calendar' &&
          ((item.contact_id !== null && batchCtx.calendarEvents.has(item.contact_id)) ||
            (item.deal_id !== null && batchCtx.calendarEvents.has(item.deal_id)))));

    if (!hasBatchData && !rateLimiter.tryConsume(provider)) {
      logger.warn('item.rate_limited', {
        item_id: item.id,
        loader: loaderName,
        provider,
      });
      return 'rate_limited';
    }
  }

  // Run all loaders in parallel (they are independent reads)
  const loaderEntries = plan.loaders.map((name) => ({ name, fn: loaderFns[name] }));
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
      logger.error('loader.failed', result.reason, { item_id: item.id, loader: loaderName });
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
    logger.error('item.db_update_failed', updateError.message, { item_id: item.id });
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

      logger.info('item.ai_draft_complete', { item_id: item.id, confidence: confidenceResult.score });
    } catch (draftErr) {
      // Drafting failure must not block the enrichment result
      logger.error('item.ai_draft_failed', draftErr, { item_id: item.id });
    }
  }

  // In batch mode, queue the Slack notification for deferred summary delivery
  if (batchCtx.active && enrichment_status === 'enriched') {
    queueBatchSlackNotification(
      batchCtx,
      `org-${item.org_id}`,
      `${item.item_type} enriched (id=${item.id})`,
    );
  }

  // Write enrichment summary to conversation_context for fleet agent pickup (XCHAN-002)
  if (enrichment_status === 'enriched') {
    const entityType = item.deal_id ? 'deal' : item.contact_id ? 'contact' : null;
    const entityId = item.deal_id ?? item.contact_id ?? null;
    if (entityType && entityId) {
      const contextSummary = `Enriched ${item.item_type}: ${item.title}. Loaders: ${plan.loaders.join(', ')}.`;
      const { error: ctxError } = await supabase
        .from('conversation_context')
        .insert({
          user_id: item.user_id,
          org_id: item.org_id,
          channel: 'fleet_agent',
          channel_ref: logger.trace_id,
          entity_type: entityType,
          entity_id: entityId,
          context_summary: contextSummary,
          last_updated: new Date().toISOString(),
        });
      if (ctxError) {
        logger.warn('item.context_write_failed', { item_id: item.id, error: ctxError.message });
      } else {
        logger.info('item.context_written', { item_id: item.id, entity_type: entityType, entity_id: entityId });
      }
    }
  }

  logger.info('item.processing_complete', { item_id: item.id, status: enrichment_status });

  return { id: item.id, status: enrichment_status };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  // Extract trace_id from request body for pipeline correlation
  let traceId: string | undefined;
  let reqBody: Record<string, unknown> = {};
  try {
    if (req.method === 'POST') {
      reqBody = await req.json().catch(() => ({}));
      traceId = typeof reqBody.trace_id === 'string' ? reqBody.trace_id : undefined;
    }
  } catch {
    // ignore parse errors — trace_id is optional
  }

  const logger = createLogger('cc-enrich', { traceId });
  const rateLimiter = new RateLimiter();
  const semaphore = new Semaphore();

  // Service role client — hoisted so it's accessible in the outer catch
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  let enrichExecutionId: string | null = null;

  try {
    // Insert pipeline stage execution record
    const enrichRunTrace = traceId ?? logger.trace_id;
    try {
      const { data: execRow, error: execInsertErr } = await supabase
        .from('agent_executions')
        .insert({
          trace_id: enrichRunTrace,
          agent_name: 'cc-enrich',
          execution_type: 'pipeline_stage',
          triggered_by: 'scheduler',
          started_at: new Date().toISOString(),
          status: 'running',
        })
        .select('id')
        .single();
      if (execInsertErr) {
        logger.warn('executions.insert_failed', { error: execInsertErr.message });
      } else {
        enrichExecutionId = (execRow as { id: string }).id;
      }
    } catch (execErr) {
      logger.warn('executions.insert_error', { error: String(execErr) });
    }

    // 1. Fetch pending items — priority-based ordering (BP-002):
    //    queue_priority ASC (P0 first), then queued_at ASC (FIFO within priority).
    //    queued_at filter ensures rate-limited items re-queued into the future are skipped.
    const now = new Date().toISOString();
    const { data: items, error: fetchError } = await supabase
      .from('command_centre_items')
      .select(
        'id, org_id, user_id, item_type, title, summary, context, deal_id, contact_id, priority_score, queue_priority, queued_at, processing_attempts, urgency, due_date, dedup_key, merge_group_id, is_primary, merged_evidence, merged_confidence, contributing_agents, merge_window_expires',
      )
      .eq('enrichment_status', 'pending')
      .lte('queued_at', now)
      .order('queue_priority', { ascending: true, nullsFirst: false })
      .order('queued_at', { ascending: true, nullsFirst: false })
      .limit(20);

    if (fetchError) {
      logger.error('fetch.failed', fetchError.message);
      if (enrichExecutionId) {
        await supabase
          .from('agent_executions')
          .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: fetchError.message })
          .eq('id', enrichExecutionId);
      }
      await logger.flush();
      return errorResponse('Failed to fetch pending items', req, 500);
    }

    if (!items || items.length === 0) {
      logger.info('fetch.empty', { queue_depth: 0 });
      if (enrichExecutionId) {
        await supabase
          .from('agent_executions')
          .update({ status: 'completed', completed_at: new Date().toISOString(), items_processed: 0, items_emitted: 0 })
          .eq('id', enrichExecutionId);
      }
      await logger.flush();
      return jsonResponse({ enriched: 0, failed: 0, rate_limited: 0, items: [] }, req);
    }

    const pendingItems = items as PendingItem[];

    // 2. Compute and log queue health metrics (BP-003)
    const queueHealth = computeQueueHealth(pendingItems);
    logger.info('queue.health', {
      depth_by_priority: queueHealth.depth_by_priority,
      avg_time_in_queue_seconds: queueHealth.avg_time_in_queue_seconds,
      throughput: queueHealth.throughput,
      batch_mode_threshold: BATCH_MODE_THRESHOLD,
    });

    // 3. Determine if batch mode should activate (BP-003)
    //    Activate when any single priority level exceeds BATCH_MODE_THRESHOLD items.
    const batchCtx = createBatchContext();
    const maxPriorityDepth = Math.max(...Object.values(queueHealth.depth_by_priority));
    if (maxPriorityDepth > BATCH_MODE_THRESHOLD) {
      batchCtx.active = true;
      logger.info('batch.mode_activated', {
        max_priority_depth: maxPriorityDepth,
        threshold: BATCH_MODE_THRESHOLD,
      });
      // Pre-fetch CRM deals and calendar events in parallel before individual enrichments
      await Promise.all([
        prefetchBatchDeals(supabase, pendingItems, batchCtx, logger),
        prefetchBatchCalendar(supabase, pendingItems, batchCtx, logger),
      ]);
    }

    // 4. Resolve credit tier per org (cache within this run)
    const tierCache = new Map<string, CreditTier>();

    async function getTier(orgId: string): Promise<CreditTier> {
      if (!tierCache.has(orgId)) {
        tierCache.set(orgId, await getOrgCreditTier(supabase, orgId));
      }
      return tierCache.get(orgId)!;
    }

    // 5. Mark all fetched items as in-flight sentinel ('skipped') to prevent
    //    a concurrent cc-enrich run from double-processing the same batch.
    //    The real outcome ('enriched', 'failed', or 'pending' for rate-limited)
    //    is written once each item completes.
    const itemIds = pendingItems.map((i) => i.id);
    await supabase
      .from('command_centre_items')
      .update({ enrichment_status: 'skipped' })
      .in('id', itemIds);

    // 6. Enrich each item concurrently up to MAX_CONCURRENT (semaphore-gated).
    //    One failure must not block others.
    const results: EnrichmentResult[] = [];

    const enrichPromises = pendingItems.map(async (item) => {
      await semaphore.acquire();
      try {
        // DEDUP-002: Pre-enrichment dedup check — skip or merge before any loader work
        const dedupResult = await runPreEnrichmentDedup(supabase, item, logger);
        if (dedupResult.merged) {
          results.push({ id: item.id, status: 'enriched' }); // counted as resolved, not failed
          return;
        }

        const tier = await getTier(item.org_id);
        const outcome = await enrichItem(supabase, item, tier, rateLimiter, logger, batchCtx);

        if (outcome === 'rate_limited') {
          // Re-queue with a 60-second delay; do NOT increment processing_attempts
          const requeueAt = new Date(Date.now() + 60_000).toISOString();
          await supabase
            .from('command_centre_items')
            .update({
              enrichment_status: 'pending',
              queued_at: requeueAt,
            })
            .eq('id', item.id);

          logger.info('item.requeued', { item_id: item.id, requeue_at: requeueAt });
          results.push({ id: item.id, status: 'rate_limited' });
        } else {
          results.push(outcome);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('item.unexpected_error', err, { item_id: item.id });

        // Mark as failed so it's not retried indefinitely
        await supabase
          .from('command_centre_items')
          .update({
            enrichment_status: 'failed',
            enriched_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        results.push({ id: item.id, status: 'failed', error: message });
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(enrichPromises);

    // 7. Flush batched Slack notifications — one summary per channel (BP-003)
    await flushBatchSlackNotifications(batchCtx, logger);

    const enriched = results.filter((r) => r.status === 'enriched').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const rate_limited = results.filter((r) => r.status === 'rate_limited').length;

    logger.info('run.complete', { enriched, failed, rate_limited, batch_mode: batchCtx.active });

    // Update pipeline stage execution record
    if (enrichExecutionId) {
      const finalStatus = failed > 0 && enriched === 0 ? 'failed' : failed > 0 ? 'partial' : 'completed';
      await supabase
        .from('agent_executions')
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString(),
          items_processed: results.length,
          items_emitted: enriched,
          metadata: { failed, rate_limited, batch_mode: batchCtx.active },
        })
        .eq('id', enrichExecutionId);
    }

    await logger.flush();
    return jsonResponse({ enriched, failed, rate_limited, items: results }, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('unhandled_error', err);
    if (enrichExecutionId) {
      try {
        await supabase
          .from('agent_executions')
          .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: message })
          .eq('id', enrichExecutionId);
      } catch { /* non-fatal */ }
    }
    await logger.flush();
    return errorResponse(message, req, 500);
  }
});
