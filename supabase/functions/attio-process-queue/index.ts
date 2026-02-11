import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { AttioClient, AttioError, fromAttioValues } from '../_shared/attio.ts'

/**
 * Attio Process Queue — Cron-driven job processor
 *
 * Service-role only. Called by Vercel cron every minute.
 * Dequeues jobs from attio_sync_queue and processes them:
 *
 * Job types:
 * - sync_record:     Inbound sync — fetch record from Attio, update Ops table cells
 * - sync_table:      Full table re-sync — query all records for an Ops table
 * - webhook_event:   Process queued webhook event (record/list-entry/note/task changes)
 * - register_webhook: Register webhook subscription for an org
 */

type QueueJob = {
  id: string
  org_id: string
  job_type: string
  priority: number
  attempts: number
  max_attempts: number
  run_after: string
  payload: any
  dedupe_key: string | null
  created_at: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Token helper ──────────────────────────────────────────────────────────────

async function getAccessTokenForOrg(supabase: any, orgId: string): Promise<string> {
  const { data: creds, error } = await supabase
    .from('attio_org_credentials')
    .select('access_token, refresh_token, token_expires_at')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error || !creds) throw new Error(`Missing Attio credentials for org ${orgId}`)

  const accessToken = String(creds.access_token || '')
  const refreshToken = String(creds.refresh_token || '')
  const expiresAt = new Date(String(creds.token_expires_at || 0)).getTime()

  // If token is still valid (more than 2 min remaining), use it
  if (expiresAt && expiresAt - Date.now() > 2 * 60 * 1000) {
    return accessToken
  }

  // Refresh expired token
  if (!refreshToken) throw new Error('Missing Attio refresh token')

  const clientId = Deno.env.get('ATTIO_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('ATTIO_CLIENT_SECRET') || ''
  if (!clientId || !clientSecret) throw new Error('Missing ATTIO_CLIENT_ID/ATTIO_CLIENT_SECRET')

  console.log(`[attio-process-queue] Refreshing token for org ${orgId}`)

  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })

  const tokenResp = await fetch('https://app.attio.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  })

  if (!tokenResp.ok) {
    const errorText = await tokenResp.text()
    throw new Error(`Attio token refresh failed: ${errorText}`)
  }

  const tokenData = await tokenResp.json()
  const newAccessToken = String(tokenData.access_token || '')
  const newRefreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : refreshToken
  const expiresIn = Number(tokenData.expires_in || 3600)
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  await supabase
    .from('attio_org_credentials')
    .update({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)

  return newAccessToken
}

// ─── Job handlers ──────────────────────────────────────────────────────────────

/**
 * sync_record: Fetch a single Attio record and update corresponding Ops table cells.
 * payload: { object, record_id, table_id? }
 */
async function handleSyncRecord(params: {
  supabase: any
  client: AttioClient
  orgId: string
  payload: any
}) {
  const { supabase, client, orgId, payload } = params
  const objectSlug = payload?.object
  const recordId = payload?.record_id
  if (!objectSlug || !recordId) return

  // Fetch the record from Attio
  const record = await client.getRecord(objectSlug, recordId)
  const flat = fromAttioValues(record.values || {})

  // Find Ops table rows that reference this record
  const { data: rows } = await supabase
    .from('dynamic_table_rows')
    .select('id, table_id')
    .eq('source_id', recordId)
    .is('attio_removed_at', null)

  if (!rows?.length) return

  for (const row of rows) {
    // Get Attio-mapped columns for this table
    const { data: columns } = await supabase
      .from('dynamic_table_columns')
      .select('id, attio_property_name')
      .eq('table_id', row.table_id)
      .eq('column_type', 'attio_property')

    if (!columns?.length) continue

    // Build cell upserts
    const cellUpserts = columns
      .filter((col: any) => col.attio_property_name && flat[col.attio_property_name] !== undefined)
      .map((col: any) => ({
        row_id: row.id,
        column_id: col.id,
        value: String(flat[col.attio_property_name] ?? ''),
        attio_last_pushed_at: new Date().toISOString(), // Mark as synced to prevent loop
      }))

    if (cellUpserts.length > 0) {
      await supabase
        .from('dynamic_table_cells')
        .upsert(cellUpserts, { onConflict: 'row_id,column_id' })
    }

    // Update row source_data cache
    await supabase
      .from('dynamic_table_rows')
      .update({
        source_data: { attio: record.values },
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
  }

  // Log sync
  await supabase
    .from('integration_sync_logs')
    .insert({
      organization_id: orgId,
      integration_type: 'attio',
      direction: 'inbound',
      entity_type: objectSlug,
      status: 'success',
      details: { record_id: recordId, action: 'sync_record', rows_updated: rows.length },
    })
    .catch((e: any) => console.warn('[attio-process-queue] Sync log failed:', e.message))
}

/**
 * sync_table: Full re-sync of all records for an Ops table.
 * payload: { table_id, object, filter?, limit? }
 */
async function handleSyncTable(params: {
  supabase: any
  client: AttioClient
  orgId: string
  payload: any
}) {
  const { supabase, client, orgId, payload } = params
  const tableId = payload?.table_id
  const objectSlug = payload?.object || 'people'
  if (!tableId) return

  // Get table config
  const { data: table } = await supabase
    .from('dynamic_tables')
    .select('id, source_config')
    .eq('id', tableId)
    .maybeSingle()

  if (!table) return

  // Get Attio-mapped columns
  const { data: columns } = await supabase
    .from('dynamic_table_columns')
    .select('id, attio_property_name')
    .eq('table_id', tableId)
    .eq('column_type', 'attio_property')

  if (!columns?.length) return

  // Fetch all records from Attio with pagination
  let offset = 0
  const limit = payload?.limit || 200
  let totalSynced = 0

  while (true) {
    const result = await client.queryRecords(objectSlug, {
      filter: payload?.filter,
      limit: Math.min(limit, 500),
      offset,
    })

    const records = result.data || []
    if (records.length === 0) break

    // Process records in batches
    for (const record of records) {
      const recordId = record.id?.record_id
      if (!recordId) continue

      const flat = fromAttioValues(record.values || {})

      // Upsert row
      const { data: existingRow } = await supabase
        .from('dynamic_table_rows')
        .select('id')
        .eq('table_id', tableId)
        .eq('source_id', recordId)
        .maybeSingle()

      let rowId: string
      if (existingRow) {
        rowId = existingRow.id
        await supabase
          .from('dynamic_table_rows')
          .update({
            source_data: { attio: record.values },
            attio_removed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rowId)
      } else {
        const { data: newRow } = await supabase
          .from('dynamic_table_rows')
          .insert({
            table_id: tableId,
            source_id: recordId,
            source_data: { attio: record.values },
          })
          .select('id')
          .single()

        if (!newRow) continue
        rowId = newRow.id
      }

      // Upsert cells
      const cellUpserts = columns
        .filter((col: any) => col.attio_property_name)
        .map((col: any) => ({
          row_id: rowId,
          column_id: col.id,
          value: flat[col.attio_property_name] !== undefined
            ? String(flat[col.attio_property_name] ?? '')
            : '',
          attio_last_pushed_at: new Date().toISOString(),
        }))

      if (cellUpserts.length > 0) {
        // Batch upsert in chunks
        for (let i = 0; i < cellUpserts.length; i += 100) {
          const chunk = cellUpserts.slice(i, i + 100)
          await supabase
            .from('dynamic_table_cells')
            .upsert(chunk, { onConflict: 'row_id,column_id' })
        }
      }

      totalSynced++
    }

    offset += records.length
    if (!result.next_offset) break

    // Rate limit pause between pages
    await sleep(100)
  }

  // Update sync history
  await supabase
    .from('attio_sync_history')
    .insert({
      org_id: orgId,
      sync_type: 'full',
      status: 'success',
      entity_type: objectSlug,
      records_synced: totalSynced,
      details: { table_id: tableId },
    })
    .catch((e: any) => console.warn('[attio-process-queue] History insert failed:', e.message))

  // Log
  await supabase
    .from('integration_sync_logs')
    .insert({
      organization_id: orgId,
      integration_type: 'attio',
      direction: 'inbound',
      entity_type: objectSlug,
      status: 'success',
      details: { table_id: tableId, action: 'sync_table', total_synced: totalSynced },
    })
    .catch((e: any) => console.warn('[attio-process-queue] Sync log failed:', e.message))
}

/**
 * webhook_event: Process a queued webhook event.
 * payload: { event_type, object?, record_id?, list_id?, entry_id?, data? }
 */
async function handleWebhookEvent(params: {
  supabase: any
  client: AttioClient
  orgId: string
  payload: any
}) {
  const { supabase, client, orgId, payload } = params
  const eventType = payload?.event_type || ''

  if (eventType.startsWith('record.')) {
    const objectSlug = payload?.object
    const recordId = payload?.record_id
    if (!objectSlug || !recordId) return

    if (eventType === 'record.deleted') {
      // Soft-delete rows referencing this record
      await supabase
        .from('dynamic_table_rows')
        .update({ attio_removed_at: new Date().toISOString() })
        .eq('source_id', recordId)
        .is('attio_removed_at', null)
      return
    }

    // record.created, record.updated, record.merged — re-sync the record
    await handleSyncRecord({ supabase, client, orgId, payload: { object: objectSlug, record_id: recordId } })
    return
  }

  if (eventType.startsWith('list-entry.')) {
    // List entry changes don't directly map to Ops table cells.
    // Log for audit, could trigger downstream workflows.
    await supabase
      .from('integration_sync_logs')
      .insert({
        organization_id: orgId,
        integration_type: 'attio',
        direction: 'inbound',
        entity_type: 'list-entry',
        status: 'success',
        details: { event_type: eventType, ...payload },
      })
      .catch(() => {})
    return
  }

  if (eventType.startsWith('note.') || eventType.startsWith('task.')) {
    // Notes and tasks: log for audit trail
    await supabase
      .from('integration_sync_logs')
      .insert({
        organization_id: orgId,
        integration_type: 'attio',
        direction: 'inbound',
        entity_type: eventType.split('.')[0],
        status: 'success',
        details: { event_type: eventType, ...payload },
      })
      .catch(() => {})
    return
  }

  console.warn(`[attio-process-queue] Unknown webhook event type: ${eventType}`)
}

/**
 * register_webhook: Register an Attio webhook subscription for an org.
 * payload: { target_url, events? }
 */
async function handleRegisterWebhook(params: {
  supabase: any
  client: AttioClient
  orgId: string
  payload: any
}) {
  const { supabase, client, orgId, payload } = params
  const targetUrl = payload?.target_url
  if (!targetUrl) throw new Error('Missing target_url in payload')

  const events = payload?.events || [
    'record.created', 'record.updated', 'record.deleted', 'record.merged',
    'list-entry.created', 'list-entry.updated', 'list-entry.deleted',
    'note.created', 'note.updated', 'note.deleted',
    'task.created', 'task.updated', 'task.deleted',
  ]

  // Check existing webhooks and avoid duplicates
  const existing = await client.listWebhooks()
  const alreadyRegistered = (existing.data || []).find(
    (w: any) => w.target_url === targetUrl && w.status === 'active'
  )

  if (alreadyRegistered) {
    console.log(`[attio-process-queue] Webhook already registered for org ${orgId}`)
    return
  }

  const webhook = await client.createWebhook(targetUrl, events)

  // Store webhook ID in integration settings
  await supabase
    .from('attio_org_integrations')
    .update({
      webhook_id: webhook.id?.webhook_id || webhook.id,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)

  console.log(`[attio-process-queue] Webhook registered for org ${orgId}: ${JSON.stringify(webhook.id)}`)
}

// ─── Job dispatcher ────────────────────────────────────────────────────────────

async function handleJob(params: {
  supabase: any
  orgId: string
  job: QueueJob
  accessToken: string
}) {
  const client = new AttioClient({ accessToken: params.accessToken })

  switch (params.job.job_type) {
    case 'sync_record':
      await handleSyncRecord({
        supabase: params.supabase,
        client,
        orgId: params.orgId,
        payload: params.job.payload,
      })
      return
    case 'sync_table':
      await handleSyncTable({
        supabase: params.supabase,
        client,
        orgId: params.orgId,
        payload: params.job.payload,
      })
      return
    case 'webhook_event':
      await handleWebhookEvent({
        supabase: params.supabase,
        client,
        orgId: params.orgId,
        payload: params.job.payload,
      })
      return
    case 'register_webhook':
      await handleRegisterWebhook({
        supabase: params.supabase,
        client,
        orgId: params.orgId,
        payload: params.job.payload,
      })
      return
    default:
      console.warn(`[attio-process-queue] Unknown job type: ${params.job.job_type}`)
  }
}

// ─── Main serve handler ────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Service-role only (called by Vercel cron)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') || ''
  if (!serviceRoleKey || authHeader.trim() !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const startedAt = Date.now()

  try {
    let body: any = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const limit = Math.min(Math.max(Number(body.limit || 10), 1), 50)
    const orgId = typeof body.org_id === 'string' ? body.org_id : null

    // Dequeue jobs atomically (SKIP LOCKED for concurrency safety)
    const { data: jobs, error: dequeueErr } = await supabase.rpc('attio_dequeue_jobs', {
      p_limit: limit,
      p_org_id: orgId,
    })

    if (dequeueErr) {
      throw new Error(`Failed to dequeue jobs: ${dequeueErr.message}`)
    }

    const queueJobs: QueueJob[] = (jobs || []) as any
    if (!queueJobs.length) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No jobs ready' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Group jobs by org for single token per org
    const byOrg = new Map<string, QueueJob[]>()
    for (const j of queueJobs) {
      const list = byOrg.get(j.org_id) || []
      list.push(j)
      byOrg.set(j.org_id, list)
    }

    const results: Array<{ id: string; org_id: string; job_type: string; success: boolean; message?: string }> = []

    for (const [oId, orgJobs] of byOrg.entries()) {
      // Verify integration is connected
      const { data: integrationRow } = await supabase
        .from('attio_org_integrations')
        .select('is_connected')
        .eq('org_id', oId)
        .maybeSingle()

      if (!integrationRow?.is_connected) {
        // Requeue with delay
        for (const j of orgJobs) {
          await supabase.from('attio_sync_queue').insert({
            org_id: oId,
            job_type: j.job_type,
            priority: j.priority,
            run_after: new Date(Date.now() + 60_000).toISOString(),
            attempts: j.attempts + 1,
            max_attempts: j.max_attempts,
            last_error: 'Attio integration not connected',
            payload: j.payload,
            dedupe_key: j.dedupe_key,
          }).catch(() => {})
          results.push({ id: j.id, org_id: oId, job_type: j.job_type, success: false, message: 'not_connected' })
        }
        continue
      }

      let accessToken: string
      try {
        accessToken = await getAccessTokenForOrg(supabase, oId)
      } catch (tokenErr: any) {
        // Token failure — requeue all org jobs
        for (const j of orgJobs) {
          await supabase.from('attio_sync_queue').insert({
            org_id: oId,
            job_type: j.job_type,
            priority: j.priority,
            run_after: new Date(Date.now() + 120_000).toISOString(),
            attempts: j.attempts + 1,
            max_attempts: j.max_attempts,
            last_error: `Token error: ${tokenErr.message}`,
            payload: j.payload,
            dedupe_key: j.dedupe_key,
          }).catch(() => {})
          results.push({ id: j.id, org_id: oId, job_type: j.job_type, success: false, message: tokenErr.message })
        }
        continue
      }

      for (const j of orgJobs) {
        try {
          await handleJob({ supabase, orgId: oId, job: j, accessToken })
          results.push({ id: j.id, org_id: oId, job_type: j.job_type, success: true })
        } catch (e: any) {
          const msg = e instanceof AttioError ? `attio:${e.status}:${e.message}` : e?.message || 'job_failed'
          const retryAfterMs = e instanceof AttioError ? e.retryAfterMs : undefined
          const nextRun = new Date(
            Date.now() + (retryAfterMs ?? Math.min(60_000, 1000 * Math.pow(2, Math.max(0, j.attempts))))
          ).toISOString()

          // Requeue with incremented attempts
          if (j.attempts + 1 < j.max_attempts) {
            await supabase
              .from('attio_sync_queue')
              .insert({
                org_id: oId,
                job_type: j.job_type,
                priority: j.priority,
                run_after: nextRun,
                attempts: j.attempts + 1,
                max_attempts: j.max_attempts,
                last_error: msg,
                payload: j.payload,
                dedupe_key: j.dedupe_key,
              })
              .catch(() => {})
          }

          results.push({ id: j.id, org_id: oId, job_type: j.job_type, success: false, message: msg })
        }

        // Small delay between jobs to respect rate limits
        await sleep(50)
      }
    }

    const durationMs = Date.now() - startedAt
    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        duration_ms: durationMs,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[attio-process-queue] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startedAt,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
