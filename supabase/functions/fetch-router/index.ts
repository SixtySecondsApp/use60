import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleCompanyLogo } from './handlers/company-logo.ts'
import { handleCompanyLogosBatch } from './handlers/company-logos-batch.ts'
import { handleDeepgramUsage } from './handlers/deepgram-usage.ts'
import { handleGladiaUsage } from './handlers/gladia-usage.ts'
import { handleLogo } from './handlers/logo.ts'
import { handleMeetingbaasUsage } from './handlers/meetingbaas-usage.ts'
import { handleOpenrouterModels } from './handlers/openrouter-models.ts'
import { handleSavvycalLink } from './handlers/savvycal-link.ts'
import { handleSummary } from './handlers/summary.ts'
import { handleTranscript } from './handlers/transcript.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  company_logo: handleCompanyLogo,
  company_logos_batch: handleCompanyLogosBatch,
  deepgram_usage: handleDeepgramUsage,
  gladia_usage: handleGladiaUsage,
  logo: handleLogo,
  meetingbaas_usage: handleMeetingbaasUsage,
  openrouter_models: handleOpenrouterModels,
  savvycal_link: handleSavvycalLink,
  summary: handleSummary,
  transcript: handleTranscript,
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
    console.error('[fetch-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
