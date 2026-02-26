/**
 * autopilot-evaluate — AP-014
 *
 * Daily cron edge function that finds all (user, action_type) pairs with
 * `promotion_eligible = true`, evaluates each through the full promotion
 * engine (threshold checks, streak guard, cooldowns), and sends a Slack
 * proposal for every user with at least one qualifying candidate.
 *
 * AUTH:
 * - Service role key in Authorization header, OR
 * - JWT from an org admin user (checked against organization_memberships).
 *   JWT callers must provide org_id; evaluation is then scoped to that org.
 *
 * REQUEST BODY (all optional):
 *   org_id?  — if provided, restrict evaluation to this org
 *   dry_run? — default false; find candidates but skip proposals + cooldown reset
 *
 * DEPLOY (staging):
 *   npx supabase functions deploy autopilot-evaluate \
 *     --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'
import {
  evaluatePromotionEligibility,
  recordPromotionEvent,
  type PromotionCandidate,
} from '../_shared/autonomy/promotionEngine.ts'

// =============================================================================
// Environment
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// =============================================================================
// Types
// =============================================================================

interface EvaluateRequest {
  org_id?: string
  dry_run?: boolean
}

interface EvaluateResponse {
  success: true
  evaluated_users: number
  candidates_found: number
  proposals_sent: number
  dry_run: boolean
  candidates?: PromotionCandidate[]
}

interface EligibleRow {
  user_id: string
  org_id: string
  action_type: string
}

// =============================================================================
// Auth helpers
// =============================================================================

/**
 * Resolves the caller's identity.
 *
 * - If the Bearer token equals the service role key, grants full access.
 * - Otherwise, validates the JWT and verifies the user is an admin/owner
 *   in the provided orgId (required when calling as a JWT user).
 *
 * Returns `{ isServiceRole: boolean; userId: string | null }`.
 * Throws a descriptive string on auth failure.
 */
async function resolveAuth(
  req: Request,
  orgId: string | undefined,
  serviceClient: SupabaseClient,
): Promise<{ isServiceRole: boolean; userId: string | null }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw 'Missing or invalid Authorization header'
  }

  const token = authHeader.replace('Bearer ', '')

  // Service role callers get unrestricted access
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    return { isServiceRole: true, userId: null }
  }

  // Validate JWT
  const { data: { user }, error: authError } = await serviceClient.auth.getUser(token)
  if (authError || !user) {
    throw 'Unauthorized — invalid token'
  }

  const userId = user.id

  // JWT callers must supply an org_id so we can verify membership
  if (!orgId) {
    throw 'org_id is required when calling as a user JWT (service role may omit it)'
  }

  // Check the user is an admin/owner of the specified org
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: membership, error: membershipError } = await userClient
    .from('organization_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError) {
    console.error('[autopilot-evaluate] membership lookup error:', membershipError)
    throw 'Failed to verify organization membership'
  }

  if (!membership) {
    throw 'Unauthorized — no active membership in this organization'
  }

  if (membership.role !== 'admin' && membership.role !== 'owner') {
    throw 'Forbidden — admin or owner role required'
  }

  return { isServiceRole: false, userId }
}

// =============================================================================
// Proposal stub (AP-015 will replace with real Slack message)
// =============================================================================

/**
 * Stub for AP-015.
 *
 * Records a `promotion_proposed` event for every candidate belonging to this
 * user and logs what would be sent via Slack. AP-015 will replace this with
 * a real Slack message builder.
 *
 * Always returns `true` (success) so the caller can count proposals_sent.
 * Errors from `recordPromotionEvent` are swallowed — it is already fire-and-
 * forget safe internally.
 */
