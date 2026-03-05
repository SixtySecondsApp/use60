/**
 * autopilot-backfill — AP-012
 *
 * Admin-only edge function that imports historical approval data from
 * `slack_pending_actions` into `autopilot_signals`.
 *
 * AUTH:
 * - Service role key in Authorization header, OR
 * - JWT from an org admin user (checked against organization_memberships)
 *
 * DEPLOY (staging):
 *   npx supabase functions deploy autopilot-backfill \
 *     --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
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
  type ApprovalEvent,
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

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1000

// =============================================================================
// Action type mapping
// slack_pending_actions.sequence_key → autopilot_signals.action_type
// =============================================================================

const ACTION_TYPE_MAP: Record<string, string> = {
  'send_email': 'email.send',
  'send_follow_up': 'email.follow_up_send',
  'create_task': 'task.create',
  'update_crm': 'crm.deal_field_update',
  'add_note': 'crm.note_add',
  'log_activity': 'crm.activity_log',
  'stage_change': 'crm.deal_stage_change',
  'update_next_steps': 'crm.next_steps_update',
  // Sequence keys (seq-*) are passed through as-is
}

function mapActionType(raw: string): string {
  return ACTION_TYPE_MAP[raw] ?? raw
}

// =============================================================================
// Status mapping
// slack_pending_actions.status → ApprovalSignal
// The table uses 'confirmed' (not 'approved') and 'cancelled' (not 'rejected')
// =============================================================================

function mapStatusToSignal(status: string): ApprovalSignal | null {
  switch (status) {
    case 'confirmed':
      return 'approved'
    case 'cancelled':
      return 'rejected'
    case 'expired':
      return 'expired'
    default:
      return null
  }
}

// =============================================================================
// Types
// =============================================================================

interface BackfillRequest {
  org_id: string
  dry_run?: boolean
  limit?: number
  after_date?: string
}

interface DryRunDetail {
  source_id: string
  action_type: string
  signal: ApprovalSignal
  created_at: string
}

interface BackfillResponse {
  success: true
  dry_run: boolean
  processed: number
  skipped: number
  errors: number
  details?: DryRunDetail[]
}

interface SlackPendingAction {
  id: string
  user_id: string
  org_id: string
  sequence_key: string
  sequence_context: Record<string, unknown> | null
  status: string
  created_at: string
  updated_at: string | null
  expires_at: string
}

// =============================================================================
// Auth helpers
// =============================================================================

/**
 * Checks whether the request is authorized.
 *
 * Returns the resolved `userId` (for JWT callers) or null (for service role
 * callers). Throws an error string if authorization fails.
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

  // 1. Check if caller is using the service role key directly
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    return { isServiceRole: true, userId: null }
  }

  // 2. Otherwise, validate as a user JWT
  const { data: { user }, error: authError } = await serviceClient.auth.getUser(token)
  if (authError || !user) {
    throw 'Unauthorized — invalid token'
  }

  const userId = user.id

  // 3. Check that this user is an admin/owner in the requested org
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
    console.error('[autopilot-backfill] membership lookup error:', membershipError)
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
// Core backfill logic
// =============================================================================

async function runBackfill(
  serviceClient: ReturnType<typeof createClient>,
  orgId: string,
  dryRun: boolean,
  limit: number,
  afterDate: string | undefined,
): Promise<BackfillResponse> {
  // -------------------------------------------------------------------------
  // 1. Fetch completed slack_pending_actions for the org
  // -------------------------------------------------------------------------
  let query = serviceClient
    .from('slack_pending_actions')
    .select(
      'id, user_id, org_id, sequence_key, sequence_context, status, created_at, updated_at, expires_at',
    )
    .eq('org_id', orgId)
    .in('status', ['confirmed', 'cancelled', 'expired'])
    .order('created_at', { ascending: true })
    .limit(limit)

  if (afterDate) {
    query = query.gte('created_at', afterDate)
  }

  const { data: pendingActions, error: fetchError } = await query

  if (fetchError) {
    console.error('[autopilot-backfill] Failed to fetch slack_pending_actions:', fetchError)
    throw `Database error fetching pending actions: ${fetchError.message}`
  }

  const rows = (pendingActions ?? []) as SlackPendingAction[]
  const total = rows.length
  console.log(`[autopilot-backfill] Processing ${total} record(s) for org ${orgId} (dry_run=${dryRun})`)

  if (total === 0) {
    return { success: true, dry_run: dryRun, processed: 0, skipped: 0, errors: 0 }
  }

  // -------------------------------------------------------------------------
  // 2. Process each record
  // -------------------------------------------------------------------------
  let processed = 0
  let skipped = 0
  let errors = 0
  const details: DryRunDetail[] = []

  // Track unique (user_id, action_type) pairs that need confidence recalculation
  const recalcSet = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    if (i > 0 && i % 100 === 0) {
      console.log(`[autopilot-backfill] Processing ${i} of ${total} records...`)
    }

    try {
      // Map status → signal
      const signal = mapStatusToSignal(row.status)
      if (!signal) {
        console.warn(`[autopilot-backfill] Skipping row ${row.id} — unmappable status: ${row.status}`)
        skipped++
        continue
      }

      // Map sequence_key → action_type
      const actionType = mapActionType(row.sequence_key)

      // Check for existing backfill signal to ensure idempotency.
      // A backfill signal is considered a duplicate if there is already a row
      // with: is_backfill = true AND user_id = source.user_id
      //        AND action_type = mapped_type AND created_at = source.created_at
      const { data: existing, error: existingError } = await serviceClient
        .from('autopilot_signals')
        .select('id')
        .eq('user_id', row.user_id)
        .eq('action_type', actionType)
        .eq('is_backfill', true)
        .eq('created_at', row.created_at)
        .maybeSingle()

      if (existingError) {
        console.error(`[autopilot-backfill] Duplicate check error for row ${row.id}:`, existingError)
        errors++
        continue
      }

      if (existing) {
        skipped++
        continue
      }

      // Derive agent_name from sequence_context or sequence_key
      const agentName: string =
        (row.sequence_context?.agent_name as string | undefined) ??
        row.sequence_key ??
        'unknown'

      // Compute time_to_respond_ms if we have updated_at (response timestamp)
      let timeToRespondMs: number | undefined
      if (row.updated_at && row.created_at) {
        const respondedMs = new Date(row.updated_at).getTime()
        const createdMs = new Date(row.created_at).getTime()
        const diff = respondedMs - createdMs
        if (diff > 0) {
          timeToRespondMs = diff
        }
      }

      // Extract deal_id / contact_id from sequence_context if available
      const dealId = (row.sequence_context?.deal_id as string | undefined) ?? undefined
      const contactId = (row.sequence_context?.contact_id as string | undefined) ?? undefined

      const event: ApprovalEvent = {
        user_id: row.user_id,
        org_id: row.org_id,
        action_type: actionType,
        agent_name: agentName,
        signal,
        time_to_respond_ms: timeToRespondMs,
        deal_id: dealId,
        contact_id: contactId,
        autonomy_tier_at_time: 'approve',
        is_backfill: true,
        created_at: row.created_at,
      }

      if (dryRun) {
        details.push({
          source_id: row.id,
          action_type: actionType,
          signal,
          created_at: row.created_at,
        })
        processed++
        continue
      }

      // Insert the signal.
      // recordSignal() is fire-and-forget-safe but we need to know if it
      // errored for our counter. Insert directly so we can capture the error.
      const { error: insertError } = await serviceClient
        .from('autopilot_signals')
        .insert({
          user_id: event.user_id,
          org_id: event.org_id,
          action_type: event.action_type,
          agent_name: event.agent_name,
          signal: event.signal,
          edit_distance: null,
          edit_fields: null,
          time_to_respond_ms: event.time_to_respond_ms ?? null,
          confidence_at_proposal: null,
          deal_id: event.deal_id ?? null,
          contact_id: event.contact_id ?? null,
          meeting_id: null,
          autonomy_tier_at_time: event.autonomy_tier_at_time,
          is_backfill: true,
          rubber_stamp: false,
          created_at: event.created_at,
        })

      if (insertError) {
        console.error(`[autopilot-backfill] Insert error for row ${row.id}:`, insertError)
        errors++
        continue
      }

      processed++
      recalcSet.add(`${row.user_id}::${actionType}`)
    } catch (err) {
      console.error(`[autopilot-backfill] Unexpected error processing row ${row.id}:`, err)
      errors++
    }
  }

  // -------------------------------------------------------------------------
  // 3. Batch confidence recalculations for all affected (user_id, action_type)
  // -------------------------------------------------------------------------
  if (!dryRun && recalcSet.size > 0) {
    console.log(`[autopilot-backfill] Recalculating confidence for ${recalcSet.size} (user, action_type) pair(s)...`)

    const recalcPromises: Promise<unknown>[] = []

    for (const key of recalcSet) {
      const [userId, actionType] = key.split('::')
      recalcPromises.push(
        recalculateUserConfidence(serviceClient, userId, orgId, actionType).catch((err) => {
          console.error(`[autopilot-backfill] recalculateUserConfidence error for ${key}:`, err)
        }),
      )
    }

    await Promise.all(recalcPromises)
    console.log(`[autopilot-backfill] Confidence recalculation complete.`)
  }

  // -------------------------------------------------------------------------
  // 4. Return summary
  // -------------------------------------------------------------------------
  const response: BackfillResponse = {
    success: true,
    dry_run: dryRun,
    processed,
    skipped,
    errors,
  }

  if (dryRun && details.length > 0) {
    response.details = details
  }

  return response
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
    // 1. Parse request body
    // -------------------------------------------------------------------------
    let body: Partial<BackfillRequest>
    try {
      body = await req.json()
    } catch {
      return errorResponse('Invalid JSON body', req, 400)
    }

    const { org_id, dry_run = false, limit: rawLimit, after_date } = body

    if (!org_id || typeof org_id !== 'string') {
      return errorResponse('Missing required field: org_id', req, 400)
    }

    const limit = Math.min(
      typeof rawLimit === 'number' && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT,
      MAX_LIMIT,
    )

    // Validate after_date if provided
    if (after_date !== undefined && after_date !== null) {
      if (typeof after_date !== 'string' || isNaN(Date.parse(after_date))) {
        return errorResponse('Invalid after_date — must be an ISO date string', req, 400)
      }
    }

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
    // 3. Run the backfill
    // -------------------------------------------------------------------------
    console.log(
      `[autopilot-backfill] Starting backfill: org_id=${org_id} dry_run=${dry_run} limit=${limit} after_date=${after_date ?? 'all'}`,
    )

    const result = await runBackfill(serviceClient, org_id, dry_run, limit, after_date)

    console.log(
      `[autopilot-backfill] Complete: processed=${result.processed} skipped=${result.skipped} errors=${result.errors}`,
    )

    return jsonResponse(result, req, 200)
  } catch (err) {
    console.error('[autopilot-backfill] Unexpected error:', err)
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    )
  }
})
