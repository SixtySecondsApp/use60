// supabase/functions/proposal-pipeline-v2/index.ts
// PIP-004: Pipeline orchestrator — chains all 5 stages of the V2 proposal pipeline
// PIP-005: Error handling and retry logic
// PIP-006: Pipeline monitoring — timing, credits, error rates
//
// Stage chain:
//   Stage 1 — proposal-assemble-context  → generation_status: assembling → context_assembled
//   Stage 2 — proposal-compose-v2        → generation_status: composing  → composed
//   Stage 3+4 — proposal-render-gotenberg → generation_status: rendering → rendered
//   Stage 5 — proposal-deliver           → generation_status: delivering → ready
//
// Responsibilities:
//   1. Create a proposals row with status 'assembling' and trigger_type
//   2. Invoke each stage function internally via supabase.functions.invoke()
//   3. Update generation_status after each stage via Supabase (realtime subscribers see every transition)
//   4. Store per-stage timing in proposals.metadata as { stage_timings: { assemble_ms, compose_ms, render_ms, deliver_ms } }
//   5. Log pipeline-level credit usage event on completion
//   6. On error at any stage: set generation_status to 'failed', store error in metadata, return partial result
//
// PIP-005 — Retry logic:
//   - retryWithBackoff(): 1s/3s/9s exponential backoff (REL-002 pattern)
//   - NonRetryableError class: 4xx status codes skip remaining retries immediately
//   - Stage 1 (context): 2 retries — DB only, fast
//   - Stage 2 (compose): 2 retries — AI timeout resilience
//   - Stage 3+4 (render): 2 retries — Gotenberg warmup resilience
//   - Stage 5 (deliver): 1 retry — Slack; never aborts pipeline on failure
//   - Terminal: markFailed() sets generation_status='failed' + stores error in style_config._pipeline_error
//
// PIP-006 — Monitoring:
//   - PipelineMonitor accumulates per-stage StageResult (status, duration_ms, error)
//   - PipelineMonitor.addCredits() aggregates total credits across all stages
//   - flushMetrics() writes credits_used + style_config._pipeline_metrics to proposals row
//
// Auth: Service-role only (--no-verify-jwt at deploy time).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'
import { logAICostEvent } from '../_shared/costTracking.ts'

// =============================================================================
// Constants
// =============================================================================

const LOG_PREFIX = '[proposal-pipeline-v2]'

// =============================================================================
// PIP-005 — Retry logic (REL-002 pattern)
// =============================================================================

/** HTTP status codes that must NOT be retried (client/auth errors). */
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 422])

/**
 * Wraps a stage error that should propagate immediately without consuming
 * remaining retry budget. Use for 4xx responses and validation failures.
 */
class NonRetryableError extends Error {
  public readonly statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'NonRetryableError'
    this.statusCode = statusCode
  }
}

/**
 * Execute an async function with exponential backoff.
 *
 * Non-retryable errors (NonRetryableError instances, or objects whose
 * statusCode is in NON_RETRYABLE_STATUS_CODES) fail immediately without
 * consuming remaining retries.
 *
 * Default delays match the REL-002 pattern used in generate-proposal: 1s, 3s, 9s.
 *
 * @param fn      Async function to execute.
 * @param retries Maximum retry attempts after the first failure (default 2).
 * @param delays  Millisecond delays between retries (default [1000, 3000, 9000]).
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = 2,
  delays: number[] = [1000, 3000, 9000],
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // Non-retryable: fail immediately
      if (err instanceof NonRetryableError) {
        console.error(
          `${LOG_PREFIX} retryWithBackoff: non-retryable error on attempt ${attempt + 1}: ${lastError.message}`,
        )
        throw lastError
      }
      if (
        (err as Record<string, unknown>)?.statusCode !== undefined &&
        NON_RETRYABLE_STATUS_CODES.has((err as Record<string, unknown>).statusCode as number)
      ) {
        console.error(
          `${LOG_PREFIX} retryWithBackoff: non-retryable status on attempt ${attempt + 1}: ${lastError.message}`,
        )
        throw lastError
      }

      if (attempt >= retries) break

      const delay = delays[Math.min(attempt, delays.length - 1)]
      console.warn(
        `${LOG_PREFIX} retryWithBackoff: attempt ${attempt + 1}/${retries + 1} failed — retrying in ${delay}ms: ${lastError.message}`,
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  const finalError = new Error(
    `${lastError?.message ?? 'Unknown error'} [failed after ${retries + 1} attempts]`,
  )
  ;(finalError as Record<string, unknown>).attempts = retries + 1
  throw finalError
}

// =============================================================================
// PIP-006 — Stage timer + pipeline monitor
// =============================================================================

interface StageResult {
  stage: string
  status: 'ok' | 'failed' | 'skipped'
  duration_ms: number
  error?: string
}

interface PipelineMetrics {
  pipeline_started_at: string
  pipeline_finished_at: string | null
  total_duration_ms: number
  total_credits_used: number
  stages: StageResult[]
  failure_stage: string | null
}

/** Lightweight timer for a single pipeline stage. */
class StageTimer {
  private _startedAt: number | null = null
  readonly stage: string
  constructor(stage: string) { this.stage = stage }

