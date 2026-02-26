/**
 * autopilot-record-signal — AP-010 / AP-032
 *
 * POST /autopilot-record-signal
 *   Records a HITL approval signal and fires background confidence
 *   recalculation, rep_memory sync, and (for undo signals) demotion evaluation.
 *   After a clean `approved` signal, checks milestone promotion eligibility and
 *   sets `pending_promotion_nudge` on `autopilot_confidence` if the user has
 *   just hit a key milestone (AP-032).
 *
 * GET /autopilot-record-signal
 *   Returns the first pending promotion nudge for the authenticated user,
 *   then clears it (one-shot). Returns `{ nudge: null }` when nothing is
 *   pending.
 *
 * SECURITY:
 * - JWT validated internally (staging uses ES256; gateway JWT verification
 *   is disabled — deploy with --no-verify-jwt)
 * - Service role client used for DB writes (bypasses RLS on autopilot tables)
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
import { recalculateUserConfidence, updateRepMemory } from '../_shared/autopilot/confidence.ts'
import {
  evaluateDemotionTriggers,
  executeDemotion,
} from '../_shared/autopilot/demotionEngine.ts'

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

/**
 * Clean approval counts that trigger a promotion nudge.
 * E.g. 5, 10, 20 clean approvals for a given action_type surface a nudge.
 */
const NUDGE_MILESTONES: readonly number[] = [5, 10, 20]

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

interface PendingNudge {
  action_type: string
  message: string
  from_tier: string
  to_tier: string
}

// =============================================================================
// AP-032: Promotion nudge helpers
// =============================================================================

/**
 * Formats an action_type slug into a human-readable label.
 * e.g. "crm.note_add" → "CRM note add"
 *      "email.send"    → "email send"
 */
function formatActionType(actionType: string): string {
  return actionType
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .toLowerCase()
}

/**
 * Returns the next tier up from the current one, or null if already at 'auto'.
 */
function nextTier(tier: string): string | null {
  switch (tier) {
    case 'suggest': return 'approve'
    case 'approve': return 'auto'
    default:        return null
  }
}

/**
 * Counts the number of clean (non-rubber-stamp) `approved` signals recorded
 * for this user/action_type in the last 90 days.
 */
async function countCleanApprovals(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  actionType: string,
): Promise<number> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { count, error } = await serviceClient
    .from('autopilot_signals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .eq('signal', 'approved')
    .eq('rubber_stamp', false)
    .gte('created_at', ninetyDaysAgo)

  if (error) {
    console.error('[autopilot-record-signal] countCleanApprovals error:', error)
    return 0
  }

  return count ?? 0
}

/**
 * AP-032: After recording a clean `approved` signal, check if the user has
 * just crossed a milestone clean-approval count. If so, and they are
 * promotion-eligible (set by the DB confidence trigger), write a nudge.
 *
 * Fire-and-forget — the caller must not await this.
 */
async function maybeSetPromotionNudge(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  actionType: string,
): Promise<void> {
  try {
    // 1. Count clean approvals AFTER the new signal has been inserted
    const cleanCount = await countCleanApprovals(serviceClient, userId, actionType)

    // Only proceed if the current count is exactly one of our milestones
    if (!NUDGE_MILESTONES.includes(cleanCount)) return

    // 2. Query autopilot_confidence for eligibility
    const { data: row, error: rowError } = await serviceClient
      .from('autopilot_confidence')
      .select('promotion_eligible, cooldown_until, never_promote, current_tier')
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .maybeSingle()

    if (rowError || !row) return

    // Guard: skip if not eligible, on cooldown, or user has opted out
    if (!row.promotion_eligible) return
    if (row.never_promote) return
    if (row.cooldown_until && new Date(row.cooldown_until) > new Date()) return

    const toTier = nextTier(row.current_tier)
    if (!toTier) return  // already at 'auto', nothing to promote to

    // 3. Build nudge message
    const label = formatActionType(actionType)
    const nudgeMessage =
      `That's your ${cleanCount}th clean approval for "${label}". ` +
      `Want me to handle these automatically from now on?`

    // 4. Set pending nudge (only if not already set — avoid overwriting)
    await serviceClient
      .from('autopilot_confidence')
      .update({
        pending_promotion_nudge: true,
        nudge_message: nudgeMessage,
      })
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .eq('pending_promotion_nudge', false)  // only write if not already pending

  } catch (err) {
    console.error('[autopilot-record-signal] maybeSetPromotionNudge error:', err)
  }
}

