/**
 * ICP Scoring — client-side scoring of search results against ICP criteria.
 *
 * Scores contacts/companies on a 0–100 scale based on how well they match
 * the selected ICP profile's criteria. Only criteria that are both defined
 * AND testable against the result data contribute to the score.
 */

import type { ICPCriteria } from '@/lib/types/prospecting'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoringDetail {
  criterion: string
  label: string
  weight: number
  matched: boolean
  matchReason: string
}

export interface ICPScore {
  /** Normalized score 0–100 */
  score: number
  /** Human-readable list of matched criteria */
  matches: string[]
  /** Human-readable list of unmatched criteria */
  mismatches: string[]
  /** Per-criterion breakdown */
  details: ScoringDetail[]
}

export interface ScoredResult {
  row: Record<string, unknown>
  icpScore: ICPScore
}

// ---------------------------------------------------------------------------
// Criterion weights
// ---------------------------------------------------------------------------

const WEIGHTS: Record<string, number> = {
  seniority: 20,
  department: 15,
  title_keywords: 15,
  employee_range: 15,
  industry: 10,
  location: 10,
  technology: 10,
  funding_stage: 5,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(val: unknown): string {
  if (val == null) return ''
  return String(val).trim().toLowerCase()
}

function anyMatch(needles: string[], haystack: string): boolean {
  const h = haystack.toLowerCase()
  return needles.some((n) => h.includes(n.toLowerCase()))
}

function exactSetMatch(needles: string[], haystack: string): boolean {
  const h = haystack.toLowerCase()
  return needles.some((n) => n.toLowerCase() === h)
}

// ---------------------------------------------------------------------------
// Per-criterion scorers
// ---------------------------------------------------------------------------

function scoreSeniority(
  row: Record<string, unknown>,
  criteria: ICPCriteria
): ScoringDetail | null {
  const levels = criteria.seniority_levels
  if (!levels || levels.length === 0) return null

  const seniority = normalize(row.seniority ?? row.person_seniority)
  if (!seniority) return null

  const matched = exactSetMatch(levels, seniority)
  return {
    criterion: 'seniority',
    label: 'Seniority',
    weight: WEIGHTS.seniority,
    matched,
    matchReason: matched
      ? `Seniority "${seniority}" matches criteria`
      : `Seniority "${seniority}" not in [${levels.join(', ')}]`,
  }
}

function scoreDepartment(
  row: Record<string, unknown>,
  criteria: ICPCriteria
): ScoringDetail | null {
  const departments = criteria.departments
  if (!departments || departments.length === 0) return null

  const dept = normalize(row.department)
  if (!dept) return null

  const matched = anyMatch(departments, dept)
  return {
    criterion: 'department',
    label: 'Department',
    weight: WEIGHTS.department,
    matched,
    matchReason: matched
      ? `Department "${dept}" matches criteria`
      : `Department "${dept}" not in [${departments.join(', ')}]`,
  }
}

function scoreTitleKeywords(
  row: Record<string, unknown>,
  criteria: ICPCriteria
): ScoringDetail | null {
  const keywords = criteria.title_keywords
  if (!keywords || keywords.length === 0) return null

  const title = normalize(row.title)
  if (!title) return null

  const matched = anyMatch(keywords, title)
  return {
    criterion: 'title_keywords',
    label: 'Title Keywords',
    weight: WEIGHTS.title_keywords,
    matched,
    matchReason: matched
      ? `Title contains matching keyword`
      : `Title "${title}" doesn't match keywords`,
  }
}

function scoreEmployeeRange(
  row: Record<string, unknown>,
  criteria: ICPCriteria
): ScoringDetail | null {
  const ranges = criteria.employee_ranges
  if (!ranges || ranges.length === 0) return null

  const raw = row.employees ?? row.employee_count ?? row.company_size
  if (raw == null) return null
  const count = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  if (isNaN(count)) return null

  const matched = ranges.some((r) => count >= r.min && count <= r.max)
  return {
    criterion: 'employee_range',
    label: 'Company Size',
    weight: WEIGHTS.employee_range,
    matched,
    matchReason: matched
      ? `${count.toLocaleString()} employees within target range`
      : `${count.toLocaleString()} employees outside target range`,
  }
}

function scoreIndustry(
  row: Record<string, unknown>,
  criteria: ICPCriteria
): ScoringDetail | null {
  const industries = criteria.industries
  if (!industries || industries.length === 0) return null

  const industry = normalize(row.industry)
  if (!industry) return null

  const matched = anyMatch(industries, industry)
  return {
    criterion: 'industry',
    label: 'Industry',
    weight: WEIGHTS.industry,
    matched,
    matchReason: matched
      ? `Industry "${industry}" matches criteria`
      : `Industry "${industry}" not in target industries`,
  }
}

function scoreLocation(
  row: Record<string, unknown>,
  criteria: ICPCriteria
): ScoringDetail | null {
  const countries = criteria.location_countries ?? []
  const regions = criteria.location_regions ?? []
  const cities = criteria.location_cities ?? []
  if (countries.length === 0 && regions.length === 0 && cities.length === 0)
    return null

  const country = normalize(row.country)
  const state = normalize(row.state ?? row.region)
  const city = normalize(row.city)
  const location = normalize(row.location)

  // Need at least one location field to score
  if (!country && !state && !city && !location) return null

  let matched = false
  if (cities.length > 0 && city) matched = matched || exactSetMatch(cities, city)
  if (regions.length > 0 && state) matched = matched || exactSetMatch(regions, state)
  if (countries.length > 0 && country) matched = matched || exactSetMatch(countries, country)

  // Fallback: check the combined "location" field against all location criteria
  if (!matched && location) {
    const allLocationTerms = [...countries, ...regions, ...cities]
    matched = anyMatch(allLocationTerms, location)
  }

  return {
    criterion: 'location',
    label: 'Location',
    weight: WEIGHTS.location,
    matched,
    matchReason: matched
      ? 'Location matches target geography'
      : 'Location outside target geography',
  }
}

function scoreTechnology(
  row: Record<string, unknown>,
  criteria: ICPCriteria
): ScoringDetail | null {
  const techKeywords = criteria.technology_keywords
  if (!techKeywords || techKeywords.length === 0) return null

  const techs = row.technologies
  if (!techs) return null

  let techStr: string
  if (Array.isArray(techs)) {
    techStr = techs.map((t) => (typeof t === 'string' ? t : String(t))).join(' ')
  } else {
    techStr = String(techs)
  }

  if (!techStr) return null

  const matched = anyMatch(techKeywords, techStr)
  return {
    criterion: 'technology',
    label: 'Technology',
    weight: WEIGHTS.technology,
    matched,
    matchReason: matched
      ? 'Uses matching technology'
      : 'No matching technologies found',
  }
}

function scoreFundingStage(
  row: Record<string, unknown>,
  criteria: ICPCriteria
): ScoringDetail | null {
  const stages = criteria.funding_stages
  if (!stages || stages.length === 0) return null

  const funding = normalize(row.funding_stage ?? row.funding)
  if (!funding) return null

  const matched = anyMatch(stages, funding)
  return {
    criterion: 'funding_stage',
    label: 'Funding Stage',
    weight: WEIGHTS.funding_stage,
    matched,
    matchReason: matched
      ? `Funding stage "${funding}" matches criteria`
      : `Funding stage "${funding}" not in target stages`,
  }
}

// ---------------------------------------------------------------------------
// Main scoring functions
// ---------------------------------------------------------------------------

const SCORERS = [
  scoreSeniority,
  scoreDepartment,
  scoreTitleKeywords,
  scoreEmployeeRange,
  scoreIndustry,
  scoreLocation,
  scoreTechnology,
  scoreFundingStage,
]

/**
 * Score a single search result row against ICP criteria.
 *
 * Only criteria that are (a) defined in the ICP profile AND (b) testable
 * against the available result data are counted. The score is normalized
 * to 0–100 based on the sum of applicable weights.
 */
export function scoreResult(
  row: Record<string, unknown>,
  criteria: ICPCriteria
): ICPScore {
  const details: ScoringDetail[] = []
  let applicableWeight = 0
  let matchedWeight = 0

  for (const scorer of SCORERS) {
    const detail = scorer(row, criteria)
    if (detail) {
      details.push(detail)
      applicableWeight += detail.weight
      if (detail.matched) matchedWeight += detail.weight
    }
  }

  const score =
    applicableWeight > 0 ? Math.round((matchedWeight / applicableWeight) * 100) : -1

  const matches = details.filter((d) => d.matched).map((d) => d.label)
  const mismatches = details.filter((d) => !d.matched).map((d) => d.label)

  return { score, matches, mismatches, details }
}

/**
 * Batch-score an array of result rows. Returns results in the same order,
 * each augmented with an ICPScore.
 */
export function scoreResults(
  rows: Record<string, unknown>[],
  criteria: ICPCriteria
): ScoredResult[] {
  return rows.map((row) => ({
    row,
    icpScore: scoreResult(row, criteria),
  }))
}

/**
 * Compute aggregate stats for a set of scored results.
 */
export function computeAggregateStats(scored: ScoredResult[]): {
  average: number
  highFitCount: number
  totalScored: number
} {
  const validScores = scored.filter((s) => s.icpScore.score >= 0)
  if (validScores.length === 0) return { average: 0, highFitCount: 0, totalScored: 0 }

  const sum = validScores.reduce((acc, s) => acc + s.icpScore.score, 0)
  const average = Math.round(sum / validScores.length)
  const highFitCount = validScores.filter((s) => s.icpScore.score >= 80).length

  return { average, highFitCount, totalScored: validScores.length }
}
