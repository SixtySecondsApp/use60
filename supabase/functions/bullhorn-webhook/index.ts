import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { legacyCorsHeaders as corsHeaders } from '../_shared/corsHelper.ts'
import { captureException } from '../_shared/sentryEdge.ts'

// ============================================================================
// Bullhorn Webhook Handler
// ============================================================================
// Receives webhook events from Bullhorn, stores them idempotently, and queues
// sync jobs for processing. Follows the same pattern as hubspot-webhook.
//
// Bullhorn webhook payload structure:
// {
//   "events": [
//     {
//       "entityType": "Candidate",
//       "entityId": 123456,
//       "eventType": "CREATED",
//       "eventTimestamp": 1704067200000,
//       "eventMetadata": { ... }
//     }
//   ]
// }
// ============================================================================

type BullhornWebhookEvent = {
  entityType?: string
  entityId?: number | string
  eventType?: string
  eventTimestamp?: number | string
  eventMetadata?: Record<string, unknown>
  [k: string]: unknown
}

// Map Bullhorn entity types to sync queue job types
// Must match the CHECK constraint in bullhorn_sync_queue table
const ENTITY_TO_JOB_TYPE: Record<string, string> = {
  candidate: 'sync_candidate',
  clientcontact: 'sync_client_contact',
  clientcorporation: 'sync_client_corporation',
  joborder: 'sync_job_order',
  placement: 'sync_placement',
  task: 'sync_task',
  note: 'sync_note',
  appointment: 'sync_appointment',
  opportunity: 'sync_opportunity',
  // Note: Sendout not currently supported in queue schema
}

// Map Bullhorn entity types to dedupe key prefixes
const ENTITY_TO_DEDUPE_PREFIX: Record<string, string> = {
  candidate: 'candidate',
  clientcontact: 'client_contact',
  clientcorporation: 'client_corporation',
  joborder: 'job_order',
  placement: 'placement',
  task: 'task',
  note: 'note',
  appointment: 'appointment',
  opportunity: 'opportunity',
}

// Priority by event type (higher = more urgent)
const EVENT_TYPE_PRIORITY: Record<string, number> = {
  CREATED: 10,
  UPDATED: 5,
  DELETED: 1,
}

/**
 * Parse timestamp to ISO string
 * Handles both milliseconds and ISO string formats
 */
function parseTimestampToIso(v: string | number | null | undefined): string | null {
  if (v == null) return null

  if (typeof v === 'number') {
    // Bullhorn typically sends milliseconds
    return new Date(v).toISOString()
  }

  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (!trimmed) return null

    // Check if it's a numeric string (milliseconds)
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed)
      if (!Number.isFinite(n)) return null
      return new Date(n).toISOString()
    }

    // Try parsing as ISO date
    const parsed = Date.parse(trimmed)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
  }

  return null
}

/**
 * Generate a unique event ID from Bullhorn event data
 * Format: {entityType}_{entityId}_{eventTimestamp}
 */
