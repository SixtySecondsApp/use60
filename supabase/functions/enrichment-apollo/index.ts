import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleSearch } from './handlers/search.ts'
import { handleEnrich } from './handlers/enrich.ts'
import { handleOrgEnrich } from './handlers/org-enrich.ts'
import { handleReveal } from './handlers/reveal.ts'
import { handleCollectMore } from './handlers/collect-more.ts'
import { handleCredits } from './handlers/credits.ts'

/**
 * enrichment-apollo — Consolidated Apollo enrichment router.
 *
 * Replaces 6 individual edge functions:
 *   apollo-search, apollo-enrich, apollo-org-enrich,
 *   apollo-reveal, apollo-collect-more, apollo-credits
 *
 * Request body must include `action` field to route:
 *   { action: 'search' | 'enrich' | 'org_enrich' | 'reveal' | 'collect_more' | 'credits', ...params }
 */

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  search: handleSearch,
  enrich: handleEnrich,
  org_enrich: handleOrgEnrich,
  reveal: handleReveal,
  collect_more: handleCollectMore,
  credits: handleCredits,
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    // Clone the body so we can peek at the action, then pass the full request to the handler
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

    // Pass the FULL body (including action) to the handler
    const handlerReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: bodyText,
    })

    return await HANDLERS[action](handlerReq)
  } catch (error: unknown) {
    console.error('[enrichment-apollo] Router error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
})
