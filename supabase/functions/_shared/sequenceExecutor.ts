import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { executeAgentSkillWithContract, type SkillResult } from './agentSkillExecutor.ts';
import { executeAction, type ExecuteActionName } from './copilot_adapters/executeAction.ts';

export interface SequenceExecuteParams {
  organizationId: string;
  userId: string;
  sequenceKey: string;
  sequenceContext?: Record<string, unknown>;
  isSimulation?: boolean;
}

interface SequenceStep {
  order: number;
  skill_key?: string; // For skill execution
  action?: ExecuteActionName; // For direct action execution
  input_mapping?: Record<string, string>;
  output_key?: string;
  on_failure?: 'stop' | 'continue' | 'fallback';
  fallback_skill_key?: string;
  requires_approval?: boolean; // For write actions that need approval
  // REL-001: Retry configuration
  max_retries?: number; // Maximum retry attempts (default: 0)
  // REL-003: Timeout configuration
  timeout_ms?: number; // Step timeout in milliseconds (default: 30000)
}

// REL-001: Transient error detection for retry eligibility
const TRANSIENT_ERROR_PATTERNS = [
  /network/i,
  /timeout/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /fetch failed/i,
  /service unavailable/i,
  /503/,
  /504/,
  /429/, // Rate limiting
];

function isTransientError(error: string | undefined): boolean {
  if (!error) return false;
  return TRANSIENT_ERROR_PATTERNS.some(pattern => pattern.test(error));
}

// REL-001: Calculate exponential backoff delay
function getRetryDelay(attempt: number): number {
  // Exponential backoff: 100ms, 200ms, 400ms, 800ms...
  const baseDelay = 100;
  return baseDelay * Math.pow(2, attempt);
}

// REL-001: Sleep utility for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// REL-003: Default timeout for steps
const DEFAULT_STEP_TIMEOUT_MS = 30000;

/**
 * Resolve a single variable path like "outputs.lead_data.leads[0].contact.name"
 * Returns the resolved value or undefined if path not found
 */
