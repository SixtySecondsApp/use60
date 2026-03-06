/**
 * Saga Executor — Transactional Multi-Step Execution with Rollback
 *
 * Implements saga-style rollback for reversible steps in multi-step
 * mutating workflows. Non-reversible steps require explicit HITL
 * confirmation before commit.
 *
 * Features:
 * - Forward execution with compensating actions
 * - Workflow state persistence for resume/retry
 * - Audit records include compensating operations executed
 * - HITL gates for non-reversible steps
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export type SagaStepStatus = 'pending' | 'running' | 'committed' | 'compensated' | 'failed' | 'awaiting_confirmation';

export interface SagaStep {
  id: string;
  label: string;
  reversible: boolean;
  requiresConfirmation: boolean; // HITL gate for non-reversible steps
  status: SagaStepStatus;
  execute: (ctx: SagaContext) => Promise<SagaStepResult>;
  compensate?: (ctx: SagaContext, result: SagaStepResult) => Promise<void>;
  result?: SagaStepResult;
  compensationResult?: { compensated: boolean; error?: string };
  startedAt?: string;
  completedAt?: string;
}

export interface SagaStepResult {
  success: boolean;
  data?: unknown;
  error?: string;
  compensationData?: unknown; // Data needed for rollback
}

export interface SagaContext {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  workflowId: string;
  stepResults: Record<string, SagaStepResult>; // Results from previous steps
  extra?: Record<string, unknown>;
}

export type SagaStatus = 'pending' | 'running' | 'committed' | 'compensating' | 'compensated' | 'failed' | 'paused';

export interface SagaState {
  workflowId: string;
  label: string;
  status: SagaStatus;
  steps: SagaStep[];
  currentStepIndex: number;
  startedAt?: string;
  completedAt?: string;
  compensationLog: CompensationRecord[];
}

export interface CompensationRecord {
  stepId: string;
  stepLabel: string;
  compensated: boolean;
  compensatedAt?: string;
  error?: string;
}

export interface SagaResult {
  workflowId: string;
  status: SagaStatus;
  completedSteps: number;
  totalSteps: number;
  compensationLog: CompensationRecord[];
  pausedAtStep?: string; // Step that needs HITL confirmation
  error?: string;
}

// =============================================================================
// Saga Builder
// =============================================================================

export class SagaBuilder {
  private steps: SagaStep[] = [];
  private label: string;

  constructor(label: string) {
    this.label = label;
  }

  addStep(step: Omit<SagaStep, 'status' | 'result' | 'compensationResult' | 'startedAt' | 'completedAt'>): SagaBuilder {
    this.steps.push({
      ...step,
      status: 'pending',
    });
    return this;
  }

  build(): SagaState {
    return {
      workflowId: `saga_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: this.label,
      status: 'pending',
      steps: this.steps,
      currentStepIndex: 0,
      compensationLog: [],
    };
  }
}

// =============================================================================
// Saga Executor
// =============================================================================

/**
 * Execute a saga workflow with rollback support.
 *
 * If a step fails, all previously committed reversible steps are
 * compensated in reverse order.
 *
 * If a step requiresConfirmation, execution pauses and returns
 * with status 'paused' — call resumeSaga() after user confirms.
 */
export async function executeSaga(
  state: SagaState,
  ctx: SagaContext,
): Promise<SagaResult> {
  state.status = 'running';
  state.startedAt = state.startedAt || new Date().toISOString();

  for (let i = state.currentStepIndex; i < state.steps.length; i++) {
    const step = state.steps[i];
    state.currentStepIndex = i;

    // HITL gate: pause for confirmation on non-reversible steps
    if (step.requiresConfirmation && step.status === 'pending') {
      step.status = 'awaiting_confirmation';
      state.status = 'paused';
      return buildResult(state, step.id);
    }

    step.status = 'running';
    step.startedAt = new Date().toISOString();

    try {
      const result = await step.execute(ctx);
      step.result = result;
      step.completedAt = new Date().toISOString();

      if (result.success) {
        step.status = 'committed';
        ctx.stepResults[step.id] = result;
      } else {
        step.status = 'failed';
        // Trigger compensation for all previously committed steps
        await compensate(state, ctx, i - 1);
        state.status = state.compensationLog.some((c) => !c.compensated) ? 'failed' : 'compensated';
        state.completedAt = new Date().toISOString();
        return buildResult(state, undefined, result.error);
      }
    } catch (err) {
      step.status = 'failed';
      step.result = { success: false, error: err instanceof Error ? err.message : String(err) };
      step.completedAt = new Date().toISOString();
      await compensate(state, ctx, i - 1);
      state.status = state.compensationLog.some((c) => !c.compensated) ? 'failed' : 'compensated';
      state.completedAt = new Date().toISOString();
      return buildResult(state, undefined, step.result.error);
    }
  }

  state.status = 'committed';
  state.completedAt = new Date().toISOString();
  return buildResult(state);
}

