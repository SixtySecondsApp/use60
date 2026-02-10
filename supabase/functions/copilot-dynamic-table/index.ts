import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { normalizeCompanyName, calculateStringSimilarity } from '../_shared/companyMatching.ts'
import { checkCreditBalance } from '../_shared/costTracking.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateDynamicTableRequest {
  source?: 'apollo' | 'ai_ark'
  action?: 'company_search' | 'people_search'
  query_description: string
  search_params: Record<string, unknown>
  table_name?: string
  auto_enrich?: {
    email?: boolean
    phone?: boolean
    linkedin?: boolean
    reveal_personal_emails?: boolean
    reveal_phone_number?: boolean
  }
}

interface NormalizedContact {
  apollo_id: string
  first_name: string
  last_name: string
  full_name: string
  title: string
  company: string
  company_domain: string
  employees: number | null
  funding_stage: string | null
  email: string | null
  email_status: string | null
  linkedin_url: string | null
  phone: string | null
  website_url: string | null
  city: string | null
  state: string | null
  country: string | null
}

interface ApolloSearchResponse {
  contacts: NormalizedContact[]
  pagination: {
    page: number
    per_page: number
    total: number
    has_more: boolean
  }
}

// AI Ark normalized types (matches ai-ark-search edge function output)
interface NormalizedAiArkCompany {
  ai_ark_id: string
  company_name: string
  domain: string | null
  industry: string | null
  employee_count: number | null
  employee_range: string | null
  location: string | null
  founded_year: number | null
  description: string | null
  logo_url: string | null
  linkedin_url: string | null
  website: string | null
  technologies: string[] | null
}

interface NormalizedAiArkContact {
  ai_ark_id: string
  first_name: string
  last_name: string
  full_name: string
  title: string | null
  seniority: string | null
  linkedin_url: string | null
  location: string | null
  industry: string | null
  current_company: string | null
  current_company_domain: string | null
  photo_url: string | null
}

// Standard columns for AI Ark company-sourced ops tables
const AI_ARK_COMPANY_COLUMNS = [
  { key: 'company_name', label: 'Company', column_type: 'company', position: 0, width: 200 },
  { key: 'domain', label: 'Domain', column_type: 'url', position: 1, width: 180 },
  { key: 'industry', label: 'Industry', column_type: 'text', position: 2, width: 160 },
  { key: 'employee_count', label: 'Employees', column_type: 'number', position: 3, width: 110 },
  { key: 'location', label: 'Location', column_type: 'text', position: 4, width: 160 },
  { key: 'description', label: 'Description', column_type: 'text', position: 5, width: 250 },
  { key: 'founded_year', label: 'Founded', column_type: 'number', position: 6, width: 100 },
  { key: 'technologies', label: 'Tech Stack', column_type: 'text', position: 7, width: 200 },
  { key: 'linkedin_url', label: 'LinkedIn', column_type: 'linkedin', position: 8, width: 160 },
  { key: 'website', label: 'Website', column_type: 'url', position: 9, width: 180 },
] as const

// Standard columns for AI Ark people-sourced ops tables
const AI_ARK_PEOPLE_COLUMNS = [
  { key: 'full_name', label: 'Name', column_type: 'person', position: 0, width: 180 },
  { key: 'title', label: 'Title', column_type: 'text', position: 1, width: 200 },
  { key: 'current_company', label: 'Company', column_type: 'company', position: 2, width: 180 },
  { key: 'linkedin_url', label: 'LinkedIn', column_type: 'linkedin', position: 3, width: 160 },
  { key: 'seniority', label: 'Seniority', column_type: 'text', position: 4, width: 120 },
  { key: 'industry', label: 'Industry', column_type: 'text', position: 5, width: 140 },
  { key: 'location', label: 'Location', column_type: 'text', position: 6, width: 160 },
  { key: 'current_company_domain', label: 'Company Domain', column_type: 'url', position: 7, width: 160 },
] as const

function getAiArkCompanyCellValue(company: NormalizedAiArkCompany, key: string): string | null {
  switch (key) {
    case 'company_name': return company.company_name || null
    case 'domain': return company.domain
    case 'industry': return company.industry
    case 'employee_count': return company.employee_count != null ? String(company.employee_count) : null
    case 'location': return company.location
    case 'description': return company.description
    case 'founded_year': return company.founded_year != null ? String(company.founded_year) : null
    case 'technologies': return company.technologies?.join(', ') || null
    case 'linkedin_url': return company.linkedin_url
    case 'website': return company.website
    default: return null
  }
}

function getAiArkContactCellValue(contact: NormalizedAiArkContact, key: string): string | null {
  switch (key) {
    case 'full_name': return contact.full_name || null
    case 'title': return contact.title
    case 'current_company': return contact.current_company
    case 'linkedin_url': return contact.linkedin_url
    case 'seniority': return contact.seniority
    case 'industry': return contact.industry
    case 'location': return contact.location
    case 'current_company_domain': return contact.current_company_domain
    default: return null
  }
}

