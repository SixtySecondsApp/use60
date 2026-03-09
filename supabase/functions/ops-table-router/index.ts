/// <reference path="../deno.d.ts" />

/**
 * Ops Table Router
 *
 * Consolidates 7 ops-table-* edge functions into a single function
 * that routes based on the `action` field in the request body.
 *
 * POST /ops-table-router
 * Body: { action: string, ...handlerPayload }
 *
 * Actions:
 *   ai_query           -> ops-table-ai-query
 *   cross_query        -> ops-table-cross-query
 *   insights_engine    -> ops-table-insights-engine
 *   predictions        -> ops-table-predictions
 *   transform_column   -> ops-table-transform-column
 *   workflow_engine    -> ops-table-workflow-engine
 *   workflow_orchestrator -> ops-workflow-orchestrator
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleAiQuery } from './handlers/ai_query.ts'
import { handleCrossQuery } from './handlers/cross_query.ts'
import { handleInsightsEngine } from './handlers/insights_engine.ts'
import { handlePredictions } from './handlers/predictions.ts'
import { handleTransformColumn } from './handlers/transform_column.ts'
import { handleWorkflowEngine } from './handlers/workflow_engine.ts'
import { handleWorkflowOrchestrator } from './handlers/workflow_orchestrator.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  ai_query: handleAiQuery,
  cross_query: handleCrossQuery,
  insights_engine: handleInsightsEngine,
  predictions: handlePredictions,
  transform_column: handleTransformColumn,
  workflow_engine: handleWorkflowEngine,
  workflow_orchestrator: handleWorkflowOrchestrator,
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
    console.error('[ops-table-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
