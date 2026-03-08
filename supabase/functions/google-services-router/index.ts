import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleDocs } from './handlers/docs.ts'
import { handleDocsCreate } from './handlers/docs_create.ts'
import { handleDrive } from './handlers/drive.ts'
import { handleGmail } from './handlers/gmail.ts'
import { handleOauthExchange } from './handlers/oauth_exchange.ts'
import { handleOauthInitiate } from './handlers/oauth_initiate.ts'
import { handleTasks } from './handlers/tasks.ts'
import { handleTestConnection } from './handlers/test_connection.ts'
import { handleTokenRefresh } from './handlers/token_refresh.ts'
import { handleWorkspaceBatch } from './handlers/workspace_batch.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  docs: handleDocs,
  docs_create: handleDocsCreate,
  drive: handleDrive,
  gmail: handleGmail,
  oauth_exchange: handleOauthExchange,
  oauth_initiate: handleOauthInitiate,
  tasks: handleTasks,
  test_connection: handleTestConnection,
  token_refresh: handleTokenRefresh,
  workspace_batch: handleWorkspaceBatch,
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
    // If the caller provided a handlerAction, restore it as the body's action
    // so handlers that read body.action (e.g. gmail, tasks) get the correct sub-action.
    let forwardBody = bodyText
    if (body.handlerAction !== undefined) {
      const forwardObj = { ...body, action: body.handlerAction }
      delete forwardObj.handlerAction
      forwardBody = JSON.stringify(forwardObj)
    }
    const handlerReq = new Request(req.url, { method: req.method, headers: req.headers, body: forwardBody })
    return await HANDLERS[action](handlerReq)
  } catch (error: unknown) {
    console.error('[google-services-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
