/**
 * Orchestrator Runner
 *
 * Executes event-driven sequences with:
 * - Self-invocation for long-running sequences (edge function timeout handling)
 * - Idempotency checks (prevent duplicate processing)
 * - Chain depth limits (prevent infinite loops)
 * - Retry logic for transient errors
 * - HITL approval pauses
 * - Follow-up event queueing
 *
 * Entry points:
 * - runSequence() - Start a new sequence from an event
 * - resumeSequence() - Resume after HITL approval
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  OrchestratorEvent,
  SequenceState,
  SequenceStep,
  StepResult,
  QueuedFollowup,
  SkillAdapter,
} from './types.ts';
import {
  SAFETY_MARGIN_MS,
  EDGE_FUNCTION_TIMEOUT_MS,
  MAX_STEP_RETRIES,
  DEFAULT_STEP_TIMEOUT_MS,
} from './types.ts';
import { getSequenceForEvent, getRequiredContextTiers } from './eventSequences.ts';
import { loadContext } from './contextLoader.ts';

// Chain depth constant from types (not exported, so defined here too)
const MAX_CHAIN_DEPTH = 5;

interface RunnerOptions {
  supabase: SupabaseClient;
  startTime: number; // Date.now() when edge function started
}

/**
 * Start a new orchestrated sequence from an event.
 */
