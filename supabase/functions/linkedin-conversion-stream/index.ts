import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Conversion Stream Worker
//
// Processes pending conversion events from the queue and streams them to
// the LinkedIn Conversions API. Supports retries with exponential backoff
// and dead-letter handling.
//
// Actions:
//   process_batch  — Process up to N pending events
//   process_single — Process a specific event by ID
//   get_stats      — Get delivery statistics
//   retry_failed   — Retry all failed events (resets status to pending)
// ---------------------------------------------------------------------------

type Action = 'process_batch' | 'process_single' | 'get_stats' | 'retry_failed'

interface RequestBody {
  action: Action
  event_id?: string
  batch_size?: number
  org_id?: string
}

interface ConversionEvent {
  id: string
  org_id: string
  rule_id: string
  milestone_event: string
  event_time: string
  user_email: string | null
  user_linkedin_member_id: string | null
  user_first_name: string | null
  user_last_name: string | null
  user_company_name: string | null
  value_amount: number | null
  value_currency: string | null
  retry_count: number
  max_retries: number
  deal_id: string | null
  contact_id: string | null
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const RETRY_DELAYS_MS = [60_000, 300_000, 900_000] // 1min, 5min, 15min

// ---------------------------------------------------------------------------
// LinkedIn API: Send conversion event
// ---------------------------------------------------------------------------

async function sendToLinkedIn(
  event: ConversionEvent,
  accessToken: string,
  linkedinRuleId: string,
  adAccountId: string
): Promise<{ success: boolean; httpStatus: number; responseBody: unknown }> {

  // Build user identification (best available)
  const userIds: Record<string, unknown>[] = []

  if (event.user_email) {
    userIds.push({
      idType: 'SHA256_EMAIL',
      idValue: await sha256(event.user_email.toLowerCase().trim()),
    })
  }

  if (event.user_linkedin_member_id) {
    userIds.push({
      idType: 'LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID',
      idValue: event.user_linkedin_member_id,
    })
  }

  const conversionPayload = {
    conversion: `urn:lla:llaPartnerConversion:${linkedinRuleId}`,
    conversionHappenedAt: new Date(event.event_time).getTime(),
    conversionValue: event.value_amount ? {
      currencyCode: event.value_currency || 'USD',
      amount: String(event.value_amount),
    } : undefined,
    user: {
      userIds,
      userInfo: {
        firstName: event.user_first_name || undefined,
        lastName: event.user_last_name || undefined,
        companyName: event.user_company_name || undefined,
      },
    },
  }

  const response = await fetch(
    'https://api.linkedin.com/rest/conversionEvents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        elements: [conversionPayload],
      }),
    }
  )

  const responseBody = await response.json().catch(() => ({}))

  return {
    success: response.ok,
    httpStatus: response.status,
    responseBody,
  }
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Process a single event
// ---------------------------------------------------------------------------

