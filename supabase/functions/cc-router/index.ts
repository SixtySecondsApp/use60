import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleActionSync } from './handlers/actionSync.ts'
import { handleAutoExecute } from './handlers/autoExecute.ts'
import { handleAutoReport } from './handlers/autoReport.ts'
import { handleDailyCleanup } from './handlers/dailyCleanup.ts'
import { handleEnrich } from './handlers/enrich.ts'
import { handlePrioritise } from './handlers/prioritise.ts'
import { handleUndo } from './handlers/undo.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  action_sync: handleActionSync,
  auto_execute: handleAutoExecute,
  auto_report: handleAutoReport,
  daily_cleanup: handleDailyCleanup,
  enrich: handleEnrich,
  prioritise: handlePrioritise,
  undo: handleUndo,
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
    console.error('[cc-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
