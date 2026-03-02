// supabase/functions/_shared/slackSearch.ts
// Hybrid search service for Slack commands - searches Sixty DB first, then CRM fallback

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { HubSpotClient } from './hubspot.ts';
import { getHubSpotClientForOrg, hasHubSpotIntegration } from './copilot_adapters/hubspotAdapters.ts';

// ============================================================================
// Types
// ============================================================================

export interface ContactResult {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  source: 'sixty' | 'hubspot';
  // Activity signals for ranking
  last_interaction_at?: string | null;
  health_score?: number | null;
  engagement_level?: string | null;
  total_meetings_count?: number | null;
  // Deal context
  active_deal_id?: string | null;
  active_deal_name?: string | null;
  active_deal_value?: number | null;
}

export interface DealResult {
  id: string;
  name: string;
  company: string | null;
  value: number;
  stage: string | null;
  stage_name?: string | null;
  expected_close_date: string | null;
  probability?: number | null;
  source: 'sixty' | 'hubspot';
  // Activity signals
  days_in_stage?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  next_steps?: string | null;
}

export interface SearchOptions {
  limit?: number;
  includeCrmFallback?: boolean;
  confidenceThreshold?: number;
}

export interface SearchResult<T> {
  results: T[];
  hasMore: boolean;
  sources: ('sixty' | 'hubspot')[];
  crmAvailable: boolean;
}

// ============================================================================
// Contact Search
// ============================================================================

/**
 * Search for contacts - Sixty DB first, then HubSpot fallback
 *
 * Search priority:
 * 1. Exact email match
 * 2. Name prefix match
 * 3. Company match
 * 4. Full-text search
 */
export async function searchContacts(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult<ContactResult>> {
  const limit = options.limit ?? 10;
  const includeCrmFallback = options.includeCrmFallback ?? true;
  const confidenceThreshold = options.confidenceThreshold ?? 0.5;

  const trimmedQuery = query.trim().toLowerCase();
  const isEmail = trimmedQuery.includes('@');
  const sources: ('sixty' | 'hubspot')[] = [];

  // Step 1: Search Sixty DB
  let sixtyResults: ContactResult[] = [];
  try {
    sixtyResults = await searchSixtyContacts(supabase, orgId, trimmedQuery, limit);
    if (sixtyResults.length > 0) {
      sources.push('sixty');
    }
  } catch (e) {
    console.error('Error searching Sixty contacts:', e);
  }

  // Calculate confidence based on match quality
  const confidence = calculateContactConfidence(sixtyResults, trimmedQuery);

  // Step 2: Check if we need CRM fallback
  let hubspotResults: ContactResult[] = [];
  const crmAvailable = await hasHubSpotIntegration(supabase, orgId);

  if (includeCrmFallback && crmAvailable && confidence < confidenceThreshold) {
    try {
      hubspotResults = await searchHubSpotContacts(supabase, orgId, trimmedQuery, isEmail, limit);
      if (hubspotResults.length > 0) {
        sources.push('hubspot');
      }
    } catch (e) {
      console.error('Error searching HubSpot contacts:', e);
    }
  }

  // Step 3: Merge and dedupe
  const mergedResults = mergeAndDedupeContacts(sixtyResults, hubspotResults);

  // Step 4: Rank by activity signals
  const rankedResults = rankContacts(mergedResults);

  return {
    results: rankedResults.slice(0, limit),
    hasMore: rankedResults.length > limit,
    sources,
    crmAvailable,
  };
}

async function searchSixtyContacts(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  limit: number
): Promise<ContactResult[]> {
  const isEmail = query.includes('@');

  let dbQuery = supabase
    .from('contacts')
    .select(`
      id,
      email,
      first_name,
      last_name,
      full_name,
      phone,
      title,
      company,
      last_interaction_at,
      health_score,
      engagement_level,
      total_meetings_count
    `)
    .eq('clerk_org_id', orgId)
    .limit(limit);

  if (isEmail) {
    // Exact email match
    dbQuery = dbQuery.ilike('email', query);
  } else {
    // Search by name or company
    dbQuery = dbQuery.or(`full_name.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%,company.ilike.%${query}%`);
  }

  // Order by activity (most recent interaction first)
  dbQuery = dbQuery.order('last_interaction_at', { ascending: false, nullsFirst: false });

  const { data, error } = await dbQuery;

  if (error) {
    console.error('Sixty contact search error:', error);
    return [];
  }

  // Fetch active deals for these contacts
  const contactsWithDeals = await enrichContactsWithDeals(supabase, data || []);

  return contactsWithDeals.map(c => ({
    id: c.id,
    email: c.email,
    first_name: c.first_name,
    last_name: c.last_name,
    full_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    phone: c.phone,
    title: c.title,
    company: c.company,
    source: 'sixty' as const,
    last_interaction_at: c.last_interaction_at,
    health_score: c.health_score,
    engagement_level: c.engagement_level,
    total_meetings_count: c.total_meetings_count,
    active_deal_id: c.active_deal_id,
    active_deal_name: c.active_deal_name,
    active_deal_value: c.active_deal_value,
  }));
}

async function enrichContactsWithDeals(
  supabase: SupabaseClient,
  contacts: any[]
): Promise<any[]> {
  if (contacts.length === 0) return contacts;

  const emails = contacts.map(c => c.email).filter(Boolean);
  if (emails.length === 0) return contacts;

  // Get active deals where contact is the primary contact
  const { data: deals } = await supabase
    .from('deals')
    .select('id, name, value, contact_email')
    .in('contact_email', emails)
    .not('status', 'eq', 'closed_won')
    .not('status', 'eq', 'closed_lost')
    .order('value', { ascending: false });

  const dealsByEmail = new Map<string, any>();
  (deals || []).forEach(d => {
    if (d.contact_email && !dealsByEmail.has(d.contact_email.toLowerCase())) {
      dealsByEmail.set(d.contact_email.toLowerCase(), d);
    }
  });

  return contacts.map(c => {
    const deal = c.email ? dealsByEmail.get(c.email.toLowerCase()) : null;
    return {
      ...c,
      active_deal_id: deal?.id || null,
      active_deal_name: deal?.name || null,
      active_deal_value: deal?.value || null,
    };
  });
}

async function searchHubSpotContacts(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  isEmail: boolean,
  limit: number
): Promise<ContactResult[]> {
  const hubspotClient = await getHubSpotClientForOrg(supabase, orgId);
  if (!hubspotClient) return [];

  try {
    const searchBody = isEmail
      ? {
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator: 'EQ',
              value: query,
            }],
          }],
          properties: ['firstname', 'lastname', 'email', 'phone', 'jobtitle', 'company'],
          limit,
        }
      : {
          query,
          properties: ['firstname', 'lastname', 'email', 'phone', 'jobtitle', 'company'],
          limit,
        };

    const result = await hubspotClient.request<any>({
      method: 'POST',
      path: '/crm/v3/objects/contacts/search',
      body: searchBody,
    });

    return (result?.results || []).map((c: any) => ({
      id: `hs_${c.id}`,
      email: c.properties?.email || null,
      first_name: c.properties?.firstname || null,
      last_name: c.properties?.lastname || null,
      full_name: `${c.properties?.firstname || ''} ${c.properties?.lastname || ''}`.trim() || null,
      phone: c.properties?.phone || null,
      title: c.properties?.jobtitle || null,
      company: c.properties?.company || null,
      source: 'hubspot' as const,
    }));
  } catch (e) {
    console.error('HubSpot contact search error:', e);
    return [];
  }
}

