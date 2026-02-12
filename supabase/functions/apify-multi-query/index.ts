import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

// ---------------------------------------------------------------------------
// Types (imported from frontend)
// ---------------------------------------------------------------------------

type EntityType = 'companies' | 'people';
type SourcePreference = 'linkedin' | 'maps' | 'serp' | 'apollo' | 'ai_ark';
type FilterOperator = 'equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'not_in';

interface ParsedFilter {
  field: string;
  value: string | number | string[] | number[];
  operator?: FilterOperator;
}

interface QueryParseResult {
  entity_type: EntityType;
  count: number;
  location?: string;
  keywords?: string[];
  filters?: ParsedFilter[];
  source_preference?: SourcePreference;
  confidence: number;
  original_query?: string;
  suggested_actor_id?: string;
}

interface ProviderRanking {
  provider: SourcePreference;
  rank: number;
  available: boolean;
  reason: string;
}

interface MultiQueryRequest {
  parsedQuery: QueryParseResult;
  tableId?: string;
  selectedSources?: SourcePreference[];
  depth?: 'low' | 'medium' | 'high';
}

interface NormalizedResult {
  name?: string;
  company?: string;
  title?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  website?: string;
  industry?: string;
  employee_count?: number;
  description?: string;
  source_provider: string;
  source_url?: string;
  raw_data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_RUNS = 5;
const ACTOR_TIMEOUT_SECONDS = 60;

// ---------------------------------------------------------------------------
// Source Preference Resolution
// ---------------------------------------------------------------------------

/**
 * Maps integration_credentials.provider to SourcePreference
 */
function mapIntegrationToProviders(integrationTypes: string[]): Set<SourcePreference> {
  const providers = new Set<SourcePreference>();

  for (const type of integrationTypes) {
    switch (type) {
      case 'apollo':
        providers.add('apollo');
        break;
      case 'apify':
        providers.add('linkedin');
        providers.add('maps');
        providers.add('serp');
        break;
      case 'ai_ark':
        providers.add('ai_ark');
        break;
    }
  }

  return providers;
}

/**
 * Detect query type from entity type
 */
function detectQueryType(entityType: EntityType): 'company' | 'person' | 'location' {
  return entityType === 'people' ? 'person' : 'company';
}

/**
 * Resolve source preferences into ranked list
 */
async function resolveSourcePreferences(
  userPreference: SourcePreference | undefined,
  queryType: 'company' | 'person' | 'location',
  organizationId: string,
  supabase: ReturnType<typeof createClient>
): Promise<ProviderRanking[]> {
  // Check which integrations are available
  const { data: credentials } = await supabase
    .from('integration_credentials')
    .select('provider')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .in('provider', ['apollo', 'apify', 'ai_ark']);

  const integrationTypes = credentials?.map((c) => c.provider) || [];
  const availableProviders = mapIntegrationToProviders(integrationTypes);

  // Build rankings based on query type
  const rankings: ProviderRanking[] = [];

  if (queryType === 'person') {
    rankings.push(
      { provider: 'linkedin', rank: 1, available: availableProviders.has('linkedin'), reason: 'Best for people data' },
      { provider: 'apollo', rank: 2, available: availableProviders.has('apollo'), reason: 'Good for B2B contacts' },
      { provider: 'ai_ark', rank: 3, available: availableProviders.has('ai_ark'), reason: 'General people search' },
      { provider: 'serp', rank: 4, available: availableProviders.has('serp'), reason: 'Web fallback' }
    );
  } else if (queryType === 'location') {
    rankings.push(
      { provider: 'maps', rank: 1, available: availableProviders.has('maps'), reason: 'Best for location-based' },
      { provider: 'serp', rank: 2, available: availableProviders.has('serp'), reason: 'Local search' },
      { provider: 'apollo', rank: 3, available: availableProviders.has('apollo'), reason: 'Company locations' }
    );
  } else {
    // Company searches: AI Ark has actual company search, Maps for local businesses
    // Apollo's mixed_people/api_search is people-focused — deprioritize for company queries
    rankings.push(
      { provider: 'ai_ark', rank: 1, available: availableProviders.has('ai_ark'), reason: 'Best for company search' },
      { provider: 'maps', rank: 2, available: availableProviders.has('maps'), reason: 'Local business search' },
      { provider: 'apollo', rank: 3, available: availableProviders.has('apollo'), reason: 'People at matching companies' },
      { provider: 'serp', rank: 4, available: availableProviders.has('serp'), reason: 'Web fallback' }
    );
  }

  // Boost user preference to rank 0
  if (userPreference) {
    const preferredIndex = rankings.findIndex((r) => r.provider === userPreference);
    if (preferredIndex > -1) {
      const [preferred] = rankings.splice(preferredIndex, 1);
      preferred.rank = 0;
      preferred.reason = 'User preference';
      rankings.unshift(preferred);

      rankings.forEach((r, i) => {
        if (i > 0) r.rank = i;
      });
    }
  }

  return rankings.filter((r) => r.available).sort((a, b) => a.rank - b.rank);
}

/**
 * Get top N available providers
 */
function getTopProviders(rankings: ProviderRanking[], count: number = 1): SourcePreference[] {
  return rankings
    .filter((r) => r.available)
    .slice(0, count)
    .map((r) => r.provider);
}

// ---------------------------------------------------------------------------
// Query Builders
// ---------------------------------------------------------------------------

function buildLinkedInQuery(parsed: QueryParseResult): Record<string, unknown> {
  const keywords = [
    ...(parsed.keywords || []),
    parsed.entity_type,
    parsed.location || '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    searchQuery: keywords,
    maxResults: parsed.count,
  };
}

function buildMapsQuery(parsed: QueryParseResult): Record<string, unknown> {
  const keywords = [parsed.entity_type, parsed.location || ''].filter(Boolean).join(' ').trim();

  return {
    searchQuery: keywords,
    maxResults: parsed.count,
  };
}

function buildSerpQuery(parsed: QueryParseResult): Record<string, unknown> {
  const keywords = [
    ...(parsed.keywords || []),
    parsed.entity_type,
    parsed.location || '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    query: keywords,
    maxResults: parsed.count,
  };
}

function buildApolloQuery(parsed: QueryParseResult): Record<string, unknown> {
  // Apollo's mixed_people/api_search is a PEOPLE search endpoint.
  // For company searches, use q_organization_keyword_tags to find people at matching companies.
  const isCompanySearch = parsed.entity_type === 'companies';
  const params: Record<string, unknown> = {
    per_page: Math.min(parsed.count, 100),
    page: 1,
  };

  if (isCompanySearch) {
    // Find people at companies matching keywords — Apollo requires person-level context
    if (parsed.keywords && parsed.keywords.length > 0) {
      params.q_organization_keyword_tags = parsed.keywords;
    }
    // Always use person_locations (Apollo's only location filter for mixed_people)
    if (parsed.location) {
      params.person_locations = [parsed.location];
    }
  } else {
    // For people searches, use person-specific params
    if (parsed.keywords && parsed.keywords.length > 0) {
      params.q_keywords = parsed.keywords.join(' ');
    }
    if (parsed.location) {
      params.person_locations = [parsed.location];
    }
  }

  if (parsed.filters) {
    const titles: string[] = [];
    const industries: string[] = [];
    const seniorities: string[] = [];

    parsed.filters.forEach((filter) => {
      switch (filter.field.toLowerCase()) {
        case 'title':
        case 'job_title':
          if (Array.isArray(filter.value)) {
            titles.push(...filter.value.map(String));
          } else {
            titles.push(String(filter.value));
          }
          break;
        case 'industry':
          if (Array.isArray(filter.value)) {
            industries.push(...filter.value.map(String));
          } else {
            industries.push(String(filter.value));
          }
          break;
        case 'seniority':
        case 'seniority_level':
          if (Array.isArray(filter.value)) {
            seniorities.push(...filter.value.map(String));
          } else {
            seniorities.push(String(filter.value));
          }
          break;
      }
    });

    if (titles.length > 0) params.person_titles = titles;
    if (industries.length > 0) params.q_organization_keyword_tags = industries;
    if (seniorities.length > 0) params.person_seniorities = seniorities;
  }

  return params;
}

function buildAiArkQuery(parsed: QueryParseResult): Record<string, unknown> {
  const isCompanySearch = parsed.entity_type === 'companies';
  const params: Record<string, unknown> = {
    page: 0,
    size: Math.min(parsed.count, 100),
  };

  if (isCompanySearch) {
    const accountFilters: Record<string, unknown> = {};

    if (parsed.keywords && parsed.keywords.length > 0) {
      accountFilters.keyword = {
        keyword: parsed.keywords.join(' '),
        sources: ['KEYWORD', 'DESCRIPTION', 'SEO', 'NAME', 'INDUSTRY'],
      };
    }

    if (parsed.filters) {
      parsed.filters.forEach((filter) => {
        switch (filter.field.toLowerCase()) {
          case 'industry':
            if (Array.isArray(filter.value)) {
              accountFilters.industry = { include: filter.value.map(String) };
            } else {
              accountFilters.industry = { include: [String(filter.value)] };
            }
            break;
          case 'company_size':
          case 'employee_count':
            if (typeof filter.value === 'number') {
              accountFilters.employeeSize = [{ start: filter.value, end: filter.value * 2 }];
            }
            break;
        }
      });
    }

    if (Object.keys(accountFilters).length > 0) {
      params.account = accountFilters;
    }
  } else {
    // People search: use contact filters with title search
    const contactFilters: Record<string, unknown> = {};

    if (parsed.keywords && parsed.keywords.length > 0) {
      contactFilters.title = {
        any: { include: parsed.keywords, searchMode: 'SMART' },
      };
    }

    if (parsed.location) {
      contactFilters.location = {
        any: { include: [parsed.location] },
      };
    }

    if (Object.keys(contactFilters).length > 0) {
      params.contact = contactFilters;
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Actor Execution
// ---------------------------------------------------------------------------

interface ActorResult {
  results: NormalizedResult[];
  provider: SourcePreference;
  sources: Array<{ url: string; title: string }>;
  count: number;
}

async function executeApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>[]> {
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}&waitForFinish=${ACTOR_TIMEOUT_SECONDS}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  if (!runResponse.ok) {
    if (runResponse.status === 401) throw new Error('APIFY_AUTH_FAILED');
    if (runResponse.status === 429) throw new Error('APIFY_RATE_LIMIT');
    throw new Error(`APIFY_ERROR: ${runResponse.status}`);
  }

  const runData = (await runResponse.json()) as { data: { status: string; defaultDatasetId: string } };

  if (runData.data.status === 'TIMEOUT' || runData.data.status === 'TIMED-OUT') {
    throw new Error('APIFY_TIMEOUT');
  }

  if (runData.data.status === 'FAILED') {
    throw new Error('APIFY_RUN_FAILED');
  }

  if (runData.data.status !== 'SUCCEEDED') {
    throw new Error(`APIFY_UNEXPECTED_STATUS: ${runData.data.status}`);
  }

  const datasetId = runData.data.defaultDatasetId;
  const datasetResponse = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&format=json`,
    { method: 'GET' }
  );

  if (!datasetResponse.ok) {
    throw new Error('APIFY_DATASET_ERROR');
  }

  return (await datasetResponse.json()) as Record<string, unknown>[];
}

async function executeLinkedIn(
  query: Record<string, unknown>,
  apiKey: string
): Promise<ActorResult> {
  const items = await executeApifyActor('apify/linkedin-profile-scraper', query, apiKey);

  const results: NormalizedResult[] = items.map((item) => ({
    name: item.fullName as string | undefined,
    title: item.headline as string | undefined,
    location: item.location as string | undefined,
    linkedin_url: item.profileUrl as string | undefined,
    company: item.experience?.[0]?.company as string | undefined,
    source_provider: 'linkedin',
    source_url: item.profileUrl as string | undefined,
    raw_data: item,
  }));

  return {
    results,
    provider: 'linkedin',
    sources: items.map((item) => ({
      url: (item.profileUrl as string) || '',
      title: (item.fullName as string) || 'LinkedIn Profile',
    })),
    count: results.length,
  };
}

async function executeMaps(
  query: Record<string, unknown>,
  apiKey: string
): Promise<ActorResult> {
  const items = await executeApifyActor('nwua9Gu5YrADL7ZDj', query, apiKey);

  const results: NormalizedResult[] = items.map((item) => ({
    name: item.title as string | undefined,
    location: item.address as string | undefined,
    phone: item.phone as string | undefined,
    website: item.website as string | undefined,
    description: item.description as string | undefined,
    source_provider: 'maps',
    source_url: item.url as string | undefined,
    raw_data: item,
  }));

  return {
    results,
    provider: 'maps',
    sources: items.map((item) => ({
      url: (item.url as string) || '',
      title: (item.title as string) || 'Google Maps',
    })),
    count: results.length,
  };
}

async function executeSerp(
  query: Record<string, unknown>,
  apiKey: string
): Promise<ActorResult> {
  const items = await executeApifyActor('apify/google-search-scraper', query, apiKey);

  const results: NormalizedResult[] = [];
  const sources: Array<{ url: string; title: string }> = [];

  for (const item of items) {
    const organicResults = item.organicResults as Array<{ url: string; title: string; description?: string }>;
    if (organicResults) {
      for (const result of organicResults) {
        results.push({
          name: result.title,
          description: result.description,
          website: result.url,
          source_provider: 'serp',
          source_url: result.url,
          raw_data: result,
        });
        sources.push({ url: result.url, title: result.title });
      }
    }
  }

  return {
    results,
    provider: 'serp',
    sources,
    count: results.length,
  };
}

async function executeApollo(
  query: Record<string, unknown>,
  apiKey: string,
  supabaseUrl: string,
  authHeader: string
): Promise<ActorResult> {
  const response = await fetch(`${supabaseUrl}/functions/v1/apollo-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    throw new Error(`APOLLO_ERROR: ${response.status}`);
  }

  const data = (await response.json()) as { contacts?: Record<string, unknown>[] };
  const contacts = data.contacts || [];

  // apollo-search returns NormalizedContact with: full_name, company, city, state, country,
  // linkedin_url, email, phone, website_url, title, company_domain, employees, funding_stage
  const results: NormalizedResult[] = contacts.map((contact) => {
    const locationParts = [contact.city, contact.state, contact.country].filter(Boolean);
    return {
      name: (contact.full_name as string) || undefined,
      title: (contact.title as string) || undefined,
      company: (contact.company as string) || undefined,
      email: (contact.email as string) || undefined,
      phone: (contact.phone as string) || undefined,
      linkedin_url: (contact.linkedin_url as string) || undefined,
      website: (contact.website_url as string) || (contact.company_domain ? `https://${contact.company_domain}` : undefined),
      location: locationParts.length > 0 ? locationParts.join(', ') : undefined,
      industry: undefined, // Apollo people search doesn't return industry
      employee_count: (contact.employees as number) || undefined,
      source_provider: 'apollo',
      source_url: (contact.linkedin_url as string) || undefined,
      raw_data: contact,
    };
  });

  return {
    results,
    provider: 'apollo',
    sources: contacts.map((c) => ({
      url: (c.linkedin_url as string) || '',
      title: (c.full_name as string) || (c.company as string) || 'Apollo Result',
    })),
    count: results.length,
  };
}

async function executeAiArk(
  query: Record<string, unknown>,
  apiKey: string,
  entityType: EntityType = 'companies'
): Promise<ActorResult> {
  const endpoint = entityType === 'people'
    ? 'https://api.ai-ark.com/api/developer-portal/v1/people'
    : 'https://api.ai-ark.com/api/developer-portal/v1/companies';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TOKEN': apiKey,
    },
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    throw new Error(`AI_ARK_ERROR: ${response.status}`);
  }