// Standard columns for Apollo-sourced ops tables
const APOLLO_COLUMNS = [
  { key: 'full_name', label: 'Name', column_type: 'person', position: 0, width: 180 },
  { key: 'title', label: 'Title', column_type: 'text', position: 1, width: 200 },
  { key: 'company', label: 'Company', column_type: 'company', position: 2, width: 180 },
  { key: 'email', label: 'Email', column_type: 'email', position: 3, width: 220 },
  { key: 'linkedin_url', label: 'LinkedIn', column_type: 'linkedin', position: 4, width: 160 },
  { key: 'phone', label: 'Phone', column_type: 'text', position: 5, width: 140 },
  { key: 'website_url', label: 'Website', column_type: 'url', position: 6, width: 180 },
  { key: 'city', label: 'City', column_type: 'text', position: 7, width: 120 },
  { key: 'funding_stage', label: 'Funding Stage', column_type: 'text', position: 8, width: 130 },
  { key: 'employees', label: 'Employees', column_type: 'number', position: 9, width: 110 },
] as const

/**
 * Generate a table name from the search params if one is not provided.
 */
const FUNDING_LABELS: Record<string, string> = {
  seed: 'Seed',
  angel: 'Angel',
  venture: 'Venture',
  series_a: 'Series A',
  series_b: 'Series B',
  series_c: 'Series C',
  series_d: 'Series D',
  series_e: 'Series E',
  series_unknown: 'Series',
  private_equity: 'PE',
  debt_financing: 'Debt',
  convertible_note: 'Convertible',
  grant: 'Grant',
  corporate_round: 'Corporate',
  equity_crowdfunding: 'Crowdfunding',
  pre_seed: 'Pre-Seed',
  secondary_market: 'Secondary',
  post_ipo_equity: 'Post-IPO',
  post_ipo_debt: 'Post-IPO Debt',
  post_ipo_secondary: 'Post-IPO Secondary',
  non_equity_assistance: 'Non-Equity',
  undisclosed: 'Undisclosed',
  initial_coin_offering: 'ICO',
  other: 'Other',
}

function generateTableName(
  searchParams: CreateDynamicTableRequest['search_params'],
  queryDescription: string
): string {
  // Pick the single most descriptive element for the name
  let label = ''

  if (searchParams.person_titles?.length) {
    label = searchParams.person_titles[0]
  } else if (searchParams.q_keywords) {
    label = searchParams.q_keywords
  } else if (searchParams.q_organization_keyword_tags?.length) {
    label = searchParams.q_organization_keyword_tags[0]
  }

  // Add a qualifier if available (location or funding stage — pick one)
  let qualifier = ''
  if (searchParams.person_locations?.length) {
    qualifier = searchParams.person_locations[0]
  } else if (searchParams.organization_latest_funding_stage_cd?.length) {
    const stages = searchParams.organization_latest_funding_stage_cd
    qualifier = stages.length <= 2
      ? stages.map(s => FUNDING_LABELS[s] || s).join(', ')
      : `${FUNDING_LABELS[stages[0]] || stages[0]}+${stages.length - 1} more`
  }

  if (label && qualifier) {
    return truncateName(`${label} — ${qualifier}`)
  }
  if (label) {
    return truncateName(label)
  }

  // Fall back to a truncated version of the query description
  return truncateName(queryDescription || 'Apollo Search')
}

function truncateName(name: string, max = 50): string {
  if (name.length <= max) return name
  return name.slice(0, max - 1).trimEnd() + '…'
}

/**
 * Extract the cell value for a given column key from a normalized contact.
 */
