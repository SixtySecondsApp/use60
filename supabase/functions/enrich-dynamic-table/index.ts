import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { fetchWithRetry } from '../_shared/rateLimiter.ts'

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

/**
 * Resolve @column_key references in an enrichment prompt using row data.
 * e.g. "Find news about @company_name" → "Find news about Acme Corp"
 */
function resolveColumnMentions(
  prompt: string,
  rowContext: Record<string, string>
): string {
  return prompt.replace(/@([a-z][a-z0-9_]*)/g, (_match, key) => {
    return rowContext[key] ?? 'N/A'
  })
}

// Maximum rows per invocation to stay within Supabase edge function wall-clock limit (150s)
const BATCH_SIZE = 50

interface EnrichRequest {
  table_id: string
  column_id: string
  row_ids?: string[]
  /** Resume an existing job from where it left off */
  resume_job_id?: string
}

interface JobSummary {
  job_id: string
  status: 'complete' | 'failed' | 'running'
  total_rows: number
  processed_rows: number
  failed_rows: number
  /** True if more rows remain to be processed */
  has_more: boolean
  /** The row_index of the last processed row — used for batch resumption */
  last_processed_row_index: number
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
 * Call Claude API directly (fallback when no OpenRouter model specified).
 * Returns the text content or throws on error/timeout.
 */
async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ROW_TIMEOUT_MS)

  try {
    const response = await fetchWithRetry(
      'https://api.anthropic.com/v1/messages',
      {
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
      },
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        signal: controller.signal,
        logPrefix: LOG_PREFIX,
      }
    )

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

/**
 * Call OpenRouter API with a specified model.
 * OpenRouter uses OpenAI-compatible API format.
 */