/**
 * Resume a paused saga after HITL confirmation.
 */
export async function resumeSaga(
  state: SagaState,
  ctx: SagaContext,
  confirmed: boolean,
): Promise<SagaResult> {
  if (state.status !== 'paused') {
    return buildResult(state, undefined, `Cannot resume saga in status: ${state.status}`);
  }

  const step = state.steps[state.currentStepIndex];
  if (!step || step.status !== 'awaiting_confirmation') {
    return buildResult(state, undefined, 'No step awaiting confirmation');
  }

  if (!confirmed) {
    // User rejected — compensate all committed steps
    step.status = 'failed';
    step.result = { success: false, error: 'User rejected non-reversible step' };
    await compensate(state, ctx, state.currentStepIndex - 1);
    state.status = 'compensated';
    state.completedAt = new Date().toISOString();
    return buildResult(state, undefined, 'Workflow cancelled by user');
  }

  // User confirmed — continue execution
  step.status = 'pending'; // Reset to allow execution
  step.requiresConfirmation = false; // Don't re-ask
  return executeSaga(state, ctx);
}

// =============================================================================
// Compensation (Rollback)
// =============================================================================

async function compensate(
  state: SagaState,
  ctx: SagaContext,
  fromIndex: number,
): Promise<void> {
  state.status = 'compensating';

  // Compensate in reverse order
  for (let i = fromIndex; i >= 0; i--) {
    const step = state.steps[i];
    if (step.status !== 'committed') continue;
    if (!step.reversible || !step.compensate || !step.result) {
      state.compensationLog.push({
        stepId: step.id,
        stepLabel: step.label,
        compensated: false,
        error: step.reversible ? 'No compensate function' : 'Non-reversible step',
      });
      continue;
    }

    try {
      await step.compensate(ctx, step.result);
      step.status = 'compensated';
      step.compensationResult = { compensated: true };
      state.compensationLog.push({
        stepId: step.id,
        stepLabel: step.label,
        compensated: true,
        compensatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      step.compensationResult = { compensated: false, error: errorMsg };
      state.compensationLog.push({
        stepId: step.id,
        stepLabel: step.label,
        compensated: false,
        error: errorMsg,
      });
    }
  }
}

// =============================================================================
// State Persistence
// =============================================================================

/**
 * Persist saga state for resume/retry.
 * Uses activities table for audit trail.
 */
export async function persistSagaState(
  client: SupabaseClient,
  state: SagaState,
  userId: string,
): Promise<void> {
  try {
    await client.from('activities').insert({
      type: 'saga_state',
      user_id: userId,
      details: JSON.stringify({
        workflow_id: state.workflowId,
        label: state.label,
        status: state.status,
        current_step: state.currentStepIndex,
        total_steps: state.steps.length,
        compensation_log: state.compensationLog,
        started_at: state.startedAt,
        completed_at: state.completedAt,
      }),
    });
  } catch (err) {
    console.warn('[sagaExecutor] State persistence failed:', err);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function buildResult(
  state: SagaState,
  pausedAtStep?: string,
  error?: string,
): SagaResult {
  return {
    workflowId: state.workflowId,
    status: state.status,
    completedSteps: state.steps.filter((s) => s.status === 'committed').length,
    totalSteps: state.steps.length,
    compensationLog: state.compensationLog,
    pausedAtStep,
    error,
  };
}
