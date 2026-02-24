/**
 * Agent Orchestrator Edge Function
 *
 * The conductor that connects existing capabilities into event-driven workflows.
 * Receives events from webhooks, cron, Slack, and self-invocations.
 *
 * Endpoints:
 * - POST with OrchestratorEvent: Start a new sequence
 * - POST with { resume_job_id }: Resume a paused sequence after HITL approval
 * - POST with { route_message: true, message, org_id, user_id, agent_name? }:
 *     Route a fleet agent message through the unified route-message pipeline.
 *     Returns a routing decision (route, skill_key, confidence, matched_by).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { runSequence, resumeSequence } from '../_shared/orchestrator/runner.ts';
import type { OrchestratorEvent } from '../_shared/orchestrator/types.ts';
import { retryDeadLetters } from '../_shared/orchestrator/deadLetter.ts';
import { runAgent } from '../_shared/agentRunner.ts';
import { resolveModel } from '../_shared/modelRouter.ts';

// =============================================================================
// Fleet Message Routing (delegates to route-message)
// =============================================================================

/**
 * Route a fleet agent message through the unified route-message edge function.
 * Uses source: 'fleet_agent' and forwards agent_name in the context payload.
 */
async function routeFleetMessage(params: {
  message: string;
  org_id: string;
  user_id: string;
  agent_name?: string;
  authorization: string;
}): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  const routeResponse = await fetch(`${supabaseUrl}/functions/v1/route-message`, {
    method: 'POST',
    headers: {
      Authorization: params.authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: params.message,
      source: 'fleet_agent',
      org_id: params.org_id,
      user_id: params.user_id,
      context: params.agent_name ? { agent_name: params.agent_name } : undefined,
    }),
  });

  return routeResponse;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Use service role for cross-user orchestration
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();

    // Route: Fleet agent message routing — delegate to route-message
    if (body.route_message === true) {
      const { message, org_id, user_id, agent_name } = body;

      if (!message || !org_id || !user_id) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: message, org_id, user_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      console.log(`[agent-orchestrator] Fleet routing: agent=${agent_name ?? 'unknown'} org=${org_id}`);

      const authorization = req.headers.get('Authorization') ?? '';
      const routeRes = await routeFleetMessage({ message, org_id, user_id, agent_name, authorization });

      // Forward the route-message response (status + body) to the caller
      const routeBody = await routeRes.text();
      return new Response(routeBody, {
        status: routeRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route: Retry dead-letter queue entries (called by cron)
    if (body.action === 'retry_dead_letters') {
      console.log('[agent-orchestrator] Processing dead-letter retry queue');
      const stats = await retryDeadLetters(supabase, body.limit || 10);
      return new Response(JSON.stringify({ success: true, ...stats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route: Resume a paused sequence
    if (body.resume_job_id) {
      console.log(`[agent-orchestrator] Resuming job: ${body.resume_job_id}`);
      const result = await resumeSequence(
        body.resume_job_id,
        body.approval_data || {},
        { supabase, startTime },
      );
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route: Start a new sequence from an event
    const event: OrchestratorEvent = {
      type: body.type,
      source: body.source || 'manual',
      org_id: body.org_id,
      user_id: body.user_id,
      payload: body.payload || {},
      parent_job_id: body.parent_job_id,
      idempotency_key: body.idempotency_key,
    };

    // Validate required fields
    if (!event.type || !event.org_id || !event.user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, org_id, user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[agent-orchestrator] New event: ${event.type} from ${event.source}`);

    // Check if caller wants synchronous (blocking) execution
    const sync = body.sync === true;

    if (sync) {
      // Resolve model for fleet agent execution (circuit breaker + fallback)
      const modelResolution = await resolveModel(supabase, {
        feature: 'fleet_agent',
        intelligenceTier: 'low',
        userId: event.user_id,
        orgId: event.org_id,
      }).catch((err) => {
        console.warn('[agent-orchestrator] resolveModel failed, fleet agent will use its own default:', err);
        return null;
      });

      if (modelResolution) {
        console.log(`[agent-orchestrator] Fleet model resolved: ${modelResolution.modelId} (wasFallback=${modelResolution.wasFallback})`);
      }

      // Synchronous mode: wait for completion (used by service-role test calls).
      // Wrapped with runAgent for retry logic, budget enforcement, and telemetry.
      const agentResult = await runAgent(
        { agentName: 'orchestrator-sequence', userId: event.user_id, orgId: event.org_id },
        (ctx) => runSequence(event, { supabase: ctx.supabase, startTime }),
      );
      const result = agentResult.success ? agentResult.data : { error: agentResult.error };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Async mode (default): start the sequence in the background, return job_id immediately.
    // The runner creates the job in the DB first, then executes steps.
    // The frontend polls sequence_jobs for live step updates.
    const sequencePromise = runSequence(event, { supabase, startTime });

    // Use EdgeRuntime.waitUntil to keep the function alive while running in background
    // @ts-ignore - EdgeRuntime is a Deno Deploy global
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(sequencePromise);
    } else {
      // Fallback: fire-and-forget (the promise runs but response returns immediately)
      sequencePromise.catch((err) => {
        console.error('[agent-orchestrator] Background sequence error:', err);
      });
    }

    // Wait briefly for the job to be created in the DB (steps 1-6 of runSequence)
    // then return the job_id to the caller so they can start polling
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Try to find the job that was just created for this user/event
    const { data: recentJob } = await supabase
      .from('sequence_jobs')
      .select('id, status')
      .eq('user_id', event.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentJob) {
      return new Response(JSON.stringify({ job_id: recentJob.id, status: recentJob.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Job not yet created — return a pending status
    return new Response(JSON.stringify({ status: 'pending', message: 'Sequence starting...' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[agent-orchestrator] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error), status: 'error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
