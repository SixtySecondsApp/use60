import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const JSON_HEADERS = {
  ...corsHeaders,
  'Content-Type': 'application/json',
}

const LOG_PREFIX = '[enrich-dynamic-table]'

// Timeout for a single row enrichment (30 seconds)
const ROW_TIMEOUT_MS = 30_000

interface EnrichRequest {
  table_id: string
  column_id: string
  row_ids?: string[]
}

interface JobSummary {
  job_id: string
  status: 'complete' | 'failed'
  total_rows: number
  processed_rows: number
  failed_rows: number
}

/**
 * Determine confidence score based on the AI response content.
 *
 * - Contains "N/A", "unknown", "unclear", "not available", "cannot determine" → 0.3
 * - Short, definitive answer (≤ 120 chars, no hedging language) → 0.9
 * - Otherwise → 0.7
 */
function scoreConfidence(text: string): number {
  const lower = text.toLowerCase().trim()

  const uncertainPatterns = [
    'n/a',
    'unknown',
    'unclear',
    'not available',
    'cannot determine',
    'unable to determine',
    'no information',
    'not enough information',
    'i don\'t know',
    'i cannot',
    'insufficient data',
  ]

  for (const pattern of uncertainPatterns) {
    if (lower.includes(pattern)) {
      return 0.3
    }
  }

  const hedgingPatterns = [
    'might be',
    'could be',
    'possibly',
    'perhaps',
    'it seems',
    'likely',
    'probably',
    'i think',
    'may be',
    'not certain',
    'not sure',
  ]

  const hasHedging = hedgingPatterns.some((p) => lower.includes(p))

  if (!hasHedging && text.trim().length <= 120) {
    return 0.9
  }

  return 0.7
}

/**
 * Call Claude API with a timeout. Returns the text content or throws on error/timeout.
 */
