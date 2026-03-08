import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleToHubspot } from './handlers/to-hubspot.ts'
import { handleToAttio } from './handlers/to-attio.ts'
import { handleToInstantly } from './handlers/to-instantly.ts'
import { handleCellToHubspot } from './handlers/cell-to-hubspot.ts'
import { handleCellToAttio } from './handlers/cell-to-attio.ts'
import { handleCampaignInstantly } from './handlers/campaign-instantly.ts'

/**
 * crm-push — Consolidated CRM push router.
 *
 * Replaces 6 individual edge functions:
 *   push-to-hubspot, push-to-attio, push-to-instantly,
 *   push-cell-to-hubspot, push-cell-to-attio, push-campaign-instantly
 *
 * Request body must include `action` field to route:
 *   { action: 'to_hubspot' | 'to_attio' | 'to_instantly' | 'cell_to_hubspot' | 'cell_to_attio' | 'campaign_instantly', ...params }
 */

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  to_hubspot: handleToHubspot,
  to_attio: handleToAttio,
  to_instantly: handleToInstantly,
  cell_to_hubspot: handleCellToHubspot,
  cell_to_attio: handleCellToAttio,
  campaign_instantly: handleCampaignInstantly,
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
    console.error('[crm-push] Router error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
})
