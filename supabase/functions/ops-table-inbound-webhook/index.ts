// @ts-nocheck — Deno edge function
/**
 * ops-table-inbound-webhook
 *
 * Receives external payloads and writes them into a dynamic ops table.
 * Authentication: x-api-key header validated against ops_table_webhooks.api_key
 * (or previous_api_key if not expired).
 *
 * Deploy with --no-verify-jwt (no Supabase JWT required — uses own API key auth).
 *
 * POST /functions/v1/ops-table-inbound-webhook
 * Body: { table_id: string, payload: object | object[], dry_run?: boolean }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.0'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
} from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter: 60 requests per minute per table_id
// ---------------------------------------------------------------------------
interface RateLimitBucket {
  count: number
  resetAt: number
}
const rateLimitMap = new Map<string, RateLimitBucket>()

function checkRateLimit(tableId: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const WINDOW_MS = 60_000
  const MAX_REQUESTS = 60

  let bucket = rateLimitMap.get(tableId)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS }
    rateLimitMap.set(tableId, bucket)
  }

  bucket.count++

  return {
    allowed: bucket.count <= MAX_REQUESTS,
    remaining: Math.max(0, MAX_REQUESTS - bucket.count),
  }
}

// ---------------------------------------------------------------------------
// Type detection for auto-create columns
// ---------------------------------------------------------------------------
function detectColumnType(value: unknown): string {
  if (value === null || value === undefined) return 'text'
  const str = String(value).trim()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return 'email'
  if (/^https?:\/\//i.test(str)) return 'url'
  if (!isNaN(Number(str)) && str !== '') return 'number'
  return 'text'
}

// ---------------------------------------------------------------------------
// AI field mapping via Claude Haiku
// ---------------------------------------------------------------------------
async function buildFieldMapping(
  payloadKeys: string[],
  columns: Array<{ id: string; key: string; label?: string }>,
  anthropicApiKey: string
): Promise<Record<string, string | null>> {
  const client = new Anthropic({ apiKey: anthropicApiKey })

  const columnContext = columns
    .map((c) => `- key: "${c.key}"${c.label ? `, label: "${c.label}"` : ''}`)
    .join('\n')

  const prompt = `Map these JSON payload keys to the closest matching table column keys.
Return a JSON object where each key is a payload field name and each value is the matching column key (or null if no suitable match exists).

Payload keys to map:
${payloadKeys.map((k) => `- "${k}"`).join('\n')}

Available table columns:
${columnContext}

Rules:
- Use semantic similarity (e.g. "full_name" → "name", "email_address" → "email")
- Return null for keys that have no reasonable match
- Return ONLY the JSON object, no explanation`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system:
      'You are a data mapper. Map JSON payload keys to table column keys. Return only a JSON object.',
    messages: [{ role: 'user', content: prompt }],
  })

  const text =
    response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}'

  // Strip markdown code fences if present
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  try {
    return JSON.parse(clean) as Record<string, string | null>
  } catch {
    console.error('[ops-table-inbound-webhook] Failed to parse AI mapping:', text)
    return {}
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // 1. CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // 2. Parse body & validate required fields
    let body: { table_id?: string; payload?: unknown; dry_run?: boolean }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { table_id, payload, dry_run = false } = body

    if (!table_id || typeof table_id !== 'string') {
      return new Response(JSON.stringify({ error: 'table_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (payload === null || payload === undefined) {
      return new Response(JSON.stringify({ error: 'payload is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Normalise payload to array
    const payloadRows: Record<string, unknown>[] = Array.isArray(payload)
      ? (payload as Record<string, unknown>[])
      : [payload as Record<string, unknown>]

    if (payloadRows.length === 0) {
      return new Response(JSON.stringify({ error: 'payload must not be empty' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Look up webhook config
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: webhookConfig, error: webhookErr } = await supabase
      .from('ops_table_webhooks')
      .select(
        'id, table_id, api_key, previous_api_key, previous_api_key_expires_at, is_enabled, field_mapping, auto_create_columns, first_call_received_at'
      )
      .eq('table_id', table_id)
      .maybeSingle()

    if (webhookErr || !webhookConfig) {
      return new Response(
        JSON.stringify({ error: 'Webhook not configured for this table' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 4. Validate API key
    const providedKey = req.headers.get('x-api-key')
    if (!providedKey) {
      return new Response(JSON.stringify({ error: 'x-api-key header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const primaryMatch = providedKey === webhookConfig.api_key
    let previousMatch = false
    if (
      !primaryMatch &&
      webhookConfig.previous_api_key &&
      webhookConfig.previous_api_key_expires_at
    ) {
      const expiresAt = new Date(webhookConfig.previous_api_key_expires_at).getTime()
      if (Date.now() < expiresAt) {
        previousMatch = providedKey === webhookConfig.previous_api_key
      }
    }

    if (!primaryMatch && !previousMatch) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Check is_enabled
    if (!webhookConfig.is_enabled) {
      return new Response(
        JSON.stringify({ error: 'Webhook is disabled for this table' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 6. Rate limit (60 req/min per table_id)
    const { allowed, remaining } = checkRateLimit(table_id)
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    // 7. Load table columns
    const { data: columns, error: colErr } = await supabase
      .from('dynamic_table_columns')
      .select('id, key, label, type')
      .eq('table_id', table_id)

    if (colErr) {
      console.error('[ops-table-inbound-webhook] Column fetch error:', colErr)
      return new Response(JSON.stringify({ error: 'Failed to load table columns' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const existingColumns = columns ?? []
    const columnKeyToId = new Map(existingColumns.map((c) => [c.key, c.id]))

    // 8. AI field mapping
    // Collect all unique keys across all payload rows
    const allPayloadKeys = [
      ...new Set(payloadRows.flatMap((row) => Object.keys(row))),
    ]

    let fieldMapping: Record<string, string | null> =
      webhookConfig.field_mapping ?? {}

    const unmappedKeys = allPayloadKeys.filter(
      (k) => fieldMapping[k] === undefined
    )

    if (unmappedKeys.length > 0 && existingColumns.length > 0) {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
      if (anthropicKey) {
        try {
          const aiMapping = await buildFieldMapping(
            unmappedKeys,
            existingColumns,
            anthropicKey
          )
          fieldMapping = { ...fieldMapping, ...aiMapping }

          // Cache updated mapping (fire-and-forget)
          supabase
            .from('ops_table_webhooks')
            .update({ field_mapping: fieldMapping })
            .eq('id', webhookConfig.id)
            .then(({ error: cacheErr }) => {
              if (cacheErr) {
                console.error(
                  '[ops-table-inbound-webhook] Failed to cache field mapping:',
                  cacheErr
                )
              }
            })
        } catch (aiErr) {
          console.error('[ops-table-inbound-webhook] AI mapping failed:', aiErr)
          // Continue without AI mapping — unmapped keys will be flagged
        }
      }
    }

    // Identify truly unmapped keys (null means no match found)
    const unmappedFields = allPayloadKeys.filter(
      (k) => !fieldMapping[k] || !columnKeyToId.has(fieldMapping[k]!)
    )

    // 9. Auto-create columns for first call
    const isFirstCall = !webhookConfig.first_call_received_at
    const newColumnsToCreate: Array<{ key: string; type: string; sampleValue: unknown }> = []

    if (
      isFirstCall &&
      webhookConfig.auto_create_columns &&
      unmappedFields.length > 0
    ) {
      const sampleRow = payloadRows[0]
      for (const key of unmappedFields) {
        const sampleValue = sampleRow[key]
        const colType = detectColumnType(sampleValue)
        newColumnsToCreate.push({ key, type: colType, sampleValue })
      }
    }

    // 10. dry_run — return preview without writing
    if (dry_run) {
      return new Response(
        JSON.stringify({
          dry_run: true,
          mapping: fieldMapping,
          unmapped_fields: unmappedFields,
          would_create_columns: newColumnsToCreate.map((c) => ({
            key: c.key,
            type: c.type,
          })),
          rows_in_payload: payloadRows.length,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // --- Perform writes ---

    // Auto-create columns if applicable
    let updatedColumnKeyToId = new Map(columnKeyToId)
    if (newColumnsToCreate.length > 0) {
      // Get current max column_order
      const { data: maxOrderRow } = await supabase
        .from('dynamic_table_columns')
        .select('column_order')
        .eq('table_id', table_id)
        .order('column_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      let nextOrder = ((maxOrderRow?.column_order ?? 0) as number) + 1

      const colInserts = newColumnsToCreate.map((c) => ({
        table_id,
        key: c.key,
        label: c.key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
        type: c.type,
        column_order: nextOrder++,
      }))

      const { data: createdCols, error: colCreateErr } = await supabase
        .from('dynamic_table_columns')
        .insert(colInserts)
        .select('id, key')

      if (colCreateErr) {
        console.error(
          '[ops-table-inbound-webhook] Column create error:',
          colCreateErr
        )
      } else {
        for (const col of createdCols ?? []) {
          updatedColumnKeyToId.set(col.key, col.id)
          // Add identity mapping for the new column key
          if (!fieldMapping[col.key]) {
            fieldMapping[col.key] = col.key
          }
        }
      }

      // Mark first call received and disable auto_create
      await supabase
        .from('ops_table_webhooks')
        .update({
          first_call_received_at: new Date().toISOString(),
          auto_create_columns: false,
          field_mapping: fieldMapping,
        })
        .eq('id', webhookConfig.id)
    } else if (isFirstCall) {
      // Mark first call even when no new columns needed
      await supabase
        .from('ops_table_webhooks')
        .update({ first_call_received_at: new Date().toISOString() })
        .eq('id', webhookConfig.id)
    }

    // 11. Insert rows and cells in batches of 500
    const CHUNK_SIZE = 500
    let rowsCreated = 0
    let rowsUpdated = 0

    for (let offset = 0; offset < payloadRows.length; offset += CHUNK_SIZE) {
      const chunk = payloadRows.slice(offset, offset + CHUNK_SIZE)

      // Get current max row_index for this table
      const { data: maxIdxRow } = await supabase
        .from('dynamic_table_rows')
        .select('row_index')
        .eq('table_id', table_id)
        .order('row_index', { ascending: false })
        .limit(1)
        .maybeSingle()

      let nextRowIndex = ((maxIdxRow?.row_index ?? 0) as number) + 1

      const rowInserts = chunk.map((_, i) => ({
        table_id,
        source_type: 'webhook',
        row_index: nextRowIndex + i,
      }))

      const { data: insertedRows, error: rowInsertErr } = await supabase
        .from('dynamic_table_rows')
        .insert(rowInserts)
        .select('id')

      if (rowInsertErr || !insertedRows) {
        console.error(
          '[ops-table-inbound-webhook] Row insert error:',
          rowInsertErr
        )
        continue
      }

      rowsCreated += insertedRows.length

      // Build cell upserts
      const cellUpserts: Array<{ row_id: string; column_id: string; value: string }> =
        []

      for (let i = 0; i < chunk.length; i++) {
        const row = chunk[i]
        const rowId = insertedRows[i]?.id
        if (!rowId) continue

        for (const [payloadKey, rawValue] of Object.entries(row)) {
          const colKey = fieldMapping[payloadKey]
          if (!colKey) continue
          const colId = updatedColumnKeyToId.get(colKey)
          if (!colId) continue
          if (rawValue === null || rawValue === undefined) continue

          cellUpserts.push({
            row_id: rowId,
            column_id: colId,
            value: typeof rawValue === 'object'
              ? JSON.stringify(rawValue)
              : String(rawValue),
          })
        }
      }

      // Upsert cells in sub-chunks
      for (let ci = 0; ci < cellUpserts.length; ci += CHUNK_SIZE) {
        const cellChunk = cellUpserts.slice(ci, ci + CHUNK_SIZE)
        const { error: cellErr } = await supabase
          .from('dynamic_table_cells')
          .upsert(cellChunk, { onConflict: 'row_id,column_id' })

        if (cellErr) {
          console.error(
            '[ops-table-inbound-webhook] Cell upsert error:',
            cellErr
          )
        }
      }
    }

    // 12. Write to ops_webhook_logs
    try {
      await supabase.from('ops_webhook_logs').insert({
        webhook_id: webhookConfig.id,
        direction: 'inbound',
        status: 200,
        payload: { rows: payloadRows.length, sample: payloadRows[0] },
        mapped_result: fieldMapping,
        rows_affected: rowsCreated,
      })
    } catch (logErr) {
      console.error('[ops-table-inbound-webhook] Log write error:', logErr)
    }

    // 13. Return result
    return new Response(
      JSON.stringify({
        success: true,
        rows_created: rowsCreated,
        rows_updated: rowsUpdated,
        mapping: fieldMapping,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(remaining),
        },
      }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[ops-table-inbound-webhook] Unhandled error:', err)

    // Best-effort error log — guard so it never masks the original error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      let webhookId: string | undefined
      try {
        const body = await req.clone().json()
        if (body?.table_id) {
          const { data } = await supabase
            .from('ops_table_webhooks')
            .select('id')
            .eq('table_id', body.table_id)
            .maybeSingle()
          webhookId = data?.id
        }
      } catch { /* ignore — body may already be consumed */ }
      if (webhookId) {
        await supabase.from('ops_webhook_logs').insert({
          webhook_id: webhookId,
          direction: 'inbound',
          status: 500,
          payload: null,
          rows_affected: 0,
          error: message,
        })
      }
    } catch { /* silent — don't mask original error */ }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
