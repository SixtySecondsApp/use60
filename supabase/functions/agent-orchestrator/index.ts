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
import { retryDeadLetters } from '../_shared/orchestrator/deadLetter.ts';

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
      // Synchronous mode: wait for completion (used by service-role test calls)
      const result = await runSequence(event, { supabase, startTime });
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
