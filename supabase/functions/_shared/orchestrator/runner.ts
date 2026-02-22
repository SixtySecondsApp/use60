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
import { getSequenceForEvent, getRequiredContextTiers, getCallTypeFromState } from './eventSequences.ts';
import { loadContext } from './contextLoader.ts';
import { getAgentConfig } from '../config/agentConfigEngine.ts';
import type { AgentConfigMap } from '../config/types.ts';
import { resolveRoute, getSequenceSteps, getHandoffRoutes, evaluateHandoffConditions, applyContextMapping, getAgentTypeForSkill } from './fleetRouter.ts';
import { enqueueDeadLetter } from './deadLetter.ts';
import { isCircuitAllowed, recordSuccess, recordFailure, loadPersistedState, getStateToPersist } from './circuitBreaker.ts';
import { maybeEvaluateConfigQuestion } from '../config/questionTriggerHook.ts';

// Steps that should only run for sales calls (Discovery, Demo, Close)
const SALES_ONLY_STEPS = new Set([
  'detect-intents',
  'suggest-next-actions',
  'draft-followup-email',
]);

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

  // 3. Get sequence definition (DB-driven with hardcoded fallback)
  let steps: SequenceStep[];
  let routeSource: 'db' | 'hardcoded';
  try {
    const route = await resolveRoute(supabase, event.org_id, event.type);
    const seqResult = await getSequenceSteps(supabase, event.org_id, route.sequenceKey);
    steps = seqResult.steps;
    routeSource = seqResult.source === 'db' ? 'db' : route.source;
    console.log(`[runner] Route resolved: ${route.sequenceKey} (source: ${routeSource})`);
  } catch (routeErr) {
    console.warn('[runner] Fleet route resolution failed, using hardcoded:', routeErr);
    steps = getSequenceForEvent(event.type);
    routeSource = 'hardcoded';
  }
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

  // 6. Settings gate: org and user preferences
  // 6a. Check org-level proactive agent config
  const { data: orgConfig, error: orgConfigError } = await supabase
    .from('proactive_agent_config')
    .select('is_enabled, enabled_sequences')
    .eq('org_id', event.org_id)
    .maybeSingle();

  if (orgConfigError) {
    console.error('[runner] Settings gate: Error fetching org config:', orgConfigError);
  }

  // If no config exists or is_enabled is false, reject
  if (!orgConfig || !orgConfig.is_enabled) {
    console.log('[runner] Settings gate: Proactive agent disabled for org', event.org_id);
    return { job_id: '', status: 'feature_disabled', error: 'Proactive agent disabled for org' };
  }

  // Check if the specific sequence is enabled in org config
  const sequenceConfig = orgConfig.enabled_sequences?.[event.type];
  if (!sequenceConfig?.enabled) {
    console.log('[runner] Settings gate: Sequence disabled by org admin', event.type);
    return { job_id: '', status: 'sequence_disabled', error: 'Sequence disabled by admin' };
  }

  console.log('[runner] Settings gate: Org config passed for', event.type);

  // 6b. Check user-level opt-out (if user_id is present)
  if (event.user_id) {
    const { data: userPref, error: userPrefError } = await supabase
      .from('user_sequence_preferences')
      .select('is_enabled')
      .eq('user_id', event.user_id)
      .eq('org_id', event.org_id)
      .eq('sequence_type', event.type)
      .maybeSingle();

    if (userPrefError) {
      console.error('[runner] Settings gate: Error fetching user preferences:', userPrefError);
    }

    // If user has a preference row and is_enabled is false, reject
    if (userPref && userPref.is_enabled === false) {
      console.log('[runner] Settings gate: User opted out of sequence', event.user_id, event.type);
      return { job_id: '', status: 'user_opted_out', error: 'User opted out of sequence' };
    }

    console.log('[runner] Settings gate: User preference check passed (or inherited org default)');
  }

  console.log('[runner] Settings gate: All checks passed, proceeding with sequence', event.type);

  // 7. Load agent config from config engine (supplements existing settings gates)
  let agentConfig: AgentConfigMap | null = null;
  try {
    // Map event type to agent type
    const agentTypeMap: Record<string, string> = {
      'meeting.completed': 'internal_meeting_prep',
      'deal.stage_changed': 'deal_risk',
      'deal.at_risk': 'deal_risk',
      'deal.stalled': 'reengagement',
      'morning.trigger': 'morning_briefing',
      'eod.trigger': 'eod_synthesis',
      'email.received': 'email_signals',
      'coaching.trigger': 'coaching_digest',
      'contact.updated': 'crm_update',
    };
    const agentType = agentTypeMap[event.type] || 'global';
    agentConfig = await getAgentConfig(supabase, event.org_id, event.user_id || null, agentType as any);
    console.log('[runner] Config engine: loaded config for', agentType, 'with', Object.keys(agentConfig.entries).length, 'keys');
  } catch (configErr) {
    // Non-fatal: if config engine fails, proceed with defaults
    console.warn('[runner] Config engine: failed to load, proceeding without:', configErr);
  }

  // 8. Create sequence job record (with RPC fallback)
  const { jobId: newJobId, error: jobError } = await rpcStartJob(supabase, event);

  if (jobError || !newJobId) {
    return { job_id: '', status: 'error', error: `Failed to create job: ${jobError}` };
  }

  const jobId = newJobId;

  // Update with orchestrator-specific columns (non-fatal if columns missing)
  try {
    await supabase.from('sequence_jobs').update({
      event_source: event.source,
      event_chain: event.parent_job_id ? { parent: event.parent_job_id } : {},
      trigger_payload: event.payload,
      idempotency_key: event.idempotency_key || null,
    }).eq('id', jobId);
  } catch {
    console.warn('[orchestrator] Could not update orchestrator columns on sequence_jobs');
  }

  // 9. Build initial state
  const state: SequenceState = {
    event,
    context,
    steps_completed: [],
    outputs: {},
    pending_approvals: [],
    queued_followups: [],
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agentConfig: agentConfig?.entries ?? null,
  };

  // 9. Execute steps
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

  // Resume the job (with direct fallback)
  const { error: resumeError } = await supabase.rpc('resume_sequence_job', {
    p_job_id: jobId,
    p_approval_data: approvalData,
  });
  if (resumeError?.message?.includes('does not exist') || resumeError?.code === '42883') {
    await supabase.from('sequence_jobs').update({
      status: 'running',
      waiting_for_approval_since: null,
      context: { ...((job.context as Record<string, unknown>) || {}), approval_data: approvalData },
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);
  }

  // Rebuild state from persisted context
  const state = job.context as SequenceState;
  state.updated_at = new Date().toISOString();

  // Restore circuit breaker state from persisted context
  loadPersistedState((state as any)._circuitBreakerState);

  // Get remaining steps (DB-driven with fallback)
  let allSteps: SequenceStep[];
  try {
    const route = await resolveRoute(supabase, state.event.org_id, state.event.type);
    const seqResult = await getSequenceSteps(supabase, state.event.org_id, route.sequenceKey);
    allSteps = seqResult.steps.filter(s => s.available);
  } catch {
    allSteps = getSequenceForEvent(state.event.type).filter(s => s.available);
  }
  const remainingSteps = allSteps.filter(s => !state.steps_completed.includes(s.skill));

  return await executeSteps(supabase, jobId, state, remainingSteps, startTime);
}

