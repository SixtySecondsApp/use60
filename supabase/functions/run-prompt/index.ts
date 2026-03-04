// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

/**
 * run-prompt — Execute an AI prompt using row data from an ops table.
 *
 * POST body:
 *  {
 *    table_id: string,
 *    row_id: string,
 *    action_config: {
 *      system_prompt: string,        // with {{column_key}} mustache vars
 *      user_message_template: string, // with {{column_key}} mustache vars
 *      model: string,                // e.g. 'claude-sonnet-4-5-20250929'
 *      provider: 'anthropic' | 'openrouter',
 *      temperature: number,
 *      max_tokens: number,
 *      input_columns: string[],      // column keys to resolve
 *      output_column_key: string,    // column key to write result into
 *    }
 *  }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: JSON_HEADERS })
    }

    // Auth: validate user JWT
    const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (!userToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
    }

    const body = await req.json()
    const { table_id, row_id, action_config } = body

    if (!table_id || !row_id || !action_config) {
      return new Response(JSON.stringify({ error: 'table_id, row_id, and action_config required' }), { status: 400, headers: JSON_HEADERS })
    }

    const {
      system_prompt,
      user_message_template,
      model = 'claude-sonnet-4-5-20250929',
      provider = 'anthropic',
      temperature = 0.3,
      max_tokens = 2048,
      output_column_key,
    } = action_config

    if (!system_prompt && !user_message_template) {
      return new Response(JSON.stringify({ error: 'system_prompt or user_message_template required' }), { status: 400, headers: JSON_HEADERS })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 1. Get all columns for this table
    const { data: columns, error: colError } = await supabase
      .from('dynamic_table_columns')
      .select('id, key, label')
      .eq('table_id', table_id)

    if (colError) throw colError

    const columnKeyToId = new Map<string, string>()
    const columnIdToKey = new Map<string, string>()
    for (const col of columns ?? []) {
      columnKeyToId.set(col.key, col.id)
      columnIdToKey.set(col.id, col.key)
    }

    // 2. Get row cells
    const { data: row, error: rowError } = await supabase
      .from('dynamic_table_rows')
      .select('id, dynamic_table_cells(column_id, value)')
      .eq('id', row_id)
      .single()

    if (rowError) throw rowError

    // Build cell value map keyed by column key
    const cellValues: Record<string, string> = {}
    for (const cell of row.dynamic_table_cells ?? []) {
      const key = columnIdToKey.get(cell.column_id)
      if (key) cellValues[key] = cell.value ?? ''
    }

    // 3. Resolve {{column_key}} mustache vars in prompts
    const resolveVars = (template: string) =>
      template.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (_, key) => cellValues[key] ?? '')

    const resolvedSystem = system_prompt ? resolveVars(system_prompt) : ''
    const resolvedUser = user_message_template ? resolveVars(user_message_template) : ''

    // 4. Call AI provider
    let resultText: string

    if (provider === 'anthropic') {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
      if (!anthropicKey) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500, headers: JSON_HEADERS })
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens,
          temperature,
          ...(resolvedSystem ? { system: resolvedSystem } : {}),
          messages: [{ role: 'user', content: resolvedUser || 'Analyse the provided data.' }],
        }),
      })

      if (!response.ok) {
        const errBody = await response.text()
        console.error('[run-prompt] Anthropic error:', errBody)
        throw new Error(`Anthropic API error: ${response.status}`)
      }

      const data = await response.json()
      resultText = data.content?.[0]?.text ?? ''
    } else {
      // OpenRouter
      const openrouterKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''
      if (!openrouterKey) {
        return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), { status: 500, headers: JSON_HEADERS })
      }

      const messages = []
      if (resolvedSystem) messages.push({ role: 'system', content: resolvedSystem })
      messages.push({ role: 'user', content: resolvedUser || 'Analyse the provided data.' })

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://app.use60.com',
        },
        body: JSON.stringify({
          model,
          max_tokens,
          temperature,
          messages,
        }),
      })

      if (!response.ok) {
        const errBody = await response.text()
        console.error('[run-prompt] OpenRouter error:', errBody)
        throw new Error(`OpenRouter API error: ${response.status}`)
      }

      const data = await response.json()
      resultText = data.choices?.[0]?.message?.content ?? ''
    }

    // Strip markdown code fences if the model wrapped the JSON
    resultText = resultText.trim()
    if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
    }

    // 5. Write result to output column cell
    if (output_column_key) {
      const outputColumnId = columnKeyToId.get(output_column_key)
      if (outputColumnId) {
        const { error: upsertError } = await supabase
          .from('dynamic_table_cells')
          .upsert(
            {
              row_id,
              column_id: outputColumnId,
              value: resultText,
              source: 'ai_prompt',
              status: 'complete',
              confidence: 1.0,
            },
            { onConflict: 'row_id,column_id' },
          )
        if (upsertError) {
          console.error('[run-prompt] Upsert error:', upsertError)
        }
      }
    }

    // 6. Try to parse as JSON to extract qualified flag
    let qualified: boolean | null = null
    try {
      const parsed = JSON.parse(resultText)
      if (typeof parsed.qualified === 'boolean') {
        qualified = parsed.qualified
      } else if (typeof parsed.qualified === 'string') {
        qualified = parsed.qualified.toLowerCase() === 'true'
      }
    } catch {
      // Not JSON, that's fine
    }

    return new Response(
      JSON.stringify({ result: resultText, qualified }),
      { status: 200, headers: JSON_HEADERS },
    )
  } catch (error: any) {
    console.error('[run-prompt] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})
