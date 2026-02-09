import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'

/**
 * apify-auto-map — Generates a field mapping proposal from sample data.
 *
 * Accepts { run_id } or { sample_data: [...] }
 * Returns a proposed mapping with confidence scores.
 */

// Heuristics: source field name patterns → target field + confidence
const FIELD_HEURISTICS: Array<{
  patterns: RegExp[]
  target: string
  transform?: string
  confidence: 'high' | 'medium'
}> = [
  // Name fields
  { patterns: [/^name$/i, /^title$/i, /^companyName$/i, /^company_name$/i, /^business_name$/i], target: 'company_name', confidence: 'high' },
  { patterns: [/^firstName$/i, /^first_name$/i, /^fname$/i], target: 'first_name', confidence: 'high' },
  { patterns: [/^lastName$/i, /^last_name$/i, /^lname$/i], target: 'last_name', confidence: 'high' },
  { patterns: [/^fullName$/i, /^full_name$/i, /^displayName$/i], target: 'full_name', confidence: 'high' },

  // Contact
  { patterns: [/^email$/i, /^emailAddress$/i, /^email_address$/i, /^mail$/i], target: 'email', transform: 'lowercase', confidence: 'high' },
  { patterns: [/^phone$/i, /^phoneNumber$/i, /^phone_number$/i, /^telephone$/i, /^tel$/i], target: 'phone', transform: 'normalise_phone', confidence: 'high' },

  // URLs
  { patterns: [/^website$/i, /^url$/i, /^site$/i, /^domain$/i, /^homepageUrl$/i], target: 'website', transform: 'extract_domain', confidence: 'high' },
  { patterns: [/^linkedinUrl$/i, /^linkedin_url$/i, /^linkedin$/i], target: 'linkedin_url', confidence: 'high' },
  { patterns: [/^twitterUrl$/i, /^twitter_url$/i, /^twitter$/i], target: 'twitter_url', confidence: 'medium' },
  { patterns: [/^facebookUrl$/i, /^facebook_url$/i, /^facebook$/i], target: 'facebook_url', confidence: 'medium' },

  // Location
  { patterns: [/^address$/i, /^fullAddress$/i, /^full_address$/i, /^street$/i], target: 'address', confidence: 'high' },
  { patterns: [/^city$/i], target: 'city', confidence: 'high' },
  { patterns: [/^state$/i, /^region$/i, /^province$/i], target: 'state', confidence: 'high' },
  { patterns: [/^country$/i, /^countryCode$/i], target: 'country', confidence: 'high' },
  { patterns: [/^zip$/i, /^zipCode$/i, /^postalCode$/i, /^postal_code$/i], target: 'postal_code', confidence: 'high' },

  // Business
  { patterns: [/^industry$/i, /^categoryName$/i, /^category$/i, /^sector$/i], target: 'industry', confidence: 'medium' },
  { patterns: [/^description$/i, /^about$/i, /^bio$/i, /^summary$/i], target: 'description', confidence: 'medium' },
  { patterns: [/^rating$/i, /^totalScore$/i, /^score$/i, /^stars$/i], target: 'rating', transform: 'to_float', confidence: 'high' },
  { patterns: [/^reviewsCount$/i, /^reviews_count$/i, /^reviewCount$/i, /^numReviews$/i], target: 'review_count', transform: 'to_integer', confidence: 'high' },
  { patterns: [/^employees$/i, /^employeeCount$/i, /^employee_count$/i, /^staff$/i, /^headcount$/i], target: 'employee_count', transform: 'to_integer', confidence: 'medium' },

  // Job
  { patterns: [/^jobTitle$/i, /^job_title$/i, /^position$/i, /^role$/i], target: 'job_title', confidence: 'high' },
  { patterns: [/^department$/i, /^dept$/i], target: 'department', confidence: 'medium' },
  { patterns: [/^seniority$/i, /^seniorityLevel$/i, /^level$/i], target: 'seniority', confidence: 'medium' },

  // IDs
  { patterns: [/^placeId$/i, /^place_id$/i, /^googlePlaceId$/i], target: 'google_place_id', confidence: 'high' },
]

// Dedup key preference order
const DEDUP_CANDIDATES = [
  { field: 'url', priority: 1 },
  { field: 'website', priority: 1 },
  { field: 'google_place_id', priority: 2 },
  { field: 'placeId', priority: 2 },
  { field: 'email', priority: 3 },
  { field: 'phone', priority: 4 },
  { field: 'linkedin_url', priority: 5 },
]

interface FieldMapping {
  source: string
  target: string
  transform?: string
  confidence: 'high' | 'medium' | 'low'
  sample_value?: unknown
}

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey))
    } else {
      result[fullKey] = value
    }
  }

  return result
}

