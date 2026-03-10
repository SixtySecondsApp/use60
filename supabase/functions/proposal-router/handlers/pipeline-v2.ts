// Handler extracted from proposal-pipeline-v2/index.ts
// PIP-004: Pipeline orchestrator — chains all 5 stages of the V2 proposal pipeline
// PIP-005: Error handling and retry logic
// PIP-006: Pipeline monitoring — timing, credits, error rates

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../../_shared/corsHelper.ts'
import { logAICostEvent } from '../../_shared/costTracking.ts'
import {
  generateProposalHTML,
  type ProposalSection,
} from '../../_shared/templateEngine.ts'

// =============================================================================
// Constants
// =============================================================================

const LOG_PREFIX = '[proposal-pipeline-v2]'

// =============================================================================
// PIP-005 — Retry logic (REL-002 pattern)
// =============================================================================

const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 422])

class NonRetryableError extends Error {
  public readonly statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'NonRetryableError'
    this.statusCode = statusCode
  }
}

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

      if (err instanceof NonRetryableError) {
        console.error(`${LOG_PREFIX} retryWithBackoff: non-retryable error on attempt ${attempt + 1}: ${lastError.message}`)
        throw lastError
      }
      if (
        (err as Record<string, unknown>)?.statusCode !== undefined &&
        NON_RETRYABLE_STATUS_CODES.has((err as Record<string, unknown>).statusCode as number)
      ) {
        console.error(`${LOG_PREFIX} retryWithBackoff: non-retryable status on attempt ${attempt + 1}: ${lastError.message}`)
        throw lastError
      }

      if (attempt >= retries) break

      const delay = delays[Math.min(attempt, delays.length - 1)]
      console.warn(`${LOG_PREFIX} retryWithBackoff: attempt ${attempt + 1}/${retries + 1} failed — retrying in ${delay}ms: ${lastError.message}`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  const finalError = new Error(`${lastError?.message ?? 'Unknown error'} [failed after ${retries + 1} attempts]`)
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

async function flushMetrics(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  metrics: PipelineMetrics,
): Promise<void> {
  try {
    const { data: existing } = await supabase.from('proposals').select('style_config').eq('id', proposalId).maybeSingle()
    const currentStyleConfig = (existing?.style_config as Record<string, unknown> | null) ?? {}
    const { error } = await supabase
      .from('proposals')
      .update({
        credits_used: metrics.total_credits_used,
        style_config: { ...currentStyleConfig, _pipeline_metrics: metrics },
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId)
    if (error) console.error(`${LOG_PREFIX} flushMetrics: failed to write metrics:`, error.message)
  } catch (err) {
    console.error(`${LOG_PREFIX} flushMetrics: unexpected error:`, err)
  }
}

async function markFailed(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  failedStage: string,
  errorMessage: string,
): Promise<void> {
  try {
    const { data: existing } = await supabase.from('proposals').select('style_config').eq('id', proposalId).maybeSingle()
    const currentStyleConfig = (existing?.style_config as Record<string, unknown> | null) ?? {}
    const { error } = await supabase
      .from('proposals')
      .update({
        generation_status: 'failed',
        style_config: {
          ...currentStyleConfig,
          _pipeline_error: { failed_stage: failedStage, error_message: errorMessage, failed_at: new Date().toISOString() },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId)
    if (error) console.error(`${LOG_PREFIX} markFailed: update error:`, error.message)
  } catch (err) {
    console.error(`${LOG_PREFIX} markFailed: unexpected error:`, err)
  }
}

// =============================================================================
// Types
// =============================================================================

interface SlackThread {
  channel_id: string
  thread_ts: string
  bot_token: string
}

interface PipelineRequest {
  proposal_id?: string
  meeting_id?: string
  deal_id?: string
  contact_id?: string
  template_id?: string
  trigger_type: 'auto_post_meeting' | 'manual_button' | 'copilot' | 'slack'
  user_id: string
  org_id: string
  slack_thread?: SlackThread
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
      const { data: existing } = await supabase.from('proposals').select('style_config').eq('id', proposalId).maybeSingle()
      const currentStyleConfig = (existing?.style_config as Record<string, unknown>) ?? {}
      const currentMeta = (currentStyleConfig._pipeline_meta as Record<string, unknown>) ?? {}
      updatePayload.style_config = { ...currentStyleConfig, _pipeline_meta: { ...currentMeta, ...metadataPatch } }
    }

    const { error } = await supabase.from('proposals').update(updatePayload).eq('id', proposalId)

    if (error) {
      console.warn(`${LOG_PREFIX} Non-fatal: failed to set generation_status='${status}' for proposal=${proposalId}:`, error.message)
    } else {
      console.log(`${LOG_PREFIX} proposal=${proposalId} status → ${status}`)
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} Non-fatal: updateProposalStatus threw for proposal=${proposalId}:`, err instanceof Error ? err.message : String(err))
  }
}

// Map old standalone function names to proposal-router action names
const PROPOSAL_ROUTER_ACTIONS: Record<string, string> = {
  'proposal-assemble-context': 'assemble_context',
  'proposal-compose-v2': 'compose_v2',
  'proposal-deliver': 'deliver',
  'proposal-enrich-deal': 'enrich_deal',
  'proposal-generate-docx': 'generate_docx',
  'proposal-generate-pdf': 'generate_pdf',
  'proposal-parse-document': 'parse_document',
  'proposal-pipeline-v2': 'pipeline_v2',
  'proposal-render-gotenberg': 'render_gotenberg',
}

async function invokeStage<T = Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const routerAction = PROPOSAL_ROUTER_ACTIONS[functionName]
  const targetFunction = routerAction ? 'proposal-router' : functionName
  const targetBody = routerAction ? { action: routerAction, ...payload } : payload

  console.log(`${LOG_PREFIX} Invoking ${functionName}${routerAction ? ` via proposal-router (action: ${routerAction})` : ''}`)

  const { data, error } = await supabase.functions.invoke(targetFunction, {
    body: targetBody,
  })

  if (error) {
    throw new Error(`${functionName} invocation error: ${error.message}`)
  }

  const result = data as Record<string, unknown>

  if (result?.success === false || result?.error) {
    const msg = typeof result.error === 'string' ? result.error : `${functionName} returned a failure response`
    throw new Error(msg)
  }

  return result as T
}

// =============================================================================
// Handler
// =============================================================================

export async function handlePipelineV2(req: Request): Promise<Response> {
  // CORS preflight
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`${LOG_PREFIX} Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`)
    return errorResponse('Server misconfiguration', req, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  let body: PipelineRequest
  try {
    body = (await req.json()) as PipelineRequest
  } catch {
    return errorResponse('Invalid JSON body', req, 400)
  }

  const { proposal_id: existingProposalId, meeting_id, deal_id, contact_id, template_id, trigger_type, user_id, org_id, slack_thread } = body

  if (!user_id) return errorResponse('user_id is required', req, 400)
  if (!org_id) return errorResponse('org_id is required', req, 400)
  if (!trigger_type) return errorResponse('trigger_type is required', req, 400)
  if (!meeting_id && !deal_id) {
    return errorResponse('At least one of meeting_id or deal_id must be provided', req, 400)
  }

  const validTriggerTypes = ['auto_post_meeting', 'manual_button', 'copilot', 'slack']
  if (!validTriggerTypes.includes(trigger_type)) {
    return errorResponse(`trigger_type must be one of: ${validTriggerTypes.join(', ')}`, req, 400)
  }

  console.log(`${LOG_PREFIX} Pipeline started`, `| trigger=${trigger_type} user=${user_id} org=${org_id}`, `| meeting=${meeting_id ?? 'none'} deal=${deal_id ?? 'none'}`)

  const pipelineStart = Date.now()
  const stageTiming: StageTiming = {}
  const monitor = new PipelineMonitor()

  // Step 0: Resolve proposal title
  let proposalTitle = 'Proposal'
  if (deal_id) {
    const { data: dealRow } = await supabase.from('deals').select('name, company').eq('id', deal_id).maybeSingle()
    if (dealRow?.name) proposalTitle = dealRow.company ? `Proposal for ${dealRow.company}` : dealRow.name
  } else if (meeting_id) {
    const { data: meetingRow } = await supabase.from('meetings').select('title').eq('id', meeting_id).maybeSingle()
    if (meetingRow?.title) proposalTitle = `Proposal — ${meetingRow.title}`
  }

  // Step 1: Create or adopt proposals row
  let proposalId: string

  if (existingProposalId) {
    const { error: adoptError } = await supabase
      .from('proposals')
      .update({
        deal_id: deal_id ?? null, meeting_id: meeting_id ?? null, contact_id: contact_id ?? null,
        template_id: template_id ?? null, title: proposalTitle, trigger_type,
        generation_status: 'assembling', pipeline_version: 2,
        style_config: { _pipeline_meta: { pipeline_version: 2, pipeline_started_at: new Date().toISOString() } },
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingProposalId)

    if (adoptError) {
      console.error(`${LOG_PREFIX} Failed to adopt proposal row:`, adoptError.message)
      return errorResponse(`Failed to adopt proposal record: ${adoptError.message}`, req, 500)
    }
    proposalId = existingProposalId
    console.log(`${LOG_PREFIX} Adopted existing proposal=${proposalId} status=assembling`)
  } else {
    const { data: newProposal, error: createError } = await supabase
      .from('proposals')
      .insert({
        org_id, user_id, deal_id: deal_id ?? null, meeting_id: meeting_id ?? null,
        contact_id: contact_id ?? null, template_id: template_id ?? null,
        title: proposalTitle, type: 'proposal', content: '', trigger_type,
        generation_status: 'assembling', status: 'draft', pipeline_version: 2,
        style_config: { _pipeline_meta: { pipeline_version: 2, pipeline_started_at: new Date().toISOString() } },
      })
      .select('id')
      .single()

    if (createError || !newProposal?.id) {
      console.error(`${LOG_PREFIX} Failed to create proposal row:`, createError?.message, createError?.details, createError?.hint, createError?.code)
      return errorResponse(`Failed to create proposal record: ${createError?.message ?? 'unknown'}`, req, 500)
    }
    proposalId = newProposal.id
    console.log(`${LOG_PREFIX} Created proposal=${proposalId} status=assembling`)
  }

  // STAGE 0 — Deal auto-create / advance (PDR-002)
  let resolvedDealId: string | null = deal_id ?? null

  try {
    const { data: oppStage } = await supabase.from('deal_stages').select('id, order_position').eq('name', 'Opportunity').maybeSingle()

    if (oppStage?.id) {
      if (!resolvedDealId && meeting_id) {
        let contactName: string | null = null
        let contactEmail: string | null = null
        let contactCompany: string | null = null
        const resolvedContactId = contact_id ?? null

        if (resolvedContactId) {
          const { data: contactRow } = await supabase.from('contacts').select('full_name, first_name, last_name, company, email').eq('id', resolvedContactId).maybeSingle()
          if (contactRow) {
            contactName = contactRow.full_name || [contactRow.first_name, contactRow.last_name].filter(Boolean).join(' ') || null
            contactEmail = contactRow.email
            contactCompany = contactRow.company
          }
        }

        let companyFromDomain: string | null = null
        const emailDomain = contactEmail?.split('@')[1]?.toLowerCase()
        if (emailDomain) {
          const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com']
          if (!freeProviders.includes(emailDomain)) {
            companyFromDomain = emailDomain.split('.')[0].split(/[-_]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          }
        }

        const companyName = contactCompany || companyFromDomain || 'Unknown Company'
        const dealName = companyName !== 'Unknown Company' ? `${companyName} — Proposal` : proposalTitle

        const { data: newDeal, error: dealCreateErr } = await supabase
          .from('deals')
          .insert({
            name: dealName, company: companyName, value: 0, stage_id: oppStage.id,
            owner_id: user_id, primary_contact_id: resolvedContactId,
            contact_name: contactName, contact_email: contactEmail, status: 'active',
            clerk_org_id: org_id, stage_changed_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (newDeal?.id) {
          resolvedDealId = newDeal.id
          await supabase.from('proposals').update({ deal_id: resolvedDealId, updated_at: new Date().toISOString() }).eq('id', proposalId)
          console.log(`${LOG_PREFIX} PDR-002: Auto-created deal=${resolvedDealId} company="${companyName}" stage=Opportunity`)
        } else if (dealCreateErr) {
          console.warn(`${LOG_PREFIX} PDR-002: Deal creation failed (non-fatal):`, dealCreateErr.message)
        }
      } else if (resolvedDealId) {
        const { data: currentDeal } = await supabase.from('deals').select('id, stage_id').eq('id', resolvedDealId).maybeSingle()
        if (currentDeal?.stage_id && currentDeal.stage_id !== oppStage.id) {
          const { data: currentStage } = await supabase.from('deal_stages').select('id, order_position, is_final').eq('id', currentDeal.stage_id).maybeSingle()
          if (currentStage && !currentStage.is_final && currentStage.order_position < oppStage.order_position) {
            const { error: advanceErr } = await supabase.from('deals').update({ stage_id: oppStage.id, stage_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', resolvedDealId)
            if (!advanceErr) console.log(`${LOG_PREFIX} PDR-002: Advanced deal=${resolvedDealId} to Opportunity`)
            else console.warn(`${LOG_PREFIX} PDR-002: Stage advance failed (non-fatal):`, advanceErr.message)
          } else {
            console.log(`${LOG_PREFIX} PDR-002: Deal=${resolvedDealId} already at or past Opportunity — no change`)
          }
        }
      }
    } else {
      console.warn(`${LOG_PREFIX} PDR-002: Opportunity stage not found in deal_stages — skipping deal resolution`)
    }
  } catch (dealErr) {
    const msg = dealErr instanceof Error ? dealErr.message : String(dealErr)
    console.warn(`${LOG_PREFIX} PDR-002: Deal resolution failed (non-fatal): ${msg}`)
  }

  // AUT-006: 120-second hard timeout guard
  const pipelineAbort = new AbortController()
  const pipelineTimeoutId = setTimeout(() => {
    pipelineAbort.abort()
    console.error(`${LOG_PREFIX} Pipeline timeout (120s) exceeded for proposal=${proposalId}`)
  }, 120_000)

  const partialResult = (status: string, failedStage: string, errMessage: string): PipelineResult => ({
    success: false, proposal_id: proposalId, pdf_url: null, generation_status: status,
    stage_timings: stageTiming, total_ms: Date.now() - pipelineStart, total_credits: 0,
    error: errMessage, failed_stage: failedStage,
  })

  // AUT-006 — Context caching
  let cachedContextPayload: Record<string, unknown> | null = null

  if (resolvedDealId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recentProposal } = await supabase
      .from('proposals')
      .select('id, context_payload, created_at')
      .eq('deal_id', resolvedDealId)
      .neq('id', proposalId)
      .gte('created_at', oneHourAgo)
      .not('context_payload', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentProposal?.context_payload) {
      cachedContextPayload = recentProposal.context_payload as Record<string, unknown>
      console.log(`${LOG_PREFIX} AUT-006: Context cache HIT for deal=${resolvedDealId}`, `(source proposal=${recentProposal.id}, created=${recentProposal.created_at})`)
    } else {
      console.log(`${LOG_PREFIX} AUT-006: Context cache MISS for deal=${resolvedDealId} — will assemble`)
    }
  }

  // STAGE 1 — Assemble context
  const s1 = new StageTimer('stage_1_context')
  s1.start()
  const stage1Start = Date.now()

  if (cachedContextPayload) {
    try {
      const { error: cacheWriteError } = await supabase
        .from('proposals')
        .update({ context_payload: cachedContextPayload, generation_status: 'context_assembled', updated_at: new Date().toISOString() })
        .eq('id', proposalId)
      if (cacheWriteError) throw new Error(`Cache write failed: ${cacheWriteError.message}`)
      monitor.recordStage(s1.finish('ok'))
      console.log(`${LOG_PREFIX} Stage 1 (cached) complete — context written from cache`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`${LOG_PREFIX} AUT-006: Cache write failed, falling back to assembly: ${message}`)
      cachedContextPayload = null
    }
  }

  if (!cachedContextPayload) {
    try {
      await retryWithBackoff(
        () => invokeStage(supabase, 'proposal-assemble-context', {
          proposal_id: proposalId, meeting_id: meeting_id ?? undefined,
          deal_id: resolvedDealId ?? undefined, contact_id: contact_id ?? undefined,
          user_id, org_id,
        }),
        2, [1000, 3000, 9000],
      )
      monitor.recordStage(s1.finish('ok'))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`${LOG_PREFIX} Stage 1 (assemble-context) failed:`, message)
      monitor.recordStage(s1.finish('failed', message))
      clearTimeout(pipelineTimeoutId)
      await Promise.all([flushMetrics(supabase, proposalId, monitor.finalise()), markFailed(supabase, proposalId, 'stage_1_context', message)])
      return jsonResponse(partialResult('failed', 'assemble', message), req, 500)
    }
  }

  stageTiming.assemble_ms = Date.now() - stage1Start
  console.log(`${LOG_PREFIX} Stage 1 complete in ${stageTiming.assemble_ms}ms`)
  await updateProposalStatus(supabase, proposalId, 'context_assembled', { stage_timings: { ...stageTiming } })

  // STAGE 2 — Compose with AI
  await updateProposalStatus(supabase, proposalId, 'composing')

  const s2 = new StageTimer('stage_2_compose')
  s2.start()
  const stage2Start = Date.now()
  let composeResult: Record<string, unknown> = {}

  try {
    composeResult = await retryWithBackoff(
      () => invokeStage(supabase, 'proposal-compose-v2', {
        proposal_id: proposalId, user_id, org_id, template_schema: null,
      }),
      2, [1000, 3000, 9000],
    )
    const creditsUsed = Number(composeResult?.credits_used ?? 0)
    monitor.addCredits(creditsUsed)
    monitor.recordStage(s2.finish('ok'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Stage 2 (compose-v2) failed:`, message)
    monitor.recordStage(s2.finish('failed', message))
    clearTimeout(pipelineTimeoutId)
    await Promise.all([flushMetrics(supabase, proposalId, monitor.finalise()), markFailed(supabase, proposalId, 'stage_2_compose', message)])
    return jsonResponse(partialResult('failed', 'compose', message), req, 500)
  }

  stageTiming.compose_ms = Date.now() - stage2Start
  console.log(`${LOG_PREFIX} Stage 2 complete in ${stageTiming.compose_ms}ms`, `| sections=${composeResult.sections_count ?? 'unknown'}`, `| input_tokens=${composeResult.input_tokens ?? 0}`, `| output_tokens=${composeResult.output_tokens ?? 0}`)

  logAICostEvent(
    supabase, user_id, org_id, 'openrouter',
    String(composeResult.model ?? 'anthropic/claude-3-5-sonnet-20241022'),
    Number(composeResult.input_tokens ?? 0), Number(composeResult.output_tokens ?? 0),
    'proposal_generation',
    { proposal_id: proposalId, pipeline_stage: 'compose-v2', sections_count: composeResult.sections_count },
    { source: 'user_initiated', contextSummary: `Pipeline compose: proposal ${proposalId}` },
    'proposal-pipeline-v2',
  ).catch((err) => { console.warn(`${LOG_PREFIX} Stage 2 cost log failed (non-fatal):`, err) })

  await updateProposalStatus(supabase, proposalId, 'composed', { stage_timings: { ...stageTiming } })

  // Early HTML preview
  try {
    const { data: composedRow } = await supabase.from('proposals').select('sections, title').eq('id', proposalId).maybeSingle()
    const composedSections = composedRow?.sections as ProposalSection[] | null
    if (composedSections && composedSections.length > 0) {
      const earlyHtml = generateProposalHTML({
        sections: composedSections,
        brandConfig: { primary_color: '#1e3a5f', secondary_color: '#4a90d9', font_family: 'Inter, Helvetica, Arial, sans-serif', logo_url: null, header_style: 'default' },
        metadata: {
          proposal_title: composedRow?.title || proposalTitle || 'Proposal',
          client_name: 'Client', client_company: 'Company', prepared_by: 'Sales Team',
          prepared_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
          reference_number: `PROP-${proposalId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        },
      })
      await supabase.from('proposals').update({ rendered_html: earlyHtml, updated_at: new Date().toISOString() }).eq('id', proposalId)
      console.log(`${LOG_PREFIX} Early HTML preview stored (${earlyHtml.length} chars)`)
    }
  } catch (earlyHtmlErr) {
    const msg = earlyHtmlErr instanceof Error ? earlyHtmlErr.message : String(earlyHtmlErr)
    console.warn(`${LOG_PREFIX} Early HTML preview failed (non-fatal): ${msg}`)
  }

  // AUT-006 — Gotenberg warm-up ping
  const gotenbergUrl = Deno.env.get('GOTENBERG_URL')
  if (gotenbergUrl) {
    try {
      const warmupStart = Date.now()
      const warmupResponse = await fetch(`${gotenbergUrl}/health`, { signal: AbortSignal.timeout(5000) })
      console.log(`${LOG_PREFIX} AUT-006: Gotenberg warm-up ping`, `status=${warmupResponse.status} in ${Date.now() - warmupStart}ms`)
    } catch (warmupErr) {
      const msg = warmupErr instanceof Error ? warmupErr.message : String(warmupErr)
      console.warn(`${LOG_PREFIX} AUT-006: Gotenberg warm-up ping failed (non-fatal): ${msg}`)
    }
  } else {
    console.warn(`${LOG_PREFIX} AUT-006: GOTENBERG_URL not set — skipping warm-up ping`)
  }

  // STAGE 3+4 — Render to PDF
  await updateProposalStatus(supabase, proposalId, 'rendering')

  const s3 = new StageTimer('stage_3_render')
  s3.start()
  const stage3Start = Date.now()
  let renderResult: Record<string, unknown> = {}

  try {
    renderResult = await retryWithBackoff(
      () => invokeStage(supabase, 'proposal-render-gotenberg', {
        proposal_id: proposalId, template_id: template_id ?? null,
      }),
      2, [1000, 3000, 9000],
    )
    monitor.recordStage(s3.finish('ok'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Stage 3+4 (render-gotenberg) failed:`, message)
    monitor.recordStage(s3.finish('failed', message))
    clearTimeout(pipelineTimeoutId)
    await Promise.all([flushMetrics(supabase, proposalId, monitor.finalise()), markFailed(supabase, proposalId, 'stage_3_render', message)])
    return jsonResponse(partialResult('failed', 'render', message), req, 500)
  }

  stageTiming.render_ms = Date.now() - stage3Start
  const pdfUrl = typeof renderResult.pdf_url === 'string' ? renderResult.pdf_url : null
  console.log(`${LOG_PREFIX} Stage 3+4 complete in ${stageTiming.render_ms}ms`, `| pdf_url=${pdfUrl ? 'set' : 'missing'}`, `| pdf_size_bytes=${renderResult.pdf_size_bytes ?? 'unknown'}`)
  await updateProposalStatus(supabase, proposalId, 'rendered', { stage_timings: { ...stageTiming } })

  // STAGE 5 — Deliver
  await updateProposalStatus(supabase, proposalId, 'delivering')

  const s5 = new StageTimer('stage_5_deliver')
  s5.start()
  const stage5Start = Date.now()
  let deliverResult: Record<string, unknown> = {}

  try {
    deliverResult = await retryWithBackoff(
      () => invokeStage(supabase, 'proposal-deliver', {
        proposal_id: proposalId, pdf_url: pdfUrl ?? undefined,
        slack_thread: slack_thread ?? undefined,
      }),
      1, [1000, 3000, 9000],
    )
    monitor.recordStage(s5.finish('ok'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Stage 5 (deliver) failed:`, message)
    monitor.recordStage(s5.finish('failed', message))
    console.warn(`${LOG_PREFIX} Delivery failed but PDF is ready — marking as 'ready' anyway`)
    clearTimeout(pipelineTimeoutId)
    stageTiming.deliver_ms = Date.now() - stage5Start
    const finalMetrics = monitor.finalise()
    await Promise.all([
      flushMetrics(supabase, proposalId, finalMetrics),
      updateProposalStatus(supabase, proposalId, 'ready', { stage_timings: { ...stageTiming }, pipeline_deliver_warning: message, pipeline_completed_at: new Date().toISOString() }),
    ])
    const total = Date.now() - pipelineStart
    console.log(`${LOG_PREFIX} Pipeline complete (with deliver warning) proposal=${proposalId}`, `| total_ms=${total}`)
    const timingHeaderWarn = [`total=${total}`, `assemble=${stageTiming.assemble_ms ?? 0}`, `compose=${stageTiming.compose_ms ?? 0}`, `render=${stageTiming.render_ms ?? 0}`, `deliver=${stageTiming.deliver_ms ?? 0}`].join(', ')
    const corsHeadersWarn = getCorsHeaders(req)
    return new Response(
      JSON.stringify({
        success: true, proposal_id: proposalId, pdf_url: pdfUrl, generation_status: 'ready',
        stage_timings: stageTiming, total_ms: total, total_credits: finalMetrics.total_credits_used,
        warnings: [`Delivery notification failed: ${message}`],
      }),
      { status: 200, headers: { ...corsHeadersWarn, 'Content-Type': 'application/json', 'X-Pipeline-Timing': timingHeaderWarn } },
    )
  }

  stageTiming.deliver_ms = Date.now() - stage5Start
  console.log(`${LOG_PREFIX} Stage 5 complete in ${stageTiming.deliver_ms}ms`, `| slack_sent=${deliverResult.slack_sent ?? false}`, `| activity_created=${deliverResult.activity_created ?? false}`)

  // STAGE 5b — Deal room creation (PDR-003)
  let briefingSlackTs: string | null = null

  if (resolvedDealId) {
    try {
      const { data: existingRoom } = await supabase.from('slack_deal_rooms').select('id, slack_channel_id').eq('deal_id', resolvedDealId).eq('is_archived', false).maybeSingle()
      if (existingRoom?.slack_channel_id) {
        console.log(`${LOG_PREFIX} PDR-003: Deal room exists channel=${existingRoom.slack_channel_id} — skipping creation`)
      } else {
        const { data: slackSettings } = await supabase.from('slack_notification_settings').select('id, enabled').eq('org_id', org_id).eq('feature', 'deal_rooms').maybeSingle()
        if (slackSettings?.enabled) {
          const roomResult = await invokeStage(supabase, 'slack-deal-room', { dealId: resolvedDealId, orgId: org_id, isTest: true })
          console.log(`${LOG_PREFIX} PDR-003: Deal room created channel=${roomResult.channelId ?? 'unknown'}`)
        } else {
          console.log(`${LOG_PREFIX} PDR-003: Slack deal rooms not enabled for org=${org_id} — skipping`)
        }
      }
    } catch (roomErr) {
      const msg = roomErr instanceof Error ? roomErr.message : String(roomErr)
      console.warn(`${LOG_PREFIX} PDR-003: Deal room creation failed (non-fatal): ${msg}`)
    }

    // STAGE 5c — Post briefing pack to deal room (PDR-005)
    try {
      const { data: alreadySent } = await supabase.from('slack_notifications_sent').select('id').eq('entity_type', 'proposal_briefing').eq('entity_id', proposalId).maybeSingle()
      if (alreadySent) {
        console.log(`${LOG_PREFIX} PDR-005: Briefing already posted for proposal=${proposalId} — skipping`)
      } else {
        const [proposalCtx, dealCtx, contactCtx, meetingCtx] = await Promise.all([
          supabase.from('proposals').select('title, context_payload').eq('id', proposalId).maybeSingle(),
          resolvedDealId ? supabase.from('deals').select('name, company, value').eq('id', resolvedDealId).maybeSingle() : Promise.resolve({ data: null }),
          contact_id ? supabase.from('contacts').select('full_name, first_name, last_name, email, company').eq('id', contact_id).maybeSingle() : Promise.resolve({ data: null }),
          meeting_id ? supabase.from('meetings').select('title, ai_summary').eq('id', meeting_id).maybeSingle() : Promise.resolve({ data: null }),
        ])

        const ctxPayload = proposalCtx.data?.context_payload as Record<string, unknown> | null
        const meetingSummary = meetingCtx.data?.ai_summary as Record<string, unknown> | null
        const contactRow = contactCtx.data as { full_name?: string; first_name?: string; last_name?: string; email?: string; company?: string } | null
        const dealRow = dealCtx.data as { name?: string; company?: string; value?: number } | null

        const meetingHighlights: string[] = []
        if (meetingSummary) {
          const keyPoints = (meetingSummary.key_points ?? meetingSummary.keyPoints ?? meetingSummary.highlights) as string[] | undefined
          if (Array.isArray(keyPoints)) meetingHighlights.push(...keyPoints.slice(0, 3))
          else if (typeof meetingSummary.summary === 'string') meetingHighlights.push(meetingSummary.summary as string)
        }

        const ctxMeeting = ctxPayload?.meeting as Record<string, unknown> | null
        const nextSteps = (ctxMeeting?.next_steps as string) || null
        const actionItems: string[] = []
        const rawActions = (ctxMeeting?.action_items ?? ctxMeeting?.actionItems) as Array<Record<string, unknown>> | string[] | undefined
        if (Array.isArray(rawActions)) {
          for (const item of rawActions.slice(0, 5)) {
            if (typeof item === 'string') actionItems.push(item)
            else if (item?.task) actionItems.push(String(item.task))
            else if (item?.description) actionItems.push(String(item.description))
          }
        }

        const contactName = contactRow?.full_name || [contactRow?.first_name, contactRow?.last_name].filter(Boolean).join(' ') || null
        const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com'

        const briefingResult = await invokeStage(supabase, 'slack-deal-room-update', {
          dealId: resolvedDealId, orgId: org_id, updateType: 'proposal_briefing',
          data: {
            proposalTitle: proposalCtx.data?.title || proposalTitle, proposalId,
            pdfUrl: pdfUrl ?? null, dealValue: dealRow?.value ?? 0,
            contactName, contactEmail: contactRow?.email ?? null,
            companyName: dealRow?.company ?? contactRow?.company ?? null,
            meetingHighlights, nextSteps, actionItems, triggerType: trigger_type,
            appUrl, dealId: resolvedDealId,
          },
        })

        briefingSlackTs = typeof briefingResult.slackTs === 'string' ? briefingResult.slackTs : null
        console.log(`${LOG_PREFIX} PDR-005: Briefing pack posted to deal room`, `| slackTs=${briefingSlackTs ?? 'unknown'}`)
      }
    } catch (briefingErr) {
      const msg = briefingErr instanceof Error ? briefingErr.message : String(briefingErr)
      console.warn(`${LOG_PREFIX} PDR-005: Briefing post failed (non-fatal): ${msg}`)
    }
  }

  // Final status update: ready
  const total = Date.now() - pipelineStart
  const finalMetrics = monitor.finalise()

  await Promise.all([
    flushMetrics(supabase, proposalId, finalMetrics),
    updateProposalStatus(supabase, proposalId, 'ready', { stage_timings: { ...stageTiming }, pipeline_completed_at: new Date().toISOString(), pipeline_total_ms: total }),
  ])

  // STAGE 6 — Async enrichment (PDR-006, fire-and-forget)
  if (resolvedDealId) {
    invokeStage(supabase, 'proposal-enrich-deal', {
      proposal_id: proposalId, deal_id: resolvedDealId,
      contact_id: contact_id ?? null, org_id, user_id,
      briefing_slack_ts: briefingSlackTs,
    }).then(() => {
      console.log(`${LOG_PREFIX} PDR-006: Enrichment invoked for deal=${resolvedDealId}`)
    }).catch((enrichErr) => {
      const msg = enrichErr instanceof Error ? enrichErr.message : String(enrichErr)
      console.warn(`${LOG_PREFIX} PDR-006: Enrichment trigger failed (non-fatal): ${msg}`)
    })
  }

  // Log pipeline-level cost event (fire-and-forget)
  logAICostEvent(
    supabase, user_id, org_id, 'openrouter', 'pipeline', 0, 0, 'proposal_generation',
    { proposal_id: proposalId, pipeline_stage: 'pipeline-orchestrator', trigger_type, stage_timings: stageTiming, total_ms: total, total_credits: finalMetrics.total_credits_used },
    { source: trigger_type === 'manual_button' || trigger_type === 'copilot' ? 'user_initiated' : 'agent_automated', contextSummary: `Full pipeline: proposal ${proposalId}` },
    'proposal-pipeline-v2',
  ).catch((err) => { console.warn(`${LOG_PREFIX} Pipeline cost log failed (non-fatal):`, err) })

  console.log(`${LOG_PREFIX} Pipeline complete proposal=${proposalId}`, `| total_ms=${total}`, `| total_credits=${finalMetrics.total_credits_used}`, `| assemble=${stageTiming.assemble_ms}ms`, `| compose=${stageTiming.compose_ms}ms`, `| render=${stageTiming.render_ms}ms`, `| deliver=${stageTiming.deliver_ms}ms`)

  clearTimeout(pipelineTimeoutId)

  const finalResult: PipelineResult = {
    success: true, proposal_id: proposalId, pdf_url: pdfUrl, generation_status: 'ready',
    stage_timings: stageTiming, total_ms: total, total_credits: finalMetrics.total_credits_used,
  }

  const timingHeader = [`total=${total}`, `assemble=${stageTiming.assemble_ms ?? 0}`, `compose=${stageTiming.compose_ms ?? 0}`, `render=${stageTiming.render_ms ?? 0}`, `deliver=${stageTiming.deliver_ms ?? 0}`].join(', ')

  const corsHeaders = getCorsHeaders(req)
  return new Response(JSON.stringify(finalResult), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Pipeline-Timing': timingHeader },
  })
}
