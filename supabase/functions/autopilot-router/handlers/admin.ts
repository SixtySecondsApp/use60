/**
 * autopilot-router/handlers/admin.ts
 *
 * Extracted from autopilot-admin/index.ts (AP-018).
 * Admin-only CRUD for `autopilot_org_settings` (manager ceiling configuration)
 * and org-wide confidence data for the manager dashboard.
 *
 * Sub-routes via `sub_action` in the request body (POST) or query params (GET).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../../_shared/corsHelper.ts'

// =============================================================================
// Environment
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// =============================================================================
// Types
// =============================================================================

interface UpsertCeilingRequest {
  sub_action: 'upsert_ceiling'
  org_id: string
  action_type: string
  max_tier: string
  enabled?: boolean
  allow_rep_override?: boolean
}

interface RemoveCeilingRequest {
  sub_action: 'remove_ceiling'
  org_id: string
  action_type: string
}

interface GetTeamConfidenceRequest {
  sub_action: 'get_team_confidence'
  org_id: string
}

/** DEV/QA only — directly sets promotion_eligible = true on an autopilot_confidence row */
interface ForceEligibleRequest {
  sub_action: 'force_eligible'
  org_id: string
  user_id: string
  action_type: string
}

type PostBody = UpsertCeilingRequest | RemoveCeilingRequest | GetTeamConfidenceRequest | ForceEligibleRequest

// =============================================================================
// Auth helper
// =============================================================================

/**
 * Validates the request authorization.
 *
 * Returns { isServiceRole: true } for service-role callers, or
 * { isServiceRole: false, userId } for verified org admin/owner JWT callers.
 * Throws a string error message if authorization fails.
 */
