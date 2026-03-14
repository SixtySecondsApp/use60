/**
 * Brain Context Cache — pre-fetches and caches Brain data for skill execution.
 *
 * Avoids per-invocation latency by holding an in-memory cache with 5-min TTL.
 * Only queries the tables listed in the skill's brain_context frontmatter.
 *
 * Story: SBI-010
 *
 * Rules:
 *   - Never select('*') — always explicit columns
 *   - Always filter by org_id (belt-and-suspenders on top of RLS)
 *   - maybeSingle() when a record might not exist
 *   - Return empty / null for missing data — never throw
 *   - Pin @supabase/supabase-js@2.43.4
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

export interface BrainContext {
  contactMemory?: {
    relationship_strength: number;
    total_meetings: number;
    last_interaction_at: string | null;
    communication_style: any;
  };
  dealEvents?: Array<{
    event_type: string;
    event_category: string;
    summary: string;
    confidence: number;
    source_timestamp: string;
  }>;
  memories?: Array<{
    category: string;
    subject: string;
    content: string;
  }>;
  commitments?: Array<{
    summary: string;
    detail: any;
    source_timestamp: string;
  }>;
}

interface CacheEntry {
  data: BrainContext;
  formatted: string;
  expires: number;
}

// =============================================================================
// Cache (5-minute TTL, matches fleetRouter.ts pattern)
// =============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000;
const brainCache = new Map<string, CacheEntry>();

function buildCacheKey(
  orgId: string,
  contactId: string | null,
  dealId: string | null,
  tables: string[],
): string {
  return `${orgId}:${contactId || ''}:${dealId || ''}:${tables.slice().sort().join(',')}`;
}

// =============================================================================
// Query Helpers
// =============================================================================

async function fetchContactMemory(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<BrainContext['contactMemory'] | undefined> {
  const { data, error } = await supabase
    .from('contact_memory')
    .select('relationship_strength, total_meetings, last_interaction_at, communication_style')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (error) {
    console.warn('[brainContextCache] contact_memory query error:', error.message);
    return undefined;
  }

  if (!data) return undefined;

  return {
    relationship_strength: data.relationship_strength ?? 0,
    total_meetings: data.total_meetings ?? 0,
    last_interaction_at: data.last_interaction_at ?? null,
    communication_style: data.communication_style ?? null,
  };
}

async function fetchDealEvents(
  supabase: SupabaseClient,
  orgId: string,
  dealId: string,
): Promise<BrainContext['dealEvents']> {
  const { data, error } = await supabase
    .from('deal_memory_events')
    .select('event_type, event_category, summary, confidence, source_timestamp')
    .eq('org_id', orgId)
    .eq('deal_id', dealId)
    .eq('is_active', true)
    .order('source_timestamp', { ascending: false })
    .limit(5);

  if (error) {
    console.warn('[brainContextCache] deal_memory_events query error:', error.message);
    return [];
  }

  return (data ?? []) as NonNullable<BrainContext['dealEvents']>;
}

async function fetchCopilotMemories(
  supabase: SupabaseClient,
  userId: string,
  contactId: string | null,
  dealId: string | null,
): Promise<BrainContext['memories']> {
  // Build OR filter based on available identifiers
  const orClauses: string[] = [];
  if (contactId) orClauses.push(`contact_id.eq.${contactId}`);
  if (dealId) orClauses.push(`deal_id.eq.${dealId}`);

  // If neither contactId nor dealId, nothing to query
  if (orClauses.length === 0) return [];

  const { data, error } = await supabase
    .from('copilot_memories')
    .select('category, subject, content')
    .eq('user_id', userId)
    .or(orClauses.join(','))
    .order('updated_at', { ascending: false })
    .limit(3);

  if (error) {
    console.warn('[brainContextCache] copilot_memories query error:', error.message);
    return [];
  }

  return (data ?? []) as NonNullable<BrainContext['memories']>;
}

async function fetchCommitments(
  supabase: SupabaseClient,
  orgId: string,
  dealId: string,
): Promise<BrainContext['commitments']> {
  const { data, error } = await supabase
    .from('deal_memory_events')
    .select('summary, detail, source_timestamp')
    .eq('org_id', orgId)
    .eq('deal_id', dealId)
    .eq('is_active', true)
    .eq('event_type', 'commitment_made')
    .order('source_timestamp', { ascending: false });

  if (error) {
    console.warn('[brainContextCache] commitments query error:', error.message);
    return [];
  }

  // Filter to pending status in application code (detail is JSONB)
  return ((data ?? []) as Array<{ summary: string; detail: any; source_timestamp: string }>)
    .filter((row) => row.detail?.status === 'pending')
    .map((row) => ({
      summary: row.summary,
      detail: row.detail,
      source_timestamp: row.source_timestamp,
    }));
}

// =============================================================================
// Formatter
// =============================================================================

const MAX_FORMATTED_CHARS = 1600; // ~400 tokens

function formatBrainContext(ctx: BrainContext): string {
  const lines: string[] = ['[BRAIN CONTEXT — What you know]'];

  // Relationship line
  if (ctx.contactMemory) {
    const strength = Math.round(ctx.contactMemory.relationship_strength * 100);
    const meetings = ctx.contactMemory.total_meetings;
    let lastAgo = '';
    if (ctx.contactMemory.last_interaction_at) {
      const daysSince = Math.floor(
        (Date.now() - new Date(ctx.contactMemory.last_interaction_at).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      lastAgo =
        daysSince === 0
          ? 'today'
          : daysSince === 1
            ? '1 day ago'
            : `${daysSince} days ago`;
    }
    const parts = [`${strength}% strength`, `${meetings} meeting${meetings !== 1 ? 's' : ''}`];
    if (lastAgo) parts.push(`last ${lastAgo}`);
    lines.push(`Relationship: ${parts.join(', ')}`);
  }

  // Open commitments line
  if (ctx.commitments && ctx.commitments.length > 0) {
    const summaries = ctx.commitments
      .map((c) => c.summary)
      .join('; ');
    lines.push(`Open commitments: ${summaries}`);
  }

  // Recent signals from deal events
  if (ctx.dealEvents && ctx.dealEvents.length > 0) {
    const signalEvents = ctx.dealEvents.filter(
      (e) => e.event_category === 'signal' || e.event_category === 'sentiment',
    );
    if (signalEvents.length > 0) {
      const signalSummaries = signalEvents
        .slice(0, 3)
        .map((e) => e.summary)
        .join('; ');
      lines.push(`Recent signals: ${signalSummaries}`);
    }
  }

  // Key context from copilot memories
  if (ctx.memories && ctx.memories.length > 0) {
    const contextParts = ctx.memories
      .slice(0, 3)
      .map((m) => m.content)
      .join('; ');
    lines.push(`Key context: ${contextParts}`);
  }

  // If only the header line, no data was found
  if (lines.length <= 1) return '';

  // Truncate to max chars
  let result = lines.join('\n');
  if (result.length > MAX_FORMATTED_CHARS) {
    result = result.slice(0, MAX_FORMATTED_CHARS - 3) + '...';
  }

  return result;
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Pre-fetch and cache Brain data for skill execution.
 *
 * Only queries the tables listed in the `tables` parameter (from skill
 * brain_context frontmatter). Results are cached in-memory with a 5-min TTL.
 *
 * @param orgId     - Organization ID
 * @param contactId - Contact ID (nullable)
 * @param dealId    - Deal ID (nullable)
 * @param userId    - Current user ID
 * @param tables    - Table names from skill brain_context frontmatter
 * @param supabase  - Supabase client instance
 * @returns { context, formatted } — raw BrainContext and a markdown-formatted string
 */
