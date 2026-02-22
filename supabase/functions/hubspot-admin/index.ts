import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { HubSpotClient } from '../_shared/hubspot.ts'

// HubSpot Admin Edge Function - v3 (added update actions)
type Action = 'status' | 'enqueue' | 'save_settings' | 'get_properties' | 'get_pipelines' | 'get_forms' | 'get_lists' | 'preview_contacts' | 'trigger_sync' | 'create_contact' | 'create_deal' | 'create_task' | 'update_contact' | 'update_deal' | 'update_task' | 'delete_contact' | 'delete_deal' | 'delete_task' | 'detect_fields' | 'test_mapping'

/**
 * Get a valid HubSpot access token, refreshing if expired or about to expire
 */
async function getValidAccessToken(
  svc: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ accessToken: string | null; error: string | null }> {
  const { data: creds, error: credsError } = await svc
    .from('hubspot_org_credentials')
    .select('access_token, refresh_token, token_expires_at')
    .eq('org_id', orgId)
    .maybeSingle()

  if (credsError || !creds) {
    return { accessToken: null, error: 'HubSpot not connected' }
  }

  const accessToken = creds.access_token as string | null
  const refreshToken = creds.refresh_token as string | null
  const tokenExpiresAt = creds.token_expires_at as string | null

  if (!accessToken || !refreshToken) {
    return { accessToken: null, error: 'HubSpot not connected' }
  }

  // Check if token is expired or will expire within 5 minutes
  const now = Date.now()
  const expiresAt = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() : 0
  const isExpiredOrExpiring = expiresAt - now < 5 * 60 * 1000 // 5 minutes buffer

  if (!isExpiredOrExpiring) {
    return { accessToken, error: null }
  }

  // Token needs refresh
  console.log('[hubspot-admin] Token expired or expiring soon, refreshing...')

  const clientId = Deno.env.get('HUBSPOT_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET') || ''

  if (!clientId || !clientSecret) {
    return { accessToken: null, error: 'Server misconfigured: missing HubSpot credentials' }
  }

  try {
    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    })

    const tokenResp = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })

    const tokenData = await tokenResp.json()

    if (!tokenResp.ok) {
      const msg = tokenData?.message || tokenData?.error_description || 'Token refresh failed'
      console.error('[hubspot-admin] Token refresh failed:', msg)

      // If refresh token is invalid, mark as disconnected
      if (tokenData?.error === 'invalid_grant' || tokenResp.status === 400) {
        await svc
          .from('hubspot_org_integrations')
          .update({ is_active: false, is_connected: false, updated_at: new Date().toISOString() })
          .eq('org_id', orgId)
        return { accessToken: null, error: 'HubSpot connection expired. Please reconnect.' }
      }

      return { accessToken: null, error: `Token refresh failed: ${msg}` }
    }

    const newAccessToken = tokenData.access_token as string
    const newRefreshToken = tokenData.refresh_token || refreshToken
    const expiresIn = Number(tokenData.expires_in || 1800)
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Update credentials in database
    const { error: updateError } = await svc
      .from('hubspot_org_credentials')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)

    if (updateError) {
      console.error('[hubspot-admin] Failed to update refreshed token:', updateError)
      return { accessToken: null, error: 'Failed to save refreshed token' }
    }

    console.log('[hubspot-admin] Token refreshed successfully, expires at:', newExpiresAt)
    return { accessToken: newAccessToken, error: null }
  } catch (e) {
    console.error('[hubspot-admin] Token refresh error:', e)
    return { accessToken: null, error: e instanceof Error ? e.message : 'Token refresh failed' }
  }
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ success: false, error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
  if (!userToken) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: any = {}
  try {
    const rawBody = await req.text()
    console.log('[hubspot-admin] Raw body received:', rawBody ? rawBody.substring(0, 200) : '(empty)')
    if (rawBody) {
      body = JSON.parse(rawBody)
    }
  } catch (e: any) {
    console.error('[hubspot-admin] Body parse error:', e.message)
    return new Response(JSON.stringify({ success: false, error: `Invalid JSON body: ${e.message}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const action: Action | null = typeof body.action === 'string' ? (body.action as Action) : null
  const orgId = typeof body.org_id === 'string' ? body.org_id : null

  console.log('[hubspot-admin] Parsed action:', action, 'org_id:', orgId)

  if (!action || !orgId) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Missing action or org_id',
      received: { action: body.action, org_id: body.org_id, bodyKeys: Object.keys(body) }
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const svc = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: membership } = await svc
    .from('organization_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()
  const role = membership?.role as string | undefined
  const isAdmin = role === 'owner' || role === 'admin'

  if (!isAdmin) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (action === 'status') {
    const { data: integration } = await svc
      .from('hubspot_org_integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle()
    const { data: syncState } = await svc.from('hubspot_org_sync_state').select('*').eq('org_id', orgId).maybeSingle()
    const { data: settingsRow } = await svc.from('hubspot_settings').select('settings').eq('org_id', orgId).maybeSingle()

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const webhookToken = integration?.webhook_token ? String(integration.webhook_token) : null
    const webhookUrl = webhookToken && supabaseUrl
      ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/hubspot-webhook?token=${encodeURIComponent(webhookToken)}`
      : null

    return new Response(
      JSON.stringify({
        success: true,
        connected: Boolean(integration?.is_connected),
        integration,
        sync_state: syncState || null,
        settings: settingsRow?.settings || {},
        webhook_url: webhookUrl,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (action === 'save_settings') {
    const settings = body.settings ?? {}
    console.log('[hubspot-admin] Saving settings for org:', orgId, 'settings:', JSON.stringify(settings).substring(0, 200))

    const { error: upsertError } = await svc
      .from('hubspot_settings')
      .upsert({ org_id: orgId, settings, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })

    if (upsertError) {
      console.error('[hubspot-admin] Failed to save settings:', upsertError)
      return new Response(JSON.stringify({ success: false, error: upsertError.message || 'Failed to save settings' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('[hubspot-admin] Settings saved successfully')
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (action === 'enqueue') {
    const jobType = typeof body.job_type === 'string' ? body.job_type : null
    if (!jobType) {
      return new Response(JSON.stringify({ success: false, error: 'Missing job_type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const payload = body.payload ?? {}
    const dedupeKey = typeof body.dedupe_key === 'string' ? body.dedupe_key : null
    const priority = typeof body.priority === 'number' ? body.priority : 100

    // Pull clerk_org_id from integration/settings if available
    const { data: integration } = await svc
      .from('hubspot_org_integrations')
      .select('clerk_org_id')
      .eq('org_id', orgId)
      .maybeSingle()

    const { error: insertError } = await svc
      .from('hubspot_sync_queue')
      .insert({
        org_id: orgId,
        clerk_org_id: integration?.clerk_org_id || null,
        job_type: jobType,
        payload,
        dedupe_key: dedupeKey,
        priority,
        run_after: new Date().toISOString(),
        attempts: 0,
        max_attempts: 10,
      })

    // Ignore duplicate key errors (job already queued)
    if (insertError) {
      const msg = String(insertError.message || '')
      if (!msg.toLowerCase().includes('duplicate key') && !msg.toLowerCase().includes('unique')) {
        throw new Error(insertError.message || 'Failed to enqueue job')
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Get HubSpot properties (deals, contacts, tasks)
  if (action === 'get_properties') {
    const objectType = typeof body.object_type === 'string' ? body.object_type : 'deals'

    // Get valid access token (auto-refreshes if expired)
    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)

    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      const properties = await client.request<{ results: any[] }>({
        method: 'GET',
        path: `/crm/v3/properties/${objectType}`,
      })

      return new Response(
        JSON.stringify({
          success: true,
          properties: properties.results.map((p: any) => ({
            name: p.name,
            label: p.label,
            type: p.type,
            fieldType: p.fieldType,
            description: p.description,
            groupName: p.groupName,
            options: p.options,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to fetch properties' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Get HubSpot deal pipelines and stages
  if (action === 'get_pipelines') {
    // Get valid access token (auto-refreshes if expired)
    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)

    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      const pipelines = await client.request<{ results: any[] }>({
        method: 'GET',
        path: '/crm/v3/pipelines/deals',
      })

      return new Response(
        JSON.stringify({
          success: true,
          pipelines: pipelines.results.map((p: any) => ({
            id: p.id,
            label: p.label,
            displayOrder: p.displayOrder,
            stages: (p.stages || []).map((s: any) => ({
              id: s.id,
              label: s.label,
              displayOrder: s.displayOrder,
              metadata: s.metadata,
            })),
          })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to fetch pipelines' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Get HubSpot forms
  if (action === 'get_forms') {
    // Get valid access token (auto-refreshes if expired)
    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)

    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      const forms = await client.request<{ results: any[] }>({
        method: 'GET',
        path: '/marketing/v3/forms',
      })

      return new Response(
        JSON.stringify({
          success: true,
          forms: forms.results.map((f: any) => ({
            id: f.id,
            name: f.name,
            formType: f.formType,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
            archived: f.archived,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to fetch forms' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Fetch HubSpot lists (segments) via v3 Lists API
  if (action === 'get_lists') {
    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)

    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })
    const limit = Math.min(Number(body.limit) || 100, 250)

    try {
      const allLists: any[] = []
      let after: string | undefined = undefined

      // Paginate through all lists using POST /crm/v3/lists/search
      do {
        const searchBody: Record<string, any> = {
          count: limit,
          objectTypeId: '0-1', // Contacts
        }
        if (after) {
          searchBody.offset = Number(after)
        }

        const response = await client.request<{ lists: any[]; offset?: number; hasMore?: boolean; total?: number }>({
          method: 'POST',
          path: '/crm/v3/lists/search',
          body: searchBody,
        })

        const lists = response.lists || []
        allLists.push(...lists)

        if (response.hasMore && response.offset) {
          after = String(response.offset)
        } else {
          after = undefined
        }
      } while (after)

      // The search response includes additionalProperties.hs_list_size with the contact count
      const nonArchivedLists = allLists.filter((l: any) => !l.archived)

      const formattedLists = nonArchivedLists
        .map((l: any) => {
          const id = String(l.listId || l.id || '')
          const hsListSize = Number(l.additionalProperties?.hs_list_size)
          return {
            id,
            name: l.name || 'Untitled',
            listType: l.processingType === 'MANUAL' ? 'STATIC' : 'DYNAMIC',
            membershipCount: !isNaN(hsListSize) ? hsListSize : 0,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
          }
        })

      return new Response(
        JSON.stringify({ success: true, lists: formattedLists }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] get_lists error:', e.message)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to fetch lists' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Preview contacts from a list or by filters
  if (action === 'preview_contacts') {
    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)

    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })
    const listId = typeof body.list_id === 'string' ? body.list_id : null
    const filters = Array.isArray(body.filters) ? body.filters : []
    const filterLogic = body.filter_logic === 'OR' ? 'OR' : 'AND'
    const previewLimit = Math.min(Number(body.limit) || 5, 10)

    try {
      let contactIds: string[] = []

      // If list_id provided, get members from list
      if (listId) {
        try {
          const membershipResponse = await client.request<{ results: any[] }>({
            method: 'GET',
            path: `/crm/v3/lists/${listId}/memberships`,
            query: { limit: String(previewLimit) },
          })
          contactIds = (membershipResponse.results || []).map((m: any) => String(m.recordId || m.vid || m))
        } catch (memberErr: any) {
          console.error('[hubspot-admin] list membership fetch error:', memberErr.message)
        }
      }

      // Fetch contact details
      let contacts: any[] = []
      let totalCount = 0

      if (contactIds.length > 0) {
        // Fetch contacts by IDs from memberships
        const response = await client.request<{ results: any[] }>({
          method: 'POST',
          path: '/crm/v3/objects/contacts/batch/read',
          body: {
            inputs: contactIds.map((id) => ({ id })),
            properties: ['email', 'firstname', 'lastname', 'company'],
          },
        })
        contacts = (response.results || []).map((c: any) => ({
          id: c.id,
          email: c.properties?.email || '',
          firstName: c.properties?.firstname || '',
          lastName: c.properties?.lastname || '',
          company: c.properties?.company || '',
        }))
        totalCount = contacts.length
      } else if (filters.length > 0) {
        // Use search with filters
        const filterGroups = filterLogic === 'AND'
          ? [{ filters: filters.map((f: any) => ({ propertyName: f.propertyName, operator: f.operator, value: f.value })) }]
          : filters.map((f: any) => ({ filters: [{ propertyName: f.propertyName, operator: f.operator, value: f.value }] }))

        const response = await client.request<{ total: number; results: any[] }>({
          method: 'POST',
          path: '/crm/v3/objects/contacts/search',
          body: {
            filterGroups,
            properties: ['email', 'firstname', 'lastname', 'company'],
            limit: previewLimit,
          },
        })
        totalCount = response.total || 0
        contacts = (response.results || []).map((c: any) => ({
          id: c.id,
          email: c.properties?.email || '',
          firstName: c.properties?.firstname || '',
          lastName: c.properties?.lastname || '',
          company: c.properties?.company || '',
        }))
      }

      return new Response(
        JSON.stringify({ success: true, totalCount, contacts }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] preview_contacts error:', e.message)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to preview contacts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Trigger sync with time period options
  if (action === 'trigger_sync') {
    const syncType = typeof body.sync_type === 'string' ? body.sync_type : 'deals'
    const timePeriod = typeof body.time_period === 'string' ? body.time_period : 'last_30_days'

    // Calculate date filter based on time period
    let createdAfter: string | null = null
    const now = new Date()

    switch (timePeriod) {
      case 'last_7_days':
        createdAfter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
        break
      case 'last_30_days':
        createdAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
        break
      case 'last_90_days':
        createdAfter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
        break
      case 'last_year':
        createdAfter = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()
        break
      case 'all_time':
        createdAfter = null
        break
      default:
        createdAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    }

    const { data: integration } = await svc
      .from('hubspot_org_integrations')
      .select('clerk_org_id')
      .eq('org_id', orgId)
      .maybeSingle()

    // Map sync type to allowed job_type values
    const jobTypeMap: Record<string, string> = {
      deals: 'sync_deal',
      contacts: 'sync_contact',
      tasks: 'sync_task',
    }
    const jobType = jobTypeMap[syncType] || 'sync_deal'

    // Queue the sync job
    console.log('[hubspot-admin] Queueing sync job:', { syncType, jobType, timePeriod, createdAfter, orgId })

    const { error: insertError } = await svc
      .from('hubspot_sync_queue')
      .insert({
        org_id: orgId,
        job_type: jobType,
        payload: {
          sync_type: syncType,
          time_period: timePeriod,
          created_after: createdAfter,
          is_initial_sync: true,
        },
        dedupe_key: `initial_sync_${syncType}_${orgId}`,
        priority: 50, // Higher priority for manual syncs
        run_after: new Date().toISOString(),
        attempts: 0,
        max_attempts: 5,
      })

    if (insertError) {
      // Ignore duplicate key errors (job already queued)
      const msg = String(insertError.message || '')
      if (!msg.toLowerCase().includes('duplicate key') && !msg.toLowerCase().includes('unique')) {
        console.error('[hubspot-admin] Failed to queue sync job:', insertError)
        return new Response(JSON.stringify({ success: false, error: insertError.message || 'Failed to queue sync' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log('[hubspot-admin] Sync job already queued (duplicate key)')
    }

    console.log('[hubspot-admin] Sync job queued successfully')
    return new Response(
      JSON.stringify({
        success: true,
        message: `${syncType} sync queued for ${timePeriod.replace(/_/g, ' ')}`,
        created_after: createdAfter,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ============================================================================
  // CRUD Operations for Test Data Mode
  // ============================================================================

  // Create a contact in HubSpot
  if (action === 'create_contact') {
    const properties = body.properties || {}

    // Validate required fields
    if (!properties.email && !properties.firstname && !properties.lastname) {
      return new Response(JSON.stringify({
        success: false,
        error: 'At least one of email, firstname, or lastname is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      console.log('[hubspot-admin] Creating contact with properties:', JSON.stringify(properties))

      const contact = await client.request<{ id: string; properties: any }>({
        method: 'POST',
        path: '/crm/v3/objects/contacts',
        body: { properties },
      })

      console.log('[hubspot-admin] Contact created:', contact.id)

      return new Response(
        JSON.stringify({
          success: true,
          id: contact.id,
          properties: contact.properties,
          objectType: 'contact',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] Failed to create contact:', e)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to create contact' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Create a deal in HubSpot
  if (action === 'create_deal') {
    const properties = body.properties || {}

    // Validate required field
    if (!properties.dealname) {
      return new Response(JSON.stringify({
        success: false,
        error: 'dealname is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      console.log('[hubspot-admin] Creating deal with properties:', JSON.stringify(properties))

      const deal = await client.request<{ id: string; properties: any }>({
        method: 'POST',
        path: '/crm/v3/objects/deals',
        body: { properties },
      })

      console.log('[hubspot-admin] Deal created:', deal.id)

      return new Response(
        JSON.stringify({
          success: true,
          id: deal.id,
          properties: deal.properties,
          objectType: 'deal',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] Failed to create deal:', e)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to create deal' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Create a task in HubSpot
  if (action === 'create_task') {
    const properties = body.properties || {}
    const contactId = body.contact_id || body.contactId || null
    const dealId = body.deal_id || body.dealId || null

    // Validate required fields - tasks require hs_task_subject
    if (!properties.hs_task_subject) {
      return new Response(JSON.stringify({
        success: false,
        error: 'hs_task_subject is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      console.log('[hubspot-admin] Creating task with properties:', JSON.stringify(properties))

      const task = await client.request<{ id: string; properties: any }>({
        method: 'POST',
        path: '/crm/v3/objects/tasks',
        body: { properties },
      })

      console.log('[hubspot-admin] Task created:', task.id)

      // Associate task with contact if contact_id provided
      // Association type 204 = Task to Contact
      if (contactId) {
        try {
          console.log(`[hubspot-admin] Associating task ${task.id} with contact ${contactId}`)
          await client.request({
            method: 'PUT',
            path: `/crm/v3/objects/tasks/${task.id}/associations/contacts/${contactId}/204`,
          })
          console.log('[hubspot-admin] Task associated with contact successfully')
        } catch (assocError: any) {
          console.error('[hubspot-admin] Failed to associate task with contact:', assocError)
          // Don't fail the whole request, just log the warning
        }
      }

      // Associate task with deal if deal_id provided
      // Association type 216 = Task to Deal
      if (dealId) {
        try {
          console.log(`[hubspot-admin] Associating task ${task.id} with deal ${dealId}`)
          await client.request({
            method: 'PUT',
            path: `/crm/v3/objects/tasks/${task.id}/associations/deals/${dealId}/216`,
          })
          console.log('[hubspot-admin] Task associated with deal successfully')
        } catch (assocError: any) {
          console.error('[hubspot-admin] Failed to associate task with deal:', assocError)
          // Don't fail the whole request, just log the warning
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          id: task.id,
          properties: task.properties,
          objectType: 'task',
          associations: {
            contact: contactId || null,
            deal: dealId || null,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] Failed to create task:', e)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to create task' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Create a timeline activity (note) in HubSpot
  // Notes appear on the contact/deal timeline as activities
  if (action === 'create_activity') {
    const properties = body.properties || {}
    const contactId = body.contact_id || body.contactId || null
    const dealId = body.deal_id || body.dealId || null

    // Build note body from properties
    const noteBody = properties.hs_note_body || properties.body || properties.content ||
      properties.message || properties.note || `Activity logged at ${new Date().toISOString()}`

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      console.log('[hubspot-admin] Creating activity/note with body:', noteBody.substring(0, 100))

      // Create a note object
      const note = await client.request<{ id: string; properties: any }>({
        method: 'POST',
        path: '/crm/v3/objects/notes',
        body: {
          properties: {
            hs_note_body: noteBody,
            hs_timestamp: properties.hs_timestamp || new Date().toISOString(),
          },
        },
      })

      console.log('[hubspot-admin] Note created:', note.id)

      // Associate note with contact if contact_id provided
      // Association type 202 = Note to Contact
      if (contactId) {
        try {
          console.log(`[hubspot-admin] Associating note ${note.id} with contact ${contactId}`)
          await client.request({
            method: 'PUT',
            path: `/crm/v3/objects/notes/${note.id}/associations/contacts/${contactId}/202`,
          })
          console.log('[hubspot-admin] Note associated with contact successfully')
        } catch (assocError: any) {
          console.error('[hubspot-admin] Failed to associate note with contact:', assocError)
        }
      }

      // Associate note with deal if deal_id provided
      // Association type 214 = Note to Deal
      if (dealId) {
        try {
          console.log(`[hubspot-admin] Associating note ${note.id} with deal ${dealId}`)
          await client.request({
            method: 'PUT',
            path: `/crm/v3/objects/notes/${note.id}/associations/deals/${dealId}/214`,
          })
          console.log('[hubspot-admin] Note associated with deal successfully')
        } catch (assocError: any) {
          console.error('[hubspot-admin] Failed to associate note with deal:', assocError)
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          id: note.id,
          properties: note.properties,
          objectType: 'note',
          associations: {
            contact: contactId || null,
            deal: dealId || null,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] Failed to create activity/note:', e)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to create activity' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Update a contact in HubSpot (e.g., lifecycle stage)
  if (action === 'update_contact') {
    const contactId = body.record_id || body.contact_id || body.id
    const properties = body.properties || {}

    if (!contactId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'record_id is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (Object.keys(properties).length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'At least one property to update is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      console.log('[hubspot-admin] Updating contact:', contactId, 'with properties:', JSON.stringify(properties))

      const contact = await client.request<{ id: string; properties: any }>({
        method: 'PATCH',
        path: `/crm/v3/objects/contacts/${contactId}`,
        body: { properties },
      })

      console.log('[hubspot-admin] Contact updated:', contact.id)

      return new Response(
        JSON.stringify({
          success: true,
          id: contact.id,
          properties: contact.properties,
          objectType: 'contact',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] Failed to update contact:', e)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to update contact' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Update a deal in HubSpot (e.g., pipeline stage)
  if (action === 'update_deal') {
    const dealId = body.record_id || body.deal_id || body.id
    const properties = body.properties || {}

    if (!dealId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'record_id is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (Object.keys(properties).length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'At least one property to update is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      console.log('[hubspot-admin] Updating deal:', dealId, 'with properties:', JSON.stringify(properties))

      const deal = await client.request<{ id: string; properties: any }>({
        method: 'PATCH',
        path: `/crm/v3/objects/deals/${dealId}`,
        body: { properties },
      })

      console.log('[hubspot-admin] Deal updated:', deal.id)

      return new Response(
        JSON.stringify({
          success: true,
          id: deal.id,
          properties: deal.properties,
          objectType: 'deal',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] Failed to update deal:', e)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to update deal' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Update a task in HubSpot (e.g., status)
  if (action === 'update_task') {
    const taskId = body.record_id || body.task_id || body.id
    const properties = body.properties || {}

    if (!taskId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'record_id is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (Object.keys(properties).length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'At least one property to update is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      console.log('[hubspot-admin] Updating task:', taskId, 'with properties:', JSON.stringify(properties))

      const task = await client.request<{ id: string; properties: any }>({
        method: 'PATCH',
        path: `/crm/v3/objects/tasks/${taskId}`,
        body: { properties },
      })

      console.log('[hubspot-admin] Task updated:', task.id)

      return new Response(
        JSON.stringify({
          success: true,
          id: task.id,
          properties: task.properties,
          objectType: 'task',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] Failed to update task:', e)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to update task' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Delete a contact from HubSpot
  if (action === 'delete_contact') {
    const contactId = body.record_id || body.contact_id || body.id

    if (!contactId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'record_id is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      console.log('[hubspot-admin] Deleting contact:', contactId)

      await client.request({
        method: 'DELETE',
        path: `/crm/v3/objects/contacts/${contactId}`,
      })

      console.log('[hubspot-admin] Contact deleted:', contactId)

      return new Response(
        JSON.stringify({
          success: true,
          deleted: true,
          id: contactId,
          objectType: 'contact',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] Failed to delete contact:', e)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to delete contact' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Delete a deal from HubSpot
  if (action === 'delete_deal') {
    const dealId = body.record_id || body.deal_id || body.id

    if (!dealId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'record_id is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      console.log('[hubspot-admin] Deleting deal:', dealId)

      await client.request({
        method: 'DELETE',
        path: `/crm/v3/objects/deals/${dealId}`,
      })

      console.log('[hubspot-admin] Deal deleted:', dealId)

      return new Response(
        JSON.stringify({
          success: true,
          deleted: true,
          id: dealId,
          objectType: 'deal',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] Failed to delete deal:', e)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to delete deal' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Delete a task from HubSpot
  if (action === 'delete_task') {
    const taskId = body.record_id || body.task_id || body.id

    if (!taskId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'record_id is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      console.log('[hubspot-admin] Deleting task:', taskId)

      await client.request({
        method: 'DELETE',
        path: `/crm/v3/objects/tasks/${taskId}`,
      })

      console.log('[hubspot-admin] Task deleted:', taskId)

      return new Response(
        JSON.stringify({
          success: true,
          deleted: true,
          id: taskId,
          objectType: 'task',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] Failed to delete task:', e)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to delete task' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // ============================================================================
  // Detect Fields — fetches HubSpot properties and auto-classifies mappings
  // ============================================================================

  if (action === 'detect_fields') {
    const objectType = typeof body.object_type === 'string' ? body.object_type : 'contacts'

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      const propertiesResponse = await client.request<{ results: any[] }>({
        method: 'GET',
        path: `/crm/v3/properties/${objectType}`,
      })

      const properties = propertiesResponse.results || []

      // Auto-classification: map HubSpot field names to sixty field names with confidence
      const sixtyFieldMap: Record<string, { sixty_field: string; confidence: number }> = {
        // Contact fields
        email: { sixty_field: 'email', confidence: 1.0 },
        firstname: { sixty_field: 'first_name', confidence: 1.0 },
        lastname: { sixty_field: 'last_name', confidence: 1.0 },
        phone: { sixty_field: 'phone', confidence: 1.0 },
        mobilephone: { sixty_field: 'mobile_phone', confidence: 1.0 },
        company: { sixty_field: 'company_name', confidence: 1.0 },
        jobtitle: { sixty_field: 'job_title', confidence: 1.0 },
        website: { sixty_field: 'website', confidence: 1.0 },
        city: { sixty_field: 'city', confidence: 1.0 },
        country: { sixty_field: 'country', confidence: 1.0 },
        linkedin_url: { sixty_field: 'linkedin_url', confidence: 1.0 },
        // Deal fields
        dealname: { sixty_field: 'name', confidence: 1.0 },
        amount: { sixty_field: 'value', confidence: 1.0 },
        dealstage: { sixty_field: 'stage', confidence: 1.0 },
        pipeline: { sixty_field: 'pipeline', confidence: 1.0 },
        closedate: { sixty_field: 'expected_close_date', confidence: 1.0 },
        description: { sixty_field: 'description', confidence: 0.9 },
        hs_next_step: { sixty_field: 'next_steps', confidence: 1.0 },
        hubspot_owner_id: { sixty_field: 'owner_id', confidence: 0.8 },
        // Fuzzy matches (common patterns)
        notes: { sixty_field: 'notes', confidence: 0.9 },
        hs_deal_stage_probability: { sixty_field: 'stage_probability', confidence: 0.8 },
        num_associated_contacts: { sixty_field: 'contacts_count', confidence: 0.7 },
      }

      const classifiedFields = properties.map((prop: any) => {
        const fieldName: string = prop.name || ''
        const exactMatch = sixtyFieldMap[fieldName]
        let sixtyField: string | null = null
        let confidence = 0

        if (exactMatch) {
          sixtyField = exactMatch.sixty_field
          confidence = exactMatch.confidence
        } else {
          // Fuzzy matching: check for partial name overlaps
          for (const [hsName, mapping] of Object.entries(sixtyFieldMap)) {
            const normalHs = hsName.toLowerCase().replace(/[_-]/g, '')
            const normalField = fieldName.toLowerCase().replace(/[_-]/g, '')
            if (normalField.includes(normalHs) || normalHs.includes(normalField)) {
              if (mapping.confidence > confidence) {
                sixtyField = mapping.sixty_field
                confidence = mapping.confidence * 0.7 // Discount for fuzzy match
              }
            }
          }
        }

        return {
          crm_field_name: fieldName,
          crm_field_type: prop.type || 'string',
          crm_field_label: prop.label || fieldName,
          group_name: prop.groupName || '',
          sixty_field_name: sixtyField,
          confidence,
          is_required: prop.fieldType === 'required' || false,
          options: prop.options || [],
        }
      })

      // Sort: high confidence first
      classifiedFields.sort((a: any, b: any) => b.confidence - a.confidence)

      return new Response(
        JSON.stringify({ success: true, fields: classifiedFields, total: classifiedFields.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] detect_fields error:', e.message)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to detect fields' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // ============================================================================
  // Test Mapping — fetches 5 sample records and tests current field mapping
  // ============================================================================

  if (action === 'test_mapping') {
    const objectType = typeof body.object_type === 'string' ? body.object_type : 'contacts'
    const mappings: Array<{ crm_field_name: string; sixty_field_name: string }> = Array.isArray(body.mappings) ? body.mappings : []

    const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId)
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: tokenError || 'HubSpot not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new HubSpotClient({ accessToken })

    try {
      // Fetch 5 sample records from HubSpot
      const propertiesToFetch = mappings.map((m) => m.crm_field_name).filter(Boolean)

      const sampleResponse = await client.request<{ results: any[] }>({
        method: 'POST',
        path: `/crm/v3/objects/${objectType}/search`,
        body: {
          filterGroups: [],
          properties: propertiesToFetch.length > 0 ? propertiesToFetch : ['email', 'firstname', 'lastname'],
          limit: 5,
        },
      })

      const records = sampleResponse.results || []

      // Test each mapping against the sample records
      const fieldResults = mappings.map((mapping) => {
        const { crm_field_name, sixty_field_name } = mapping
        let successCount = 0
        let nullCount = 0
        const sampleValues: unknown[] = []

        for (const record of records) {
          const value = record.properties?.[crm_field_name]
          if (value !== null && value !== undefined && value !== '') {
            successCount++
            sampleValues.push(value)
          } else {
            nullCount++
          }
        }

        return {
          crm_field_name,
          sixty_field_name,
          status: records.length === 0 ? 'no_data' : successCount > 0 ? 'pass' : 'empty',
          success_count: successCount,
          null_count: nullCount,
          sample_values: sampleValues.slice(0, 3),
          total_records_checked: records.length,
        }
      })

      return new Response(
        JSON.stringify({
          success: true,
          object_type: objectType,
          records_sampled: records.length,
          field_results: fieldResults,
          pass_count: fieldResults.filter((r) => r.status === 'pass').length,
          fail_count: fieldResults.filter((r) => r.status === 'empty').length,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (e: any) {
      console.error('[hubspot-admin] test_mapping error:', e.message)
      return new Response(JSON.stringify({ success: false, error: e.message || 'Failed to test mapping' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

  } catch (e: any) {
    console.error('[hubspot-admin] Unhandled error:', e)
    return new Response(JSON.stringify({ success: false, error: e.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})