  const data = (await response.json()) as { content: Record<string, unknown>[] };
  const items = data.content || [];

  let results: NormalizedResult[];

  if (entityType === 'people') {
    // AI Ark people response: profile.first_name, profile.title, link.linkedin, etc.
    results = items.map((person) => ({
      name: `${(person as any).profile?.first_name || ''} ${(person as any).profile?.last_name || ''}`.trim() || undefined,
      title: (person as any).profile?.title as string | undefined,
      company: (person as any).experiences?.[0]?.company?.name as string | undefined,
      linkedin_url: (person as any).link?.linkedin as string | undefined,
      location: (person as any).location?.default as string | undefined,
      source_provider: 'ai_ark' as const,
      source_url: (person as any).link?.linkedin as string | undefined,
      raw_data: person,
    }));
  } else {
    // AI Ark company response: summary.name, link.domain, summary.industry, etc.
    results = items.map((company) => {
      const companyName = (company as any).summary?.name as string | undefined;
      return {
        name: companyName, // Set name = company name for display in Name column
        company: companyName,
        website: (company as any).link?.domain as string | undefined,
        industry: (company as any).summary?.industry as string | undefined,
        employee_count: (company as any).summary?.staff?.total as number | undefined,
        location: (company as any).location?.headquarter?.raw_address as string | undefined,
        description: (company as any).summary?.description as string | undefined,
        source_provider: 'ai_ark' as const,
        source_url: (company as any).link?.domain ? `https://${(company as any).link.domain}` : undefined,
        raw_data: company,
      };
    });
  }

