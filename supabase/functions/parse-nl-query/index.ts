/// <reference path="../deno.d.ts" />

/**
 * Parse NL Query — Natural Language → QueryParseResult
 *
 * Uses Claude Haiku to convert a natural language query like
 * "find me 20 marketing agencies in Bristol" into structured data
 * for the multi-source query system.
 *
 * POST /parse-nl-query
 * { query: string }
 *
 * Returns: {
 *   entity_type: string,
 *   count: number,
 *   location?: string,
 *   keywords?: string[],
 *   source_preference?: 'linkedin' | 'maps' | 'serp' | 'apollo' | 'ai_ark',
 *   confidence: number
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1'
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'
import { logAICostEvent, extractAnthropicUsage } from '../_shared/costTracking.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 1024
const LOG_PREFIX = '[parse-nl-query]'

const VALID_SOURCES = ['linkedin', 'maps', 'serp', 'apollo', 'ai_ark']

const SYSTEM_PROMPT = `You are a natural language query parser for a prospecting system. Convert user queries into structured data that can be used to search across multiple data sources (LinkedIn, Google Maps, web search, Apollo.io, AI Ark).

You have one tool: parse_query. Always use it to return structured parameters.

## Query Parsing Guidelines

1. **Entity Type**: Classify what the user is looking for into exactly one of two categories:
   - "companies" — for businesses, agencies, organizations, startups, firms, vendors, providers
   - "people" — for individuals, contacts, prospects, executives, managers, CEOs, founders
   - Examples: "marketing agencies" → entity_type: "companies", "CEOs" → entity_type: "people", "tech startups" → entity_type: "companies", "HR managers" → entity_type: "people"

2. **Count**: Extract the number of results requested
   - Look for explicit numbers: "20 agencies", "50 contacts", "100 companies"
   - Cap at 100 maximum
   - If no number specified, default to 25
   - Ignore numbers that are clearly part of other fields (e.g., "50-200 employees" is a filter, not a count)

3. **Location**: Extract geographic location
   - Full city/region/country: "Bristol, UK", "San Francisco, CA, USA", "London, United Kingdom"
   - Be specific with countries: use full names like "United Kingdom" (not "UK"), "United States" (not "US")
   - If country is ambiguous, use the Business Context to determine the most likely one
   - Examples: "in Bristol" → "Bristol, United Kingdom", "Bay Area" → "San Francisco Bay Area, California, United States"

4. **Keywords**: Extract descriptive terms, industries, technologies
   - Industries: "marketing", "SaaS", "fintech", "healthcare", "AI"
   - Technologies: "React", "AWS", "Salesforce", "HubSpot"
   - Descriptors: "B2B", "enterprise", "startup", "funded"
   - Company types: "agency", "consultancy", "service provider"
   - Examples: "marketing agencies" → keywords: ["marketing", "agency"], "AI startups in Bristol" → keywords: ["AI", "startup"]

5. **Source Preference**: Detect if user specifies a data source
   - "find on LinkedIn" → source_preference: "linkedin"
   - "search Google Maps" or "local businesses" → source_preference: "maps"
   - "search the web" or "find online" → source_preference: "serp"
   - "use Apollo" or "Apollo search" → source_preference: "apollo"
   - "use AI Ark" or "AI Ark search" → source_preference: "ai_ark"
   - If not specified, leave as null (system will auto-select)

6. **Confidence**: Rate how clearly you understood the query (0-1)
   - 1.0 = crystal clear ("find 20 marketing agencies in Bristol")
   - 0.8 = clear but some inference needed ("agencies in Bristol" - type inferred)
   - 0.6 = vague but parseable ("find some companies in the UK")
   - 0.4 = very vague ("find prospects")
   - Return confidence score based on clarity of entity type, location, and intent

## Rules

- ALWAYS extract entity_type (even if generic like "companies")
- ALWAYS set count (default 25 if not specified, max 100)
- Location is optional but extract if mentioned
- Keywords should be specific and relevant to the search
- Only set source_preference if user explicitly mentions a source
- Be conservative with confidence scores - only give 1.0 if the query is unambiguous
- Use Business Context to disambiguate locations and set defaults

## Examples

Query: "find me 20 marketing agencies in Bristol"
→ entity_type: "companies", count: 20, location: "Bristol, United Kingdom", keywords: ["marketing", "agency"], confidence: 1.0

Query: "50 SaaS companies in San Francisco with 50-200 employees"
→ entity_type: "companies", count: 50, location: "San Francisco, California, United States", keywords: ["SaaS", "B2B software"], confidence: 0.9

Query: "find CEOs on LinkedIn in the UK"
→ entity_type: "people", count: 25, location: "United Kingdom", keywords: ["CEO", "executive", "C-suite"], source_preference: "linkedin", confidence: 0.85

Query: "tech startups in London"
→ entity_type: "companies", count: 25, location: "London, United Kingdom", keywords: ["technology", "startup"], confidence: 0.9

Query: "find some prospects"
→ entity_type: "people", count: 25, keywords: [], confidence: 0.3`

const PARSE_TOOL: Anthropic.Tool = {
  name: 'parse_query',
  description: 'Return the structured query parameters parsed from the natural language input',
  input_schema: {
    type: 'object' as const,
    properties: {
      entity_type: {
        type: 'string',
        enum: ['companies', 'people'],
        description: 'The category of entity: "companies" for businesses/agencies/organizations/startups, "people" for individuals/contacts/executives/managers',
      },
      count: {
        type: 'number',
        description: 'Number of results requested (1-100, default 25)',
      },
      location: {
        type: 'string',
        description: 'Geographic location for the search (e.g., "Bristol, United Kingdom", "San Francisco, CA, USA"). Use full country names.',
      },
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Relevant keywords, industries, technologies, or descriptors',
      },
      source_preference: {
        type: 'string',
        enum: VALID_SOURCES,
        description: 'Data source preference if user specifies one (linkedin, maps, serp, apollo, ai_ark). Leave null for auto-selection.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence score (0-1) indicating how clearly the query was understood',
      },
    },
    required: ['entity_type', 'count', 'confidence'],
  },
}

serve(async (req) => {
  const corsResponse = handleCorsPreflightRequest(req)
  if (corsResponse) return corsResponse

  try {
    if (!ANTHROPIC_API_KEY) {
      return errorResponse('Anthropic API key not configured', req, 500)
    }

    const body = await req.json()
    const { query } = body as { query: string }

    if (!query?.trim()) {
      return errorResponse('Query is required', req, 400)
    }

    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    console.log(`${LOG_PREFIX} Parsing query for user ${user.id}: "${query}"`)

    // Get user's org for business context
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    // Fetch business context to help disambiguate locations
    let businessContext = ''
    if (membership?.org_id) {
      const serviceClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

      const [orgResult, enrichmentResult] = await Promise.all([
        serviceClient
          .from('organizations')
          .select('name, company_domain, company_country_code, company_timezone, company_industry, company_size')
          .eq('id', membership.org_id)
          .maybeSingle(),
        serviceClient
          .from('organization_enrichment')
          .select('company_name, headquarters, industry, target_market')
          .eq('organization_id', membership.org_id)
          .maybeSingle(),
      ])

      const org = orgResult.data
      const enrichment = enrichmentResult.data
      const parts: string[] = []

      if (org?.name || enrichment?.company_name) parts.push(`Company: ${enrichment?.company_name || org?.name}`)
      if (org?.company_domain) parts.push(`Domain: ${org.company_domain}`)
      if (enrichment?.headquarters || org?.company_country_code) {
        parts.push(`HQ: ${enrichment?.headquarters || org?.company_country_code}`)
      }
      if (org?.company_timezone) parts.push(`Timezone: ${org.company_timezone}`)
      if (enrichment?.industry || org?.company_industry) {
        parts.push(`Industry: ${enrichment?.industry || org?.company_industry}`)
      }
      if (enrichment?.target_market) parts.push(`Target market: ${enrichment.target_market}`)
      if (org?.company_size) parts.push(`Company size: ${org.company_size}`)

      if (parts.length > 0) {
        businessContext = `\n\n## Business Context (use this to disambiguate locations and set defaults)\nThe user works at the following company:\n${parts.join('\n')}\n\nWhen a location is ambiguous (e.g. "Bristol" could be UK or USA), use the company's HQ location, timezone, and market to determine the most likely interpretation.`
      }
    }

    // Call Claude
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT + businessContext,
      tools: [PARSE_TOOL],
      tool_choice: { type: 'tool' as const, name: 'parse_query' },
      messages: [{ role: 'user', content: query }],
    })

    // Extract tool use result
    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    if (!toolBlock) {
      console.error(`${LOG_PREFIX} No tool use in response`)
      return errorResponse('Failed to parse query', req, 500)
    }

    const parsed = toolBlock.input as Record<string, unknown>

    // Normalize entity_type to enum (safety net for freeform responses)
    const rawEntityType = String(parsed.entity_type || '').toLowerCase().trim()
    const COMPANY_TERMS = ['companies', 'company', 'agencies', 'agency', 'organizations', 'organization', 'businesses', 'business', 'startups', 'startup', 'firms', 'firm', 'vendors', 'vendor', 'providers', 'provider']
    const PEOPLE_TERMS = ['people', 'person', 'contacts', 'contact', 'prospects', 'prospect', 'executives', 'executive', 'managers', 'manager', 'directors', 'director', 'ceos', 'ceo', 'founders', 'founder', 'leads', 'lead']

    let normalizedEntityType: 'companies' | 'people' = 'companies' // default
    if (PEOPLE_TERMS.some(t => rawEntityType.includes(t))) {
      normalizedEntityType = 'people'
    } else if (COMPANY_TERMS.some(t => rawEntityType.includes(t))) {
      normalizedEntityType = 'companies'
    }

    // Validate and clean the result
    const result: Record<string, unknown> = {
      entity_type: normalizedEntityType,
      count: Math.min(Math.max(1, Number(parsed.count) || 25), 100), // Cap at 100
      confidence: Math.min(Math.max(0, Number(parsed.confidence) || 0.5), 1), // 0-1 range
    }

    // Optional fields
    if (parsed.location && String(parsed.location).trim()) {
      result.location = String(parsed.location).trim()
    }

    if (Array.isArray(parsed.keywords) && parsed.keywords.length > 0) {
      result.keywords = parsed.keywords.filter(k => typeof k === 'string' && k.trim()).map(k => String(k).trim())
    }

    if (parsed.source_preference && VALID_SOURCES.includes(String(parsed.source_preference))) {
      result.source_preference = String(parsed.source_preference)
    }

    // Log cost
    const usage = extractAnthropicUsage(response)
    await logAICostEvent(
      supabase,
      user.id,
      null,
      'anthropic',
      MODEL,
      usage.inputTokens,
      usage.outputTokens,
      'parse_nl_query',
      { query }
    ).catch((e: Error) => console.warn(`${LOG_PREFIX} Cost logging failed:`, e.message))

    console.log(`${LOG_PREFIX} Parsed: ${result.entity_type} (${result.count}) [confidence: ${result.confidence}]`)

    return jsonResponse(result, req)
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error)
    return errorResponse((error as Error).message, req, 500)
  }
})
