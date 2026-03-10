/**
 * LinkedIn Campaign Approval
 *
 * Manages the approval model for budget-impacting campaign actions.
 * Some actions auto-approve (create draft, pause, create creative),
 * others require explicit human approval (activate, increase budget,
 * delete, resume).
 *
 * Actions:
 *   request_approval — Submit an action for approval (auto-approves or creates pending record)
 *   approve          — Approve a pending request
 *   reject           — Reject a pending request
 *   list_pending     — List all pending approvals for an org
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const LOG_PREFIX = '[linkedin-campaign-approval]'

// ---------------------------------------------------------------------------
// Approval gate rules
// ---------------------------------------------------------------------------

/** Actions that require explicit human approval before execution */
const APPROVAL_REQUIRED: ReadonlySet<string> = new Set([
  'activate',
  'increase_budget',
  'delete',
  'resume',
])

/** Actions that auto-approve — no gate needed */
const AUTO_APPROVED: ReadonlySet<string> = new Set([
  'create_draft',
  'pause',
  'create_creative',
])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Action = 'request_approval' | 'approve' | 'reject' | 'list_pending'

interface RequestBody {
  action: Action
  // request_approval
  org_id?: string
  campaign_id?: string
  action_type?: string
  details?: Record<string, unknown>
  // approve / reject
  approval_id?: string
  reason?: string
}

interface ApprovalRecord {
  id: string
  org_id: string
  campaign_id: string
  action_type: string
  requested_by: string
  approved_by: string | null
  status: 'pending' | 'approved' | 'rejected'
  details: Record<string, unknown> | null
  resolved_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Supabase clients
// ---------------------------------------------------------------------------

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

function userClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function extractToken(req: Request): string | null {
  const header = req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  return header.slice(7)
}

/** Verify user JWT and return user id */
async function authenticateUser(
  supabase: ReturnType<typeof createClient>,
): Promise<{ userId: string } | null> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return { userId: user.id }
}

/** Check that user belongs to the given org */
async function verifyOrgMembership(
  userId: string,
  orgId: string,
): Promise<boolean> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()

  return !error && !!data
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleRequestApproval(
  userId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  const { org_id, campaign_id, action_type, details } = body

  if (!org_id || !campaign_id || !action_type) {
    return errorResponse('org_id, campaign_id, and action_type are required', req, 400)
  }

  // Validate action_type is known
  if (!APPROVAL_REQUIRED.has(action_type) && !AUTO_APPROVED.has(action_type)) {
    return errorResponse(`Unknown action_type: ${action_type}`, req, 400)
  }

  // Check org membership
  const isMember = await verifyOrgMembership(userId, org_id)
  if (!isMember) {
    return errorResponse('User is not a member of this organization', req, 403)
  }

  // Auto-approved actions — no record needed
  if (AUTO_APPROVED.has(action_type)) {
    console.log(`${LOG_PREFIX} Auto-approved: action_type=${action_type} campaign=${campaign_id}`)
    return jsonResponse({
      auto_approved: true,
      action_type,
      campaign_id,
    }, req)
  }

  // Requires approval — insert pending record
  const svc = serviceClient()
  const { data, error } = await svc
    .from('linkedin_campaign_approvals')
    .insert({
      org_id,
      campaign_id,
      action_type,
      requested_by: userId,
      status: 'pending',
      details: details ?? null,
    })
    .select('id, org_id, campaign_id, action_type, requested_by, status, details, created_at')
    .single()

  if (error) {
    console.error(`${LOG_PREFIX} Insert error:`, error.message)
    return errorResponse('Failed to create approval request', req, 500)
  }

  console.log(`${LOG_PREFIX} Approval requested: id=${data.id} action_type=${action_type} campaign=${campaign_id}`)
  return jsonResponse({ approval: data, requires_approval: true }, req)
}

async function handleApprove(
  userId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  const { approval_id } = body

  if (!approval_id) {
    return errorResponse('approval_id is required', req, 400)
  }

  const svc = serviceClient()

  // Load the approval record
  const { data: record, error: fetchError } = await svc
    .from('linkedin_campaign_approvals')
    .select('id, org_id, campaign_id, action_type, requested_by, status, details, created_at')
    .eq('id', approval_id)
    .maybeSingle()

  if (fetchError) {
    console.error(`${LOG_PREFIX} Fetch error:`, fetchError.message)
    return errorResponse('Failed to load approval record', req, 500)
  }

  if (!record) {
    return errorResponse('Approval record not found', req, 404)
  }

  // Verify the approver has org access
  const isMember = await verifyOrgMembership(userId, record.org_id)
  if (!isMember) {
    return errorResponse('User is not a member of this organization', req, 403)
  }

  if (record.status !== 'pending') {
    return errorResponse(`Approval is already ${record.status}`, req, 409)
  }

  // Update to approved
  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await svc
    .from('linkedin_campaign_approvals')
    .update({
      status: 'approved',
      approved_by: userId,
      resolved_at: now,
    })
    .eq('id', approval_id)
    .select('id, org_id, campaign_id, action_type, requested_by, approved_by, status, details, resolved_at, created_at')
    .single()

  if (updateError) {
    console.error(`${LOG_PREFIX} Update error:`, updateError.message)
    return errorResponse('Failed to approve request', req, 500)
  }

  console.log(`${LOG_PREFIX} Approved: id=${approval_id} by=${userId}`)
  return jsonResponse({ approval: updated }, req)
}

