import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { corsHeaders } from '../_shared/cors.ts'
import { InstantlyClient } from '../_shared/instantly.ts'

type Action =
  | 'connect'
  | 'disconnect'
  | 'status'
  | 'list_campaigns'
  | 'get_campaign'
  | 'get_campaign_details'
  | 'create_campaign'
  | 'activate_campaign'
  | 'pause_campaign'
  | 'delete_campaign'
  | 'campaign_analytics'
  | 'campaign_analytics_daily'
  | 'list_campaign_links'
  | 'link_campaign'
  | 'unlink_campaign'

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(error: string, _status = 400) {
  // Always return 200 so supabase.functions.invoke() puts the body in `data`
  // instead of throwing FunctionsHttpError (which loses the error message)
  return jsonResponse({ success: false, error })
}

async function getInstantlyClient(
  svc: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ client: InstantlyClient | null; error: string | null }> {
  const { data: creds, error: credsError } = await svc
    .from('instantly_org_credentials')
    .select('api_key')
    .eq('org_id', orgId)
    .maybeSingle()

  if (credsError || !creds?.api_key) {
    return { client: null, error: 'Instantly not connected. Add your API key in Settings.' }
  }

  return { client: new InstantlyClient({ apiKey: creds.api_key }), error: null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return errorResponse('Server misconfigured', 500)
    }

    // Auth: validate user JWT
    const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (!userToken) return errorResponse('Unauthorized', 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return errorResponse('Unauthorized', 401)

    // Parse body
    let body: any = {}
    try {
      const rawBody = await req.text()
      if (rawBody) body = JSON.parse(rawBody)
    } catch (e: any) {
      return errorResponse(`Invalid JSON body: ${e.message}`)
    }

    const action: Action | null = typeof body.action === 'string' ? (body.action as Action) : null
    const orgId: string | null = typeof body.org_id === 'string' ? body.org_id : null

    if (!action || !orgId) {
      return errorResponse('Missing action or org_id')
    }

    // Service client for privileged ops
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
      const testClient = new InstantlyClient({ apiKey })
      try {
        await testClient.request({ method: 'GET', path: '/api/v2/campaigns', query: { limit: 1 }, retries: 1 })
      } catch (e: any) {
        const msg = e?.status === 401 ? 'Invalid API key' : `Instantly API error: ${e.message}`
        return errorResponse(msg)
      }

      // Store credentials
      await svc
        .from('instantly_org_credentials')
        .upsert({ org_id: orgId, api_key: apiKey, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })

      // Upsert integration record
      await svc
        .from('instantly_org_integrations')
        .upsert({
          org_id: orgId,
          connected_by_user_id: user.id,
          is_active: true,
          is_connected: true,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' })

      return jsonResponse({ success: true, message: 'Instantly connected successfully' })
    }

    // =========================================================================
    // ACTION: disconnect — Remove credentials
    // =========================================================================
    if (action === 'disconnect') {
      if (!isAdmin) return errorResponse('Admin role required', 403)

      await svc.from('instantly_org_credentials').delete().eq('org_id', orgId)
      await svc
        .from('instantly_org_integrations')
        .update({ is_active: false, is_connected: false, updated_at: new Date().toISOString() })
        .eq('org_id', orgId)

      return jsonResponse({ success: true, message: 'Instantly disconnected' })
    }

    // =========================================================================
    // ACTION: status — Return connection state
    // =========================================================================
    if (action === 'status') {
      const { data: integration } = await svc
        .from('instantly_org_integrations')
        .select('is_active, is_connected, connected_at, last_sync_at, connected_by_user_id')
        .eq('org_id', orgId)
        .maybeSingle()

      const { count: linkCount } = await svc
        .from('instantly_campaign_links')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)

      return jsonResponse({
        success: true,
        connected: integration?.is_connected ?? false,
        is_active: integration?.is_active ?? false,
        connected_at: integration?.connected_at ?? null,
        last_sync_at: integration?.last_sync_at ?? null,
        linked_campaigns_count: linkCount ?? 0,
      })
    }

    // For all remaining actions, we need a valid Instantly client
    const { client: instantly, error: clientError } = await getInstantlyClient(svc, orgId)
    if (!instantly) return errorResponse(clientError || 'Instantly not connected')

    // =========================================================================
    // ACTION: list_campaigns
    // =========================================================================
    if (action === 'list_campaigns') {
      const limit = body.limit ?? 50
      const startingAfter = body.starting_after ?? undefined
      const search = body.search ?? undefined
      const status = body.status ?? undefined

      const data = await instantly.request<any>({
        method: 'GET',
        path: '/api/v2/campaigns',
        query: { limit, starting_after: startingAfter, search, status },
      })

      return jsonResponse({
        success: true,
        campaigns: data?.items ?? data ?? [],
        next_starting_after: data?.next_starting_after ?? null,
      })
    }

    // =========================================================================
    // ACTION: get_campaign
    // =========================================================================
    if (action === 'get_campaign') {
      const campaignId = body.campaign_id
      if (!campaignId) return errorResponse('Missing campaign_id')

      const data = await instantly.request<any>({
        method: 'GET',
        path: `/api/v2/campaigns/${campaignId}`,
      })

      return jsonResponse({ success: true, campaign: data })
    }

    // =========================================================================
    // ACTION: get_campaign_details — Campaign + sequences + variable schema
    // =========================================================================
    if (action === 'get_campaign_details') {
      const campaignId = body.campaign_id
      if (!campaignId) return errorResponse('Missing campaign_id')

      // Fetch campaign data
      const campaign = await instantly.request<any>({
        method: 'GET',
        path: `/api/v2/campaigns/${campaignId}`,
      })

      // Fetch campaign sequences (email steps)
      let sequences: any[] = []
      try {
        const seqData = await instantly.request<any>({
          method: 'GET',
          path: `/api/v2/campaigns/${campaignId}/sequences`,
        })
        sequences = Array.isArray(seqData) ? seqData : seqData?.items ?? []
      } catch (_seqErr) {
        // Sequences endpoint may not exist for all campaign types — continue
        console.log(`[instantly-admin] Could not fetch sequences for campaign ${campaignId}`)
      }

      // Extract custom variables from email bodies
      const customVariables: string[] = []
      const varPattern = /\{\{([^}]+)\}\}/g
      for (const seq of sequences) {
        const steps = Array.isArray(seq.steps) ? seq.steps : []
        for (const step of steps) {
          const body = step.body || step.email_body || ''
          const subject = step.subject || step.email_subject || ''
          let match: RegExpExecArray | null
          for (const text of [body, subject]) {
            while ((match = varPattern.exec(text)) !== null) {
              const varName = match[1].trim()
              if (!customVariables.includes(varName)) {
                customVariables.push(varName)
              }
            }
          }
        }
      }

      return jsonResponse({
        success: true,
        campaign,
        sequences,
        custom_variables: customVariables,
        step_count: sequences.reduce(
          (acc: number, seq: any) => acc + (Array.isArray(seq.steps) ? seq.steps.length : 0),
          0,
        ),
      })
    }

    // =========================================================================
    // ACTION: create_campaign
    // =========================================================================
    if (action === 'create_campaign') {
      if (!isAdmin) return errorResponse('Admin role required', 403)

      const name = body.name
      if (!name) return errorResponse('Missing campaign name')

      // Instantly API v2 requires campaign_schedule — use provided or sensible default
      // NOTE: Instantly uses a restricted timezone enum (not all IANA names).
      // Valid examples: America/Chicago, America/Detroit, Europe/Isle_of_Man, Asia/Kolkata, etc.
      const defaultSchedule = {
        schedules: [{
          name: 'Default Schedule',
          timing: { from: '09:00', to: '17:00' },
          days: { 1: true, 2: true, 3: true, 4: true, 5: true },
          timezone: body.timezone || 'America/Chicago',
        }],
      }

      // Normalize sequences to match Instantly API v2 step schema before sending.
      // Ensures every step has required fields: type, delay, variants.
      // Handles callers that use legacy/alternate field names.
      function normalizeSequences(sequences: any[]): any[] {
        if (!Array.isArray(sequences)) return sequences
        return sequences.map((seq: any) => {
          if (!Array.isArray(seq?.steps)) return seq
          return {
            ...seq,
            steps: seq.steps.map((step: any, idx: number) => {
              // Ensure type
              if (!step.type) step.type = 'email'

              // Ensure delay (step 1 = 0, others default to 2)
              if (step.delay == null) {
                step.delay = idx === 0 ? 0 : (step.wait_days || 2)
              }
              delete step.wait_days

              // Ensure variants array — move top-level subject/body into variants if needed
              if (!Array.isArray(step.variants) || step.variants.length === 0) {
                const subject = step.subject || step.email_subject || ''
                const stepBody = step.email_body || step.body || ''
                step.variants = [{ subject, body: stepBody }]
              }
              // Clean up top-level fields that belong inside variants
              delete step.subject
              delete step.email_subject
              delete step.email_body
              delete step.variant

              return step
            }),
          }
        })
      }

      const campaignBody: Record<string, any> = {
        name: body.name,
        campaign_schedule: body.campaign_schedule || defaultSchedule,
      }
      if (body.sequences) {
        campaignBody.sequences = normalizeSequences(body.sequences)
      }

      // Attempt create — if Instantly returns a validation error, log and retry once
      // with additional auto-fixes inferred from the error message
      let data: any
      try {
        data = await instantly.request<any>({
          method: 'POST',
          path: '/api/v2/campaigns',
          body: campaignBody,
        })
      } catch (createErr: any) {
        const errMsg = createErr.message || ''
        const isValidation = createErr.status === 422 || createErr.status === 400 || errMsg.includes('must have required property')

        if (isValidation && campaignBody.sequences) {
          console.log(`[instantly-admin] Campaign creation validation error, auto-fixing: ${errMsg}`)

          // Re-normalize with stricter defaults based on error
          for (const seq of campaignBody.sequences) {
            if (!Array.isArray(seq?.steps)) continue
            for (let i = 0; i < seq.steps.length; i++) {
              const step = seq.steps[i]
              step.type = step.type || 'email'
              if (step.delay == null) step.delay = i === 0 ? 0 : 2
              if (!Array.isArray(step.variants) || step.variants.length === 0) {
                step.variants = [{ subject: '', body: '' }]
              }
            }
          }

          console.log(`[instantly-admin] Retrying with normalized payload`)
          data = await instantly.request<any>({
            method: 'POST',
            path: '/api/v2/campaigns',
            body: campaignBody,
          })
        } else {
          throw createErr
        }
      }

      return jsonResponse({ success: true, campaign: data })
    }

    // =========================================================================
    // ACTION: activate_campaign
    // =========================================================================
    if (action === 'activate_campaign') {
      const campaignId = body.campaign_id
      if (!campaignId) return errorResponse('Missing campaign_id')

      await instantly.request<any>({
        method: 'POST',
        path: `/api/v2/campaigns/${campaignId}/activate`,
      })

      return jsonResponse({ success: true, message: 'Campaign activated' })
    }

    // =========================================================================
    // ACTION: pause_campaign
    // =========================================================================
    if (action === 'pause_campaign') {
      const campaignId = body.campaign_id
      if (!campaignId) return errorResponse('Missing campaign_id')

      await instantly.request<any>({
        method: 'POST',
        path: `/api/v2/campaigns/${campaignId}/pause`,
      })

      return jsonResponse({ success: true, message: 'Campaign paused' })
    }

    // =========================================================================
    // ACTION: delete_campaign
    // =========================================================================
    if (action === 'delete_campaign') {
      if (!isAdmin) return errorResponse('Admin role required', 403)

      const campaignId = body.campaign_id
      if (!campaignId) return errorResponse('Missing campaign_id')

      await instantly.request<any>({
        method: 'DELETE',
        path: `/api/v2/campaigns/${campaignId}`,
      })

      // Remove any campaign links
      await svc
        .from('instantly_campaign_links')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('org_id', orgId)

      return jsonResponse({ success: true, message: 'Campaign deleted' })
    }

    // =========================================================================
    // ACTION: campaign_analytics — Overview for a campaign
    // =========================================================================
    if (action === 'campaign_analytics') {
      const campaignId = body.campaign_id
      if (!campaignId) return errorResponse('Missing campaign_id')

      const data = await instantly.request<any>({
        method: 'GET',
        path: '/api/v2/campaigns/analytics/overview',
        query: { campaign_id: campaignId },
      })

      // Data might be an array of one or a single object
      const analytics = Array.isArray(data) ? data[0] : data

      return jsonResponse({ success: true, analytics })
    }

    // =========================================================================
    // ACTION: campaign_analytics_daily — Daily trend data
    // =========================================================================
    if (action === 'campaign_analytics_daily') {
      const campaignId = body.campaign_id
      if (!campaignId) return errorResponse('Missing campaign_id')

      const data = await instantly.request<any>({
        method: 'GET',
        path: '/api/v2/campaigns/analytics/daily',
        query: { campaign_id: campaignId },
      })

      return jsonResponse({ success: true, daily: Array.isArray(data) ? data : data?.items ?? [] })
    }

    // =========================================================================
    // ACTION: list_campaign_links — Get linked campaigns for a table
    // =========================================================================
    if (action === 'list_campaign_links') {
      const tableId = body.table_id
      if (!tableId) return errorResponse('Missing table_id')

      const { data: links, error: linksError } = await svc
        .from('instantly_campaign_links')
        .select('id, table_id, campaign_id, campaign_name, field_mapping, auto_sync_engagement, linked_at, last_push_at, last_engagement_sync_at')
        .eq('table_id', tableId)
        .eq('org_id', orgId)
        .order('linked_at', { ascending: false })

      if (linksError) return errorResponse(linksError.message)

      return jsonResponse({ success: true, links: links ?? [] })
    }

    // =========================================================================
    // ACTION: link_campaign — Connect an Ops table to an Instantly campaign
    // =========================================================================
    if (action === 'link_campaign') {
      const tableId = body.table_id
      const campaignId = body.campaign_id
      const campaignName = body.campaign_name
      const fieldMapping = body.field_mapping

      if (!tableId || !campaignId) return errorResponse('Missing table_id or campaign_id')
      if (!fieldMapping?.email) return errorResponse('Field mapping must include email column')

      const { error: linkError } = await svc
        .from('instantly_campaign_links')
        .upsert({
          table_id: tableId,
          org_id: orgId,
          campaign_id: campaignId,
          campaign_name: campaignName || null,
          field_mapping: fieldMapping,
          auto_sync_engagement: body.auto_sync_engagement ?? false,
          linked_by: user.id,
          linked_at: new Date().toISOString(),
        }, { onConflict: 'table_id,campaign_id' })

      if (linkError) return errorResponse(linkError.message)

      return jsonResponse({ success: true, message: `Table linked to campaign "${campaignName || campaignId}"` })
    }

    // =========================================================================
    // ACTION: unlink_campaign — Disconnect a table from an Instantly campaign
    // =========================================================================
    if (action === 'unlink_campaign') {
      const tableId = body.table_id
      const campaignId = body.campaign_id

      if (!tableId || !campaignId) return errorResponse('Missing table_id or campaign_id')

      await svc
        .from('instantly_campaign_links')
        .delete()
        .eq('table_id', tableId)
        .eq('campaign_id', campaignId)
        .eq('org_id', orgId)

      return jsonResponse({ success: true, message: 'Campaign unlinked' })
    }

    return errorResponse(`Unknown action: ${action}`)
  } catch (e: any) {
    console.error('[instantly-admin] Unhandled error:', e)
    return errorResponse(e.message || 'Internal server error', 500)
  }
})
