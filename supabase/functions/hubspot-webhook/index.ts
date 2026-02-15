import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hmacSha256Hex, timingSafeEqual } from '../_shared/use60Signing.ts'
import { legacyCorsHeaders as corsHeaders } from '../_shared/corsHelper.ts'
import { captureException } from '../_shared/sentryEdge.ts'
import { syncToStandardTable } from '../_shared/standardTableSync.ts'
import {
  upsertContactIndex,
  upsertCompanyIndex,
  upsertDealIndex,
  deleteFromIndex,
} from '../_shared/upsertCrmIndex.ts'

type HubSpotWebhookEvent = {
  eventId?: number | string
  subscriptionType?: string
  objectId?: number | string
  occurredAt?: number | string
  portalId?: number | string
  appId?: number | string
  [k: string]: any
}

function parseTimestampToMs(v: string | null): number | null {
  if (!v) return null
  const s = v.trim()
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    if (!Number.isFinite(n)) return null
    // Heuristic: seconds if 10 digits-ish
    return n < 2_000_000_000_000 ? n * 1000 : n
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256Base64(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  // base64 encode
  const bin = String.fromCharCode(...Array.from(new Uint8Array(sigBytes)))
  return btoa(bin)
}

// HubSpot v3 decoding rules (docs specify decoding certain percent-encoded sequences)
function decodeHubSpotV3Uri(uri: string): string {
  const decodeMap: Record<string, string> = {
    '%3A': ':',
    '%2F': '/',
    '%3F': '?',
    '%40': '@',
    '%21': '!',
    '%24': '$',
    '%27': "'",
    '%28': '(',
    '%29': ')',
    '%2A': '*',
    '%2C': ',',
    '%3B': ';',
  }
  let out = uri
  for (const [encoded, decoded] of Object.entries(decodeMap)) {
    out = out.replace(new RegExp(encoded, 'gi'), decoded)
  }
  return out
}

async function verifyHubSpotSignature(args: {
  clientSecret: string
  method: string
  originalUrl: string
  rawBody: string
  signatureV1: string | null
  signatureVersion: string | null
  signatureV3: string | null
  requestTimestamp: string | null
}): Promise<{ ok: boolean; reason?: string }> {
  const version = (args.signatureVersion || '').trim().toLowerCase()
  const method = (args.method || 'POST').toUpperCase()
  const originalUrl = args.originalUrl || ''

  // Prefer v3 if header present
  if (args.signatureV3) {
    const tsMs = parseTimestampToMs(args.requestTimestamp)
    if (!tsMs) return { ok: false, reason: 'Missing/invalid X-HubSpot-Request-Timestamp' }

    const ageMs = Math.abs(Date.now() - tsMs)
    if (ageMs > 5 * 60 * 1000) return { ok: false, reason: 'Stale HubSpot webhook timestamp (possible replay)' }

    // v3 signature string = method + decodedUri + rawBody + timestamp
    const decodedUri = decodeHubSpotV3Uri(originalUrl)
    const signatureString = `${method}${decodedUri}${args.rawBody}${String(args.requestTimestamp || '')}`
    const expected = await hmacSha256Base64(args.clientSecret, signatureString)
    const provided = args.signatureV3.trim()
    const ok = timingSafeEqual(expected, provided)
    return ok ? { ok: true } : { ok: false, reason: 'Invalid HubSpot v3 signature' }
  }

  // v1/v2 use X-HubSpot-Signature + (optional) X-HubSpot-Signature-Version
  const sig = args.signatureV1?.trim() || ''
  if (!sig) return { ok: false, reason: 'Missing X-HubSpot-Signature' }

  if (version === 'v2') {
    // v2 signature: sha256hex(clientSecret + method + fullUrl + rawBody)
    const source = `${args.clientSecret}${method}${originalUrl}${args.rawBody}`
    const expected = await sha256Hex(source)
    return timingSafeEqual(expected, sig) ? { ok: true } : { ok: false, reason: 'Invalid HubSpot v2 signature' }
  }

  // default to v1
  const source = `${args.clientSecret}${args.rawBody}`
  const expected = await sha256Hex(source)
  return timingSafeEqual(expected, sig) ? { ok: true } : { ok: false, reason: 'Invalid HubSpot v1 signature' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') || ''

  const proxySecret = Deno.env.get('HUBSPOT_WEBHOOK_PROXY_SECRET') ?? ''
  const use60Ts = req.headers.get('X-Use60-Timestamp') || ''
  const use60Sig = req.headers.get('X-Use60-Signature') || ''

  const allowServiceRole = serviceRoleKey && authHeader.trim() === `Bearer ${serviceRoleKey}`

  const rawBody = await req.text()

  let allowProxySig = false
  if (proxySecret && use60Ts && use60Sig.startsWith('v1=')) {
    const expected = await hmacSha256Hex(proxySecret, `v1:${use60Ts}:${rawBody}`)
    const provided = use60Sig.slice('v1='.length).trim()
    allowProxySig = timingSafeEqual(expected, provided)
  }

  if (!allowServiceRole && !allowProxySig) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized webhook' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const token = url.searchParams.get('token') || url.searchParams.get('webhook_token')
  if (!token) {
    return new Response(JSON.stringify({ success: false, error: 'Missing token query param' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: integration } = await supabase
    .from('hubspot_org_integrations')
    .select('org_id, clerk_org_id, is_active, is_connected')
    .eq('webhook_token', token)
    .eq('is_active', true)
    .maybeSingle()

  if (!integration?.org_id) {
    return new Response(JSON.stringify({ success: false, error: 'Unknown webhook token' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Verify HubSpot signature (requires app client secret)
  const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET') ?? ''
  if (!clientSecret) {
    return new Response(JSON.stringify({ success: false, error: 'HubSpot signature verification not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sigV1 = req.headers.get('x-hubspot-signature')
  const sigVer = req.headers.get('x-hubspot-signature-version')
  const sigV3 = req.headers.get('x-hubspot-signature-v3')
  const reqTs = req.headers.get('x-hubspot-request-timestamp')
  const originalUrl = req.headers.get('x-use60-original-url') || req.headers.get('x-use60-original-url'.toLowerCase()) || req.url

  const verified = await verifyHubSpotSignature({
    clientSecret,
    method: req.method,
    originalUrl,
    rawBody,
    signatureV1: sigV1,
    signatureVersion: sigVer,
    signatureV3: sigV3,
    requestTimestamp: reqTs,
  })

  if (!verified.ok) {
    return new Response(JSON.stringify({ success: false, error: verified.reason || 'Invalid HubSpot signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Parse payload
  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    payload = null
  }

  const events: HubSpotWebhookEvent[] = Array.isArray(payload) ? payload : payload?.events && Array.isArray(payload.events) ? payload.events : []
  if (!Array.isArray(events) || events.length === 0) {
    // Return 2xx to avoid HubSpot retry loops for unexpected payloads
    await supabase
      .from('hubspot_org_integrations')
      .update({ webhook_last_received_at: new Date().toISOString() })
      .eq('org_id', integration.org_id)
      .catch(() => {})

    return new Response(JSON.stringify({ success: true, ignored: true, reason: 'no_events' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let inserted = 0
  let deduped = 0
  let enqueued = 0
  let syncedToStandard = 0
  let syncedToIndex = 0

  for (const evt of events) {
    const eventId = evt.eventId != null ? String(evt.eventId) : crypto.randomUUID()
    const eventType = evt.subscriptionType != null ? String(evt.subscriptionType) : 'unknown'
    const occurredAtMs = evt.occurredAt != null ? parseTimestampToMs(String(evt.occurredAt)) : null
    const occurredAtIso = occurredAtMs ? new Date(occurredAtMs).toISOString() : null

    const payloadHash = await sha256Hex(JSON.stringify(evt))

    const { error: insertErr } = await supabase.from('hubspot_webhook_events').insert({
      org_id: integration.org_id,
      clerk_org_id: (integration as any)?.clerk_org_id || null,
      event_id: eventId,
      event_type: eventType,
      occurred_at: occurredAtIso,
      payload_hash: payloadHash,
      payload: evt,
    })

    if (insertErr) {
      // Assume unique violation => duplicate delivery
      deduped++
      continue
    }

    inserted++

    // Map webhook subscription types to queue jobs
    const lowerType = eventType.toLowerCase()
    const objectId = evt.objectId != null ? String(evt.objectId) : null

    if (objectId) {
      let jobType: string | null = null
      let dedupeKey: string | null = null
      let jobPayload: Record<string, any> = {}
      let entityType: 'contact' | 'company' | null = null

      if (lowerType.startsWith('contact.')) {
        jobType = 'sync_contact'
        jobPayload = { hubspot_contact_id: objectId, source: 'webhook', event_type: eventType, event_id: eventId }
        dedupeKey = `contact:${objectId}`
        entityType = 'contact'
      } else if (lowerType.startsWith('deal.')) {
        jobType = 'sync_deal'
        jobPayload = { hubspot_deal_id: objectId, source: 'webhook', event_type: eventType, event_id: eventId }
        dedupeKey = `deal:${objectId}`
      } else if (lowerType.startsWith('task.')) {
        jobType = 'sync_task'
        jobPayload = { hubspot_task_id: objectId, source: 'webhook', event_type: eventType, event_id: eventId }
        dedupeKey = `task:${objectId}`
      } else if (lowerType.startsWith('company.')) {
        jobType = 'sync_company'
        jobPayload = { hubspot_company_id: objectId, source: 'webhook', event_type: eventType, event_id: eventId }
        dedupeKey = `company:${objectId}`
        entityType = 'company'
      }

      if (jobType) {
        await supabase
          .from('hubspot_sync_queue')
          .upsert(
            {
              org_id: integration.org_id,
              clerk_org_id: (integration as any)?.clerk_org_id || null,
              job_type: jobType,
              priority: 5,
              run_after: new Date().toISOString(),
              attempts: 0,
              max_attempts: 10,
              payload: jobPayload,
              dedupe_key: dedupeKey,
            },
            { onConflict: 'org_id,dedupe_key' }
          )
          .then(() => {
            enqueued++
          })
          .catch(() => {})
      }

      // Sync to standard ops tables if this is a contact or company event
      if (entityType && occurredAtIso) {
        try {
          const syncResult = await syncToStandardTable({
            supabase,
            orgId: integration.org_id,
            crmSource: 'hubspot',
            entityType,
            crmRecordId: objectId,
            properties: evt.properties || evt,
            timestamp: occurredAtIso,
          })

          if (syncResult.success && syncResult.rowsUpserted > 0) {
            syncedToStandard++
          }
        } catch (syncErr) {
          // Log but don't fail the webhook - standard table sync is non-critical
          console.error(`[hubspot-webhook] Standard table sync failed for ${entityType} ${objectId}:`, syncErr)
        }
      }

      // Sync to CRM index for fast search/filter
      // Non-blocking: don't await, use Promise to avoid failing the webhook
      if (objectId) {
        const indexProps = evt.properties || evt

        // Handle deletion events
        if (lowerType.endsWith('.deletion')) {
          const deletionEntityType = lowerType.startsWith('contact.') ? 'contact'
            : lowerType.startsWith('company.') ? 'company'
            : lowerType.startsWith('deal.') ? 'deal'
            : null

          if (deletionEntityType) {
            deleteFromIndex({
              supabase,
              orgId: integration.org_id,
              crmSource: 'hubspot',
              crmRecordId: objectId,
              entityType: deletionEntityType,
            }).catch((err) => {
              console.error(`[hubspot-webhook] CRM index deletion failed for ${deletionEntityType} ${objectId}:`, err)
            })
          }
        }
        // Handle creation/update events
        else if (lowerType.startsWith('contact.')) {
          upsertContactIndex({
            supabase,
            orgId: integration.org_id,
            crmSource: 'hubspot',
            crmRecordId: objectId,
            properties: indexProps,
          })
            .then(async (result) => {
              if (result.success) {
                syncedToIndex++

                // If contact is materialized, update the full contacts table
                if (result.isMaterialized && result.contactId) {
                  try {
                    // Find the materialized contact ID
                    const { data: indexRecord } = await supabase
                      .from('crm_contact_index')
                      .select('materialized_contact_id, first_name, last_name, email, phone, company_name, job_title')
                      .eq('id', result.contactId)
                      .maybeSingle()

                    if (indexRecord?.materialized_contact_id) {
                      // Update the materialized contact with latest CRM data
                      await supabase
                        .from('contacts')
                        .update({
                          first_name: indexRecord.first_name || undefined,
                          last_name: indexRecord.last_name || undefined,
                          email: indexRecord.email || undefined,
                          phone: indexRecord.phone || undefined,
                          title: indexRecord.job_title || undefined,
                          company: indexRecord.company_name || undefined,
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', indexRecord.materialized_contact_id)

                      console.log(`[hubspot-webhook] Updated materialized contact ${indexRecord.materialized_contact_id}`)
                    }
                  } catch (materializeErr) {
                    console.error(`[hubspot-webhook] Failed to update materialized contact for ${objectId}:`, materializeErr)
                  }
                }
              }
            })
            .catch((err) => {
              console.error(`[hubspot-webhook] CRM index upsert failed for contact ${objectId}:`, err)
            })
        } else if (lowerType.startsWith('company.')) {
          upsertCompanyIndex({
            supabase,
            orgId: integration.org_id,
            crmSource: 'hubspot',
            crmRecordId: objectId,
            properties: indexProps,
          })
            .then(async (result) => {
              if (result.success) {
                syncedToIndex++

                // If company is materialized, update the full companies table
                if (result.isMaterialized && result.companyId) {
                  try {
                    // Find the materialized company ID
                    const { data: indexRecord } = await supabase
                      .from('crm_company_index')
                      .select('materialized_company_id, name, domain, industry, employee_count, city, state, country')
                      .eq('id', result.companyId)
                      .maybeSingle()

                    if (indexRecord?.materialized_company_id) {
                      // Map employee count to size enum
                      let size = null
                      if (indexRecord.employee_count) {
                        const count = Number(indexRecord.employee_count)
                        size = count <= 10 ? 'startup'
                          : count <= 50 ? 'small'
                          : count <= 200 ? 'medium'
                          : count <= 1000 ? 'large'
                          : 'enterprise'
                      }

                      // Update the materialized company with latest CRM data
                      await supabase
                        .from('companies')
                        .update({
                          name: indexRecord.name || undefined,
                          domain: indexRecord.domain || undefined,
                          industry: indexRecord.industry || undefined,
                          size: size || undefined,
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', indexRecord.materialized_company_id)

                      console.log(`[hubspot-webhook] Updated materialized company ${indexRecord.materialized_company_id}`)
                    }
                  } catch (materializeErr) {
                    console.error(`[hubspot-webhook] Failed to update materialized company for ${objectId}:`, materializeErr)
                  }
                }
              }
            })
            .catch((err) => {
              console.error(`[hubspot-webhook] CRM index upsert failed for company ${objectId}:`, err)
            })
        } else if (lowerType.startsWith('deal.')) {
          upsertDealIndex({
            supabase,
            orgId: integration.org_id,
            crmSource: 'hubspot',
            crmRecordId: objectId,
            properties: indexProps,
          })
            .then((result) => {
              if (result.success) syncedToIndex++
            })
            .catch((err) => {
              console.error(`[hubspot-webhook] CRM index upsert failed for deal ${objectId}:`, err)
            })
        }
      }
    }
  }

  await supabase
    .from('hubspot_org_integrations')
    .update({
      webhook_last_received_at: new Date().toISOString(),
      webhook_last_event_id: events[events.length - 1]?.eventId != null ? String(events[events.length - 1]?.eventId) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', integration.org_id)
    .catch(() => {})

  return new Response(
    JSON.stringify({
      success: true,
      org_id: integration.org_id,
      received: events.length,
      inserted,
      deduped,
      enqueued,
      synced_to_standard: syncedToStandard,
      synced_to_index: syncedToIndex,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'hubspot-webhook',
        integration: 'hubspot',
      },
    });
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Webhook processing failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})