async function handleReject(
  userId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  const { approval_id, reason } = body

  if (!approval_id) {
    return errorResponse('approval_id is required', req, 400)
  }

  const svc = serviceClient()

  // Load the approval record
  const { data: record, error: fetchError } = await svc
    .from('linkedin_campaign_approvals')
    .select('id, org_id, campaign_id, action_type, requested_by, status, details, created_at')
    .eq('id', approval_id)
    .maybeSingle()

  if (fetchError) {
    console.error(`${LOG_PREFIX} Fetch error:`, fetchError.message)
    return errorResponse('Failed to load approval record', req, 500)
  }

  if (!record) {
    return errorResponse('Approval record not found', req, 404)
  }

  // Verify the rejector has org access
  const isMember = await verifyOrgMembership(userId, record.org_id)
  if (!isMember) {
    return errorResponse('User is not a member of this organization', req, 403)
  }

  if (record.status !== 'pending') {
    return errorResponse(`Approval is already ${record.status}`, req, 409)
  }

  // Merge reason into details if provided
  const updatedDetails = reason
    ? { ...(record.details ?? {}), rejection_reason: reason }
    : record.details

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await svc
    .from('linkedin_campaign_approvals')
    .update({
      status: 'rejected',
      approved_by: userId,
      resolved_at: now,
      details: updatedDetails,
    })
    .eq('id', approval_id)
    .select('id, org_id, campaign_id, action_type, requested_by, approved_by, status, details, resolved_at, created_at')
    .single()

  if (updateError) {
    console.error(`${LOG_PREFIX} Update error:`, updateError.message)
    return errorResponse('Failed to reject request', req, 500)
  }

  console.log(`${LOG_PREFIX} Rejected: id=${approval_id} by=${userId} reason=${reason ?? 'none'}`)
  return jsonResponse({ approval: updated }, req)
}

async function handleListPending(
  userId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  const { org_id } = body

  if (!org_id) {
    return errorResponse('org_id is required', req, 400)
  }

  // Verify org access
  const isMember = await verifyOrgMembership(userId, org_id)
  if (!isMember) {
    return errorResponse('User is not a member of this organization', req, 403)
  }

  const svc = serviceClient()

  const { data, error } = await svc
    .from('linkedin_campaign_approvals')
    .select(`
      id,
      org_id,
      campaign_id,
      action_type,
      requested_by,
      status,
      details,
      created_at,
      linkedin_managed_campaigns (
        campaign_name
      )
    `)
    .eq('org_id', org_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error(`${LOG_PREFIX} List error:`, error.message)
    return errorResponse('Failed to list pending approvals', req, 500)
  }

  // Flatten campaign name into each record for display convenience
  const approvals = (data ?? []).map((row: any) => ({
    id: row.id,
    org_id: row.org_id,
    campaign_id: row.campaign_id,
    action_type: row.action_type,
    requested_by: row.requested_by,
    status: row.status,
    details: row.details,
    created_at: row.created_at,
    campaign_name: row.linkedin_managed_campaigns?.campaign_name ?? null,
  }))

  return jsonResponse({ approvals }, req)
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    // Authenticate via JWT
    const token = extractToken(req)
    if (!token) {
      return errorResponse('Missing authorization token', req, 401)
    }

    const uc = userClient(token)
    const authResult = await authenticateUser(uc)
    if (!authResult) {
      return errorResponse('Unauthorized', req, 401)
    }

    const { userId } = authResult

    // Parse body
    let body: RequestBody
    try {
      body = await req.json()
    } catch {
      return errorResponse('Invalid JSON body', req, 400)
    }

    if (!body.action) {
      return errorResponse('action is required', req, 400)
    }

    console.log(`${LOG_PREFIX} action=${body.action} user=${userId}`)

    switch (body.action) {
      case 'request_approval':
        return await handleRequestApproval(userId, body, req)

      case 'approve':
        return await handleApprove(userId, body, req)

      case 'reject':
        return await handleReject(userId, body, req)

      case 'list_pending':
        return await handleListPending(userId, body, req)

      default:
        return errorResponse(`Unknown action: ${body.action}`, req, 400)
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Unhandled error:`, err)
    return errorResponse('Internal server error', req, 500)
  }
})
