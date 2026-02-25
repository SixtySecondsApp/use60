/**
 * CC-002: Conversational Entity Resolution
 *
 * Wraps slackEntityResolver with thread-context disambiguation,
 * @entity:slug syntax, and Block Kit disambiguation UI.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ============================================================================
// Types
// ============================================================================

export interface ResolvedEntity {
  type: 'deal' | 'contact' | 'company' | 'meeting';
  id: string;
  name: string;
  confidence: number;
  subtitle?: string;
  alternatives?: ResolvedEntity[];
}

export interface ResolvedEntities {
  deal?: ResolvedEntity;
  contact?: ResolvedEntity;
  company?: ResolvedEntity;
  meeting?: ResolvedEntity;
}

export interface ThreadEntityContext {
  active_deal_id?: string;
  active_contact_id?: string;
  active_company_id?: string;
  active_meeting_id?: string;
}

export interface DisambiguationResult {
  resolved: ResolvedEntities;
  needsDisambiguation: boolean;
  disambiguationBlocks?: unknown[]; // Slack Block Kit blocks
}

// ============================================================================
// @entity:slug Parsing
// ============================================================================

interface SlugMention {
  type: 'deal' | 'contact' | 'company';
  slug: string;
}

/**
 * Parse @entity:slug syntax from message text.
 * Examples: @deal:acme-renewal, @contact:sarah-jones, @company:acme-corp
 */
function parseSlugMentions(text: string): SlugMention[] {
  const slugPattern = /@(deal|contact|company):([a-zA-Z0-9_-]+)/gi;
  const mentions: SlugMention[] = [];
  let match: RegExpExecArray | null;

  while ((match = slugPattern.exec(text)) !== null) {
    const type = match[1].toLowerCase() as 'deal' | 'contact' | 'company';
    const slug = match[2];
    mentions.push({ type, slug });
  }

  return mentions;
}

// ============================================================================
// Database Queries
// ============================================================================

interface DealRow {
  id: string;
  title: string;
  stage: string | null;
  value: number | null;
  close_date: string | null;
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  title: string | null;
}

/**
 * Look up a deal by slug-style name (converts hyphens to spaces, ILIKE match).
 * Prefers owner_id match; falls back to org-wide.
 */
async function resolveDealBySlug(
  supabase: SupabaseClient,
  slug: string,
  userId: string,
  orgId: string
): Promise<ResolvedEntity | null> {
  const nameHint = slug.replace(/-/g, ' ');

  const { data, error } = await supabase
    .from('deals')
    .select('id, title, stage, value, close_date')
    .eq('org_id', orgId)
    .eq('owner_id', userId)
    .ilike('title', `%${nameHint}%`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[CC-002] Error resolving deal by slug:', error);
    return null;
  }

  if (!data) return null;

  const row = data as DealRow;
  return {
    type: 'deal',
    id: row.id,
    name: row.title,
    confidence: 1.0,
    subtitle: buildDealSubtitle(row),
  };
}

/**
 * Look up a contact by slug-style name.
 */
async function resolveContactBySlug(
  supabase: SupabaseClient,
  slug: string,
  userId: string,
  orgId: string
): Promise<ResolvedEntity | null> {
  const nameHint = slug.replace(/-/g, ' ');

  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, company, title')
    .eq('org_id', orgId)
    .eq('owner_id', userId)
    .or(
      `first_name.ilike.%${nameHint}%,last_name.ilike.%${nameHint}%`
    )
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[CC-002] Error resolving contact by slug:', error);
    return null;
  }

  if (!data) return null;

  const row = data as ContactRow;
  return {
    type: 'contact',
    id: row.id,
    name: buildContactName(row),
    confidence: 1.0,
    subtitle: buildContactSubtitle(row),
  };
}

/**
 * Query deals using fuzzy ILIKE matching.
 * Returns up to 5 matches ordered by recency.
 */
async function queryDeals(
  supabase: SupabaseClient,
  name: string,
  userId: string,
  orgId: string
): Promise<ResolvedEntity[]> {
  try {
    const { data, error } = await supabase
      .from('deals')
      .select('id, title, stage, value, close_date')
      .eq('org_id', orgId)
      .eq('owner_id', userId)
      .or(`title.ilike.%${name}%,company_name.ilike.%${name}%`)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error || !data) {
      if (error) console.error('[CC-002] Error querying deals:', error);
      return [];
    }

    return (data as DealRow[]).map((row) => ({
      type: 'deal' as const,
      id: row.id,
      name: row.title,
      confidence: computeConfidence(name, row.title),
      subtitle: buildDealSubtitle(row),
    }));
  } catch (e) {
    console.error('[CC-002] Exception querying deals:', e);
    return [];
  }
}