function getCellValue(contact: NormalizedContact, key: string): string | null {
  switch (key) {
    case 'full_name':
      return contact.full_name || null
    case 'title':
      return contact.title || null
    case 'company':
      return contact.company || null
    case 'email':
      return contact.email
    case 'linkedin_url':
      return contact.linkedin_url
    case 'phone':
      return contact.phone
    case 'website_url':
      return contact.website_url
    case 'city':
      return contact.city
    case 'funding_stage':
      return contact.funding_stage
    case 'employees':
      return contact.employees != null ? String(contact.employees) : null
    default:
      return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ---------------------------------------------------------------
    // 1. Authenticate user
    // ---------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // User-scoped client (for auth only)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()

    if (authError || !user) {
      console.error('[copilot-dynamic-table] Auth error:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ---------------------------------------------------------------
    // 2. Get org_id from organization_memberships
    // ---------------------------------------------------------------
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      console.error('[copilot-dynamic-table] No organization found for user:', user.id)
      return new Response(
        JSON.stringify({ error: 'No organization found for user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const orgId = membership.org_id

    // Check credit balance before proceeding
    const creditCheck = await checkCreditBalance(userClient, orgId);
    if (!creditCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: 'insufficient_credits',
          message: creditCheck.message || 'Your organization has run out of AI credits. Please top up to continue.',
          balance: creditCheck.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---------------------------------------------------------------
    // 3. Parse request body
    // ---------------------------------------------------------------
    const body = (await req.json()) as CreateDynamicTableRequest

    if (!body.query_description || !body.search_params) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: query_description, search_params' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { source = 'apollo', action, query_description, search_params, table_name: requestedTableName, auto_enrich } = body

    // ---------------------------------------------------------------
    // AI Ark branch — separate flow for AI Ark data source
    // ---------------------------------------------------------------
    if (source === 'ai_ark') {
      const searchAction = action || 'company_search'
      const isCompanySearch = searchAction === 'company_search'
      const aiArkColumns = isCompanySearch ? AI_ARK_COMPANY_COLUMNS : AI_ARK_PEOPLE_COLUMNS

      // Call ai-ark-search edge function
      const aiArkResponse = await fetch(`${supabaseUrl}/functions/v1/ai-ark-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ action: searchAction, ...search_params, preview: false }),
      })

      if (!aiArkResponse.ok) {
        const errorBody = await aiArkResponse.text()
        console.error('[copilot-dynamic-table] AI Ark search failed:', aiArkResponse.status, errorBody)
        try {
          const parsed = JSON.parse(errorBody)
          return new Response(
            JSON.stringify({ error: parsed.error || 'AI Ark search failed', code: parsed.code }),
            { status: aiArkResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } catch {
          return new Response(
            JSON.stringify({ error: 'AI Ark search failed' }),
            { status: aiArkResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      const aiArkData = await aiArkResponse.json()
      const results = isCompanySearch
        ? (aiArkData.companies || []) as NormalizedAiArkCompany[]
        : (aiArkData.contacts || []) as NormalizedAiArkContact[]

      if (results.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No results found. Try broadening your search criteria.', code: 'NO_RESULTS' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Generate table name
      const tableName = requestedTableName || truncateName(query_description || 'AI Ark Search')

      // Create table
      const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey)
      const { data: newTable, error: tableError } = await serviceClient
        .from('dynamic_tables')
        .insert({
          organization_id: orgId,
          created_by: user.id,
          name: tableName,
          description: query_description,
          source_type: 'ai_ark',
          source_query: search_params,
        })
        .select('id, name')
        .single()

      if (tableError || !newTable) {
        console.error('[copilot-dynamic-table] Failed to create AI Ark table:', tableError?.message)
        if (tableError?.code === '23505') {
          return new Response(
            JSON.stringify({ error: `A table named "${tableName}" already exists.`, code: 'DUPLICATE_TABLE_NAME' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        return new Response(
          JSON.stringify({ error: 'Failed to create ops table' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const tableId = newTable.id

      // Insert columns
      const colInserts = aiArkColumns.map((col) => ({
        table_id: tableId,
        key: col.key,
        label: col.label,
        column_type: col.column_type,
        position: col.position,
        width: col.width,
        is_enrichment: false,
        is_visible: true,
      }))

      const { data: columns, error: colErr } = await serviceClient
        .from('dynamic_table_columns')
        .insert(colInserts)
        .select('id, key')

      if (colErr || !columns) {
        await serviceClient.from('dynamic_tables').delete().eq('id', tableId)
        return new Response(
          JSON.stringify({ error: 'Failed to create table columns' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const colKeyToId: Record<string, string> = {}
      for (const col of columns) colKeyToId[col.key] = col.id

      // Insert rows
      const rowInserts = results.map((item: NormalizedAiArkCompany | NormalizedAiArkContact, index: number) => ({
        table_id: tableId,
        row_index: index,
        source_id: isCompanySearch ? (item as NormalizedAiArkCompany).ai_ark_id : (item as NormalizedAiArkContact).ai_ark_id,
        source_data: item as unknown as Record<string, unknown>,
      }))

      const { data: rows, error: rowErr } = await serviceClient
        .from('dynamic_table_rows')
        .insert(rowInserts)
        .select('id, row_index')

      if (rowErr || !rows) {
        await serviceClient.from('dynamic_tables').delete().eq('id', tableId)
        return new Response(
          JSON.stringify({ error: 'Failed to create table rows' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Insert cells
      const cellInserts: Array<{ row_id: string; column_id: string; value: string | null; source: string; status: string }> = []
      const sortedRows = [...rows].sort((a, b) => a.row_index - b.row_index)

      for (let i = 0; i < sortedRows.length; i++) {
        const row = sortedRows[i]
        const item = results[i]

        for (const col of aiArkColumns) {
          const columnId = colKeyToId[col.key]
          if (!columnId) continue
          const value = isCompanySearch
            ? getAiArkCompanyCellValue(item as NormalizedAiArkCompany, col.key)
            : getAiArkContactCellValue(item as NormalizedAiArkContact, col.key)
          cellInserts.push({ row_id: row.id, column_id: columnId, value, source: 'ai_ark', status: 'none' })
        }
      }

      if (cellInserts.length > 0) {
        const { error: cellErr } = await serviceClient.from('dynamic_table_cells').insert(cellInserts)
        if (cellErr) {
          await serviceClient.from('dynamic_tables').delete().eq('id', tableId)
          return new Response(
            JSON.stringify({ error: 'Failed to populate table data' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      console.log(`[copilot-dynamic-table] AI Ark: Created table ${tableId} with ${rows.length} rows, ${cellInserts.length} cells`)

      // Auto-enrich via ai-ark-enrich if requested
      let enrichedCount = 0
      if (auto_enrich?.email || auto_enrich?.phone || auto_enrich?.linkedin) {
        for (const key of ['email', 'phone', 'linkedin_url'] as const) {
          const shouldEnrich = key === 'email' ? auto_enrich.email : key === 'phone' ? auto_enrich.phone : auto_enrich.linkedin
          if (!shouldEnrich || !colKeyToId[key]) continue

          try {
            const enrichResp = await fetch(`${supabaseUrl}/functions/v1/ai-ark-enrich`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: authHeader, apikey: supabaseAnonKey },
              body: JSON.stringify({ action: 'bulk_enrich', table_id: tableId, column_id: colKeyToId[key] }),
            })
            if (enrichResp.ok) {
              const result = await enrichResp.json()
              enrichedCount += result.enriched || 0
            }
          } catch (e) {
            console.warn(`[copilot-dynamic-table] AI Ark ${key} enrichment error:`, e)
          }
        }
      }

      // Build preview
      const previewItems = results.slice(0, 5)
      const previewRows = isCompanySearch
        ? previewItems.map((c) => {
            const co = c as NormalizedAiArkCompany
            return { Company: co.company_name, Domain: co.domain || '', Industry: co.industry || '', Employees: co.employee_count != null ? String(co.employee_count) : '', Location: co.location || '' }
          })
        : previewItems.map((c) => {
            const ct = c as NormalizedAiArkContact
            return { Name: ct.full_name, Title: ct.title || '', Company: ct.company || '', Email: ct.email || '', LinkedIn: ct.linkedin_url || '' }
          })

      const previewColumns = isCompanySearch
        ? ['Company', 'Domain', 'Industry', 'Employees', 'Location']
        : ['Name', 'Title', 'Company', 'Email', 'LinkedIn']

      return new Response(JSON.stringify({
        table_id: tableId,
        table_name: newTable.name,
        row_count: results.length,
        column_count: aiArkColumns.length,
        source_type: 'ai_ark',
        enriched_count: enrichedCount,
        preview_rows: previewRows,
        preview_columns: previewColumns,
        query_description,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ---------------------------------------------------------------
    // Apollo flow (default) — existing behavior
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // 4a. Build dedup lookup BEFORE searching (so we can page through dupes)
    // ---------------------------------------------------------------
    const serviceClientForDedup = createClient(supabaseUrl, supabaseServiceRoleKey)

    const [{ data: orgMembers }, { data: orgTables }] = await Promise.all([
      serviceClientForDedup
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', orgId),
      serviceClientForDedup
        .from('dynamic_tables')
        .select('id, source_type')
        .eq('organization_id', orgId),
    ])

    const orgUserIds = (orgMembers || []).map((m: { user_id: string }) => m.user_id)
    const allOrgTableIds = (orgTables || []).map((t: { id: string }) => t.id)
    const apolloTableIds = (orgTables || [])
      .filter((t: { source_type: string | null }) => t.source_type === 'apollo')
      .map((t: { id: string }) => t.id)

    console.log(`[copilot-dynamic-table] Dedup context: ${orgUserIds.length} org users, ${allOrgTableIds.length} org tables (${apolloTableIds.length} Apollo)`)

    const [crmResult, sourceIdResult, opsDataResult] = await Promise.all([
      orgUserIds.length > 0
        ? serviceClientForDedup
            .from('contacts')
            .select('first_name, last_name, title, company')
            .in('owner_id', orgUserIds)
            .limit(10000)
        : Promise.resolve({ data: [] as Array<{ first_name: string | null; last_name: string | null; title: string | null; company: string | null }> }),

      allOrgTableIds.length > 0
        ? serviceClientForDedup
            .from('dynamic_table_rows')
            .select('source_id')
            .in('table_id', allOrgTableIds)
            .not('source_id', 'is', null)
            .limit(50000)
        : Promise.resolve({ data: [] as Array<{ source_id: string }> }),

      apolloTableIds.length > 0
        ? serviceClientForDedup
            .from('dynamic_table_rows')
            .select('source_data')
            .in('table_id', apolloTableIds)
            .not('source_data', 'is', null)
            .limit(10000)
        : Promise.resolve({ data: [] as Array<{ source_data: Record<string, unknown> | null }> }),
    ])

    const crmContacts = (('data' in crmResult ? crmResult.data : crmResult) || []) as Array<{
      first_name: string | null
      last_name: string | null
      title: string | null
      company: string | null
    }>

    const sourceIdRows = (('data' in sourceIdResult ? sourceIdResult.data : sourceIdResult) || []) as Array<{
      source_id: string
    }>

    const opsDataRows = (('data' in opsDataResult ? opsDataResult.data : opsDataResult) || []) as Array<{
      source_data: Record<string, unknown> | null
    }>

    const existingApolloIds = new Set(
      sourceIdRows.map((r) => r.source_id).filter(Boolean)
    )

    console.log(`[copilot-dynamic-table] Dedup: ${crmContacts.length} CRM contacts, ${existingApolloIds.size} existing source IDs, ${opsDataRows.length} ops rows with data`)

    const opsContacts: Array<{ first_name: string | null; title: string | null; company: string | null }> = []
    for (const row of opsDataRows) {
      if (!row.source_data) continue
      const sd = row.source_data
      opsContacts.push({
        first_name: (sd.first_name as string) || null,
        title: (sd.title as string) || null,
        company: (sd.company as string) || (sd.organization_name as string) || null,
      })
    }

    const TITLE_ABBREVIATIONS: Record<string, string[]> = {
      'vice president': ['vp', 'v.p.'],
      'chief executive officer': ['ceo', 'c.e.o.'],
      'chief technology officer': ['cto', 'c.t.o.'],
      'chief financial officer': ['cfo', 'c.f.o.'],
      'chief operating officer': ['coo', 'c.o.o.'],
      'chief marketing officer': ['cmo', 'c.m.o.'],
      'chief revenue officer': ['cro', 'c.r.o.'],
      'chief information officer': ['cio', 'c.i.o.'],
      'chief product officer': ['cpo', 'c.p.o.'],
      'senior vice president': ['svp', 'sr vp', 'sr. vp'],
      'executive vice president': ['evp'],
      'managing director': ['md', 'm.d.'],
      'general manager': ['gm', 'g.m.'],
      'director': ['dir', 'dir.'],
      'manager': ['mgr', 'mgr.'],
      'senior': ['sr', 'sr.'],
      'junior': ['jr', 'jr.'],
    }

    function normalizeTitle(title: string): string {
      if (!title) return ''
      let normalized = title.toLowerCase().trim()
      normalized = normalized.replace(/\s*\([^)]*\)\s*/g, ' ')
      for (const [full, abbrevs] of Object.entries(TITLE_ABBREVIATIONS)) {
        for (const abbrev of abbrevs) {
          const pattern = new RegExp(`\\b${abbrev.replace(/\./g, '\\.')}\\b`, 'gi')
          normalized = normalized.replace(pattern, full)
        }
      }
      normalized = normalized.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
      const words = normalized.split(' ')
      const deduped: string[] = []
      for (const word of words) {
        if (deduped.length === 0 || deduped[deduped.length - 1] !== word) {
          deduped.push(word)
        }
      }
      return deduped.join(' ')
    }

    const knownByFirstName = new Map<string, Array<{ title: string; company: string }>>()

    const addToLookup = (firstName: string | null, title: string | null, company: string | null) => {
      if (!firstName) return
      const key = firstName.toLowerCase().trim()
      if (!key) return
      if (!knownByFirstName.has(key)) knownByFirstName.set(key, [])
      knownByFirstName.get(key)!.push({
        title: normalizeTitle(title || ''),
        company: normalizeCompanyName(company || ''),
      })
    }

    for (const c of crmContacts) {
      addToLookup(c.first_name, c.title, c.company)
    }
    for (const c of opsContacts) {
      addToLookup(c.first_name, c.title, c.company)
    }

    console.log(`[copilot-dynamic-table] Dedup lookup: ${knownByFirstName.size} unique first names across CRM + ops`)

    // Dedup filter function (reused across pages)
    function filterDuplicates(contacts: NormalizedContact[]): NormalizedContact[] {
      return contacts.filter((contact) => {
        if (existingApolloIds.has(contact.apollo_id)) return false

        const firstName = (contact.first_name || '').toLowerCase().trim()
        if (!firstName) return true

        const candidates = knownByFirstName.get(firstName)
        if (!candidates || candidates.length === 0) return true

        const contactCompany = normalizeCompanyName(contact.company || '')
        const contactTitle = normalizeTitle(contact.title || '')

        for (const candidate of candidates) {
          const companySim = contactCompany && candidate.company
            ? calculateStringSimilarity(contactCompany, candidate.company)
            : 0
          const companyMatch = companySim >= 0.8

          const titleSim = contactTitle && candidate.title
            ? calculateStringSimilarity(contactTitle, candidate.title)
            : 0
          const titleMatch = titleSim >= 0.7

          if (companyMatch && titleMatch) return false
        }

        return true
      })
    }

    // ---------------------------------------------------------------
    // 4b. Search Apollo with pagination — skip pages of all-duplicates
    // ---------------------------------------------------------------
    const MAX_PAGES = 5
    const desiredCount = search_params.per_page || 25
    let currentPage = search_params.page || 1
    let allNewContacts: NormalizedContact[] = []
    let totalSearched = 0
    let totalDuplicates = 0
    let hasMore = true

    console.log(`[copilot-dynamic-table] Calling apollo-search with params:`, JSON.stringify(search_params))

    for (let attempt = 0; attempt < MAX_PAGES && hasMore; attempt++) {
      const searchParamsWithPage = { ...search_params, page: currentPage }
      if (attempt > 0) {
        console.log(`[copilot-dynamic-table] Page ${currentPage}: fetching more results (have ${allNewContacts.length}/${desiredCount} net-new so far)`)
      }

      const apolloResponse = await fetch(`${supabaseUrl}/functions/v1/apollo-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify(searchParamsWithPage),
      })

      if (!apolloResponse.ok) {
        const errorBody = await apolloResponse.text()
        console.error('[copilot-dynamic-table] Apollo search failed:', apolloResponse.status, errorBody)

        // If we already have some results from previous pages, use those
        if (allNewContacts.length > 0) break

        try {
          const parsed = JSON.parse(errorBody)
          return new Response(
            JSON.stringify({ error: parsed.error || 'Apollo search failed', code: parsed.code }),
            { status: apolloResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } catch {
          return new Response(
            JSON.stringify({ error: 'Apollo search failed' }),
            { status: apolloResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      const apolloData = (await apolloResponse.json()) as ApolloSearchResponse
      const pageContacts = apolloData.contacts || []
      hasMore = apolloData.pagination?.has_more ?? false

      if (pageContacts.length === 0) break

      totalSearched += pageContacts.length

      // Dedup this page
      const netNew = filterDuplicates(pageContacts)
      totalDuplicates += pageContacts.length - netNew.length
      allNewContacts.push(...netNew)

      // Also add new contacts to the dedup sets so cross-page dedup works
      for (const c of netNew) {
        existingApolloIds.add(c.apollo_id)
      }

      console.log(`[copilot-dynamic-table] Page ${currentPage}: ${pageContacts.length} results, ${netNew.length} net-new, ${allNewContacts.length} total net-new`)

      // Enough net-new contacts? Stop paging
      if (allNewContacts.length >= desiredCount) break

      currentPage++
    }

    if (totalSearched === 0) {
      return new Response(
        JSON.stringify({
          error: 'No results found for your search criteria. Try broadening your filters.',
          code: 'NO_RESULTS',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const dedupStats = { total: totalSearched, duplicates: totalDuplicates, net_new: allNewContacts.length }

    console.log(`[copilot-dynamic-table] Dedup final: ${totalSearched} total searched across ${currentPage - (search_params.page || 1) + 1} pages, ${totalDuplicates} duplicates removed, ${allNewContacts.length} net new`)

    if (allNewContacts.length === 0) {
      return new Response(
        JSON.stringify({
          error: `All ${totalSearched} contacts found across ${currentPage} pages are already in your CRM or previously imported. Try a different search.`,
          code: 'ALL_DUPLICATES',
          dedup: dedupStats,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Trim to desired count
    const filteredContacts = allNewContacts.slice(0, desiredCount)
    const duplicateCount = totalDuplicates

    // ---------------------------------------------------------------
    // 5. Generate table name
    // ---------------------------------------------------------------
    const tableName = requestedTableName || generateTableName(search_params, query_description)

    // ---------------------------------------------------------------
    // 6. Create ops table + columns + rows + cells using service role
    // ---------------------------------------------------------------
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    // 6a. Insert the ops table
    const { data: newTable, error: tableError } = await serviceClient
      .from('dynamic_tables')
      .insert({
        organization_id: orgId,
        created_by: user.id,
        name: tableName,
        description: query_description,
        source_type: 'apollo',
        source_query: search_params,
      })
      .select('id, name')
      .single()

    if (tableError || !newTable) {
      console.error('[copilot-dynamic-table] Failed to create table:', tableError?.message)

      // Handle unique constraint violation (duplicate table name)
      if (tableError?.code === '23505') {
        return new Response(
          JSON.stringify({
            error: `A table named "${tableName}" already exists. Please provide a different name.`,
            code: 'DUPLICATE_TABLE_NAME',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Failed to create ops table' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tableId = newTable.id
    console.log(`[copilot-dynamic-table] Created table: ${tableId} — "${newTable.name}"`)

    // 6b. Insert standard columns (with apollo_property_name when auto-enrich is requested)
    const enrichEmail = auto_enrich?.email === true
    const enrichPhone = auto_enrich?.phone === true
    const hasAnyEnrich = enrichEmail || enrichPhone

    // Map column keys to their Apollo enrichment property names.
    // When enrichment is requested, we tag additional columns so they can be
    // populated from the cached Apollo response (zero extra API calls).
    const ENRICH_COLUMN_MAP: Record<string, string> = {
      email: 'email',
      phone: 'phone',
      linkedin_url: 'linkedin_url',
      city: 'city',
      website_url: 'company_website',
      funding_stage: 'company_funding',
      employees: 'company_employees',
    }

    const columnInserts = APOLLO_COLUMNS.map((col) => {
      // Only tag email/phone columns if specifically requested
      const tagEmail = col.key === 'email' && enrichEmail
      const tagPhone = col.key === 'phone' && enrichPhone
      // Tag other columns whenever ANY enrichment is requested (they use the cache)
      const tagOther = hasAnyEnrich && col.key !== 'email' && col.key !== 'phone' && ENRICH_COLUMN_MAP[col.key]

      return {
        table_id: tableId,
        key: col.key,
        label: col.label,
        column_type: col.column_type,
        position: col.position,
        width: col.width,
        is_enrichment: false,
        is_visible: true,
        ...(tagEmail ? { apollo_property_name: 'email' } : {}),
        ...(tagPhone ? { apollo_property_name: 'phone' } : {}),
        ...(tagOther ? { apollo_property_name: ENRICH_COLUMN_MAP[col.key] } : {}),
      }
    })

    const { data: columns, error: columnsError } = await serviceClient
      .from('dynamic_table_columns')
      .insert(columnInserts)
      .select('id, key')

    if (columnsError || !columns) {
      console.error('[copilot-dynamic-table] Failed to create columns:', columnsError?.message)
      // Clean up the table we just created
      await serviceClient.from('dynamic_tables').delete().eq('id', tableId)
      return new Response(
        JSON.stringify({ error: 'Failed to create table columns' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build a key→id map for quick lookup when inserting cells
    const columnKeyToId: Record<string, string> = {}
    for (const col of columns) {
      columnKeyToId[col.key] = col.id
    }

    // 6c. Insert rows
    const rowInserts = filteredContacts.map((contact, index) => ({
      table_id: tableId,
      row_index: index,
      source_id: contact.apollo_id,
      source_data: contact as unknown as Record<string, unknown>,
    }))

    const { data: rows, error: rowsError } = await serviceClient
      .from('dynamic_table_rows')
      .insert(rowInserts)
      .select('id, row_index')

    if (rowsError || !rows) {
      console.error('[copilot-dynamic-table] Failed to create rows:', rowsError?.message)
      // Clean up — cascade delete will handle columns
      await serviceClient.from('dynamic_tables').delete().eq('id', tableId)
      return new Response(
        JSON.stringify({ error: 'Failed to create table rows' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6d. Bulk insert all cells
    const cellInserts: Array<{
      row_id: string
      column_id: string
      value: string | null
      source: string
      status: string
    }> = []

    // Sort rows by row_index to align with contacts array
    const sortedRows = [...rows].sort((a, b) => a.row_index - b.row_index)

    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i]
      const contact = filteredContacts[i]

      for (const col of APOLLO_COLUMNS) {
        const columnId = columnKeyToId[col.key]
        if (!columnId) continue

        cellInserts.push({
          row_id: row.id,
          column_id: columnId,
          value: getCellValue(contact, col.key),
          source: 'apollo',
          status: 'none',
        })
      }
    }

    if (cellInserts.length > 0) {
      const { error: cellsError } = await serviceClient
        .from('dynamic_table_cells')
        .insert(cellInserts)

      if (cellsError) {
        console.error('[copilot-dynamic-table] Failed to create cells:', cellsError.message)
        // Clean up — cascade delete will handle columns + rows
        await serviceClient.from('dynamic_tables').delete().eq('id', tableId)
        return new Response(
          JSON.stringify({ error: 'Failed to populate table data' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    console.log(
      `[copilot-dynamic-table] Inserted ${rows.length} rows, ${cellInserts.length} cells`
    )

    // ---------------------------------------------------------------
    // 7. Auto-enrich email/phone if requested
    // ---------------------------------------------------------------
    let enrichmentStats: { email?: Record<string, number>; phone?: Record<string, number> } = {}

    // Primary enrichment: email and/or phone (these make the actual Apollo API calls)
    const primaryEnrich: Array<{ columnId: string; key: string }> = []
    if (enrichEmail && columnKeyToId['email']) {
      primaryEnrich.push({ columnId: columnKeyToId['email'], key: 'email' })
    }
    if (enrichPhone && columnKeyToId['phone']) {
      primaryEnrich.push({ columnId: columnKeyToId['phone'], key: 'phone' })
    }

    for (const { columnId, key } of primaryEnrich) {
      try {
        console.log(`[copilot-dynamic-table] Auto-enriching ${key} column: ${columnId}`)

        const enrichResponse = await fetch(`${supabaseUrl}/functions/v1/apollo-enrich`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({
            table_id: tableId,
            column_id: columnId,
            reveal_personal_emails: key === 'email' ? (auto_enrich?.reveal_personal_emails ?? false) : false,
            reveal_phone_number: key === 'phone' ? (auto_enrich?.reveal_phone_number ?? false) : false,
          }),
        })

        if (enrichResponse.ok) {
          const enrichResult = await enrichResponse.json()
          enrichmentStats[key as 'email' | 'phone'] = enrichResult
          console.log(`[copilot-dynamic-table] ${key} enrichment:`, JSON.stringify(enrichResult))
        } else {
          const errorText = await enrichResponse.text()
          console.error(`[copilot-dynamic-table] ${key} enrichment failed:`, enrichResponse.status, errorText)
        }
      } catch (enrichError) {
        console.error(`[copilot-dynamic-table] ${key} enrichment error:`, enrichError)
      }
    }

    // Secondary enrichment: fill additional columns from the cached Apollo data
    // (zero API calls — apollo-enrich detects source_data.apollo cache and extracts)
    if (hasAnyEnrich && primaryEnrich.length > 0) {
      const secondaryKeys = ['linkedin_url', 'city', 'website_url', 'funding_stage', 'employees']
      const secondaryEnrich = secondaryKeys
        .filter((key) => columnKeyToId[key] && ENRICH_COLUMN_MAP[key])
        .map((key) => ({ columnId: columnKeyToId[key], key, apolloProp: ENRICH_COLUMN_MAP[key] }))

      if (secondaryEnrich.length > 0) {
        console.log(`[copilot-dynamic-table] Filling ${secondaryEnrich.length} extra columns from cache: ${secondaryEnrich.map(s => s.key).join(', ')}`)

        // Run all secondary enrichments in parallel (they only read from cache)
        await Promise.allSettled(
          secondaryEnrich.map(async ({ columnId, key }) => {
            try {
              const resp = await fetch(`${supabaseUrl}/functions/v1/apollo-enrich`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: authHeader,
                  apikey: supabaseAnonKey,
                },
                body: JSON.stringify({
                  table_id: tableId,
                  column_id: columnId,
                }),
              })
              if (!resp.ok) {
                console.warn(`[copilot-dynamic-table] Secondary enrich ${key} failed:`, resp.status)
              }
            } catch (e) {
              console.warn(`[copilot-dynamic-table] Secondary enrich ${key} error:`, e)
            }
          })
        )
      }

      // Post-enrichment: update full_name cells and root source_data with unmasked data
      // After apollo-enrich runs, source_data.apollo has the real first_name/last_name
      try {
        console.log('[copilot-dynamic-table] Post-enrichment: updating names and source_data with unmasked data')

        // Re-read rows to get updated source_data with apollo cache
        const { data: enrichedRows } = await serviceClient
          .from('dynamic_table_rows')
          .select('id, source_data')
          .eq('table_id', tableId)

        if (enrichedRows && enrichedRows.length > 0) {
          const nameColumnId = columnKeyToId['full_name']
          const nameCellUpserts: Array<{ row_id: string; column_id: string; value: string; source: string; status: string }> = []
          const rowUpdates: Array<{ id: string; source_data: Record<string, unknown> }> = []

          for (const row of enrichedRows) {
            const sd = (row.source_data || {}) as Record<string, unknown>
            const apolloData = sd.apollo as Record<string, unknown> | undefined
            if (!apolloData) continue

            const firstName = apolloData.first_name as string | undefined
            const lastName = apolloData.last_name as string | undefined
            const org = apolloData.organization as Record<string, unknown> | undefined
            const companyDomain = org?.primary_domain as string | undefined

            if (firstName || lastName) {
              const fullName = [firstName, lastName].filter(Boolean).join(' ')

              // Update full_name cell with unmasked name
              if (nameColumnId && fullName) {
                nameCellUpserts.push({
                  row_id: row.id,
                  column_id: nameColumnId,
                  value: fullName,
                  source: 'apollo',
                  status: 'none',
                })
              }

              // Update root source_data with unmasked fields
              const updatedSourceData = {
                ...sd,
                first_name: firstName || sd.first_name,
                last_name: lastName || sd.last_name,
                full_name: fullName || sd.full_name,
                ...(companyDomain ? { company_domain: companyDomain } : {}),
              }
              rowUpdates.push({ id: row.id, source_data: updatedSourceData })
            }
          }

          // Batch upsert name cells
          if (nameCellUpserts.length > 0) {
            const { error: nameErr } = await serviceClient
              .from('dynamic_table_cells')
              .upsert(nameCellUpserts, { onConflict: 'row_id,column_id' })
            if (nameErr) {
              console.warn('[copilot-dynamic-table] Post-enrichment name cell upsert warning:', nameErr.message)
            } else {
              console.log(`[copilot-dynamic-table] Updated ${nameCellUpserts.length} name cells with unmasked data`)
            }
          }

          // Batch update row source_data (in chunks of 50 for safety)
          if (rowUpdates.length > 0) {
            const CHUNK_SIZE = 50
            for (let i = 0; i < rowUpdates.length; i += CHUNK_SIZE) {
              const chunk = rowUpdates.slice(i, i + CHUNK_SIZE)
              await Promise.allSettled(
                chunk.map(({ id, source_data }) =>
                  serviceClient
                    .from('dynamic_table_rows')
                    .update({ source_data })
                    .eq('id', id)
                )
              )
            }
            console.log(`[copilot-dynamic-table] Updated ${rowUpdates.length} rows source_data with unmasked fields`)
          }
        }
      } catch (postEnrichErr) {
        console.warn('[copilot-dynamic-table] Post-enrichment update warning:', postEnrichErr)
        // Non-fatal — table still works with masked names
      }
    }

    // ---------------------------------------------------------------
    // 8. Build response for the DynamicTableResponse component
    // ---------------------------------------------------------------
    const previewContacts = filteredContacts.slice(0, 5)
    const previewRows = previewContacts.map((contact) => ({
      Name: contact.full_name,
      Title: contact.title,
      Company: contact.company,
      Email: contact.email || '',
      LinkedIn: contact.linkedin_url || '',
    }))

    const totalEnriched = (enrichmentStats.email?.enriched ?? 0) + (enrichmentStats.phone?.enriched ?? 0)

    const response = {
      table_id: tableId,
      table_name: newTable.name,
      row_count: filteredContacts.length,
      column_count: APOLLO_COLUMNS.length,
      source_type: 'apollo' as const,
      enriched_count: totalEnriched,
      preview_rows: previewRows,
      preview_columns: ['Name', 'Title', 'Company', 'Email', 'LinkedIn'],
      query_description,
      enrichment: Object.keys(enrichmentStats).length > 0 ? enrichmentStats : undefined,
      dedup: duplicateCount > 0 ? dedupStats : undefined,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[copilot-dynamic-table] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
