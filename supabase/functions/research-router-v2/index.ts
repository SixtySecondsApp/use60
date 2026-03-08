// supabase/functions/research-router-v2/index.ts
// Consolidated router for all research functions:
//   - comparison     (was: research-comparison)
//   - fact_profile   (was: research-fact-profile)
//   - orchestrator   (was: research-orchestrator)
//   - product_profile (was: research-product-profile)
//   - router         (was: research-router)

import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleComparison } from './handlers/comparison.ts'
import { handleFactProfile } from './handlers/fact_profile.ts'
import { handleOrchestrator } from './handlers/orchestrator.ts'
import { handleProductProfile } from './handlers/product_profile.ts'
import { handleRouter } from './handlers/router.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  comparison: handleComparison,
  fact_profile: handleFactProfile,
  orchestrator: handleOrchestrator,
  product_profile: handleProductProfile,
  router: handleRouter,
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const bodyText = await req.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyText)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const action = body.action as string
    if (!action || !HANDLERS[action]) {
      return new Response(
        JSON.stringify({
          error: `Invalid or missing action. Must be one of: ${Object.keys(HANDLERS).join(', ')}`,
          received: action ?? null,
        }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // Reconstruct request with the same headers and full body for the handler
    const handlerReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: bodyText,
    })

    return await HANDLERS[action](handlerReq)
  } catch (error: unknown) {
    console.error('[research-router-v2] Router error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