// =============================================================================
// Auth helper (shared by POST and GET handlers)
// =============================================================================

/**
 * Validates the JWT in the Authorization header.
 * Returns `{ userId, serviceClient, authHeader }` on success, or throws a
 * descriptive string on failure.
 */
async function resolveAuth(req: Request): Promise<{
  userId: string
  serviceClient: ReturnType<typeof createClient>
  authHeader: string
}> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw 'Missing or invalid Authorization header'
  }

  const token = authHeader.replace('Bearer ', '')

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: { user }, error: authError } = await serviceClient.auth.getUser(token)
  if (authError || !user) {
    throw 'Unauthorized'
  }

  return { userId: user.id, serviceClient, authHeader }
}

// =============================================================================
// GET handler — AP-032: return + clear pending promotion nudge
// =============================================================================

async function handleGet(req: Request): Promise<Response> {
  let userId: string
  let serviceClient: ReturnType<typeof createClient>

  try {
    const auth = await resolveAuth(req)
    userId = auth.userId
    serviceClient = auth.serviceClient
  } catch (msg) {
    const status = msg === 'Unauthorized' ? 401 : 401
    return errorResponse(String(msg), req, status)
  }

  // Find the first pending nudge for this user
  const { data: row, error: fetchError } = await serviceClient
    .from('autopilot_confidence')
    .select('action_type, nudge_message, current_tier')
    .eq('user_id', userId)
    .eq('pending_promotion_nudge', true)
    .limit(1)
    .maybeSingle()

  if (fetchError) {
    console.error('[autopilot-record-signal] GET nudge fetch error:', fetchError)
    return errorResponse('Failed to fetch pending nudge', req, 500)
  }

  if (!row) {
    return jsonResponse({ nudge: null }, req, 200)
  }

  // Clear the nudge (one-shot)
  const { error: clearError } = await serviceClient
    .from('autopilot_confidence')
    .update({ pending_promotion_nudge: false, nudge_message: null })
    .eq('user_id', userId)
    .eq('action_type', row.action_type)

  if (clearError) {
    console.error('[autopilot-record-signal] GET nudge clear error:', clearError)
    // Don't fail the request — still return the nudge to the client
  }

  const toTier = nextTier(row.current_tier)

  const nudge: PendingNudge = {
    action_type: row.action_type,
    message: row.nudge_message,
    from_tier: row.current_tier,
    to_tier: toTier ?? row.current_tier,
  }

  return jsonResponse({ nudge }, req, 200)
}

// =============================================================================
// POST handler — record signal
// =============================================================================

