/**
 * autopilot-router — Consolidated router for autopilot edge functions
 *
 * Routes requests to the appropriate handler based on `action` in the JSON body:
 *   - admin          -> autopilot-admin (AP-018)
 *   - backfill       -> autopilot-backfill (AP-012)
 *   - evaluate       -> autopilot-evaluate (AP-014)
 *   - record_signal  -> autopilot-record-signal (AP-010 / AP-032)
 *
 * DEPLOY (staging):
 *   npx supabase functions deploy autopilot-router \
 *     --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleAdmin } from './handlers/admin.ts'
import { handleBackfill } from './handlers/backfill.ts'
import { handleEvaluate } from './handlers/evaluate.ts'
import { handleRecordSignal } from './handlers/record_signal.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  admin: handleAdmin,
  backfill: handleBackfill,
  evaluate: handleEvaluate,
  record_signal: handleRecordSignal,
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
    console.error('[autopilot-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
