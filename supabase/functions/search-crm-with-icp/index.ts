// supabase/functions/search-crm-with-icp/index.ts
// Search internal CRM index tables with ICP criteria
// Returns existing CRM contacts and companies matching ICP profile

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { logFlatRateCostEvent } from '../_shared/costTracking.ts'

interface ICPCriteria {
  industries?: string[];
  employee_ranges?: { min: number; max: number }[];
  seniority_levels?: string[];
  departments?: string[];
  title_keywords?: string[];
  location_countries?: string[];
  location_regions?: string[];
  location_cities?: string[];
  technology_keywords?: string[];
  revenue_range?: { min: number; max: number };
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const startTime = Date.now();

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Unauthorized', req, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return errorResponse('Unauthorized', req, 401);

    // Parse body
    const body = await req.json();
    const { org_id, criteria, page = 1, per_page = 25, icp_profile_id, profile_type, parent_icp_id } = body;

    if (!org_id) return errorResponse('org_id required', req, 400);
    if (!criteria) return errorResponse('criteria required', req, 400);

    // Verify org membership
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) return errorResponse('Not a member of this organization', req, 403);

    const offset = (page - 1) * per_page;
    const limit = Math.min(per_page, 200); // Max 200 per page

    // Auto-chain: if persona has parent_icp_id, fetch parent ICP criteria
    let parentCriteria: ICPCriteria | null = null;
    let searchChained = false;

    if (profile_type === 'persona' && parent_icp_id) {
      const { data: parentICP, error: parentError } = await supabase
        .from('icp_profiles')
        .select('criteria')
        .eq('id', parent_icp_id)
        .eq('organization_id', org_id)
        .maybeSingle();

      if (parentError) {
        console.warn('[search-crm-with-icp] Failed to fetch parent ICP:', parentError);
      } else if (parentICP) {
        parentCriteria = parentICP.criteria as ICPCriteria;
        searchChained = true;
        console.log(`[search-crm-with-icp] Chaining persona search with parent ICP: ${parent_icp_id}`);
      }
    }

    // Build query against crm_contact_index
    let contactQuery = supabase
      .from('crm_contact_index')
      .select('id, crm_source, crm_record_id, email, first_name, last_name, full_name, job_title, company_name, company_domain, phone, lifecycle_stage, lead_status, has_active_deal, deal_stage, deal_value, is_materialized, materialized_contact_id, crm_created_at, crm_updated_at')
      .eq('org_id', org_id);

    // Apply criteria filters with OR conditions
    const contactOrConditions: string[] = [];

    if (criteria.title_keywords?.length) {
      criteria.title_keywords.forEach((kw: string) => {
        contactOrConditions.push(`job_title.ilike.%${kw}%`);
      });
    }

    if (criteria.seniority_levels?.length) {
      criteria.seniority_levels.forEach((level: string) => {
        contactOrConditions.push(`job_title.ilike.%${level}%`);
      });
    }

    if (criteria.departments?.length) {
      criteria.departments.forEach((dept: string) => {
        contactOrConditions.push(`job_title.ilike.%${dept}%`);
      });
    }

    if (criteria.industries?.length) {
      // Match industry via company_name (best we can do without full company join)
      criteria.industries.forEach((ind: string) => {
        contactOrConditions.push(`company_name.ilike.%${ind}%`);
      });
    }

    // Apply OR filter if we have conditions
    if (contactOrConditions.length > 0) {
      contactQuery = contactQuery.or(contactOrConditions.join(','));
    }

    // Build query against crm_company_index
    // When chaining, use parentCriteria for company filters; otherwise use criteria
    let companyQuery = supabase
      .from('crm_company_index')
      .select('id, crm_source, crm_record_id, name, domain, industry, employee_count, annual_revenue, city, state, country, is_materialized, materialized_company_id, crm_updated_at')
      .eq('org_id', org_id);

    const companyOrConditions: string[] = [];
    const companyCriteria = parentCriteria || criteria;

    if (companyCriteria.industries?.length) {
      companyCriteria.industries.forEach((ind: string) => {
        companyOrConditions.push(`industry.ilike.%${ind}%`);
      });
    }

    if (companyCriteria.employee_ranges?.length) {
      // employee_count is TEXT like "1-10", "11-50", etc.
      companyCriteria.employee_ranges.forEach((range: { min: number; max: number }) => {
        if (range.min <= 10 && range.max >= 10) companyOrConditions.push(`employee_count.ilike.%1-10%`);
        if (range.min <= 50 && range.max >= 50) companyOrConditions.push(`employee_count.ilike.%11-50%`);
        if (range.min <= 200 && range.max >= 200) companyOrConditions.push(`employee_count.ilike.%51-200%`);
        if (range.min <= 500 && range.max >= 500) companyOrConditions.push(`employee_count.ilike.%201-500%`);
        if (range.min <= 1000 && range.max >= 1000) companyOrConditions.push(`employee_count.ilike.%501-1000%`);
        if (range.min <= 5000 && range.max >= 5000) companyOrConditions.push(`employee_count.ilike.%1001-5000%`);
        if (range.max > 5000) companyOrConditions.push(`employee_count.ilike.%5001+%`);
      });
    }

    if (companyCriteria.location_countries?.length) {
      companyCriteria.location_countries.forEach((country: string) => {
        companyOrConditions.push(`country.ilike.%${country}%`);
      });
    }

    if (companyCriteria.location_cities?.length) {
      companyCriteria.location_cities.forEach((city: string) => {
        companyOrConditions.push(`city.ilike.%${city}%`);
      });
    }

    if (companyCriteria.technology_keywords?.length) {
      // Search in raw_properties JSONB
      companyCriteria.technology_keywords.forEach((tech: string) => {
        companyOrConditions.push(`raw_properties::text.ilike.%${tech}%`);
      });
    }

    // Apply OR filter if we have conditions
    if (companyOrConditions.length > 0) {
      companyQuery = companyQuery.or(companyOrConditions.join(','));
    }

    // Apply revenue range filter (AND condition)
    if (companyCriteria.revenue_range) {
      if (companyCriteria.revenue_range.min !== undefined) {
        companyQuery = companyQuery.gte('annual_revenue', companyCriteria.revenue_range.min);
      }
      if (companyCriteria.revenue_range.max !== undefined) {
        companyQuery = companyQuery.lte('annual_revenue', companyCriteria.revenue_range.max);
      }
    }

    // Determine which query to run based on profile_type
    let results: any[] = [];

    if (profile_type === 'persona') {
      // Persona (buyer personas) - search contacts, optionally chained with parent ICP company filtering

      if (searchChained && parentCriteria) {
        // Step 1: Find matching companies using parent ICP firmographic criteria
        const companyResult = await companyQuery
          .order('crm_updated_at', { ascending: false, nullsFirst: false })
          .limit(500); // Get up to 500 companies to search within

        if (companyResult.error) {
          console.error('[search-crm-with-icp] Chained company query error:', companyResult.error);
          throw companyResult.error;
        }

        const matchedCompanyDomains = (companyResult.data || [])
          .map((c: any) => c.domain)
          .filter((d: string) => d && d.trim());

        console.log(`[search-crm-with-icp] Found ${matchedCompanyDomains.length} companies matching parent ICP`);

        // Step 2: Search contacts within matched companies using persona criteria
        if (matchedCompanyDomains.length > 0) {
          // Apply company domain filter
          contactQuery = contactQuery.in('company_domain', matchedCompanyDomains);

          const contactResult = await contactQuery
            .order('crm_updated_at', { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);

          if (contactResult.error) {
            console.error('[search-crm-with-icp] Chained contact query error:', contactResult.error);
            throw contactResult.error;
          }

          // Map to ProspectingSearchResult format
          results = (contactResult.data || []).map((c: any) => ({
            name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            first_name: c.first_name,
            last_name: c.last_name,
            email: c.email,
            title: c.job_title,
            organization_name: c.company_name,
            domain: c.company_domain,
            phone: c.phone,
            linkedin_url: null,
            headline: c.job_title,
            lead_origin: 'crm',
            crm_source: c.crm_source,
            crm_record_id: c.crm_record_id,
            is_materialized: c.is_materialized,
            materialized_contact_id: c.materialized_contact_id,
            lifecycle_stage: c.lifecycle_stage,
            lead_status: c.lead_status,
            has_active_deal: c.has_active_deal,
            deal_stage: c.deal_stage,
            deal_value: c.deal_value,
          }));

          console.log(`[search-crm-with-icp] Chained search returned ${results.length} contacts`);
        } else {
          console.log('[search-crm-with-icp] No companies matched parent ICP criteria, returning empty results');
        }
      } else {
        // Direct persona search (no parent) - search contacts only
        const contactResult = await contactQuery
          .order('crm_updated_at', { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);

        if (contactResult.error) {
          console.error('[search-crm-with-icp] Contact query error:', contactResult.error);
          throw contactResult.error;
        }

        // Map to ProspectingSearchResult format
        results = (contactResult.data || []).map((c: any) => ({
          name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          title: c.job_title,
          organization_name: c.company_name,
          domain: c.company_domain,
          phone: c.phone,
          linkedin_url: null,
          headline: c.job_title,
          lead_origin: 'crm',
          crm_source: c.crm_source,
          crm_record_id: c.crm_record_id,
          is_materialized: c.is_materialized,
          materialized_contact_id: c.materialized_contact_id,
          lifecycle_stage: c.lifecycle_stage,
          lead_status: c.lead_status,
          has_active_deal: c.has_active_deal,
          deal_stage: c.deal_stage,
          deal_value: c.deal_value,
        }));
      }
    } else {
      // ICP (company profiles) - search companies only
      const companyResult = await companyQuery
        .order('crm_updated_at', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (companyResult.error) {
        console.error('[search-crm-with-icp] Company query error:', companyResult.error);
        throw companyResult.error;
      }

      // Map to ProspectingSearchResult format
      results = (companyResult.data || []).map((c: any) => ({
        name: c.name,
        organization_name: c.name,
        domain: c.domain,
        industry: c.industry,
        employee_count: c.employee_count,
        annual_revenue: c.annual_revenue,
        city: c.city,
        state: c.state,
        country: c.country,
        lead_origin: 'crm',
        crm_source: c.crm_source,
        crm_record_id: c.crm_record_id,
        is_materialized: c.is_materialized,
        materialized_company_id: c.materialized_company_id,
      }));
    }

    const durationMs = Date.now() - startTime;

    // Log flat-rate cost event for CRM search (0 credits — CRM search is free, tracked for analytics)
    logFlatRateCostEvent(supabase, user.id, org_id, 'crm', 'search-crm-with-icp', 0, 'research_enrichment').catch(() => {});

    // Return in ProspectingSearchResult shape
    return jsonResponse({
      results,
      total_results: results.length,
      credits_consumed: 0, // CRM search is free
      page,
      per_page: limit,
      has_more: results.length === limit,
      provider: 'crm',
      duration_ms: durationMs,
      icp_profile_id: icp_profile_id || null,
      search_chained: searchChained, // Telemetry: was this a chained ICP→persona search?
      parent_icp_id: searchChained ? parent_icp_id : null,
    }, req);

  } catch (err: any) {
    console.error('[search-crm-with-icp] Error:', err);
    return errorResponse(err.message || 'Internal error', req, 500);
  }
});