async function processEvent(
  serviceClient: ReturnType<typeof createClient>,
  event: ConversionEvent
): Promise<{ success: boolean; error?: string }> {

  const startTime = Date.now()

  // Mark as processing
  await serviceClient
    .from('linkedin_conversion_events')
    .update({ status: 'processing' })
    .eq('id', event.id)

  // Get the rule + integration credentials
  const { data: rule } = await serviceClient
    .from('linkedin_conversion_rules')
    .select('linkedin_rule_id, linkedin_ad_account_id')
    .eq('id', event.rule_id)
    .eq('is_synced', true)
    .maybeSingle()

  if (!rule?.linkedin_rule_id) {
    await logAttempt(serviceClient, event, {
      status: 'error',
      error_message: 'Rule not synced to LinkedIn',
      duration_ms: Date.now() - startTime,
    })
    await serviceClient
      .from('linkedin_conversion_events')
      .update({ status: 'failed', last_error: 'Rule not synced to LinkedIn' })
      .eq('id', event.id)
    return { success: false, error: 'Rule not synced' }
  }

  const { data: integration } = await serviceClient
    .from('linkedin_org_integrations')
    .select('access_token_encrypted')
    .eq('org_id', event.org_id)
    .eq('is_connected', true)
    .eq('conversions_enabled', true)
    .maybeSingle()

  if (!integration?.access_token_encrypted) {
    await logAttempt(serviceClient, event, {
      status: 'error',
      error_message: 'No valid LinkedIn integration with conversions enabled',
      duration_ms: Date.now() - startTime,
    })
    await serviceClient
      .from('linkedin_conversion_events')
      .update({ status: 'failed', last_error: 'No valid integration' })
      .eq('id', event.id)
    return { success: false, error: 'No integration' }
  }

  try {
    const result = await sendToLinkedIn(
      event,
      integration.access_token_encrypted,
      rule.linkedin_rule_id,
      rule.linkedin_ad_account_id
    )

    await logAttempt(serviceClient, event, {
      status: result.success ? 'success' : 'error',
      http_status: result.httpStatus,
      response_body: result.responseBody,
      duration_ms: Date.now() - startTime,
    })

    if (result.success) {
      await serviceClient
        .from('linkedin_conversion_events')
        .update({
          status: 'delivered',
          linkedin_response: result.responseBody,
          delivered_at: new Date().toISOString(),
        })
        .eq('id', event.id)
      return { success: true }
    }

    // Failed — schedule retry or dead-letter
    const newRetryCount = event.retry_count + 1
    if (newRetryCount >= event.max_retries) {
      await serviceClient
        .from('linkedin_conversion_events')
        .update({
          status: 'dead_letter',
          retry_count: newRetryCount,
          last_error: `HTTP ${result.httpStatus}: ${JSON.stringify(result.responseBody)}`,
        })
        .eq('id', event.id)
      return { success: false, error: `Dead-lettered after ${newRetryCount} attempts` }
    }

    const delayMs = RETRY_DELAYS_MS[Math.min(newRetryCount - 1, RETRY_DELAYS_MS.length - 1)]
    const nextRetry = new Date(Date.now() + delayMs).toISOString()

    await serviceClient
      .from('linkedin_conversion_events')
      .update({
        status: 'pending',
        retry_count: newRetryCount,
        next_retry_at: nextRetry,
        last_error: `HTTP ${result.httpStatus}: ${JSON.stringify(result.responseBody)}`,
      })
      .eq('id', event.id)

    return { success: false, error: `Retry scheduled (${newRetryCount}/${event.max_retries})` }

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logAttempt(serviceClient, event, {
      status: 'error',
      error_message: message,
      duration_ms: Date.now() - startTime,
    })

    const newRetryCount = event.retry_count + 1
    const status = newRetryCount >= event.max_retries ? 'dead_letter' : 'pending'
    const nextRetry = status === 'pending'
      ? new Date(Date.now() + RETRY_DELAYS_MS[Math.min(newRetryCount - 1, RETRY_DELAYS_MS.length - 1)]).toISOString()
      : null

    await serviceClient
      .from('linkedin_conversion_events')
      .update({ status, retry_count: newRetryCount, next_retry_at: nextRetry, last_error: message })
      .eq('id', event.id)

    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Log delivery attempt
// ---------------------------------------------------------------------------

async function logAttempt(
  client: ReturnType<typeof createClient>,
  event: ConversionEvent,
  details: { status: string; http_status?: number; response_body?: unknown; error_message?: string; duration_ms: number }
) {
  await client.from('linkedin_conversion_delivery_log').insert({
    event_id: event.id,
    org_id: event.org_id,
    attempt_number: event.retry_count + 1,
    status: details.status,
    http_status: details.http_status,
    response_body: details.response_body,
    error_message: details.error_message,
    duration_ms: details.duration_ms,
  })
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  try {
    // This function can be called by cron (service role) or authenticated user
    const authHeader = req.headers.get('Authorization')
    const cronSecret = req.headers.get('x-cron-secret')
    const isCron = cronSecret === Deno.env.get('CRON_SECRET')

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Auth check for non-cron requests
    if (!isCron) {
      if (!authHeader) return errorResponse('Unauthorized', req, 401)
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error } = await userClient.auth.getUser()
      if (error || !user) return errorResponse('Unauthorized', req, 401)
    }

    const body: RequestBody = await req.json()
    const { action } = body

    switch (action) {
      // ---------------------------------------------------------------
      // PROCESS BATCH — Pick pending events and send to LinkedIn
      // ---------------------------------------------------------------
      case 'process_batch': {
        const batchSize = Math.min(body.batch_size ?? 10, 50)

        const { data: events, error } = await serviceClient
          .from('linkedin_conversion_events')
          .select('id, org_id, rule_id, milestone_event, event_time, user_email, user_linkedin_member_id, user_first_name, user_last_name, user_company_name, value_amount, value_currency, retry_count, max_retries, deal_id, contact_id')
          .in('status', ['pending'])
          .or('next_retry_at.is.null,next_retry_at.lte.' + new Date().toISOString())
          .order('created_at', { ascending: true })
          .limit(batchSize)

        if (error) return errorResponse(error.message, req, 500)
        if (!events || events.length === 0) {
          return jsonResponse({ processed: 0, message: 'No pending events' }, req)
        }

        const results = await Promise.allSettled(
          events.map(event => processEvent(serviceClient, event as ConversionEvent))
        )

        const delivered = results.filter(r => r.status === 'fulfilled' && r.value.success).length
        const failed = results.length - delivered

        return jsonResponse({ processed: results.length, delivered, failed }, req)
      }

      // ---------------------------------------------------------------
      // PROCESS SINGLE
      // ---------------------------------------------------------------
      case 'process_single': {
        if (!body.event_id) return errorResponse('event_id is required', req, 400)

        const { data: event } = await serviceClient
          .from('linkedin_conversion_events')
          .select('id, org_id, rule_id, milestone_event, event_time, user_email, user_linkedin_member_id, user_first_name, user_last_name, user_company_name, value_amount, value_currency, retry_count, max_retries, deal_id, contact_id')
          .eq('id', body.event_id)
          .maybeSingle()

        if (!event) return errorResponse('Event not found', req, 404)

        const result = await processEvent(serviceClient, event as ConversionEvent)
        return jsonResponse(result, req)
      }

      // ---------------------------------------------------------------
      // GET STATS
      // ---------------------------------------------------------------
      case 'get_stats': {
        if (!body.org_id) return errorResponse('org_id is required', req, 400)

        const { data: events } = await serviceClient
          .from('linkedin_conversion_events')
          .select('status, milestone_event')
          .eq('org_id', body.org_id)

        const stats = {
          total: events?.length ?? 0,
          delivered: events?.filter(e => e.status === 'delivered').length ?? 0,
          pending: events?.filter(e => e.status === 'pending' || e.status === 'processing').length ?? 0,
          failed: events?.filter(e => e.status === 'failed').length ?? 0,
          dead_letter: events?.filter(e => e.status === 'dead_letter').length ?? 0,
          by_milestone: {} as Record<string, { total: number; delivered: number }>,
        }

        for (const event of events ?? []) {
          if (!stats.by_milestone[event.milestone_event]) {
            stats.by_milestone[event.milestone_event] = { total: 0, delivered: 0 }
          }
          stats.by_milestone[event.milestone_event].total++
          if (event.status === 'delivered') {
            stats.by_milestone[event.milestone_event].delivered++
          }
        }

        stats.delivery_rate = stats.total > 0
          ? Math.round((stats.delivered / stats.total) * 100)
          : 0

        return jsonResponse({ stats }, req)
      }

      // ---------------------------------------------------------------
      // RETRY FAILED
      // ---------------------------------------------------------------
      case 'retry_failed': {
        if (!body.org_id) return errorResponse('org_id is required', req, 400)

        const { data, error } = await serviceClient
          .from('linkedin_conversion_events')
          .update({
            status: 'pending',
            retry_count: 0,
            next_retry_at: null,
            last_error: null,
          })
          .eq('org_id', body.org_id)
          .in('status', ['failed', 'dead_letter'])
          .select('id')

        if (error) return errorResponse(error.message, req, 500)
        return jsonResponse({ retried: data?.length ?? 0 }, req)
      }

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400)
    }
  } catch (err) {
    console.error('[linkedin-conversion-stream]', err)
    return errorResponse(err instanceof Error ? err.message : 'Internal error', req, 500)
  }
})
