/**
 * Agent Orchestrator Edge Function
 *
 * The conductor that connects existing capabilities into event-driven workflows.
 * Receives events from webhooks, cron, Slack, and self-invocations.
 *
 * Endpoints:
 * - POST with OrchestratorEvent: Start a new sequence
 * - POST with { resume_job_id }: Resume a paused sequence after HITL approval
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { runSequence, resumeSequence } from '../_shared/orchestrator/runner.ts';
import type { OrchestratorEvent } from '../_shared/orchestrator/types.ts';

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

    const result = await runSequence(event, { supabase, startTime });

    return new Response(JSON.stringify(result), {
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
