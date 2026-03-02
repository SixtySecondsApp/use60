// supabase/functions/proposal-assemble-context/index.ts
// PIP-001: Stage 1 of the V2 proposal pipeline — Assemble Context
//
// Thin HTTP wrapper around assembleProposalContext() from _shared/proposalContext.ts.
//
// Responsibilities:
//   1. Validate request body (proposal_id + at least one of meeting_id / deal_id)
//   2. Look up org_id from organization_memberships for the requesting user
//   3. Call assembleProposalContext() — queries all 8 data sources
//   4. Store the result in proposals.context_payload + set generation_status = 'context_assembled'
//   5. Return a lightweight context_summary (no raw payload in response)
//
//   Credit cost: 0 (database reads only)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'
import {
  assembleProposalContext,
  ProposalContextPayload,
} from '../_shared/proposalContext.ts'

// =============================================================================
// Types
// =============================================================================

interface AssembleContextRequest {
  proposal_id: string
  /** Optional — required when proposal was triggered from a meeting */
  meeting_id?: string
  /** Optional — required when proposal is linked to a deal */
  deal_id?: string
  /** Optional — overrides contact resolution from deal */
  contact_id?: string
  /** Required — UUID of the proposal creator */
  user_id: string
}

interface ContextSummary {
  deal_found: boolean
  contact_found: boolean
  meeting_found: boolean
  transcript_available: boolean
  /** 'full' when full transcript is included, 'summary' when ai_summary was used instead */
  transcript_mode: 'full' | 'summary' | null
  offering_profile_found: boolean
  /** Source of the style fingerprint: compound | email_analysis | default */
  style_source: string
  total_token_estimate: number
}

const LOG_PREFIX = '[proposal-assemble-context]'

// =============================================================================
// Helpers
// =============================================================================

/** Rough token estimator: 4 chars ≈ 1 token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Build a lightweight ContextSummary from the assembled ProposalContextPayload.
 * This is what gets returned to the caller — the full payload is stored in the DB.
 */
function buildContextSummary(payload: ProposalContextPayload): ContextSummary {
  const transcriptAvailable =
    payload.meeting !== null &&
    (payload.meeting.transcript !== null || payload.meeting.ai_summary !== null)

  let transcriptMode: 'full' | 'summary' | null = null
  if (payload.meeting) {
    if (payload.meeting.transcript !== null) {
      transcriptMode = 'full'
    } else if (payload.meeting.ai_summary !== null) {
      transcriptMode = 'summary'
    }
  }

  // Rough total token estimate across the full payload JSON
  const payloadJson = JSON.stringify(payload)
  const totalTokenEstimate = estimateTokens(payloadJson)

  return {
    deal_found: payload.deal !== null,
    contact_found: payload.contact !== null,
    meeting_found: payload.meeting !== null,
    transcript_available: transcriptAvailable,
    transcript_mode: transcriptMode,
    offering_profile_found: payload.offering_profile !== null,
    style_source: payload.style_fingerprint.source,
    total_token_estimate: totalTokenEstimate,
  }
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req: Request) => {
  // ------------------------------------------------------------------
  // CORS preflight
  // ------------------------------------------------------------------
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  // ------------------------------------------------------------------
  // Only accept POST
  // ------------------------------------------------------------------
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    // ----------------------------------------------------------------
    // Auth — service role (internal pipeline call only)
    // ----------------------------------------------------------------
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(`${LOG_PREFIX} Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`)
      return errorResponse('Server misconfiguration', req, 500)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // ----------------------------------------------------------------
    // Parse + validate request body
    // ----------------------------------------------------------------
    let body: AssembleContextRequest
    try {
      body = await req.json()
    } catch {
      return errorResponse('Invalid JSON body', req, 400)
    }

    const { proposal_id, meeting_id, deal_id, contact_id, user_id } = body

    if (!proposal_id) {
      return errorResponse('proposal_id is required', req, 400)
    }

    if (!user_id) {
      return errorResponse('user_id is required', req, 400)
    }

    if (!meeting_id && !deal_id) {
      return errorResponse(
        'At least one of meeting_id or deal_id must be provided',
        req,
        400,
      )
    }

    console.log(
      `${LOG_PREFIX} Assembling context for proposal=${proposal_id} user=${user_id} meeting=${meeting_id ?? 'none'} deal=${deal_id ?? 'none'}`,
    )

    // ----------------------------------------------------------------
    // Look up org_id from organization_memberships
    // ----------------------------------------------------------------
    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user_id)
      .eq('member_status', 'active')
      .limit(1)
      .maybeSingle()

    if (membershipError) {
      console.error(`${LOG_PREFIX} Error fetching org membership:`, membershipError.message)
      return errorResponse('Failed to resolve org membership', req, 500)
    }

    if (!membership?.org_id) {
      console.warn(`${LOG_PREFIX} No org membership found for user_id=${user_id}`)
      return errorResponse('User does not belong to any organisation', req, 400)
    }

    const orgId = membership.org_id
    console.log(`${LOG_PREFIX} Resolved org_id=${orgId}`)

    // ----------------------------------------------------------------
    // Assemble context — all 8 data sources queried inside this call
    // ----------------------------------------------------------------
    const contextPayload = await assembleProposalContext(supabase, {
      userId: user_id,
      orgId,
      meetingId: meeting_id,
      dealId: deal_id,
      contactId: contact_id,
    })

    console.log(
      `${LOG_PREFIX} Context assembled: deal=${contextPayload.deal !== null} contact=${contextPayload.contact !== null} meeting=${contextPayload.meeting !== null}`,
    )

    // ----------------------------------------------------------------
    // Store context_payload in proposals table
    // ----------------------------------------------------------------
    const { error: updateError } = await supabase
      .from('proposals')
      .update({
        context_payload: contextPayload as unknown as Record<string, unknown>,
        generation_status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal_id)

    if (updateError) {
      console.error(`${LOG_PREFIX} Failed to store context_payload:`, updateError.message)
      return errorResponse('Failed to store assembled context', req, 500)
    }

    console.log(`${LOG_PREFIX} Stored context_payload for proposal=${proposal_id}`)

    // ----------------------------------------------------------------
    // Build and return summary response
    // ----------------------------------------------------------------
    const contextSummary = buildContextSummary(contextPayload)

    return jsonResponse(
      {
        success: true,
        proposal_id,
        context_summary: contextSummary,
      },
      req,
      200,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Unexpected error:`, message)
    return errorResponse(`Unexpected error: ${message}`, req, 500)
  }
})
