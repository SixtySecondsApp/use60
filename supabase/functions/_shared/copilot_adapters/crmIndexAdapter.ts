/**
 * CRM Index Adapter
 *
 * Provides fast search capabilities over crm_contact_index and crm_company_index
 * tables without materializing full CRM records.
 *
 * Used by copilot-autonomous for lightweight CRM search before materialization.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;

// Result helper functions (matches dbAdapters.ts pattern)
function ok(data: unknown) {
  return { success: true as const, data };
}

function fail(error: string) {
  return { success: false as const, error };
}

// =============================================================================
// Contact Index Search
// =============================================================================

export interface SearchCrmContactsParams {
  query?: string;          // Full-text search across name, email, company, title
  email?: string;          // Exact email lookup
  name?: string;           // Name search (first or last)
  company?: string;        // Company name filter
  jobTitle?: string;       // Job title filter
  lifecycleStage?: string; // Lifecycle stage filter
  hasActiveDeal?: boolean; // Deal association filter
  limit?: number;          // Default 25, max 100
}

export interface CrmContactIndexRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  company_domain: string | null;
  job_title: string | null;
  lifecycle_stage: string | null;
  lead_status: string | null;
  owner_crm_id: string | null;
  has_active_deal: boolean;
  deal_stage: string | null;
  deal_value: number | null;
  is_materialized: boolean;
  materialized_contact_id: string | null;
  crm_source: string;
  crm_record_id: string;
}

/**
 * Search CRM contact index
 * Uses the lightweight crm_contact_index table for fast searches
 */
export async function searchCrmContacts(
  svc: SupabaseClient,
  orgId: string,
  params: SearchCrmContactsParams
): Promise<{ success: true; data: CrmContactIndexRecord[] } | { success: false; error: string }> {
  try {
    const limit = Math.min(params.limit || 25, 100);

    // Full-text search has priority over individual field filters
    if (params.query) {
      // Use OR conditions for broader full-text search
      const term = `%${params.query}%`;

      let q = svc
        .from('crm_contact_index')
        .select('id, first_name, last_name, full_name, email, phone, company_name, company_domain, job_title, lifecycle_stage, lead_status, owner_crm_id, has_active_deal, deal_stage, deal_value, is_materialized, materialized_contact_id, crm_source, crm_record_id')
        .eq('org_id', orgId)
        .or(`first_name.ilike.${term},last_name.ilike.${term},full_name.ilike.${term},email.ilike.${term},company_name.ilike.${term},job_title.ilike.${term}`)
        .limit(limit)
        .order('updated_at', { ascending: false });

      const { data, error } = await q;

      if (error) {
        console.error('[searchCrmContacts] Full-text search error:', error);
        return fail(`CRM index search failed: ${error.message}`);
      }

      return ok(data || []);
    }

    // Individual field filters
    let q = svc
      .from('crm_contact_index')
      .select('id, first_name, last_name, full_name, email, phone, company_name, company_domain, job_title, lifecycle_stage, lead_status, owner_crm_id, has_active_deal, deal_stage, deal_value, is_materialized, materialized_contact_id, crm_source, crm_record_id')
      .eq('org_id', orgId);

    // Apply specific filters
    if (params.email) {
      q = q.ilike('email', params.email);
    }

    if (params.name) {
      // Search first_name or last_name
      q = q.or(`first_name.ilike.%${params.name}%,last_name.ilike.%${params.name}%`);
    }

    if (params.company) {
      q = q.ilike('company_name', `%${params.company}%`);
    }

    if (params.jobTitle) {
      q = q.ilike('job_title', `%${params.jobTitle}%`);
    }

    if (params.lifecycleStage) {
      q = q.eq('lifecycle_stage', params.lifecycleStage);
    }

    if (params.hasActiveDeal !== undefined) {
      q = q.eq('has_active_deal', params.hasActiveDeal);
    }

    q = q.limit(limit).order('updated_at', { ascending: false });

    const { data, error } = await q;

    if (error) {
      console.error('[searchCrmContacts] Search error:', error);
      return fail(`CRM index search failed: ${error.message}`);
    }

    return ok(data || []);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[searchCrmContacts] Exception:', err);
    return fail(`CRM index search failed: ${errMsg}`);
  }
}

// =============================================================================
// Company Index Search
// =============================================================================

export interface SearchCrmCompaniesParams {
  query?: string;   // Full-text search across name and domain
  name?: string;    // Company name filter
  domain?: string;  // Domain filter
  industry?: string; // Industry filter
  limit?: number;   // Default 25, max 100
}

export interface CrmCompanyIndexRecord {
  id: string;
  name: string | null;
  domain: string | null;
  industry: string | null;
  employee_count: string | null;
  annual_revenue: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  is_materialized: boolean;
  materialized_company_id: string | null;
  crm_source: string;
  crm_record_id: string;
}

