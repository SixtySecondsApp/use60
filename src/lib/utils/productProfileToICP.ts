import type { ProductProfileResearchData } from '@/lib/types/productProfile';
import type { FactProfileResearchData } from '@/lib/types/factProfile';
import type { ICPCriteria } from '@/lib/types/prospecting';

/**
 * Convert product profile research data into ICP criteria for prospect search.
 * Maps target_market, integrations, pain_points_solved, and use_cases data
 * into the ICPCriteria format.
 */
export function productProfileToICPCriteria(researchData: ProductProfileResearchData): Partial<ICPCriteria> {
  const criteria: Partial<ICPCriteria> = {};
  const targetMarket = researchData?.target_market;
  const integrations = researchData?.integrations;
  const painPoints = researchData?.pain_points_solved;
  const useCases = researchData?.use_cases;

  // Industries: from target_market.industries
  if (targetMarket?.industries?.length) {
    criteria.industries = targetMarket.industries;
  }

  // Employee ranges: parse target_market.company_sizes
  if (targetMarket?.company_sizes?.length) {
    criteria.employee_ranges = parseEmployeeRanges(targetMarket.company_sizes);
  }

  // Title keywords: from target_market.buyer_personas
  if (targetMarket?.buyer_personas?.length) {
    criteria.title_keywords = targetMarket.buyer_personas;
    criteria.title_search_mode = 'smart';
  }

  // Location regions: from target_market.regions
  if (targetMarket?.regions?.length) {
    criteria.location_regions = targetMarket.regions;
  }

  // Technology keywords: from integrations.platforms
  if (integrations?.platforms?.length) {
    criteria.technology_keywords = integrations.platforms;
  }

  // Custom keywords: from pain_points + use_case personas
  const customKeywords: string[] = [];
  if (painPoints?.pain_points?.length) {
    for (const pp of painPoints.pain_points) {
      if (pp.pain) customKeywords.push(pp.pain);
    }
  }
  if (useCases?.primary_use_cases?.length) {
    for (const uc of useCases.primary_use_cases) {
      if (uc.persona && !customKeywords.includes(uc.persona)) customKeywords.push(uc.persona);
    }
  }
  if (customKeywords.length) criteria.custom_keywords = customKeywords;

  return criteria;
}

/**
 * Merge fact profile and product profile research into combined ICP criteria.
 * Product profile data takes precedence where both provide the same field.
 */
export function combinedProfileToICPCriteria(
  factResearch: FactProfileResearchData,
  productResearch: ProductProfileResearchData,
): Partial<ICPCriteria> {
  // Import inline to avoid circular — factProfileToICP is a sibling utility
  // We replicate the mapping here since the function is simple and co-located
  const factCriteria = factResearchToICPCriteria(factResearch);
  const productCriteria = productProfileToICPCriteria(productResearch);

  // Product takes precedence — merge arrays, product overwrites scalars
  return {
    industries: mergeArrays(productCriteria.industries, factCriteria.industries),
    employee_ranges: productCriteria.employee_ranges ?? factCriteria.employee_ranges,
    title_keywords: mergeArrays(productCriteria.title_keywords, factCriteria.title_keywords),
    title_search_mode: productCriteria.title_search_mode ?? factCriteria.title_search_mode,
    location_regions: productCriteria.location_regions ?? factCriteria.location_regions,
    technology_keywords: mergeArrays(productCriteria.technology_keywords, factCriteria.technology_keywords),
    custom_keywords: mergeArrays(productCriteria.custom_keywords, factCriteria.custom_keywords),
    departments: factCriteria.departments, // only fact profile has this
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract ICP criteria from fact profile research (inline to avoid cross-import). */
function factResearchToICPCriteria(researchData: FactProfileResearchData): Partial<ICPCriteria> {
  const criteria: Partial<ICPCriteria> = {};
  const icp = researchData?.ideal_customer_indicators;
  const market = researchData?.market_position;
  const tech = researchData?.technology;
  const teamData = researchData?.team_leadership;

  const industries: string[] = [];
  if (icp?.target_industries?.length) industries.push(...icp.target_industries);
  if (market?.industry && !industries.includes(market.industry)) industries.push(market.industry);
  if (market?.sub_industries?.length) {
    for (const sub of market.sub_industries) {
      if (!industries.includes(sub)) industries.push(sub);
    }
  }
  if (industries.length) criteria.industries = industries;

  if (icp?.target_company_sizes?.length) {
    criteria.employee_ranges = parseEmployeeRanges(icp.target_company_sizes);
  }

  if (icp?.target_roles?.length) {
    criteria.title_keywords = icp.target_roles;
    criteria.title_search_mode = 'smart';
  }

  if (tech?.tech_stack?.length) {
    criteria.technology_keywords = tech.tech_stack;
  }

  const customKeywords: string[] = [];
  if (icp?.buying_signals?.length) customKeywords.push(...icp.buying_signals);
  if (icp?.pain_points?.length) customKeywords.push(...icp.pain_points);
  if (customKeywords.length) criteria.custom_keywords = customKeywords;

  if (teamData?.departments?.length) {
    criteria.departments = teamData.departments;
  }

  return criteria;
}

/** Parse company size strings into employee range objects. */
function parseEmployeeRanges(sizes: string[]): { min: number; max: number }[] {
  const ranges: { min: number; max: number }[] = [];
  const sizeMap: Record<string, { min: number; max: number }> = {
    'micro': { min: 1, max: 10 },
    'small': { min: 11, max: 50 },
    'smb': { min: 1, max: 200 },
    'mid-market': { min: 201, max: 1000 },
    'midmarket': { min: 201, max: 1000 },
    'enterprise': { min: 1001, max: 100000 },
    'startup': { min: 1, max: 50 },
  };

  for (const size of sizes) {
    const lower = size.toLowerCase().trim();
    if (sizeMap[lower]) {
      ranges.push(sizeMap[lower]);
      continue;
    }
    const match = lower.match(/(\d+)\s*[-\u2013]\s*(\d+)/);
    if (match) {
      ranges.push({ min: parseInt(match[1], 10), max: parseInt(match[2], 10) });
      continue;
    }
    const singleMatch = lower.match(/(\d+)\+?/);
    if (singleMatch) {
      const num = parseInt(singleMatch[1], 10);
      ranges.push({ min: num, max: num * 10 });
    }
  }
  return ranges;
}

/** Merge two optional string arrays, deduplicating. Product (first) takes precedence in ordering. */
function mergeArrays(primary?: string[], secondary?: string[]): string[] | undefined {
  if (!primary?.length && !secondary?.length) return undefined;
  if (!primary?.length) return secondary;
  if (!secondary?.length) return primary;
  const combined = [...primary];
  for (const item of secondary) {
    if (!combined.includes(item)) combined.push(item);
  }
  return combined;
}