export async function getBrainContext(
  orgId: string,
  contactId: string | null,
  dealId: string | null,
  userId: string,
  tables: string[],
  supabase: SupabaseClient,
): Promise<{ context: BrainContext; formatted: string }> {
  const cacheKey = buildCacheKey(orgId, contactId, dealId, tables);
  const now = Date.now();

  // Check cache
  const cached = brainCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return { context: cached.data, formatted: cached.formatted };
  }

  // Build parallel queries based on requested tables
  const context: BrainContext = {};
  const queries: Promise<void>[] = [];

  if (tables.includes('contact_memory') && contactId) {
    queries.push(
      fetchContactMemory(supabase, orgId, contactId).then((result) => {
        context.contactMemory = result;
      }),
    );
  }

  if (tables.includes('deal_memory_events') && dealId) {
    queries.push(
      fetchDealEvents(supabase, orgId, dealId).then((result) => {
        context.dealEvents = result;
      }),
    );
  }

  if (tables.includes('copilot_memories')) {
    queries.push(
      fetchCopilotMemories(supabase, userId, contactId, dealId).then((result) => {
        context.memories = result;
      }),
    );
  }

  if (tables.includes('commitments') && dealId) {
    queries.push(
      fetchCommitments(supabase, orgId, dealId).then((result) => {
        context.commitments = result;
      }),
    );
  }

  // Execute all queries in parallel
  await Promise.all(queries);

  // Format the context
  const formatted = formatBrainContext(context);

  // Cache the result
  brainCache.set(cacheKey, {
    data: context,
    formatted,
    expires: now + CACHE_TTL_MS,
  });

  return { context, formatted };
}

// =============================================================================
// Cache Management
// =============================================================================

/** Clear all cached brain context entries. */
export function invalidateBrainCache(): void {
  brainCache.clear();
}

/** Remove a specific cache entry. */
export function invalidateBrainCacheEntry(
  orgId: string,
  contactId: string | null,
  dealId: string | null,
  tables: string[],
): void {
  const cacheKey = buildCacheKey(orgId, contactId, dealId, tables);
  brainCache.delete(cacheKey);
}
