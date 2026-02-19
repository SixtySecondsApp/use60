import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  BullhornClient,
  refreshTokens,
  exchangeAccessTokenForRestToken,
} from '../_shared/bullhorn.ts'

// Bullhorn Admin Edge Function - v1
type Action =
  | 'status'
  | 'refresh_token'
  | 'save_settings'
  | 'enqueue'
  | 'trigger_sync'
  | 'get_entity'
  | 'search'
  | 'test_connection'

/**
 * Get valid Bullhorn credentials, refreshing if expired or about to expire.
 * Returns bhRestToken, restUrl, and any error.
 */
async function getValidBullhornCredentials(
  svc: ReturnType<typeof createClient>,
  orgId: string
): Promise<{
  bhRestToken: string | null
  restUrl: string | null
  error: string | null
}> {
  const { data: creds, error: credsError } = await svc
    .from('bullhorn_org_credentials')
    .select('access_token, refresh_token, bh_rest_token, rest_url, token_expires_at')
    .eq('org_id', orgId)
    .maybeSingle()

  if (credsError || !creds) {
    return { bhRestToken: null, restUrl: null, error: 'Bullhorn not connected' }
  }

  const accessToken = creds.access_token as string | null
  const refreshToken = creds.refresh_token as string | null
  const bhRestToken = creds.bh_rest_token as string | null
  const restUrl = creds.rest_url as string | null
  const tokenExpiresAt = creds.token_expires_at as string | null

  if (!accessToken || !refreshToken || !bhRestToken || !restUrl) {
    return { bhRestToken: null, restUrl: null, error: 'Bullhorn not connected' }
  }

  // Check if token is expired or will expire within 5 minutes
  const now = Date.now()
  const expiresAt = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() : 0
  const isExpiredOrExpiring = expiresAt - now < 5 * 60 * 1000 // 5 minutes buffer

  if (!isExpiredOrExpiring) {
    return { bhRestToken, restUrl, error: null }
  }

  // Token needs refresh
  console.log('[bullhorn-admin] Token expired or expiring soon, refreshing...')

  const clientId = Deno.env.get('BULLHORN_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('BULLHORN_CLIENT_SECRET') || ''

  if (!clientId || !clientSecret) {
    return { bhRestToken: null, restUrl: null, error: 'Server misconfigured: missing Bullhorn credentials' }
  }

  try {
    // Refresh OAuth tokens
    const tokenData = await refreshTokens(refreshToken, clientId, clientSecret)

    const newAccessToken = tokenData.access_token
    const newRefreshToken = tokenData.refresh_token || refreshToken
    const expiresIn = Number(tokenData.expires_in || 1800)
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Exchange new access token for BhRestToken
    const restTokenData = await exchangeAccessTokenForRestToken(newAccessToken)

    const newBhRestToken = restTokenData.BhRestToken
    const newRestUrl = restTokenData.restUrl

    // Update credentials in database
    const { error: updateError } = await svc
      .from('bullhorn_org_credentials')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        bh_rest_token: newBhRestToken,
        rest_url: newRestUrl,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)

    if (updateError) {
      console.error('[bullhorn-admin] Failed to update refreshed token:', updateError)
      return { bhRestToken: null, restUrl: null, error: 'Failed to save refreshed token' }
    }

    console.log('[bullhorn-admin] Token refreshed successfully, expires at:', newExpiresAt)
    return { bhRestToken: newBhRestToken, restUrl: newRestUrl, error: null }
  } catch (e) {
    console.error('[bullhorn-admin] Token refresh error:', e)

    // If refresh token is invalid, mark as disconnected
    if (e instanceof Error && (e.message.includes('invalid_grant') || e.message.includes('invalid_token'))) {
      await svc
        .from('bullhorn_org_integrations')
        .update({ is_active: false, is_connected: false, updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
      return { bhRestToken: null, restUrl: null, error: 'Bullhorn connection expired. Please reconnect.' }
    }

    return { bhRestToken: null, restUrl: null, error: e instanceof Error ? e.message : 'Token refresh failed' }
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

    let body: Record<string, unknown> = {}
    try {
      const rawBody = await req.text()
      console.log('[bullhorn-admin] Raw body received:', rawBody ? rawBody.substring(0, 200) : '(empty)')
      if (rawBody) {
        body = JSON.parse(rawBody)
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown parse error'
      console.error('[bullhorn-admin] Body parse error:', errorMessage)
      return new Response(JSON.stringify({ success: false, error: `Invalid JSON body: ${errorMessage}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const action: Action | null = typeof body.action === 'string' ? (body.action as Action) : null
    const orgId = typeof body.org_id === 'string' ? body.org_id : null

    console.log('[bullhorn-admin] Parsed action:', action, 'org_id:', orgId)

    if (!action || !orgId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing action or org_id',
          received: { action: body.action, org_id: body.org_id, bodyKeys: Object.keys(body) },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const svc = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

    // Check user is org admin/owner
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

    // =========================================================================
    // Action: status
    // =========================================================================
    if (action === 'status') {
      const { data: integration } = await svc
        .from('bullhorn_org_integrations')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .maybeSingle()
      const { data: syncState } = await svc.from('bullhorn_org_sync_state').select('*').eq('org_id', orgId).maybeSingle()
      const { data: settingsRow } = await svc.from('bullhorn_settings').select('settings').eq('org_id', orgId).maybeSingle()

      const publicUrl = Deno.env.get('PUBLIC_URL') || Deno.env.get('FRONTEND_URL') || ''
      const webhookToken = integration?.webhook_token ? String(integration.webhook_token) : null
      const webhookUrl =
        webhookToken && publicUrl
          ? `${publicUrl.replace(/\/$/, '')}/api/webhooks/bullhorn?token=${encodeURIComponent(webhookToken)}`
          : null

      // Check token validity (without refreshing)
      const { data: creds } = await svc
        .from('bullhorn_org_credentials')
        .select('token_expires_at')
        .eq('org_id', orgId)
        .maybeSingle()

      let tokenValid = false
      let tokenExpiresAt: string | null = null
      if (creds?.token_expires_at) {
        tokenExpiresAt = creds.token_expires_at as string
        const expiresAtMs = new Date(tokenExpiresAt).getTime()
        tokenValid = Date.now() < expiresAtMs
      }

      return new Response(
        JSON.stringify({
          success: true,
          connected: Boolean(integration?.is_connected),
          integration,
          sync_state: syncState || null,
          settings: settingsRow?.settings || {},
          webhook_url: webhookUrl,
          token_valid: tokenValid,
          token_expires_at: tokenExpiresAt,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // =========================================================================
    // Action: refresh_token
    // =========================================================================
    if (action === 'refresh_token') {
      const { data: creds, error: credsError } = await svc
        .from('bullhorn_org_credentials')
        .select('refresh_token')
        .eq('org_id', orgId)
        .maybeSingle()

      if (credsError || !creds?.refresh_token) {
        return new Response(JSON.stringify({ success: false, error: 'No Bullhorn credentials found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const clientId = Deno.env.get('BULLHORN_CLIENT_ID') || ''
      const clientSecret = Deno.env.get('BULLHORN_CLIENT_SECRET') || ''

      if (!clientId || !clientSecret) {
        return new Response(JSON.stringify({ success: false, error: 'Server misconfigured: missing Bullhorn credentials' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      try {
        // Refresh OAuth tokens
        const tokenData = await refreshTokens(creds.refresh_token as string, clientId, clientSecret)

        const newAccessToken = tokenData.access_token
        const newRefreshToken = tokenData.refresh_token || (creds.refresh_token as string)
        const expiresIn = Number(tokenData.expires_in || 1800)
        const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

        // Exchange new access token for BhRestToken
        const restTokenData = await exchangeAccessTokenForRestToken(newAccessToken)

        const newBhRestToken = restTokenData.BhRestToken
        const newRestUrl = restTokenData.restUrl

        // Update credentials in database
        const { error: updateError } = await svc
          .from('bullhorn_org_credentials')
          .update({
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            bh_rest_token: newBhRestToken,
            rest_url: newRestUrl,
            token_expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', orgId)

        if (updateError) {
          console.error('[bullhorn-admin] Failed to update refreshed token:', updateError)
          return new Response(JSON.stringify({ success: false, error: 'Failed to save refreshed token' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        console.log('[bullhorn-admin] Token refreshed successfully via manual action')
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Token refreshed successfully',
            token_expires_at: newExpiresAt,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (e) {
        console.error('[bullhorn-admin] Token refresh error:', e)

        // If refresh token is invalid, mark as disconnected
        if (e instanceof Error && (e.message.includes('invalid_grant') || e.message.includes('invalid_token'))) {
          await svc
            .from('bullhorn_org_integrations')
            .update({ is_active: false, is_connected: false, updated_at: new Date().toISOString() })
            .eq('org_id', orgId)
          return new Response(
            JSON.stringify({ success: false, error: 'Bullhorn connection expired. Please reconnect.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Token refresh failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // =========================================================================
    // Action: save_settings
    // =========================================================================
    if (action === 'save_settings') {
      const settings = body.settings ?? {}
      console.log('[bullhorn-admin] Saving settings for org:', orgId, 'settings:', JSON.stringify(settings).substring(0, 200))

      const { error: upsertError } = await svc
        .from('bullhorn_settings')
        .upsert({ org_id: orgId, settings, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })

      if (upsertError) {
        console.error('[bullhorn-admin] Failed to save settings:', upsertError)
        return new Response(JSON.stringify({ success: false, error: upsertError.message || 'Failed to save settings' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('[bullhorn-admin] Settings saved successfully')
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // =========================================================================
    // Action: enqueue
    // =========================================================================
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
      const priority = typeof body.priority === 'number' ? body.priority : 0

      const { error: insertError } = await svc.from('bullhorn_sync_queue').insert({
        org_id: orgId,
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
        console.log('[bullhorn-admin] Job already queued (duplicate key)')
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // =========================================================================
    // Action: trigger_sync
    // =========================================================================
    if (action === 'trigger_sync') {
      const syncType = typeof body.sync_type === 'string' ? body.sync_type : 'all'

      // Map sync type to job_type values
      const jobTypeMap: Record<string, string[]> = {
        candidates: ['sync_candidate'],
        clients: ['sync_client_contact', 'sync_client_corporation'],
        jobs: ['sync_job_order'],
        placements: ['sync_placement'],
        opportunities: ['sync_opportunity'],
        all: [
          'sync_candidate',
          'sync_client_contact',
          'sync_client_corporation',
          'sync_job_order',
          'sync_placement',
          'sync_opportunity',
        ],
      }

      const jobTypes = jobTypeMap[syncType] || jobTypeMap['all']

      console.log('[bullhorn-admin] Queueing sync jobs:', { syncType, jobTypes, orgId })

      const queuedJobs: string[] = []
      for (const jobType of jobTypes) {
        const { error: insertError } = await svc.from('bullhorn_sync_queue').insert({
          org_id: orgId,
          job_type: jobType,
          payload: {
            sync_type: syncType,
            is_full_sync: true,
            triggered_by: 'admin',
          },
          dedupe_key: `full_sync_${jobType}_${orgId}`,
          priority: 50, // Higher priority for manual syncs
          run_after: new Date().toISOString(),
          attempts: 0,
          max_attempts: 5,
        })

        if (insertError) {
          const msg = String(insertError.message || '')
          if (!msg.toLowerCase().includes('duplicate key') && !msg.toLowerCase().includes('unique')) {
            console.error('[bullhorn-admin] Failed to queue sync job:', insertError)
            continue
          }
          console.log(`[bullhorn-admin] ${jobType} sync job already queued (duplicate key)`)
        }
        queuedJobs.push(jobType)
      }

      console.log('[bullhorn-admin] Sync jobs queued successfully:', queuedJobs)
      return new Response(
        JSON.stringify({
          success: true,
          message: `${syncType} sync queued`,
          queued_jobs: queuedJobs,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // =========================================================================
    // Action: get_entity
    // =========================================================================
    if (action === 'get_entity') {
      const entityType = typeof body.entity_type === 'string' ? body.entity_type : null
      const entityId = typeof body.entity_id === 'number' ? body.entity_id : typeof body.entity_id === 'string' ? parseInt(body.entity_id, 10) : null

      if (!entityType || entityId === null || isNaN(entityId)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing or invalid entity_type or entity_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get valid credentials (auto-refreshes if needed)
      const { bhRestToken, restUrl, error: tokenError } = await getValidBullhornCredentials(svc, orgId)

      if (!bhRestToken || !restUrl) {
        return new Response(JSON.stringify({ success: false, error: tokenError || 'Bullhorn not connected' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const client = new BullhornClient({ bhRestToken, restUrl })

      try {
        console.log(`[bullhorn-admin] Fetching entity: ${entityType}/${entityId}`)

        const fields = typeof body.fields === 'string' ? body.fields : '*'
        const data = await client.request<{ data: unknown }>({
          method: 'GET',
          path: `entity/${entityType}/${entityId}`,
          query: { fields },
        })

        return new Response(
          JSON.stringify({
            success: true,
            entity_type: entityType,
            entity_id: entityId,
            data: data.data,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (e) {
        console.error('[bullhorn-admin] Failed to fetch entity:', e)
        return new Response(
          JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Failed to fetch entity' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // =========================================================================
    // Action: search
    // =========================================================================
    if (action === 'search') {
      const entityType = typeof body.entity_type === 'string' ? body.entity_type : null
      const query = typeof body.query === 'string' ? body.query : null

      if (!entityType || !query) {
        return new Response(JSON.stringify({ success: false, error: 'Missing entity_type or query' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Get valid credentials (auto-refreshes if needed)
      const { bhRestToken, restUrl, error: tokenError } = await getValidBullhornCredentials(svc, orgId)

      if (!bhRestToken || !restUrl) {
        return new Response(JSON.stringify({ success: false, error: tokenError || 'Bullhorn not connected' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const client = new BullhornClient({ bhRestToken, restUrl })

      try {
        console.log(`[bullhorn-admin] Searching ${entityType} with query: ${query}`)

        const fields = typeof body.fields === 'string' ? body.fields : '*'
        const count = typeof body.count === 'number' ? body.count : 20
        const start = typeof body.start === 'number' ? body.start : 0

        const data = await client.request<{ total: number; start: number; count: number; data: unknown[] }>({
          method: 'GET',
          path: `search/${entityType}`,
          query: { query, fields, count, start },
        })

        return new Response(
          JSON.stringify({
            success: true,
            entity_type: entityType,
            total: data.total,
            start: data.start,
            count: data.count,
            data: data.data,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (e) {
        console.error('[bullhorn-admin] Search failed:', e)
        return new Response(
          JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Search failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // =========================================================================
    // Action: test_connection
    // =========================================================================
    if (action === 'test_connection') {
      // Get valid credentials (auto-refreshes if needed)
      const { bhRestToken, restUrl, error: tokenError } = await getValidBullhornCredentials(svc, orgId)

      if (!bhRestToken || !restUrl) {
        return new Response(
          JSON.stringify({
            success: false,
            connected: false,
            error: tokenError || 'Bullhorn not connected',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const client = new BullhornClient({ bhRestToken, restUrl })

      try {
        console.log('[bullhorn-admin] Testing connection...')

        // Try to fetch the current user's info via the settings endpoint
        const settings = await client.request<{ userId?: number; corporationId?: number; userType?: string }>({
          method: 'GET',
          path: 'settings',
          query: { setting: 'userId,corporationId,userType' },
        })

        console.log('[bullhorn-admin] Connection test successful:', settings)

        return new Response(
          JSON.stringify({
            success: true,
            connected: true,
            user_id: settings.userId,
            corporation_id: settings.corporationId,
            user_type: settings.userType,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (e) {
        console.error('[bullhorn-admin] Connection test failed:', e)
        return new Response(
          JSON.stringify({
            success: false,
            connected: false,
            error: e instanceof Error ? e.message : 'Connection test failed',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // =========================================================================
    // Unknown action
    // =========================================================================
    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[bullhorn-admin] Unhandled error:', e)
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
