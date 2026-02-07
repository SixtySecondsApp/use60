/// <reference path="../deno.d.ts" />

/**
 * Parse Apollo Query — NL → ApolloSearchParams
 *
 * Uses Claude Haiku to convert a natural language query like
 * "VPs of Sales at SaaS companies in San Francisco with 50-200 employees"
 * into structured Apollo search parameters.
 *
 * POST /parse-apollo-query
 * { query: string }
 *
 * Returns: { params: ApolloSearchParams, summary: string, enrichment?: {...}, suggested_table_name?: string }
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
const LOG_PREFIX = '[parse-apollo-query]'

// Valid Apollo enum values
const VALID_SENIORITIES = [
  'owner', 'founder', 'c_suite', 'partner', 'vp',
  'head', 'director', 'manager', 'senior', 'entry',
]

const VALID_DEPARTMENTS = [
  'engineering_technical', 'sales', 'marketing', 'finance',
  'operations', 'human_resources', 'support', 'legal',
  'product_management', 'data_science', 'consulting',
  'education', 'media_communications',
]

const VALID_EMPLOYEE_RANGES = [
  '1,10', '11,20', '21,50', '51,100', '101,200',
  '201,500', '501,1000', '1001,5000', '5001,10000', '10001,',
]

const VALID_FUNDING_STAGES = [
  'seed', 'angel', 'venture', 'series_a', 'series_b',
  'series_c', 'series_d', 'series_e', 'ipo', 'private_equity',
]

const SYSTEM_PROMPT = `You are an Apollo.io search query parser. Convert natural language descriptions of target prospects into structured Apollo API search parameters.

You have one tool: parse_apollo_params. Always use it to return structured parameters.

## Apollo Search Parameter Reference

- person_titles: Array of job title strings (e.g. ["VP Sales", "CTO", "Head of Engineering"])
- person_locations: Array of location strings. CRITICAL: Apollo requires FULL country names — use "United Kingdom" (NEVER "UK" or "Britain"), "United States" (NEVER "US" or "USA" or "America"), "United Arab Emirates" (NEVER "UAE"). Always include the full country name. Format: "City, Region, Country" e.g. ["San Francisco, California, United States", "London, England, United Kingdom", "Bristol, England, United Kingdom"]. If the user doesn't specify a country, use the Business Context to determine the most likely one
- person_seniorities: Array from EXACTLY these values: ${VALID_SENIORITIES.join(', ')}
- person_departments: Array from EXACTLY these values: ${VALID_DEPARTMENTS.join(', ')}
- organization_num_employees_ranges: Array from EXACTLY these values: ${VALID_EMPLOYEE_RANGES.join(' | ')}
- organization_latest_funding_stage_cd: Array from EXACTLY these values: ${VALID_FUNDING_STAGES.join(', ')}
- q_keywords: Free-text keyword string (e.g. "SaaS AI DevOps")
- q_organization_keyword_tags: Array of industry/technology tags
- q_organization_domains: Array of specific company domains (e.g. ["google.com", "stripe.com"])
- contact_email_status: Array, typically ["verified"] if user wants verified emails only

## Rules

1. Extract as many relevant parameters as you can from the query
2. CRITICAL — person_titles vs person_seniorities vs person_departments:
   - person_titles = the actual job title string people have (e.g. "CEO", "CTO", "VP Sales", "Head of Engineering", "Sales Director"). ALWAYS include the title the user mentions here.
   - person_seniorities = a seniority LEVEL filter (e.g. c_suite, vp, director). Use this IN ADDITION to person_titles to broaden the search.
   - person_departments = a functional area filter (e.g. sales, marketing, engineering_technical). Only use when the user mentions a department/function, NOT a job title.
   - Examples: "CEOs" → person_titles: ["CEO", "Chief Executive Officer", "Chief Executive"], person_seniorities: ["c_suite"]. "CTOs" → person_titles: ["CTO", "Chief Technology Officer", "Chief Technical Officer"], person_seniorities: ["c_suite"]. "CFOs" → person_titles: ["CFO", "Chief Financial Officer"], person_seniorities: ["c_suite"]. "COOs" → person_titles: ["COO", "Chief Operating Officer"], person_seniorities: ["c_suite"]. "CMOs" → person_titles: ["CMO", "Chief Marketing Officer"], person_seniorities: ["c_suite"]. "CROs" → person_titles: ["CRO", "Chief Revenue Officer"], person_seniorities: ["c_suite"]. "VPs of Sales" → person_titles: ["VP Sales", "VP of Sales", "Vice President Sales", "Vice President of Sales"], person_seniorities: ["vp"], person_departments: ["sales"]. "Sales Directors" → person_titles: ["Sales Director", "Director of Sales"], person_seniorities: ["director"], person_departments: ["sales"]. "Engineers" → person_departments: ["engineering_technical"].
3. IMPORTANT — title variations: Always include the acronym, the full form, AND common short forms. E.g. "CEO" → ["CEO", "Chief Executive Officer", "Chief Executive"]. "VP" → also include "Vice President". "MD" → ["Managing Director", "MD"]. "GM" → ["General Manager", "GM"]. "SVP" → ["SVP", "Senior Vice President"]. "EVP" → ["EVP", "Executive Vice President"]. This ensures Apollo matches people regardless of how their title is listed.
4. For seniority mapping: "CEO/CTO/CFO/COO/CMO/CIO/CRO" → "c_suite", "VP/SVP/EVP" → "vp", "Director" → "director", "Head of" → "head", "Manager" → "manager", "MD/Managing Director" → "c_suite"
5. For departments, map: "Engineering/Tech/Development" → "engineering_technical", "HR" → "human_resources", etc. Do NOT put job titles like "CEO" or "CTO" in departments.
6. For employee ranges, pick the closest matching range(s). "50-200 employees" → ["51,100", "101,200"]. "startup" → ["1,10", "11,20", "21,50"]. "enterprise" → ["5001,10000", "10001,"]. If the Business Context includes a target company size, use it as a default when the user doesn't specify size.
7. For funding, map: "Series A" → "series_a", "funded" → ["seed", "angel", "venture", "series_a", "series_b"], "late stage" → ["series_c", "series_d", "series_e"]
8. If a specific company is mentioned by name (not domain), put it in q_keywords
9. If a specific domain like "google.com" is mentioned, put it in q_organization_domains
10. Generate a short summary of what was parsed. If locations are ambiguous (e.g. city exists in multiple countries), mention this in the summary
11. Only include parameters that are clearly specified or implied by the query — don't guess (exception: use Business Context defaults for employee size if available)
12. For locations: always be specific. Use the Business Context (if provided) to resolve ambiguity. If the company is based in the UK, "Bristol" means "Bristol, United Kingdom". If no business context is available and the location is genuinely ambiguous, include both possibilities and note the ambiguity in the summary
13. ALWAYS include contact_email_status: ["verified"] unless the user explicitly asks for unverified emails
14. ENRICHMENT DETECTION: If the user mentions wanting emails, phones, or contact details, set the enrichment field:
   - "with emails" / "with email addresses" → enrichment: { email: true }
   - "with phone numbers" / "with phones" / "with mobile" / "with direct dials" → enrichment: { phone: true }
   - "with contact details" / "enriched" / "full details" / "with full contact info" → enrichment: { email: true, phone: true }
   - If no enrichment keywords are found, do NOT include the enrichment field at all
15. SUGGESTED TABLE NAME: Always generate a short, descriptive table name from the query (2-5 words). Examples: "CEOs in Bristol" → "CEOs - Bristol", "VP Sales at SaaS startups in London" → "VP Sales - SaaS - London", "Engineers at Google" → "Engineers - Google". Use the pattern: "[Title/Role] - [Industry/Keywords] - [Location]" (omit parts that aren't specified).
16. RESULT COUNT: If the user specifies a number of results (e.g. "50 CEOs", "give me 25 VPs", "100 engineers"), set per_page to that number (capped at 100). If no number is specified, default to 50. Do NOT include numbers that are clearly part of other fields (e.g. "50-200 employees" is an employee range, not a result count).`

const PARSE_TOOL: Anthropic.Tool = {
  name: 'parse_apollo_params',
  description: 'Return the structured Apollo search parameters parsed from the natural language query',
  input_schema: {
    type: 'object' as const,
    properties: {
      person_titles: {
        type: 'array',
        items: { type: 'string' },
        description: 'Job titles to search for',
      },
      person_locations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Geographic locations',
      },
      person_seniorities: {
        type: 'array',
        items: { type: 'string', enum: VALID_SENIORITIES },
        description: 'Seniority levels',
      },
      person_departments: {
        type: 'array',
        items: { type: 'string', enum: VALID_DEPARTMENTS },
        description: 'Departments',
      },
      organization_num_employees_ranges: {
        type: 'array',
        items: { type: 'string', enum: VALID_EMPLOYEE_RANGES },
        description: 'Employee count ranges',
      },
      organization_latest_funding_stage_cd: {
        type: 'array',
        items: { type: 'string', enum: VALID_FUNDING_STAGES },
        description: 'Funding stages',
      },
      q_keywords: {
        type: 'string',
        description: 'Free-text keywords',
      },
      q_organization_keyword_tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Industry/technology tags',
      },
      q_organization_domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific company domains',
      },
      contact_email_status: {
        type: 'array',
        items: { type: 'string' },
        description: 'Email verification status filter',
      },
      per_page: {
        type: 'number',
        description: 'Number of results to return (1-100, default 50). Only set if user explicitly requests a specific number.',
      },
      summary: {
        type: 'string',
        description: 'Short human-readable summary of what was parsed',
      },
      enrichment: {
        type: 'object',
        properties: {
          email: { type: 'boolean', description: 'User wants email enrichment' },
          phone: { type: 'boolean', description: 'User wants phone enrichment' },
        },
        description: 'Only include if user explicitly requests enrichment (e.g. "with emails", "with phone numbers")',
      },
      suggested_table_name: {
        type: 'string',
        description: 'Short descriptive table name generated from the query, e.g. "CEOs - Bristol" or "VP Sales - SaaS - London"',
      },
    },
    required: ['summary', 'suggested_table_name'],
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
          .select('company_name, headquarters, industry, target_market, employee_count, ideal_customer_profile')
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

      // ICP / target company size
      const icp = enrichment?.ideal_customer_profile as Record<string, unknown> | null
      const targetEmployeeCount = enrichment?.employee_count as string | null
      if (targetEmployeeCount) parts.push(`Target customer employee count: ${targetEmployeeCount}`)
      if (icp && typeof icp === 'object' && Object.keys(icp).length > 0) {
        // Extract useful ICP fields
        const icpParts: string[] = []
        if (icp.company_size || icp.companySize) icpParts.push(`Target company size: ${icp.company_size || icp.companySize}`)
        if (icp.employee_range || icp.employeeRange) icpParts.push(`Target employees: ${icp.employee_range || icp.employeeRange}`)
        if (icp.industry) icpParts.push(`Target industry: ${icp.industry}`)
        if (icp.revenue) icpParts.push(`Target revenue: ${icp.revenue}`)
        if (icpParts.length > 0) parts.push(...icpParts)
      }

      if (parts.length > 0) {
        businessContext = `\n\n## Business Context (use this to disambiguate locations and set defaults)\nThe user works at the following company:\n${parts.join('\n')}\n\nWhen a location is ambiguous (e.g. "Bristol" could be UK or USA), use the company's HQ location, timezone, and market to determine the most likely interpretation. Only include the most likely location — do NOT include both unless the query explicitly mentions multiple countries.\n\nIf the user does not specify a company size / employee count, use the Target customer employee count or ICP data above to set a reasonable default for organization_num_employees_ranges.`
      }
    }

    // Call Claude
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT + businessContext,
      tools: [PARSE_TOOL],
      tool_choice: { type: 'tool' as const, name: 'parse_apollo_params' },
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
    const { summary, enrichment, suggested_table_name, ...params } = parsed

    // Clean empty arrays
    const cleanParams: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value) && value.length > 0) {
        cleanParams[key] = value
      } else if (typeof value === 'string' && value.trim()) {
        cleanParams[key] = value.trim()
      }
    }

    // Build enrichment object only if it has truthy values
    const cleanEnrichment = enrichment && typeof enrichment === 'object'
      ? Object.fromEntries(
          Object.entries(enrichment as Record<string, boolean>).filter(([, v]) => v === true)
        )
      : undefined
    const hasEnrichment = cleanEnrichment && Object.keys(cleanEnrichment).length > 0

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
      'parse_apollo_query',
      { query }
    ).catch((e: Error) => console.warn(`${LOG_PREFIX} Cost logging failed:`, e.message))

    console.log(`${LOG_PREFIX} Parsed into ${Object.keys(cleanParams).length} params: ${summary}${hasEnrichment ? ` [enrichment: ${JSON.stringify(cleanEnrichment)}]` : ''}`)

    return jsonResponse({
      params: cleanParams,
      summary,
      ...(hasEnrichment ? { enrichment: cleanEnrichment } : {}),
      ...(suggested_table_name ? { suggested_table_name } : {}),
    }, req)
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error)
    return errorResponse((error as Error).message, req, 500)
  }
})
