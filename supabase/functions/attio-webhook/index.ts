import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { syncToStandardTable } from '../_shared/standardTableSync.ts'
import { upsertContactIndex, upsertCompanyIndex } from '../_shared/upsertCrmIndex.ts'

/**
 * Attio Webhook Receiver
 *
 * Receives webhook events from Attio, verifies the shared secret,
 * and queues events in attio_sync_queue for async processing.
 *
 * Security: Shared secret appended as ?secret=xxx in the target URL.
 * Attio doesn't document HMAC signature verification.
 */
serve(async (req) => {
  // Webhooks are POST-only from Attio
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[attio-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return new Response('Server misconfigured', { status: 500 })
  }

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // Extract shared secret from query params
    const url = new URL(req.url)
    const secret = url.searchParams.get('secret')

    if (!secret) {
      console.warn('[attio-webhook] Missing secret query param')
      return new Response(JSON.stringify({ error: 'Missing secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Find the org by webhook_secret
    const { data: integration, error: integrationError } = await svc
      .from('attio_org_integrations')
      .select('org_id, is_active, webhook_secret')
      .eq('webhook_secret', secret)
      .eq('is_active', true)
      .maybeSingle()

    if (integrationError || !integration) {
      console.warn('[attio-webhook] Invalid secret or integration not found')
      return new Response(JSON.stringify({ error: 'Invalid webhook secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parse the webhook payload
    const payload = await req.json()
    const eventType = payload?.event_type || payload?.type || 'unknown'

    console.log(`[attio-webhook] Received event: ${eventType} for org ${integration.org_id}`)

    // Update last received timestamp
    await svc
      .from('attio_org_integrations')
      .update({ webhook_last_received_at: new Date().toISOString() })
      .eq('org_id', integration.org_id)

    // Map event types to job types
    const jobTypeMap: Record<string, string> = {
      'record.created': 'sync_record',
      'record.updated': 'sync_record',
      'record.deleted': 'sync_record',
      'record.merged': 'sync_record',
      'list-entry.created': 'sync_record',
      'list-entry.updated': 'sync_record',
      'list-entry.deleted': 'sync_record',
      'note.created': 'sync_note',
      'note.updated': 'sync_note',
      'note.deleted': 'sync_note',
      'task.created': 'sync_task',
      'task.updated': 'sync_task',
      'task.deleted': 'sync_task',
    }

    const jobType = jobTypeMap[eventType] || 'webhook_event'

    // Build dedupe key to prevent duplicate processing
    const eventId = payload?.event_id || payload?.id || crypto.randomUUID()
    const dedupeKey = `webhook:${integration.org_id}:${eventType}:${eventId}`

    // Queue the event for async processing
    const { error: queueError } = await svc.from('attio_sync_queue').insert({
      org_id: integration.org_id,
      job_type: jobType,
      priority: getEventPriority(eventType),
      payload: {
        event_type: eventType,
        event_id: eventId,
        data: payload?.data || payload,
        received_at: new Date().toISOString(),
      },
      dedupe_key: dedupeKey,
    })

    if (queueError) {
      // Check for dedupe conflict (not a real error)
      if (queueError.code === '23505') {
        console.log(`[attio-webhook] Deduplicated event: ${dedupeKey}`)
      } else {
        console.error('[attio-webhook] Queue insert error:', queueError)
      }
    }

    // Sync to standard ops tables for contact and company records
    let syncedToStandard = false
    let syncedToCrmIndex = false
    const recordData = payload?.data?.record || payload?.data || {}
    const objectType = recordData?.object_type || payload?.object_type
    const recordId = recordData?.id?.record_id || recordData?.id || eventId

    if (objectType && recordId && (objectType === 'people' || objectType === 'companies')) {
      const entityType = objectType === 'people' ? 'contact' : 'company'
      const timestamp = payload?.timestamp || new Date().toISOString()

      try {
        const syncResult = await syncToStandardTable({
          supabase: svc,
          orgId: integration.org_id,
          crmSource: 'attio',
          entityType,
          crmRecordId: recordId,
          properties: recordData?.values || recordData || {},
          timestamp,
        })

        if (syncResult.success && syncResult.rowsUpserted > 0) {
          syncedToStandard = true
          console.log(`[attio-webhook] Synced ${entityType} ${recordId} to standard tables`)
        }
      } catch (syncErr) {
        // Log but don't fail the webhook - standard table sync is non-critical
        console.error(`[attio-webhook] Standard table sync failed for ${entityType} ${recordId}:`, syncErr)
      }

      // Upsert to CRM index for fast copilot search
      try {
        // Extract values from Attio format
        const values = recordData?.values || {}

        if (objectType === 'people') {
          // Map Attio contact fields
          const indexProperties = {
            first_name: values.first_name?.[0]?.first_name || values.name?.[0]?.first_name,
            last_name: values.last_name?.[0]?.last_name || values.name?.[0]?.last_name,
            email: values.email_addresses?.[0]?.email_address,
            company_name: values.company?.[0]?.target_object_name || values.company_name?.[0]?.value,
            job_title: values.job_title?.[0]?.value,
            lifecycle_stage: values.lifecycle_stage?.[0]?.value,
            lead_status: values.lead_status?.[0]?.value,
            updated_at: values.updated_at || new Date().toISOString(),
          }

          const indexResult = await upsertContactIndex({
            supabase: svc,
            orgId: integration.org_id,
            crmSource: 'attio',
            crmRecordId: recordId,
            properties: indexProperties,
          })

          if (indexResult.success) {
            syncedToCrmIndex = true
            console.log(`[attio-webhook] Indexed contact ${recordId} in CRM index`)
          }
        } else if (objectType === 'companies') {
          // Map Attio company fields
          const indexProperties = {
            name: values.name?.[0]?.value,
            domain: values.domains?.[0]?.domain || values.primary_domain?.[0]?.value,
            industry: values.industry?.[0]?.value,
            employee_count: values.employee_count?.[0]?.value,
            estimated_arr: values.estimated_arr?.[0]?.value,
            updated_at: values.updated_at || new Date().toISOString(),
          }

          const indexResult = await upsertCompanyIndex({
            supabase: svc,
            orgId: integration.org_id,
            crmSource: 'attio',
            crmRecordId: recordId,
            properties: indexProperties,
          })

          if (indexResult.success) {
            syncedToCrmIndex = true
            console.log(`[attio-webhook] Indexed company ${recordId} in CRM index`)
          }
        }
      } catch (indexErr) {
        // Log but don't fail the webhook - CRM index is non-critical
        console.error(`[attio-webhook] CRM index upsert failed for ${entityType} ${recordId}:`, indexErr)
      }
    }

    // Log inbound webhook event
    await svc
      .from('integration_sync_logs')
      .insert({
        organization_id: integration.org_id,
        integration_type: 'attio',
        direction: 'inbound',
        entity_type: eventType.split('.')[0] || 'unknown',
        status: 'queued',
        details: {
          event_type: eventType,
          event_id: eventId,
          dedupe_key: dedupeKey,
          synced_to_standard: syncedToStandard,
          synced_to_crm_index: syncedToCrmIndex,
        },
      })
      .catch((e: any) => console.warn('[attio-webhook] Sync log insert failed:', e.message))

    // Return 200 quickly (Attio expects fast response)
    return new Response(JSON.stringify({
      received: true,
      synced_to_standard: syncedToStandard,
      synced_to_crm_index: syncedToCrmIndex
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[attio-webhook] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

/** Assign priority based on event type (higher = more urgent) */
function getEventPriority(eventType: string): number {
  if (eventType.includes('deleted')) return 5
  if (eventType.includes('merged')) return 4
  if (eventType.includes('created')) return 3
  if (eventType.includes('updated')) return 2
  return 1
}