/**
 * Query contacts using fuzzy ILIKE matching.
 * Returns up to 5 matches ordered by recency.
 */
async function queryContacts(
  supabase: SupabaseClient,
  name: string,
  userId: string,
  orgId: string
): Promise<ResolvedEntity[]> {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company, title')
      .eq('org_id', orgId)
      .eq('owner_id', userId)
      .or(
        `first_name.ilike.%${name}%,last_name.ilike.%${name}%,company.ilike.%${name}%`
      )
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error || !data) {
      if (error) console.error('[CC-002] Error querying contacts:', error);
      return [];
    }

    return (data as ContactRow[]).map((row) => {
      const fullName = buildContactName(row);
      return {
        type: 'contact' as const,
        id: row.id,
        name: fullName,
        confidence: computeConfidence(name, fullName),
        subtitle: buildContactSubtitle(row),
      };
    });
  } catch (e) {
    console.error('[CC-002] Exception querying contacts:', e);
    return [];
  }
}

// ============================================================================
// Confidence Scoring
// ============================================================================

/**
 * Compute confidence score (0–1) based on how closely the query string
 * matches the entity name. Mirrors the logic in slackEntityResolver.ts.
 */
function computeConfidence(query: string, entityName: string): number {
  const queryLower = query.toLowerCase().trim();
  const entityLower = entityName.toLowerCase().trim();

  if (queryLower === entityLower) return 1.0;

  if (entityLower.startsWith(queryLower)) {
    const ratio = queryLower.length / entityLower.length;
    return 0.7 + ratio * 0.25;
  }

  if (entityLower.includes(queryLower)) {
    const ratio = queryLower.length / entityLower.length;
    return 0.5 + ratio * 0.3;
  }

  if (queryLower.includes(entityLower)) {
    return 0.6;
  }

  const queryWords = new Set(queryLower.split(/\s+/));
  const entityWords = entityLower.split(/\s+/);
  const matchingWords = entityWords.filter((w) => queryWords.has(w)).length;

  if (matchingWords > 0) {
    return 0.4 + (matchingWords / Math.max(entityWords.length, queryWords.size)) * 0.4;
  }

  return 0.3;
}

// ============================================================================
// Thread Context Disambiguation
// ============================================================================

/**
 * If threadContext has an active entity ID that matches one of the alternatives,
 * promote that alternative to the primary result with boosted confidence.
 */
function applyThreadContext(
  candidates: ResolvedEntity[],
  activeId: string | undefined
): ResolvedEntity[] {
  if (!activeId || candidates.length <= 1) return candidates;

  const activeIndex = candidates.findIndex((c) => c.id === activeId);
  if (activeIndex <= 0) return candidates; // not found or already first

  // Move the active match to the front with boosted confidence
  const promoted = { ...candidates[activeIndex], confidence: 0.95 };
  const rest = candidates.filter((_, i) => i !== activeIndex);
  return [promoted, ...rest];
}

// ============================================================================
// Single-entity resolution helper
// ============================================================================

interface EntityResolutionResult {
  entity?: ResolvedEntity;
  needsDisambiguation: boolean;
}

function resolveFromCandidates(
  candidates: ResolvedEntity[],
  activeId: string | undefined
): EntityResolutionResult {
  if (candidates.length === 0) {
    return { needsDisambiguation: false };
  }

  // Apply thread context to reorder candidates
  const ordered = applyThreadContext(candidates, activeId);
  const primary = ordered[0];

  if (ordered.length === 1) {
    // Single match — resolved with no alternatives
    return { entity: { ...primary, confidence: primary.confidence }, needsDisambiguation: false };
  }

  if (primary.confidence >= 0.9) {
    // High-confidence primary (exact match or thread-context promoted)
    const alternatives = ordered.slice(1);
    return {
      entity: { ...primary, alternatives },
      needsDisambiguation: false,
    };
  }

  // Multiple candidates without a clear winner — needs disambiguation
  const entity: ResolvedEntity = {
    ...primary,
    confidence: 0.5,
    alternatives: ordered.slice(1),
  };
  return { entity, needsDisambiguation: true };
}

