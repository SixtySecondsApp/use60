/**
 * CRM Admin Router — consolidated edge function for HubSpot, Attio, and Bullhorn
 * internal admin/operations functions.
 *
 * POST body must include: { action: string, ...params }
 *
 * Excludes: OAuth callbacks and webhooks (external endpoints).
 */

import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

// HubSpot handlers
import { handleHubspotAdmin } from './handlers/hubspot-admin.ts'
import { handleHubspotDisconnect } from './handlers/hubspot-disconnect.ts'
import { handleHubspotInitialSync } from './handlers/hubspot-initial-sync.ts'
import { handleHubspotListOps } from './handlers/hubspot-list-ops.ts'
import { handleHubspotOauthInitiate } from './handlers/hubspot-oauth-initiate.ts'
import { handleHubspotProcessQueue } from './handlers/hubspot-process-queue.ts'
import { handleHubspotTokenRefresh } from './handlers/hubspot-token-refresh.ts'

// Attio handlers
import { handleAttioAdmin } from './handlers/attio-admin.ts'
import { handleAttioDisconnect } from './handlers/attio-disconnect.ts'
import { handleAttioListOps } from './handlers/attio-list-ops.ts'
import { handleAttioOauthInitiate } from './handlers/attio-oauth-initiate.ts'
import { handleAttioProcessQueue } from './handlers/attio-process-queue.ts'
import { handleAttioTokenRefresh } from './handlers/attio-token-refresh.ts'

// Bullhorn handlers
import { handleBullhornAdmin } from './handlers/bullhorn-admin.ts'
import { handleBullhornDisconnect } from './handlers/bullhorn-disconnect.ts'
import { handleBullhornOauthInitiate } from './handlers/bullhorn-oauth-initiate.ts'
import { handleBullhornProcessQueue } from './handlers/bullhorn-process-queue.ts'
import { handleBullhornTokenRefresh } from './handlers/bullhorn-token-refresh.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  // HubSpot (7)
  hubspot_admin: handleHubspotAdmin,
  hubspot_disconnect: handleHubspotDisconnect,
  hubspot_initial_sync: handleHubspotInitialSync,
  hubspot_list_ops: handleHubspotListOps,
  hubspot_oauth_initiate: handleHubspotOauthInitiate,
  hubspot_process_queue: handleHubspotProcessQueue,
  hubspot_token_refresh: handleHubspotTokenRefresh,

  // Attio (6)
  attio_admin: handleAttioAdmin,
  attio_disconnect: handleAttioDisconnect,
  attio_list_ops: handleAttioListOps,
  attio_oauth_initiate: handleAttioOauthInitiate,
  attio_process_queue: handleAttioProcessQueue,
  attio_token_refresh: handleAttioTokenRefresh,

  // Bullhorn (5)
  bullhorn_admin: handleBullhornAdmin,
  bullhorn_disconnect: handleBullhornDisconnect,
  bullhorn_oauth_initiate: handleBullhornOauthInitiate,
  bullhorn_process_queue: handleBullhornProcessQueue,
  bullhorn_token_refresh: handleBullhornTokenRefresh,
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight
  const cors = getCorsHeaders(req)

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

    // Reconstruct a new Request with the same body so handlers can re-read it
    const handlerReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: bodyText,
    })

    return await HANDLERS[action](handlerReq)
  } catch (error: unknown) {
    console.error('[crm-admin-router] Router error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