function detectFieldType(values: unknown[]): string {
  const nonNull = values.filter((v) => v != null)
  if (nonNull.length === 0) return 'unknown'

  const types = new Set(nonNull.map((v) => typeof v))
  if (types.has('number') || types.has('bigint')) return 'number'
  if (types.has('boolean')) return 'boolean'
  if (types.has('object')) return Array.isArray(nonNull[0]) ? 'array' : 'object'

  // Check string patterns
  const strings = nonNull.filter((v) => typeof v === 'string') as string[]
  if (strings.length > 0) {
    const emailPattern = strings.filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    if (emailPattern.length / strings.length > 0.5) return 'email'

    const phonePattern = strings.filter((s) => /^[\d\s\-+()]{7,20}$/.test(s))
    if (phonePattern.length / strings.length > 0.5) return 'phone'

    const urlPattern = strings.filter((s) => /^https?:\/\//.test(s))
    if (urlPattern.length / strings.length > 0.5) return 'url'
  }

  return 'string'
}

function generateMapping(sampleData: Record<string, unknown>[]): {
  mappings: FieldMapping[]
  dedup_key: string | null
  unmapped_fields: string[]
} {
  // Flatten all samples and collect field values
  const flatSamples = sampleData.map((item) => flattenObject(item))
  const fieldValues: Record<string, unknown[]> = {}

  for (const flat of flatSamples) {
    for (const [key, value] of Object.entries(flat)) {
      if (!fieldValues[key]) fieldValues[key] = []
      fieldValues[key].push(value)
    }
  }

  const mappings: FieldMapping[] = []
  const mappedTargets = new Set<string>()
  const mappedSources = new Set<string>()

  // Phase 1: Apply heuristics
  for (const [sourceField, values] of Object.entries(fieldValues)) {
    const leafKey = sourceField.split('.').pop() || sourceField

    for (const heuristic of FIELD_HEURISTICS) {
      if (mappedTargets.has(heuristic.target)) continue

      const matches = heuristic.patterns.some((p) => p.test(leafKey))
      if (matches) {
        mappings.push({
          source: sourceField,
          target: heuristic.target,
          transform: heuristic.transform,
          confidence: heuristic.confidence,
          sample_value: values.find((v) => v != null),
        })
        mappedTargets.add(heuristic.target)
        mappedSources.add(sourceField)
        break
      }
    }
  }

  // Phase 2: Type-based transforms for unmapped fields
  for (const [sourceField, values] of Object.entries(fieldValues)) {
    if (mappedSources.has(sourceField)) continue

    const fieldType = detectFieldType(values)
    let transform: string | undefined

    if (fieldType === 'phone') transform = 'normalise_phone'
    if (fieldType === 'email') transform = 'lowercase'

    mappings.push({
      source: sourceField,
      target: sourceField.split('.').pop() || sourceField,
      transform,
      confidence: 'low',
      sample_value: values.find((v) => v != null),
    })
    mappedSources.add(sourceField)
  }

  // Detect dedup key
  let dedupKey: string | null = null
  for (const candidate of DEDUP_CANDIDATES) {
    const mapping = mappings.find(
      (m) => m.target === candidate.field || m.source === candidate.field
    )
    if (mapping) {
      dedupKey = mapping.source
      break
    }
  }

  const unmappedFields = Object.keys(fieldValues).filter((f) => !mappedSources.has(f))

  return { mappings, dedup_key: dedupKey, unmapped_fields: unmappedFields }
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    const body = await req.json() as Record<string, unknown>
    const { run_id, sample_data } = body

    if (!run_id && !sample_data) {
      return errorResponse('Provide either "run_id" or "sample_data"', req, 400)
    }

    // --- Auth ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401)
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return errorResponse('No organization found', req, 400)
    }

    let sampleItems: Record<string, unknown>[]

    if (sample_data && Array.isArray(sample_data)) {
      sampleItems = sample_data.slice(0, 10) as Record<string, unknown>[]
    } else if (run_id) {
      // Fetch sample results from DB
      const svc = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false, autoRefreshToken: false } }
      )

      const { data: results, error: fetchError } = await svc
        .from('apify_results')
        .select('raw_data')
        .eq('run_id', run_id)
        .limit(10)

      if (fetchError) {
        return errorResponse('Failed to fetch results', req, 500)
      }

      if (!results || results.length === 0) {
        return errorResponse('No results found for this run', req, 404)
      }

      sampleItems = results.map((r) => r.raw_data as Record<string, unknown>)
    } else {
      return errorResponse('Invalid request', req, 400)
    }

    const { mappings, dedup_key, unmapped_fields } = generateMapping(sampleItems)

    return jsonResponse({
      mappings,
      dedup_key,
      unmapped_fields,
      sample_count: sampleItems.length,
      total_fields: mappings.length + unmapped_fields.length,
      high_confidence: mappings.filter((m) => m.confidence === 'high').length,
      medium_confidence: mappings.filter((m) => m.confidence === 'medium').length,
      low_confidence: mappings.filter((m) => m.confidence === 'low').length,
    }, req)
  } catch (error) {
    console.error('[apify-auto-map] Error:', error)
    return errorResponse((error as Error).message, req, 500)
  }
})
