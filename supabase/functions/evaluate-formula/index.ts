// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * evaluate-formula — Evaluate formula columns for a dynamic table.
 *
 * Supports:
 *  - Math: @price * @quantity, @revenue / @headcount, @a + @b - @c
 *  - IF: IF(@status = "won", @revenue, 0)
 *  - CONCAT: CONCAT(@first, " ", @last)  — skips empty/N/A args
 *  - String join: @first & " " & @last   — & operator for concatenation
 *  - @column_key references resolved per-row
 *
 * POST body:
 *  { table_id, column_id, row_ids?: string[] }
 *
 * If row_ids omitted, evaluates all rows.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EvalRequest {
  table_id: string
  column_id: string
  row_ids?: string[]
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const body: EvalRequest = await req.json()
    const { table_id, column_id, row_ids } = body

    if (!table_id || !column_id) {
      return new Response(
        JSON.stringify({ error: 'table_id and column_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Get the formula column definition
    const { data: column, error: colError } = await supabase
      .from('dynamic_table_columns')
      .select('id, key, formula_expression, column_type')
      .eq('id', column_id)
      .single()

    if (colError || !column) {
      return new Response(
        JSON.stringify({ error: 'Column not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (column.column_type !== 'formula' || !column.formula_expression) {
      return new Response(
        JSON.stringify({ error: 'Column is not a formula column or has no expression' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Get all columns for this table (for @key resolution)
    const { data: allColumns, error: allColError } = await supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table_id)

    if (allColError) throw allColError

    const columnKeyToId = new Map<string, string>()
    const columnIdToKey = new Map<string, string>()
    for (const col of allColumns ?? []) {
      columnKeyToId.set(col.key, col.id)
      columnIdToKey.set(col.id, col.key)
    }

    // 3. Get rows
    let rowQuery = supabase
      .from('dynamic_table_rows')
      .select('id, row_index, dynamic_table_cells(id, column_id, value)')
      .eq('table_id', table_id)
      .order('row_index', { ascending: true })

    if (row_ids && row_ids.length > 0) {
      rowQuery = rowQuery.in('id', row_ids)
    }

    const { data: rows, error: rowError } = await rowQuery
    if (rowError) throw rowError

    // 4. Evaluate formula for each row and upsert results
    const expression = column.formula_expression
    const results: { row_id: string; value: string; status: string }[] = []

    for (const row of rows ?? []) {
      // Build cell value map keyed by column key
      const cellValues = new Map<string, string>()
      for (const cell of row.dynamic_table_cells ?? []) {
        const key = columnIdToKey.get(cell.column_id)
        if (key) cellValues.set(key, cell.value ?? '')
      }

      // Evaluate
      let result: string
      let status = 'complete'
      try {
        result = evaluateExpression(expression, cellValues)
      } catch (e) {
        result = 'ERR'
        status = 'failed'
      }

      results.push({ row_id: row.id, value: result, status })
    }

    // 5. Upsert cell values
    if (results.length > 0) {
      const upserts = results.map((r) => ({
        row_id: r.row_id,
        column_id: column_id,
        value: r.value,
        source: 'formula',
        status: r.status,
        confidence: 1.0,
      }))

      const { error: upsertError } = await supabase
        .from('dynamic_table_cells')
        .upsert(upserts, { onConflict: 'row_id,column_id' })

      if (upsertError) throw upsertError
    }

    return new Response(
      JSON.stringify({
        evaluated: results.length,
        errors: results.filter((r) => r.status === 'failed').length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[evaluate-formula] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// =============================================================================
// Expression evaluator (no eval()!)
// =============================================================================

/**
 * Evaluate a formula expression with @column_key references.
 * Supported:
 *  - Math operators: + - * / ( )
 *  - String join: & (concatenation operator)
 *  - String: CONCAT(a, b, ...) — skips empty/N/A args
 *  - Conditional: IF(condition, trueVal, falseVal)
 *  - Comparisons: =, !=, >, <, >=, <=
 *  - String literals: "hello" or 'hello'
 *  - Number literals: 42, 3.14
 */
function evaluateExpression(expr: string, cellValues: Map<string, string>): string {
  // Replace @column_key references with their values, tracking which are missing
  const missingKeys = new Set<string>()
  const resolved = expr.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
    const val = cellValues.get(key)
    if (val === undefined || val === '') {
      missingKeys.add(key)
      return '\x00N/A\x00' // sentinel for N/A detection
    }
    return val
  })

  const trimmed = resolved.trim()
  const hasNA = missingKeys.size > 0

  // Handle & operator (string concatenation) — check BEFORE math/functions
  if (containsAmpersandOperator(trimmed)) {
    return evalAmpersand(trimmed)
  }

  // Handle CONCAT() — skips N/A args instead of propagating
  if (trimmed.toUpperCase().startsWith('CONCAT(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(7, -1)
    const args = splitArgs(inner)
    const parts = args
      .map((a) => stripQuotes(evalSimple(a.trim(), cellValues)))
      .filter((v) => v !== '\x00N/A\x00' && v !== 'N/A')
    return parts.length > 0 ? parts.join('') : ''
  }

  // Handle IF()
  if (trimmed.toUpperCase().startsWith('IF(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(3, -1)
    const args = splitArgs(inner)
    if (args.length !== 3) return 'ERR'
    // Propagate N/A if the condition column is missing
    const condStr = args[0].trim()
    if (condStr.includes('\x00N/A\x00')) return 'N/A'
    const condition = evalCondition(condStr.replace(/\x00N\/A\x00/g, 'N/A'), cellValues)
    const branch = condition ? args[1].trim() : args[2].trim()
    const result = stripQuotes(evalSimple(branch, cellValues))
    return result === '\x00N/A\x00' ? 'N/A' : result
  }

  // For math expressions, propagate N/A if any ref is missing
  if (hasNA) return 'N/A'

  // Clean sentinels (shouldn't happen at this point, but be safe)
  const clean = trimmed.replace(/\x00N\/A\x00/g, 'N/A')

  // Try math evaluation
  return evalSimple(clean, cellValues)
}

/**
 * Check if expression contains `&` as a string concatenation operator
 * (not inside quotes).
 */
function containsAmpersandOperator(expr: string): boolean {
  let inString: string | null = null
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (inString) {
      if (ch === inString) inString = null
      continue
    }
    if (ch === '"' || ch === "'") { inString = ch; continue }
    if (ch === '&') return true
  }
  return false
}

/**
 * Evaluate & operator: splits on & respecting quoted strings,
 * concatenates all parts. Skips N/A parts.
 */
function evalAmpersand(expr: string): string {
  const parts: string[] = []
  let current = ''
  let inString: string | null = null

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (inString) {
      current += ch
      if (ch === inString) inString = null
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = ch
      current += ch
      continue
    }
    if (ch === '&') {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.length > 0) parts.push(current)

  const resolved = parts
    .map((p) => {
      const t = p.trim()
      if (t === '' || t === '\x00N/A\x00') return ''
      return stripQuotes(t)
    })
    .filter((v) => v !== '' && v !== '\x00N/A\x00' && v !== 'N/A')

  return resolved.join('')
}

/**
 * Split function arguments respecting string quotes and nested parens.
 */
function splitArgs(str: string): string[] {
  const args: string[] = []
  let current = ''
  let depth = 0
  let inString: string | null = null

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]

    if (inString) {
      current += ch
      if (ch === inString) inString = null
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = ch
      current += ch
      continue
    }

    if (ch === '(') {
      depth++
      current += ch
      continue
    }

    if (ch === ')') {
      depth--
      current += ch
      continue
    }

    if (ch === ',' && depth === 0) {
      args.push(current)
      current = ''
      continue
    }

    current += ch
  }

  if (current.trim()) args.push(current)
  return args
}

/**
 * Evaluate a simple expression (number, string literal, or math).
 */
function evalSimple(expr: string, cellValues: Map<string, string>): string {
  const trimmed = expr.trim()

  // N/A sentinel passthrough
  if (trimmed === '\x00N/A\x00') return trimmed

  // String literal
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed
  }

  // Try as pure number or math expression
  try {
    const num = evalMath(trimmed)
    if (!isNaN(num) && isFinite(num)) {
      // Format nicely: no unnecessary decimals
      return Number.isInteger(num) ? num.toString() : parseFloat(num.toFixed(4)).toString()
    }
  } catch {
    // Not a math expression — return as-is
  }

  return trimmed
}

/**
 * Safe math evaluator using a simple recursive descent parser.
 * Supports: + - * / ( ) and number literals.
 */
function evalMath(expr: string): number {
  const tokens = tokenizeMath(expr)
  let pos = 0

  function peek(): string | undefined { return tokens[pos] }
  function consume(): string { return tokens[pos++] }

  function parseExpr(): number {
    let left = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = consume()
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function parseTerm(): number {
    let left = parseFactor()
    while (peek() === '*' || peek() === '/') {
      const op = consume()
      const right = parseFactor()
      if (op === '/') {
        if (right === 0) throw new Error('Division by zero')
        left = left / right
      } else {
        left = left * right
      }
    }
    return left
  }

  function parseFactor(): number {
    // Unary minus
    if (peek() === '-') {
      consume()
      return -parseFactor()
    }
    // Parenthesized expression
    if (peek() === '(') {
      consume() // (
      const val = parseExpr()
      if (peek() === ')') consume() // )
      return val
    }
    // Number
    const token = consume()
    const num = parseFloat(token)
    if (isNaN(num)) throw new Error(`Invalid number: ${token}`)
    return num
  }

  const result = parseExpr()
  if (pos < tokens.length) throw new Error('Unexpected token')
  return result
}

function tokenizeMath(expr: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]
    if (/\s/.test(ch)) { i++; continue }
    if ('+-*/()'.includes(ch)) {
      tokens.push(ch)
      i++
      continue
    }
    // Number (including decimals)
    if (/[0-9.]/.test(ch)) {
      let num = ''
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i++]
      }
      tokens.push(num)
      continue
    }
    // Unknown character — treat as part of a token
    let tok = ''
    while (i < expr.length && !/[\s+\-*/()]/.test(expr[i])) {
      tok += expr[i++]
    }
    tokens.push(tok)
  }
  return tokens
}

/**
 * Evaluate a condition expression for IF().
 * Supports: =, !=, >, <, >=, <=
 */
function evalCondition(condExpr: string, cellValues: Map<string, string>): boolean {
  // Find comparison operator
  const ops = ['!=', '>=', '<=', '=', '>', '<']
  for (const op of ops) {
    const idx = condExpr.indexOf(op)
    if (idx !== -1) {
      const left = stripQuotes(condExpr.slice(0, idx).trim())
      const right = stripQuotes(condExpr.slice(idx + op.length).trim())

      const leftNum = parseFloat(left)
      const rightNum = parseFloat(right)
      const isNumeric = !isNaN(leftNum) && !isNaN(rightNum)

      switch (op) {
        case '=': return isNumeric ? leftNum === rightNum : left === right
        case '!=': return isNumeric ? leftNum !== rightNum : left !== right
        case '>': return isNumeric ? leftNum > rightNum : left > right
        case '<': return isNumeric ? leftNum < rightNum : left < right
        case '>=': return isNumeric ? leftNum >= rightNum : left >= right
        case '<=': return isNumeric ? leftNum <= rightNum : left <= right
      }
    }
  }
  // No operator found — truthy check
  return condExpr.trim() !== '' && condExpr.trim() !== '0' && condExpr.trim().toLowerCase() !== 'false'
}

function stripQuotes(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}
