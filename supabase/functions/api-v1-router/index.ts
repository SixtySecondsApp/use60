import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleActivities } from './handlers/activities.ts'
import { handleCompanies } from './handlers/companies.ts'
import { handleContacts } from './handlers/contacts.ts'
import { handleDeals } from './handlers/deals.ts'
import { handleMeetings } from './handlers/meetings.ts'
import { handleTasks } from './handlers/tasks.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  activities: handleActivities,
  companies: handleCompanies,
  contacts: handleContacts,
  deals: handleDeals,
  meetings: handleMeetings,
  tasks: handleTasks,
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
    console.error('[api-v1-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