// ============================================================================
// Disambiguation Block Kit UI
// ============================================================================

const NUMBERED_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

/**
 * Build Slack Block Kit disambiguation blocks for a single entity type
 * when multiple candidates are found.
 */
function buildDisambiguationBlocksForType(
  type: 'deal' | 'contact' | 'company' | 'meeting',
  candidates: ResolvedEntity[]
): unknown[] {
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const blocks: unknown[] = [];

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `I found multiple *${typeLabel}* matches. Which one did you mean?`,
    },
  });

  const buttons = candidates.slice(0, 5).map((candidate, index) => {
    const emoji = NUMBERED_EMOJI[index] ?? `${index + 1}.`;
    const label = truncateText(`${emoji} ${candidate.name}`, 75);
    return {
      type: 'button',
      text: {
        type: 'plain_text',
        text: label,
        emoji: true,
      },
      action_id: `disambiguate_entity_${type}_${candidate.id}`,
      value: JSON.stringify({
        entityId: candidate.id,
        entityType: type,
        entityName: candidate.name,
      }),
    };
  });

  blocks.push({
    type: 'actions',
    elements: buttons,
  });

  // Context subtitles
  const contextLines = candidates.slice(0, 5).map((c, index) => {
    const emoji = NUMBERED_EMOJI[index] ?? `${index + 1}.`;
    const subtitle = c.subtitle ? ` — ${truncateText(c.subtitle, 60)}` : '';
    return `${emoji} *${truncateText(c.name, 40)}*${subtitle}`;
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: contextLines.join('\n'),
      },
    ],
  });

  return blocks;
}

/**
 * Build full disambiguation blocks for all entity types that need it.
 */
