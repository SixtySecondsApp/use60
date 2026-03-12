import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Analytics Cron
//
// Scheduled to run at 6:00 AM UTC daily via pg_cron.
// Queries all dynamic_tables that have columns with column_type = 'linkedin_analytics'
// and refresh_schedule in ('daily', 'both'), then calls the linkedin-analytics-to-ops
// edge function for each table.
//
// Auth: Accepts either
//   - Bearer <service_role_key> in Authorization header (pg_net calls)
//   - X-Cron-Secret: <CRON_SECRET> header (external cron triggers)
//
// POST body: {} (no body required for scheduled runs)
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[linkedin-analytics-cron]'

// How long to wait between table syncs (ms) to avoid LinkedIn API rate limits
const TABLE_DELAY_MS = 2000

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Server misconfigured', req, 500)
  }

  // ---------------------------------------------------------------------------
  // Auth — accept service role key OR CRON_SECRET
  // ---------------------------------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const cronSecretHeader = req.headers.get('X-Cron-Secret') ?? ''

  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`
  const isCronSecret = cronSecret && cronSecretHeader === cronSecret

  if (!isServiceRole && !isCronSecret) {
    console.warn(`${LOG_PREFIX} Unauthorized request — missing valid auth`)
    return errorResponse('Unauthorized', req, 401)
  }

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const startedAt = Date.now()
  console.log(`${LOG_PREFIX} Starting daily analytics sync`)

  try {
    // -------------------------------------------------------------------------
    // 1. Find all dynamic_table_columns with column_type = 'linkedin_analytics'
    //    and refresh_schedule in ('daily', 'both')
    //    Join to dynamic_tables to get the table IDs (distinct list)
    // -------------------------------------------------------------------------
    const { data: analyticsColumns, error: colError } = await svc
      .from('dynamic_table_columns')
      .select('table_id, integration_config')
      .eq('column_type', 'linkedin_analytics')

    if (colError) {
      console.error(`${LOG_PREFIX} Failed to query analytics columns: ${colError.message}`)
      return errorResponse(`Failed to query analytics columns: ${colError.message}`, req, 500)
    }

    if (!analyticsColumns || analyticsColumns.length === 0) {
      console.log(`${LOG_PREFIX} No linkedin_analytics columns found — nothing to sync`)
      return jsonResponse({ tables_processed: 0, cells_synced: 0, errors: [] }, req)
    }

    // Collect distinct table IDs that have at least one column with refresh_schedule in (daily, both)
    const tableIdSet = new Set<string>()
    for (const col of analyticsColumns) {
      const config = (col.integration_config ?? {}) as Record<string, unknown>
      const schedule = config['refresh_schedule'] as string | undefined
      if (schedule === 'daily' || schedule === 'both') {
        tableIdSet.add(col.table_id)
      }
    }

    const tableIds = [...tableIdSet]
    console.log(`${LOG_PREFIX} Found ${tableIds.length} table(s) eligible for daily sync`)

    if (tableIds.length === 0) {
      return jsonResponse({ tables_processed: 0, cells_synced: 0, errors: [] }, req)
    }

    // -------------------------------------------------------------------------
    // 2. Sync each table sequentially — call linkedin-analytics-to-ops for each
    // -------------------------------------------------------------------------
    let tablesProcessed = 0
    let totalCellsSynced = 0
    const errors: Array<{ table_id: string; error: string }> = []

    for (const tableId of tableIds) {
      console.log(`${LOG_PREFIX} Syncing table ${tableId}`)

      try {
        const syncResp = await fetch(
          `${supabaseUrl}/functions/v1/linkedin-analytics-to-ops`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
              // Bypass user-auth check: the sync function checks JWT normally,
              // but we pass the service role key — it will authenticate as service.
              'X-Internal-Call': 'linkedin-analytics-cron',
            },
            body: JSON.stringify({ table_id: tableId }),
          },
        )

        if (!syncResp.ok) {
          const errText = await syncResp.text()
          const msg = `HTTP ${syncResp.status}: ${errText.slice(0, 200)}`
          console.error(`${LOG_PREFIX} Table ${tableId} sync failed: ${msg}`)
          errors.push({ table_id: tableId, error: msg })
          continue
        }

        const result = await syncResp.json() as {
          synced_columns?: number
          synced_cells?: number
          errors?: Array<{ column_id: string; error: string }>
        }

        const cellsSynced = result.synced_cells ?? 0
        totalCellsSynced += cellsSynced
        tablesProcessed++

        if (result.errors && result.errors.length > 0) {
          for (const colErr of result.errors) {
            errors.push({ table_id: tableId, error: `column ${colErr.column_id}: ${colErr.error}` })
          }
        }

        console.log(
          `${LOG_PREFIX} Table ${tableId}: ` +
          `${result.synced_columns ?? 0} columns, ` +
          `${cellsSynced} cells synced`,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`${LOG_PREFIX} Table ${tableId} unexpected error: ${msg}`)
        errors.push({ table_id: tableId, error: msg })
      }

      // Brief delay between tables to avoid hammering the LinkedIn API
      if (tableIds.indexOf(tableId) < tableIds.length - 1) {
        await new Promise((r) => setTimeout(r, TABLE_DELAY_MS))
      }
    }

    const durationMs = Date.now() - startedAt
    console.log(
      `${LOG_PREFIX} Done. ` +
      `${tablesProcessed}/${tableIds.length} tables processed, ` +
      `${totalCellsSynced} cells synced, ` +
      `${errors.length} errors, ` +
      `${durationMs}ms elapsed`,
    )

    return jsonResponse(
      {
        tables_processed: tablesProcessed,
        tables_attempted: tableIds.length,
        cells_synced: totalCellsSynced,
        duration_ms: durationMs,
        errors,
      },
      req,
    )
  } catch (err) {
    console.error(`${LOG_PREFIX} Unhandled error:`, err)
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    )
  }
})
