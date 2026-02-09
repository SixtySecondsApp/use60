import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { normalizeCompanyName, calculateStringSimilarity } from '../_shared/companyMatching.ts'
import { getCorsHeaders } from '../_shared/corsHelper.ts'

interface CollectMoreRequest {
  table_id: string
  search_params: {
    person_titles?: string[]
    person_locations?: string[]
    organization_num_employees_ranges?: string[]
    organization_latest_funding_stage_cd?: string[]
    q_keywords?: string
    q_organization_keyword_tags?: string[]
    person_seniorities?: string[]
    person_departments?: string[]
    q_organization_domains?: string[]
    contact_email_status?: string[]
    per_page?: number
    page?: number
  }
  desired_count: number
  auto_enrich?: {
    email?: boolean
    phone?: boolean
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

// Title normalization for dedup (same as copilot-dynamic-table)
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

serve(async (req) => {
  const cors = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    // 1. Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Get org_id
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'No organization found for user' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const orgId = membership.org_id

    // 3. Parse request
    const body = (await req.json()) as CollectMoreRequest

    if (!body.table_id || !body.search_params || !body.desired_count) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: table_id, search_params, desired_count' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const { table_id, search_params, desired_count, auto_enrich } = body

    // 4. Validate table exists and belongs to org
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    const { data: table, error: tableError } = await serviceClient
      .from('dynamic_tables')
      .select('id, organization_id, source_type, source_query, row_count')
      .eq('id', table_id)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (tableError || !table) {
      return new Response(
        JSON.stringify({ error: 'Table not found or access denied' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    if (table.source_type !== 'apollo') {
      return new Response(
        JSON.stringify({ error: 'Collect more is only available for Apollo-sourced tables' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Get existing columns for this table
    const { data: columns, error: colError } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table_id)

    if (colError || !columns || columns.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Table has no columns' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const columnKeyToId: Record<string, string> = {}
    for (const col of columns) {
      columnKeyToId[col.key] = col.id
    }

    // 6. Build dedup context
    const [{ data: orgMembers }, { data: orgTables }] = await Promise.all([
      serviceClient
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', orgId),
      serviceClient
        .from('dynamic_tables')
        .select('id, source_type')
        .eq('organization_id', orgId),
    ])

    const orgUserIds = (orgMembers || []).map((m: { user_id: string }) => m.user_id)
    const allOrgTableIds = (orgTables || []).map((t: { id: string }) => t.id)
    const apolloTableIds = (orgTables || [])
      .filter((t: { source_type: string | null }) => t.source_type === 'apollo')
      .map((t: { id: string }) => t.id)

    const [crmResult, sourceIdResult, opsDataResult] = await Promise.all([
      orgUserIds.length > 0
        ? serviceClient
            .from('contacts')
            .select('first_name, last_name, title, company')
            .in('owner_id', orgUserIds)
            .limit(10000)
        : Promise.resolve({ data: [] as Array<{ first_name: string | null; last_name: string | null; title: string | null; company: string | null }> }),

      allOrgTableIds.length > 0
        ? serviceClient
            .from('dynamic_table_rows')
            .select('source_id')
            .in('table_id', allOrgTableIds)
            .not('source_id', 'is', null)
            .limit(50000)
        : Promise.resolve({ data: [] as Array<{ source_id: string }> }),

      apolloTableIds.length > 0
        ? serviceClient
            .from('dynamic_table_rows')
            .select('source_data')
            .in('table_id', apolloTableIds)
            .not('source_data', 'is', null)
            .limit(10000)
        : Promise.resolve({ data: [] as Array<{ source_data: Record<string, unknown> | null }> }),
    ])

    const crmContacts = (('data' in crmResult ? crmResult.data : crmResult) || []) as Array<{
      first_name: string | null; last_name: string | null; title: string | null; company: string | null
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

    // 7. Paginated Apollo search
    const MAX_PAGES = 5
    let currentPage = 1
    let allNewContacts: NormalizedContact[] = []
    let totalSearched = 0
    let totalDuplicates = 0
    let hasMore = true

    console.log(`[apollo-collect-more] Searching for ${desired_count} more contacts for table ${table_id}`)

    for (let attempt = 0; attempt < MAX_PAGES && hasMore; attempt++) {
      const searchParamsWithPage = { ...search_params, page: currentPage, per_page: Math.min(desired_count * 2, 100) }

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
        if (allNewContacts.length > 0) break
        const errorBody = await apolloResponse.text()
        console.error('[apollo-collect-more] Apollo search failed:', apolloResponse.status, errorBody)
        try {
          const parsed = JSON.parse(errorBody)
          return new Response(
            JSON.stringify({ error: parsed.error || 'Apollo search failed', code: parsed.code }),
            { status: apolloResponse.status, headers: { ...cors, 'Content-Type': 'application/json' } }
          )
        } catch {
          return new Response(
            JSON.stringify({ error: 'Apollo search failed' }),
            { status: apolloResponse.status, headers: { ...cors, 'Content-Type': 'application/json' } }
          )
        }
      }

      const apolloData = (await apolloResponse.json()) as ApolloSearchResponse
      const pageContacts = apolloData.contacts || []
      hasMore = apolloData.pagination?.has_more ?? false

      if (pageContacts.length === 0) break

      totalSearched += pageContacts.length

      const netNew = filterDuplicates(pageContacts)
      totalDuplicates += pageContacts.length - netNew.length
      allNewContacts.push(...netNew)

      // Add to dedup sets for cross-page dedup
      for (const c of netNew) {
        existingApolloIds.add(c.apollo_id)
      }

      console.log(`[apollo-collect-more] Page ${currentPage}: ${pageContacts.length} results, ${netNew.length} net-new, ${allNewContacts.length} total net-new`)

      if (allNewContacts.length >= desired_count) break
      currentPage++
    }

    if (allNewContacts.length === 0) {
      return new Response(
        JSON.stringify({
          rows_added: 0,
          total_searched: totalSearched,
          duplicates_skipped: totalDuplicates,
          new_row_count: table.row_count || 0,
          message: totalSearched > 0
            ? 'All contacts found are already in your table or CRM. Try different filters.'
            : 'No results matched your search criteria.',
        }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // Trim to desired count
    const contactsToAdd = allNewContacts.slice(0, desired_count)

    // 8. Get max row_index
    const { data: maxRowData } = await serviceClient
      .from('dynamic_table_rows')
      .select('row_index')
      .eq('table_id', table_id)
      .order('row_index', { ascending: false })
      .limit(1)
      .maybeSingle()

    const startIndex = (maxRowData?.row_index ?? -1) + 1

    // 9. Insert rows
    const rowInserts = contactsToAdd.map((contact, index) => ({
      table_id,
      row_index: startIndex + index,
      source_id: contact.apollo_id,
      source_data: contact as unknown as Record<string, unknown>,
    }))

    const { data: newRows, error: rowsError } = await serviceClient
      .from('dynamic_table_rows')
      .insert(rowInserts)
      .select('id, row_index')

    if (rowsError || !newRows) {
      console.error('[apollo-collect-more] Failed to insert rows:', rowsError?.message)
      return new Response(
        JSON.stringify({ error: 'Failed to insert rows' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // 10. Insert cells
    const cellInserts: Array<{
      row_id: string
      column_id: string
      value: string | null
      source: string
      status: string
    }> = []

    const sortedRows = [...newRows].sort((a, b) => a.row_index - b.row_index)

    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i]
      const contact = contactsToAdd[i]

      for (const [key, columnId] of Object.entries(columnKeyToId)) {
        const value = getCellValue(contact, key)
        if (value !== undefined) {
          cellInserts.push({
            row_id: row.id,
            column_id: columnId,
            value,
            source: 'apollo',
            status: 'none',
          })
        }
      }
    }

    if (cellInserts.length > 0) {
      const { error: cellsError } = await serviceClient
        .from('dynamic_table_cells')
        .insert(cellInserts)

      if (cellsError) {
        console.error('[apollo-collect-more] Failed to insert cells:', cellsError.message)
      }
    }

    // 11. Update row_count and source_query on the table
    const newRowCount = (table.row_count || 0) + contactsToAdd.length

    await serviceClient
      .from('dynamic_tables')
      .update({
        row_count: newRowCount,
        source_query: search_params,
        updated_at: new Date().toISOString(),
      })
      .eq('id', table_id)

    console.log(`[apollo-collect-more] Added ${contactsToAdd.length} rows to table ${table_id}. New count: ${newRowCount}`)

    // 12. Optional auto-enrichment
    if (auto_enrich?.email && columnKeyToId['email']) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/apollo-enrich`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({
            table_id,
            column_id: columnKeyToId['email'],
            row_ids: newRows.map((r: { id: string }) => r.id),
            reveal_personal_emails: auto_enrich.reveal_personal_emails ?? false,
          }),
        })
      } catch (e) {
        console.warn('[apollo-collect-more] Email enrichment failed:', e)
      }
    }

    if (auto_enrich?.phone && columnKeyToId['phone']) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/apollo-enrich`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({
            table_id,
            column_id: columnKeyToId['phone'],
            row_ids: newRows.map((r: { id: string }) => r.id),
            reveal_phone_number: auto_enrich.reveal_phone_number ?? false,
          }),
        })
      } catch (e) {
        console.warn('[apollo-collect-more] Phone enrichment failed:', e)
      }
    }

    return new Response(
      JSON.stringify({
        rows_added: contactsToAdd.length,
        total_searched: totalSearched,
        duplicates_skipped: totalDuplicates,
        new_row_count: newRowCount,
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[apollo-collect-more] Unexpected error:', error)
    const cors = getCorsHeaders(req)
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
