/**
 * ICP Fact Profile Alignment — compares ICP criteria against a fact profile's
 * research data and scores alignment per dimension.
 *
 * Each dimension is scored 0-100:
 *   match    (80-100): significant overlap
 *   partial  (40-79):  some overlap
 *   mismatch (0-39):   criteria diverge from fact profile
 *   no_data  (excluded): dimension not available in either source
 *
 * Overall score = weighted average of non-no_data dimensions.
 */

import type { ICPCriteria } from '@/lib/types/prospecting'
import type { FactProfileResearchData } from '@/lib/types/factProfile'
import type { ProductProfileResearchData } from '@/lib/types/productProfile'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlignmentStatus = 'match' | 'partial' | 'mismatch' | 'no_data'

export interface AlignmentDimension {
  dimension: string
  label: string
  score: number // 0-100
  status: AlignmentStatus
  icpValues: string[]
  factValues: string[]
  suggestion?: string
}

export interface AlignmentResult {
  overallScore: number // 0-100
  dimensions: AlignmentDimension[]
  verified: boolean // true if overall > 70
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Case-insensitive overlap percentage between two string arrays.
 * Returns a value 0-1 representing the fraction of `needles` found in `haystack`.
 */
function overlapPercentage(needles: string[], haystack: string[]): number {
  if (needles.length === 0) return 0
  const haystackLower = haystack.map((h) => h.toLowerCase().trim())
  let matched = 0
  for (const needle of needles) {
    const n = needle.toLowerCase().trim()
    if (haystackLower.some((h) => h.includes(n) || n.includes(h))) {
      matched++
    }
  }
  return matched / needles.length
}

/**
 * Convert overlap ratio (0-1) to a 0-100 score.
 */
function ratioToScore(ratio: number): number {
  return Math.round(ratio * 100)
}

/**
 * Derive status from a 0-100 score.
 */
function scoreToStatus(score: number): AlignmentStatus {
  if (score >= 80) return 'match'
  if (score >= 40) return 'partial'
  return 'mismatch'
}

/**
 * Parse an employee range string like "51-200" or "1,001-5,000" into a numeric range.
 * Returns null if the string cannot be parsed.
 */
function parseRangeString(rangeStr: string): { min: number; max: number } | null {
  const cleaned = rangeStr.replace(/,/g, '').trim()
  // Try "X-Y" pattern
  const dashMatch = cleaned.match(/(\d+)\s*[-\u2013]\s*(\d+)/)
  if (dashMatch) {
    return { min: parseInt(dashMatch[1], 10), max: parseInt(dashMatch[2], 10) }
  }
  // Try "X+" pattern
  const plusMatch = cleaned.match(/(\d+)\s*\+/)
  if (plusMatch) {
    return { min: parseInt(plusMatch[1], 10), max: Infinity }
  }
  // Try plain number
  const numMatch = cleaned.match(/^(\d+)$/)
  if (numMatch) {
    const n = parseInt(numMatch[1], 10)
    return { min: n, max: n }
  }
  return null
}

/**
 * Check if any ICP employee range overlaps with any fact profile size range.
 */
function rangesOverlap(
  icpRanges: { min: number; max: number }[],
  factRangeStrings: string[]
): { overlap: boolean; ratio: number } {
  if (icpRanges.length === 0 || factRangeStrings.length === 0) {
    return { overlap: false, ratio: 0 }
  }

  const factRanges = factRangeStrings
    .map(parseRangeString)
    .filter((r): r is { min: number; max: number } => r !== null)

  if (factRanges.length === 0) return { overlap: false, ratio: 0 }

  let matchedCount = 0
  for (const icpRange of icpRanges) {
    for (const factRange of factRanges) {
      if (icpRange.min <= factRange.max && icpRange.max >= factRange.min) {
        matchedCount++
        break
      }
    }
  }

  return {
    overlap: matchedCount > 0,
    ratio: matchedCount / icpRanges.length,
  }
}

/**
 * Format an employee range object as a human-readable string.
 */
function formatRange(range: { min: number; max: number }): string {
  if (range.max === Infinity || range.max >= 1_000_000) {
    return `${range.min.toLocaleString()}+`
  }
  return `${range.min.toLocaleString()}-${range.max.toLocaleString()}`
}

// ---------------------------------------------------------------------------
// Per-dimension alignment checkers
// ---------------------------------------------------------------------------

function checkIndustryAlignment(
  criteria: ICPCriteria,
  research: FactProfileResearchData
): AlignmentDimension | null {
  const icpIndustries = criteria.industries
  if (!icpIndustries || icpIndustries.length === 0) return null

  // Gather fact profile industries from ideal_customer_indicators + market_position
  const factIndustries: string[] = []
  if (research.ideal_customer_indicators?.target_industries?.length) {
    factIndustries.push(...research.ideal_customer_indicators.target_industries)
  }
  if (research.market_position?.industry) {
    factIndustries.push(research.market_position.industry)
  }
  if (research.market_position?.sub_industries?.length) {
    factIndustries.push(...research.market_position.sub_industries)
  }

  if (factIndustries.length === 0) {
    return {
      dimension: 'industry',
      label: 'Industry',
      score: 0,
      status: 'no_data',
      icpValues: icpIndustries,
      factValues: [],
      suggestion: 'Fact profile has no industry data to compare against',
    }
  }

  const ratio = overlapPercentage(icpIndustries, factIndustries)
  const score = ratioToScore(ratio)
  const status = scoreToStatus(score)

  const matchedTerms = icpIndustries.filter((needle) =>
    factIndustries.some(
      (h) =>
        h.toLowerCase().includes(needle.toLowerCase()) ||
        needle.toLowerCase().includes(h.toLowerCase())
    )
  )
  const unmatchedTerms = icpIndustries.filter(
    (needle) =>
      !factIndustries.some(
        (h) =>
          h.toLowerCase().includes(needle.toLowerCase()) ||
          needle.toLowerCase().includes(h.toLowerCase())
      )
  )

  let suggestion: string | undefined
  if (status === 'match') {
    suggestion = `Good match: ${matchedTerms.length} of ${icpIndustries.length} target industries align with fact profile`
  } else if (status === 'partial') {
    suggestion = `Partial overlap: ICP targets ${icpIndustries.join(', ')} but fact profile shows ${factIndustries.slice(0, 3).join(', ')} -- verify ${unmatchedTerms.join(', ')} is intentional`
  } else {
    suggestion = `ICP targets ${icpIndustries.join(', ')} but fact profile indicates ${factIndustries.slice(0, 3).join(', ')} -- significant industry mismatch`
  }

  return {
    dimension: 'industry',
    label: 'Industry',
    score,
    status,
    icpValues: icpIndustries,
    factValues: factIndustries,
    suggestion,
  }
}

function checkCompanySizeAlignment(
  criteria: ICPCriteria,
  research: FactProfileResearchData
): AlignmentDimension | null {
  const icpRanges = criteria.employee_ranges
  if (!icpRanges || icpRanges.length === 0) return null

  const factSizes = research.ideal_customer_indicators?.target_company_sizes ?? []

  if (factSizes.length === 0) {
    return {
      dimension: 'company_size',
      label: 'Company Size',
      score: 0,
      status: 'no_data',
      icpValues: icpRanges.map(formatRange),
      factValues: [],
      suggestion: 'Fact profile has no target company size data to compare against',
    }
  }

  const { ratio } = rangesOverlap(icpRanges, factSizes)
  const score = ratioToScore(ratio)
  const status = scoreToStatus(score)

  const icpLabels = icpRanges.map(formatRange)
  let suggestion: string | undefined
  if (status === 'match') {
    suggestion = `Good match: ICP size ranges (${icpLabels.join(', ')}) overlap with fact profile targets (${factSizes.join(', ')})`
  } else if (status === 'partial') {
    suggestion = `Some overlap: ICP targets ${icpLabels.join(', ')} employees but fact profile targets ${factSizes.join(', ')} -- partial size alignment`
  } else {
    suggestion = `ICP targets ${icpLabels.join(', ')} employees but fact profile targets ${factSizes.join(', ')} -- company size mismatch`
  }

  return {
    dimension: 'company_size',
    label: 'Company Size',
    score,
    status,
    icpValues: icpLabels,
    factValues: factSizes,
    suggestion,
  }
}

function checkRoleSeniorityAlignment(
  criteria: ICPCriteria,
  research: FactProfileResearchData
): AlignmentDimension | null {
  const icpTitles = criteria.title_keywords ?? []
  const icpSeniority = criteria.seniority_levels ?? []
  const icpRoleTerms = [...icpTitles, ...icpSeniority]

  if (icpRoleTerms.length === 0) return null

  const factRoles = research.ideal_customer_indicators?.target_roles ?? []

  if (factRoles.length === 0) {
    return {
      dimension: 'role_seniority',
      label: 'Role / Seniority',
      score: 0,
      status: 'no_data',
      icpValues: icpRoleTerms,
      factValues: [],
      suggestion: 'Fact profile has no target role data to compare against',
    }
  }

  const ratio = overlapPercentage(icpRoleTerms, factRoles)
  const score = ratioToScore(ratio)
  const status = scoreToStatus(score)

  const matchedTerms = icpRoleTerms.filter((needle) =>
    factRoles.some(
      (h) =>
        h.toLowerCase().includes(needle.toLowerCase()) ||
        needle.toLowerCase().includes(h.toLowerCase())
    )
  )

  let suggestion: string | undefined
  if (status === 'match') {
    suggestion = `Good match: ${matchedTerms.length} of ${icpRoleTerms.length} target roles align with fact profile's ideal customer roles`
  } else if (status === 'partial') {
    suggestion = `Partial overlap: ICP targets roles like ${icpRoleTerms.slice(0, 3).join(', ')} but fact profile shows ${factRoles.slice(0, 3).join(', ')}`
  } else {
    suggestion = `ICP targets roles like ${icpRoleTerms.slice(0, 3).join(', ')} but fact profile's ideal roles are ${factRoles.slice(0, 3).join(', ')} -- significant role mismatch`
  }

  return {
    dimension: 'role_seniority',
    label: 'Role / Seniority',
    score,
    status,
    icpValues: icpRoleTerms,
    factValues: factRoles,
    suggestion,
  }
}

function checkTechnologyAlignment(
  criteria: ICPCriteria,
  research: FactProfileResearchData
): AlignmentDimension | null {
  const icpTech = criteria.technology_keywords
  if (!icpTech || icpTech.length === 0) return null

  const factTech: string[] = []
  if (research.technology?.tech_stack?.length) {
    factTech.push(...research.technology.tech_stack)
  }
  if (research.technology?.platforms?.length) {
    factTech.push(...research.technology.platforms)
  }
  if (research.technology?.integrations?.length) {
    factTech.push(...research.technology.integrations)
  }

  if (factTech.length === 0) {
    return {
      dimension: 'technology',
      label: 'Technology',
      score: 0,
      status: 'no_data',
      icpValues: icpTech,
      factValues: [],
      suggestion: 'Fact profile has no technology data to compare against',
    }
  }

  const ratio = overlapPercentage(icpTech, factTech)
  const score = ratioToScore(ratio)
  const status = scoreToStatus(score)

  const matchedTech = icpTech.filter((needle) =>
    factTech.some(
      (h) =>
        h.toLowerCase().includes(needle.toLowerCase()) ||
        needle.toLowerCase().includes(h.toLowerCase())
    )
  )
  const unmatchedTech = icpTech.filter(
    (needle) =>
      !factTech.some(
        (h) =>
          h.toLowerCase().includes(needle.toLowerCase()) ||
          needle.toLowerCase().includes(h.toLowerCase())
      )
  )

  let suggestion: string | undefined
  if (status === 'match') {
    suggestion = `Good match: ${matchedTech.length} of ${icpTech.length} required technologies found in fact profile`
  } else if (status === 'partial') {
    suggestion = `ICP includes ${unmatchedTech.join(', ')} in tech requirements but fact profile tech stack doesn't include ${unmatchedTech.length === 1 ? 'it' : 'them'}`
  } else {
    suggestion = `ICP requires ${icpTech.join(', ')} but fact profile shows ${factTech.slice(0, 4).join(', ')} -- minimal technology overlap`
  }

  return {
    dimension: 'technology',
    label: 'Technology',
    score,
    status,
    icpValues: icpTech,
    factValues: factTech,
    suggestion,
  }
}

function checkDepartmentAlignment(
  criteria: ICPCriteria,
  research: FactProfileResearchData
): AlignmentDimension | null {
  const icpDepts = criteria.departments
  if (!icpDepts || icpDepts.length === 0) return null

  const factDepts = research.team_leadership?.departments ?? []

  if (factDepts.length === 0) {
    return {
      dimension: 'department',
      label: 'Department',
      score: 0,
      status: 'no_data',
      icpValues: icpDepts,
      factValues: [],
      suggestion: 'Fact profile has no department data to compare against',
    }
  }

  const ratio = overlapPercentage(icpDepts, factDepts)
  const score = ratioToScore(ratio)
  const status = scoreToStatus(score)

  let suggestion: string | undefined
  if (status === 'match') {
    suggestion = `Good match: target departments align well with fact profile's team structure`
  } else if (status === 'partial') {
    suggestion = `Some overlap: ICP targets ${icpDepts.join(', ')} but fact profile shows departments ${factDepts.slice(0, 4).join(', ')}`
  } else {
    suggestion = `ICP targets departments ${icpDepts.join(', ')} but fact profile shows ${factDepts.slice(0, 4).join(', ')} -- department mismatch`
  }

  return {
    dimension: 'department',
    label: 'Department',
    score,
    status,
    icpValues: icpDepts,
    factValues: factDepts,
    suggestion,
  }
}

// ---------------------------------------------------------------------------
// Main alignment function
// ---------------------------------------------------------------------------

const DIMENSION_CHECKERS = [
  checkIndustryAlignment,
  checkCompanySizeAlignment,
  checkRoleSeniorityAlignment,
  checkTechnologyAlignment,
  checkDepartmentAlignment,
]

/**
 * Compare ICP criteria against fact profile research data and score alignment
 * across all applicable dimensions.
 *
 * Dimensions with no data on either side are excluded from the overall score.
 * The overall score is the average of all scored dimensions (0-100).
 * `verified` is true when the overall score exceeds 70.
 */
export function checkICPFactProfileAlignment(
  criteria: ICPCriteria,
  researchData: FactProfileResearchData
): AlignmentResult {
  const dimensions: AlignmentDimension[] = []

  for (const checker of DIMENSION_CHECKERS) {
    const result = checker(criteria, researchData)
    if (result) {
      dimensions.push(result)
    }
  }

  // Calculate overall score as average of non-no_data dimensions
  const scoredDimensions = dimensions.filter((d) => d.status !== 'no_data')
  const overallScore =
    scoredDimensions.length > 0
      ? Math.round(
          scoredDimensions.reduce((sum, d) => sum + d.score, 0) /
            scoredDimensions.length
        )
      : 0

  return {
    overallScore,
    dimensions,
    verified: overallScore > 70,
  }
}

// ---------------------------------------------------------------------------
// Product profile dimension checkers
// ---------------------------------------------------------------------------

function checkIndustryAlignmentProduct(
  criteria: ICPCriteria,
  research: ProductProfileResearchData
): AlignmentDimension | null {
  const icpIndustries = criteria.industries
  if (!icpIndustries || icpIndustries.length === 0) return null

  const productIndustries = research.target_market?.industries ?? []

  if (productIndustries.length === 0) {
    return {
      dimension: 'industry',
      label: 'Industry',
      score: 0,
      status: 'no_data',
      icpValues: icpIndustries,
      factValues: [],
      suggestion: 'Product profile has no industry data to compare against',
    }
  }

  const ratio = overlapPercentage(icpIndustries, productIndustries)
  const score = ratioToScore(ratio)
  const status = scoreToStatus(score)

  let suggestion: string | undefined
  if (status === 'match') {
    suggestion = `Good match: ICP industries align with product target market`
  } else if (status === 'partial') {
    suggestion = `Partial overlap: ICP targets ${icpIndustries.join(', ')} but product targets ${productIndustries.slice(0, 3).join(', ')}`
  } else {
    suggestion = `ICP targets ${icpIndustries.join(', ')} but product targets ${productIndustries.slice(0, 3).join(', ')} -- significant industry mismatch`
  }

  return {
    dimension: 'industry',
    label: 'Industry',
    score,
    status,
    icpValues: icpIndustries,
    factValues: productIndustries,
    suggestion,
  }
}

function checkCompanySizeAlignmentProduct(
  criteria: ICPCriteria,
  research: ProductProfileResearchData
): AlignmentDimension | null {
  const icpRanges = criteria.employee_ranges
  if (!icpRanges || icpRanges.length === 0) return null

  const productSizes = research.target_market?.company_sizes ?? []

  if (productSizes.length === 0) {
    return {
      dimension: 'company_size',
      label: 'Company Size',
      score: 0,
      status: 'no_data',
      icpValues: icpRanges.map(formatRange),
      factValues: [],
      suggestion: 'Product profile has no target company size data to compare against',
    }
  }

  const { ratio } = rangesOverlap(icpRanges, productSizes)
  const score = ratioToScore(ratio)
  const status = scoreToStatus(score)

  const icpLabels = icpRanges.map(formatRange)
  let suggestion: string | undefined
  if (status === 'match') {
    suggestion = `Good match: ICP size ranges (${icpLabels.join(', ')}) overlap with product target sizes (${productSizes.join(', ')})`
  } else if (status === 'partial') {
    suggestion = `Some overlap: ICP targets ${icpLabels.join(', ')} employees but product targets ${productSizes.join(', ')}`
  } else {
    suggestion = `ICP targets ${icpLabels.join(', ')} employees but product targets ${productSizes.join(', ')} -- company size mismatch`
  }

  return {
    dimension: 'company_size',
    label: 'Company Size',
    score,
    status,
    icpValues: icpLabels,
    factValues: productSizes,
    suggestion,
  }
}

function checkRoleSeniorityAlignmentProduct(
  criteria: ICPCriteria,
  research: ProductProfileResearchData
): AlignmentDimension | null {
  const icpTitles = criteria.title_keywords ?? []
  const icpSeniority = criteria.seniority_levels ?? []
  const icpRoleTerms = [...icpTitles, ...icpSeniority]

  if (icpRoleTerms.length === 0) return null

  const buyerPersonas = research.target_market?.buyer_personas ?? []

  if (buyerPersonas.length === 0) {
    return {
      dimension: 'role_seniority',
      label: 'Role / Seniority',
      score: 0,
      status: 'no_data',
      icpValues: icpRoleTerms,
      factValues: [],
      suggestion: 'Product profile has no buyer persona data to compare against',
    }
  }

  const ratio = overlapPercentage(icpRoleTerms, buyerPersonas)
  const score = ratioToScore(ratio)
  const status = scoreToStatus(score)

  let suggestion: string | undefined
  if (status === 'match') {
    suggestion = `Good match: ICP target roles align with product buyer personas`
  } else if (status === 'partial') {
    suggestion = `Partial overlap: ICP targets ${icpRoleTerms.slice(0, 3).join(', ')} but product buyer personas are ${buyerPersonas.slice(0, 3).join(', ')}`
  } else {
    suggestion = `ICP targets ${icpRoleTerms.slice(0, 3).join(', ')} but product buyer personas are ${buyerPersonas.slice(0, 3).join(', ')} -- significant role mismatch`
  }

  return {
    dimension: 'role_seniority',
    label: 'Role / Seniority',
    score,
    status,
    icpValues: icpRoleTerms,
    factValues: buyerPersonas,
    suggestion,
  }
}

function checkTechnologyAlignmentProduct(
  criteria: ICPCriteria,
  research: ProductProfileResearchData
): AlignmentDimension | null {
  const icpTech = criteria.technology_keywords
  if (!icpTech || icpTech.length === 0) return null

  const productTech: string[] = []
  if (research.integrations?.platforms?.length) {
    productTech.push(...research.integrations.platforms)
  }
  if (research.integrations?.native_integrations?.length) {
    productTech.push(...research.integrations.native_integrations)
  }

  if (productTech.length === 0) {
    return {
      dimension: 'technology',
      label: 'Technology',
      score: 0,
      status: 'no_data',
      icpValues: icpTech,
      factValues: [],
      suggestion: 'Product profile has no technology/integration data to compare against',
    }
  }

  const ratio = overlapPercentage(icpTech, productTech)
  const score = ratioToScore(ratio)
  const status = scoreToStatus(score)

  const matchedTech = icpTech.filter((needle) =>
    productTech.some(
      (h) =>
        h.toLowerCase().includes(needle.toLowerCase()) ||
        needle.toLowerCase().includes(h.toLowerCase())
    )
  )

  let suggestion: string | undefined
  if (status === 'match') {
    suggestion = `Good match: ${matchedTech.length} of ${icpTech.length} required technologies found in product integrations`
  } else if (status === 'partial') {
    suggestion = `Some overlap: ICP requires ${icpTech.join(', ')} but product integrates with ${productTech.slice(0, 4).join(', ')}`
  } else {
    suggestion = `ICP requires ${icpTech.join(', ')} but product integrates with ${productTech.slice(0, 4).join(', ')} -- minimal technology overlap`
  }

  return {
    dimension: 'technology',
    label: 'Technology',
    score,
    status,
    icpValues: icpTech,
    factValues: productTech,
    suggestion,
  }
}

function checkDepartmentAlignmentProduct(
  criteria: ICPCriteria,
  research: ProductProfileResearchData
): AlignmentDimension | null {
  const icpDepts = criteria.departments
  if (!icpDepts || icpDepts.length === 0) return null

  // Product profiles don't have explicit department data — derive from buyer personas and use cases
  const derivedDepts: string[] = []
  if (research.use_cases?.primary_use_cases?.length) {
    for (const uc of research.use_cases.primary_use_cases) {
      if (uc.persona && !derivedDepts.includes(uc.persona)) {
        derivedDepts.push(uc.persona)
      }
    }
  }
  if (research.target_market?.buyer_personas?.length) {
    for (const persona of research.target_market.buyer_personas) {
      if (!derivedDepts.includes(persona)) {
        derivedDepts.push(persona)
      }
    }
  }

  if (derivedDepts.length === 0) {
    return {
      dimension: 'department',
      label: 'Department',
      score: 0,
      status: 'no_data',
      icpValues: icpDepts,
      factValues: [],
      suggestion: 'Product profile has no department/persona data to compare against',
    }
  }

  const ratio = overlapPercentage(icpDepts, derivedDepts)
  const score = ratioToScore(ratio)
  const status = scoreToStatus(score)

  let suggestion: string | undefined
  if (status === 'match') {
    suggestion = `Good match: target departments align well with product buyer personas`
  } else if (status === 'partial') {
    suggestion = `Some overlap: ICP targets ${icpDepts.join(', ')} but product personas include ${derivedDepts.slice(0, 4).join(', ')}`
  } else {
    suggestion = `ICP targets departments ${icpDepts.join(', ')} but product personas include ${derivedDepts.slice(0, 4).join(', ')} -- department mismatch`
  }

  return {
    dimension: 'department',
    label: 'Department',
    score,
    status,
    icpValues: icpDepts,
    factValues: derivedDepts,
    suggestion,
  }
}

// ---------------------------------------------------------------------------
// Product profile alignment
// ---------------------------------------------------------------------------

const PRODUCT_DIMENSION_CHECKERS: ((
  criteria: ICPCriteria,
  research: ProductProfileResearchData
) => AlignmentDimension | null)[] = [
  checkIndustryAlignmentProduct,
  checkCompanySizeAlignmentProduct,
  checkRoleSeniorityAlignmentProduct,
  checkTechnologyAlignmentProduct,
  checkDepartmentAlignmentProduct,
]

/**
 * Compare ICP criteria against product profile research data and score alignment
 * across all applicable dimensions.
 *
 * Same scoring model as `checkICPFactProfileAlignment` — 5 dimensions, 0-100 each.
 */
export function checkICPProductProfileAlignment(
  criteria: ICPCriteria,
  researchData: ProductProfileResearchData
): AlignmentResult {
  const dimensions: AlignmentDimension[] = []

  for (const checker of PRODUCT_DIMENSION_CHECKERS) {
    const result = checker(criteria, researchData)
    if (result) {
      dimensions.push(result)
    }
  }

  const scoredDimensions = dimensions.filter((d) => d.status !== 'no_data')
  const overallScore =
    scoredDimensions.length > 0
      ? Math.round(
          scoredDimensions.reduce((sum, d) => sum + d.score, 0) /
            scoredDimensions.length
        )
      : 0

  return {
    overallScore,
    dimensions,
    verified: overallScore > 70,
  }
}

// ---------------------------------------------------------------------------
// Combined alignment (fact + product)
// ---------------------------------------------------------------------------

/**
 * Check ICP alignment against both fact profile and product profile.
 * Product profile dimensions take precedence where both provide data for the
 * same dimension. Fact profile fills in dimensions the product doesn't cover.
 *
 * Returns a single AlignmentResult with the best-available score per dimension.
 */
export function checkICPCombinedAlignment(
  criteria: ICPCriteria,
  factResearch: FactProfileResearchData,
  productResearch: ProductProfileResearchData
): AlignmentResult {
  const factResult = checkICPFactProfileAlignment(criteria, factResearch)
  const productResult = checkICPProductProfileAlignment(criteria, productResearch)

  // Build a map of product dimensions (product takes precedence)
  const productDimMap = new Map<string, AlignmentDimension>()
  for (const dim of productResult.dimensions) {
    productDimMap.set(dim.dimension, dim)
  }

  const factDimMap = new Map<string, AlignmentDimension>()
  for (const dim of factResult.dimensions) {
    factDimMap.set(dim.dimension, dim)
  }

  // Merge: product takes precedence if it has actual data, otherwise fall back to fact
  const allDimensionKeys = new Set([...productDimMap.keys(), ...factDimMap.keys()])
  const dimensions: AlignmentDimension[] = []

  for (const key of allDimensionKeys) {
    const productDim = productDimMap.get(key)
    const factDim = factDimMap.get(key)

    if (productDim && productDim.status !== 'no_data') {
      dimensions.push(productDim)
    } else if (factDim) {
      dimensions.push(factDim)
    } else if (productDim) {
      dimensions.push(productDim) // no_data from product, fact didn't have this dimension at all
    }
  }

  const scoredDimensions = dimensions.filter((d) => d.status !== 'no_data')
  const overallScore =
    scoredDimensions.length > 0
      ? Math.round(
          scoredDimensions.reduce((sum, d) => sum + d.score, 0) /
            scoredDimensions.length
        )
      : 0

  return {
    overallScore,
    dimensions,
    verified: overallScore > 70,
  }
}