/**
 * Search CRM company index
 * Uses the lightweight crm_company_index table for fast searches
 */
export async function searchCrmCompanies(
  svc: SupabaseClient,
  orgId: string,
  params: SearchCrmCompaniesParams
): Promise<{ success: true; data: CrmCompanyIndexRecord[] } | { success: false; error: string }> {
  try {
    const limit = Math.min(params.limit || 25, 100);

    // Full-text search
    if (params.query) {
      const term = `%${params.query}%`;

      let q = svc
        .from('crm_company_index')
        .select('id, name, domain, industry, employee_count, annual_revenue, city, state, country, is_materialized, materialized_company_id, crm_source, crm_record_id')
        .eq('org_id', orgId)
        .or(`name.ilike.${term},domain.ilike.${term},industry.ilike.${term}`)
        .limit(limit)
        .order('updated_at', { ascending: false });

      const { data, error } = await q;

      if (error) {
        console.error('[searchCrmCompanies] Full-text search error:', error);
        return fail(`CRM company search failed: ${error.message}`);
      }

      return ok(data || []);
    }

    // Individual field filters
    let q = svc
      .from('crm_company_index')
      .select('id, name, domain, industry, employee_count, annual_revenue, city, state, country, is_materialized, materialized_company_id, crm_source, crm_record_id')
      .eq('org_id', orgId);

    if (params.name) {
      q = q.ilike('name', `%${params.name}%`);
    }

    if (params.domain) {
      q = q.ilike('domain', `%${params.domain}%`);
    }

    if (params.industry) {
      q = q.ilike('industry', `%${params.industry}%`);
    }

    q = q.limit(limit).order('updated_at', { ascending: false });

    const { data, error } = await q;

    if (error) {
      console.error('[searchCrmCompanies] Search error:', error);
      return fail(`CRM company search failed: ${error.message}`);
    }

    return ok(data || []);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[searchCrmCompanies] Exception:', err);
    return fail(`CRM company search failed: ${errMsg}`);
  }
}

// =============================================================================
// Deal Index Search
// =============================================================================

export interface SearchCrmDealsParams {
  query?: string;     // Full-text search across deal name
  stage?: string;     // Deal stage filter
  pipeline?: string;  // Pipeline filter
  minAmount?: number; // Minimum deal amount
  limit?: number;     // Default 25, max 100
}

export interface CrmDealIndexRecord {
  id: string;
  name: string | null;
  stage: string | null;
  pipeline: string | null;
  amount: number | null;
  close_date: string | null;
  owner_crm_id: string | null;
  company_crm_id: string | null;
  contact_crm_ids: string[] | null;
  is_materialized: boolean;
  materialized_deal_id: string | null;
  crm_source: string;
  crm_record_id: string;
}

/**
 * Search CRM deal index
 * Uses the lightweight crm_deal_index table for fast searches
 */
export async function searchCrmDeals(
  svc: SupabaseClient,
  orgId: string,
  params: SearchCrmDealsParams
): Promise<{ success: true; data: CrmDealIndexRecord[] } | { success: false; error: string }> {
  try {
    const limit = Math.min(params.limit || 25, 100);

    // Full-text search
    if (params.query) {
      const term = `%${params.query}%`;

      let q = svc
        .from('crm_deal_index')
        .select('id, name, stage, pipeline, amount, close_date, owner_crm_id, company_crm_id, contact_crm_ids, is_materialized, materialized_deal_id, crm_source, crm_record_id')
        .eq('org_id', orgId)
        .ilike('name', term)
        .limit(limit)
        .order('updated_at', { ascending: false });

      const { data, error } = await q;

      if (error) {
        console.error('[searchCrmDeals] Full-text search error:', error);
        return fail(`CRM deal search failed: ${error.message}`);
      }

      return ok(data || []);
    }

    // Individual field filters
    let q = svc
      .from('crm_deal_index')
      .select('id, name, stage, pipeline, amount, close_date, owner_crm_id, company_crm_id, contact_crm_ids, is_materialized, materialized_deal_id, crm_source, crm_record_id')
      .eq('org_id', orgId);

    if (params.stage) {
      q = q.eq('stage', params.stage);
    }

    if (params.pipeline) {
      q = q.eq('pipeline', params.pipeline);
    }

    if (params.minAmount !== undefined) {
      q = q.gte('amount', params.minAmount);
    }

    q = q.limit(limit).order('updated_at', { ascending: false });

    const { data, error } = await q;

    if (error) {
      console.error('[searchCrmDeals] Search error:', error);
      return fail(`CRM deal search failed: ${error.message}`);
    }

    return ok(data || []);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[searchCrmDeals] Exception:', err);
    return fail(`CRM deal search failed: ${errMsg}`);
  }
}
