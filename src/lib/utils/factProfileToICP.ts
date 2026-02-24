import type { FactProfileResearchData } from '@/lib/types/factProfile';
import type { ICPCriteria } from '@/lib/types/prospecting';

/**
 * Convert fact profile research data into ICP criteria for prospect search.
 * Maps ideal_customer_indicators, market_position, technology, and team data
 * into the ICPCriteria format.
 */
export function factProfileToICPCriteria(researchData: FactProfileResearchData): Partial<ICPCriteria> {
  const criteria: Partial<ICPCriteria> = {};
  const icp = researchData?.ideal_customer_indicators;
  const market = researchData?.market_position;
  const tech = researchData?.technology;
  const teamData = researchData?.team_leadership;

  // Industries: combine target_industries + market industry
  const industries: string[] = [];
  if (icp?.target_industries?.length) industries.push(...icp.target_industries);
  if (market?.industry && !industries.includes(market.industry)) industries.push(market.industry);
  if (market?.sub_industries?.length) {
    for (const sub of market.sub_industries) {
      if (!industries.includes(sub)) industries.push(sub);
    }
  }
  if (industries.length) criteria.industries = industries;

  // Employee ranges: parse target_company_sizes like "SMB", "Mid-Market", "Enterprise", "51-200", "201-500"
  if (icp?.target_company_sizes?.length) {
    criteria.employee_ranges = parseEmployeeRanges(icp.target_company_sizes);
  }

  // Title keywords: from target_roles
  if (icp?.target_roles?.length) {
    criteria.title_keywords = icp.target_roles;
    criteria.title_search_mode = 'smart';
  }

  // Technology keywords: from tech_stack
  if (tech?.tech_stack?.length) {
    criteria.technology_keywords = tech.tech_stack;
  }

  // Custom keywords: from buying_signals + pain_points
  const customKeywords: string[] = [];
  if (icp?.buying_signals?.length) customKeywords.push(...icp.buying_signals);
  if (icp?.pain_points?.length) customKeywords.push(...icp.pain_points);
  if (customKeywords.length) criteria.custom_keywords = customKeywords;

  // Departments: from team departments (for seniority matching)
  if (teamData?.departments?.length) {
    criteria.departments = teamData.departments;
  }

  return criteria;
}

// Helper: parse company size strings into employee range objects
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
    // Check named ranges first
    if (sizeMap[lower]) {
      ranges.push(sizeMap[lower]);
      continue;
    }
    // Try numeric range like "51-200" or "201-500"
    const match = lower.match(/(\d+)\s*[-\u2013]\s*(\d+)/);
    if (match) {
      ranges.push({ min: parseInt(match[1], 10), max: parseInt(match[2], 10) });
      continue;
    }
    // Try single number like "1000+"
    const singleMatch = lower.match(/(\d+)\+?/);
    if (singleMatch) {
      const num = parseInt(singleMatch[1], 10);
      ranges.push({ min: num, max: num * 10 });
    }
  }
  return ranges;
}
