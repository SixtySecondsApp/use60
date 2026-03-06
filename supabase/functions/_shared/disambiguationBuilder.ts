/**
 * Disambiguation Builder
 *
 * Builds structured disambiguation prompts for multiple entity types
 * (contacts, companies, deals). Returns compact choice cards with
 * enough metadata to avoid wrong-entity writes.
 *
 * Supports single-select and multi-select modes.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export type DisambiguationEntityType = 'contact' | 'company' | 'deal';
export type SelectionMode = 'single' | 'multi';

export interface DisambiguationCandidate {
  id: string;
  entityType: DisambiguationEntityType;
  name: string;
  subtitle?: string; // e.g., title, industry, stage
  metadata: Record<string, string | number | boolean | null>;
  confidenceScore: number;
  matchReason: string; // Why this candidate matched
}

export interface DisambiguationPrompt {
  entityType: DisambiguationEntityType;
  query: string; // Original search term
  selectionMode: SelectionMode;
  candidates: DisambiguationCandidate[];
  message: string;
  workflowId?: string; // For scoped persistence
}

// =============================================================================
// Builders
// =============================================================================

/**
 * Search for contacts by name and build disambiguation if multiple matches.
 */
export async function disambiguateContacts(
  client: SupabaseClient,
  query: string,
  orgId: string,
  opts?: { selectionMode?: SelectionMode; limit?: number; workflowId?: string },
): Promise<DisambiguationPrompt | { resolved: DisambiguationCandidate }> {
  const limit = opts?.limit || 5;

  const { data: contacts } = await client
    .from('contacts')
    .select('id, first_name, last_name, full_name, email, title, company_id')
    .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,first_name.ilike.%${query}%`)
    .limit(limit);

  if (!contacts || contacts.length === 0) {
    return buildPrompt('contact', query, [], opts);
  }

  // Enrich with company names
  const companyIds = [...new Set(contacts.map((c: any) => c.company_id).filter(Boolean))];
  let companyMap: Record<string, string> = {};
  if (companyIds.length > 0) {
    const { data: companies } = await client
      .from('companies')
      .select('id, name')
      .in('id', companyIds);
    if (companies) {
      companyMap = Object.fromEntries(companies.map((c: any) => [c.id, c.name]));
    }
  }

  const candidates: DisambiguationCandidate[] = contacts.map((c: any) => ({
    id: c.id,
    entityType: 'contact' as const,
    name: c.full_name || `${c.first_name} ${c.last_name}`.trim(),
    subtitle: [c.title, companyMap[c.company_id]].filter(Boolean).join(' at '),
    metadata: {
      email: c.email,
      title: c.title,
      company: companyMap[c.company_id] || null,
    },
    confidenceScore: computeNameScore(query, c.full_name || `${c.first_name} ${c.last_name}`),
    matchReason: c.email?.toLowerCase().includes(query.toLowerCase())
      ? 'Email match'
      : 'Name match',
  }));

  if (candidates.length === 1) {
    return { resolved: candidates[0] };
  }

  // Check for high-confidence single match
  const sorted = candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
  if (sorted[0].confidenceScore > 90 && sorted[0].confidenceScore - (sorted[1]?.confidenceScore || 0) > 20) {
    return { resolved: sorted[0] };
  }

  return buildPrompt('contact', query, sorted, opts);
}

/**
 * Search for companies by name/domain and build disambiguation if multiple matches.
 */
export async function disambiguateCompanies(
  client: SupabaseClient,
  query: string,
  orgId: string,
  opts?: { selectionMode?: SelectionMode; limit?: number; workflowId?: string },
): Promise<DisambiguationPrompt | { resolved: DisambiguationCandidate }> {
  const limit = opts?.limit || 5;

  const { data: companies } = await client
    .from('companies')
    .select('id, name, domain, industry')
    .or(`name.ilike.%${query}%,domain.ilike.%${query}%`)
    .limit(limit);

  if (!companies || companies.length === 0) {
    return buildPrompt('company', query, [], opts);
  }

  const candidates: DisambiguationCandidate[] = companies.map((c: any) => ({
    id: c.id,
    entityType: 'company' as const,
    name: c.name,
    subtitle: [c.industry, c.domain].filter(Boolean).join(' | '),
    metadata: {
      domain: c.domain,
      industry: c.industry,
    },
    confidenceScore: computeNameScore(query, c.name),
    matchReason: c.domain?.toLowerCase().includes(query.toLowerCase())
      ? 'Domain match'
      : 'Name match',
  }));

  if (candidates.length === 1) {
    return { resolved: candidates[0] };
  }

  const sorted = candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
  if (sorted[0].confidenceScore > 90 && sorted[0].confidenceScore - (sorted[1]?.confidenceScore || 0) > 20) {
    return { resolved: sorted[0] };
  }

  return buildPrompt('company', query, sorted, opts);
}

/**
 * Search for deals by name and build disambiguation if multiple matches.
 */
export async function disambiguateDeals(
  client: SupabaseClient,
  query: string,
  orgId: string,
  opts?: { selectionMode?: SelectionMode; limit?: number; workflowId?: string },
): Promise<DisambiguationPrompt | { resolved: DisambiguationCandidate }> {
  const limit = opts?.limit || 5;

  const { data: deals } = await client
    .from('deals')
    .select('id, title, stage, value, close_date, status')
    .ilike('title', `%${query}%`)
    .limit(limit);

  if (!deals || deals.length === 0) {
    return buildPrompt('deal', query, [], opts);
  }

  const candidates: DisambiguationCandidate[] = deals.map((d: any) => ({
    id: d.id,
    entityType: 'deal' as const,
    name: d.title,
    subtitle: [d.stage, d.value ? `$${Number(d.value).toLocaleString()}` : null].filter(Boolean).join(' | '),
    metadata: {
      stage: d.stage,
      value: d.value,
      close_date: d.close_date,
      status: d.status,
    },
    confidenceScore: computeNameScore(query, d.title),
    matchReason: 'Title match',
  }));

  if (candidates.length === 1) {
    return { resolved: candidates[0] };
  }

  const sorted = candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
  if (sorted[0].confidenceScore > 90 && sorted[0].confidenceScore - (sorted[1]?.confidenceScore || 0) > 20) {
    return { resolved: sorted[0] };
  }

  return buildPrompt('deal', query, sorted, opts);
}

// =============================================================================
// Helpers
// =============================================================================

function buildPrompt(
  entityType: DisambiguationEntityType,
  query: string,
  candidates: DisambiguationCandidate[],
  opts?: { selectionMode?: SelectionMode; workflowId?: string },
): DisambiguationPrompt {
  const entityLabel = entityType === 'contact' ? 'people' : entityType === 'company' ? 'companies' : 'deals';

  return {
    entityType,
    query,
    selectionMode: opts?.selectionMode || 'single',
    candidates,
    message: candidates.length === 0
      ? `No ${entityLabel} found matching "${query}".`
      : `Found ${candidates.length} ${entityLabel} matching "${query}". Which one did you mean?`,
    workflowId: opts?.workflowId,
  };
}

function computeNameScore(query: string, name: string): number {
  if (!name) return 0;
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();

  // Exact match
  if (q === n) return 100;

  // Starts with
  if (n.startsWith(q)) return 85;

  // Contains as whole word
  const wordBoundary = new RegExp(`\\b${escapeRegex(q)}\\b`, 'i');
  if (wordBoundary.test(n)) return 75;

  // Contains substring
  if (n.includes(q)) return 60;

  // Partial word match
  const queryWords = q.split(/\s+/);
  const nameWords = n.split(/\s+/);
  const matchedWords = queryWords.filter((qw) =>
    nameWords.some((nw) => nw.includes(qw) || qw.includes(nw))
  );
  return Math.round((matchedWords.length / queryWords.length) * 50);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
