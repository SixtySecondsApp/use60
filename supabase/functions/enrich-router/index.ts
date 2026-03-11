import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleCascade } from './handlers/cascade.ts'
import { handleCompany } from './handlers/company.ts'
import { handleCrmRecord } from './handlers/crm_record.ts'
import { handleDynamicTable } from './handlers/dynamic_table.ts'
import { handleMeetingNextActions } from './handlers/meeting_next_actions.ts'
import { handleOrganization } from './handlers/organization.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  cascade: handleCascade,
  company: handleCompany,
  crm_record: handleCrmRecord,
  dynamic_table: handleDynamicTable,
  meeting_next_actions: handleMeetingNextActions,
  organization: handleOrganization,
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
    console.error('[enrich-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
