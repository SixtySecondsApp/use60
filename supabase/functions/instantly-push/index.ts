import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v1'

// Standard Instantly lead fields (everything else goes into custom_variables)
const STANDARD_INSTANTLY_FIELDS = new Set([
  'email',
  'first_name',
  'last_name',
  'company_name',
  'phone',
  'website',
  'custom1',
  'custom2',
  'custom3',
  'custom4',
  'custom5',
])

interface InstantlyPushRequest {
  table_id: string
  row_ids: string[]
  campaign_id?: string
  campaign_name?: string
  mode?: 'new_campaign' | 'existing_campaign'
  variable_mapping: Record<string, string> // table column key -> Instantly variable name
}

interface InstantlyLead {
  email: string
  first_name?: string
  last_name?: string
  company_name?: string
  phone?: string
  website?: string
  custom1?: string
  custom2?: string
  custom3?: string
  custom4?: string
  custom5?: string
  custom_variables?: Record<string, string>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Authenticate user
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Get user's org
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      throw new Error('No organization found')
    }

    // -----------------------------------------------------------------------
    // 2. Get org Instantly API key
    // -----------------------------------------------------------------------
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check instantly_org_credentials first (primary), then integration_credentials (legacy)
    const { data: instantlyCreds } = await serviceClient
      .from('instantly_org_credentials')
      .select('api_key')
      .eq('org_id', membership.org_id)
      .maybeSingle()

    let instantlyApiKey = instantlyCreds?.api_key || null

    if (!instantlyApiKey) {
      const { data: integration } = await serviceClient
        .from('integration_credentials')
        .select('credentials')
        .eq('organization_id', membership.org_id)
        .eq('provider', 'instantly')
        .maybeSingle()

      instantlyApiKey = (integration?.credentials as Record<string, string>)?.api_key || null
    }

    if (!instantlyApiKey) {
      instantlyApiKey = Deno.env.get('INSTANTLY_API_KEY') || null
    }

    if (!instantlyApiKey) {
      return new Response(
        JSON.stringify({
          error: 'Instantly API key not configured. Please add your Instantly API key in Settings > Integrations.',
          code: 'INSTANTLY_NOT_CONFIGURED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -----------------------------------------------------------------------
    // 3. Parse request body
    // -----------------------------------------------------------------------
    const body = await req.json() as InstantlyPushRequest
    const { table_id, row_ids, campaign_id, campaign_name, mode, variable_mapping } = body

    if (!table_id || !row_ids?.length) {
      return new Response(
        JSON.stringify({ error: 'table_id and row_ids are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!variable_mapping || typeof variable_mapping !== 'object') {
      return new Response(
        JSON.stringify({ error: 'variable_mapping is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate that email is mapped
    const emailColumnKey = Object.keys(variable_mapping).find(
      (k) => variable_mapping[k] === 'email'
    )
    if (!emailColumnKey) {
      return new Response(
        JSON.stringify({
          error: 'An email mapping is required. Please map one column to the "email" Instantly variable.',
          code: 'EMAIL_MAPPING_REQUIRED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // In existing_campaign mode, campaign_id is required
    if (mode === 'existing_campaign' && !campaign_id) {
      return new Response(
        JSON.stringify({ error: 'campaign_id is required when mode is existing_campaign.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!campaign_id && !campaign_name) {
      return new Response(
        JSON.stringify({ error: 'Either campaign_id or campaign_name is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -----------------------------------------------------------------------
    // 4. Fetch rows + cells + columns using service client
    // -----------------------------------------------------------------------
    const { data: columns, error: colError } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key, label, column_type')
      .eq('table_id', table_id)

    if (colError) {
      console.error('[instantly-push] Error fetching columns:', colError)
      throw new Error('Failed to fetch table columns')
    }

    // Build column ID -> key map for resolving cells
    const columnIdToKey: Record<string, string> = {}
    for (const col of columns || []) {
      columnIdToKey[col.id] = col.key
    }

    const { data: rows, error: rowError } = await serviceClient
      .from('dynamic_table_rows')
      .select('id')
      .eq('table_id', table_id)
      .in('id', row_ids)

    if (rowError) {
      console.error('[instantly-push] Error fetching rows:', rowError)
      throw new Error('Failed to fetch rows')
    }

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No rows found for the given IDs.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const foundRowIds = rows.map((r) => r.id)

    // Fetch all cells for the selected rows
    const { data: cells, error: cellError } = await serviceClient
      .from('dynamic_table_cells')
      .select('row_id, column_id, value')
      .in('row_id', foundRowIds)

    if (cellError) {
      console.error('[instantly-push] Error fetching cells:', cellError)
      throw new Error('Failed to fetch cells')
    }

    // Group cells by row_id
    const cellsByRow: Record<string, Record<string, string | null>> = {}
    for (const cell of cells || []) {
      const colKey = columnIdToKey[cell.column_id]
      if (!colKey) continue
      if (!cellsByRow[cell.row_id]) {
        cellsByRow[cell.row_id] = {}
      }
      cellsByRow[cell.row_id][colKey] = cell.value
    }

    // -----------------------------------------------------------------------
    // 5. Build Instantly leads array
    // -----------------------------------------------------------------------
    const leads: InstantlyLead[] = []
    const errors: string[] = []

    for (const row of rows) {
      const rowCells = cellsByRow[row.id] || {}

      // Build lead from variable_mapping
      const lead: Record<string, unknown> = {}
      const customVars: Record<string, string> = {}

      for (const [tableColumnKey, instantlyVar] of Object.entries(variable_mapping)) {
        if (instantlyVar === 'skip' || instantlyVar === '') continue

        const cellValue = rowCells[tableColumnKey]
        if (cellValue === null || cellValue === undefined || cellValue === '') continue

        if (STANDARD_INSTANTLY_FIELDS.has(instantlyVar)) {
          lead[instantlyVar] = cellValue
        } else {
          customVars[instantlyVar] = cellValue
        }
      }

      // Validate email
      const email = lead.email as string | undefined
      if (!email || !email.includes('@')) {
        errors.push(`Row ${row.id}: missing or invalid email`)
        continue
      }

      const instantlyLead: InstantlyLead = {
        email,
        ...(lead.first_name ? { first_name: lead.first_name as string } : {}),
        ...(lead.last_name ? { last_name: lead.last_name as string } : {}),
        ...(lead.company_name ? { company_name: lead.company_name as string } : {}),
        ...(lead.phone ? { phone: lead.phone as string } : {}),
        ...(lead.website ? { website: lead.website as string } : {}),
        ...(lead.custom1 ? { custom1: lead.custom1 as string } : {}),
        ...(lead.custom2 ? { custom2: lead.custom2 as string } : {}),
        ...(lead.custom3 ? { custom3: lead.custom3 as string } : {}),
        ...(lead.custom4 ? { custom4: lead.custom4 as string } : {}),
        ...(lead.custom5 ? { custom5: lead.custom5 as string } : {}),
        ...(Object.keys(customVars).length > 0 ? { custom_variables: customVars } : {}),
      }

      leads.push(instantlyLead)
    }

    if (leads.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No valid leads to push. All rows were missing a valid email address.',
          errors,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[instantly-push] Built ${leads.length} leads (${errors.length} skipped)`)

    // -----------------------------------------------------------------------
    // 6. Resolve or create campaign
    // -----------------------------------------------------------------------
    let resolvedCampaignId = campaign_id || ''
    let resolvedCampaignName = campaign_name || ''
    let campaignCreated = false

    if (mode === 'existing_campaign') {
      // Existing campaign mode — use the provided campaign_id directly, no creation
      console.log(`[instantly-push] Using existing campaign: ${resolvedCampaignId}`)
    } else if (!resolvedCampaignId && resolvedCampaignName) {
      // Create a new campaign
      console.log(`[instantly-push] Creating new campaign: ${resolvedCampaignName}`)

      const createRes = await fetch(`${INSTANTLY_API_BASE}/campaign/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: instantlyApiKey,
          name: resolvedCampaignName,
        }),
      })

      if (!createRes.ok) {
        const errorBody = await createRes.text()
        console.error('[instantly-push] Campaign creation error:', createRes.status, errorBody)

        if (createRes.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Instantly rate limit exceeded. Please wait and try again.', code: 'RATE_LIMITED' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        throw new Error(`Failed to create Instantly campaign: ${createRes.status}`)
      }

      const createData = await createRes.json()
      resolvedCampaignId = createData.id || createData.campaign_id || ''

      if (!resolvedCampaignId) {
        console.error('[instantly-push] Campaign created but no ID returned:', createData)
        throw new Error('Campaign created but no campaign ID was returned')
      }

      campaignCreated = true
      console.log(`[instantly-push] Campaign created: ${resolvedCampaignId}`)
    }

    // -----------------------------------------------------------------------
    // 7. Push leads to Instantly campaign
    // -----------------------------------------------------------------------
    console.log(`[instantly-push] Pushing ${leads.length} leads to campaign ${resolvedCampaignId}`)

    const pushRes = await fetch(`${INSTANTLY_API_BASE}/lead/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: instantlyApiKey,
        campaign_id: resolvedCampaignId,
        skip_if_in_workspace: false,
        leads,
      }),
    })

    if (!pushRes.ok) {
      const errorBody = await pushRes.text()
      console.error('[instantly-push] Lead push error:', pushRes.status, errorBody)

      if (pushRes.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Instantly rate limit exceeded. Please wait and try again.', code: 'RATE_LIMITED' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      throw new Error(`Failed to push leads to Instantly: ${pushRes.status}`)
    }

    const pushData = await pushRes.json()
    console.log('[instantly-push] Push response:', JSON.stringify(pushData))

    const leadsPushed = pushData.leads_added ?? pushData.uploaded ?? leads.length
    const failedLeads = pushData.leads_failed ?? pushData.failed ?? 0

    // -----------------------------------------------------------------------
    // 8. Return result
    // -----------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        campaign_id: resolvedCampaignId,
        campaign_name: resolvedCampaignName,
        campaign_created: campaignCreated,
        mode: mode || 'new_campaign',
        leads_pushed: leadsPushed,
        failed_leads: failedLeads,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[instantly-push] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
