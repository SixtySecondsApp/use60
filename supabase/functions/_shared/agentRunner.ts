// supabase/functions/_shared/agentRunner.ts
// Standardised fleet agent execution wrapper with retry logic, credit budget
// enforcement, and structured telemetry via the shared logger.
//
// Usage:
//   import { runAgent } from './_shared/agentRunner.ts';
//
//   const result = await runAgent(
//     { agentName: 'morning-briefing', userId, orgId, traceId },
//     async (ctx) => {
//       ctx.logger.info('start', { step: 'fetch_meetings' });
//       const data = await fetchMeetings(ctx.supabase, userId);
//       return data;
//     },
//   );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { createLogger, Logger } from './logger.ts';
// FLEET_AGENT_BUDGETS is re-exported for convenience — callers may reference
// budget constants without importing modelRouter directly.
export { FLEET_AGENT_BUDGETS } from './modelRouter.ts';
import { checkAgentBudget } from './modelRouter.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentConfig {
  agentName: string;
  userId: string;
  orgId: string;
  traceId?: string;
  /**
   * When true, a partial result accumulated before a failure is returned
   * with partial=true rather than treating the run as a full failure.
   */
  allowPartialResults?: boolean;
  /**
   * Override the default retry count for a given failure type.
   * When set, this value replaces the per-failure-type default for all
   * failure types in this run.
   */
  maxRetries?: number;
}

export interface AgentContext {
  /** Service-role Supabase client. */
  supabase: ReturnType<typeof createClient>;
  /** Logger bound to this agent run (traceId already set). */
  logger: Logger;
  /** Distributed trace ID for this run. */
  traceId: string;
  /** Credits consumed so far in this run (updated externally via addCredits). */
  creditsUsed: number;
  /**
   * Check whether the per-run budget for this agent has been exceeded.
   * Returns { exceeded, limit, used }.
   */
  checkBudget: () => { exceeded: boolean; limit: number; used: number };
}

export type AgentExecutor<T> = (context: AgentContext) => Promise<T>;

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  /** True when allowPartialResults=true and execution stopped mid-way. */
  partial?: boolean;
  error?: string;
  traceId: string;
  /** UUID of the agent_executions row for this run, if tracking succeeded. */
  executionId?: string;
  durationMs: number;
  creditsConsumed: number;
  retriesUsed: number;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export type ErrorKind =
  | 'transient'
  | 'context_exceeded'
  | 'model_unavailable'
  | 'validation'
  | 'unknown';

/**
 * Classify a thrown error into a retry category.
 *
 * - transient        — 5xx server errors (529, 503, 500)
 * - context_exceeded — prompt / token length errors
 * - model_unavailable — model not found / unavailable (handled by modelRouter)
 * - validation       — 4xx client errors
 * - unknown          — anything else (treated as transient with 1 retry)
 */