function calculateContactConfidence(results: ContactResult[], query: string): number {
  if (results.length === 0) return 0;

  const bestMatch = results[0];
  const email = bestMatch.email?.toLowerCase() || '';
  const fullName = bestMatch.full_name?.toLowerCase() || '';
  const company = bestMatch.company?.toLowerCase() || '';

  // Exact email match
  if (email === query) return 1.0;

  // Exact name match
  if (fullName === query) return 0.95;

  // Name starts with query
  if (fullName.startsWith(query)) return 0.85;

  // Name contains query
  if (fullName.includes(query)) return 0.7;

  // Company match
  if (company.includes(query)) return 0.5;

  // Has results but no strong match
  return 0.3;
}

function mergeAndDedupeContacts(
  sixtyResults: ContactResult[],
  hubspotResults: ContactResult[]
): ContactResult[] {
  const seen = new Set<string>();
  const merged: ContactResult[] = [];

  // Sixty results first (preferred)
  for (const contact of sixtyResults) {
    const key = contact.email?.toLowerCase() || contact.id;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(contact);
    }
  }

  // Add HubSpot results that aren't duplicates
  for (const contact of hubspotResults) {
    const key = contact.email?.toLowerCase() || contact.id;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(contact);
    }
  }

  return merged;
}

function rankContacts(contacts: ContactResult[]): ContactResult[] {
  return contacts.sort((a, b) => {
    // Sixty source preferred
    if (a.source !== b.source) {
      return a.source === 'sixty' ? -1 : 1;
    }

    // Active deals preferred
    if (a.active_deal_id && !b.active_deal_id) return -1;
    if (!a.active_deal_id && b.active_deal_id) return 1;

    // Higher deal value preferred
    if (a.active_deal_value && b.active_deal_value) {
      return b.active_deal_value - a.active_deal_value;
    }

    // Recent interaction preferred
    if (a.last_interaction_at && b.last_interaction_at) {
      return new Date(b.last_interaction_at).getTime() - new Date(a.last_interaction_at).getTime();
    }
    if (a.last_interaction_at) return -1;
    if (b.last_interaction_at) return 1;

    // Higher health score preferred
    if (a.health_score && b.health_score) {
      return b.health_score - a.health_score;
    }

    return 0;
  });
}