function resolvePath(path: string, state: Record<string, unknown>): unknown {
  // Normalize array indices: foo[0].bar -> foo.0.bar
  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.').filter(Boolean);

  let value: unknown = state;
  for (const key of parts) {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/**
 * Resolve template expressions in a string
 * Supports both:
 * - Full variable: "${outputs.foo}" -> returns the actual value (can be object/array)
 * - Embedded variables: "Hello ${outputs.name}!" -> returns interpolated string
 */
function resolveExpression(expr: unknown, state: Record<string, unknown>): unknown {
  if (typeof expr !== 'string') return expr;

  // Check for full variable match (entire string is one variable)
  const fullMatch = expr.match(/^\$\{(.+)\}$/);
  if (fullMatch) {
    // Return the actual value (preserves type: object, array, number, etc.)
    return resolvePath(fullMatch[1], state);
  }

  // Check for embedded variables in string
  const varPattern = /\$\{([^}]+)\}/g;
  if (!varPattern.test(expr)) {
    return expr; // No variables to interpolate
  }

  // Reset regex lastIndex after test()
  varPattern.lastIndex = 0;

  // Interpolate all embedded variables
  const result = expr.replace(varPattern, (_match, path) => {
    const value = resolvePath(path, state);
    if (value === undefined || value === null) {
      return ''; // Replace unresolved variables with empty string
    }
    if (typeof value === 'object') {
      // For objects/arrays in embedded context, stringify them
      return JSON.stringify(value);
    }
    return String(value);
  });

  return result;
}

function buildStepInput(step: SequenceStep, state: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const mapping = step.input_mapping || {};
  for (const [targetKey, sourceExpr] of Object.entries(mapping)) {
    const val = resolveExpression(sourceExpr, state);
    if (val !== undefined) input[targetKey] = val;
  }
  // Provide minimal sequence metadata (avoid circular references / large payloads)
  const execution = (state.execution && typeof state.execution === 'object') ? state.execution : {};
  input._sequence = {
    execution_id: (execution as any).id,
    sequence_key: (execution as any).sequence_key,
  };
  return input;
}

export async function executeSequence(
  supabase: SupabaseClient,
  params: SequenceExecuteParams
): Promise<{
  success: boolean;
  execution_id: string;
  sequence_key: string;
  organization_id: string;
  status: 'completed' | 'failed';
  is_simulation: boolean;
  step_results: any[];
  final_output: Record<string, unknown>;
  error: string | null;
}> {
  const organizationId = String(params.organizationId || '').trim();
  const userId = String(params.userId || '').trim();
  const sequenceKey = String(params.sequenceKey || '').trim();
  const sequenceContext = (params.sequenceContext || {}) as Record<string, unknown>;
  const isSimulation = params.isSimulation === true;

  if (!organizationId) throw new Error('organizationId is required');
  if (!userId) throw new Error('userId is required');
  if (!sequenceKey) throw new Error('sequenceKey is required');

  // Authorization: user must be a member of the organization
  const { data: membership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('org_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error('Access denied to this organization');
  }

  // Load the sequence definition from organization_skills (enabled) + platform_skills
  const { data: row, error: rowError } = await supabase
    .from('organization_skills')
    .select(
      `
      skill_id,
      is_enabled,
      compiled_frontmatter,
      platform_skills:platform_skill_id(category, frontmatter, is_active)
    `
    )
    .eq('organization_id', organizationId)
    .eq('skill_id', sequenceKey)
    .eq('is_active', true)
    .maybeSingle();

  if (rowError) throw new Error(`Failed to load sequence: ${rowError.message}`);
  if (!row || row.is_enabled !== true) throw new Error('Sequence not found or not enabled');
  if ((row.platform_skills?.is_active ?? true) !== true) throw new Error('Sequence is not active');
  if (row.platform_skills?.category !== 'agent-sequence') {
    throw new Error('Provided sequenceKey is not an agent-sequence');
  }

  const frontmatter = (row.compiled_frontmatter || row.platform_skills?.frontmatter || {}) as Record<
    string,
    any
  >;
  const stepsRaw = frontmatter.sequence_steps;
  const steps: SequenceStep[] = Array.isArray(stepsRaw) ? (stepsRaw as SequenceStep[]) : [];
  if (steps.length === 0) throw new Error('Sequence has no steps configured');

  // Create execution record
  const startedAt = new Date().toISOString();
  const { data: execution, error: execError } = await supabase
    .from('sequence_executions')
    .insert({
      sequence_key: sequenceKey,
      organization_id: organizationId,
      user_id: userId,
      status: 'running',
      input_context: sequenceContext,
      step_results: [],
      is_simulation: isSimulation,
      started_at: startedAt,
    })
    .select('id')
    .single();

  if (execError || !execution) {
    throw new Error(`Failed to create execution: ${execError?.message || 'unknown'}`);
  }

  const executionId = String(execution.id);

  const orderedSteps = [...steps].sort((a, b) => (a.order || 0) - (b.order || 0));
  const stepResults: any[] = [];

  // Minimal state model for input_mapping resolution
  const state: Record<string, unknown> = {
    trigger: { params: sequenceContext },
    outputs: {},
    context: {},
    execution: { id: executionId, sequence_key: sequenceKey },
  };

  let overallStatus: 'completed' | 'failed' = 'completed';
  let failedStepIndex: number | null = null;
  let errorMessage: string | null = null;

  for (let i = 0; i < orderedSteps.length; i++) {
    const step = orderedSteps[i];
    const stepStart = Date.now();
    const stepStartedAt = new Date().toISOString();

    // Normalize skill_key and action - treat empty strings as undefined
    const skillKey = typeof step.skill_key === 'string' && step.skill_key.trim() ? step.skill_key.trim() : undefined;
    const actionKey = typeof step.action === 'string' && step.action.trim() ? step.action.trim() : undefined;

    console.log(`[sequenceExecutor] Step ${i + 1}:`, {
      raw_skill_key: step.skill_key,
      raw_action: step.action,
      normalized_skill_key: skillKey,
      normalized_action: actionKey,
    });

    // Validate step has either skill_key or action
    if (!skillKey && !actionKey) {
      overallStatus = 'failed';
      failedStepIndex = i;
      errorMessage = `Step ${i + 1} has neither skill_key nor action (raw values: skill_key=${JSON.stringify(step.skill_key)}, action=${JSON.stringify(step.action)})`;
      break;
    }

    const input = buildStepInput(step, state);
    let result: SkillResult;
    let stepType: 'skill' | 'action' = skillKey ? 'skill' : 'action';

    // REL-001 & REL-003: Retry and timeout configuration
    const maxRetries = step.max_retries ?? 0;
    const timeoutMs = step.timeout_ms ?? DEFAULT_STEP_TIMEOUT_MS;
    let retryCount = 0;
    const retryAttempts: Array<{ attempt: number; error: string; delay_ms: number }> = [];

    // REL-001: Retry loop with exponential backoff
    while (true) {
      let stepExecutionError: string | undefined;
      let timedOut = false;

      try {
        // REL-003: Create AbortController for timeout
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
          abortController.abort();
        }, timeoutMs);

        // Execute step based on type with timeout wrapper
        const executeStepWithTimeout = async (): Promise<SkillResult> => {
          if (skillKey) {
            // Execute skill
            console.log(`[sequenceExecutor] Executing skill: ${skillKey}${retryCount > 0 ? ` (retry ${retryCount}/${maxRetries})` : ''}`);
            return await executeAgentSkillWithContract(supabase, {
              organizationId,
              userId,
              skillKey,
              context: input,
              dryRun: isSimulation,
            });
          } else if (actionKey) {
            // Execute action (requires approval if requires_approval is true and not simulation)
            console.log(`[sequenceExecutor] Executing action: ${actionKey}${retryCount > 0 ? ` (retry ${retryCount}/${maxRetries})` : ''}`);
            const actionInput = { ...input };
            // Safety: simulation mode should never perform write actions (ignore confirm even if provided in mapping)
            if (isSimulation) {
              delete (actionInput as any).confirm;
            }
            if (step.requires_approval && !isSimulation) {
              // In real execution, approval would be checked here
              // For now, we'll set confirm=true if requires_approval is set
              actionInput.confirm = true;
            }

            const actionResult = await executeAction(
              supabase,
              userId,
              organizationId,
              actionKey as ExecuteActionName,
              actionInput
            );

            // In simulation, convert "needs_confirmation" into a successful dry-run with preview payload.
            // This allows sequences to complete without side effects while still returning useful outputs.
            const normalizedActionResult = (isSimulation && actionResult.needs_confirmation && actionResult.preview)
              ? { ...actionResult, success: true, data: actionResult.preview, error: undefined }
              : actionResult;

            // Convert ActionResult to SkillResult format
            return {
              status: normalizedActionResult.success ? 'success' : 'failed',
              error: normalizedActionResult.error || undefined,
              summary: normalizedActionResult.success
                ? `Action ${actionKey} completed successfully`
                : `Action ${actionKey} failed: ${normalizedActionResult.error || 'Unknown error'}`,
              data: normalizedActionResult.data || {},
              references: [],
              meta: {
                skill_id: actionKey,
                skill_version: '1.0',
                execution_time_ms: Date.now() - stepStart,
                model: undefined,
              },
            };
          } else {
            // This shouldn't happen due to earlier validation, but keep as safety net
            throw new Error(`Step ${i + 1} has neither skill_key nor action`);
          }
        };

        // Race between execution and timeout
        result = await Promise.race([
          executeStepWithTimeout(),
          new Promise<never>((_, reject) => {
            abortController.signal.addEventListener('abort', () => {
              reject(new Error(`Step ${i + 1} timed out after ${timeoutMs}ms`));
            });
          }),
        ]);

        clearTimeout(timeoutId);
        stepExecutionError = result.status === 'failed' ? result.error : undefined;

      } catch (err) {
        // REL-003: Handle timeout errors
        const errorStr = err instanceof Error ? err.message : String(err);
        timedOut = errorStr.includes('timed out');
        stepExecutionError = errorStr;

        result = {
          status: 'failed',
          error: errorStr,
          summary: timedOut
            ? `Step ${i + 1} timed out after ${timeoutMs}ms`
            : `Step ${i + 1} failed: ${errorStr}`,
          data: {},
          references: [],
          meta: {
            skill_id: skillKey || actionKey,
            skill_version: '1.0',
            execution_time_ms: Date.now() - stepStart,
            model: undefined,
            timed_out: timedOut,
            timeout_ms: timedOut ? timeoutMs : undefined,
          },
        };
      }

      // REL-001: Check if we should retry
      if (result.status === 'failed' && retryCount < maxRetries && isTransientError(stepExecutionError)) {
        const delayMs = getRetryDelay(retryCount);
        console.log(`[sequenceExecutor] Step ${i + 1} failed with transient error, retrying in ${delayMs}ms (attempt ${retryCount + 1}/${maxRetries})`);

        retryAttempts.push({
          attempt: retryCount + 1,
          error: stepExecutionError || 'Unknown error',
          delay_ms: delayMs,
        });

        await sleep(delayMs);
        retryCount++;
        continue; // Retry the step
      }

      // Step completed (success or non-retryable failure)
      break;
    }

    // Handle failure strategy
    if (result.status === 'failed') {
      const onFailure = step.on_failure || 'stop';
      if (onFailure === 'fallback' && step.fallback_skill_key) {
        const fallback = await executeAgentSkillWithContract(supabase, {
          organizationId,
          userId,
          skillKey: step.fallback_skill_key,
          context: input,
          dryRun: isSimulation,
        });
        // Prefer fallback result if it succeeds/partials
        if (fallback.status !== 'failed') {
          result = fallback;
        }
      }

      if (result.status === 'failed' && onFailure === 'stop') {
        overallStatus = 'failed';
        failedStepIndex = i;
        errorMessage = result.error || 'Sequence step failed';
      } else if (result.status === 'failed' && onFailure === 'continue') {
        // Continue execution, but mark step as failed
        console.warn(`Step ${i + 1} failed but continuing: ${result.error}`);
      }
    }

    const stepCompletedAt = new Date().toISOString();
    const durationMs = Date.now() - stepStart;

    stepResults.push({
      step_index: i,
      step_type: stepType,
      skill_key: skillKey || null,
      action: actionKey || null,
      status: result.status,
      // Persist a sanitized input (never store mutable orchestration state to avoid cycles)
      input: (() => {
        const copy: Record<string, unknown> = { ...input };
        // `_sequence` is helpful but not required in history; keep it small either way
        return copy;
      })(),
      output: result.data || null,
      error: result.error || null,
      started_at: stepStartedAt,
      completed_at: stepCompletedAt,
      duration_ms: durationMs,
      // REL-001: Retry information
      retry_count: retryCount,
      max_retries: maxRetries,
      retry_attempts: retryAttempts.length > 0 ? retryAttempts : undefined,
      // REL-003: Timeout information
      timeout_ms: timeoutMs,
      timed_out: result.meta?.timed_out || false,
      references: result.references || [],
      meta: result.meta || {},
      requires_approval: step.requires_approval || false,
    });

    // Update outputs/state
    if (step.output_key) {
      (state.outputs as any)[step.output_key] = result.data;
    }
    (state as any).last_result = result;

    // Persist step results progressively
    await supabase
      .from('sequence_executions')
      .update({
        step_results: stepResults,
        failed_step_index: failedStepIndex,
        error_message: errorMessage,
        status: overallStatus === 'failed' ? 'failed' : 'running',
        updated_at: new Date().toISOString(),
      })
      .eq('id', executionId);

    if (overallStatus === 'failed') break;
  }

  const completedAt = new Date().toISOString();
  const finalOutput = {
    outputs: (state.outputs as any) || {},
    last_result: (state as any).last_result || null,
    step_results: stepResults,
  };

  await supabase
    .from('sequence_executions')
    .update({
      status: overallStatus === 'failed' ? 'failed' : 'completed',
      final_output: finalOutput,
      failed_step_index: failedStepIndex,
      error_message: errorMessage,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq('id', executionId);

  // =========================================================================
  // ENGAGE-002: Log value tracking for sequence execution
  // =========================================================================
  if (overallStatus !== 'failed' && !isSimulation) {
    try {
      // Estimate time saved based on sequence complexity
      const estimatedTimeSaved = estimateTimeSaved(sequenceKey, stepResults.length);
      
      // Determine outcome type from final output
      const outcomeType = determineOutcomeType(sequenceKey, finalOutput);
      
      await supabase.rpc('log_copilot_engagement', {
        p_org_id: organizationId,
        p_user_id: userId,
        p_event_type: 'sequence_executed',
        p_trigger_type: 'reactive', // Will be overridden by caller if proactive
        p_channel: 'copilot',
        p_sequence_key: sequenceKey,
        p_estimated_time_saved: estimatedTimeSaved,
        p_outcome_type: outcomeType,
        p_metadata: {
          execution_id: executionId,
          steps_completed: stepResults.filter(s => s.status === 'success' || s.status === 'partial').length,
          total_steps: stepResults.length,
          total_duration_ms: stepResults.reduce((sum, s) => sum + (s.duration_ms || 0), 0),
        },
      });
    } catch (engageError) {
      // Non-blocking - don't fail the sequence for engagement tracking
      console.warn('[sequenceExecutor] Failed to log engagement:', engageError);
    }
  }

  return {
    success: overallStatus !== 'failed',
    execution_id: executionId,
    sequence_key: sequenceKey,
    organization_id: organizationId,
    status: overallStatus === 'failed' ? 'failed' : 'completed',
    is_simulation: isSimulation,
    step_results: stepResults,
    final_output: finalOutput,
    error: errorMessage,
  };
}

// =========================================================================
// ENGAGE-002: Value estimation helpers
// =========================================================================

/**
 * Estimate time saved based on sequence type and complexity
 */
function estimateTimeSaved(sequenceKey: string, stepCount: number): number {
  // Base estimates per sequence type (in minutes)
  const baseEstimates: Record<string, number> = {
    'seq-next-meeting-command-center': 5,
    'seq-post-meeting-followup-pack': 4,
    'seq-deal-rescue-pack': 6,
    'seq-pipeline-focus-tasks': 3,
    'seq-catch-me-up': 2,
    'seq-followup-zero-inbox': 5,
    'seq-event-follow-up': 4,
  };

  const base = baseEstimates[sequenceKey] || 3;
  
  // Add time for additional steps (0.5 min per step over 3)
  const stepBonus = Math.max(0, stepCount - 3) * 0.5;
  
  return Math.round(base + stepBonus);
}

/**
 * Determine outcome type from sequence key and output
 */
function determineOutcomeType(
  sequenceKey: string,
  finalOutput: any
): 'email_sent' | 'task_created' | 'deal_updated' | 'meeting_scheduled' | 'research_completed' | 'prep_generated' | 'no_outcome' {
  // Map sequence keys to expected outcomes
  const sequenceOutcomes: Record<string, string> = {
    'seq-next-meeting-command-center': 'prep_generated',
    'seq-post-meeting-followup-pack': 'email_sent',
    'seq-deal-rescue-pack': 'deal_updated',
    'seq-pipeline-focus-tasks': 'task_created',
    'seq-catch-me-up': 'prep_generated',
    'seq-followup-zero-inbox': 'email_sent',
    'seq-event-follow-up': 'email_sent',
  };

  const outcome = sequenceOutcomes[sequenceKey];
  if (outcome) return outcome as any;

  // Infer from output
  const outputs = finalOutput?.outputs || {};
  if (outputs.email_draft || outputs.email) return 'email_sent';
  if (outputs.tasks || outputs.task_pack) return 'task_created';
  if (outputs.meeting_brief || outputs.prep) return 'prep_generated';
  if (outputs.research || outputs.enrichment) return 'research_completed';
  if (outputs.deal_update) return 'deal_updated';

  return 'no_outcome';
}

