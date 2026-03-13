/**
 * Meeting Router Edge Function
 *
 * Consolidates 8 meeting-related edge functions into a single router.
 * Routes requests based on `action` field in the JSON body.
 *
 * Actions:
 *   aggregate_insights_query  — Aggregate meeting insights queries
 *   analysis_batch            — Batch meeting detail page data
 *   analytics                 — Meeting analytics proxy (Railway API)
 *   generate_scorecard        — Coaching scorecard generation
 *   intelligence_index        — File Search indexing
 *   intelligence_search       — Semantic meeting search (deprecated)
 *   limit_warning_email       — Meeting limit warning emails
 *   process_structured_summary — Structured summary extraction
 *
 * NOT included (separate functions):
 *   meeting-analytics-cron
 *   meeting-intelligence-process-queue
 *   meeting-workflow-notifications
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { handleAggregateInsightsQuery } from './handlers/aggregate-insights-query.ts'
import { handleAnalysisBatch } from './handlers/analysis-batch.ts'
import { handleGenerateScorecard } from './handlers/generate-scorecard.ts'
import { handleIntelligenceIndex } from './handlers/intelligence-index.ts'
import { handleIntelligenceSearch } from './handlers/intelligence-search.ts'
import { handleLimitWarningEmail } from './handlers/limit-warning-email.ts'
import { handleProcessStructuredSummary } from './handlers/process-structured-summary.ts'
import { handleShareVideoUrl } from './handlers/share-video-url.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  aggregate_insights_query: handleAggregateInsightsQuery,
  analysis_batch: handleAnalysisBatch,
  generate_scorecard: handleGenerateScorecard,
  intelligence_index: handleIntelligenceIndex,
  intelligence_search: handleIntelligenceSearch,
  limit_warning_email: handleLimitWarningEmail,
  process_structured_summary: handleProcessStructuredSummary,
  share_video_url: handleShareVideoUrl,
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
    console.error('[meeting-router] Router error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