  start(): void {
    this._startedAt = Date.now()
    console.log(`${LOG_PREFIX} [${this.stage}] started`)
  }

  finish(status: 'ok' | 'failed' | 'skipped', error?: string): StageResult {
    const duration_ms = this._startedAt !== null ? Date.now() - this._startedAt : 0
    const result: StageResult = { stage: this.stage, status, duration_ms }
    if (error) result.error = error
    console.log(`${LOG_PREFIX} [${this.stage}] ${status} in ${duration_ms}ms${error ? ` — ${error}` : ''}`)
    return result
  }
}

/** Accumulates credit usage and per-stage timing for a pipeline run. */
class PipelineMonitor {
  private readonly _startedAt: number
  private _stages: StageResult[] = []
  private _totalCredits = 0

  constructor() { this._startedAt = Date.now() }

  recordStage(result: StageResult): void { this._stages.push(result) }
  addCredits(credits: number): void { this._totalCredits += credits }

  finalise(): PipelineMetrics {
    const now = Date.now()
    const failureStage = this._stages.find((s) => s.status === 'failed')?.stage ?? null
    return {
      pipeline_started_at: new Date(this._startedAt).toISOString(),
      pipeline_finished_at: new Date(now).toISOString(),
      total_duration_ms: now - this._startedAt,
      total_credits_used: this._totalCredits,
      stages: [...this._stages],
      failure_stage: failureStage,
    }
  }
}

/**
 * Write pipeline metrics to the proposals row.
 * Merges _pipeline_metrics into style_config without clobbering other keys.
 * Fire-and-forget safe — errors are logged but not re-thrown.
 */
async function flushMetrics(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  metrics: PipelineMetrics,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('proposals')
      .select('style_config')
      .eq('id', proposalId)
      .maybeSingle()

    const currentStyleConfig = (existing?.style_config as Record<string, unknown> | null) ?? {}

    const { error } = await supabase
      .from('proposals')
      .update({
        credits_used: metrics.total_credits_used,
        style_config: { ...currentStyleConfig, _pipeline_metrics: metrics },
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId)

    if (error) {
      console.error(`${LOG_PREFIX} flushMetrics: failed to write metrics:`, error.message)
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} flushMetrics: unexpected error:`, err)
  }
}

/**
 * Mark a proposal as failed and store a structured error in style_config.
 * Sets generation_status = 'failed'. Fire-and-forget safe — never throws.
 */
async function markFailed(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  failedStage: string,
  errorMessage: string,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('proposals')
      .select('style_config')
      .eq('id', proposalId)
      .maybeSingle()

    const currentStyleConfig = (existing?.style_config as Record<string, unknown> | null) ?? {}

    const { error } = await supabase
      .from('proposals')
      .update({
        generation_status: 'failed',
        style_config: {
          ...currentStyleConfig,
          _pipeline_error: {
            failed_stage: failedStage,
            error_message: errorMessage,
            failed_at: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId)

    if (error) {
      console.error(`${LOG_PREFIX} markFailed: update error:`, error.message)
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} markFailed: unexpected error:`, err)
  }
}

// =============================================================================
// Types
// =============================================================================

interface PipelineRequest {
  /** Optional — required when proposal triggered from a meeting */
  meeting_id?: string
  /** Optional — required when proposal linked to a deal. At least one of meeting_id or deal_id must be provided. */
  deal_id?: string
  /** Optional — overrides contact resolution from deal */
  contact_id?: string
  /** Optional — uses org default if omitted */
  template_id?: string
  trigger_type: 'auto_post_meeting' | 'manual_button' | 'copilot' | 'slack'
  user_id: string
  org_id: string
}

