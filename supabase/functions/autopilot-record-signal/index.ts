/**
 * autopilot-record-signal — AP-010
 *
 * HTTP endpoint for the frontend to record HITL approval signals.
 * Inserts a row into `autopilot_signals` and asynchronously triggers a
 * confidence recalculation for the (user, action_type) pair.
 *
 * SECURITY:
 * - POST only
 * - JWT validated internally (staging uses ES256; gateway JWT verification
 *   is disabled — deploy with --no-verify-jwt)
 * - Service role client used for writes (bypasses RLS on autopilot_signals)
 * - User-scoped client used for org membership lookup (respects RLS)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'
import {
  type ApprovalSignal,
  isRubberStamp,
} from '../_shared/autopilot/signals.ts'
import { recalculateUserConfidence } from '../_shared/autopilot/confidence.ts'

// =============================================================================
// Environment
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// =============================================================================
// Constants
// =============================================================================

const VALID_SIGNALS: readonly ApprovalSignal[] = [
  'approved',
  'approved_edited',
  'rejected',
  'expired',
  'undone',
  'auto_executed',
  'auto_undone',
]

// =============================================================================
// Types
// =============================================================================

interface RecordSignalBody {
  action_type: string
  agent_name: string
  signal: ApprovalSignal
  edit_distance?: number
  edit_fields?: string[]
  time_to_respond_ms?: number
  confidence_at_proposal?: number
  deal_id?: string
  contact_id?: string
  meeting_id?: string
  autonomy_tier_at_time: string
  is_backfill?: boolean
}

// =============================================================================
// Handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Validate JWT → get userId
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('Missing or invalid Authorization header', req, 401)
    }

    const token = authHeader.replace('Bearer ', '')

    // Use the service role client to verify the JWT (works with ES256 on staging)
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token)
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    const userId = user.id

    // -------------------------------------------------------------------------
    // 2. Parse and validate request body
    // -------------------------------------------------------------------------
    let body: Partial<RecordSignalBody>
    try {
      body = await req.json()
    } catch {
      return errorResponse('Invalid JSON body', req, 400)
    }

    const { action_type, agent_name, signal, autonomy_tier_at_time } = body

    // Validate required fields
    if (!action_type || typeof action_type !== 'string') {
      return errorResponse('Missing required field: action_type', req, 400)
    }
    if (!agent_name || typeof agent_name !== 'string') {
      return errorResponse('Missing required field: agent_name', req, 400)
    }
    if (!signal) {
      return errorResponse('Missing required field: signal', req, 400)
    }
    if (!autonomy_tier_at_time || typeof autonomy_tier_at_time !== 'string') {
      return errorResponse('Missing required field: autonomy_tier_at_time', req, 400)
    }

    // Validate signal is one of the 7 valid values
    if (!(VALID_SIGNALS as readonly string[]).includes(signal)) {
      return errorResponse(
        `Invalid signal value. Must be one of: ${VALID_SIGNALS.join(', ')}`,
        req,
        400,
      )
    }

    // -------------------------------------------------------------------------
    // 3. Get org_id from organization_memberships
    // -------------------------------------------------------------------------
    // Use a user-scoped client to respect RLS on organization_memberships
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: membership, error: membershipError } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (membershipError) {
      console.error('[autopilot-record-signal] org membership lookup error:', membershipError)
      return errorResponse('Failed to resolve organization membership', req, 500)
    }

    if (!membership) {
      return errorResponse('No active organization membership found for this user', req, 400)
    }

    const orgId = membership.org_id

    // -------------------------------------------------------------------------
    // 4. Determine rubber_stamp flag
    // -------------------------------------------------------------------------
    const rubber_stamp = isRubberStamp({
      user_id: userId,
      org_id: orgId,
      action_type,
      agent_name,
      signal,
      time_to_respond_ms: body.time_to_respond_ms,
      autonomy_tier_at_time,
    })

    // -------------------------------------------------------------------------
    // 5. Insert into autopilot_signals (service role bypasses RLS)
    // -------------------------------------------------------------------------
    const { data: inserted, error: insertError } = await serviceClient
      .from('autopilot_signals')
      .insert({
        user_id: userId,
        org_id: orgId,
        action_type,
        agent_name,
        signal,
        edit_distance: body.edit_distance ?? null,
        edit_fields: body.edit_fields ?? null,
        time_to_respond_ms: body.time_to_respond_ms ?? null,
        confidence_at_proposal: body.confidence_at_proposal ?? null,
        deal_id: body.deal_id ?? null,
        contact_id: body.contact_id ?? null,
        meeting_id: body.meeting_id ?? null,
        autonomy_tier_at_time,
        is_backfill: body.is_backfill ?? false,
        rubber_stamp,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error('[autopilot-record-signal] insert error:', insertError)
      return errorResponse('Failed to record signal', req, 500)
    }

    const signalId: string = inserted.id

    // -------------------------------------------------------------------------
    // 6. Fire-and-forget confidence recalculation
    //    (do NOT await — keeps the response fast)
    // -------------------------------------------------------------------------
    recalculateUserConfidence(serviceClient, userId, orgId, action_type).catch((err) => {
      console.error('[autopilot-record-signal] recalculateUserConfidence error:', err)
    })

    // -------------------------------------------------------------------------
    // 7. Return success
    // -------------------------------------------------------------------------
    return jsonResponse(
      {
        success: true,
        signal_id: signalId,
      },
      req,
      200,
    )
  } catch (err) {
    console.error('[autopilot-record-signal] Unexpected error:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    )
  }
})
