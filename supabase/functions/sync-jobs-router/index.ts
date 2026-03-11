import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleAiModels } from './handlers/ai_models.ts'
import { handleFactProfileContext } from './handlers/fact_profile_context.ts'
import { handleProfileNames } from './handlers/profile_names.ts'
import { handleRecordingToCrm } from './handlers/recording_to_crm.ts'
import { handleSkillsFromGithub } from './handlers/skills_from_github.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  ai_models: handleAiModels,
  fact_profile_context: handleFactProfileContext,
  profile_names: handleProfileNames,
  recording_to_crm: handleRecordingToCrm,
  skills_from_github: handleSkillsFromGithub,
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
    console.error('[sync-jobs-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
