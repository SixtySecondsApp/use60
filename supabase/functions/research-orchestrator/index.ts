import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts'
import { deductCreditsOrdered } from '../_shared/creditPacks.ts'

// =============================================================================
// Research Orchestrator — Queue Management + Credit Reservation
// =============================================================================
//
// This edge function orchestrates batch research requests for AI Agent columns.
//
// Credit Management Flow:
// 1. **Reserve Credits (here)**: Calculate total cost (depth × rows), check balance,
//    and DEDUCT credits upfront via deduct_credits() RPC.
// 2. **Track Cost (router)**: As research-router completes each cell, it stores the
//    actual credit_cost in agent_runs.credit_cost for analytics.
// 3. **No Double-Charge**: Router does NOT deduct credits again (already reserved here).
// 4. **Refunds (future)**: If user cancels queued tasks, call add_credits() to refund.
//
// Flat Credit Costs (per cell):
// - Low depth: 3 credits
// - Medium depth: 5 credits
// - High depth: 10 credits
//
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrchestrationRequest {
  agent_column_id: string
  row_ids: string[]
  depth_override?: 'low' | 'medium' | 'high'
}

interface OrchestrationResponse {
  run_id: string
  total_tasks: number
  estimated_credits: number
  credits_reserved: number
  queued_count: number
  skipped_count: number
}

interface AgentColumn {
  id: string
  ops_table_id: string
  organization_id: string
  name: string
  prompt_template: string
  output_format: string
  research_depth: 'low' | 'medium' | 'high'
  source_preferences: Record<string, boolean>
  auto_route: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEPTH_COSTS = {
  low: 3,
  medium: 5,
  high: 10,
} as const

const MAX_CONCURRENT_TASKS_PER_USER = 10

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Calculate estimated credit cost for research tasks
 */
function calculateEstimatedCredits(
  depthLevel: 'low' | 'medium' | 'high',
  rowCount: number
): number {
  const costPerRow = DEPTH_COSTS[depthLevel]
  return costPerRow * rowCount
}

/**
 * Get user's current organization
 */
async function getUserOrganization(
  supabaseClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabaseClient
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[research-orchestrator] Failed to fetch user org:', error)
    return null
  }

  return data?.org_id || null
}

/**
 * Count current in-progress tasks for user
 */