// ============================================================================
// Deal Search
// ============================================================================

/**
 * Search for deals - Sixty DB first, then HubSpot fallback
 */
export async function searchDeals(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult<DealResult>> {
  const limit = options.limit ?? 10;
  const includeCrmFallback = options.includeCrmFallback ?? true;
  const confidenceThreshold = options.confidenceThreshold ?? 0.5;

  const trimmedQuery = query.trim().toLowerCase();
  const sources: ('sixty' | 'hubspot')[] = [];

  // Step 1: Search Sixty DB
  let sixtyResults: DealResult[] = [];
  try {
    sixtyResults = await searchSixtyDeals(supabase, orgId, trimmedQuery, limit);
    if (sixtyResults.length > 0) {
      sources.push('sixty');
    }
  } catch (e) {
    console.error('Error searching Sixty deals:', e);
  }

  // Calculate confidence
  const confidence = calculateDealConfidence(sixtyResults, trimmedQuery);

  // Step 2: Check if we need CRM fallback
  let hubspotResults: DealResult[] = [];
  const crmAvailable = await hasHubSpotIntegration(supabase, orgId);

  if (includeCrmFallback && crmAvailable && confidence < confidenceThreshold) {
    try {
      hubspotResults = await searchHubSpotDeals(supabase, orgId, trimmedQuery, limit);
      if (hubspotResults.length > 0) {
        sources.push('hubspot');
      }
    } catch (e) {
      console.error('Error searching HubSpot deals:', e);
    }
  }

  // Step 3: Merge and dedupe
  const mergedResults = mergeAndDedupeDeals(sixtyResults, hubspotResults);

  // Step 4: Rank by activity signals
  const rankedResults = rankDeals(mergedResults);

  return {
    results: rankedResults.slice(0, limit),
    hasMore: rankedResults.length > limit,
    sources,
    crmAvailable,
  };
}

async function searchSixtyDeals(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  limit: number
): Promise<DealResult[]> {
  // Get org users to filter deals
  const { data: orgUsers } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId);

  const userIds = orgUsers?.map(u => u.user_id) || [];

  if (userIds.length === 0) {
    // Fallback: try querying by clerk_org_id on deals if available
    const { data, error } = await supabase
      .from('deals')
      .select(`
        id,
        name,
        company,
        value,
        stage_id,
        expected_close_date,
        probability,
        contact_name,
        contact_email,
        next_steps,
        stage_changed_at,
        deal_stages ( name )
      `)
      .or(`name.ilike.%${query}%,company.ilike.%${query}%`)
      .not('status', 'eq', 'closed_won')
      .not('status', 'eq', 'closed_lost')
      .order('value', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Sixty deal search error:', error);
      return [];
    }

    return (data || []).map(d => mapSixtyDeal(d));
  }

  const { data, error } = await supabase
    .from('deals')
    .select(`
      id,
      name,
      company,
      value,
      stage_id,
      expected_close_date,
      probability,
      contact_name,
      contact_email,
      next_steps,
      stage_changed_at,
      deal_stages ( name )
    `)
    .in('owner_id', userIds)
    .or(`name.ilike.%${query}%,company.ilike.%${query}%`)
    .not('status', 'eq', 'closed_won')
    .not('status', 'eq', 'closed_lost')
    .order('value', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Sixty deal search error:', error);
    return [];
  }

  return (data || []).map(d => mapSixtyDeal(d));
}

