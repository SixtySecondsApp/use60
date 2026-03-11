import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleConnect } from './handlers/connect.ts'
import { handleIntrospect } from './handlers/introspect.ts'
import { handleAutoMap } from './handlers/auto-map.ts'
import { handleRunStart } from './handlers/run-start.ts'
import { handleLinkedinEnrich } from './handlers/linkedin-enrich.ts'
import { handleMultiQuery } from './handlers/multi-query.ts'

/**
 * enrichment-apify — Consolidated Apify enrichment router.
 *
 * Replaces 6 individual edge functions:
 *   apify-connect, apify-actor-introspect, apify-auto-map,
 *   apify-run-start, apify-linkedin-enrich, apify-multi-query
 *
 * Request body must include `action` field to route.
 * The connect handler uses `action` internally for sub-routing
 * (connect/disconnect/revalidate), so those are direct router entries.
 *
 * Valid actions:
 *   connect, disconnect, revalidate → connect handler
 *   introspect                      → introspect handler
 *   auto_map                        → auto-map handler
 *   run_start                       → run-start handler
 *   linkedin_enrich                 → linkedin-enrich handler
 *   multi_query                     → multi-query handler
 */

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  // Connect sub-actions (handler reads action from body)
  connect: handleConnect,
  disconnect: handleConnect,
  revalidate: handleConnect,
  // Direct actions
  introspect: handleIntrospect,
  auto_map: handleAutoMap,
  run_start: handleRunStart,
  linkedin_enrich: handleLinkedinEnrich,
  multi_query: handleMultiQuery,
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
    console.error('[enrichment-apify] Router error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
})
