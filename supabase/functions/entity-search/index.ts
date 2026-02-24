// supabase/functions/entity-search/index.ts
// Unified entity search for @ mentions — searches contacts, companies, and deals
// with fuzzy matching and recency-weighted ranking.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

interface SearchRequest {
  query: string;
  types?: ('contact' | 'company' | 'deal')[];
  limit?: number;
  org_id?: string;
}

interface SearchResult {
  id: string;
  type: 'contact' | 'company' | 'deal';
  name: string;
  subtitle: string;
  avatar_url?: string;
  metadata: Record<string, unknown>;
  relevance_score: number;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // Auth — create user-scoped client
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    const body: SearchRequest = await req.json();
    const { query, types, limit = 8 } = body;

    if (!query || query.trim().length === 0) {
      return jsonResponse({ results: [] }, req);
    }

    const searchTerm = query.trim();
    const searchTypes = types || ['contact', 'company', 'deal'];
    const now = Date.now();

    // Run searches in parallel
    const searches: Promise<SearchResult[]>[] = [];

    if (searchTypes.includes('contact')) {
      searches.push(searchContacts(supabase, searchTerm, now));
    }
    if (searchTypes.includes('company')) {
      searches.push(searchCompanies(supabase, searchTerm, now));
    }
    if (searchTypes.includes('deal')) {
      searches.push(searchDeals(supabase, searchTerm, now));
    }

    const resultSets = await Promise.all(searches);
    const allResults = resultSets.flat();

    // Sort by relevance score (descending) and limit
    allResults.sort((a, b) => b.relevance_score - a.relevance_score);
    const results = allResults.slice(0, limit);

    return jsonResponse({ results }, req);
  } catch (err) {
    console.error('[entity-search] Error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', req, 500);
  }
});

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

async function searchContacts(
  supabase: ReturnType<typeof createClient>,
  query: string,
  now: number,
): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, title, company_id, last_interaction_at, created_at')
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
    .order('last_interaction_at', { ascending: false, nullsFirst: false })
    .limit(10);

  if (error || !data) return [];

  // Fetch company names for contacts that have company_id
  const companyIds = [...new Set(data.filter((c: any) => c.company_id).map((c: any) => c.company_id))];
  let companyMap: Record<string, string> = {};
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', companyIds);
    if (companies) {
      companyMap = Object.fromEntries(companies.map((c: any) => [c.id, c.name]));
    }
  }

  return data.map((c: any) => {
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email;
    const companyName = c.company_id ? companyMap[c.company_id] : undefined;
    const subtitle = [c.title, companyName].filter(Boolean).join(' at ') || c.email;

    const nameScore = calculateNameScore(fullName, query) + calculateNameScore(c.email || '', query);
    const recencyScore = calculateRecencyScore(c.last_interaction_at || c.created_at, now);

    return {
      id: c.id,
      type: 'contact' as const,
      name: fullName,
      subtitle,
      metadata: {
        email: c.email,
        title: c.title,
        company_name: companyName,
        company_id: c.company_id,
      },
      relevance_score: nameScore * 0.4 + recencyScore * 0.3 + 0.15, // base frequency placeholder
    };
  });
}

async function searchCompanies(
  supabase: ReturnType<typeof createClient>,
  query: string,
  now: number,
): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, domain, industry, size, updated_at, created_at')
    .or(`name.ilike.%${query}%,domain.ilike.%${query}%`)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(10);

  if (error || !data) return [];

  return data.map((c: any) => {
    const subtitle = [c.industry, c.size].filter(Boolean).join(' · ') || c.domain || '';
    const nameScore = calculateNameScore(c.name, query) + calculateNameScore(c.domain || '', query);
    const recencyScore = calculateRecencyScore(c.updated_at || c.created_at, now);

    return {
      id: c.id,
      type: 'company' as const,
      name: c.name,
      subtitle,
      metadata: {
        domain: c.domain,
        industry: c.industry,
        size: c.size,
      },
      relevance_score: nameScore * 0.4 + recencyScore * 0.3 + 0.1,
    };
  });
}

async function searchDeals(
  supabase: ReturnType<typeof createClient>,
  query: string,
  now: number,
): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('id, name, value, company, status, expected_close_date, updated_at, created_at, stage_id')
    .ilike('name', `%${query}%`)
    .eq('status', 'active')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(10);

  if (error || !data) return [];

  return data.map((d: any) => {
    const valueStr = d.value ? `£${Number(d.value).toLocaleString()}` : '';
    const subtitle = [d.company, valueStr].filter(Boolean).join(' · ') || 'Deal';
    const nameScore = calculateNameScore(d.name, query);
    const recencyScore = calculateRecencyScore(d.updated_at || d.created_at, now);
    const valueScore = d.value ? Math.min(Number(d.value) / 100000, 1) : 0; // normalize to 0-1

    return {
      id: d.id,
      type: 'deal' as const,
      name: d.name,
      subtitle,
      metadata: {
        value: d.value,
        company: d.company,
        status: d.status,
        expected_close_date: d.expected_close_date,
        stage_id: d.stage_id,
      },
      relevance_score: nameScore * 0.4 + recencyScore * 0.3 + valueScore * 0.1 + 0.05,
    };
  });
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function calculateNameScore(name: string, query: string): number {
  if (!name) return 0;
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact match
  if (lowerName === lowerQuery) return 1.0;
  // Starts with
  if (lowerName.startsWith(lowerQuery)) return 0.9;
  // Word starts with
  const words = lowerName.split(/[\s@._-]+/);
  if (words.some(w => w.startsWith(lowerQuery))) return 0.7;
  // Contains
  if (lowerName.includes(lowerQuery)) return 0.5;

  return 0.1;
}

function calculateRecencyScore(dateStr: string | null, now: number): number {
  if (!dateStr) return 0;
  const date = new Date(dateStr).getTime();
  const daysSince = (now - date) / (1000 * 60 * 60 * 24);

  if (daysSince <= 1) return 1.0;
  if (daysSince <= 7) return 0.8;
  if (daysSince <= 30) return 0.5;
  if (daysSince <= 90) return 0.3;
  return 0.1;
}
