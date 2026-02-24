import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { resolvePath, applyTransform, gdpr_check_record } from '../_shared/apifyTransforms.ts'

/**
 * Progress event types for Realtime broadcasts
 */
type ProgressEvent =
  | { type: 'actor_started'; actor: string; query?: Record<string, unknown> }
  | { type: 'actor_progress'; actor: string; percent: number; current: number; total: number }
  | { type: 'actor_completed'; actor: string; result_count: number; duration_ms: number }
  | { type: 'actor_failed'; actor: string; error: string }

/**
 * Publish progress event to Realtime channel
 */
async function publishProgressEvent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  event: ProgressEvent
): Promise<void> {
  try {
    const channel = supabase.channel(`apify_progress_${organizationId}`)
    await channel.send({
      type: 'broadcast',
      event: 'progress_update',
      payload: event,
    })
    console.log(`[apify-run-webhook] Published progress event: ${event.type} for ${event.actor}`)
  } catch (error) {
    // Don't fail the webhook if Realtime publish fails
    console.error('[apify-run-webhook] Failed to publish progress event:', error)
  }
}

/**
 * apify-run-webhook — Called by Apify when an actor run completes or fails.
 *
 * IMPORTANT: Deploy with --no-verify-jwt since this is called externally by Apify.
 * Uses service role client only (no user auth).
 *
 * Pipeline:
 *   1. Fetch dataset items from Apify → insert into apify_results (raw)
 *   2. If mapping_template_id is set on the run → apply mapping pipeline:
 *      a. Load mapping template (field_mappings, dedup_key)
 *      b. For each raw result: resolve source paths → apply transforms → build mapped_data
 *      c. Run GDPR checks on mapped records
 *      d. Upsert into mapped_records (dedup on org_id + dedup_key when available)
 *      e. Update apify_results mapping_status and run counts
 */

const APIFY_API_BASE = 'https://api.apify.com/v2'
const DATASET_PAGE_LIMIT = 1000
const MAPPING_CHUNK_SIZE = 100

interface FieldMapping {
  source: string
  target: string
  transform?: string
  confidence: 'high' | 'medium' | 'low'
}

