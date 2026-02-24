// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createConcurrencyLimiter, fetchWithRetry } from '../_shared/rateLimiter.ts'

/**
 * run-apify-actor — Trigger Apify actor runs for rows in a dynamic table.
 *
 * POST body:
 *  { table_id, column_id, row_ids?: string[] }
 *
 * integration_config: {
 *   actor_id: "apify/web-scraper",
 *   input_template: { url: "@website_url", query: "@company_name" },
 *   result_path: "output[0].text"  // JSON path to extract from result
 * }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 20
const CONCURRENCY = 3

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { table_id, column_id, row_ids } = await req.json()

    if (!table_id || !column_id) {
      return new Response(
        JSON.stringify({ error: 'table_id and column_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Get column config
    const { data: column, error: colError } = await supabase
      .from('dynamic_table_columns')
      .select('id, integration_type, integration_config, table_id')
      .eq('id', column_id)
      .single()

    if (colError || !column) {
      return new Response(
        JSON.stringify({ error: 'Column not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const config = column.integration_config ?? {}
    const actorId = config.actor_id as string
    const inputTemplate = config.input_template as Record<string, string> ?? {}
    const resultPath = config.result_path as string ?? ''

    if (!actorId) {
      return new Response(
        JSON.stringify({ error: 'No actor_id in integration_config' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Get Apify API key
    const { data: tableData } = await supabase
      .from('dynamic_tables')
      .select('organization_id')
      .eq('id', table_id)
      .single()

    const { data: creds } = await supabase
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', tableData.organization_id)
      .eq('provider', 'apify')
      .maybeSingle()

    const apiToken = creds?.credentials?.api_token as string
    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: 'Apify API token not configured. Add it in Settings > Integrations.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Get columns for @key resolution
    const { data: allColumns } = await supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table_id)

    const columnIdToKey = new Map<string, string>()
    for (const col of allColumns ?? []) {
      columnIdToKey.set(col.id, col.key)
    }

    // 4. Get rows
    let rowQuery = supabase
      .from('dynamic_table_rows')
      .select('id, dynamic_table_cells(id, column_id, value)')
      .eq('table_id', table_id)
      .order('row_index', { ascending: true })
      .limit(BATCH_SIZE)

    if (row_ids?.length > 0) {
      rowQuery = rowQuery.in('id', row_ids)
    }

    const { data: rows, error: rowError } = await rowQuery
    if (rowError) throw rowError

    // 5. Mark as running
    for (const row of rows ?? []) {
      await supabase
        .from('dynamic_table_cells')
        .upsert(
          { row_id: row.id, column_id: column_id, value: 'Running...', status: 'pending', source: 'apify' },
          { onConflict: 'row_id,column_id' },
        )
    }

    // 6. Run actors with concurrency limiter
    const limiter = createConcurrencyLimiter(CONCURRENCY)
    const results = { complete: 0, failed: 0 }

    await Promise.allSettled(
      (rows ?? []).map((row: any) =>
        limiter(async () => {
          try {
            // Build cell values map
            const cellValues = new Map<string, string>()
            for (const cell of row.dynamic_table_cells ?? []) {
              const key = columnIdToKey.get(cell.column_id)
              if (key) cellValues.set(key, cell.value ?? '')
            }

            // Resolve @column_key references in input template
            const resolvedInput: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(inputTemplate)) {
              if (typeof value === 'string' && value.startsWith('@')) {
                const colKey = value.slice(1)
                resolvedInput[key] = cellValues.get(colKey) ?? ''
              } else {
                resolvedInput[key] = value
              }
            }

            // Call Apify API — synchronous run (waits for completion)
            const response = await fetchWithRetry(
              `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}&timeout=60`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(resolvedInput),
              },
              { maxRetries: 1, baseDelayMs: 2000, logPrefix: '[apify]' },
            )

            const data = await response.json()

            // Extract result using result_path
            let resultValue = JSON.stringify(data)
            if (resultPath && Array.isArray(data)) {
              // Simple path resolution: "output[0].text" → data[0]?.text
              try {
                const parts = resultPath.split('.')
                let current: any = { output: data }
                for (const part of parts) {
                  const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/)
                  if (arrayMatch) {
                    current = current[arrayMatch[1]][parseInt(arrayMatch[2])]
                  } else {
                    current = current[part]
                  }
                }
                resultValue = typeof current === 'string' ? current : JSON.stringify(current)
              } catch {
                // Fall back to full JSON
              }
            }

            // Truncate if too long
            if (resultValue.length > 500) {
              resultValue = resultValue.slice(0, 497) + '...'
            }

            results.complete++
            await supabase
              .from('dynamic_table_cells')
              .upsert(
                { row_id: row.id, column_id: column_id, value: resultValue, status: 'complete', source: 'apify', confidence: 1.0 },
                { onConflict: 'row_id,column_id' },
              )
          } catch (error: any) {
            results.failed++
            await supabase
              .from('dynamic_table_cells')
              .upsert(
                { row_id: row.id, column_id: column_id, value: 'Error', status: 'failed', source: 'apify', error_message: String(error) },
                { onConflict: 'row_id,column_id' },
              )
          }
        }),
      ),
    )

    return new Response(
      JSON.stringify({
        processed: (rows ?? []).length,
        ...results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[run-apify-actor] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
