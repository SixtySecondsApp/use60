/**
 * Process Jobs Router
 *
 * Consolidates multiple process-* edge functions into a single router.
 * Dispatches to the correct handler based on the `action` field in the request body.
 *
 * Actions:
 *   - ai_analysis       (was process-ai-analysis)
 *   - calendar_events   (was process-calendar-events)
 *   - lead_prep         (was process-lead-prep)
 *   - single_activity   (was process-single-activity)
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleAiAnalysis } from './handlers/ai-analysis.ts'
import { handleCalendarEvents } from './handlers/calendar-events.ts'
import { handleLeadPrep } from './handlers/lead-prep.ts'
import { handleSingleActivity } from './handlers/single-activity.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  ai_analysis: handleAiAnalysis,
  calendar_events: handleCalendarEvents,
  lead_prep: handleLeadPrep,
  single_activity: handleSingleActivity,
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
    console.error('[process-jobs-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