async function resolveAuth(
  req: Request,
  orgId: string,
  serviceClient: ReturnType<typeof createClient>,
): Promise<{ isServiceRole: boolean; userId: string | null }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw 'Missing or invalid Authorization header'
  }

  const token = authHeader.replace('Bearer ', '')

  // 1. Service role key — trusted system caller
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    return { isServiceRole: true, userId: null }
  }

  // 2. User JWT — validate and check org admin/owner role
  const { data: { user }, error: authError } = await serviceClient.auth.getUser(token)
  if (authError || !user) {
    throw 'Unauthorized — invalid token'
  }

  const userId = user.id

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: membership, error: membershipError } = await userClient
    .from('organization_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('member_status', 'active')
    .maybeSingle()

  if (membershipError) {
    console.error('[autopilot-router:admin] membership lookup error:', membershipError)
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
// Handlers
// =============================================================================

/** GET /autopilot-admin?org_id=<uuid> — list all ceiling settings for an org */
async function handleGetCeilings(
  req: Request,
  serviceClient: ReturnType<typeof createClient>,
): Promise<Response> {
  const url = new URL(req.url)
  const orgId = url.searchParams.get('org_id')

  if (!orgId) {
    return errorResponse('Missing required query parameter: org_id', req, 400)
  }

  // Authorize
  try {
    await resolveAuth(req, orgId, serviceClient)
  } catch (authError) {
    const message = typeof authError === 'string' ? authError : 'Unauthorized'
    const status = message.startsWith('Forbidden') ? 403 : 401
    return errorResponse(message, req, status)
  }

  const { data, error } = await serviceClient
    .from('autopilot_org_settings')
    .select('id, org_id, action_type, max_tier, enabled, allow_rep_override, created_at, updated_at')
    .eq('org_id', orgId)
    .order('action_type', { ascending: true })

  if (error) {
    console.error('[autopilot-router:admin] handleGetCeilings fetch error:', error)
    return errorResponse('Failed to fetch org settings', req, 500)
  }

  return jsonResponse({ success: true, data: data ?? [] }, req, 200)
}

/** POST — upsert a ceiling setting for (org_id, action_type) */
async function handleUpsertCeiling(
  req: Request,
  body: UpsertCeilingRequest,
  serviceClient: ReturnType<typeof createClient>,
): Promise<Response> {
  const { org_id, action_type, max_tier, enabled = true, allow_rep_override = true } = body

  if (!org_id || !action_type || !max_tier) {
    return errorResponse('Missing required fields: org_id, action_type, max_tier', req, 400)
  }

  const validTiers = ['disabled', 'suggest', 'approve', 'auto']
  if (!validTiers.includes(max_tier)) {
    return errorResponse(
      `Invalid max_tier "${max_tier}" — must be one of: ${validTiers.join(', ')}`,
      req,
      400,
    )
  }

  // Authorize
  try {
    await resolveAuth(req, org_id, serviceClient)
  } catch (authError) {
    const message = typeof authError === 'string' ? authError : 'Unauthorized'
    const status = message.startsWith('Forbidden') ? 403 : 401
    return errorResponse(message, req, status)
  }

  const { data, error } = await serviceClient
    .from('autopilot_org_settings')
    .upsert(
      {
        org_id,
        action_type,
        max_tier,
        enabled,
        allow_rep_override,
      },
      { onConflict: 'org_id,action_type' },
    )
    .select('id, org_id, action_type, max_tier, enabled, allow_rep_override, created_at, updated_at')
    .maybeSingle()

  if (error) {
    console.error('[autopilot-router:admin] handleUpsertCeiling upsert error:', error)
    return errorResponse('Failed to upsert ceiling setting', req, 500)
  }

  console.log(`[autopilot-router:admin] Ceiling upserted: org=${org_id} action=${action_type} max_tier=${max_tier}`)

  return jsonResponse({ success: true, data }, req, 200)
}

/** POST — delete a ceiling setting for (org_id, action_type) */
async function handleRemoveCeiling(
  req: Request,
  body: RemoveCeilingRequest,
  serviceClient: ReturnType<typeof createClient>,
): Promise<Response> {
  const { org_id, action_type } = body

  if (!org_id || !action_type) {
    return errorResponse('Missing required fields: org_id, action_type', req, 400)
  }

  // Authorize
  try {
    await resolveAuth(req, org_id, serviceClient)
  } catch (authError) {
    const message = typeof authError === 'string' ? authError : 'Unauthorized'
    const status = message.startsWith('Forbidden') ? 403 : 401
    return errorResponse(message, req, status)
  }

  const { error } = await serviceClient
    .from('autopilot_org_settings')
    .delete()
    .eq('org_id', org_id)
    .eq('action_type', action_type)

  if (error) {
    console.error('[autopilot-router:admin] handleRemoveCeiling delete error:', error)
    return errorResponse('Failed to delete ceiling setting', req, 500)
  }

  console.log(`[autopilot-router:admin] Ceiling removed: org=${org_id} action=${action_type}`)

  return jsonResponse({ success: true }, req, 200)
}

/** POST — return all autopilot_confidence rows for an org (manager dashboard) */
async function handleGetTeamConfidence(
  req: Request,
  body: GetTeamConfidenceRequest,
  serviceClient: ReturnType<typeof createClient>,
): Promise<Response> {
  const { org_id } = body

  if (!org_id) {
    return errorResponse('Missing required field: org_id', req, 400)
  }

  // Authorize
  try {
    await resolveAuth(req, org_id, serviceClient)
  } catch (authError) {
    const message = typeof authError === 'string' ? authError : 'Unauthorized'
    const status = message.startsWith('Forbidden') ? 403 : 401
    return errorResponse(message, req, status)
  }

  const { data, error } = await serviceClient
    .from('autopilot_confidence')
    .select(
      'user_id, org_id, action_type, score, approval_rate, clean_approval_rate, ' +
      'rejection_rate, undo_rate, total_signals, days_active, last_30_score, ' +
      'current_tier, cooldown_until, never_promote, updated_at',
    )
    .eq('org_id', org_id)
    .order('user_id', { ascending: true })
    .order('action_type', { ascending: true })

  if (error) {
    console.error('[autopilot-router:admin] handleGetTeamConfidence fetch error:', error)
    return errorResponse('Failed to fetch team confidence data', req, 500)
  }

  return jsonResponse({ success: true, data: data ?? [] }, req, 200)
}

/** POST — dev/QA helper: force promotion_eligible = true on a confidence row */
async function handleForceEligible(
  req: Request,
  body: ForceEligibleRequest,
  serviceClient: ReturnType<typeof createClient>,
): Promise<Response> {
  const { org_id, user_id, action_type } = body

  if (!org_id || !user_id || !action_type) {
    return errorResponse('Missing required fields: org_id, user_id, action_type', req, 400)
  }

  // Authorize — must be admin/owner of the org
  try {
    await resolveAuth(req, org_id, serviceClient)
  } catch (authError) {
    const message = typeof authError === 'string' ? authError : 'Unauthorized'
    const status = message.startsWith('Forbidden') ? 403 : 401
    return errorResponse(message, req, status)
  }

  const { error } = await serviceClient
    .from('autopilot_confidence')
    .upsert(
      {
        user_id,
        org_id,
        action_type,
        promotion_eligible: true,
        score: 0.92,
        clean_approval_rate: 0.95,
        approval_rate: 0.95,
        rejection_rate: 0.0,
        undo_rate: 0.0,
        total_signals: 20,
        total_approved: 19,
        total_rejected: 0,
        total_undone: 0,
        days_active: 10,
        current_tier: 'approve',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,action_type' },
    )

  if (error) {
    console.error('[autopilot-router:admin] handleForceEligible upsert error:', error)
    return errorResponse('Failed to force eligible', req, 500)
  }

  console.log(`[autopilot-router:admin] Force eligible: user=${user_id} action=${action_type}`)
  return jsonResponse({ success: true, user_id, action_type, promotion_eligible: true }, req, 200)
}

// =============================================================================
// Exported handler
// =============================================================================

export async function handleAdmin(req: Request): Promise<Response> {
  // Create service-role client once — used for all DB operations and auth validation
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // GET — list ceilings for an org
    if (req.method === 'GET') {
      return await handleGetCeilings(req, serviceClient)
    }

    // POST — sub_action-dispatched mutations
    if (req.method === 'POST') {
      let body: Partial<PostBody>
      try {
        body = await req.json()
      } catch {
        return errorResponse('Invalid JSON body', req, 400)
      }

      const sub_action = (body as { sub_action?: string }).sub_action

      switch (sub_action) {
        case 'upsert_ceiling':
          return await handleUpsertCeiling(req, body as UpsertCeilingRequest, serviceClient)

        case 'remove_ceiling':
          return await handleRemoveCeiling(req, body as RemoveCeilingRequest, serviceClient)

        case 'get_team_confidence':
          return await handleGetTeamConfidence(req, body as GetTeamConfidenceRequest, serviceClient)

        case 'force_eligible':
          return await handleForceEligible(req, body as ForceEligibleRequest, serviceClient)

        default:
          return errorResponse(
            `Unknown sub_action "${sub_action ?? ''}" — valid sub_actions: upsert_ceiling, remove_ceiling, get_team_confidence, force_eligible`,
            req,
            400,
          )
      }
    }

    return errorResponse('Method not allowed', req, 405)
  } catch (err) {
    console.error('[autopilot-router:admin] Unexpected error:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    )
  }
}
