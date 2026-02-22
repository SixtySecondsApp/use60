/**
 * POL-003: Slack @Mention Resolution — Fuzzy Entity Matching
 *
 * Resolves entity names from plain-text Slack messages (where we don't have
 * our @mention chips). Searches contacts, companies, and deals using
 * case-insensitive ILIKE matching, then returns resolved/ambiguous results
 * with Slack Block Kit disambiguation UI.
 *
 * Pure functions + DB queries — no side effects.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { SlackBlock } from './slackBlocks.ts';

// ============================================================================
// Types
// ============================================================================

export interface SlackResolvedEntity {
  id: string;
  type: 'contact' | 'company' | 'deal';
  name: string;
  matchedText: string;
  confidence: number;
}

export interface SlackAmbiguousEntity {
  matchedText: string;
  candidates: Array<{
    id: string;
    type: 'contact' | 'company' | 'deal';
    name: string;
    subtitle: string;
  }>;
}

export interface ResolveSlackEntitiesResult {
  resolvedEntities: SlackResolvedEntity[];
  ambiguous: SlackAmbiguousEntity[];
  cleanedText: string;
}

interface ExtractedMention {
  text: string;
  originalMatch: string;
  startIndex: number;
  endIndex: number;
}

interface DbCandidate {
  id: string;
  type: 'contact' | 'company' | 'deal';
  name: string;
  subtitle: string;
}

// ============================================================================
// Name Extraction Patterns
// ============================================================================

/**
 * Patterns that indicate an entity name follows. Each regex should have
 * a capture group for the entity name portion.
 *
 * Order matters — more specific patterns are checked first.
 */
const MENTION_PATTERNS: RegExp[] = [
  // Explicit @mention: "@Sarah Jones" or "@Acme"
  /@([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})/g,

  // Preposition-based: "about Sarah Jones", "for Acme Corp", "with John"
  /\b(?:about|for|with|from|regarding|re|on)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})/g,

  // Possessive: "Sarah's deal", "Acme's pipeline"
  /\b([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})'s\b/g,

  // "the [Name] deal/account/contact/opportunity"
  /\bthe\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})\s+(?:deal|account|contact|opportunity|company|project)/gi,
];

/**
 * Common words that look like capitalized names but are not entity references.
 * Kept lowercase for comparison.
 */
const STOP_WORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'the', 'this', 'that',
  'what', 'when', 'where', 'how', 'who', 'which', 'why',
  'can', 'could', 'would', 'should', 'will', 'may', 'might',
  'do', 'does', 'did', 'is', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'get', 'got', 'let', 'make',
  'all', 'any', 'some', 'no', 'not', 'but', 'and', 'or', 'if', 'so',
  'just', 'also', 'very', 'too', 'really', 'about', 'after', 'before',
  'today', 'tomorrow', 'yesterday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  'please', 'thanks', 'thank', 'hey', 'hi', 'hello',
  'update', 'check', 'send', 'draft', 'create', 'find', 'show',
  'prep', 'meeting', 'email', 'task', 'note', 'call', 'slack',
  'deal', 'pipeline', 'contact', 'company', 'account', 'opportunity',
]);

// ============================================================================
// Name Extraction
// ============================================================================

/**
 * Extract potential entity names from message text using regex patterns.
 * Returns deduplicated mentions ordered by position in text.
 */
function extractPotentialMentions(text: string): ExtractedMention[] {
  const mentions: ExtractedMention[] = [];
  const seenTexts = new Set<string>();

  for (const pattern of MENTION_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const captured = match[1]?.trim();
      if (!captured) continue;

      // Skip single-word matches that are stop words
      const lowerCaptured = captured.toLowerCase();
      if (STOP_WORDS.has(lowerCaptured)) continue;

      // Skip if every word in the match is a stop word
      const words = captured.split(/\s+/);
      if (words.every(w => STOP_WORDS.has(w.toLowerCase()))) continue;

      // Deduplicate by normalized text
      const normalized = lowerCaptured;
      if (seenTexts.has(normalized)) continue;
      seenTexts.add(normalized);

      const fullMatch = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;

      mentions.push({
        text: captured,
        originalMatch: fullMatch,
        startIndex,
        endIndex,
      });
    }
  }

  // Sort by position in text
  mentions.sort((a, b) => a.startIndex - b.startIndex);

  return mentions;
}

// ============================================================================
// Database Search
// ============================================================================

/**
 * Search contacts table for name matches within an organization.
 */
