/**
 * prospect-enrich
 *
 * Person-level intelligence for the /t/{domain} campaign creator.
 * Enriches a prospect using AI Ark reverse-lookup + Apollo people/match + EXA activity search.
 *
 * Input:  { email?, linkedin_url?, first_name?, last_name?, domain? }
 * Output: { title, seniority, department, linkedin_url, photo_url, company_name, recent_activity[], interests[] }
 *
 * Auth-gated: requires valid JWT.
 * Deploy with --no-verify-jwt (ES256 staging issue).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

const AI_ARK_API_BASE = 'https://api.ai-ark.com/api/developer-portal/v1';
const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';
const PROVIDER_TIMEOUT_MS = 10_000;

interface ProspectEnrichRequest {
  email?: string;
  linkedin_url?: string;
  first_name?: string;
  last_name?: string;
  domain?: string;
}

interface ProspectIntel {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  headline: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  company_name: string | null;
  company_domain: string | null;
  location: string | null;
  recent_activity: string[];
  interests: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization', 401, req);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('Unauthorized', 401, req);
    }

    const body: ProspectEnrichRequest = await req.json();

    if (!body.email && !body.linkedin_url && !(body.first_name && body.domain)) {
      return errorResponse('Provide email, linkedin_url, or first_name+domain', 400, req);
    }

    const intel = await enrichProspect(body);
    return jsonResponse({ success: true, prospect: intel }, req);
  } catch (err) {
    console.error('[prospect-enrich] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      500,
      req
    );
  }
});

// ---------------------------------------------------------------------------
// Main enrichment orchestrator
// ---------------------------------------------------------------------------

async function enrichProspect(params: ProspectEnrichRequest): Promise<ProspectIntel> {
  // Fire all providers in parallel
  const [aiArkResult, apolloResult, exaResult] = await Promise.allSettled([
    runAiArkReverseLookup(params),
    runApolloPeopleMatch(params),
    runExaPersonSearch(params),
  ]);

  const aiArk = aiArkResult.status === 'fulfilled' ? aiArkResult.value : null;
  const apollo = apolloResult.status === 'fulfilled' ? apolloResult.value : null;
  const exa = exaResult.status === 'fulfilled' ? exaResult.value : null;

  if (aiArkResult.status === 'rejected') console.warn('[prospect-enrich] AI Ark failed:', aiArkResult.reason);
  if (apolloResult.status === 'rejected') console.warn('[prospect-enrich] Apollo failed:', apolloResult.reason);
  if (exaResult.status === 'rejected') console.warn('[prospect-enrich] EXA failed:', exaResult.reason);

  // Merge: AI Ark primary, Apollo fills gaps
  return {
    first_name: aiArk?.first_name || apollo?.first_name || params.first_name || null,
    last_name: aiArk?.last_name || apollo?.last_name || params.last_name || null,
    full_name: aiArk?.full_name || apollo?.full_name || null,
    title: aiArk?.title || apollo?.title || null,
    seniority: aiArk?.seniority || apollo?.seniority || null,
    department: apollo?.department || null,
    headline: aiArk?.headline || apollo?.headline || null,
    linkedin_url: aiArk?.linkedin_url || apollo?.linkedin_url || params.linkedin_url || null,
    photo_url: aiArk?.photo_url || apollo?.photo_url || null,
    company_name: aiArk?.company_name || apollo?.company_name || null,
    company_domain: aiArk?.company_domain || apollo?.company_domain || params.domain || null,
    location: aiArk?.location || apollo?.location || null,
    recent_activity: exa?.recent_activity || [],
    interests: exa?.interests || [],
  };
}

// ---------------------------------------------------------------------------
// AI Ark reverse-lookup
// ---------------------------------------------------------------------------

interface AiArkPersonData {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  seniority: string | null;
  headline: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  company_name: string | null;
  company_domain: string | null;
  location: string | null;
}

async function runAiArkReverseLookup(params: ProspectEnrichRequest): Promise<AiArkPersonData | null> {
  const apiKey = Deno.env.get('AI_ARK_API_KEY');
  if (!apiKey) return null;
  if (!params.email && !params.linkedin_url) return null;

  const search: Record<string, string> = {};
  if (params.email) search.email = params.email;
  if (params.linkedin_url) search.linkedin = params.linkedin_url;

  const response = await fetch(`${AI_ARK_API_BASE}/people/reverse-lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TOKEN': apiKey },
    body: JSON.stringify({ kind: 'CONTACT', search }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const person = data.content?.[0];
  if (!person) return null;

  return {
    first_name: person.profile?.first_name || null,
    last_name: person.profile?.last_name || null,
    full_name: person.profile?.full_name || null,
    title: person.profile?.title || null,
    seniority: person.department?.seniority || null,
    headline: person.profile?.headline || null,
    linkedin_url: person.link?.linkedin || null,
    photo_url: person.profile?.picture?.source || null,
    company_name: person.company?.summary?.name || null,
    company_domain: person.company?.link?.domain || null,
    location: person.location?.default || null,
  };
}

// ---------------------------------------------------------------------------
// Apollo people/match
// ---------------------------------------------------------------------------

interface ApolloPersonData {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  headline: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  company_name: string | null;
  company_domain: string | null;
  location: string | null;
}

async function runApolloPeopleMatch(params: ProspectEnrichRequest): Promise<ApolloPersonData | null> {
  const apiKey = Deno.env.get('APOLLO_API_KEY');
  if (!apiKey) return null;
  if (!params.email && !(params.first_name && params.last_name && params.domain)) return null;

  const body: Record<string, string | undefined> = {};
  if (params.email) body.email = params.email;
  if (params.first_name) body.first_name = params.first_name;
  if (params.last_name) body.last_name = params.last_name;
  if (params.domain) body.organization_domain = params.domain;

  const response = await fetch(`${APOLLO_API_BASE}/people/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const person = data.person;
  if (!person) return null;

  const parts = [person.city, person.state, person.country].filter(Boolean);

  return {
    first_name: person.first_name || null,
    last_name: person.last_name || null,
    full_name: person.name || null,
    title: person.title || null,
    seniority: person.seniority || null,
    department: person.departments?.[0] || null,
    headline: person.headline || null,
    linkedin_url: person.linkedin_url || null,
    photo_url: person.photo_url || null,
    company_name: person.organization?.name || null,
    company_domain: person.organization?.primary_domain || null,
    location: parts.length > 0 ? parts.join(', ') : null,
  };
}

// ---------------------------------------------------------------------------
// EXA person activity search
// ---------------------------------------------------------------------------

interface ExaPersonActivity {
  recent_activity: string[];
  interests: string[];
}

async function runExaPersonSearch(params: ProspectEnrichRequest): Promise<ExaPersonActivity | null> {
  const apiKey = Deno.env.get('EXA_API_KEY');
  if (!apiKey) return null;

  const name = [params.first_name, params.last_name].filter(Boolean).join(' ');
  if (!name) return null;

  const companyContext = params.domain ? ` ${params.domain}` : '';
  const query = `${name}${companyContext} LinkedIn posts articles insights`;

  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      query,
      numResults: 5,
      contents: { text: { maxCharacters: 500 }, highlights: true },
      useAutoprompt: true,
      type: 'neural',
      startPublishedDate: sixMonthsAgo(),
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const results = data.results || [];

  if (results.length === 0) return null;

  // Extract activity summaries and interest topics
  const recent_activity = results
    .slice(0, 3)
    .map((r: { title: string }) => r.title)
    .filter(Boolean);

  const interests = extractInterests(results);

  return { recent_activity, interests };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sixMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().split('T')[0];
}

function extractInterests(results: Array<{ text?: string; highlights?: string[] }>): string[] {
  const allText = results
    .map(r => [r.text, ...(r.highlights || [])].join(' '))
    .join(' ')
    .toLowerCase();

  // Simple keyword extraction for common business topics
  const topics = [
    'ai', 'machine learning', 'sales', 'marketing', 'growth', 'leadership',
    'product', 'engineering', 'data', 'analytics', 'automation', 'cloud',
    'saas', 'fintech', 'healthcare', 'cybersecurity', 'sustainability',
    'hiring', 'culture', 'fundraising', 'strategy', 'partnerships',
  ];

  return topics.filter(t => allText.includes(t)).slice(0, 5);
}
