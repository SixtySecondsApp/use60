import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders } from '../_shared/corsHelper.ts'

/**
 * LinkedIn Lead Webhook Endpoint (public, verify_jwt=false)
 *
 * Receives real-time lead notifications from LinkedIn Lead Sync API.
 * Verifies HMAC-SHA256 signature, deduplicates by notification ID,
 * normalizes the payload, and enqueues async processing.
 *
 * LinkedIn sends:
 * - X-LI-Signature header (HMAC-SHA256 of body using app clientSecret)
 * - Both SPONSORED (ad forms) and EVENTS (event registration) lead types
 * - May deliver duplicate notifications — dedup by notification ID
 */

interface LinkedInLeadNotification {
  notificationId: string
  leadType: 'SPONSORED' | 'EVENTS'
  owner: string // sponsoredAccount URN
  submitter: string // person URN
  versionedLeadGenFormUrn: string
  formResponse: {
    answers: Array<{
      questionId: string
      answerDetails: {
        textQuestionAnswer?: { answer: string }
        multipleChoiceQuestionAnswer?: { selectedChoiceValues: string[] }
      }
    }>
    leadFormFields?: Array<{
      fieldType: string
      value: string
    }>
  }
  submittedAt: number
  associatedEntity: string // creative URN (ads) or event URN (events)
  testLead?: boolean
  ownerInfo?: { name: string }
  associatedEntityInfo?: { name: string }
  leadMetadataInfo?: { name: string; type: string }
}

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

// Standard LinkedIn lead form field types
const STANDARD_FIELD_MAP: Record<string, string> = {
  FIRST_NAME: 'first_name',
  LAST_NAME: 'last_name',
  EMAIL: 'email',
  COMPANY_NAME: 'company_name',
  JOB_TITLE: 'job_title',
  PHONE_NUMBER: 'phone',
  CITY: 'city',
  STATE: 'state',
  COUNTRY: 'country',
  ZIP_CODE: 'zip_code',
  WORK_EMAIL: 'email',
  WORK_PHONE: 'phone',
  LINKEDIN_PROFILE_URL: 'linkedin_url',
  COMPANY_SIZE: 'company_size',
  INDUSTRY: 'industry',
}

