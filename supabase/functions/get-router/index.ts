import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleAgentSkills } from './handlers/agentSkills.ts'
import { handleAggregatedTopics } from './handlers/aggregatedTopics.ts'
import { handleBatchSignedUrls } from './handlers/batchSignedUrls.ts'
import { handleCreditMenu } from './handlers/creditMenu.ts'
import { handleCreditUsageSummary } from './handlers/creditUsageSummary.ts'
import { handleInvitationByToken } from './handlers/invitationByToken.ts'
import { handleRecordingUrl } from './handlers/recordingUrl.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  agent_skills: handleAgentSkills,
  aggregated_topics: handleAggregatedTopics,
  batch_signed_urls: handleBatchSignedUrls,
  credit_menu: handleCreditMenu,
  credit_usage_summary: handleCreditUsageSummary,
  invitation_by_token: handleInvitationByToken,
  recording_url: handleRecordingUrl,
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
    console.error('[get-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
