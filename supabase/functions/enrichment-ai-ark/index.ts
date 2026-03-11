import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleSearch } from './handlers/search.ts'
import { handleEnrich } from './handlers/enrich.ts'
import { handleSemantic } from './handlers/semantic.ts'
import { handleSimilarity } from './handlers/similarity.ts'
import { handleCredits } from './handlers/credits.ts'

/**
 * enrichment-ai-ark — Consolidated AI Ark enrichment router.
 *
 * Replaces 5 individual edge functions:
 *   ai-ark-search, ai-ark-enrich, ai-ark-semantic,
 *   ai-ark-similarity, ai-ark-credits
 *
 * Request body must include `action` field to route.
 * Handlers that use `action` internally (search, enrich) accept their
 * original action values directly (e.g. company_search, bulk_enrich).
 *
 * Valid actions:
 *   company_search, people_search  → search handler
 *   reverse_lookup, bulk_enrich    → enrich handler
 *   semantic                       → semantic handler
 *   similarity                     → similarity handler
 *   credits                        → credits handler
 */

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  // Search sub-actions (handler reads action from body)
  company_search: handleSearch,
  people_search: handleSearch,
  // Enrich sub-actions (handler reads action from body)
  reverse_lookup: handleEnrich,
  bulk_enrich: handleEnrich,
  // Direct actions
  semantic: handleSemantic,
  similarity: handleSimilarity,
  credits: handleCredits,
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const bodyText = await req.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyText)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const action = body.action as string
    if (!action || !HANDLERS[action]) {
      return new Response(
        JSON.stringify({
          error: `Invalid or missing action. Must be one of: ${Object.keys(HANDLERS).join(', ')}`,
          received: action ?? null,
        }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    // Pass the FULL body (including action) — handlers that use action internally need it
    const handlerReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: bodyText,
    })

    return await HANDLERS[action](handlerReq)
  } catch (error: unknown) {
    console.error('[enrichment-ai-ark] Router error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
})
