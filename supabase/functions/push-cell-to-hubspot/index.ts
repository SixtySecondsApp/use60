// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { HubSpotClient } from '../_shared/hubspot.ts'

/**
 * push-cell-to-hubspot — Write a single cell value back to HubSpot.
 *
 * Called fire-and-forget after a user edits a HubSpot-linked cell
 * in a bi-directional table.
 *
 * POST body: {
 *   table_id: string,
 *   row_id: string,
 *   column_id: string,
 *   new_value: string | null,
 * }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Also create a user-scoped client to verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json()
    const { table_id, row_id, column_id, new_value } = body

    if (!table_id || !row_id || !column_id) {
      return new Response(
        JSON.stringify({ error: 'table_id, row_id, and column_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Fetch the table and verify bi-directional sync is enabled
    const { data: table, error: tableError } = await supabase
      .from('dynamic_tables')
      .select('id, organization_id, source_type, source_query')
      .eq('id', table_id)
      .maybeSingle()

    if (tableError || !table) {
      return new Response(
        JSON.stringify({ error: 'Table not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (table.source_type !== 'hubspot') {
      return new Response(
        JSON.stringify({ error: 'Table is not a HubSpot table' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const sourceQuery = table.source_query as Record<string, unknown> | null
    if (sourceQuery?.sync_direction !== 'bidirectional') {
      return new Response(
        JSON.stringify({ error: 'Table is not configured for bi-directional sync' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Verify user has access to this org
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('id')
      .eq('org_id', table.organization_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Fetch the column to get hubspot_property_name
    const { data: column, error: colError } = await supabase
      .from('dynamic_table_columns')
      .select('id, hubspot_property_name')
      .eq('id', column_id)
      .maybeSingle()

    if (colError || !column) {
      return new Response(
        JSON.stringify({ error: 'Column not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!column.hubspot_property_name) {
      return new Response(
        JSON.stringify({ error: 'Column is not linked to a HubSpot property' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4. Fetch the row to get source_id (HubSpot contact ID)
    const { data: row, error: rowError } = await supabase
      .from('dynamic_table_rows')
      .select('id, source_id')
      .eq('id', row_id)
      .maybeSingle()

    if (rowError || !row) {
      return new Response(
        JSON.stringify({ error: 'Row not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!row.source_id) {
      return new Response(
        JSON.stringify({ error: 'Row has no HubSpot contact ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 5. Get HubSpot credentials
    const { data: creds } = await supabase
      .from('hubspot_org_credentials')
      .select('access_token')
      .eq('org_id', table.organization_id)
      .maybeSingle()

    if (!creds?.access_token) {
      return new Response(
        JSON.stringify({ error: 'HubSpot not connected for this organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 6. Push the value to HubSpot
    const hubspot = new HubSpotClient({ accessToken: creds.access_token })

    await hubspot.request({
      method: 'PATCH',
      path: `/crm/v3/objects/contacts/${row.source_id}`,
      body: {
        properties: {
          [column.hubspot_property_name]: new_value ?? '',
        },
      },
    })

    // 7. Update hubspot_last_pushed_at on the cell
    await supabase
      .from('dynamic_table_cells')
      .update({ hubspot_last_pushed_at: new Date().toISOString() })
      .eq('row_id', row_id)
      .eq('column_id', column_id)

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[push-cell-to-hubspot] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