async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ROW_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Claude API error ${response.status}: ${errorBody}`)
    }

    const data = await response.json()
    const textBlock = data.content?.find(
      (block: { type: string; text?: string }) => block.type === 'text'
    )

    if (!textBlock?.text) {
      throw new Error('No text content in Claude response')
    }

    return textBlock.text.trim()
  } finally {
    clearTimeout(timeout)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // -----------------------------------------------------------------
    // 1. Authenticate user
    // -----------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: JSON_HEADERS }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    if (!anthropicApiKey) {
      console.error(`${LOG_PREFIX} ANTHROPIC_API_KEY not configured`)
      return new Response(
        JSON.stringify({ error: 'AI enrichment is not configured' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    // User-scoped client for auth verification only
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()

    if (authError || !user) {
      console.error(`${LOG_PREFIX} Auth error:`, authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: JSON_HEADERS }
      )
    }

    // Service role client for all DB writes
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    // -----------------------------------------------------------------
    // 2. Parse and validate request
    // -----------------------------------------------------------------
    const body = (await req.json()) as EnrichRequest

    if (!body.table_id || !body.column_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: table_id, column_id' }),
        { status: 400, headers: JSON_HEADERS }
      )
    }

    const { table_id, column_id, row_ids } = body

    // Verify the table exists and user has access (use user client for RLS check)
    const { data: table, error: tableError } = await userClient
      .from('dynamic_tables')
      .select('id, organization_id, created_by')
      .eq('id', table_id)
      .maybeSingle()

    if (tableError || !table) {
      console.error(`${LOG_PREFIX} Table not found or access denied:`, tableError?.message)
      return new Response(
        JSON.stringify({ error: 'Table not found or access denied' }),
        { status: 404, headers: JSON_HEADERS }
      )
    }

    // Verify the column exists, belongs to this table, and is an enrichment column
    const { data: column, error: columnError } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key, label, is_enrichment, enrichment_prompt')
      .eq('id', column_id)
      .eq('table_id', table_id)
      .maybeSingle()

    if (columnError || !column) {
      console.error(`${LOG_PREFIX} Column not found:`, columnError?.message)
      return new Response(
        JSON.stringify({ error: 'Column not found for this table' }),
        { status: 404, headers: JSON_HEADERS }
      )
    }

    if (!column.is_enrichment) {
      return new Response(
        JSON.stringify({ error: 'Column is not an enrichment column' }),
        { status: 400, headers: JSON_HEADERS }
      )
    }

    const enrichmentPrompt = column.enrichment_prompt
    if (!enrichmentPrompt) {
      return new Response(
        JSON.stringify({ error: 'Column has no enrichment prompt configured' }),
        { status: 400, headers: JSON_HEADERS }
      )
    }

    // -----------------------------------------------------------------
    // 3. Fetch rows to enrich
    // -----------------------------------------------------------------
    let rowsQuery = serviceClient
      .from('dynamic_table_rows')
      .select('id, row_index')
      .eq('table_id', table_id)
      .order('row_index', { ascending: true })

    if (row_ids && row_ids.length > 0) {
      rowsQuery = rowsQuery.in('id', row_ids)
    }

    const { data: rows, error: rowsError } = await rowsQuery

    if (rowsError || !rows || rows.length === 0) {
      console.error(`${LOG_PREFIX} No rows found:`, rowsError?.message)
      return new Response(
        JSON.stringify({ error: 'No rows found to enrich' }),
        { status: 404, headers: JSON_HEADERS }
      )
    }

    console.log(`${LOG_PREFIX} Found ${rows.length} rows to enrich for column "${column.label}"`)

    // -----------------------------------------------------------------
    // 4. Fetch all columns for this table (to build row context)
    // -----------------------------------------------------------------
    const { data: allColumns, error: allColumnsError } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key, label')
      .eq('table_id', table_id)
      .order('position', { ascending: true })

    if (allColumnsError || !allColumns) {
      console.error(`${LOG_PREFIX} Failed to fetch columns:`, allColumnsError?.message)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch table columns' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    // Build column ID → key/label maps
    const columnIdToKey: Record<string, string> = {}
    const columnIdToLabel: Record<string, string> = {}
    for (const col of allColumns) {
      columnIdToKey[col.id] = col.key
      columnIdToLabel[col.id] = col.label
    }

    // -----------------------------------------------------------------
    // 5. Fetch existing cells for all rows (to build context per row)
    // -----------------------------------------------------------------
    const rowIdList = rows.map((r) => r.id)

    const { data: existingCells, error: cellsError } = await serviceClient
      .from('dynamic_table_cells')
      .select('row_id, column_id, value')
      .in('row_id', rowIdList)

    if (cellsError) {
      console.error(`${LOG_PREFIX} Failed to fetch existing cells:`, cellsError.message)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch existing cell data' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    // Build a map: row_id → { column_key: value, ... }
    const rowContextMap: Record<string, Record<string, string>> = {}
    for (const cell of existingCells || []) {
      const key = columnIdToKey[cell.column_id]
      if (!key) continue
      if (!rowContextMap[cell.row_id]) {
        rowContextMap[cell.row_id] = {}
      }
      if (cell.value != null) {
        rowContextMap[cell.row_id][key] = cell.value
      }
    }

    // -----------------------------------------------------------------
    // 6. Create enrichment job
    // -----------------------------------------------------------------
    const { data: job, error: jobError } = await serviceClient
      .from('enrichment_jobs')
      .insert({
        table_id,
        column_id,
        created_by: user.id,
        status: 'running',
        total_rows: rows.length,
        processed_rows: 0,
        failed_rows: 0,
        enrichment_prompt: enrichmentPrompt,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (jobError || !job) {
      console.error(`${LOG_PREFIX} Failed to create enrichment job:`, jobError?.message)
      return new Response(
        JSON.stringify({ error: 'Failed to create enrichment job' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    const jobId = job.id
    console.log(`${LOG_PREFIX} Created enrichment job: ${jobId}`)

    // -----------------------------------------------------------------
    // 7. Process rows sequentially
    // -----------------------------------------------------------------
    let processedRows = 0
    let failedRows = 0

    for (const row of rows) {
      const rowContext = rowContextMap[row.id] || {}

      try {
        // Build the prompt
        const prompt = `You are a data enrichment agent. Given the following information about a person/company, complete the requested enrichment task.