serve(async (req) => {
  // Allow POST only (Apify sends webhooks as POST)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const payload = await req.json() as Record<string, unknown>

    // Apify webhook payload structure:
    // { eventType, eventData, resource: { id, actId, defaultDatasetId, status, ... }, ... }
    const resource = (payload.resource || {}) as Record<string, unknown>
    const eventType = (payload.eventType as string) || ''
    const apifyRunId = resource.id as string

    console.log(`[apify-run-webhook] Received ${eventType} for run ${apifyRunId}`)

    if (!apifyRunId) {
      console.error('[apify-run-webhook] Missing run ID in webhook payload')
      return new Response(JSON.stringify({ error: 'Missing run ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Service role client — webhook has no user context
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // Look up the run record
    const { data: run, error: runError } = await svc
      .from('apify_runs')
      .select('id, org_id, actor_id, status, mapping_template_id, started_at')
      .eq('apify_run_id', apifyRunId)
      .maybeSingle()

    if (runError || !run) {
      console.error('[apify-run-webhook] Run not found for apify_run_id:', apifyRunId, runError)
      // Return 200 to prevent Apify from retrying for unknown runs
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // --- Handle ACTOR.RUN.RUNNING (progress updates) ---
    if (eventType === 'ACTOR.RUN.RUNNING') {
      const statusMessage = resource.statusMessage as string
      const stats = resource.stats as Record<string, unknown> | undefined

      // Extract progress info if available
      const current = (stats?.outputSeqNo as number) || 0
      const total = (stats?.expectedSeqNo as number) || 100
      const percent = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0

      // Update run status and progress
      await svc
        .from('apify_runs')
        .update({
          status: 'running',
          started_at: run.status !== 'running' ? new Date().toISOString() : undefined,
          progress_percent: percent,
        })
        .eq('id', run.id)

      // Publish progress event
      await publishProgressEvent(svc, run.org_id, {
        type: 'actor_progress',
        actor: run.actor_id,
        percent,
        current,
        total,
      })

      console.log(`[apify-run-webhook] Run ${run.id} progress: ${percent}% (${current}/${total})`)
      return new Response(JSON.stringify({ ok: true, status: 'running', progress: percent }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // --- Handle ACTOR.RUN.FAILED ---
    if (eventType === 'ACTOR.RUN.FAILED') {
      const errorMessage = (resource.statusMessage as string)
        || (payload.eventData as Record<string, unknown>)?.message as string
        || 'Actor run failed'

      await svc
        .from('apify_runs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)

      // Publish failure event
      await publishProgressEvent(svc, run.org_id, {
        type: 'actor_failed',
        actor: run.actor_id,
        error: errorMessage,
      })

      console.log(`[apify-run-webhook] Marked run ${run.id} as failed: ${errorMessage}`)
      return new Response(JSON.stringify({ ok: true, status: 'failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // --- Handle ACTOR.RUN.SUCCEEDED ---
    if (eventType === 'ACTOR.RUN.SUCCEEDED') {
      const runStartTime = run.started_at ? new Date(run.started_at).getTime() : Date.now()
      // Get org's Apify token to fetch dataset
      const { data: creds } = await svc
        .from('integration_credentials')
        .select('credentials')
        .eq('organization_id', run.org_id)
        .eq('provider', 'apify')
        .maybeSingle()

      const apiToken = (creds?.credentials as Record<string, string>)?.api_token
      if (!apiToken) {
        console.error('[apify-run-webhook] No Apify token found for org:', run.org_id)
        await svc
          .from('apify_runs')
          .update({
            status: 'failed',
            error_message: 'Missing Apify token — cannot fetch dataset',
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id)

        return new Response(JSON.stringify({ ok: true, status: 'failed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Get dataset ID from Apify run details
      let datasetId = resource.defaultDatasetId as string

      if (!datasetId) {
        // Fetch run details to get dataset ID
        const runDetailsRes = await fetch(
          `${APIFY_API_BASE}/actor-runs/${apifyRunId}?token=${encodeURIComponent(apiToken)}`
        )
        if (runDetailsRes.ok) {
          const runDetails = await runDetailsRes.json() as Record<string, unknown>
          const detailData = (runDetails.data || runDetails) as Record<string, unknown>
          datasetId = detailData.defaultDatasetId as string
        }
      }

      if (!datasetId) {
        console.error('[apify-run-webhook] No dataset ID found for run:', apifyRunId)
        await svc
          .from('apify_runs')
          .update({
            status: 'failed',
            error_message: 'No dataset ID in run results',
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id)

        return new Response(JSON.stringify({ ok: true, status: 'failed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Fetch dataset items with pagination
      let offset = 0
      let totalRecords = 0
      let hasMore = true
      const allRawItems: Array<{ id: string; raw_data: Record<string, unknown> }> = []

      while (hasMore) {
        const datasetUrl = `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${encodeURIComponent(apiToken)}&limit=${DATASET_PAGE_LIMIT}&offset=${offset}`
        const datasetRes = await fetch(datasetUrl)

        if (!datasetRes.ok) {
          const errText = await datasetRes.text()
          console.error('[apify-run-webhook] Dataset fetch error:', datasetRes.status, errText)
          break
        }

        const items = (await datasetRes.json()) as Record<string, unknown>[]

        if (!items || items.length === 0) {
          hasMore = false
          break
        }

        // Insert raw items into apify_results in batches
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        const rows = items.map((item) => ({
          org_id: run.org_id,
          run_id: run.id,
          raw_data: item,
          mapping_status: 'pending',
          expires_at: expiresAt,
        }))

        // Insert in chunks, returning IDs for mapping pipeline
        const CHUNK_SIZE = 200
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE)
          const { data: inserted, error: insertError } = await svc
            .from('apify_results')
            .insert(chunk)
            .select('id, raw_data')

          if (insertError) {
            console.error(
              `[apify-run-webhook] Results insert error (chunk ${i}/${rows.length}):`,
              insertError
            )
          } else if (inserted) {
            allRawItems.push(
              ...inserted.map((r: { id: string; raw_data: Record<string, unknown> }) => ({
                id: r.id,
                raw_data: r.raw_data,
              }))
            )
          }
        }

        totalRecords += items.length
        offset += items.length

        // Apify returns fewer items than limit when no more data
        if (items.length < DATASET_PAGE_LIMIT) {
          hasMore = false
        }
      }

      // --- Mapping Pipeline ---
      let mappedCount = 0
      let errorCount = 0
      let gdprFlaggedCount = 0

      if (run.mapping_template_id && allRawItems.length > 0) {
        console.log(
          `[apify-run-webhook] Starting mapping pipeline for run ${run.id}, template ${run.mapping_template_id}, ${allRawItems.length} items`
        )

        // Load the mapping template
        const { data: template, error: templateError } = await svc
          .from('mapping_templates')
          .select('id, field_mappings, dedup_key')
          .eq('id', run.mapping_template_id)
          .maybeSingle()

        if (templateError || !template) {
          console.error(
            '[apify-run-webhook] Failed to load mapping template:',
            run.mapping_template_id,
            templateError
          )
        } else {
          const fieldMappings = (template.field_mappings || []) as FieldMapping[]
          const templateDedupKey = template.dedup_key as string | null

          // Process raw items in chunks
          for (let i = 0; i < allRawItems.length; i += MAPPING_CHUNK_SIZE) {
            const chunk = allRawItems.slice(i, i + MAPPING_CHUNK_SIZE)
            const mappedRows: Array<Record<string, unknown>> = []
            const successIds: string[] = []
            const errorIds: Array<{ id: string; error: string }> = []

            for (const item of chunk) {
              try {
                const mappedData: Record<string, unknown> = {}

                // Apply each field mapping
                for (const mapping of fieldMappings) {
                  let value = resolvePath(item.raw_data, mapping.source)

                  // Apply transform if specified
                  if (mapping.transform && value != null) {
                    value = applyTransform(mapping.transform, value)
                  }

                  if (value != null) {
                    mappedData[mapping.target] = value
                  }
                }

                // Skip if no fields were mapped
                if (Object.keys(mappedData).length === 0) {
                  errorIds.push({ id: item.id, error: 'No fields mapped — all source paths returned null' })
                  continue
                }

                // Resolve dedup key from raw data
                let dedupValue: string | null = null
                if (templateDedupKey) {
                  const rawDedup = resolvePath(item.raw_data, templateDedupKey)
                  if (rawDedup != null) {
                    dedupValue = String(rawDedup)
                  }
                }

                // GDPR check on mapped data
                const gdprFlags = gdpr_check_record(mappedData as Record<string, unknown>)
                if (gdprFlags.length > 0) {
                  gdprFlaggedCount++
                }

                // Compute overall confidence from mappings
                const confidences = fieldMappings
                  .filter((m) => mappedData[m.target] != null)
                  .map((m) => m.confidence)
                const overallConfidence =
                  confidences.every((c) => c === 'high') ? 'high'
                  : confidences.some((c) => c === 'low') ? 'low'
                  : 'medium'

                mappedRows.push({
                  org_id: run.org_id,
                  run_id: run.id,
                  template_id: template.id,
                  source_result_id: item.id,
                  mapped_data: mappedData,
                  dedup_key: dedupValue,
                  gdpr_flags: gdprFlags,
                  mapping_confidence: overallConfidence,
                })

                successIds.push(item.id)
              } catch (mapError) {
                console.error(
                  `[apify-run-webhook] Mapping error for result ${item.id}:`,
                  mapError
                )
                errorIds.push({
                  id: item.id,
                  error: (mapError as Error).message || 'Unknown mapping error',
                })
              }
            }

            // Insert mapped records
            let insertSucceeded = false
            if (mappedRows.length > 0) {
              const { error: mapInsertError } = await svc
                .from('mapped_records')
                .insert(mappedRows)

              if (mapInsertError) {
                console.error(
                  `[apify-run-webhook] Mapped records insert error (chunk ${i}):`,
                  mapInsertError
                )
                // Move success IDs to error list
                for (const id of successIds) {
                  errorIds.push({ id, error: mapInsertError.message })
                }
                successIds.length = 0
              } else {
                mappedCount += mappedRows.length
                insertSucceeded = true
              }
            }

            // Update apify_results mapping_status for successes
            if (insertSucceeded && successIds.length > 0) {
              await svc
                .from('apify_results')
                .update({ mapping_status: 'mapped' })
                .in('id', successIds)
            }

            // Update apify_results mapping_status for errors
            if (errorIds.length > 0) {
              errorCount += errorIds.length
              const errIds = errorIds.map((e) => e.id)
              await svc
                .from('apify_results')
                .update({ mapping_status: 'error', mapping_error: errorIds[0]?.error || 'Mapping failed' })
                .in('id', errIds)
            }
          }

          console.log(
            `[apify-run-webhook] Mapping complete for run ${run.id}: ${mappedCount} mapped, ${errorCount} errors, ${gdprFlaggedCount} GDPR-flagged`
          )
        }
      }

      // Update run record with final counts
      const costUsd = (resource.usageTotalUsd as number)
        || (resource.stats as Record<string, unknown>)?.computeUnits as number
        || null

      await svc
        .from('apify_runs')
        .update({
          status: 'complete',
          dataset_id: datasetId,
          total_records: totalRecords,
          mapped_records_count: mappedCount,
          error_records_count: errorCount,
          gdpr_flagged_count: gdprFlaggedCount,
          cost_usd: costUsd,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)

      console.log(
        `[apify-run-webhook] Run ${run.id} complete: ${totalRecords} raw, ${mappedCount} mapped, ${errorCount} errors`
      )

      // Publish completion event
      const durationMs = Date.now() - runStartTime
      await publishProgressEvent(svc, run.org_id, {
        type: 'actor_completed',
        actor: run.actor_id,
        result_count: totalRecords,
        duration_ms: durationMs,
      })

      return new Response(
        JSON.stringify({
          ok: true,
          status: 'complete',
          total_records: totalRecords,
          mapped_records: mappedCount,
          error_records: errorCount,
          gdpr_flagged: gdprFlaggedCount,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Unknown event type — acknowledge without action
    console.log(`[apify-run-webhook] Ignoring event type: ${eventType}`)
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[apify-run-webhook] Error:', error)
    // Return 200 to avoid Apify retries on our internal errors
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
