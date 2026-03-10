import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * LinkedIn Webhook Receiver
 *
 * Public endpoint (verify_jwt = false) that receives LinkedIn Lead Gen
 * webhook notifications. Verifies HMAC-SHA256 signature, deduplicates
 * by notification ID, normalizes the payload, and enqueues to
 * linkedin-lead-ingest (fire-and-forget).
 *
 * LinkedIn sends:
 *   - Validation: POST with { challengeCode } → echo it back
 *   - Lead events: POST with lead data + X-LI-Signature header
 */

const LINKEDIN_CLIENT_SECRET = Deno.env.get('LINKEDIN_CLIENT_SECRET') || ''

// ---------------------------------------------------------------------------
// In-memory rate limiting — 10 requests per minute per IP
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const ipRequestLog = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = ipRequestLog.get(ip) || []
  // Evict entries outside the window
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  ipRequestLog.set(ip, recent)

  // Periodically prune stale IPs (every 100th call)
  if (Math.random() < 0.01) {
    for (const [key, ts] of ipRequestLog) {
      const alive = ts.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
      if (alive.length === 0) ipRequestLog.delete(key)
      else ipRequestLog.set(key, alive)
    }
  }

  return recent.length > RATE_LIMIT_MAX
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req)
  if (corsPreflightResponse) return corsPreflightResponse
  const corsHeaders = getCorsHeaders(req)

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Rate limit by IP
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  if (isRateLimited(clientIp)) {
    console.warn(`[webhook-linkedin] Rate limited IP: ${clientIp}`)
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
    })
  }

  try {
    const rawBody = await req.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle LinkedIn validation challenge
    if (body.challengeCode) {
      console.log('[webhook-linkedin] Validation challenge received')
      return new Response(JSON.stringify({ challengeCode: body.challengeCode }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify HMAC-SHA256 signature
    const signature = req.headers.get('X-LI-Signature') || req.headers.get('x-li-signature')
    if (LINKEDIN_CLIENT_SECRET && signature) {
      const isValid = await verifySignature(rawBody, signature, LINKEDIN_CLIENT_SECRET)
      if (!isValid) {
        console.error('[webhook-linkedin] Invalid signature')
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (LINKEDIN_CLIENT_SECRET && !signature) {
      console.warn('[webhook-linkedin] No signature header — accepting in dev/staging')
      // Allow unsigned requests in dev/staging for testing
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // Extract notification ID for idempotency
    const notificationId = String(
      body.id ||
      body.notificationId ||
      `${body.leadType || 'unknown'}_${body.submittedAt || Date.now()}`
    )

    // Check for duplicate
    const { data: existing } = await supabase
      .from('linkedin_sync_runs')
      .select('id')
      .eq('notification_id', notificationId)
      .maybeSingle()

    if (existing) {
      console.log(`[webhook-linkedin] Duplicate notification ${notificationId}, skipping`)
      return new Response(JSON.stringify({ status: 'duplicate', notification_id: notificationId }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Normalize the payload
    const normalized = normalizeWebhookPayload(body)

    // Determine org from the ad account / webhook registration
    // LinkedIn doesn't send org_id — we match via the ad account or form_id
    const orgId = await resolveOrgFromPayload(supabase, normalized)

    if (!orgId) {
      console.error('[webhook-linkedin] Could not resolve org for notification:', notificationId)

      // Log the failure for debugging — insert with service-role client
      const failureReason = `Could not resolve org. form_id=${normalized.form_id || 'none'}, ad_account=${normalized.ad_account_name || 'none'}`
      const { error: failureInsertErr } = await supabase
        .from('linkedin_webhook_failures')
        .insert({
          org_id: null,
          payload: normalized.raw_payload,
          failure_reason: failureReason,
        })
      if (failureInsertErr) {
        console.error('[webhook-linkedin] Failed to log webhook failure:', failureInsertErr)
      }

      return new Response(JSON.stringify({ status: 'error', error: 'Unknown organization' }), {
        status: 200, // Return 200 to prevent LinkedIn from retrying
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create sync run record
    const { data: syncRun } = await supabase
      .from('linkedin_sync_runs')
      .insert({
        org_id: orgId,
        run_type: 'webhook',
        notification_id: notificationId,
        leads_received: 1,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    // Fire-and-forget: enqueue to ingest pipeline
    const ingestUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/linkedin-lead-ingest`
    fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        lead: normalized,
        lead_source_id: normalized.form_id,
        org_id: orgId,
        sync_run_id: syncRun?.id || null,
      }),
    }).catch((err) => console.error('[webhook-linkedin] Ingest enqueue failed:', err))

    console.log(`[webhook-linkedin] Accepted notification ${notificationId} for org ${orgId}`)

    // Return 200 immediately — LinkedIn requires fast responses
    return new Response(JSON.stringify({ status: 'accepted', notification_id: notificationId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[webhook-linkedin] Unhandled error:', error)
    // Always return 200 to prevent LinkedIn from retrying on server errors
    return new Response(JSON.stringify({ status: 'error', error: 'Internal error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ---------------------------------------------------------------------------
// HMAC-SHA256 signature verification
// ---------------------------------------------------------------------------

async function verifySignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    const computed = `hmac-sha256=${Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')}`

    // Constant-time comparison
    if (computed.length !== signature.length) return false
    let mismatch = 0
    for (let i = 0; i < computed.length; i++) {
      mismatch |= computed.charCodeAt(i) ^ signature.charCodeAt(i)
    }
    return mismatch === 0
  } catch (err) {
    console.error('[webhook-linkedin] Signature verification error:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Payload normalization
// ---------------------------------------------------------------------------

interface NormalizedLead {
  notification_id: string
  lead_type: 'ad_form' | 'event_form'
  form_id: string
  submitted_at: string
  is_test: boolean
  campaign_name: string | null
  event_name: string | null
  ad_account_name: string | null
  associated_entity: string
  submitter_urn: string
  fields: Record<string, string>
  custom_fields: Record<string, string>
  raw_payload: Record<string, unknown>
}

function normalizeWebhookPayload(body: Record<string, unknown>): NormalizedLead {
  const STANDARD_FIELDS: Record<string, string> = {
    FIRST_NAME: 'first_name',
    LAST_NAME: 'last_name',
    EMAIL: 'email',
    COMPANY_NAME: 'company_name',
    JOB_TITLE: 'job_title',
    PHONE_NUMBER: 'phone',
    COUNTRY: 'country',
    LINKEDIN_PROFILE_URL: 'linkedin_url',
    COMPANY_SIZE: 'company_size',
    INDUSTRY: 'industry',
  }

  const fields: Record<string, string> = {}
  const customFields: Record<string, string> = {}

  const formResponse = body.formResponse as Record<string, unknown> | undefined
  if (formResponse?.leadFormFields && Array.isArray(formResponse.leadFormFields)) {
    for (const field of formResponse.leadFormFields as Array<{ fieldType: string; value: string }>) {
      const mapped = STANDARD_FIELDS[field.fieldType]
      if (mapped) fields[mapped] = field.value
      else customFields[field.fieldType] = field.value
    }
  }

  const leadType = body.leadType as string
  const ownerInfo = body.ownerInfo as Record<string, unknown> | undefined
  const entityInfo = body.associatedEntityInfo as Record<string, unknown> | undefined
  const metadataInfo = body.leadMetadataInfo as Record<string, unknown> | undefined

  return {
    notification_id: String(body.id || `webhook_${body.submittedAt || Date.now()}`),
    lead_type: leadType === 'EVENTS' ? 'event_form' : 'ad_form',
    form_id: String(body.versionedLeadGenFormUrn || body.formId || ''),
    submitted_at: body.submittedAt
      ? new Date(Number(body.submittedAt)).toISOString()
      : new Date().toISOString(),
    is_test: Boolean(body.testLead),
    campaign_name: String(metadataInfo?.name || ''),
    event_name: leadType === 'EVENTS' ? String(entityInfo?.name || '') : null,
    ad_account_name: String(ownerInfo?.name || ''),
    associated_entity: String(body.associatedEntity || ''),
    submitter_urn: String(body.submitter || ''),
    fields,
    custom_fields: customFields,
    raw_payload: body,
  }
}

// ---------------------------------------------------------------------------
// Org resolution — match webhook to our org via ad account or form_id
// ---------------------------------------------------------------------------

async function resolveOrgFromPayload(
  supabase: ReturnType<typeof createClient>,
  lead: NormalizedLead,
): Promise<string | null> {
  // Try matching by form_id in linkedin_lead_sources
  if (lead.form_id) {
    const { data: source } = await supabase
      .from('linkedin_lead_sources')
      .select('org_id')
      .eq('form_id', lead.form_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (source?.org_id) return source.org_id
  }

  // Try matching by ad account name in linkedin_org_integrations
  if (lead.ad_account_name) {
    const { data: integration } = await supabase
      .from('linkedin_org_integrations')
      .select('org_id')
      .eq('linkedin_ad_account_name', lead.ad_account_name)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (integration?.org_id) return integration.org_id
  }

  // Fallback: if there's only one active LinkedIn integration, use it
  const { data: integrations } = await supabase
    .from('linkedin_org_integrations')
    .select('org_id')
    .eq('is_active', true)
    .eq('is_connected', true)
    .limit(2)

  if (integrations?.length === 1) return integrations[0].org_id

  return null
}
