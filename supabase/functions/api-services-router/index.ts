/**
 * api-services-router
 *
 * Consolidated router for internal api-* edge functions.
 * Dispatches to the correct handler based on `body.action`.
 *
 * Actions:
 *   action_centre, auth, copilot, copilot_memory, monitor,
 *   proxy, sequence_execute, skill_builder, skill_execute, usage_alerts
 *
 * Optional body fields:
 *   - path: sub-path to append (e.g. "/chat", "/snapshot") for handlers that use URL routing
 *   - method: override HTTP method for the handler (default: original method)
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { handleActionCentre } from './handlers/action-centre.ts';
import { handleAuth } from './handlers/auth.ts';
import { handleCopilot } from './handlers/copilot.ts';
import { handleCopilotMemory } from './handlers/copilot-memory.ts';
import { handleMonitor } from './handlers/monitor.ts';
import { handleProxy } from './handlers/proxy.ts';
import { handleSequenceExecute } from './handlers/sequence-execute.ts';
import { handleSkillBuilder } from './handlers/skill-builder.ts';
import { handleSkillExecute } from './handlers/skill-execute.ts';
import { handleUsageAlerts } from './handlers/usage-alerts.ts';

/** Maps action names to their original edge-function path segment (used for URL rewriting) */
const ACTION_TO_FUNCTION_NAME: Record<string, string> = {
  action_centre: 'api-action-centre',
  auth: 'api-auth',
  copilot: 'api-copilot',
  copilot_memory: 'api-copilot-memory',
  monitor: 'api-monitor',
  proxy: 'api-proxy',
  sequence_execute: 'api-sequence-execute',
  skill_builder: 'api-skill-builder',
  skill_execute: 'api-skill-execute',
  usage_alerts: 'api-usage-alerts',
};

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  action_centre: handleActionCentre,
  auth: handleAuth,
  copilot: handleCopilot,
  copilot_memory: handleCopilotMemory,
  monitor: handleMonitor,
  proxy: handleProxy,
  sequence_execute: handleSequenceExecute,
  skill_builder: handleSkillBuilder,
  skill_execute: handleSkillExecute,
  usage_alerts: handleUsageAlerts,
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
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const action = body.action as string;
    if (!action || !HANDLERS[action]) {
      return new Response(
        JSON.stringify({
          error: `Invalid or missing action. Must be one of: ${Object.keys(HANDLERS).join(', ')}`,
          received: action ?? null,
        }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Build a URL that the handler can parse as if the original function was called directly.
    // e.g. body.path = "/chat" with action = "copilot"
    //   => URL becomes .../functions/v1/api-copilot/chat
    const originalUrl = new URL(req.url);
    const functionName = ACTION_TO_FUNCTION_NAME[action];
    const subPath = typeof body.path === 'string' ? body.path.replace(/^\//, '') : '';
    const newPathname = `/functions/v1/${functionName}${subPath ? '/' + subPath : ''}`;
    originalUrl.pathname = newPathname;

    // Allow callers to override the HTTP method (e.g. GET for monitor queries)
    const overrideMethod = typeof body.method === 'string' ? body.method.toUpperCase() : req.method;

    // For GET/HEAD overrides, copy body fields as query parameters so handlers
    // that read URL search params (e.g. monitor reads ?from=...&to=...) work correctly.
    if (overrideMethod === 'GET' || overrideMethod === 'HEAD') {
      const reservedKeys = new Set(['action', 'path', 'method']);
      for (const [key, value] of Object.entries(body)) {
        if (!reservedKeys.has(key) && value !== undefined && value !== null) {
          originalUrl.searchParams.set(key, String(value));
        }
      }
    }

    // Build a new Request so the handler can re-read the body
    const handlerReq = new Request(originalUrl.toString(), {
      method: overrideMethod,
      headers: req.headers,
      body: overrideMethod === 'GET' || overrideMethod === 'HEAD' ? null : bodyText,
    });

    return await HANDLERS[action](handlerReq);
  } catch (error: unknown) {
    console.error('[api-services-router] Router error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});