export function classifyError(err: unknown): ErrorKind {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  // Validation errors (4xx) — checked before transient to avoid false positives
  if (
    msg.includes('400') ||
    msg.includes('422') ||
    msg.includes('validation') ||
    msg.includes('invalid request') ||
    msg.includes('bad request')
  ) {
    return 'validation';
  }

  // Context / token limit errors
  if (
    msg.includes('context_length') ||
    msg.includes('context length') ||
    msg.includes('max_tokens') ||
    msg.includes('maximum tokens') ||
    msg.includes('too long') ||
    msg.includes('input too large') ||
    msg.includes('prompt is too long')
  ) {
    return 'context_exceeded';
  }

  // Model availability errors — modelRouter fallback handles these internally
  if (
    msg.includes('model_not_found') ||
    msg.includes('model not found') ||
    msg.includes('model unavailable') ||
    msg.includes('model_unavailable') ||
    msg.includes('no such model')
  ) {
    return 'model_unavailable';
  }

  // Transient server errors
  if (
    msg.includes('529') ||
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('service unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('network')
  ) {
    return 'transient';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

interface RetryPolicy {
  maxAttempts: number; // total attempts (1 = no retry)
  /** Returns the delay in milliseconds before the nth retry (0-indexed retry count). */
  delayMs: (retryIndex: number) => number;
}

const DEFAULT_RETRY_POLICIES: Record<ErrorKind, RetryPolicy> = {
  // 2 retries: exponential backoff 1s, 4s
  transient: {
    maxAttempts: 3,
    delayMs: (i) => [1_000, 4_000][i] ?? 4_000,
  },
  // 1 retry with truncated input hint
  context_exceeded: {
    maxAttempts: 2,
    delayMs: () => 0,
  },
  // 1 retry — modelRouter handles fallback resolution internally
  model_unavailable: {
    maxAttempts: 2,
    delayMs: () => 500,
  },
  // No retries
  validation: {
    maxAttempts: 1,
    delayMs: () => 0,
  },
  // Unknown — treat as transient with 1 retry
  unknown: {
    maxAttempts: 2,
    delayMs: () => 1_000,
  },
};

function getRetryPolicy(kind: ErrorKind, maxRetriesOverride?: number): RetryPolicy {
  const base = DEFAULT_RETRY_POLICIES[kind];
  if (maxRetriesOverride === undefined) return base;

  // Override: maxRetries is the number of retries (not total attempts)
  return {
    maxAttempts: maxRetriesOverride + 1,
    delayMs: base.delayMs,
  };
}

// ---------------------------------------------------------------------------
// Service role Supabase client — lazily created once per edge function lifetime
// ---------------------------------------------------------------------------

let _serviceClient: ReturnType<typeof createClient> | null = null;

function getServiceClient(): ReturnType<typeof createClient> {
  if (_serviceClient) return _serviceClient;

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('[agentRunner] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  }

  _serviceClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _serviceClient;
}

// ---------------------------------------------------------------------------
// sleep helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// agent_executions helpers
// ---------------------------------------------------------------------------

/**
 * Insert a new agent_executions row with status='running'.
 * Returns the execution_id, or null if the insert failed (non-fatal).
 */
async function insertExecutionRecord(
  supabase: ReturnType<typeof createClient>,
  params: {
    traceId: string;
    agentName: string;
    executionType: string;
    triggeredBy: string;
    userId: string;
    orgId: string;
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('agent_executions')
      .insert({
        trace_id: params.traceId,
        agent_name: params.agentName,
        execution_type: params.executionType,
        triggered_by: params.triggeredBy,
        started_at: new Date().toISOString(),
        status: 'running',
        user_id: params.userId,
        org_id: params.orgId,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[agentRunner] agent_executions insert failed:', error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    console.warn('[agentRunner] agent_executions insert error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Update an agent_executions row on completion, failure, partial, or budget_exceeded.
 * Non-fatal — logging errors never crash the host function.
 */
async function updateExecutionRecord(
  supabase: ReturnType<typeof createClient>,
  executionId: string,
  params: {
    status: 'completed' | 'failed' | 'partial' | 'budget_exceeded';
    itemsEmitted?: number;
    itemsProcessed?: number;
    tokensConsumed?: number;
    creditsConsumed?: number;
    modelId?: string;
    modelWasFallback?: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const update: Record<string, unknown> = {
      status: params.status,
      completed_at: new Date().toISOString(),
    };
    if (params.itemsEmitted !== undefined) update.items_emitted = params.itemsEmitted;
    if (params.itemsProcessed !== undefined) update.items_processed = params.itemsProcessed;
    if (params.tokensConsumed !== undefined) update.tokens_consumed = params.tokensConsumed;
    if (params.creditsConsumed !== undefined) update.credits_consumed = params.creditsConsumed;
    if (params.modelId !== undefined) update.model_id = params.modelId;
    if (params.modelWasFallback !== undefined) update.model_was_fallback = params.modelWasFallback;
    if (params.errorMessage !== undefined) update.error_message = params.errorMessage;
    if (params.metadata !== undefined) update.metadata = params.metadata;

    const { error } = await supabase
      .from('agent_executions')
      .update(update)
      .eq('id', executionId);

    if (error) {
      console.warn('[agentRunner] agent_executions update failed:', error.message);
    }
  } catch (err) {
    console.warn('[agentRunner] agent_executions update error:', err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// runAgent
// ---------------------------------------------------------------------------

/**
 * Execute a fleet agent with standardised retry logic, budget enforcement,
 * and structured telemetry.
 *
 * @param config    - Agent identity and execution options.
 * @param executor  - Async function that performs the agent's work, receiving
 *                    a shared AgentContext with Supabase client, logger, and
 *                    credit budget helpers.
 *
 * @returns AgentResult with success/failure status, result data, timing, and
 *          credit consumption details.
 *
 * @example
 * const result = await runAgent(
 *   { agentName: 'morning-briefing', userId, orgId },
 *   async (ctx) => {
 *     const meetings = await fetchMeetings(ctx.supabase, userId);
 *     return { meetings };
 *   },
 * );
 */
export async function runAgent<T>(
  config: AgentConfig,
  executor: AgentExecutor<T>,
): Promise<AgentResult<T>> {
  const traceId = config.traceId ?? crypto.randomUUID();
  const startMs = Date.now();

  const logger = createLogger('agent-runner', {
    traceId,
    userId: config.userId,
    orgId: config.orgId,
    agentName: config.agentName,
  });

  logger.info('agent.start', {
    agentName: config.agentName,
    allowPartialResults: config.allowPartialResults ?? false,
    maxRetriesOverride: config.maxRetries,
  });

  // Insert agent_executions record (non-fatal if it fails)
  const serviceClient = getServiceClient();
  const executionId = await insertExecutionRecord(serviceClient, {
    traceId,
    agentName: config.agentName,
    executionType: 'fleet_agent',
    triggeredBy: 'fleet-router',
    userId: config.userId,
    orgId: config.orgId,
  });

  // Mutable credit counter shared via closure with the AgentContext
  let creditsUsed = 0;

  const ctx: AgentContext = {
    supabase: getServiceClient(),
    logger,
    traceId,
    get creditsUsed() {
      return creditsUsed;
    },
    checkBudget() {
      return checkAgentBudget(config.agentName, creditsUsed);
    },
  };

  let lastError: unknown = undefined;
  let retriesUsed = 0;
  let partialData: T | undefined = undefined;

  // Determine total attempts based on the first error kind we encounter.
  // We start with a conservative maximum and clamp per-failure-type below.
  const MAX_POSSIBLE_ATTEMPTS = 4; // safety cap — no policy exceeds 3 attempts

  for (let attempt = 0; attempt < MAX_POSSIBLE_ATTEMPTS; attempt++) {
    // Before each attempt (not just first) check budget
    const budget = ctx.checkBudget();
    if (budget.exceeded) {
      logger.warn('agent.budget_exceeded_before_attempt', {
        attempt,
        creditsUsed,
        limit: budget.limit,
        agentName: config.agentName,
      });

      // If we have partial results, return them
      if (config.allowPartialResults && partialData !== undefined) {
        const budgetError = `Budget exceeded after ${creditsUsed} credits (limit: ${budget.limit})`;
        if (executionId) {
          await updateExecutionRecord(serviceClient, executionId, {
            status: 'budget_exceeded',
            creditsConsumed: creditsUsed,
            errorMessage: budgetError,
          });
        }
        await logger.flush();
        return {
          success: false,
          data: partialData,
          partial: true,
          error: budgetError,
          traceId,
          executionId: executionId ?? undefined,
          durationMs: Date.now() - startMs,
          creditsConsumed: creditsUsed,
          retriesUsed,
        };
      }

      const budgetError = `Budget exceeded after ${creditsUsed} credits (limit: ${budget.limit})`;
      if (executionId) {
        await updateExecutionRecord(serviceClient, executionId, {
          status: 'budget_exceeded',
          creditsConsumed: creditsUsed,
          errorMessage: budgetError,
        });
      }
      await logger.flush();
      return {
        success: false,
        error: budgetError,
        traceId,
        executionId: executionId ?? undefined,
        durationMs: Date.now() - startMs,
        creditsConsumed: creditsUsed,
        retriesUsed,
      };
    }

    try {
      const span = logger.createSpan('agent.attempt', { attempt, agentName: config.agentName });

      const data = await executor(ctx);

      span.stop({ success: true });
      logger.info('agent.success', {
        agentName: config.agentName,
        attempt,
        retriesUsed,
        creditsUsed,
        durationMs: Date.now() - startMs,
      });

      if (executionId) {
        await updateExecutionRecord(serviceClient, executionId, {
          status: 'completed',
          creditsConsumed: creditsUsed,
          metadata: { retries_used: retriesUsed, attempts: attempt + 1 },
        });
      }

      await logger.flush();
      return {
        success: true,
        data,
        traceId,
        executionId: executionId ?? undefined,
        durationMs: Date.now() - startMs,
        creditsConsumed: creditsUsed,
        retriesUsed,
      };
    } catch (err) {
      lastError = err;
      const kind = classifyError(err);
      const policy = getRetryPolicy(kind, config.maxRetries);

      logger.warn('agent.attempt_failed', {
        agentName: config.agentName,
        attempt,
        kind,
        maxAttempts: policy.maxAttempts,
        error: err instanceof Error ? err.message : String(err),
      });

      // Validation errors — no retries, fail immediately
      if (kind === 'validation') {
        break;
      }

      // Context exceeded — hint available for executor on retry but we still retry
      if (kind === 'context_exceeded') {
        logger.info('agent.context_exceeded_hint', {
          agentName: config.agentName,
          hint: 'Executor should truncate input on next attempt',
        });
      }

      // Check if we have more attempts remaining under this policy
      if (attempt + 1 >= policy.maxAttempts) {
        // Exhausted retries for this error kind
        logger.error('agent.retries_exhausted', err, {
          agentName: config.agentName,
          kind,
          attempts: attempt + 1,
        });
        break;
      }

      // Delay before retry
      const delay = policy.delayMs(retriesUsed);
      retriesUsed++;

      if (delay > 0) {
        logger.info('agent.retry_delay', {
          agentName: config.agentName,
          retryIndex: retriesUsed,
          delayMs: delay,
          kind,
        });
        await sleep(delay);
      } else {
        logger.info('agent.retry_immediate', {
          agentName: config.agentName,
          retryIndex: retriesUsed,
          kind,
        });
      }
    }
  }

  // All attempts exhausted — build failure result
  const errorMessage = lastError instanceof Error
    ? lastError.message
    : lastError != null
    ? String(lastError)
    : 'Unknown error';

  logger.error('agent.failed', lastError, {
    agentName: config.agentName,
    retriesUsed,
    creditsUsed,
    durationMs: Date.now() - startMs,
  });

  // Return partial result if allowed and available
  if (config.allowPartialResults && partialData !== undefined) {
    if (executionId) {
      await updateExecutionRecord(serviceClient, executionId, {
        status: 'partial',
        creditsConsumed: creditsUsed,
        errorMessage,
        metadata: { retries_used: retriesUsed },
      });
    }
    await logger.flush();
    return {
      success: false,
      data: partialData,
      partial: true,
      error: errorMessage,
      traceId,
      executionId: executionId ?? undefined,
      durationMs: Date.now() - startMs,
      creditsConsumed: creditsUsed,
      retriesUsed,
    };
  }

  if (executionId) {
    await updateExecutionRecord(serviceClient, executionId, {
      status: 'failed',
      creditsConsumed: creditsUsed,
      errorMessage,
      metadata: { retries_used: retriesUsed },
    });
  }
  await logger.flush();

  return {
    success: false,
    error: errorMessage,
    traceId,
    executionId: executionId ?? undefined,
    durationMs: Date.now() - startMs,
    creditsConsumed: creditsUsed,
    retriesUsed,
  };
}

// ---------------------------------------------------------------------------
// Convenience: addCredits helper for executors to track consumption
// ---------------------------------------------------------------------------

/**
 * Returns a credit-tracking helper bound to a mutable counter reference.
 * Pass `addCredits` to sub-steps inside your executor so they can register
 * consumption against the shared budget tracked by the AgentContext.
 *
 * @example
 * const [getCredits, addCredits] = createCreditTracker();
 * // pass addCredits to sub-steps
 * addCredits(resolution.creditCost);
 * ctx.creditsUsed = getCredits(); // sync back to context
 *
 * Note: prefer using the closure-based creditsUsed in AgentContext directly.
 * This helper is provided for cases where sub-modules need to track credits
 * without direct access to the AgentContext.
 */
export function createCreditTracker(): [
  getCredits: () => number,
  addCredits: (amount: number) => void,
] {
  let total = 0;
  return [
    () => total,
    (amount: number) => {
      total += amount;
    },
  ];
}
