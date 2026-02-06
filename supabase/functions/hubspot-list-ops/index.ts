// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { HubSpotClient } from '../_shared/hubspot.ts'

/**
 * hubspot-list-ops — HubSpot list CRUD for OpsTable.
 *
 * POST body: {
 *   action: 'create_list_from_table' | 'add_to_list' | 'remove_from_list',
 *   table_id?: string,
 *   list_name?: string,
 *   row_ids?: string[],
 *   list_id?: string,
 *   contact_ids?: string[],
 *   link_list?: boolean,
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

    // Validate auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json()
    const { action } = body

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Helper: get HubSpot client from table's org
    async function getHubSpotForTable(tableId: string) {
      const { data: tableData } = await supabase
        .from('dynamic_tables')
        .select('organization_id, source_query')
        .eq('id', tableId)
        .single()

      if (!tableData?.organization_id) {
        throw new Error('Table not found')
      }

      // Verify user is in org
      const { data: membership } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', tableData.organization_id)
        .eq('user_id', user!.id)
        .maybeSingle()

      if (!membership) {
        throw new Error('Not a member of this organization')
      }

      const { data: creds } = await supabase
        .from('hubspot_org_credentials')
        .select('access_token')
        .eq('org_id', tableData.organization_id)
        .maybeSingle()

      if (!creds?.access_token) {
        throw new Error('HubSpot not connected')
      }

      return {
        hubspot: new HubSpotClient({ accessToken: creds.access_token }),
        tableData,
      }
    }

    // Helper: get HubSpot client from org_id (for non-table operations)
    async function getHubSpotForOrg(orgId: string) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('user_id', user!.id)
        .maybeSingle()

      if (!membership) {
        throw new Error('Not a member of this organization')
      }

      const { data: creds } = await supabase
        .from('hubspot_org_credentials')
        .select('access_token')
        .eq('org_id', orgId)
        .maybeSingle()

      if (!creds?.access_token) {
        throw new Error('HubSpot not connected')
      }

      return new HubSpotClient({ accessToken: creds.access_token })
    }

    if (action === 'create_list_from_table') {
      const { table_id, list_name, row_ids, link_list } = body

      if (!table_id || !list_name) {
        return new Response(
          JSON.stringify({ error: 'table_id and list_name are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { hubspot, tableData } = await getHubSpotForTable(table_id)

      // Get source_ids from rows
      let query = supabase
        .from('dynamic_table_rows')
        .select('source_id')
        .eq('table_id', table_id)
        .not('source_id', 'is', null)

      if (row_ids?.length) {
        query = query.in('id', row_ids)
      }

      const { data: rows, error: rowErr } = await query
      if (rowErr) throw rowErr

      const contactIds = (rows ?? [])
        .map((r: any) => r.source_id)
        .filter(Boolean) as string[]

      if (contactIds.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No HubSpot contacts found in selected rows. Rows need a source_id (HubSpot contact ID).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Create MANUAL list
      console.log(`[hubspot-list-ops] Creating list "${list_name}" with ${contactIds.length} contacts`)
      const listResponse = await hubspot.request<any>({
        method: 'POST',
        path: '/crm/v3/lists',
        body: {
          name: list_name,
          objectTypeId: '0-1',
          processingType: 'MANUAL',
        },
      })

      const listId = listResponse?.listId ?? listResponse?.list?.listId
      if (!listId) {
        throw new Error('Failed to create HubSpot list — no listId returned')
      }

      // Add members in batches of 500
      const BATCH_SIZE = 500
      let totalAdded = 0
      for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
        const chunk = contactIds.slice(i, i + BATCH_SIZE)
        await hubspot.request<any>({
          method: 'PUT',
          path: `/crm/v3/lists/${listId}/memberships/add`,
          body: chunk,
        })
        totalAdded += chunk.length
      }

      // Optionally link list_id to table source_query
      if (link_list) {
        const sourceQuery = tableData.source_query ?? {}
        sourceQuery.list_id = listId
        await supabase
          .from('dynamic_tables')
          .update({ source_query: sourceQuery })
          .eq('id', table_id)
        console.log(`[hubspot-list-ops] Linked list ${listId} to table ${table_id}`)
      }

      return new Response(
        JSON.stringify({ list_id: listId, list_name, contacts_added: totalAdded }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'add_to_list') {
      const { list_id, contact_ids, org_id } = body

      if (!list_id || !contact_ids?.length || !org_id) {
        return new Response(
          JSON.stringify({ error: 'list_id, contact_ids, and org_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const hubspot = await getHubSpotForOrg(org_id)

      console.log(`[hubspot-list-ops] Adding ${contact_ids.length} contacts to list ${list_id}`)
      await hubspot.request<any>({
        method: 'PUT',
        path: `/crm/v3/lists/${list_id}/memberships/add`,
        body: contact_ids,
      })

      return new Response(
        JSON.stringify({ success: true, contacts_added: contact_ids.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'remove_from_list') {
      const { list_id, contact_ids, org_id } = body

      if (!list_id || !contact_ids?.length || !org_id) {
        return new Response(
          JSON.stringify({ error: 'list_id, contact_ids, and org_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const hubspot = await getHubSpotForOrg(org_id)

      console.log(`[hubspot-list-ops] Removing ${contact_ids.length} contacts from list ${list_id}`)
      await hubspot.request<any>({
        method: 'PUT',
        path: `/crm/v3/lists/${list_id}/memberships/remove`,
        body: contact_ids,
      })

      return new Response(
        JSON.stringify({ success: true, contacts_removed: contact_ids.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[hubspot-list-ops] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
