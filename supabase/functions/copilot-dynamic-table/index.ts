import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateDynamicTableRequest {
  query_description: string
  search_params: {
    person_titles?: string[]
    person_locations?: string[]
    organization_num_employees_ranges?: string[]
    organization_latest_funding_stage_cd?: string[]
    q_keywords?: string
    q_organization_keyword_tags?: string[]
    per_page?: number
    page?: number
  }
  table_name?: string
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

// Standard columns for Apollo-sourced dynamic tables
const APOLLO_COLUMNS = [
  { key: 'full_name', label: 'Name', column_type: 'person', position: 0, width: 180 },
  { key: 'title', label: 'Title', column_type: 'text', position: 1, width: 200 },
  { key: 'company', label: 'Company', column_type: 'company', position: 2, width: 180 },
  { key: 'email', label: 'Email', column_type: 'email', position: 3, width: 220 },
  { key: 'linkedin_url', label: 'LinkedIn', column_type: 'linkedin', position: 4, width: 160 },
  { key: 'phone', label: 'Phone', column_type: 'text', position: 5, width: 140 },
  { key: 'city', label: 'City', column_type: 'text', position: 6, width: 120 },
  { key: 'funding_stage', label: 'Funding Stage', column_type: 'text', position: 7, width: 130 },
  { key: 'employees', label: 'Employees', column_type: 'number', position: 8, width: 110 },
] as const

/**
 * Generate a table name from the search params if one is not provided.
 */
function generateTableName(
  searchParams: CreateDynamicTableRequest['search_params'],
  queryDescription: string
): string {
  const parts: string[] = []

  if (searchParams.person_titles?.length) {
    parts.push(searchParams.person_titles.slice(0, 2).join(', '))
  }

  if (searchParams.organization_latest_funding_stage_cd?.length) {
    parts.push(searchParams.organization_latest_funding_stage_cd.join('/'))
  }

  if (searchParams.q_organization_keyword_tags?.length) {
    parts.push(searchParams.q_organization_keyword_tags.slice(0, 2).join(', '))
  }

  if (searchParams.person_locations?.length) {
    parts.push(searchParams.person_locations.slice(0, 2).join(', '))
  }

  if (parts.length > 0) {
    return `Apollo Search — ${parts.join(' at ')}`
  }

  // Fall back to a truncated version of the query description
  const truncated = queryDescription.length > 60
    ? queryDescription.slice(0, 57) + '...'
    : queryDescription
  return `Apollo Search — ${truncated}`
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

    const { query_description, search_params, table_name: requestedTableName } = body

    // ---------------------------------------------------------------
    // 4. Call the apollo-search edge function internally
    // ---------------------------------------------------------------
    console.log('[copilot-dynamic-table] Calling apollo-search with params:', JSON.stringify(search_params))

    const apolloResponse = await fetch(`${supabaseUrl}/functions/v1/apollo-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(search_params),
    })

    if (!apolloResponse.ok) {
      const errorBody = await apolloResponse.text()
      console.error('[copilot-dynamic-table] Apollo search failed:', apolloResponse.status, errorBody)

      // Forward specific error codes from apollo-search
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
    const contacts = apolloData.contacts || []

    if (contacts.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No results found for your search criteria. Try broadening your filters.',
          code: 'NO_RESULTS',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[copilot-dynamic-table] Apollo returned ${contacts.length} contacts`)

    // ---------------------------------------------------------------
    // 5. Generate table name
    // ---------------------------------------------------------------
    const tableName = requestedTableName || generateTableName(search_params, query_description)

    // ---------------------------------------------------------------
    // 6. Create dynamic table + columns + rows + cells using service role
    // ---------------------------------------------------------------
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    // 6a. Insert the dynamic table
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
        JSON.stringify({ error: 'Failed to create dynamic table' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tableId = newTable.id
    console.log(`[copilot-dynamic-table] Created table: ${tableId} — "${newTable.name}"`)

    // 6b. Insert standard columns
    const columnInserts = APOLLO_COLUMNS.map((col) => ({
      table_id: tableId,
      key: col.key,
      label: col.label,
      column_type: col.column_type,
      position: col.position,
      width: col.width,
      is_enrichment: false,
      is_visible: true,
    }))

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
    const rowInserts = contacts.map((contact, index) => ({
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
      const contact = contacts[i]

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
    // 7. Build response for the DynamicTableResponse component
    // ---------------------------------------------------------------
    const previewContacts = contacts.slice(0, 5)
    const previewRows = previewContacts.map((contact) => ({
      Name: contact.full_name,
      Title: contact.title,
      Company: contact.company,
      Email: contact.email || '',
      LinkedIn: contact.linkedin_url || '',
    }))

    const response = {
      table_id: tableId,
      table_name: newTable.name,
      row_count: contacts.length,
      column_count: APOLLO_COLUMNS.length,
      source_type: 'apollo' as const,
      enriched_count: 0,
      preview_rows: previewRows,
      preview_columns: ['Name', 'Title', 'Company', 'Email', 'LinkedIn'],
      query_description,
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