async function searchContacts(
  supabase: SupabaseClient,
  name: string,
  orgId: string
): Promise<DbCandidate[]> {
  const nameParts = name.split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

  try {
    let query = supabase
      .from('contacts')
      .select(`
        id,
        first_name,
        last_name,
        email,
        title,
        company_id,
        companies:company_id (name)
      `)
      .eq('org_id', orgId)
      .ilike('first_name', `%${firstName}%`)
      .limit(10);

    if (lastName) {
      query = query.ilike('last_name', `%${lastName}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((c) => {
      const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
      const companyName = (c.companies as { name?: string } | null)?.name;
      const titleStr = c.title as string | null;
      const parts: string[] = [];
      if (titleStr) parts.push(titleStr);
      if (companyName) parts.push(`at ${companyName}`);
      if (!parts.length && c.email) parts.push(c.email as string);

      return {
        id: c.id as string,
        type: 'contact' as const,
        name: fullName || (c.email as string) || 'Unknown',
        subtitle: parts.join(' ') || 'Contact',
      };
    });
  } catch (e) {
    console.error('[SLACK_ENTITY] Error searching contacts:', e);
    return [];
  }
}

/**
 * Search companies table for name matches within an organization.
 */
async function searchCompanies(
  supabase: SupabaseClient,
  name: string,
  orgId: string
): Promise<DbCandidate[]> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, industry, website')
      .eq('org_id', orgId)
      .ilike('name', `%${name}%`)
      .limit(10);

    if (error || !data) return [];

    return data.map((c) => {
      const parts: string[] = [];
      if (c.industry) parts.push(c.industry as string);
      if (c.website) parts.push(c.website as string);

      return {
        id: c.id as string,
        type: 'company' as const,
        name: c.name as string,
        subtitle: parts.join(' | ') || 'Company',
      };
    });
  } catch (e) {
    console.error('[SLACK_ENTITY] Error searching companies:', e);
    return [];
  }
}

/**
 * Search deals table for name matches within an organization.
 */
async function searchDeals(
  supabase: SupabaseClient,
  name: string,
  orgId: string
): Promise<DbCandidate[]> {
  try {
    const { data, error } = await supabase
      .from('deals')
      .select('id, name, stage, amount, company_id, companies:company_id (name)')
      .eq('org_id', orgId)
      .ilike('name', `%${name}%`)
      .limit(10);

    if (error || !data) return [];

    return data.map((d) => {
      const companyName = (d.companies as { name?: string } | null)?.name;
      const parts: string[] = [];
      if (d.stage) parts.push(d.stage as string);
      if (d.amount) parts.push(`$${Number(d.amount).toLocaleString()}`);
      if (companyName) parts.push(companyName);

      return {
        id: d.id as string,
        type: 'deal' as const,
        name: d.name as string,
        subtitle: parts.join(' | ') || 'Deal',
      };
    });
  } catch (e) {
    console.error('[SLACK_ENTITY] Error searching deals:', e);
    return [];
  }
}

// ============================================================================
// Main Resolver
// ============================================================================

/**
 * Resolve entity names from plain-text Slack messages.
 *
 * Extracts potential entity names using regex patterns, searches contacts,
 * companies, and deals tables, then classifies each mention as resolved
 * (exactly one match), ambiguous (multiple matches), or unresolved (no match).
 *
 * @param supabase - Supabase client (user-scoped, respects RLS)
 * @param text - Raw message text from Slack
 * @param orgId - Organization ID for scoping queries
 * @returns Resolved entities, ambiguous entities needing disambiguation, and cleaned text
 */
export async function resolveSlackEntities(
  supabase: SupabaseClient,
  text: string,
  orgId: string
): Promise<ResolveSlackEntitiesResult> {
  const resolvedEntities: SlackResolvedEntity[] = [];
  const ambiguous: SlackAmbiguousEntity[] = [];
  let cleanedText = text;

  // Step 1: Extract potential entity names
  const mentions = extractPotentialMentions(text);

  if (mentions.length === 0) {
    return { resolvedEntities, ambiguous, cleanedText };
  }

  console.log('[SLACK_ENTITY] Extracted mentions:', mentions.map(m => m.text));

  // Step 2: Search DB for each mention in parallel
  const searchResults = await Promise.all(
    mentions.map(async (mention) => {
      const [contacts, companies, deals] = await Promise.all([
        searchContacts(supabase, mention.text, orgId),
        searchCompanies(supabase, mention.text, orgId),
        searchDeals(supabase, mention.text, orgId),
      ]);

      const allCandidates = [...contacts, ...companies, ...deals];
      return { mention, candidates: allCandidates };
    })
  );

  // Step 3: Classify each mention
  // Process in reverse order so string replacements don't shift indices
  const sortedResults = [...searchResults].sort(
    (a, b) => b.mention.startIndex - a.mention.startIndex
  );

  for (const { mention, candidates } of sortedResults) {
    if (candidates.length === 0) {
      // No match — leave as plain text
      continue;
    }

    if (candidates.length === 1) {
      // Exactly one match — resolved
      const candidate = candidates[0];
      const confidence = computeConfidence(mention.text, candidate.name);

      resolvedEntities.push({
        id: candidate.id,
        type: candidate.type,
        name: candidate.name,
        matchedText: mention.text,
        confidence,
      });

      // Mark in cleaned text: replace the mention with [Type: Name]
      cleanedText = replaceInText(
        cleanedText,
        mention.originalMatch,
        formatResolvedTag(candidate.type, candidate.name, mention.originalMatch)
      );
    } else {
      // Multiple matches — ambiguous
      ambiguous.push({
        matchedText: mention.text,
        candidates: candidates.slice(0, 5).map(c => ({
          id: c.id,
          type: c.type,
          name: c.name,
          subtitle: c.subtitle,
        })),
      });
    }
  }

  // Sort resolved entities back to text order
  resolvedEntities.reverse();

  return { resolvedEntities, ambiguous, cleanedText };
}

// ============================================================================
// Disambiguation Block Kit
// ============================================================================

/**
 * Generate Slack Block Kit blocks for entity disambiguation.
 *
 * Produces a "Did you mean..." prompt with action buttons for each
 * candidate, allowing the user to select the correct entity.
 *
 * @param ambiguous - Array of ambiguous entities with their candidates
 * @returns Slack Block Kit blocks ready for inclusion in a message
 */
export function formatDisambiguationBlocks(ambiguous: SlackAmbiguousEntity[]): SlackBlock[] {
  if (ambiguous.length === 0) return [];

  const blocks: SlackBlock[] = [];

  for (const entity of ambiguous) {
    // Header section
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `I found multiple matches for *"${truncate(entity.matchedText, 50)}"*. Did you mean:`,
      },
    });

    // Candidate buttons — grouped in actions blocks (max 5 buttons per block)
    const actionElements = entity.candidates.slice(0, 5).map((candidate) => ({
      type: 'button',
      text: {
        type: 'plain_text',
        text: truncate(`${candidate.name}`, 75),
        emoji: false,
      },
      action_id: `entity_select_${candidate.type}_${candidate.id}`,
      value: JSON.stringify({
        entityId: candidate.id,
        entityType: candidate.type,
        entityName: candidate.name,
        matchedText: entity.matchedText,
      }),
    }));

    blocks.push({
      type: 'actions',
      elements: actionElements,
    });

    // Context line with subtitles for clarity
    const contextLines = entity.candidates.slice(0, 5).map((c) => {
      const typeLabel = c.type.charAt(0).toUpperCase() + c.type.slice(1);
      return `${typeLabel}: *${truncate(c.name, 40)}* — ${truncate(c.subtitle, 60)}`;
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

    blocks.push({ type: 'divider' });
  }

  // Remove trailing divider
  if (blocks.length > 0 && blocks[blocks.length - 1].type === 'divider') {
    blocks.pop();
  }

  return blocks;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute a confidence score (0-1) based on how closely the mention
 * text matches the resolved entity name.
 */
function computeConfidence(mentionText: string, entityName: string): number {
  const mentionLower = mentionText.toLowerCase().trim();
  const entityLower = entityName.toLowerCase().trim();

  // Exact match
  if (mentionLower === entityLower) return 1.0;

  // Entity name starts with the mention (e.g., "Sarah" -> "Sarah Jones")
  if (entityLower.startsWith(mentionLower)) {
    // Longer matches get higher confidence
    const ratio = mentionLower.length / entityLower.length;
    return 0.7 + (ratio * 0.25);
  }

  // Entity name contains the mention
  if (entityLower.includes(mentionLower)) {
    const ratio = mentionLower.length / entityLower.length;
    return 0.5 + (ratio * 0.3);
  }

  // Mention contains the entity name (rare but possible for short entity names)
  if (mentionLower.includes(entityLower)) {
    return 0.6;
  }

  // Partial word overlap
  const mentionWords = new Set(mentionLower.split(/\s+/));
  const entityWords = entityLower.split(/\s+/);
  const matchingWords = entityWords.filter(w => mentionWords.has(w)).length;

  if (matchingWords > 0) {
    return 0.4 + (matchingWords / Math.max(entityWords.length, mentionWords.size)) * 0.4;
  }

  return 0.3;
}

/**
 * Replace the first occurrence of a substring in text.
 */
function replaceInText(text: string, search: string, replacement: string): string {
  const index = text.indexOf(search);
  if (index === -1) return text;
  return text.slice(0, index) + replacement + text.slice(index + search.length);
}

/**
 * Format a resolved entity tag for the cleaned text.
 * Preserves the preposition context (e.g., "about" or "for") when present.
 */
function formatResolvedTag(
  type: 'contact' | 'company' | 'deal',
  name: string,
  originalMatch: string
): string {
  // Check if the original match starts with a preposition
  const prepMatch = originalMatch.match(/^(about|for|with|from|regarding|re|on)\s+/i);
  const prefix = prepMatch ? `${prepMatch[1]} ` : '';
  const atPrefix = originalMatch.startsWith('@') ? '' : '';

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  return `${prefix}${atPrefix}[${typeLabel}: ${name}]`;
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 * Used for Slack Block Kit field limits.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '\u2026';
}
