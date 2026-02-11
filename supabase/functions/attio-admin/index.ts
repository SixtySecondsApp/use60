import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { AttioClient, AttioError } from '../_shared/attio.ts'

// Attio Admin Edge Function - action router
type Action =
  | 'status'
  | 'get_objects'
  | 'get_attributes'
  | 'get_lists'
  | 'get_records'
  | 'create_record'
  | 'update_record'
  | 'delete_record'
  | 'assert_record'
  | 'get_notes'
  | 'create_note'
  | 'get_tasks'
  | 'create_task'
  | 'get_settings'
  | 'save_settings'
  | 'trigger_sync'
  | 'setup_webhook'
  | 'remove_webhook'

/**
 * Get a valid Attio access token, refreshing via OAuth if expired or about to expire.
 */
async function getValidToken(
  svc: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ accessToken: string | null; error: string | null }> {
  const { data: creds, error: credsError } = await svc
    .from('attio_org_credentials')
    .select('access_token, refresh_token, token_expires_at')
    .eq('org_id', orgId)
    .maybeSingle()

  if (credsError || !creds) {
    return { accessToken: null, error: 'Attio not connected' }
  }

  const accessToken = creds.access_token as string | null
  const refreshToken = creds.refresh_token as string | null
  const tokenExpiresAt = creds.token_expires_at as string | null

  if (!accessToken || !refreshToken) {
    return { accessToken: null, error: 'Attio not connected' }
  }

  // Check if token is expired or will expire within 5 minutes
  const now = Date.now()
  const expiresAt = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() : 0
  const isExpiredOrExpiring = expiresAt - now < 5 * 60 * 1000

  if (!isExpiredOrExpiring) {
    return { accessToken, error: null }
  }

  // Token needs refresh
  console.log('[attio-admin] Token expired or expiring soon, refreshing...')

  const clientId = Deno.env.get('ATTIO_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('ATTIO_CLIENT_SECRET') || ''

  if (!clientId || !clientSecret) {
    return { accessToken: null, error: 'Server misconfigured: missing Attio OAuth credentials' }
  }

  try {
    const tokenResp = await fetch('https://app.attio.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    })

    const tokenData = await tokenResp.json()

    if (!tokenResp.ok) {
      const msg = tokenData?.error_description || tokenData?.error || 'Token refresh failed'
      console.error('[attio-admin] Token refresh failed:', msg)

      // If refresh token is invalid, mark as disconnected
      if (tokenData?.error === 'invalid_grant' || tokenResp.status === 400) {
        await svc
          .from('attio_org_integrations')
          .update({ is_connected: false, updated_at: new Date().toISOString() })
          .eq('org_id', orgId)
        return { accessToken: null, error: 'Attio connection expired. Please reconnect.' }
      }

      return { accessToken: null, error: `Token refresh failed: ${msg}` }
    }

    const newAccessToken = tokenData.access_token as string
    const newRefreshToken = tokenData.refresh_token || refreshToken
    const expiresIn = Number(tokenData.expires_in || 3600)
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    const { error: updateError } = await svc
      .from('attio_org_credentials')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)

    if (updateError) {
      console.error('[attio-admin] Failed to update refreshed token:', updateError)
      return { accessToken: null, error: 'Failed to save refreshed token' }
    }

    console.log('[attio-admin] Token refreshed successfully, expires at:', newExpiresAt)
    return { accessToken: newAccessToken, error: null }
  } catch (e) {
    console.error('[attio-admin] Token refresh error:', e)
    return { accessToken: null, error: e instanceof Error ? e.message : 'Token refresh failed' }
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return errorResponse('Server misconfigured', req, 500)
    }

    // Authenticate user
    const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (!userToken) {
      return errorResponse('Unauthorized', req, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return errorResponse('Unauthorized', req, 401)
    }

    // Parse request body
    let body: any = {}
    try {
      const rawBody = await req.text()
      if (rawBody) {
        body = JSON.parse(rawBody)
      }
    } catch (e: any) {
      return errorResponse(`Invalid JSON body: ${e.message}`, req, 400)
    }

    const action: Action | null = typeof body.action === 'string' ? (body.action as Action) : null
    const orgId = typeof body.org_id === 'string' ? body.org_id : null

    console.log('[attio-admin] action:', action, 'org_id:', orgId)

    if (!action || !orgId) {
      return jsonResponse({
        success: false,
        error: 'Missing action or org_id',
        received: { action: body.action, org_id: body.org_id, bodyKeys: Object.keys(body) },
      }, req, 400)
    }

    // Service role client for credential/settings access
    const svc = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Verify org admin/owner role
    const { data: membership } = await svc
      .from('organization_memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    const role = membership?.role as string | undefined
    const isAdmin = role === 'owner' || role === 'admin'

    if (!isAdmin) {
      return errorResponse('Forbidden', req, 403)
    }

    // ─── Actions that don't need an Attio API token ───────────────────────

    if (action === 'status') {
      const { data: integration } = await svc
        .from('attio_org_integrations')
        .select('is_connected, workspace_id, workspace_name, last_sync_at, connected_at, scopes, webhook_id')
        .eq('org_id', orgId)
        .maybeSingle()

      return jsonResponse({
        success: true,
        connected: Boolean(integration?.is_connected),
        integration: integration || null,
      }, req)
    }

    if (action === 'get_settings') {
      const { data: settingsRow } = await svc
        .from('attio_settings')
        .select('settings')
        .eq('org_id', orgId)
        .maybeSingle()

      return jsonResponse({
        success: true,
        settings: settingsRow?.settings || {},
      }, req)
    }

    if (action === 'save_settings') {
      const settings = body.settings ?? {}
      console.log('[attio-admin] Saving settings for org:', orgId)

      const { error: upsertError } = await svc
        .from('attio_settings')
        .upsert(
          { org_id: orgId, settings, updated_at: new Date().toISOString() },
          { onConflict: 'org_id' }
        )

      if (upsertError) {
        console.error('[attio-admin] Failed to save settings:', upsertError)
        return errorResponse(upsertError.message || 'Failed to save settings', req, 500)
      }

      return jsonResponse({ success: true }, req)
    }

    if (action === 'trigger_sync') {
      const jobType = typeof body.job_type === 'string' ? body.job_type : 'sync_table'
      const payload = body.payload ?? {}

      const { error: insertError } = await svc
        .from('attio_sync_queue')
        .insert({
          org_id: orgId,
          job_type: jobType,
          payload,
          created_at: new Date().toISOString(),
        })

      if (insertError) {
        console.error('[attio-admin] Failed to queue sync job:', insertError)
        return errorResponse(insertError.message || 'Failed to queue sync', req, 500)
      }

      return jsonResponse({ success: true, message: 'Sync job queued' }, req)
    }

    // ─── Actions that need a valid Attio token ────────────────────────────

    const { accessToken, error: tokenError } = await getValidToken(svc, orgId)
    if (!accessToken) {
      return errorResponse(tokenError || 'Attio not connected', req, 400)
    }

    const client = new AttioClient({ accessToken })

    // ─── Object / Attribute / List queries ────────────────────────────────

    if (action === 'get_objects') {
      const result = await client.listObjects()
      return jsonResponse({ success: true, objects: result.data }, req)
    }

    if (action === 'get_attributes') {
      const object = typeof body.object === 'string' ? body.object : null
      if (!object) {
        return errorResponse('Missing object parameter', req, 400)
      }
      const result = await client.listAttributes(object)
      return jsonResponse({ success: true, attributes: result.data }, req)
    }

    if (action === 'get_lists') {
      const result = await client.listLists()
      return jsonResponse({ success: true, lists: result.data }, req)
    }

    // ─── Record CRUD ──────────────────────────────────────────────────────

    if (action === 'get_records') {
      const object = typeof body.object === 'string' ? body.object : null
      if (!object) {
        return errorResponse('Missing object parameter', req, 400)
      }
      const result = await client.queryRecords(object, {
        filter: body.filter,
        sorts: body.sorts,
        limit: typeof body.limit === 'number' ? body.limit : undefined,
        offset: typeof body.offset === 'number' ? body.offset : undefined,
      })
      return jsonResponse({ success: true, records: result.data, next_offset: result.next_offset }, req)
    }

    if (action === 'create_record') {
      const object = typeof body.object === 'string' ? body.object : null
      if (!object || !body.values) {
        return errorResponse('Missing object or values parameter', req, 400)
      }
      const result = await client.createRecord(object, body.values)
      return jsonResponse({ success: true, record: result }, req)
    }

    if (action === 'update_record') {
      const object = typeof body.object === 'string' ? body.object : null
      const recordId = typeof body.record_id === 'string' ? body.record_id : null
      if (!object || !recordId || !body.values) {
        return errorResponse('Missing object, record_id, or values parameter', req, 400)
      }
      const result = await client.updateRecord(object, recordId, body.values)
      return jsonResponse({ success: true, record: result }, req)
    }

    if (action === 'delete_record') {
      const object = typeof body.object === 'string' ? body.object : null
      const recordId = typeof body.record_id === 'string' ? body.record_id : null
      if (!object || !recordId) {
        return errorResponse('Missing object or record_id parameter', req, 400)
      }
      await client.deleteRecord(object, recordId)
      return jsonResponse({ success: true, deleted: true }, req)
    }

    if (action === 'assert_record') {
      const object = typeof body.object === 'string' ? body.object : null
      const matchingAttribute = typeof body.matching_attribute === 'string' ? body.matching_attribute : null
      if (!object || !body.values || !matchingAttribute) {
        return errorResponse('Missing object, values, or matching_attribute parameter', req, 400)
      }
      const result = await client.assertRecord(object, body.values, matchingAttribute)
      return jsonResponse({ success: true, record: result }, req)
    }

    // ─── Notes ────────────────────────────────────────────────────────────

    if (action === 'get_notes') {
      const result = await client.listNotes({
        parent_object: typeof body.parent_object === 'string' ? body.parent_object : undefined,
        parent_record_id: typeof body.parent_record_id === 'string' ? body.parent_record_id : undefined,
        limit: typeof body.limit === 'number' ? body.limit : undefined,
      })
      return jsonResponse({ success: true, notes: result.data }, req)
    }

    if (action === 'create_note') {
      const parentObject = typeof body.parent_object === 'string' ? body.parent_object : null
      const parentRecordId = typeof body.parent_record_id === 'string' ? body.parent_record_id : null
      const title = typeof body.title === 'string' ? body.title : null
      if (!parentObject || !parentRecordId || !title) {
        return errorResponse('Missing parent_object, parent_record_id, or title', req, 400)
      }
      const result = await client.createNote({
        parent_object: parentObject,
        parent_record_id: parentRecordId,
        title,
        content_plaintext: typeof body.content === 'string' ? body.content : undefined,
        format: 'plaintext',
      })
      return jsonResponse({ success: true, note: result }, req)
    }

    // ─── Tasks ────────────────────────────────────────────────────────────

    if (action === 'get_tasks') {
      const result = await client.listTasks({
        limit: typeof body.limit === 'number' ? body.limit : undefined,
        offset: typeof body.offset === 'number' ? body.offset : undefined,
      })
      return jsonResponse({ success: true, tasks: result.data }, req)
    }

    if (action === 'create_task') {
      const content = typeof body.content === 'string' ? body.content : null
      if (!content) {
        return errorResponse('Missing content parameter', req, 400)
      }
      const result = await client.createTask({
        content,
        deadline_at: typeof body.deadline_at === 'string' ? body.deadline_at : undefined,
        assignees: Array.isArray(body.assignees) ? body.assignees : undefined,
        linked_records: Array.isArray(body.linked_records) ? body.linked_records : undefined,
      })
      return jsonResponse({ success: true, task: result }, req)
    }

    // ─── Webhooks ─────────────────────────────────────────────────────────

    if (action === 'setup_webhook') {
      const webhookSecret = crypto.randomUUID()
      const targetUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/attio-webhook?secret=${encodeURIComponent(webhookSecret)}`

      const subscriptions = Array.isArray(body.subscriptions) ? body.subscriptions : [
        { event_type: 'record.created' },
        { event_type: 'record.updated' },
        { event_type: 'record.deleted' },
      ]

      const result = await client.createWebhook({
        target_url: targetUrl,
        subscriptions,
      })

      const webhookId = result?.data?.id?.webhook_id || result?.id?.webhook_id || result?.data?.id || result?.id
      if (webhookId) {
        await svc
          .from('attio_org_integrations')
          .update({
            webhook_id: webhookId,
            webhook_secret: webhookSecret,
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', orgId)
      }

      return jsonResponse({ success: true, webhook: result, webhook_id: webhookId }, req)
    }

    if (action === 'remove_webhook') {
      const { data: integration } = await svc
        .from('attio_org_integrations')
        .select('webhook_id')
        .eq('org_id', orgId)
        .maybeSingle()

      const webhookId = typeof body.webhook_id === 'string'
        ? body.webhook_id
        : integration?.webhook_id

      if (!webhookId) {
        return errorResponse('No webhook configured', req, 400)
      }

      await client.deleteWebhook(webhookId)

      await svc
        .from('attio_org_integrations')
        .update({
          webhook_id: null,
          webhook_secret: null,
          updated_at: new Date().toISOString(),
        })
        .eq('org_id', orgId)

      return jsonResponse({ success: true, deleted: true }, req)
    }

    // ─── Unknown action ───────────────────────────────────────────────────

    return errorResponse(`Unknown action: ${action}`, req, 400)

  } catch (e: any) {
    console.error('[attio-admin] Unhandled error:', e)

    if (e instanceof AttioError) {
      return jsonResponse(
        { success: false, error: e.message, attio_status: e.status },
        req,
        e.status >= 400 && e.status < 600 ? e.status : 500,
      )
    }

    return errorResponse(e.message || 'Internal server error', req, 500)
  }
})
