/**
 * autopilot-admin — AP-018
 *
 * Admin-only CRUD endpoint for managing `autopilot_org_settings` (manager
 * ceiling configuration) and for retrieving org-wide confidence data for
 * the manager dashboard.
 *
 * AUTH:
 * - Service role key in Authorization header, OR
 * - JWT from an org admin/owner user (checked against organization_memberships)
 *
 * ROUTES:
 *   GET  /autopilot-admin?org_id=<uuid>
 *     Returns all autopilot_org_settings rows for the org.
 *
 *   POST /autopilot-admin  { action: 'upsert_ceiling', org_id, action_type, max_tier, enabled?, allow_rep_override? }
 *     Upserts a ceiling setting for (org_id, action_type).
 *
 *   POST /autopilot-admin  { action: 'remove_ceiling', org_id, action_type }
 *     Deletes the ceiling setting for (org_id, action_type).
 *
 *   POST /autopilot-admin  { action: 'get_team_confidence', org_id }
 *     Returns all autopilot_confidence rows for the org (manager dashboard).
 *
 * DEPLOY (staging):
 *   npx supabase functions deploy autopilot-admin \
 *     --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'

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
  action: 'upsert_ceiling'
  org_id: string
  action_type: string
  max_tier: string
  enabled?: boolean
  allow_rep_override?: boolean
}

interface RemoveCeilingRequest {
  action: 'remove_ceiling'
  org_id: string
  action_type: string
}

interface GetTeamConfidenceRequest {
  action: 'get_team_confidence'
  org_id: string
}

type PostBody = UpsertCeilingRequest | RemoveCeilingRequest | GetTeamConfidenceRequest

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
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError) {
    console.error('[autopilot-admin] membership lookup error:', membershipError)
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
    console.error('[autopilot-admin] handleGetCeilings fetch error:', error)
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
    console.error('[autopilot-admin] handleUpsertCeiling upsert error:', error)
    return errorResponse('Failed to upsert ceiling setting', req, 500)
  }

  console.log(`[autopilot-admin] Ceiling upserted: org=${org_id} action=${action_type} max_tier=${max_tier}`)

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
    console.error('[autopilot-admin] handleRemoveCeiling delete error:', error)
    return errorResponse('Failed to delete ceiling setting', req, 500)
  }

  console.log(`[autopilot-admin] Ceiling removed: org=${org_id} action=${action_type}`)

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
    console.error('[autopilot-admin] handleGetTeamConfidence fetch error:', error)
    return errorResponse('Failed to fetch team confidence data', req, 500)
  }

  return jsonResponse({ success: true, data: data ?? [] }, req, 200)
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  // Create service-role client once — used for all DB operations and auth validation
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // GET — list ceilings for an org
    if (req.method === 'GET') {
      return await handleGetCeilings(req, serviceClient)
    }

    // POST — action-dispatched mutations
    if (req.method === 'POST') {
      let body: Partial<PostBody>
      try {
        body = await req.json()
      } catch {
        return errorResponse('Invalid JSON body', req, 400)
      }

      const action = (body as { action?: string }).action

      switch (action) {
        case 'upsert_ceiling':
          return await handleUpsertCeiling(req, body as UpsertCeilingRequest, serviceClient)

        case 'remove_ceiling':
          return await handleRemoveCeiling(req, body as RemoveCeilingRequest, serviceClient)

        case 'get_team_confidence':
          return await handleGetTeamConfidence(req, body as GetTeamConfidenceRequest, serviceClient)

        default:
          return errorResponse(
            `Unknown action "${action ?? ''}" — valid actions: upsert_ceiling, remove_ceiling, get_team_confidence`,
            req,
            400,
          )
      }
    }

    return errorResponse('Method not allowed', req, 405)
  } catch (err) {
    console.error('[autopilot-admin] Unexpected error:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    )
  }
})