function generateEventId(event: BullhornWebhookEvent): string {
  const entityType = event.entityType || 'unknown'
  const entityId = event.entityId != null ? String(event.entityId) : 'unknown'
  const timestamp = event.eventTimestamp != null ? String(event.eventTimestamp) : Date.now().toString()
  return `${entityType}_${entityId}_${timestamp}`
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

    // Parse URL and get webhook token
    const url = new URL(req.url)
    const token = url.searchParams.get('webhook_token') || url.searchParams.get('token')

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing webhook_token query param' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Look up org by webhook token
    const { data: integration, error: integrationError } = await supabase
      .from('bullhorn_org_integrations')
      .select('org_id, is_active, is_connected')
      .eq('webhook_token', token)
      .eq('is_active', true)
      .maybeSingle()

    if (integrationError) {
      console.error('[bullhorn-webhook] Error looking up integration:', integrationError)
      // Return 200 to prevent Bullhorn retries on our errors
      return new Response(
        JSON.stringify({ success: false, error: 'Database error' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!integration?.org_id) {
      // Unknown token - return 200 to prevent retries but log it
      console.warn('[bullhorn-webhook] Unknown webhook token:', token.substring(0, 8) + '...')
      return new Response(
        JSON.stringify({ success: false, error: 'Unknown webhook token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!integration.is_connected) {
      console.warn('[bullhorn-webhook] Integration not connected for org:', integration.org_id)
      return new Response(
        JSON.stringify({ success: false, error: 'Integration not connected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const rawBody = await req.text()
    let payload: unknown

    try {
      payload = JSON.parse(rawBody)
    } catch {
      console.error('[bullhorn-webhook] Invalid JSON payload')
      // Update last received timestamp even for malformed payloads
      await supabase
        .from('bullhorn_org_integrations')
        .update({ webhook_last_received_at: new Date().toISOString() })
        .eq('org_id', integration.org_id)
        .catch(() => {})

      return new Response(
        JSON.stringify({ success: true, ignored: true, reason: 'invalid_json' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract events array from payload
    // Bullhorn sends { events: [...] } but handle array directly too
    let events: BullhornWebhookEvent[] = []
    if (Array.isArray(payload)) {
      events = payload
    } else if (payload && typeof payload === 'object' && 'events' in payload && Array.isArray((payload as { events: unknown[] }).events)) {
      events = (payload as { events: BullhornWebhookEvent[] }).events
    }

    if (events.length === 0) {
      // No events - acknowledge receipt but nothing to process
      await supabase
        .from('bullhorn_org_integrations')
        .update({ webhook_last_received_at: new Date().toISOString() })
        .eq('org_id', integration.org_id)
        .catch(() => {})

      return new Response(
        JSON.stringify({ success: true, ignored: true, reason: 'no_events' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process events
    let inserted = 0
    let deduped = 0
    let enqueued = 0

    for (const evt of events) {
      const eventId = generateEventId(evt)
      const eventType = evt.eventType || 'UNKNOWN'
      const entityType = evt.entityType || 'unknown'
      const entityId = evt.entityId != null ? String(evt.entityId) : null
      const occurredAtIso = parseTimestampToIso(evt.eventTimestamp)

      // Try to insert event into webhook_events table (idempotency check)
      const { error: insertErr } = await supabase.from('bullhorn_webhook_events').insert({
        org_id: integration.org_id,
        event_id: eventId,
        event_type: `${entityType}.${eventType}`,
        payload: evt,
        received_at: new Date().toISOString(),
      })

      if (insertErr) {
        // Assume unique constraint violation = duplicate delivery
        deduped++
        continue
      }

      inserted++

      // Queue sync job if we have a valid entity ID
      if (entityId) {
        const lowerEntityType = entityType.toLowerCase().replace(/[^a-z]/g, '')
        const jobType = ENTITY_TO_JOB_TYPE[lowerEntityType]
        const dedupePrefix = ENTITY_TO_DEDUPE_PREFIX[lowerEntityType]

        if (jobType && dedupePrefix) {
          const dedupeKey = `${dedupePrefix}:${entityId}`
          const priority = EVENT_TYPE_PRIORITY[eventType] || 5

          const jobPayload = {
            bullhorn_entity_id: entityId,
            bullhorn_entity_type: entityType,
            source: 'webhook',
            event_type: eventType,
            event_id: eventId,
            event_timestamp: occurredAtIso,
          }

          // Upsert job to sync queue (dedupe by org_id + dedupe_key)
          const { error: queueError } = await supabase
            .from('bullhorn_sync_queue')
            .upsert(
              {
                org_id: integration.org_id,
                job_type: jobType,
                priority,
                run_after: new Date().toISOString(),
                attempts: 0,
                max_attempts: 10,
                payload: jobPayload,
                dedupe_key: dedupeKey,
              },
              { onConflict: 'org_id,dedupe_key' }
            )

          if (!queueError) {
            enqueued++
          } else {
            console.warn('[bullhorn-webhook] Failed to queue job:', queueError.message)
          }
        } else {
          console.log(`[bullhorn-webhook] Unsupported entity type: ${entityType}`)
        }
      }
    }

    // Update webhook last received timestamp
    await supabase
      .from('bullhorn_org_integrations')
      .update({
        webhook_last_received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', integration.org_id)
      .catch(() => {})

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        org_id: integration.org_id,
        received: events.length,
        inserted,
        deduped,
        enqueued,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    // Log error to Sentry but still return 200 to prevent Bullhorn retries
    await captureException(error, {
      tags: {
        function: 'bullhorn-webhook',
        integration: 'bullhorn',
      },
    })

    console.error('[bullhorn-webhook] Unexpected error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Webhook processing failed',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