async function sendPromotionProposal(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  candidates: PromotionCandidate[],
): Promise<boolean> {
  // TODO AP-015: send real Slack message
  // For now: record the event and return true
  for (const candidate of candidates) {
    await recordPromotionEvent(supabase, {
      org_id: candidate.org_id,
      user_id: candidate.user_id,
      action_type: candidate.action_type,
      event_type: 'promotion_proposed',
      from_tier: candidate.from_tier,
      to_tier: candidate.to_tier,
      confidence_score: candidate.confidence_score,
      approval_stats: candidate.approval_stats as Record<string, unknown>,
      threshold_config: candidate.threshold_config as Record<string, unknown>,
      trigger_reason: `Score ${candidate.confidence_score.toFixed(3)} meets threshold after ${candidate.approval_stats.total_signals} signals`,
    }).catch(() => {})
  }

  console.log(
    `[autopilot-evaluate] Would send proposal to user ${userId} (org ${orgId}) for ` +
    `${candidates.length} action type(s): ${candidates.map((c) => c.action_type).join(', ')}`,
  )

  return true
}

// =============================================================================
// Core evaluation logic
// =============================================================================

async function runEvaluation(
  serviceClient: SupabaseClient,
  orgId: string | undefined,
  dryRun: boolean,
): Promise<EvaluateResponse> {
  // ---------------------------------------------------------------------------
  // Step 1 — Fetch all (user_id, org_id, action_type) rows that have been
  //           flagged as promotion-eligible. The partial index on
  //           `promotion_eligible` keeps this query fast.
  // ---------------------------------------------------------------------------
  let eligibleQuery = serviceClient
    .from('autopilot_confidence')
    .select('user_id, org_id, action_type')
    .eq('promotion_eligible', true)

  if (orgId) {
    eligibleQuery = eligibleQuery.eq('org_id', orgId)
  }

  const { data: eligibleRows, error: eligibleError } = await eligibleQuery

  if (eligibleError) {
    console.error('[autopilot-evaluate] Failed to fetch eligible rows:', eligibleError)
    throw `Database error fetching eligible rows: ${eligibleError.message}`
  }

  const rows: EligibleRow[] = (eligibleRows ?? []) as EligibleRow[]
  console.log(
    `[autopilot-evaluate] Found ${rows.length} promotion-eligible (user, action_type) row(s)` +
    (orgId ? ` for org ${orgId}` : ' across all orgs'),
  )

  if (rows.length === 0) {
    return {
      success: true,
      evaluated_users: 0,
      candidates_found: 0,
      proposals_sent: 0,
      dry_run: dryRun,
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Evaluate each row through the full promotion engine.
  //           Collect passing candidates; log but continue on per-row errors.
  // ---------------------------------------------------------------------------
  const allCandidates: PromotionCandidate[] = []
  let evaluatedUsers = 0

  for (const row of rows) {
    evaluatedUsers++
    try {
      const candidate = await evaluatePromotionEligibility(
        serviceClient,
        row.user_id,
        row.org_id,
        row.action_type,
      )
      if (candidate !== null) {
        allCandidates.push(candidate)
      }
    } catch (err) {
      console.error(
        `[autopilot-evaluate] Error evaluating user=${row.user_id} action_type=${row.action_type}:`,
        err,
      )
      // Continue — one user's error must not abort the entire run
    }
  }

  console.log(
    `[autopilot-evaluate] Evaluation complete: ${evaluatedUsers} rows checked, ` +
    `${allCandidates.length} candidate(s) found`,
  )

  if (allCandidates.length === 0) {
    return {
      success: true,
      evaluated_users: evaluatedUsers,
      candidates_found: 0,
      proposals_sent: 0,
      dry_run: dryRun,
    }
  }

  // Dry-run path: return candidates without sending proposals or resetting flags
  if (dryRun) {
    return {
      success: true,
      evaluated_users: evaluatedUsers,
      candidates_found: allCandidates.length,
      proposals_sent: 0,
      dry_run: true,
      candidates: allCandidates,
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3 — Group candidates by user_id so each user receives a single
  //           batched Slack notification.
  // ---------------------------------------------------------------------------
  const byUser = new Map<string, { orgId: string; candidates: PromotionCandidate[] }>()

  for (const candidate of allCandidates) {
    const existing = byUser.get(candidate.user_id)
    if (existing) {
      existing.candidates.push(candidate)
    } else {
      byUser.set(candidate.user_id, {
        orgId: candidate.org_id,
        candidates: [candidate],
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Step 4 — Send a proposal for each user; track which users succeeded so we
  //           can reset their rows in Step 5. Errors are logged per-user and
  //           do not stop processing.
  // ---------------------------------------------------------------------------
  let proposalsSent = 0
  const sentUserIds = new Set<string>()

  for (const [userId, { orgId: userOrgId, candidates }] of byUser) {
    try {
      const sent = await sendPromotionProposal(serviceClient, userId, userOrgId, candidates)
      if (sent) {
        proposalsSent++
        sentUserIds.add(userId)
      }
    } catch (err) {
      console.error(
        `[autopilot-evaluate] Error sending proposal for user=${userId}:`,
        err,
      )
      // Continue — one user's send failure must not abort the entire run
    }
  }

  // ---------------------------------------------------------------------------
  // Step 5 — Reset promotion_eligible = false on rows whose proposals were
  //           sent. This prevents re-evaluation until the next confidence
  //           recalculation. AP-015 will set cooldown_until when a user declines.
  //           Rows for users whose send failed remain eligible and will be
  //           retried on the next daily run.
  // ---------------------------------------------------------------------------
  if (sentUserIds.size > 0) {
    const candidatesToReset = allCandidates.filter((c) => sentUserIds.has(c.user_id))

    // Run resets in parallel — each targets a specific (user_id, action_type) pair
    const resetPromises = candidatesToReset.map((candidate) =>
      serviceClient
        .from('autopilot_confidence')
        .update({ promotion_eligible: false })
        .eq('user_id', candidate.user_id)
        .eq('action_type', candidate.action_type)
        .then(({ error }) => {
          if (error) {
            console.error(
              `[autopilot-evaluate] Failed to reset promotion_eligible for ` +
              `user=${candidate.user_id} action_type=${candidate.action_type}:`,
              error,
            )
          }
        })
        .catch((err) => {
          console.error(
            `[autopilot-evaluate] Unexpected error resetting promotion_eligible for ` +
            `user=${candidate.user_id} action_type=${candidate.action_type}:`,
            err,
          )
        }),
    )

    await Promise.all(resetPromises)
    console.log(
      `[autopilot-evaluate] Reset promotion_eligible=false for ` +
      `${candidatesToReset.length} row(s) across ${sentUserIds.size} user(s)`,
    )
  }

  return {
    success: true,
    evaluated_users: evaluatedUsers,
    candidates_found: allCandidates.length,
    proposals_sent: proposalsSent,
    dry_run: false,
  }
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  // Create the service role client once — used for all DB operations
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // -------------------------------------------------------------------------
    // 1. Parse request body (body is optional for bare cron invocations)
    // -------------------------------------------------------------------------
    let body: Partial<EvaluateRequest>
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const { org_id, dry_run = false } = body

    // -------------------------------------------------------------------------
    // 2. Authorize the caller
    // -------------------------------------------------------------------------
    try {
      await resolveAuth(req, org_id, serviceClient)
    } catch (authError) {
      const message = typeof authError === 'string' ? authError : 'Unauthorized'
      const status = message.startsWith('Forbidden') ? 403 : 401
      return errorResponse(message, req, status)
    }

    // -------------------------------------------------------------------------
    // 3. Run evaluation
    // -------------------------------------------------------------------------
    console.log(
      `[autopilot-evaluate] Starting evaluation: org_id=${org_id ?? 'all'} dry_run=${dry_run}`,
    )

    const result = await runEvaluation(serviceClient, org_id, dry_run)

    console.log(
      `[autopilot-evaluate] Complete: evaluated_users=${result.evaluated_users} ` +
      `candidates_found=${result.candidates_found} proposals_sent=${result.proposals_sent}`,
    )

    return jsonResponse(result, req, 200)
  } catch (err) {
    console.error('[autopilot-evaluate] Unexpected error:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    )
  }
})
