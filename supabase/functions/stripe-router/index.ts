// supabase/functions/stripe-router/index.ts
// Router for Stripe product management actions: create, sync, update

import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleCreateProduct } from './handlers/create-product.ts'
import { handleSyncProduct } from './handlers/sync-product.ts'
import { handleUpdateProduct } from './handlers/update-product.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  create_product: handleCreateProduct,
  sync_product: handleSyncProduct,
  update_product: handleUpdateProduct,
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const bodyText = await req.text()
    let body: Record<string, unknown>
    try { body = JSON.parse(bodyText) } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const action = body.action as string
    if (!action || !HANDLERS[action]) {
      return new Response(JSON.stringify({ error: `Invalid or missing action. Must be one of: ${Object.keys(HANDLERS).join(', ')}`, received: action ?? null }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const handlerReq = new Request(req.url, { method: req.method, headers: req.headers, body: bodyText })
    return await HANDLERS[action](handlerReq)
  } catch (error: unknown) {
    console.error('[stripe-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