interface StageTiming {
  assemble_ms?: number
  compose_ms?: number
  render_ms?: number
  deliver_ms?: number
}

interface PipelineResult {
  success: boolean
  proposal_id: string
  pdf_url?: string | null
  generation_status: string
  stage_timings: StageTiming
  total_ms: number
  total_credits: number
  error?: string
  failed_stage?: string
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Update a proposal's generation_status and optionally merge data into metadata.
 * Never throws — errors are logged but do not block the pipeline.
 */
async function updateProposalStatus(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  status: string,
  metadataPatch?: Record<string, unknown>,
): Promise<void> {
  try {
    const updatePayload: Record<string, unknown> = {
      generation_status: status,
      updated_at: new Date().toISOString(),
    }

    if (metadataPatch) {
      // Merge into existing metadata with a Postgres-side merge to avoid clobbers.
      // We fetch the current metadata first so we can merge safely in JS.
      const { data: existing } = await supabase
        .from('proposals')
        .select('metadata')
        .eq('id', proposalId)
        .maybeSingle()

      const currentMeta: Record<string, unknown> =
        (existing?.metadata as Record<string, unknown>) ?? {}

      updatePayload.metadata = { ...currentMeta, ...metadataPatch }
    }

    const { error } = await supabase
      .from('proposals')
      .update(updatePayload)
      .eq('id', proposalId)

    if (error) {
      console.warn(
        `${LOG_PREFIX} Non-fatal: failed to set generation_status='${status}' for proposal=${proposalId}:`,
        error.message,
      )
    } else {
      console.log(`${LOG_PREFIX} proposal=${proposalId} status → ${status}`)
    }
  } catch (err) {
    console.warn(
      `${LOG_PREFIX} Non-fatal: updateProposalStatus threw for proposal=${proposalId}:`,
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * Invoke a downstream edge function via supabase.functions.invoke().
 * Returns the parsed JSON response body or throws on non-success.
 */
async function invokeStage<T = Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  console.log(`${LOG_PREFIX} Invoking ${functionName}`)

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload,
  })

  if (error) {
    throw new Error(`${functionName} invocation error: ${error.message}`)
  }

  // supabase.functions.invoke() parses the JSON body automatically.
  // Stage functions return { success, ... } on success and { error: '...' } on failure.
  const result = data as Record<string, unknown>

  if (result?.success === false || result?.error) {
    const msg =
      typeof result.error === 'string'
        ? result.error
        : `${functionName} returned a failure response`
    throw new Error(msg)
  }

  return result as T
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req: Request) => {
  // --------------------------------------------------------------------------
  // CORS preflight
  // --------------------------------------------------------------------------
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  // --------------------------------------------------------------------------
  // Environment
  // --------------------------------------------------------------------------
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`${LOG_PREFIX} Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`)
    return errorResponse('Server misconfiguration', req, 500)
  }

  // Service-role client — used for DB writes and function invocations
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // --------------------------------------------------------------------------
  // Parse + validate request body
  // --------------------------------------------------------------------------
  let body: PipelineRequest
  try {
    body = (await req.json()) as PipelineRequest
  } catch {
    return errorResponse('Invalid JSON body', req, 400)
  }

  const { meeting_id, deal_id, contact_id, template_id, trigger_type, user_id, org_id } = body

  if (!user_id) return errorResponse('user_id is required', req, 400)
  if (!org_id) return errorResponse('org_id is required', req, 400)
  if (!trigger_type) return errorResponse('trigger_type is required', req, 400)
  if (!meeting_id && !deal_id) {
    return errorResponse(
      'At least one of meeting_id or deal_id must be provided',
      req,
      400,
    )
  }

  const validTriggerTypes = ['auto_post_meeting', 'manual_button', 'copilot', 'slack']
  if (!validTriggerTypes.includes(trigger_type)) {
    return errorResponse(
      `trigger_type must be one of: ${validTriggerTypes.join(', ')}`,
      req,
      400,
    )
  }

  console.log(
    `${LOG_PREFIX} Pipeline started`,
    `| trigger=${trigger_type} user=${user_id} org=${org_id}`,
    `| meeting=${meeting_id ?? 'none'} deal=${deal_id ?? 'none'}`,
  )

  const pipelineStart = Date.now()
  const stageTiming: StageTiming = {}
  const monitor = new PipelineMonitor()

  // --------------------------------------------------------------------------
  // Step 0: Resolve a proposal title from the deal/meeting (best-effort)
  // --------------------------------------------------------------------------
  let proposalTitle = 'Proposal'

  if (deal_id) {
    const { data: dealRow } = await supabase
      .from('deals')
      .select('name, company')
      .eq('id', deal_id)
      .maybeSingle()

    if (dealRow?.name) {
      proposalTitle = dealRow.company
        ? `Proposal for ${dealRow.company}`
        : dealRow.name
    }
  } else if (meeting_id) {
    const { data: meetingRow } = await supabase
      .from('meetings')
      .select('title')
      .eq('id', meeting_id)
      .maybeSingle()

    if (meetingRow?.title) {
      proposalTitle = `Proposal — ${meetingRow.title}`
    }
  }

  // --------------------------------------------------------------------------
  // Step 1: Create the proposals row with status 'assembling'
  // --------------------------------------------------------------------------
  const { data: newProposal, error: createError } = await supabase
    .from('proposals')
    .insert({
      org_id,
      user_id,
      deal_id: deal_id ?? null,
      meeting_id: meeting_id ?? null,
      contact_id: contact_id ?? null,
      template_id: template_id ?? null,
      title: proposalTitle,
      trigger_type,
      generation_status: 'assembling',
      status: 'draft',
      metadata: {
        pipeline_version: 2,
        pipeline_started_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single()

  if (createError || !newProposal?.id) {
    console.error(`${LOG_PREFIX} Failed to create proposal row:`, createError?.message)
    return errorResponse('Failed to create proposal record', req, 500)
  }

  const proposalId = newProposal.id
  console.log(`${LOG_PREFIX} Created proposal=${proposalId} status=assembling`)

  // Partial result returned on any stage failure
  const partialResult = (
    status: string,
    failedStage: string,
    errMessage: string,
  ): PipelineResult => ({
    success: false,
    proposal_id: proposalId,
    pdf_url: null,
    generation_status: status,
    stage_timings: stageTiming,
    total_ms: Date.now() - pipelineStart,
    total_credits: 0,
    error: errMessage,
    failed_stage: failedStage,
  })

  // ==========================================================================
  // STAGE 1 — Assemble context
  //   Graceful degradation: offering profile and transcript are optional;
  //   assembleProposalContext handles their absence internally.
  //   Retry: 2x with 1s/3s/9s backoff — DB only, fast.
  // ==========================================================================
  const s1 = new StageTimer('stage_1_context')
  s1.start()
  const stage1Start = Date.now()

  try {
    await retryWithBackoff(
      () => invokeStage(supabase, 'proposal-assemble-context', {
        proposal_id: proposalId,
        meeting_id: meeting_id ?? undefined,
        deal_id: deal_id ?? undefined,
        contact_id: contact_id ?? undefined,
        user_id,
      }),
      2,
      [1000, 3000, 9000],
    )
    monitor.recordStage(s1.finish('ok'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Stage 1 (assemble-context) failed:`, message)
    monitor.recordStage(s1.finish('failed', message))

    await Promise.all([
      flushMetrics(supabase, proposalId, monitor.finalise()),
      markFailed(supabase, proposalId, 'stage_1_context', message),
    ])

    return jsonResponse(partialResult('failed', 'assemble', message), req, 500)
  }

  stageTiming.assemble_ms = Date.now() - stage1Start
  console.log(`${LOG_PREFIX} Stage 1 complete in ${stageTiming.assemble_ms}ms`)

  // Update status: context_assembled
  await updateProposalStatus(supabase, proposalId, 'context_assembled', {
    stage_timings: { ...stageTiming },
  })

  // ==========================================================================
  // STAGE 2 — Compose with AI (status: composing → composed)
  //   Retry: 2x with 1s/3s/9s backoff — resilience against AI timeouts.
  // ==========================================================================
  await updateProposalStatus(supabase, proposalId, 'composing')

  const s2 = new StageTimer('stage_2_compose')
  s2.start()
  const stage2Start = Date.now()
  let composeResult: Record<string, unknown> = {}

  try {
    composeResult = await retryWithBackoff(
      () => invokeStage(supabase, 'proposal-compose-v2', {
        proposal_id: proposalId,
        user_id,
        org_id,
        template_schema: null, // compose-v2 loads the org default template schema itself
      }),
      2,
      [1000, 3000, 9000],
    )
    const creditsUsed = Number(composeResult?.credits_used ?? 0)
    monitor.addCredits(creditsUsed)
    monitor.recordStage(s2.finish('ok'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Stage 2 (compose-v2) failed:`, message)
    monitor.recordStage(s2.finish('failed', message))

    await Promise.all([
      flushMetrics(supabase, proposalId, monitor.finalise()),
      markFailed(supabase, proposalId, 'stage_2_compose', message),
    ])

    return jsonResponse(partialResult('failed', 'compose', message), req, 500)
  }

  stageTiming.compose_ms = Date.now() - stage2Start
  console.log(
    `${LOG_PREFIX} Stage 2 complete in ${stageTiming.compose_ms}ms`,
    `| sections=${composeResult.sections_count ?? 'unknown'}`,
    `| input_tokens=${composeResult.input_tokens ?? 0}`,
    `| output_tokens=${composeResult.output_tokens ?? 0}`,
  )

  // Log Stage 2 credit usage (fire-and-forget)
  logAICostEvent(
    supabase,
    user_id,
    org_id,
    'openrouter',
    String(composeResult.model ?? 'anthropic/claude-3-5-sonnet-20241022'),
    Number(composeResult.input_tokens ?? 0),
    Number(composeResult.output_tokens ?? 0),
    'proposal_generation',
    {
      proposal_id: proposalId,
      pipeline_stage: 'compose-v2',
      sections_count: composeResult.sections_count,
    },
    {
      source: 'user_initiated',
      contextSummary: `Pipeline compose: proposal ${proposalId}`,
    },
    'proposal-pipeline-v2',
  ).catch((err) => {
    console.warn(`${LOG_PREFIX} Stage 2 cost log failed (non-fatal):`, err)
  })

  // proposal-compose-v2 writes 'composed' itself; ensure it's set before we proceed
  await updateProposalStatus(supabase, proposalId, 'composed', {
    stage_timings: { ...stageTiming },
  })

  // ==========================================================================
  // STAGE 3+4 — Render to PDF via Gotenberg (status: rendering → rendered)
  //   Retry: 2x with 1s/3s/9s backoff — Gotenberg warmup resilience.
  // ==========================================================================
  await updateProposalStatus(supabase, proposalId, 'rendering')

  const s3 = new StageTimer('stage_3_render')
  s3.start()
  const stage3Start = Date.now()
  let renderResult: Record<string, unknown> = {}

  try {
    renderResult = await retryWithBackoff(
      () => invokeStage(supabase, 'proposal-render-gotenberg', {
        proposal_id: proposalId,
        template_id: template_id ?? null,
      }),
      2,
      [1000, 3000, 9000],
    )
    monitor.recordStage(s3.finish('ok'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Stage 3+4 (render-gotenberg) failed:`, message)
    monitor.recordStage(s3.finish('failed', message))

    await Promise.all([
      flushMetrics(supabase, proposalId, monitor.finalise()),
      markFailed(supabase, proposalId, 'stage_3_render', message),
    ])

    return jsonResponse(partialResult('failed', 'render', message), req, 500)
  }

  stageTiming.render_ms = Date.now() - stage3Start
  const pdfUrl = typeof renderResult.pdf_url === 'string' ? renderResult.pdf_url : null

  console.log(
    `${LOG_PREFIX} Stage 3+4 complete in ${stageTiming.render_ms}ms`,
    `| pdf_url=${pdfUrl ? 'set' : 'missing'}`,
    `| pdf_size_bytes=${renderResult.pdf_size_bytes ?? 'unknown'}`,
  )

  // proposal-render-gotenberg writes 'rendered' itself; ensure it's set
  await updateProposalStatus(supabase, proposalId, 'rendered', {
    stage_timings: { ...stageTiming },
  })

  // ==========================================================================
  // STAGE 5 — Deliver (Slack DM + activity record) (status: delivering → ready)
  //   Retry: 1x — Slack is best-effort; never aborts pipeline on failure.
  // ==========================================================================
  await updateProposalStatus(supabase, proposalId, 'delivering')

  const s5 = new StageTimer('stage_5_deliver')
  s5.start()
  const stage5Start = Date.now()
  let deliverResult: Record<string, unknown> = {}

  try {
    deliverResult = await retryWithBackoff(
      () => invokeStage(supabase, 'proposal-deliver', {
        proposal_id: proposalId,
        pdf_url: pdfUrl ?? undefined,
      }),
      1,
      [1000, 3000, 9000],
    )
    monitor.recordStage(s5.finish('ok'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Stage 5 (deliver) failed:`, message)
    monitor.recordStage(s5.finish('failed', message))

    // Delivery failure is non-fatal for the user (they have the PDF).
    // We still mark the proposal as 'ready' — Slack/activity are best-effort.
    console.warn(
      `${LOG_PREFIX} Delivery failed but PDF is ready — marking as 'ready' anyway`,
    )

    stageTiming.deliver_ms = Date.now() - stage5Start

    const finalMetrics = monitor.finalise()
    await Promise.all([
      flushMetrics(supabase, proposalId, finalMetrics),
      updateProposalStatus(supabase, proposalId, 'ready', {
        stage_timings: { ...stageTiming },
        pipeline_deliver_warning: message,
        pipeline_completed_at: new Date().toISOString(),
      }),
    ])

    const total = Date.now() - pipelineStart
    console.log(
      `${LOG_PREFIX} Pipeline complete (with deliver warning) proposal=${proposalId}`,
      `| total_ms=${total}`,
    )

    return jsonResponse(
      {
        success: true,
        proposal_id: proposalId,
        pdf_url: pdfUrl,
        generation_status: 'ready',
        stage_timings: stageTiming,
        total_ms: total,
        total_credits: finalMetrics.total_credits_used,
        warnings: [`Delivery notification failed: ${message}`],
      } satisfies Omit<PipelineResult, 'total_credits'> & { warnings: string[]; total_credits: number },
      req,
      200,
    )
  }

  stageTiming.deliver_ms = Date.now() - stage5Start
  console.log(
    `${LOG_PREFIX} Stage 5 complete in ${stageTiming.deliver_ms}ms`,
    `| slack_sent=${deliverResult.slack_sent ?? false}`,
    `| activity_created=${deliverResult.activity_created ?? false}`,
  )

  // ==========================================================================
  // Final status update: ready
  // ==========================================================================
  const total = Date.now() - pipelineStart
  const finalMetrics = monitor.finalise()

  await Promise.all([
    flushMetrics(supabase, proposalId, finalMetrics),
    updateProposalStatus(supabase, proposalId, 'ready', {
      stage_timings: { ...stageTiming },
      pipeline_completed_at: new Date().toISOString(),
      pipeline_total_ms: total,
    }),
  ])

  // Log pipeline-level cost event (fire-and-forget)
  logAICostEvent(
    supabase,
    user_id,
    org_id,
    'openrouter',
    'pipeline',
    0,
    0,
    'proposal_generation',
    {
      proposal_id: proposalId,
      pipeline_stage: 'pipeline-orchestrator',
      trigger_type,
      stage_timings: stageTiming,
      total_ms: total,
      total_credits: finalMetrics.total_credits_used,
    },
    {
      source: trigger_type === 'manual_button' || trigger_type === 'copilot'
        ? 'user_initiated'
        : 'agent_automated',
      contextSummary: `Full pipeline: proposal ${proposalId}`,
    },
    'proposal-pipeline-v2',
  ).catch((err) => {
    console.warn(`${LOG_PREFIX} Pipeline cost log failed (non-fatal):`, err)
  })

  console.log(
    `${LOG_PREFIX} Pipeline complete proposal=${proposalId}`,
    `| total_ms=${total}`,
    `| total_credits=${finalMetrics.total_credits_used}`,
    `| assemble=${stageTiming.assemble_ms}ms`,
    `| compose=${stageTiming.compose_ms}ms`,
    `| render=${stageTiming.render_ms}ms`,
    `| deliver=${stageTiming.deliver_ms}ms`,
  )

  const finalResult: PipelineResult = {
    success: true,
    proposal_id: proposalId,
    pdf_url: pdfUrl,
    generation_status: 'ready',
    stage_timings: stageTiming,
    total_ms: total,
    total_credits: finalMetrics.total_credits_used,
  }

  return jsonResponse(finalResult, req, 200)
})
