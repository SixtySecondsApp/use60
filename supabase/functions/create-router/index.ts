import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleApiKey } from './handlers/apiKey.ts'
import { handleCalendarEvent } from './handlers/calendarEvent.ts'
import { handleDealStages } from './handlers/dealStages.ts'
import { handleProfile } from './handlers/profile.ts'
import { handleTaskFromActionItem } from './handlers/taskFromActionItem.ts'
import { handleTaskUnified } from './handlers/taskUnified.ts'
import { handleUsersFromProfiles } from './handlers/usersFromProfiles.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  api_key: handleApiKey,
  calendar_event: handleCalendarEvent,
  deal_stages: handleDealStages,
  profile: handleProfile,
  task_from_action_item: handleTaskFromActionItem,
  task_unified: handleTaskUnified,
  users_from_profiles: handleUsersFromProfiles,
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
    console.error('[create-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
