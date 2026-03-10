import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleMeetingPrep } from './handlers/meetingPrep.ts'
import { handlePipelineAnalysis } from './handlers/pipelineAnalysis.ts'
import { handleSignalScanner } from './handlers/signalScanner.ts'
import { handleTaskAnalysis } from './handlers/taskAnalysis.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  meeting_prep: handleMeetingPrep,
  pipeline_analysis: handlePipelineAnalysis,
  signal_scanner: handleSignalScanner,
  task_analysis: handleTaskAnalysis,
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
    console.error('[proactive-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