async function countInProgressTasks(
  supabaseClient: ReturnType<typeof createClient>,
  organizationId: string
): Promise<number> {
  const { count, error } = await supabaseClient
    .from('agent_runs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'in_progress')
    .in('agent_column_id',
      supabaseClient
        .from('agent_columns')
        .select('id')
        .eq('organization_id', organizationId)
    )

  if (error) {
    console.error('[research-orchestrator] Failed to count in-progress tasks:', error)
    return 0
  }

  return count || 0
}

/**
 * Validate that all row IDs exist in the table
 */
async function validateRowIds(
  supabaseClient: ReturnType<typeof createClient>,
  opsTableId: string,
  rowIds: string[]
): Promise<{ valid: boolean; validRowIds: string[] }> {
  const { data, error } = await supabaseClient
    .from('dynamic_table_rows')
    .select('id')
    .eq('table_id', opsTableId)
    .in('id', rowIds)

  if (error) {
    console.error('[research-orchestrator] Failed to validate row IDs:', error)
    return { valid: false, validRowIds: [] }
  }

  const validRowIds = data?.map(row => row.id) || []
  return {
    valid: validRowIds.length === rowIds.length,
    validRowIds,
  }
}

/**
 * Check workspace credit balance and reserve credits if sufficient
 */
async function checkAndReserveCredits(
  supabaseClient: ReturnType<typeof createClient>,
  organizationId: string,
  estimatedCredits: number
): Promise<{ hasBalance: boolean; currentBalance: number; message?: string }> {
  try {
    // 1. Get current credit balance
    const { data: balanceData, error: balanceError } = await supabaseClient
      .from('org_credit_balance')
      .select('balance_credits')
      .eq('org_id', organizationId)
      .maybeSingle()

    if (balanceError) {
      // If table doesn't exist, allow (backward compat during rollout)
      if (balanceError.message.includes('relation') || balanceError.message.includes('does not exist')) {
        console.warn('[research-orchestrator] Credit balance table not found, allowing request')
        return { hasBalance: true, currentBalance: 0 }
      }
      console.error('[research-orchestrator] Credit balance check error:', balanceError)
      return { hasBalance: true, currentBalance: 0 }
    }

    // No balance row = org hasn't been migrated to credit system yet -> allow
    if (!balanceData) {
      console.log('[research-orchestrator] No credit balance row for org, allowing request')
      return { hasBalance: true, currentBalance: 0 }
    }

    const currentBalance = balanceData.balance_credits || 0

    // 2. Check if sufficient credits
    if (currentBalance < estimatedCredits) {
      console.warn(
        `[research-orchestrator] Insufficient credits: ${currentBalance} available, ${estimatedCredits} required`
      )
      return {
        hasBalance: false,
        currentBalance,
        message: `Insufficient credits. You have ${currentBalance.toFixed(2)} credits, but this research requires ${estimatedCredits} credits. Please top up to continue.`,
      }
    }

    // 3. Reserve credits upfront (deduct immediately)
    const { success: deductSuccess, newBalance } = await deductCreditsOrdered(
      supabaseClient,
      organizationId,
      estimatedCredits,
      'research_agent',
      'medium',
      { description: `AI Research Agent: reserved ${estimatedCredits} credits` },
    )

    if (!deductSuccess) {
      const deductError = { message: 'deduct_credits_ordered failed' }
      console.error('[research-orchestrator] Credit deduction error:', deductError)
      return { hasBalance: false, currentBalance, message: 'Failed to reserve credits. Please try again.' }
    }

    // Check if deduction was successful (returns -1 on failure)
    if (newBalance === -1) {
      console.warn('[research-orchestrator] Credit deduction returned -1 (insufficient funds)')
      return {
        hasBalance: false,
        currentBalance,
        message: `Insufficient credits. You have ${currentBalance.toFixed(2)} credits, but this research requires ${estimatedCredits} credits. Please top up to continue.`,
      }
    }

    console.log(
      `[research-orchestrator] Reserved ${estimatedCredits} credits. New balance: ${newBalance}`
    )

    return {
      hasBalance: true,
      currentBalance: newBalance,
    }
  } catch (error) {
    console.error('[research-orchestrator] Credit check exception:', error)
    // On error, allow the request (fail open for backward compatibility)
    return { hasBalance: true, currentBalance: 0 }
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    // ------------------------------------------------------------------
    // 1. Auth: validate JWT and get user
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // User-scoped client (respects RLS)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Service role client (bypasses RLS for writes)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      console.error('[research-orchestrator] Auth error:', authError)
      return errorResponse('Unauthorized', req, 401)
    }

    // ------------------------------------------------------------------
    // 2. Parse and validate request
    // ------------------------------------------------------------------
    const body = await req.json() as OrchestrationRequest
    const { agent_column_id, row_ids, depth_override } = body

    if (!agent_column_id || typeof agent_column_id !== 'string') {
      return errorResponse('Missing or invalid agent_column_id', req, 400)
    }

    if (!Array.isArray(row_ids) || row_ids.length === 0) {
      return errorResponse('Missing or invalid row_ids array', req, 400)
    }

    if (depth_override && !['low', 'medium', 'high'].includes(depth_override)) {
      return errorResponse('Invalid depth_override. Must be "low", "medium", or "high"', req, 400)
    }

    // ------------------------------------------------------------------
    // 3. Get user's organization
    // ------------------------------------------------------------------
    const organizationId = await getUserOrganization(userClient, user.id)
    if (!organizationId) {
      return errorResponse('User is not a member of any organization', req, 403)
    }

    // ------------------------------------------------------------------
    // 4. Validate agent column exists and user has access
    // ------------------------------------------------------------------
    const { data: agentColumn, error: columnError } = await userClient
      .from('agent_columns')
      .select('id, ops_table_id, organization_id, name, prompt_template, output_format, research_depth, source_preferences, auto_route')
      .eq('id', agent_column_id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (columnError) {
      console.error('[research-orchestrator] Failed to fetch agent column:', columnError)
      return errorResponse('Failed to fetch agent column', req, 500)
    }

    if (!agentColumn) {
      return errorResponse('Agent column not found or access denied', req, 404)
    }

    const typedColumn = agentColumn as AgentColumn

    // ------------------------------------------------------------------
    // 5. Validate row IDs belong to the table
    // ------------------------------------------------------------------
    const { valid: rowsValid, validRowIds } = await validateRowIds(
      userClient,
      typedColumn.ops_table_id,
      row_ids
    )

    if (!rowsValid) {
      const invalidCount = row_ids.length - validRowIds.length
      console.warn(`[research-orchestrator] ${invalidCount} invalid row IDs provided`)
      // Continue with valid rows only
      if (validRowIds.length === 0) {
        return errorResponse('No valid row IDs found', req, 400)
      }
    }

    // ------------------------------------------------------------------
    // 6. Determine research depth
    // ------------------------------------------------------------------
    const depthLevel = depth_override || typedColumn.research_depth

    // ------------------------------------------------------------------
    // 7. Calculate estimated credits
    // ------------------------------------------------------------------
    const estimatedCredits = calculateEstimatedCredits(depthLevel, validRowIds.length)

    // ------------------------------------------------------------------
    // 8. Check credit balance and reserve credits
    // ------------------------------------------------------------------
    const { hasBalance, currentBalance, message } = await checkAndReserveCredits(
      serviceClient,
      organizationId,
      estimatedCredits
    )

    if (!hasBalance) {
      return jsonResponse(
        {
          error: 'insufficient_credits',
          code: 'INSUFFICIENT_CREDITS',
          message: message || 'Insufficient credits',
          required: estimatedCredits,
          available: currentBalance,
        },
        req,
        402
      )
    }

    // ------------------------------------------------------------------
    // 9. Check concurrency limits
    // ------------------------------------------------------------------
    const inProgressCount = await countInProgressTasks(serviceClient, organizationId)
    if (inProgressCount >= MAX_CONCURRENT_TASKS_PER_USER) {
      return errorResponse(
        `Maximum concurrent tasks reached (${MAX_CONCURRENT_TASKS_PER_USER}). Please wait for existing tasks to complete.`,
        req,
        429
      )
    }

    // ------------------------------------------------------------------
    // 10. Insert agent_run records
    // ------------------------------------------------------------------
    const now = new Date().toISOString()
    const runRecords = validRowIds.map((rowId) => ({
      agent_column_id,
      row_id: rowId,
      status: 'queued',
      depth_level_used: depthLevel,
      created_at: now,
    }))

    // Use upsert to handle duplicate runs (unique constraint on agent_column_id, row_id)
    const { data: insertedRuns, error: insertError } = await serviceClient
      .from('agent_runs')
      .upsert(runRecords, {
        onConflict: 'agent_column_id,row_id',
        ignoreDuplicates: false,
      })
      .select('id, agent_column_id, row_id, status')

    if (insertError) {
      console.error('[research-orchestrator] Failed to insert agent runs:', insertError)
      return errorResponse('Failed to queue research tasks', req, 500)
    }

    const queuedRuns = insertedRuns || []
    const queuedCount = queuedRuns.filter(run => run.status === 'queued').length
    const skippedCount = validRowIds.length - queuedCount

    // Generate a batch run ID (for tracking - you could store this in a separate table)
    const batchRunId = crypto.randomUUID()

    console.log(
      `[research-orchestrator] Queued ${queuedCount} tasks (skipped ${skippedCount} duplicates) for agent column ${typedColumn.name} (depth: ${depthLevel})`
    )

    // ------------------------------------------------------------------
    // 11. Return response immediately
    // ------------------------------------------------------------------
    // NOTE: Credits have been reserved upfront. The research-router will:
    // - Store the actual credit cost in agent_runs.credit_cost as each cell completes
    // - NOT deduct again (credits already reserved here)
    // - Refund unused credits if tasks are canceled
    const response: OrchestrationResponse = {
      run_id: batchRunId,
      total_tasks: validRowIds.length,
      estimated_credits: estimatedCredits,
      credits_reserved: estimatedCredits,
      queued_count: queuedCount,
      skipped_count: skippedCount,
    }

    return jsonResponse(response, req, 200)
  } catch (error) {
    console.error('[research-orchestrator] Unexpected error:', error)
    return errorResponse(
      `Internal server error: ${(error as Error).message}`,
      req,
      500
    )
  }
})