function buildDisambiguationBlocks(
  resolved: ResolvedEntities,
  needsDisambiguationTypes: Array<'deal' | 'contact' | 'company' | 'meeting'>
): unknown[] {
  const blocks: unknown[] = [];

  for (const type of needsDisambiguationTypes) {
    const entity = resolved[type];
    if (!entity) continue;

    const candidates = [entity, ...(entity.alternatives ?? [])];
    const typeBlocks = buildDisambiguationBlocksForType(type, candidates);
    blocks.push(...typeBlocks);

    if (needsDisambiguationTypes.indexOf(type) < needsDisambiguationTypes.length - 1) {
      blocks.push({ type: 'divider' });
    }
  }

  return blocks;
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Resolve conversational entity references from extracted entity names.
 *
 * 1. Parses @entity:slug syntax from the raw message for direct resolution.
 * 2. For each entity name provided, queries the database with ILIKE matching.
 * 3. Applies thread-context disambiguation to prefer active entities.
 * 4. Returns Block Kit disambiguation UI when multiple matches are ambiguous.
 *
 * @param entities - Extracted entity names (from intent classifier)
 * @param userId - Current user ID (for owner_id filtering)
 * @param orgId - Organization ID (for scoping)
 * @param supabase - Supabase client (user-scoped, respects RLS)
 * @param threadContext - Active entity IDs from thread state for disambiguation
 * @param rawMessage - Optional raw message text to parse @entity:slug syntax
 */
export async function resolveConversationalEntities(
  entities: { dealName?: string; contactName?: string; companyName?: string },
  userId: string,
  orgId: string,
  supabase: SupabaseClient,
  threadContext?: ThreadEntityContext,
  rawMessage?: string
): Promise<DisambiguationResult> {
  const resolved: ResolvedEntities = {};
  const needsDisambiguationTypes: Array<'deal' | 'contact' | 'company' | 'meeting'> = [];

  // ── Step 1: Parse @entity:slug syntax from raw message ────────────────────
  const slugOverrides: Partial<Record<'deal' | 'contact' | 'company', ResolvedEntity>> = {};

  if (rawMessage) {
    const slugMentions = parseSlugMentions(rawMessage);

    if (slugMentions.length > 0) {
      console.log('[CC-002] Resolving slug mentions:', slugMentions.map((m) => `@${m.type}:${m.slug}`));

      const slugResolutions = await Promise.all(
        slugMentions.map(async (mention) => {
          if (mention.type === 'deal') {
            const entity = await resolveDealBySlug(supabase, mention.slug, userId, orgId);
            return { type: mention.type, entity };
          }
          if (mention.type === 'contact') {
            const entity = await resolveContactBySlug(supabase, mention.slug, userId, orgId);
            return { type: mention.type, entity };
          }
          return { type: mention.type, entity: null };
        })
      );

      for (const { type, entity } of slugResolutions) {
        if (entity) {
          slugOverrides[type as 'deal' | 'contact' | 'company'] = entity;
        }
      }
    }
  }

  // ── Step 2: Resolve each entity type ─────────────────────────────────────

  // Deal resolution
  if (slugOverrides.deal) {
    resolved.deal = slugOverrides.deal;
  } else if (entities.dealName) {
    const candidates = await queryDeals(supabase, entities.dealName, userId, orgId);
    const { entity, needsDisambiguation } = resolveFromCandidates(
      candidates,
      threadContext?.active_deal_id
    );
    if (entity) {
      resolved.deal = entity;
      if (needsDisambiguation) {
        needsDisambiguationTypes.push('deal');
      }
    }
  } else if (threadContext?.active_deal_id) {
    // No name provided but thread has an active deal — fetch it directly
    const { data, error } = await supabase
      .from('deals')
      .select('id, title, stage, value, close_date')
      .eq('id', threadContext.active_deal_id)
      .eq('owner_id', userId)
      .maybeSingle();

    if (!error && data) {
      const row = data as DealRow;
      resolved.deal = {
        type: 'deal',
        id: row.id,
        name: row.title,
        confidence: 0.95,
        subtitle: buildDealSubtitle(row),
      };
    }
  }

  // Contact resolution
  if (slugOverrides.contact) {
    resolved.contact = slugOverrides.contact;
  } else if (entities.contactName) {
    const candidates = await queryContacts(supabase, entities.contactName, userId, orgId);
    const { entity, needsDisambiguation } = resolveFromCandidates(
      candidates,
      threadContext?.active_contact_id
    );
    if (entity) {
      resolved.contact = entity;
      if (needsDisambiguation) {
        needsDisambiguationTypes.push('contact');
      }
    }
  } else if (threadContext?.active_contact_id) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company, title')
      .eq('id', threadContext.active_contact_id)
      .eq('owner_id', userId)
      .maybeSingle();

    if (!error && data) {
      const row = data as ContactRow;
      resolved.contact = {
        type: 'contact',
        id: row.id,
        name: buildContactName(row),
        confidence: 0.95,
        subtitle: buildContactSubtitle(row),
      };
    }
  }

  // ── Step 3: Build result ──────────────────────────────────────────────────

  const needsDisambiguation = needsDisambiguationTypes.length > 0;

  const disambiguationBlocks = needsDisambiguation
    ? buildDisambiguationBlocks(resolved, needsDisambiguationTypes)
    : undefined;

  console.log('[CC-002] Resolution complete:', {
    deal: resolved.deal ? `${resolved.deal.name} (${resolved.deal.confidence.toFixed(2)})` : null,
    contact: resolved.contact ? `${resolved.contact.name} (${resolved.contact.confidence.toFixed(2)})` : null,
    company: resolved.company ? `${resolved.company.name} (${resolved.company.confidence.toFixed(2)})` : null,
    needsDisambiguation,
  });

  return {
    resolved,
    needsDisambiguation,
    ...(disambiguationBlocks ? { disambiguationBlocks } : {}),
  };
}

// ============================================================================
// Subtitle Builders
// ============================================================================

function buildDealSubtitle(row: DealRow): string {
  const parts: string[] = [];
  if (row.stage) parts.push(row.stage);
  if (row.value != null) parts.push(`$${Number(row.value).toLocaleString()}`);
  if (row.close_date) {
    const date = new Date(row.close_date);
    parts.push(`closes ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
  }
  return parts.join(' | ') || 'Deal';
}

function buildContactName(row: ContactRow): string {
  const parts = [row.first_name, row.last_name].filter(Boolean);
  return parts.join(' ') || row.email || 'Unknown Contact';
}

function buildContactSubtitle(row: ContactRow): string {
  const parts: string[] = [];
  if (row.title) parts.push(row.title);
  if (row.company) parts.push(`at ${row.company}`);
  if (!parts.length && row.email) parts.push(row.email);
  return parts.join(' ') || 'Contact';
}

// ============================================================================
// Helpers
// ============================================================================

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '\u2026';
}
