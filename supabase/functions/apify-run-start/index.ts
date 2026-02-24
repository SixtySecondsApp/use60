import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'

const APIFY_API_BASE = 'https://api.apify.com/v2'

// Rate limit thresholds
const MAX_CONCURRENT_RUNS = 5
const HOURLY_WARN_THRESHOLD = 20
const DAILY_WARN_THRESHOLD = 100
const FAILED_COOLDOWN_SECONDS = 60

interface RunStartRequest {
  actor_id: string
  input?: Record<string, unknown>
  mapping_template_id?: string
  auto_map?: boolean
  confirmed?: boolean // bypass soft limits after user confirmation
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    const body = (await req.json()) as RunStartRequest
    const { actor_id, input, mapping_template_id, confirmed } = body

    if (!actor_id) {
      return errorResponse('Missing "actor_id" field', req, 400)
    }

    // --- Auth: JWT -> user -> org membership ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401)
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return errorResponse('No organization found', req, 400)
    }

    const orgId = membership.org_id

    // Service role client for DB operations
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // --- Get Apify token ---
    const { data: creds } = await svc
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'apify')
      .maybeSingle()

    const apiToken = (creds?.credentials as Record<string, string>)?.api_token
    if (!apiToken) {
      return errorResponse(
        'Apify not configured. Please connect Apify in Settings > Integrations.',
        req,
        400
      )
    }

    // --- Rate limit checks ---
    const now = new Date()

    // Hard limit: max concurrent running
    const { count: runningCount } = await svc
      .from('apify_runs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'running')

    if ((runningCount ?? 0) >= MAX_CONCURRENT_RUNS) {
      return jsonResponse(
        {
          error: `Maximum ${MAX_CONCURRENT_RUNS} concurrent runs allowed. Please wait for current runs to complete.`,
          code: 'RATE_LIMIT_CONCURRENT',
        },
        req,
        429
      )
    }

    // Hard limit: failed run cooldown
    const cooldownCutoff = new Date(now.getTime() - FAILED_COOLDOWN_SECONDS * 1000).toISOString()
    const { count: recentFailedCount } = await svc
      .from('apify_runs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('created_by', user.id)
      .eq('status', 'failed')
      .gte('completed_at', cooldownCutoff)

    if ((recentFailedCount ?? 0) > 0) {
      return jsonResponse(
        {
          error: `Please wait ${FAILED_COOLDOWN_SECONDS}s after a failed run before starting a new one.`,
          code: 'RATE_LIMIT_COOLDOWN',
        },
        req,
        429
      )
    }

    // Soft limits (user can confirm to bypass)
    if (!confirmed) {
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      const { count: hourlyCount } = await svc
        .from('apify_runs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', oneHourAgo)

      if ((hourlyCount ?? 0) >= HOURLY_WARN_THRESHOLD) {
        return jsonResponse(
          {
            warning: `You've started ${hourlyCount} runs in the last hour. Are you sure you want to continue?`,
            require_confirmation: true,
            code: 'SOFT_LIMIT_HOURLY',
          },
          req,
          200
        )
      }

      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)
      const { count: dailyCount } = await svc
        .from('apify_runs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', startOfDay.toISOString())

      if ((dailyCount ?? 0) >= DAILY_WARN_THRESHOLD) {
        return jsonResponse(
          {
            warning: `You've started ${dailyCount} runs today. Are you sure you want to continue?`,
            require_confirmation: true,
            code: 'SOFT_LIMIT_DAILY',
          },
          req,
          200
        )
      }
    }

    // --- Create run record (status=pending) ---
    const { data: runRecord, error: insertError } = await svc
      .from('apify_runs')
      .insert({
        org_id: orgId,
        created_by: user.id,
        actor_id,
        input_config: input || null,
        mapping_template_id: mapping_template_id || null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !runRecord) {
      console.error('[apify-run-start] Insert error:', insertError)
      return errorResponse('Failed to create run record', req, 500)
    }

    // --- Start actor on Apify ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const webhookUrl = `${supabaseUrl}/functions/v1/apify-run-webhook`

    const encodedActorId = encodeURIComponent(actor_id)
    const startUrl = `${APIFY_API_BASE}/acts/${encodedActorId}/runs?token=${encodeURIComponent(apiToken)}`

    const startBody: Record<string, unknown> = {
      ...(input || {}),
    }

    // Add webhook configuration
    const startRes = await fetch(`${startUrl}&webhooks=${encodeURIComponent(JSON.stringify([
      {
        eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
        requestUrl: webhookUrl,
      },
    ]))}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(startBody),
    })

    if (!startRes.ok) {
      const errText = await startRes.text()
      console.error('[apify-run-start] Apify start error:', startRes.status, errText)

      // Update run as failed
      await svc
        .from('apify_runs')
        .update({
          status: 'failed',
          error_message: `Failed to start actor: ${startRes.status} ${errText}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runRecord.id)

      return errorResponse(`Failed to start actor: ${startRes.status}`, req, 400)
    }

    const startData = await startRes.json() as Record<string, unknown>
    const runData = (startData.data || startData) as Record<string, unknown>
    const apifyRunId = runData.id as string

    // --- Update run record with Apify run ID ---
    await svc
      .from('apify_runs')
      .update({
        apify_run_id: apifyRunId,
        actor_name: runData.actId as string || actor_id,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', runRecord.id)

    return jsonResponse(
      {
        run_id: runRecord.id,
        apify_run_id: apifyRunId,
        status: 'running',
        actor_id,
      },
      req
    )
  } catch (error) {
    console.error('[apify-run-start] Error:', error)
    return errorResponse((error as Error).message, req, 500)
  }
})
