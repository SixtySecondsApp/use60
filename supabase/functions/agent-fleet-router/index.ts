/**
 * agent-fleet-router
 *
 * Consolidated router for agent-* edge functions. Dispatches to the correct
 * handler based on the `action` field in the JSON request body.
 *
 * Usage:
 *   POST /functions/v1/agent-fleet-router
 *   Body: { "action": "orchestrator", ...originalPayload }
 *
 * EXCLUDED (cron targets — must remain standalone):
 *   - agent-engagement-patterns  (cron target)
 *   - agent-org-learning          (cron target)
 *   - agent-pipeline-snapshot     (cron target)
 *   - agent-crm-heartbeat         (cron target — scheduled via cron.schedule
 *                                   in 20260222300004_schedule_crm_heartbeat_cron.sql)
 *
 * Deploy: npx supabase functions deploy agent-fleet-router --project-ref <ref> --no-verify-jwt
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts';

// Handler imports
import { handleCompetitiveIntel } from './handlers/competitive-intel.ts';
import { handleConfigAdmin } from './handlers/config-admin.ts';
import { handleCrmApproval } from './handlers/crm-approval.ts';
import { handleCrmUpdate } from './handlers/crm-update.ts';
import { handleDeadLetterRetry } from './handlers/dead-letter-retry.ts';
import { handleDealRiskBatch } from './handlers/deal-risk-batch.ts';
import { handleDealTemperature } from './handlers/deal-temperature.ts';
import { handleEmailSignals } from './handlers/email-signals.ts';
import { handleEodSynthesis } from './handlers/eod-synthesis.ts';
import { handleInitialScan } from './handlers/initial-scan.ts';
import { handleMorningBriefing } from './handlers/morning-briefing.ts';
import { handleOrchestrator } from './handlers/orchestrator.ts';
import { handlePipelinePatterns } from './handlers/pipeline-patterns.ts';
import { handleReengagement } from './handlers/reengagement.ts';
import { handleRelationshipGraph } from './handlers/relationship-graph.ts';
import { handleScheduler } from './handlers/scheduler.ts';
import { handleTrigger } from './handlers/trigger.ts';

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  competitive_intel: handleCompetitiveIntel,
  config_admin: handleConfigAdmin,
  crm_approval: handleCrmApproval,
  crm_update: handleCrmUpdate,
  dead_letter_retry: handleDeadLetterRetry,
  deal_risk_batch: handleDealRiskBatch,
  deal_temperature: handleDealTemperature,
  email_signals: handleEmailSignals,
  eod_synthesis: handleEodSynthesis,
  initial_scan: handleInitialScan,
  morning_briefing: handleMorningBriefing,
  orchestrator: handleOrchestrator,
  pipeline_patterns: handlePipelinePatterns,
  reengagement: handleReengagement,
  relationship_graph: handleRelationshipGraph,
  scheduler: handleScheduler,
  trigger: handleTrigger,
};

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const bodyText = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    const action = body.action as string;
    if (!action || !HANDLERS[action]) {
      return new Response(
        JSON.stringify({
          error: `Invalid or missing action. Must be one of: ${Object.keys(HANDLERS).join(', ')}`,
          received: action ?? null,
        }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // Reconstruct request with original body for the handler
    const handlerReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: bodyText,
    });

    return await HANDLERS[action](handlerReq);
  } catch (error: unknown) {
    console.error('[agent-fleet-router] Router error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