export async function runSequence(
  event: OrchestratorEvent,
  options: RunnerOptions,
): Promise<{ job_id: string; status: string; error?: string }> {
  const { supabase, startTime } = options;

  // 1. Idempotency check
  if (event.idempotency_key) {
    const existing = await checkIdempotency(supabase, event.idempotency_key);
    if (existing) {
      return { job_id: existing.id, status: 'duplicate', error: 'Duplicate event' };
    }
  }

  // 2. Chain depth check
  if (event.parent_job_id) {
    const depth = await getChainDepth(supabase, event.parent_job_id);
    if (depth >= MAX_CHAIN_DEPTH) {
      return { job_id: '', status: 'rejected', error: `Chain depth ${depth} exceeds max ${MAX_CHAIN_DEPTH}` };
    }
  }

  // 3. Get sequence definition
  const steps = getSequenceForEvent(event.type);
  const availableSteps = steps.filter(s => s.available);
  if (availableSteps.length === 0) {
    return { job_id: '', status: 'skipped', error: 'No available steps for event type' };
  }

  // 4. Load context ONCE
  const requiredTiers = getRequiredContextTiers(availableSteps);
  const context = await loadContext(supabase, event, requiredTiers);

  // 5. Cost budget gate at sequence start
  if (!context.tier1.costBudget.allowed) {
    return { job_id: '', status: 'budget_exceeded', error: context.tier1.costBudget.reason };
  }

  // 6. Create sequence job record
  const { data: jobData, error: jobError } = await supabase.rpc('start_sequence_job', {
    p_sequence_skill_id: null, // orchestrator-managed, not skill-linked
    p_user_id: event.user_id,
    p_organization_id: event.org_id,
    p_initial_input: {
      event_type: event.type,
      event_source: event.source,
      payload: event.payload,
    },
  });

  if (jobError || !jobData) {
    return { job_id: '', status: 'error', error: `Failed to create job: ${jobError?.message}` };
  }

  const jobId = jobData as string;

  // Update with orchestrator-specific columns
  await supabase.from('sequence_jobs').update({
    event_source: event.source,
    event_chain: event.parent_job_id ? { parent: event.parent_job_id } : {},
    trigger_payload: event.payload,
    idempotency_key: event.idempotency_key || null,
  }).eq('id', jobId);

  // 7. Build initial state
  const state: SequenceState = {
    event,
    context,
    steps_completed: [],
    outputs: {},
    pending_approvals: [],
    queued_followups: [],
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 8. Execute steps
  return await executeSteps(supabase, jobId, state, availableSteps, startTime);
}

/**
 * Resume a paused sequence (after HITL approval).
 */
export async function resumeSequence(
  jobId: string,
  approvalData: Record<string, unknown>,
  options: RunnerOptions,
): Promise<{ job_id: string; status: string; error?: string }> {
  const { supabase, startTime } = options;

  // Load persisted state from sequence_jobs.context
  const { data: job, error } = await supabase
    .from('sequence_jobs')
    .select('id, context, status, current_step')
    .eq('id', jobId)
    .maybeSingle();

  if (error || !job) {
    return { job_id: jobId, status: 'error', error: 'Job not found' };
  }

  if (job.status !== 'waiting_approval') {
    return { job_id: jobId, status: 'error', error: `Job is ${job.status}, not waiting_approval` };
  }

  // Resume the job
  await supabase.rpc('resume_sequence_job', {
    p_job_id: jobId,
    p_approval_data: approvalData,
  });

  // Rebuild state from persisted context
  const state = job.context as SequenceState;
  state.updated_at = new Date().toISOString();

  // Get remaining steps
  const allSteps = getSequenceForEvent(state.event.type).filter(s => s.available);
  const remainingSteps = allSteps.filter(s => !state.steps_completed.includes(s.skill));

  return await executeSteps(supabase, jobId, state, remainingSteps, startTime);
}

/**
 * Core step execution loop.
 */
async function executeSteps(
  supabase: SupabaseClient,
  jobId: string,
  state: SequenceState,
  steps: SequenceStep[],
  startTime: number,
): Promise<{ job_id: string; status: string; error?: string }> {

  for (const step of steps) {
    // Already completed? Skip.
    if (state.steps_completed.includes(step.skill)) continue;

    // Time check: self-invoke if running low
    const elapsed = Date.now() - startTime;
    const remaining = EDGE_FUNCTION_TIMEOUT_MS - elapsed;
    if (remaining < SAFETY_MARGIN_MS) {
      // Persist state and self-invoke
      await persistState(supabase, jobId, state);
      await selfInvoke(jobId);
      return { job_id: jobId, status: 'continuing' };
    }

    state.current_step = step.skill;
    state.updated_at = new Date().toISOString();

    // Update step tracking in DB
    await supabase.rpc('update_sequence_job_step', {
      p_job_id: jobId,
      p_step: state.steps_completed.length + 1,
      p_skill_key: step.skill,
      p_output: null,
      p_status: 'running',
    });

    // Execute step with retries
    const result = await executeStepWithRetry(supabase, state, step);

    if (result.success) {
      state.steps_completed.push(step.skill);
      state.outputs[step.skill] = result.output;

      // Collect queued followups
      if (result.queued_followups) {
        state.queued_followups.push(...result.queued_followups);
      }

      // Handle approval pause
      if (result.pending_approval) {
        state.pending_approvals.push(result.pending_approval);
        await persistState(supabase, jobId, state);
        await supabase.rpc('pause_sequence_job', {
          p_job_id: jobId,
          p_approval_channel: 'slack',
          p_approval_request_id: null,
        });
        return { job_id: jobId, status: 'waiting_approval' };
      }

      // Update step as completed
      await supabase.rpc('update_sequence_job_step', {
        p_job_id: jobId,
        p_step: state.steps_completed.length,
        p_skill_key: step.skill,
        p_output: result.output,
        p_status: 'completed',
      });

    } else {
      // Step failed
      if (step.criticality === 'critical') {
        // Critical step failure — halt sequence
        state.error = `Critical step ${step.skill} failed: ${result.error}`;
        await persistState(supabase, jobId, state);

        await supabase.from('sequence_jobs').update({
          status: 'failed',
          error_message: result.error,
          error_step: step.skill,
        }).eq('id', jobId);

        return { job_id: jobId, status: 'failed', error: result.error };
      }
      // Best-effort step failure — log and continue
      console.warn(`[orchestrator] Best-effort step ${step.skill} failed: ${result.error}`);
      state.steps_completed.push(step.skill); // Mark as attempted
      state.outputs[step.skill] = { error: result.error, skipped: true };
    }
  }

  // All steps complete — process queued followups
  await processFollowups(supabase, jobId, state);

  // Mark job complete
  await supabase.rpc('complete_sequence_job', {
    p_job_id: jobId,
    p_final_output: {
      steps_completed: state.steps_completed,
      outputs: state.outputs,
      queued_followups: state.queued_followups.length,
    },
  });

  return { job_id: jobId, status: 'completed' };
}

/**
 * Execute a step with retry logic for transient errors.
 */
async function executeStepWithRetry(
  supabase: SupabaseClient,
  state: SequenceState,
  step: SequenceStep,
): Promise<StepResult> {
  // Dynamic import of adapter registry to avoid circular deps
  const { getAdapter } = await import('./adapters/index.ts');

  const adapter = getAdapter(step.skill);
  if (!adapter) {
    // No adapter — try calling as edge function directly
    return await callEdgeFunctionDirect(step.skill, state);
  }

  let lastError: string | undefined;
  for (let attempt = 0; attempt <= MAX_STEP_RETRIES; attempt++) {
    try {
      const result = await adapter.execute(state, step);
      if (result.success) return result;

      // Check if error is transient
      if (!isTransientError(result.error || '') || attempt === MAX_STEP_RETRIES) {
        return result;
      }

      lastError = result.error;
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));

    } catch (err) {
      lastError = String(err);
      if (attempt === MAX_STEP_RETRIES) break;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { success: false, error: lastError, duration_ms: 0 };
}

/**
 * Fallback: call an edge function directly when no adapter exists.
 */
async function callEdgeFunctionDirect(
  skillName: string,
  state: SequenceState,
): Promise<StepResult> {
  const start = Date.now();
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Convert skill name to edge function name (skill names use hyphens)
    const functionName = skillName;

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        org_id: state.event.org_id,
        user_id: state.event.user_id,
        ...state.event.payload,
        context: state.context,
        previous_outputs: state.outputs,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${functionName} returned ${response.status}: ${errorText}`);
    }

    const output = await response.json();
    return { success: true, output, duration_ms: Date.now() - start };
  } catch (err) {
    return { success: false, error: String(err), duration_ms: Date.now() - start };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function checkIdempotency(supabase: SupabaseClient, key: string) {
  const { data } = await supabase
    .from('sequence_jobs')
    .select('id, status')
    .eq('idempotency_key', key)
    .not('status', 'eq', 'failed')
    .maybeSingle();
  return data;
}

async function getChainDepth(supabase: SupabaseClient, parentJobId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = parentJobId;

  while (currentId && depth < MAX_CHAIN_DEPTH + 1) {
    const { data } = await supabase
      .from('sequence_jobs')
      .select('event_chain')
      .eq('id', currentId)
      .maybeSingle();

    if (!data?.event_chain?.parent) break;
    currentId = data.event_chain.parent;
    depth++;
  }

  return depth;
}

async function persistState(
  supabase: SupabaseClient,
  jobId: string,
  state: SequenceState,
): Promise<void> {
  await supabase.from('sequence_jobs').update({
    context: state as unknown as Record<string, unknown>,
  }).eq('id', jobId);
}

async function selfInvoke(jobId: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Fire-and-forget self-invocation
  fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ resume_job_id: jobId }),
  }).catch(err => {
    console.error(`[orchestrator] Self-invoke failed for job ${jobId}:`, err);
  });
}

async function processFollowups(
  supabase: SupabaseClient,
  jobId: string,
  state: SequenceState,
): Promise<void> {
  for (const followup of state.queued_followups) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const event: OrchestratorEvent = {
        type: followup.type,
        source: followup.source,
        org_id: state.event.org_id,
        user_id: state.event.user_id,
        payload: followup.payload,
        parent_job_id: jobId,
        idempotency_key: `${followup.type}:${jobId}:${followup.type}`,
      };

      if (followup.delay_minutes && followup.delay_minutes > 0) {
        // Store for delayed execution (could use pg_cron or scheduled invoke)
        console.log(`[orchestrator] Queued delayed followup: ${followup.type} in ${followup.delay_minutes}min`);
        // For now, fire immediately — delayed execution is a future enhancement
      }

      // Fire-and-forget
      fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }).catch(err => {
        console.error(`[orchestrator] Follow-up ${followup.type} failed:`, err);
      });

    } catch (err) {
      console.error(`[orchestrator] Failed to process followup:`, err);
    }
  }
}

function isTransientError(error: string): boolean {
  const transientPatterns = [
    'timeout',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    '429',
    '502',
    '503',
    '504',
    'rate limit',
    'temporarily unavailable',
    'network error',
  ];
  const lowerError = error.toLowerCase();
  return transientPatterns.some(pattern => lowerError.includes(pattern.toLowerCase()));
}