  return {
    results,
    provider: 'ai_ark',
    sources: items.map((item) => {
      if (entityType === 'people') {
        const name = `${(item as any).profile?.first_name || ''} ${(item as any).profile?.last_name || ''}`.trim();
        return {
          url: (item as any).link?.linkedin || '',
          title: name || 'AI Ark Person',
        };
      }
      return {
        url: (item as any).link?.domain ? `https://${(item as any).link.domain}` : '',
        title: ((item as any).summary?.name as string) || 'AI Ark Company',
      };
    }),
    count: results.length,
  };
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function normalizeForDedup(str: string | undefined): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function extractDomain(url: string | undefined): string {
  if (!url) return '';
  try {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  } catch {
    return '';
  }
}

function countPopulatedFields(result: NormalizedResult): number {
  let count = 0;
  if (result.name) count++;
  if (result.company) count++;
  if (result.title) count++;
  if (result.location) count++;
  if (result.email) count++;
  if (result.phone) count++;
  if (result.linkedin_url) count++;
  if (result.website) count++;
  if (result.industry) count++;
  if (result.employee_count) count++;
  if (result.description) count++;
  return count;
}

function deduplicateResults(results: NormalizedResult[]): NormalizedResult[] {
  const seen = new Map<string, NormalizedResult>();

  for (const result of results) {
    // Generate dedup key from domain or normalized company name
    const domain = extractDomain(result.website);
    const companyName = normalizeForDedup(result.company || result.name);
    const key = domain || companyName;

    if (!key) {
      // Can't deduplicate without a key, keep the result
      seen.set(`_unkeyed_${seen.size}`, result);
      continue;
    }

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, result);
    } else {
      // Keep the result with more populated fields
      if (countPopulatedFields(result) > countPopulatedFields(existing)) {
        seen.set(key, result);
      }
    }
  }

  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401);
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return errorResponse('No organization found', req, 400);
    }

    const organizationId = membership.org_id;

    // Parse request
    const body = (await req.json()) as MultiQueryRequest;
    const { parsedQuery, tableId, selectedSources, depth = 'medium' } = body;

    if (!parsedQuery || !parsedQuery.entity_type) {
      return errorResponse('Missing or invalid parsedQuery', req, 400);
    }

    // Service role client
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Rate limiting: check concurrent runs
    const { count: runningCount } = await serviceClient
      .from('apify_runs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', organizationId)
      .eq('status', 'running');

    if ((runningCount ?? 0) >= MAX_CONCURRENT_RUNS) {
      return jsonResponse(
        {
          error: `Maximum ${MAX_CONCURRENT_RUNS} concurrent runs allowed`,
          code: 'RATE_LIMIT_CONCURRENT',
        },
        req,
        429
      );
    }

    // Resolve source preferences
    const queryType = detectQueryType(parsedQuery.entity_type);
    const userPreference = selectedSources?.[0] || parsedQuery.source_preference;

    const rankings = await resolveSourcePreferences(userPreference, queryType, organizationId, serviceClient);

    if (rankings.length === 0) {
      return errorResponse('No providers available. Configure integrations in Settings.', req, 400);
    }

    // Determine providers to use based on depth
    const providerCount = depth === 'high' ? 3 : depth === 'medium' ? 2 : 1;
    const providersToUse = getTopProviders(rankings, providerCount);

    console.log(`[apify-multi-query] Using providers: ${providersToUse.join(', ')}`);

    // Get API keys
    const { data: credentials } = await serviceClient
      .from('integration_credentials')
      .select('provider, credentials')
      .eq('organization_id', organizationId)
      .in('provider', ['apify', 'apollo', 'ai_ark']);

    const apiKeys: Record<string, string> = {};
    if (credentials) {
      for (const cred of credentials) {
        const credData = cred.credentials as Record<string, string>;
        if (credData.api_token || credData.api_key) {
          apiKeys[cred.provider] = credData.api_token || credData.api_key;
        }
      }
    }

    // Create Realtime channel for progress events
    const channel = serviceClient.channel(`apify_progress_${organizationId}`);

    // Execute actors in parallel
    const executionPromises = providersToUse.map(async (provider) => {
      try {
        await channel.send({
          type: 'broadcast',
          event: 'actor_started',
          payload: { actor: provider, query: parsedQuery },
        });

        let result: ActorResult;

        switch (provider) {
          case 'linkedin':
            result = await executeLinkedIn(buildLinkedInQuery(parsedQuery), apiKeys.apify);
            break;
          case 'maps':
            result = await executeMaps(buildMapsQuery(parsedQuery), apiKeys.apify);
            break;
          case 'serp':
            result = await executeSerp(buildSerpQuery(parsedQuery), apiKeys.apify);
            break;
          case 'apollo':
            result = await executeApollo(
              buildApolloQuery(parsedQuery),
              apiKeys.apollo,
              Deno.env.get('SUPABASE_URL') ?? '',
              authHeader
            );
            break;
          case 'ai_ark':
            result = await executeAiArk(buildAiArkQuery(parsedQuery), apiKeys.ai_ark, parsedQuery.entity_type);
            break;
          default:
            throw new Error(`Unknown provider: ${provider}`);
        }

        await channel.send({
          type: 'broadcast',
          event: 'actor_completed',
          payload: { actor: provider, result_count: result.count },
        });

        // Insert run record
        await serviceClient.from('apify_runs').insert({
          org_id: organizationId,
          created_by: user.id,
          actor_id: provider,
          actor_name: provider,
          status: 'complete',
          total_records: result.count,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });

        return result;
      } catch (error) {
        console.error(`[apify-multi-query] Provider ${provider} failed:`, error);

        await channel.send({
          type: 'broadcast',
          event: 'actor_failed',
          payload: { actor: provider, error: (error as Error).message },
        });

        // Insert failed run record
        await serviceClient.from('apify_runs').insert({
          org_id: organizationId,
          created_by: user.id,
          actor_id: provider,
          actor_name: provider,
          status: 'failed',
          error_message: (error as Error).message,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });

        return null;
      }
    });

    const results = await Promise.all(executionPromises);
    const successfulResults = results.filter((r): r is ActorResult => r !== null);

    if (successfulResults.length === 0) {
      return errorResponse('All providers failed', req, 500);
    }

    // Merge and deduplicate results
    const rawMergedResults = successfulResults.flatMap((r) => r.results);
    const allSources = successfulResults.flatMap((r) => r.sources);
    const providersUsed = successfulResults.map((r) => r.provider);

    // Deduplicate by domain or normalized company name
    const mergedResults = deduplicateResults(rawMergedResults);

    // If tableId provided, append results to table
    if (tableId) {
      // TODO: Implement table appending logic
      console.log(`[apify-multi-query] Appending ${mergedResults.length} results to table ${tableId}`);
    }

    return jsonResponse(
      {
        results: mergedResults,
        providers_used: providersUsed,
        sources: allSources,
        total_count: mergedResults.length,
      },
      req,
      200
    );
  } catch (error) {
    console.error('[apify-multi-query] Error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});
