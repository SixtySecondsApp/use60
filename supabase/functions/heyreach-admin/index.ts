import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { HeyReachClient } from '../_shared/heyreach.ts'

type Action =
  | 'connect'
  | 'disconnect'
  | 'status'
  | 'list_campaigns'
  | 'get_campaign_details'
  | 'list_senders'
  | 'list_campaign_links'
  | 'link_campaign'
  | 'unlink_campaign'
  | 'list_lists'

let _reqRef: Request | null = null

function jsonResponse(data: any, status = 200) {
  const cors = _reqRef ? getCorsHeaders(_reqRef) : {}
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function errorResponse(error: string, _status = 400) {
  return jsonResponse({ success: false, error })
}

async function getHeyReachClient(
  svc: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ client: HeyReachClient | null; error: string | null }> {
  const { data: creds, error: credsError } = await svc
    .from('heyreach_org_credentials')
    .select('api_key')
    .eq('org_id', orgId)
    .maybeSingle()

  if (credsError || !creds?.api_key) {
    return { client: null, error: 'HeyReach not connected. Add your API key in Settings.' }
  }

  return { client: new HeyReachClient({ apiKey: creds.api_key }), error: null }
}

serve(async (req) => {
  _reqRef = req
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse
  console.log(`[heyreach-admin] ${req.method} request from ${req.headers.get('origin') || 'unknown'}`)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return errorResponse('Server misconfigured', 500)
    }

    let body: any = {}
    try {
      const rawBody = await req.text()
      if (rawBody) body = JSON.parse(rawBody)
    } catch (e: any) {
      return errorResponse(`Invalid JSON body: ${e.message}`)
    }

    // Auth: validate user JWT
    let userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (!userToken && body._auth_token) {
      userToken = body._auth_token
    }
    if (!userToken) return errorResponse('Unauthorized', 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return errorResponse('Unauthorized', 401)

    const action: Action | null = typeof body.action === 'string' ? (body.action as Action) : null
    const orgId: string | null = typeof body.org_id === 'string' ? body.org_id : null

    if (!action || !orgId) {
      return errorResponse('Missing action or org_id')
    }

    const svc = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Check org membership
    const { data: membership } = await svc
      .from('organization_memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) return errorResponse('Not a member of this organization', 403)
    const isAdmin = membership.role === 'owner' || membership.role === 'admin'

    // =========================================================================
    // ACTION: connect — Save API key and verify
    // =========================================================================
    if (action === 'connect') {
      if (!isAdmin) return errorResponse('Admin role required', 403)

      const apiKey = body.api_key
      if (!apiKey || typeof apiKey !== 'string') return errorResponse('Missing api_key')

      // Verify the key by listing campaigns
      const testClient = new HeyReachClient({ apiKey })
      try {
        await testClient.request({ method: 'GET', path: '/api/v1/campaign/GetAllCampaigns', query: { offset: 0, limit: 1 }, retries: 1 })
      } catch (e: any) {
        const msg = e?.status === 401 ? 'Invalid API key' : `HeyReach API error: ${e.message}`
        return errorResponse(msg)
      }

      // Generate a webhook API key for this org
      const webhookApiKey = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')

      // Store credentials
      const { error: credError } = await svc
        .from('heyreach_org_credentials')
        .upsert({ org_id: orgId, api_key: apiKey, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })

      if (credError) {
        console.error('Failed to store HeyReach credentials', { orgId, userId: user.id, error: credError.message })
        return errorResponse('Failed to store credentials')
      }

      // Upsert integration record
      const { error: intError } = await svc
        .from('heyreach_org_integrations')
        .upsert({
          org_id: orgId,
          connected_by_user_id: user.id,
          is_active: true,
          is_connected: true,
          connected_at: new Date().toISOString(),
          webhook_api_key: webhookApiKey,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' })

      if (intError) {
        console.error('Failed to store HeyReach integration', { orgId, userId: user.id, error: intError.message })
        return errorResponse('Failed to store integration record')
      }

      // Build webhook URL for the user to configure in HeyReach
      const webhookUrl = `${supabaseUrl}/functions/v1/heyreach-webhook?key=${webhookApiKey}`

      return jsonResponse({ success: true, message: 'HeyReach connected successfully', webhook_url: webhookUrl })
    }

    // =========================================================================
    // ACTION: disconnect — Remove credentials
    // =========================================================================
    if (action === 'disconnect') {
      if (!isAdmin) return errorResponse('Admin role required', 403)

      await svc.from('heyreach_org_credentials').delete().eq('org_id', orgId)
      await svc.from('heyreach_campaign_links').delete().eq('org_id', orgId)
      await svc
        .from('heyreach_org_integrations')
        .update({ is_active: false, is_connected: false, updated_at: new Date().toISOString() })
        .eq('org_id', orgId)

      return jsonResponse({ success: true, message: 'HeyReach disconnected' })
    }

    // =========================================================================
    // ACTION: status — Return connection state
    // =========================================================================
    if (action === 'status') {
      const { data: integration } = await svc
        .from('heyreach_org_integrations')
        .select('is_active, is_connected, connected_at, last_sync_at, last_webhook_received_at, connected_by_user_id, webhook_api_key')
        .eq('org_id', orgId)
        .maybeSingle()

      const { count: linkCount } = await svc
        .from('heyreach_campaign_links')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)

      const webhookUrl = integration?.webhook_api_key
        ? `${supabaseUrl}/functions/v1/heyreach-webhook?key=${integration.webhook_api_key}`
        : null

      return jsonResponse({
        success: true,
        connected: integration?.is_connected ?? false,
        is_active: integration?.is_active ?? false,
        connected_at: integration?.connected_at ?? null,
        last_sync_at: integration?.last_sync_at ?? null,
        last_webhook_received_at: integration?.last_webhook_received_at ?? null,
        linked_campaigns_count: linkCount ?? 0,
        webhook_url: webhookUrl,
      })
    }

    // For all remaining actions, we need a valid HeyReach client
    const { client: heyreach, error: clientError } = await getHeyReachClient(svc, orgId)
    if (!heyreach) return errorResponse(clientError || 'HeyReach not connected')

    // =========================================================================
    // ACTION: list_campaigns
    // =========================================================================
    if (action === 'list_campaigns') {
      const offset = body.offset ?? 0
      const limit = body.limit ?? 50

      const data = await heyreach.request<any>({
        method: 'GET',
        path: '/api/v1/campaign/GetAllCampaigns',
        query: { offset, limit },
      })

      const campaigns = Array.isArray(data) ? data : data?.items ?? data?.campaigns ?? []

      return jsonResponse({ success: true, campaigns })
    }

    // =========================================================================
    // ACTION: get_campaign_details
    // =========================================================================
    if (action === 'get_campaign_details') {
      const campaignId = body.campaign_id
      if (!campaignId) return errorResponse('Missing campaign_id')

      const data = await heyreach.request<any>({
        method: 'GET',
        path: `/api/v1/campaign/${campaignId}`,
      })

      return jsonResponse({ success: true, campaign: data })
    }

    // =========================================================================
    // ACTION: list_senders — Get LinkedIn sender accounts
    // =========================================================================
    if (action === 'list_senders') {
      const data = await heyreach.request<any>({
        method: 'GET',
        path: '/api/v1/linkedin-account/GetAllSenderAccounts',
      })

      const senders = Array.isArray(data) ? data : data?.items ?? data?.accounts ?? []

      return jsonResponse({ success: true, senders })
    }

    // =========================================================================
    // ACTION: list_lists — Get lead lists
    // =========================================================================
    if (action === 'list_lists') {
      const offset = body.offset ?? 0
      const limit = body.limit ?? 50

      const data = await heyreach.request<any>({
        method: 'GET',
        path: '/api/v1/list/GetAllLists',
        query: { offset, limit },
      })

      const lists = Array.isArray(data) ? data : data?.items ?? data?.lists ?? []

      return jsonResponse({ success: true, lists })
    }

    // =========================================================================
    // ACTION: list_campaign_links — Get linked campaigns for a table
    // =========================================================================
    if (action === 'list_campaign_links') {
      const tableId = body.table_id
      if (!tableId) return errorResponse('Missing table_id')

      const { data: links, error: linksError } = await svc
        .from('heyreach_campaign_links')
        .select('id, table_id, campaign_id, campaign_name, field_mapping, sender_column_key, auto_sync_engagement, linked_at, last_push_at, last_engagement_sync_at, sync_schedule')
        .eq('table_id', tableId)
        .eq('org_id', orgId)
        .order('linked_at', { ascending: false })

      if (linksError) return errorResponse(linksError.message)

      return jsonResponse({ success: true, links: links ?? [] })
    }

    // =========================================================================
    // ACTION: link_campaign — Connect an Ops table to a HeyReach campaign
    // =========================================================================
    if (action === 'link_campaign') {
      const tableId = body.table_id
      const campaignId = body.campaign_id
      const campaignName = body.campaign_name
      const fieldMapping = body.field_mapping

      if (!tableId || !campaignId) return errorResponse('Missing table_id or campaign_id')
      if (!fieldMapping?.linkedin_url) return errorResponse('Field mapping must include linkedin_url column')
      if (!fieldMapping?.first_name) return errorResponse('Field mapping must include first_name column')
      if (!fieldMapping?.last_name) return errorResponse('Field mapping must include last_name column')

      const { error: linkError } = await svc
        .from('heyreach_campaign_links')
        .upsert({
          table_id: tableId,
          org_id: orgId,
          campaign_id: campaignId,
          campaign_name: campaignName || null,
          field_mapping: fieldMapping,
          sender_column_key: body.sender_column_key || null,
          auto_sync_engagement: body.auto_sync_engagement ?? true,
          linked_by: user.id,
          linked_at: new Date().toISOString(),
        }, { onConflict: 'table_id,campaign_id' })

      if (linkError) return errorResponse(linkError.message)

      return jsonResponse({ success: true, message: `Table linked to HeyReach campaign "${campaignName || campaignId}"` })
    }

    // =========================================================================
    // ACTION: unlink_campaign — Disconnect a table from a HeyReach campaign
    // =========================================================================
    if (action === 'unlink_campaign') {
      const tableId = body.table_id
      const campaignId = body.campaign_id

      if (!tableId || !campaignId) return errorResponse('Missing table_id or campaign_id')

      await svc
        .from('heyreach_campaign_links')
        .delete()
        .eq('table_id', tableId)
        .eq('campaign_id', campaignId)
        .eq('org_id', orgId)

      return jsonResponse({ success: true, message: 'Campaign unlinked' })
    }

    return errorResponse(`Unknown action: ${action}`)
  } catch (e: any) {
    console.error('[heyreach-admin] Unhandled error:', e)
    const status = e?.status ? ` (HTTP ${e.status})` : ''
    return errorResponse(`${e.message || 'Internal server error'}${status}`, 500)
  }
})