function mapSixtyDeal(d: any): DealResult {
  const stageChangedAt = d.stage_changed_at ? new Date(d.stage_changed_at) : null;
  const daysInStage = stageChangedAt
    ? Math.floor((Date.now() - stageChangedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    id: d.id,
    name: d.name,
    company: d.company,
    value: d.value || 0,
    stage: d.stage_id,
    stage_name: d.deal_stages?.name || null,
    expected_close_date: d.expected_close_date,
    probability: d.probability,
    source: 'sixty' as const,
    days_in_stage: daysInStage,
    contact_name: d.contact_name,
    contact_email: d.contact_email,
    next_steps: d.next_steps,
  };
}

async function searchHubSpotDeals(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  limit: number
): Promise<DealResult[]> {
  const hubspotClient = await getHubSpotClientForOrg(supabase, orgId);
  if (!hubspotClient) return [];

  try {
    const result = await hubspotClient.request<any>({
      method: 'POST',
      path: '/crm/v3/objects/deals/search',
      body: {
        query,
        properties: ['dealname', 'amount', 'dealstage', 'closedate', 'pipeline'],
        limit,
      },
    });

    return (result?.results || []).map((d: any) => ({
      id: `hs_${d.id}`,
      name: d.properties?.dealname || 'Untitled Deal',
      company: null, // HubSpot deals don't directly have company
      value: parseFloat(d.properties?.amount || '0'),
      stage: d.properties?.dealstage || null,
      stage_name: null,
      expected_close_date: d.properties?.closedate || null,
      source: 'hubspot' as const,
    }));
  } catch (e) {
    console.error('HubSpot deal search error:', e);
    return [];
  }
}

function calculateDealConfidence(results: DealResult[], query: string): number {
  if (results.length === 0) return 0;

  const bestMatch = results[0];
  const name = bestMatch.name?.toLowerCase() || '';
  const company = bestMatch.company?.toLowerCase() || '';

  // Exact name match
  if (name === query) return 1.0;

  // Name starts with query
  if (name.startsWith(query)) return 0.9;

  // Name contains query
  if (name.includes(query)) return 0.75;

  // Company match
  if (company === query) return 0.85;
  if (company.includes(query)) return 0.6;

  // Has results but weak match
  return 0.3;
}

function mergeAndDedupeDeals(
  sixtyResults: DealResult[],
  hubspotResults: DealResult[]
): DealResult[] {
  const seen = new Set<string>();
  const merged: DealResult[] = [];

  // Sixty results first (preferred)
  for (const deal of sixtyResults) {
    const key = deal.name?.toLowerCase() || deal.id;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(deal);
    }
  }

  // Add HubSpot results that aren't duplicates (by name)
  for (const deal of hubspotResults) {
    const key = deal.name?.toLowerCase() || deal.id;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(deal);
    }
  }

  return merged;
}

function rankDeals(deals: DealResult[]): DealResult[] {
  return deals.sort((a, b) => {
    // Sixty source preferred
    if (a.source !== b.source) {
      return a.source === 'sixty' ? -1 : 1;
    }

    // Higher value preferred
    if (a.value !== b.value) {
      return b.value - a.value;
    }

    // Closer expected close date preferred
    if (a.expected_close_date && b.expected_close_date) {
      return new Date(a.expected_close_date).getTime() - new Date(b.expected_close_date).getTime();
    }
    if (a.expected_close_date) return -1;
    if (b.expected_close_date) return 1;

    // Higher probability preferred
    if (a.probability && b.probability) {
      return b.probability - a.probability;
    }

    return 0;
  });
}

// ============================================================================
// Quick Lookup Functions (for known entities)
// ============================================================================

/**
 * Get a contact by ID (Sixty DB only)
 */
export async function getContactById(
  supabase: SupabaseClient,
  contactId: string
): Promise<ContactResult | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select(`
      id,
      email,
      first_name,
      last_name,
      full_name,
      phone,
      title,
      company,
      last_interaction_at,
      health_score,
      engagement_level,
      total_meetings_count
    `)
    .eq('id', contactId)
    .maybeSingle();

  if (error || !data) return null;

  const enriched = await enrichContactsWithDeals(supabase, [data]);
  const c = enriched[0];

  return {
    id: c.id,
    email: c.email,
    first_name: c.first_name,
    last_name: c.last_name,
    full_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    phone: c.phone,
    title: c.title,
    company: c.company,
    source: 'sixty',
    last_interaction_at: c.last_interaction_at,
    health_score: c.health_score,
    engagement_level: c.engagement_level,
    total_meetings_count: c.total_meetings_count,
    active_deal_id: c.active_deal_id,
    active_deal_name: c.active_deal_name,
    active_deal_value: c.active_deal_value,
  };
}

/**
 * Get a deal by ID (Sixty DB only)
 */
export async function getDealById(
  supabase: SupabaseClient,
  dealId: string
): Promise<DealResult | null> {
  const { data, error } = await supabase
    .from('deals')
    .select(`
      id,
      name,
      company,
      value,
      stage_id,
      expected_close_date,
      probability,
      contact_name,
      contact_email,
      next_steps,
      stage_changed_at,
      deal_stages ( name )
    `)
    .eq('id', dealId)
    .maybeSingle();

  if (error || !data) return null;

  return mapSixtyDeal(data);
}