async function callOpenRouter(prompt: string, apiKey: string, modelId: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ROW_TIMEOUT_MS)

  try {
    const response = await fetchWithRetry(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://app.use60.com',
          'X-Title': 'use60 Sales Intelligence',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        signal: controller.signal,
        logPrefix: LOG_PREFIX,
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('No content in OpenRouter response')
    }

    return content.trim()
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
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''

    // At least one AI provider must be configured
    if (!anthropicApiKey && !openrouterApiKey) {
      console.error(`${LOG_PREFIX} No AI provider configured (ANTHROPIC_API_KEY or OPENROUTER_API_KEY)`)
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

    const { table_id, column_id, row_ids, resume_job_id } = body

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
      .select('id, key, label, is_enrichment, enrichment_prompt, enrichment_model')
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

    // Determine which AI provider to use
    const enrichmentModel = column.enrichment_model as string | null
    const useOpenRouter = enrichmentModel && openrouterApiKey

    // Validate we have the required API key for the selected provider
    if (useOpenRouter && !openrouterApiKey) {
      console.error(`${LOG_PREFIX} OpenRouter model specified but OPENROUTER_API_KEY not configured`)
      return new Response(
        JSON.stringify({ error: 'OpenRouter is not configured' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }
    if (!useOpenRouter && !anthropicApiKey) {
      console.error(`${LOG_PREFIX} No model specified and ANTHROPIC_API_KEY not configured`)
      return new Response(
        JSON.stringify({ error: 'Default AI provider (Anthropic) is not configured' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    console.log(`${LOG_PREFIX} Using AI provider: ${useOpenRouter ? `OpenRouter (${enrichmentModel})` : 'Anthropic Claude'}`)

    // -----------------------------------------------------------------
    // 3. Fetch rows to enrich (with batch limits)
    // -----------------------------------------------------------------

    // If resuming, fetch the existing job to get the last processed position
    let resumeFromIndex = 0
    let existingJobProcessed = 0
    let existingJobFailed = 0

    if (resume_job_id) {
      const { data: existingJob, error: jobFetchError } = await serviceClient
        .from('enrichment_jobs')
        .select('id, last_processed_row_index, processed_rows, failed_rows, total_rows, status')
        .eq('id', resume_job_id)
        .maybeSingle()

      if (jobFetchError || !existingJob) {
        console.error(`${LOG_PREFIX} Failed to fetch resume job:`, jobFetchError?.message)
        return new Response(
          JSON.stringify({ error: 'Resume job not found' }),
          { status: 404, headers: JSON_HEADERS }
        )
      }

      if (existingJob.status !== 'running') {
        return new Response(
          JSON.stringify({ error: `Cannot resume job with status: ${existingJob.status}` }),
          { status: 400, headers: JSON_HEADERS }
        )
      }

      resumeFromIndex = existingJob.last_processed_row_index ?? 0
      existingJobProcessed = existingJob.processed_rows ?? 0
      existingJobFailed = existingJob.failed_rows ?? 0
      console.log(`${LOG_PREFIX} Resuming job ${resume_job_id} from row_index > ${resumeFromIndex}`)
    }

    // Fetch rows — either specific row_ids or next batch by row_index
    let rowsQuery = serviceClient
      .from('dynamic_table_rows')
      .select('id, row_index')
      .eq('table_id', table_id)
      .order('row_index', { ascending: true })

    if (row_ids && row_ids.length > 0) {
      rowsQuery = rowsQuery.in('id', row_ids)
    }

    if (resumeFromIndex > 0) {
      rowsQuery = rowsQuery.gt('row_index', resumeFromIndex)
    }

    // Limit to BATCH_SIZE rows per invocation
    rowsQuery = rowsQuery.limit(BATCH_SIZE)

    const { data: rows, error: rowsError } = await rowsQuery

    if (rowsError || !rows || rows.length === 0) {
      // If resuming and no more rows, the job is complete
      if (resume_job_id) {
        const finalStatus = existingJobFailed > 0 && existingJobProcessed === 0 ? 'failed' : 'complete'
        await serviceClient
          .from('enrichment_jobs')
          .update({
            status: finalStatus,
            completed_at: new Date().toISOString(),
          })
          .eq('id', resume_job_id)

        const summary: JobSummary = {
          job_id: resume_job_id,
          status: finalStatus,
          total_rows: existingJobProcessed + existingJobFailed,
          processed_rows: existingJobProcessed,
          failed_rows: existingJobFailed,
          has_more: false,
          last_processed_row_index: resumeFromIndex,
        }
        return new Response(JSON.stringify(summary), { status: 200, headers: JSON_HEADERS })
      }

      console.error(`${LOG_PREFIX} No rows found:`, rowsError?.message)
      return new Response(
        JSON.stringify({ error: 'No rows found to enrich' }),
        { status: 404, headers: JSON_HEADERS }
      )
    }

    // Count total remaining rows (for progress tracking on new jobs)
    let totalRowCount = rows.length
    if (!resume_job_id && !row_ids) {
      const { count } = await serviceClient
        .from('dynamic_table_rows')
        .select('id', { count: 'exact', head: true })
        .eq('table_id', table_id)

      totalRowCount = count ?? rows.length
    } else if (row_ids && row_ids.length > 0) {
      totalRowCount = row_ids.length
    }

    console.log(`${LOG_PREFIX} Processing batch of ${rows.length} rows (total: ${totalRowCount}) for column "${column.label}"`)

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
    // 6. Create or resume enrichment job
    // -----------------------------------------------------------------
    let jobId: string

    if (resume_job_id) {
      jobId = resume_job_id
      console.log(`${LOG_PREFIX} Resuming enrichment job: ${jobId}`)
    } else {
      const { data: job, error: jobError } = await serviceClient
        .from('enrichment_jobs')
        .insert({
          table_id,
          column_id,
          created_by: user.id,
          status: 'running',
          total_rows: totalRowCount,
          processed_rows: 0,
          failed_rows: 0,
          enrichment_prompt: enrichmentPrompt,
          started_at: new Date().toISOString(),
          batch_size: BATCH_SIZE,
          last_processed_row_index: 0,
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

      jobId = job.id
      console.log(`${LOG_PREFIX} Created enrichment job: ${jobId}`)
    }

    // -----------------------------------------------------------------
    // 6b. Mark all batch cells as 'pending' for instant UI feedback
    // -----------------------------------------------------------------
    const pendingUpserts = rows.map((row) => ({
      row_id: row.id,
      column_id,
      value: null,
      confidence: null,
      status: 'pending',
      source: 'ai_enrichment',
      error_message: null,
      metadata: null,
    }))

    for (let i = 0; i < pendingUpserts.length; i += 500) {
      const chunk = pendingUpserts.slice(i, i + 500)
      const { error: pendingError } = await serviceClient
        .from('dynamic_table_cells')
        .upsert(chunk, { onConflict: 'row_id,column_id' })
      if (pendingError) {
        console.error(`${LOG_PREFIX} Failed to mark cells as pending:`, pendingError.message)
      }
    }

    console.log(`${LOG_PREFIX} Marked ${pendingUpserts.length} cells as pending`)

    // -----------------------------------------------------------------
    // 7. Process rows sequentially (this batch only)
    // -----------------------------------------------------------------
    let processedRows = existingJobProcessed
    let failedRows = existingJobFailed
    let lastRowIndex = resumeFromIndex

    for (const row of rows) {
      const rowContext = rowContextMap[row.id] || {}

      try {
        // Resolve @column_key references in the prompt with actual row values
        const resolvedPrompt = resolveColumnMentions(enrichmentPrompt, rowContext)

        // Build the prompt
        const prompt = `You are a data enrichment agent. Given the following information about a person/company, complete the requested enrichment task.

PERSON/COMPANY DATA:
${JSON.stringify(rowContext, null, 2)}

ENRICHMENT TASK:
${resolvedPrompt}

RESPONSE FORMAT:
Respond with a JSON object containing two fields:
- "answer": Your concise, factual enrichment result (string). If you cannot determine the answer, use "N/A".
- "sources": An array of sources you used. Each source is an object with "title" (short description) and optionally "url" (if a specific web URL is known). If no sources, use an empty array.

Example: {"answer": "Series B, raised $50M in Jan 2025", "sources": [{"title": "TechCrunch article on funding round", "url": "https://example.com/article"}]}

Respond with ONLY the JSON object, no markdown or extra text.`

        // Call AI provider (OpenRouter if model specified, otherwise Claude)
        const rawResult = useOpenRouter
          ? await callOpenRouter(prompt, openrouterApiKey, enrichmentModel!)
          : await callClaude(prompt, anthropicApiKey)

        // Parse structured response (answer + sources)
        let answer = rawResult
        let sources: { title?: string; url?: string }[] = []
        try {
          // Strip markdown code fences if present
          const cleaned = rawResult.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
          const parsed = JSON.parse(cleaned)
          if (parsed && typeof parsed.answer === 'string') {
            answer = parsed.answer
            sources = Array.isArray(parsed.sources) ? parsed.sources : []
          }
        } catch {
          // AI returned plain text — use as-is, no sources
        }

        const confidence = scoreConfidence(answer)
        const cellMetadata = sources.length > 0 ? { sources } : null

        // Upsert cell with result (sources in metadata, not in value)
        const { error: upsertError } = await serviceClient
          .from('dynamic_table_cells')
          .upsert(
            {
              row_id: row.id,
              column_id,
              value: answer,
              confidence,
              source: 'ai_enrichment',
              status: 'complete',
              error_message: null,
              metadata: cellMetadata,
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
          result: answer,
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

      // Track last processed row_index for checkpoint
      lastRowIndex = row.row_index

      // Update job progress after each row (checkpoint)
      await serviceClient
        .from('enrichment_jobs')
        .update({
          processed_rows: processedRows,
          failed_rows: failedRows,
          last_processed_row_index: lastRowIndex,
        })
        .eq('id', jobId)
    }

    // -----------------------------------------------------------------
    // 8. Determine if more rows remain
    // -----------------------------------------------------------------
    // Check if there are rows after the last one we processed
    const { count: remainingCount } = await serviceClient
      .from('dynamic_table_rows')
      .select('id', { count: 'exact', head: true })
      .eq('table_id', table_id)
      .gt('row_index', lastRowIndex)

    const hasMore = (remainingCount ?? 0) > 0 && !row_ids

    // If no more rows (or specific row_ids were given), mark job complete
    if (!hasMore) {
      const allFailed = processedRows === 0 && failedRows > 0
      const finalStatus = allFailed ? 'failed' : 'complete'

      await serviceClient
        .from('enrichment_jobs')
        .update({
          status: finalStatus,
          processed_rows: processedRows,
          failed_rows: failedRows,
          last_processed_row_index: lastRowIndex,
          completed_at: new Date().toISOString(),
          error_message: allFailed ? 'All rows failed enrichment' : null,
        })
        .eq('id', jobId)

      console.log(
        `${LOG_PREFIX} Job ${jobId} ${finalStatus}: ${processedRows} processed, ${failedRows} failed`
      )
    } else {
      console.log(
        `${LOG_PREFIX} Job ${jobId} batch complete: ${processedRows} processed, ${failedRows} failed, more rows remain`
      )
    }

    // -----------------------------------------------------------------
    // 9. Return job summary
    // -----------------------------------------------------------------
    const summary: JobSummary = {
      job_id: jobId,
      status: hasMore ? 'running' : (processedRows === 0 && failedRows > 0 ? 'failed' : 'complete'),
      total_rows: totalRowCount,
      processed_rows: processedRows,
      failed_rows: failedRows,
      has_more: hasMore,
      last_processed_row_index: lastRowIndex,
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