serve(async (req) => {
  // LinkedIn sends POST for notifications
  if (req.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(req)
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const startTime = Date.now()

  try {
    const body = await req.text()

    // 1. Verify HMAC-SHA256 signature
    const signature = req.headers.get('X-LI-Signature')
    if (!signature) {
      console.error('[webhook-linkedin] Missing X-LI-Signature header')
      return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 401 })
    }

    const isValid = await verifyLinkedInSignature(body, signature)
    if (!isValid) {
      console.error('[webhook-linkedin] Invalid signature')
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 })
    }

    const payload: LinkedInLeadNotification = JSON.parse(body)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // 2. Idempotency check — dedup by notification ID
    if (payload.notificationId) {
      const { data: existingRun } = await supabase
        .from('linkedin_sync_runs')
        .select('id')
        .eq('notification_id', payload.notificationId)
        .maybeSingle()

      if (existingRun) {
        console.log(`[webhook-linkedin] Duplicate notification ${payload.notificationId}, skipping`)
        return new Response(JSON.stringify({ status: 'duplicate', notification_id: payload.notificationId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // 3. Route to org by matching the form URN to linkedin_lead_sources
    const formUrn = payload.versionedLeadGenFormUrn || ''
    // Extract form ID from URN (e.g., "urn:li:leadGenForm:12345" → "12345" or use full URN)
    const formId = formUrn.includes(':') ? formUrn.split(':').pop() || formUrn : formUrn

    const { data: leadSource } = await supabase
      .from('linkedin_lead_sources')
      .select('id, org_id, source_type, campaign_name')
      .eq('form_id', formId)
      .eq('is_active', true)
      .maybeSingle()

    if (!leadSource) {
      // Try matching by full URN
      const { data: leadSourceByUrn } = await supabase
        .from('linkedin_lead_sources')
        .select('id, org_id, source_type, campaign_name')
        .eq('form_id', formUrn)
        .eq('is_active', true)
        .maybeSingle()

      if (!leadSourceByUrn) {
        console.warn(`[webhook-linkedin] No active lead source for form ${formUrn}`)
        // Return 200 to prevent LinkedIn from retrying
        return new Response(JSON.stringify({ status: 'no_matching_source', form: formUrn }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Use URN match
      return await processLead(supabase, payload, leadSourceByUrn, startTime)
    }

    return await processLead(supabase, payload, leadSource, startTime)
  } catch (error) {
    console.error('[webhook-linkedin] Error:', error)
    // Return 200 to prevent LinkedIn from retrying on our errors
    return new Response(JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

async function processLead(
  supabase: ReturnType<typeof createClient>,
  payload: LinkedInLeadNotification,
  leadSource: { id: string; org_id: string; source_type: string; campaign_name: string | null },
  startTime: number
): Promise<Response> {
  // Create sync run record
  const { data: syncRun } = await supabase
    .from('linkedin_sync_runs')
    .insert({
      org_id: leadSource.org_id,
      run_type: 'webhook',
      notification_id: payload.notificationId,
      leads_received: 1,
      started_at: new Date(startTime).toISOString(),
    })
    .select('id')
    .single()

  // Normalize the lead payload
  const normalized = normalizeLead(payload, leadSource)

  // Enqueue async processing via linkedin-lead-ingest
  // Fire-and-forget — return 200 to LinkedIn quickly
  const ingestUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/linkedin-lead-ingest`
  fetch(ingestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      lead: normalized,
      lead_source_id: leadSource.id,
      org_id: leadSource.org_id,
      sync_run_id: syncRun?.id,
    }),
  }).catch((err) => {
    console.error('[webhook-linkedin] Failed to enqueue ingest:', err)
  })

  const durationMs = Date.now() - startTime
  console.log(`[webhook-linkedin] Lead received for org ${leadSource.org_id} in ${durationMs}ms`)

  return new Response(
    JSON.stringify({
      status: 'accepted',
      notification_id: payload.notificationId,
      org_id: leadSource.org_id,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

function normalizeLead(
  payload: LinkedInLeadNotification,
  leadSource: { id: string; org_id: string; source_type: string; campaign_name: string | null }
): NormalizedLead {
  const fields: Record<string, string> = {}
  const customFields: Record<string, string> = {}

  // Extract standard form fields
  if (payload.formResponse?.leadFormFields) {
    for (const field of payload.formResponse.leadFormFields) {
      const mappedKey = STANDARD_FIELD_MAP[field.fieldType]
      if (mappedKey) {
        fields[mappedKey] = field.value
      } else {
        customFields[field.fieldType] = field.value
      }
    }
  }

  // Extract custom question answers
  if (payload.formResponse?.answers) {
    for (const answer of payload.formResponse.answers) {
      const value =
        answer.answerDetails?.textQuestionAnswer?.answer ||
        answer.answerDetails?.multipleChoiceQuestionAnswer?.selectedChoiceValues?.join(', ') ||
        ''
      if (value) {
        customFields[answer.questionId] = value
      }
    }
  }

  return {
    notification_id: payload.notificationId,
    lead_type: payload.leadType === 'EVENTS' ? 'event_form' : 'ad_form',
    form_id: payload.versionedLeadGenFormUrn,
    submitted_at: payload.submittedAt
      ? new Date(payload.submittedAt).toISOString()
      : new Date().toISOString(),
    is_test: payload.testLead || false,
    campaign_name: payload.leadMetadataInfo?.name || leadSource.campaign_name,
    event_name: payload.leadType === 'EVENTS' ? payload.associatedEntityInfo?.name || null : null,
    ad_account_name: payload.ownerInfo?.name || null,
    associated_entity: payload.associatedEntity,
    submitter_urn: payload.submitter,
    fields,
    custom_fields: customFields,
    raw_payload: payload as unknown as Record<string, unknown>,
  }
}

async function verifyLinkedInSignature(body: string, signature: string): Promise<boolean> {
  // LinkedIn signs with HMAC-SHA256 using the app's clientSecret
  // First try getting secret from env, then from integration_credentials
  let clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET') || ''

  if (!clientSecret) {
    // Fallback: this shouldn't happen in production
    console.warn('[webhook-linkedin] LINKEDIN_CLIENT_SECRET not in env')
    return false
  }

  try {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(clientSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    const computed = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    // LinkedIn may prefix with "sha256=" or send raw hex
    const expectedSig = signature.startsWith('sha256=') ? signature.slice(7) : signature

    // Constant-time comparison
    if (computed.length !== expectedSig.length) return false
    let result = 0
    for (let i = 0; i < computed.length; i++) {
      result |= computed.charCodeAt(i) ^ expectedSig.charCodeAt(i)
    }
    return result === 0
  } catch (err) {
    console.error('[webhook-linkedin] Signature verification error:', err)
    return false
  }
}