async function handlePost(req: Request): Promise<Response> {
  // -------------------------------------------------------------------------
  // Performance benchmark — AP-033
  // Records cumulative elapsed time after each major step so slow requests
  // can be identified in edge function logs.
  // -------------------------------------------------------------------------
  const perf = { start: Date.now(), steps: {} as Record<string, number> }

  // -------------------------------------------------------------------------
  // 1. Validate JWT → get userId
  // -------------------------------------------------------------------------
  let userId: string
  let serviceClient: ReturnType<typeof createClient>
  let authHeader: string

  try {
    const auth = await resolveAuth(req)
    userId = auth.userId
    serviceClient = auth.serviceClient
    authHeader = auth.authHeader
  } catch (msg) {
    return errorResponse(String(msg), req, 401)
  }
  perf.steps['auth'] = Date.now() - perf.start

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
  perf.steps['parse'] = Date.now() - perf.start

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
  perf.steps['org_lookup'] = Date.now() - perf.start

  // -------------------------------------------------------------------------
  // 4. Determine rubber_stamp flag — AP-033 hardened thresholds
  //    Uses action-type-specific thresholds from RUBBER_STAMP_THRESHOLDS.
  //    Only `approved` / `approved_edited` signals can be rubber stamps.
  // -------------------------------------------------------------------------
  const isApprovalSignal = signal === 'approved' || signal === 'approved_edited'
  const rubber_stamp = isApprovalSignal
    ? isRubberStamp(body.time_to_respond_ms, action_type)
    : false

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
  perf.steps['signal_insert'] = Date.now() - perf.start

  // -------------------------------------------------------------------------
  // 6. AP-033: Increment rubber_stamp_count when a rubber-stamp is detected.
  //    Runs before the fire-and-forget background tasks so the counter is
  //    consistent with the just-inserted signal row.
  // -------------------------------------------------------------------------
  if (rubber_stamp) {
    serviceClient
      .rpc('increment_rubber_stamp_count', {
        p_user_id: userId,
        p_action_type: action_type,
      })
      .then(({ error }) => {
        if (error) {
          console.error('[autopilot-record-signal] increment_rubber_stamp_count error:', error)
        }
      })
      .catch((err) => {
        console.error('[autopilot-record-signal] increment_rubber_stamp_count unexpected error:', err)
      })
  }

  // -------------------------------------------------------------------------
  // 7. Fire-and-forget confidence recalculation
  //    (do NOT await — keeps the response fast)
  // -------------------------------------------------------------------------
  recalculateUserConfidence(serviceClient, userId, orgId, action_type).catch((err) => {
    console.error('[autopilot-record-signal] recalculateUserConfidence error:', err)
  })

  // -------------------------------------------------------------------------
  // 8. Fire-and-forget rep_memory update — AP-027
  //    Reads all autopilot_confidence rows for this user and writes
  //    approval_stats + autonomy_profile back to rep_memory so the
  //    conversational copilot always has an up-to-date autonomy state.
  //    (do NOT await — must not block the response)
  // -------------------------------------------------------------------------
  updateRepMemory(serviceClient, userId, orgId).catch((err) => {
    console.error('[autopilot-record-signal] updateRepMemory error:', err)
  })

  // -------------------------------------------------------------------------
  // 9. Fire-and-forget demotion evaluation (only for undo signals)
  // -------------------------------------------------------------------------
  if (signal === 'undone' || signal === 'auto_undone') {
    evaluateDemotionTriggers(serviceClient, userId, orgId, action_type)
      .then(async (result) => {
        if (result.triggered && result.severity) {
          await executeDemotion(serviceClient, userId, orgId, action_type, result.severity, result)
        }
      })
      .catch((err) => {
        console.error('[autopilot-record-signal] demotion evaluation error:', err)
      })
  }

  // -------------------------------------------------------------------------
  // 10. AP-032: Fire-and-forget promotion nudge milestone check
  //     Only for clean approved signals (not rubber stamps, not other signals)
  // -------------------------------------------------------------------------
  if (signal === 'approved' && !rubber_stamp) {
    maybeSetPromotionNudge(serviceClient, userId, action_type).catch((err) => {
      console.error('[autopilot-record-signal] maybeSetPromotionNudge error:', err)
    })
  }

  // -------------------------------------------------------------------------
  // 11. AP-033: Performance benchmark log
  //     Emit a single structured line so we can monitor latency in Supabase
  //     Edge Function logs without adding noise on every step.
  // -------------------------------------------------------------------------
  const total = Date.now() - perf.start
  const stepLog = Object.entries(perf.steps)
    .map(([k, ms]) => `${k}=${ms}ms`)
    .join(' ')
  console.log(`[autopilot-record-signal] perf total=${total}ms ${stepLog}`)
  if (total > 200) {
    console.warn(`[autopilot-record-signal] SLOW REQUEST: ${total}ms (threshold=200ms)`)
  }

  // -------------------------------------------------------------------------
  // 12. Return success
  // -------------------------------------------------------------------------
  return jsonResponse(
    {
      success: true,
      signal_id: signalId,
    },
    req,
    200,
  )
}

// =============================================================================
// Handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method === 'GET') {
    return handleGet(req)
  }

  if (req.method === 'POST') {
    return handlePost(req)
  }

  return errorResponse('Method not allowed', req, 405)
})