/**
 * Core step execution loop.
 *
 * Supports parallel execution when steps declare `depends_on`.
 * Steps whose dependencies are all satisfied run concurrently in waves.
 * Falls back to sequential execution when no depends_on is declared.
 */
async function executeSteps(
  supabase: SupabaseClient,
  jobId: string,
  state: SequenceState,
  steps: SequenceStep[],
  startTime: number,
): Promise<{ job_id: string; status: string; error?: string }> {

  // Check if any step uses depends_on — if so, use parallel wave execution
  const hasParallelDeps = steps.some(s => s.depends_on !== undefined);

  if (hasParallelDeps) {
    return await executeStepsParallel(supabase, jobId, state, steps, startTime);
  }

  // Sequential fallback for sequences without depends_on
  return await executeStepsSequential(supabase, jobId, state, steps, startTime);
}

/**
 * Parallel wave-based execution. Steps run concurrently when their
 * dependencies are satisfied. Each wave waits for all parallel steps.
 */
async function executeStepsParallel(
  supabase: SupabaseClient,
  jobId: string,
  state: SequenceState,
  steps: SequenceStep[],
  startTime: number,
): Promise<{ job_id: string; status: string; error?: string }> {

  const remaining = new Set(steps.filter(s => !state.steps_completed.includes(s.skill)).map(s => s.skill));
  const stepMap = new Map(steps.map(s => [s.skill, s]));
  let waveNum = 0;

  while (remaining.size > 0) {
    waveNum++;

    // Time check: self-invoke if running low
    const elapsed = Date.now() - startTime;
    const timeLeft = EDGE_FUNCTION_TIMEOUT_MS - elapsed;
    if (timeLeft < SAFETY_MARGIN_MS) {
      // Persist circuit breaker state for next invocation
      (state as any)._circuitBreakerState = getStateToPersist();
      await persistState(supabase, jobId, state);
      await selfInvoke(jobId);
      return { job_id: jobId, status: 'continuing' };
    }

    // Find steps ready to execute: all depends_on are in steps_completed
    const ready: SequenceStep[] = [];
    for (const skillName of remaining) {
      const step = stepMap.get(skillName)!;
      const deps = step.depends_on || [];
      const depsReady = deps.every(d => state.steps_completed.includes(d));
      if (depsReady) ready.push(step);
    }

    if (ready.length === 0) {
      // Deadlock: remaining steps have unsatisfied deps — should not happen with correct config
      console.error(`[orchestrator] Deadlock: ${remaining.size} steps remaining but none ready. Remaining: ${[...remaining].join(', ')}`);
      break;
    }

    console.log(`[orchestrator] Wave ${waveNum}: running ${ready.map(s => s.skill).join(', ')} in parallel`);

    // Apply gating and execute ready steps in parallel
    const callTypeInfo = getCallTypeFromState(state);
    const execPromises: Array<{ step: SequenceStep; promise: Promise<StepResult> | null }> = [];

    for (const step of ready) {
      // Call type gating
      if (callTypeInfo) {
        if (SALES_ONLY_STEPS.has(step.skill) && !callTypeInfo.is_sales) {
          console.log(`[orchestrator] Skipping ${step.skill} — non-sales call type: ${callTypeInfo.call_type_name}`);
          state.steps_completed.push(step.skill);
          state.outputs[step.skill] = { skipped: true, reason: `Non-sales call type: ${callTypeInfo.call_type_name}` };
          remaining.delete(step.skill);
          continue;
        }
        if (step.skill === 'coaching-micro-feedback' && !callTypeInfo.enable_coaching) {
          console.log(`[orchestrator] Skipping coaching-micro-feedback — coaching disabled for: ${callTypeInfo.call_type_name}`);
          state.steps_completed.push(step.skill);
          state.outputs[step.skill] = { skipped: true, reason: `Coaching disabled for call type: ${callTypeInfo.call_type_name}` };
          remaining.delete(step.skill);
          continue;
        }
      }

      // Circuit breaker check (FLT-010)
      const circuitCheck = isCircuitAllowed(step.skill);
      if (!circuitCheck.allowed) {
        console.log(`[orchestrator] Circuit open for ${step.skill}, skipping`);
        if (step.criticality === 'critical') {
          // Critical step blocked by circuit breaker → dead-letter queue
          await enqueueDeadLetter(supabase, {
            org_id: state.event.org_id,
            user_id: state.event.user_id,
            event_type: state.event.type,
            event_payload: state.event.payload,
            source_job_id: jobId,
            error_message: `Circuit breaker open for ${step.skill}`,
            error_step: step.skill,
          });
        }
        state.steps_completed.push(step.skill);
        state.outputs[step.skill] = { skipped: true, reason: 'circuit_open' };
        remaining.delete(step.skill);
        continue;
      }

      // Mark step as running in DB
      await rpcUpdateStep(supabase, jobId, state.steps_completed.length + 1, step.skill, null, 'running');

      execPromises.push({
        step,
        promise: executeStepWithRetry(supabase, state, step),
      });
    }

    // Await all parallel steps
    const results = await Promise.allSettled(
      execPromises.map(async ({ step, promise }) => {
        if (!promise) return { step, result: { success: true, output: { skipped: true }, duration_ms: 0 } as StepResult };
        const result = await promise;
        return { step, result };
      })
    );

    // Process results
    for (const settled of results) {
      if (settled.status === 'rejected') {
        console.error(`[orchestrator] Parallel step rejected:`, settled.reason);
        continue;
      }

      const { step, result } = settled.value;

      if (result.success) {
        recordSuccess(step.skill);
        state.steps_completed.push(step.skill);
        state.outputs[step.skill] = result.output;
        remaining.delete(step.skill);

        if (result.queued_followups) {
          state.queued_followups.push(...result.queued_followups);
        }

        // Handoff routing: check DB for handoff routes after step completion (FLT-006)
        try {
          const handoffs = await getHandoffRoutes(supabase, state.event.org_id, state.event.type, step.skill);
          for (const handoff of handoffs) {
            if (evaluateHandoffConditions(handoff.conditions, result.output)) {
              const handoffPayload = applyContextMapping(handoff.context_mapping, result.output);
              state.queued_followups.push({
                type: handoff.target_event_type as any,
                source: 'orchestrator:chain',
                payload: handoffPayload,
                delay_minutes: handoff.delay_minutes,
              });
              console.log(`[orchestrator] Handoff: ${step.skill} → ${handoff.target_event_type} (delay: ${handoff.delay_minutes}min)`);
            }
          }
        } catch (handoffErr) {
          console.warn(`[orchestrator] Handoff check failed for ${step.skill} (non-fatal):`, handoffErr);
        }

        if (result.pending_approval) {
          state.pending_approvals.push(result.pending_approval);
          await persistState(supabase, jobId, state);
          const { error: pauseError } = await supabase.rpc('pause_sequence_job', {
            p_job_id: jobId,
            p_approval_channel: 'slack',
            p_approval_request_id: null,
          });
          if (pauseError?.message?.includes('does not exist') || pauseError?.code === '42883') {
            await supabase.from('sequence_jobs').update({
              status: 'waiting_approval',
              approval_channel: 'slack',
              waiting_for_approval_since: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', jobId);
          }
          return { job_id: jobId, status: 'waiting_approval' };
        }

        await rpcUpdateStep(supabase, jobId, state.steps_completed.length, step.skill, result.output, 'completed');

        // Fire question trigger evaluation after successful step (fire-and-forget)
        maybeEvaluateConfigQuestion(supabase, state.event.org_id, state.event.user_id, step.skill);

      } else {
        recordFailure(step.skill);

        if (step.criticality === 'critical') {
          state.error = `Critical step ${step.skill} failed: ${result.error}`;
          // Write to dead-letter queue for critical failures (FLT-009)
          await enqueueDeadLetter(supabase, {
            org_id: state.event.org_id,
            user_id: state.event.user_id,
            event_type: state.event.type,
            event_payload: state.event.payload,
            source_job_id: jobId,
            error_message: result.error || 'Unknown error',
            error_step: step.skill,
          });
          await persistState(supabase, jobId, state);
          await supabase.from('sequence_jobs').update({
            status: 'failed',
            error_message: result.error,
            error_step: state.steps_completed.length + 1,
            current_skill_key: step.skill,
          }).eq('id', jobId);
          return { job_id: jobId, status: 'failed', error: result.error };
        }

        console.warn(`[orchestrator] Best-effort step ${step.skill} failed: ${result.error}`);
        state.steps_completed.push(step.skill);
        state.outputs[step.skill] = { error: result.error, skipped: true };
        remaining.delete(step.skill);
        await rpcUpdateStep(supabase, jobId, state.steps_completed.length, step.skill, { error: result.error }, 'failed');
      }
    }

    state.updated_at = new Date().toISOString();
  }

  // All steps complete
  await processFollowups(supabase, jobId, state);

  // Per-sequence cost rollup
  try {
    const { data: costEvents } = await supabase
      .from('ai_cost_events')
      .select('total_cost')
      .eq('user_id', state.event.user_id)
      .gte('created_at', state.started_at)
      .lte('created_at', new Date().toISOString());

    const totalCost = (costEvents || []).reduce((sum, e) => sum + (e.total_cost || 0), 0);

    if (totalCost > 0) {
      await supabase.from('agent_activity').insert({
        user_id: state.event.user_id,
        org_id: state.event.org_id,
        activity_type: 'sequence_cost_rollup',
        sequence_type: state.event.type,
        title: `Sequence ${state.event.type} completed`,
        description: `Total AI cost: $${totalCost.toFixed(4)} across ${state.steps_completed.length} steps`,
        metadata: {
          job_id: jobId,
          sequence_type: state.event.type,
          total_cost: totalCost,
          steps_completed: state.steps_completed.length,
          step_names: state.steps_completed,
        },
      });

      console.log(`[orchestrator] Sequence ${state.event.type} cost rollup: $${totalCost.toFixed(4)}`);
    }
  } catch (costErr) {
    console.warn('[orchestrator] Cost rollup failed (non-fatal):', costErr);
  }

  await rpcCompleteJob(supabase, jobId, {
    steps_completed: state.steps_completed,
    outputs: state.outputs,
    queued_followups: state.queued_followups.length,
  });

  return { job_id: jobId, status: 'completed' };
}

/**
 * Sequential execution (fallback for sequences without depends_on).
 */
async function executeStepsSequential(
  supabase: SupabaseClient,
  jobId: string,
  state: SequenceState,
  steps: SequenceStep[],
  startTime: number,
): Promise<{ job_id: string; status: string; error?: string }> {

  for (const step of steps) {
    if (state.steps_completed.includes(step.skill)) continue;

    const elapsed = Date.now() - startTime;
    const remaining = EDGE_FUNCTION_TIMEOUT_MS - elapsed;
    if (remaining < SAFETY_MARGIN_MS) {
      await persistState(supabase, jobId, state);
      await selfInvoke(jobId);
      return { job_id: jobId, status: 'continuing' };
    }

    const callTypeInfo = getCallTypeFromState(state);
    if (callTypeInfo) {
      if (SALES_ONLY_STEPS.has(step.skill) && !callTypeInfo.is_sales) {
        console.log(`[orchestrator] Skipping ${step.skill} — non-sales call type: ${callTypeInfo.call_type_name}`);
        state.steps_completed.push(step.skill);
        state.outputs[step.skill] = { skipped: true, reason: `Non-sales call type: ${callTypeInfo.call_type_name}` };
        continue;
      }
      if (step.skill === 'coaching-micro-feedback' && !callTypeInfo.enable_coaching) {
        console.log(`[orchestrator] Skipping coaching-micro-feedback — coaching disabled for: ${callTypeInfo.call_type_name}`);
        state.steps_completed.push(step.skill);
        state.outputs[step.skill] = { skipped: true, reason: `Coaching disabled for call type: ${callTypeInfo.call_type_name}` };
        continue;
      }
    }

    state.current_step = step.skill;
    state.updated_at = new Date().toISOString();

    await rpcUpdateStep(supabase, jobId, state.steps_completed.length + 1, step.skill, null, 'running');

    const result = await executeStepWithRetry(supabase, state, step);

    if (result.success) {
      state.steps_completed.push(step.skill);
      state.outputs[step.skill] = result.output;

      if (result.queued_followups) {
        state.queued_followups.push(...result.queued_followups);
      }

      if (result.pending_approval) {
        state.pending_approvals.push(result.pending_approval);
        await persistState(supabase, jobId, state);
        const { error: pauseError } = await supabase.rpc('pause_sequence_job', {
          p_job_id: jobId,
          p_approval_channel: 'slack',
          p_approval_request_id: null,
        });
        if (pauseError?.message?.includes('does not exist') || pauseError?.code === '42883') {
          await supabase.from('sequence_jobs').update({
            status: 'waiting_approval',
            approval_channel: 'slack',
            waiting_for_approval_since: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', jobId);
        }
        return { job_id: jobId, status: 'waiting_approval' };
      }

      await rpcUpdateStep(supabase, jobId, state.steps_completed.length, step.skill, result.output, 'completed');

      // Fire question trigger evaluation after successful step (fire-and-forget)
      maybeEvaluateConfigQuestion(supabase, state.event.org_id, state.event.user_id, step.skill);

    } else {
      if (step.criticality === 'critical') {
        state.error = `Critical step ${step.skill} failed: ${result.error}`;
        await persistState(supabase, jobId, state);
        await supabase.from('sequence_jobs').update({
          status: 'failed',
          error_message: result.error,
          error_step: state.steps_completed.length + 1,
          current_skill_key: step.skill,
        }).eq('id', jobId);
        return { job_id: jobId, status: 'failed', error: result.error };
      }

      console.warn(`[orchestrator] Best-effort step ${step.skill} failed: ${result.error}`);
      state.steps_completed.push(step.skill);
      state.outputs[step.skill] = { error: result.error, skipped: true };
      await rpcUpdateStep(supabase, jobId, state.steps_completed.length, step.skill, { error: result.error }, 'failed');
    }
  }

  await processFollowups(supabase, jobId, state);

  // Per-sequence cost rollup
  try {
    const { data: costEvents } = await supabase
      .from('ai_cost_events')
      .select('total_cost')
      .eq('user_id', state.event.user_id)
      .gte('created_at', state.started_at)
      .lte('created_at', new Date().toISOString());

    const totalCost = (costEvents || []).reduce((sum, e) => sum + (e.total_cost || 0), 0);

    if (totalCost > 0) {
      await supabase.from('agent_activity').insert({
        user_id: state.event.user_id,
        org_id: state.event.org_id,
        activity_type: 'sequence_cost_rollup',
        sequence_type: state.event.type,
        title: `Sequence ${state.event.type} completed`,
        description: `Total AI cost: $${totalCost.toFixed(4)} across ${state.steps_completed.length} steps`,
        metadata: {
          job_id: jobId,
          sequence_type: state.event.type,
          total_cost: totalCost,
          steps_completed: state.steps_completed.length,
          step_names: state.steps_completed,
        },
      });

      console.log(`[orchestrator] Sequence ${state.event.type} cost rollup: $${totalCost.toFixed(4)}`);
    }
  } catch (costErr) {
    console.warn('[orchestrator] Cost rollup failed (non-fatal):', costErr);
  }

  await rpcCompleteJob(supabase, jobId, {
    steps_completed: state.steps_completed,
    outputs: state.outputs,
    queued_followups: state.queued_followups.length,
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
      // Write to dead-letter queue instead of silently dropping (FLT-009)
      await enqueueDeadLetter(supabase, {
        org_id: state.event.org_id,
        user_id: state.event.user_id,
        event_type: followup.type,
        event_payload: followup.payload,
        source_job_id: jobId,
        error_message: `Followup fire-and-forget failed: ${String(err)}`,
      });
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

// ============================================================================
// RPC helpers with direct-table fallbacks (for environments without RPCs)
// ============================================================================

async function rpcStartJob(
  supabase: SupabaseClient,
  event: OrchestratorEvent,
): Promise<{ jobId: string | null; error: string | null }> {
  // Try RPC first
  const { data, error } = await supabase.rpc('start_sequence_job', {
    p_sequence_skill_id: null,
    p_user_id: event.user_id,
    p_organization_id: event.org_id,
    p_initial_input: { event_type: event.type, event_source: event.source, payload: event.payload },
  });

  if (!error && data) return { jobId: data as string, error: null };

  // Fallback: direct insert (RPC missing, or RPC rejects null skill_id for orchestrator-managed jobs)
  if (error?.message?.includes('does not exist') || error?.message?.includes('Could not find') || error?.message?.includes('404') || error?.code === '42883'
      || error?.message?.includes('Skill not found')) {
    console.warn('[orchestrator] start_sequence_job RPC unavailable or rejected null skill_id, using direct insert');
    const jobId = crypto.randomUUID();
    const { error: insertError } = await supabase.from('sequence_jobs').insert({
      id: jobId,
      user_id: event.user_id,
      organization_id: event.org_id,
      status: 'running',
      current_step: 0,
      initial_input: { event_type: event.type, event_source: event.source, payload: event.payload },
      context: {},
      step_results: [],
      started_at: new Date().toISOString(),
    });
    if (insertError) return { jobId: null, error: insertError.message };
    return { jobId, error: null };
  }

  return { jobId: null, error: error?.message || 'Unknown RPC error' };
}

async function rpcUpdateStep(
  supabase: SupabaseClient,
  jobId: string,
  stepNum: number,
  skillKey: string,
  output: unknown,
  status: string,
): Promise<void> {
  const { error } = await supabase.rpc('update_sequence_job_step', {
    p_job_id: jobId,
    p_step: stepNum,
    p_skill_key: skillKey,
    p_output: output,
    p_status: status,
  });

  if (error?.message?.includes('does not exist') || error?.code === '42883') {
    // Fallback: direct update
    console.warn('[orchestrator] update_sequence_job_step RPC not found, using direct update');
    const { data: job } = await supabase.from('sequence_jobs').select('step_results').eq('id', jobId).maybeSingle();
    const results = (job?.step_results as any[]) || [];
    results.push({ step: stepNum, skill_key: skillKey, output, status, completed_at: new Date().toISOString() });
    await supabase.from('sequence_jobs').update({
      current_step: stepNum,
      current_skill_key: skillKey,
      step_results: results,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
}

async function rpcCompleteJob(
  supabase: SupabaseClient,
  jobId: string,
  finalOutput: unknown,
): Promise<void> {
  const { error } = await supabase.rpc('complete_sequence_job', {
    p_job_id: jobId,
    p_final_output: finalOutput,
  });

  if (error?.message?.includes('does not exist') || error?.code === '42883') {
    console.warn('[orchestrator] complete_sequence_job RPC not found, using direct update');
    await supabase.from('sequence_jobs').update({
      status: 'completed',
      context: finalOutput,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
}
