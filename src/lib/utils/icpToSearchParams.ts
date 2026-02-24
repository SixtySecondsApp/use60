/**
 * ICP Criteria to Provider Search Params Mapping
 *
 * Converts ICPCriteria (provider-agnostic) to the specific search parameter
 * formats expected by Apollo and AI Ark search services.
 */

import type { ICPCriteria, ICPTargetProvider } from '@/lib/types/prospecting';
import type { ApolloSearchParams } from '@/lib/services/apolloSearchService';
import type {
  AiArkCompanySearchParams,
  AiArkPeopleSearchParams,
} from '@/lib/services/aiArkSearchService';

// ---------------------------------------------------------------------------
// Apollo Mapping
// ---------------------------------------------------------------------------

export function toApolloSearchParams(criteria: ICPCriteria): ApolloSearchParams {
  const params: ApolloSearchParams = {};

  if (criteria.seniority_levels?.length) {
    params.person_seniorities = criteria.seniority_levels;
  }

  if (criteria.departments?.length) {
    params.person_departments = criteria.departments;
  }

  if (criteria.title_keywords?.length) {
    params.person_titles = criteria.title_keywords;
  }

  if (criteria.employee_ranges?.length) {
    // Apollo format: ["min,max", "min,max"]
    params.organization_num_employees_ranges = criteria.employee_ranges.map(
      (r) => `${r.min},${r.max}`
    );
  }

  if (criteria.funding_stages?.length) {
    params.organization_latest_funding_stage_cd = criteria.funding_stages;
  }

  // Industries and technology keywords map to keyword tags
  const tags: string[] = [];
  if (criteria.industries?.length) {
    tags.push(...criteria.industries);
  }
  if (criteria.technology_keywords?.length) {
    tags.push(...criteria.technology_keywords);
  }
  if (tags.length > 0) {
    params.q_organization_keyword_tags = tags;
  }

  // Custom keywords as general query
  if (criteria.custom_keywords?.length) {
    params.q_keywords = criteria.custom_keywords.join(' ');
  }

  // Location mapping — combine countries, regions, cities into person_locations
  const locations: string[] = [];
  if (criteria.location_countries?.length) locations.push(...criteria.location_countries);
  if (criteria.location_regions?.length) locations.push(...criteria.location_regions);
  if (criteria.location_cities?.length) locations.push(...criteria.location_cities);
  if (locations.length > 0) {
    params.person_locations = locations;
  }

  return params;
}

// ---------------------------------------------------------------------------
// AI Ark Mapping (People Search)
// ---------------------------------------------------------------------------

export function toAiArkPeopleSearchParams(criteria: ICPCriteria): AiArkPeopleSearchParams {
  const params: AiArkPeopleSearchParams = {};

  if (criteria.title_keywords?.length) {
    params.job_title = criteria.title_keywords;
  }

  if (criteria.seniority_levels?.length) {
    params.seniority_level = criteria.seniority_levels;
  }

  // Location — combine all location fields
  const locations: string[] = [];
  if (criteria.location_countries?.length) locations.push(...criteria.location_countries);
  if (criteria.location_regions?.length) locations.push(...criteria.location_regions);
  if (criteria.location_cities?.length) locations.push(...criteria.location_cities);
  if (locations.length > 0) {
    params.location = locations;
  }

  return params;
}

// ---------------------------------------------------------------------------
// AI Ark Mapping (Company Search)
// ---------------------------------------------------------------------------

export function toAiArkCompanySearchParams(criteria: ICPCriteria): AiArkCompanySearchParams {
  const params: AiArkCompanySearchParams = {};

  if (criteria.industries?.length) {
    params.industry = criteria.industries;
  }

  if (criteria.employee_ranges?.length) {
    // Use first range for min/max
    const range = criteria.employee_ranges[0];
    params.employee_min = range.min;
    params.employee_max = range.max;
  }

  if (criteria.technology_keywords?.length) {
    params.technologies = criteria.technology_keywords;
  }

  if (criteria.custom_keywords?.length) {
    params.keywords = criteria.custom_keywords;
  }

  if (criteria.revenue_range) {
    params.revenue_min = criteria.revenue_range.min;
    params.revenue_max = criteria.revenue_range.max;
  }

  // Location
  const locations: string[] = [];
  if (criteria.location_countries?.length) locations.push(...criteria.location_countries);
  if (criteria.location_regions?.length) locations.push(...criteria.location_regions);
  if (criteria.location_cities?.length) locations.push(...criteria.location_cities);
  if (locations.length > 0) {
    params.location = locations;
  }

  return params;
}

// ---------------------------------------------------------------------------
// Convenience: auto-select based on target_provider
// ---------------------------------------------------------------------------

export interface SearchParamsResult {
  apollo?: ApolloSearchParams;
  aiArkPeople?: AiArkPeopleSearchParams;
  aiArkCompany?: AiArkCompanySearchParams;
}

export function toSearchParams(
  criteria: ICPCriteria,
  targetProvider: ICPTargetProvider
): SearchParamsResult {
  const result: SearchParamsResult = {};

  if (targetProvider === 'apollo' || targetProvider === 'both') {
    result.apollo = toApolloSearchParams(criteria);
  }

  if (targetProvider === 'ai_ark' || targetProvider === 'both') {
    result.aiArkPeople = toAiArkPeopleSearchParams(criteria);
    result.aiArkCompany = toAiArkCompanySearchParams(criteria);
  }

  return result;
}
