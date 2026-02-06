// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createConcurrencyLimiter, fetchWithRetry } from '../_shared/rateLimiter.ts'

/**
 * run-reoon-verification — Batch email verification via Reoon API.
 *
 * POST body:
 *  { table_id, column_id, row_ids?: string[] }
 *
 * The integration_config on the column specifies { source_column_key: "email" }
 * which tells us which column holds the email addresses to verify.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 50
const CONCURRENCY = 5

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

    const sourceColumnKey = column.integration_config?.source_column_key as string
    if (!sourceColumnKey) {
      return new Response(
        JSON.stringify({ error: 'No source_column_key in integration_config' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Get org's Reoon API key
    const { data: tableData } = await supabase
      .from('dynamic_tables')
      .select('organization_id')
      .eq('id', table_id)
      .single()

    const { data: creds } = await supabase
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', tableData.organization_id)
      .eq('provider', 'reoon')
      .maybeSingle()

    const apiKey = creds?.credentials?.api_key as string
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Reoon API key not configured. Add it in Settings > Integrations.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Get all columns for key→id mapping
    const { data: allColumns } = await supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table_id)

    const sourceColumnId = allColumns?.find((c: any) => c.key === sourceColumnKey)?.id
    if (!sourceColumnId) {
      return new Response(
        JSON.stringify({ error: `Source column '${sourceColumnKey}' not found` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4. Get rows with email cells
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

    // 5. Mark cells as running
    const rowsWithEmails: { rowId: string; email: string }[] = []
    for (const row of rows ?? []) {
      const emailCell = row.dynamic_table_cells?.find((c: any) => c.column_id === sourceColumnId)
      if (emailCell?.value) {
        rowsWithEmails.push({ rowId: row.id, email: emailCell.value })
      }
    }

    // Mark all as running
    for (const { rowId } of rowsWithEmails) {
      await supabase
        .from('dynamic_table_cells')
        .upsert(
          { row_id: rowId, column_id: column_id, value: 'verifying...', status: 'pending', source: 'reoon' },
          { onConflict: 'row_id,column_id' },
        )
    }

    // 6. Verify emails with concurrency limiter
    const limiter = createConcurrencyLimiter(CONCURRENCY)
    const results = { verified: 0, invalid: 0, risky: 0, failed: 0 }

    await Promise.allSettled(
      rowsWithEmails.map(({ rowId, email }) =>
        limiter(async () => {
          try {
            const response = await fetchWithRetry(
              `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${apiKey}&mode=quick`,
              { method: 'GET' },
              { maxRetries: 2, baseDelayMs: 1000, logPrefix: '[reoon]' },
            )

            const result = await response.json()
            const status = result.status ?? 'unknown' // valid, invalid, risky, catch-all, unknown

            const displayValue = status === 'valid' ? 'Valid'
              : status === 'invalid' ? 'Invalid'
              : status === 'risky' ? 'Risky'
              : status === 'catch_all' ? 'Catch-all'
              : 'Unknown'

            if (status === 'valid') results.verified++
            else if (status === 'invalid') results.invalid++
            else results.risky++

            await supabase
              .from('dynamic_table_cells')
              .upsert(
                { row_id: rowId, column_id: column_id, value: displayValue, status: 'complete', source: 'reoon', confidence: 1.0 },
                { onConflict: 'row_id,column_id' },
              )
          } catch (error) {
            results.failed++
            await supabase
              .from('dynamic_table_cells')
              .upsert(
                { row_id: rowId, column_id: column_id, value: 'Error', status: 'failed', source: 'reoon', error_message: String(error) },
                { onConflict: 'row_id,column_id' },
              )
          }
        }),
      ),
    )

    return new Response(
      JSON.stringify({
        processed: rowsWithEmails.length,
        ...results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[run-reoon-verification] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