PERSON/COMPANY DATA:
${JSON.stringify(rowContext, null, 2)}

ENRICHMENT TASK:
${enrichmentPrompt}

Respond with ONLY the enrichment result. Be concise and factual. If you cannot determine the answer with confidence, respond with "N/A".`

        // Call Claude
        const result = await callClaude(prompt, anthropicApiKey)
        const confidence = scoreConfidence(result)

        // Upsert cell with result
        const { error: upsertError } = await serviceClient
          .from('dynamic_table_cells')
          .upsert(
            {
              row_id: row.id,
              column_id,
              value: result,
              confidence,
              source: 'ai_enrichment',
              status: 'complete',
              error_message: null,
            },
            { onConflict: 'row_id,column_id' }
          )

        if (upsertError) {
          console.error(`${LOG_PREFIX} Cell upsert error for row ${row.id}:`, upsertError.message)
          throw new Error(`Cell upsert failed: ${upsertError.message}`)
        }

        // Insert job result
        await serviceClient.from('enrichment_job_results').insert({
          job_id: jobId,
          row_id: row.id,
          result,
          confidence,
          source: 'ai_enrichment',
        })

        processedRows++
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        const isTimeout =
          error instanceof DOMException && error.name === 'AbortError'
        const displayError = isTimeout
          ? 'Enrichment timed out (>30s)'
          : errorMessage

        console.error(
          `${LOG_PREFIX} Row ${row.id} failed:`,
          displayError
        )

        // Mark cell as failed
        await serviceClient
          .from('dynamic_table_cells')
          .upsert(
            {
              row_id: row.id,
              column_id,
              value: null,
              confidence: null,
              source: 'ai_enrichment',
              status: 'failed',
              error_message: displayError,
            },
            { onConflict: 'row_id,column_id' }
          )
          .then(({ error: cellErr }) => {
            if (cellErr) {
              console.error(
                `${LOG_PREFIX} Failed to mark cell as failed for row ${row.id}:`,
                cellErr.message
              )
            }
          })

        // Insert job result with error
        await serviceClient.from('enrichment_job_results').insert({
          job_id: jobId,
          row_id: row.id,
          result: null,
          confidence: null,
          source: 'ai_enrichment',
          error: displayError,
        })

        failedRows++
      }

      // Update job progress after each row
      await serviceClient
        .from('enrichment_jobs')
        .update({
          processed_rows: processedRows,
          failed_rows: failedRows,
        })
        .eq('id', jobId)
    }

    // -----------------------------------------------------------------
    // 8. Complete the job
    // -----------------------------------------------------------------
    const finalStatus = failedRows === rows.length ? 'failed' : 'complete'

    await serviceClient
      .from('enrichment_jobs')
      .update({
        status: finalStatus,
        processed_rows: processedRows,
        failed_rows: failedRows,
        completed_at: new Date().toISOString(),
        error_message:
          failedRows === rows.length
            ? 'All rows failed enrichment'
            : null,
      })
      .eq('id', jobId)

    console.log(
      `${LOG_PREFIX} Job ${jobId} ${finalStatus}: ${processedRows} processed, ${failedRows} failed out of ${rows.length} total`
    )

    // -----------------------------------------------------------------
    // 9. Return job summary
    // -----------------------------------------------------------------
    const summary: JobSummary = {
      job_id: jobId,
      status: finalStatus,
      total_rows: rows.length,
      processed_rows: processedRows,
      failed_rows: failedRows,
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: JSON_HEADERS,
    })
  } catch (error) {
    console.error(`${LOG_PREFIX} Unexpected error:`, error)
    return new Response(
      JSON.stringify({
        error: (error as Error).message || 'Internal server error',
      }),
      { status: 500, headers: JSON_HEADERS }
    )
  }
})
