import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * Fathom Cron Sync Edge Function (v2 - Robust Polling)
 *
 * Purpose: Triggered by pg_cron every 15 minutes as a reliable fallback for webhook failures
 * Processes users in parallel with concurrency limits and a time budget to prevent timeouts.
 *
 * Key features:
 * 1. Gap detection: Compares Fathom API recordings against local meetings
 * 2. Shorter catch-up threshold: 6 hours instead of 36
 * 3. Smart sync type: Based on actual gaps, not just time since last sync
 * 4. Consecutive failure tracking: For alerting on persistent issues
 * 5. Priority queue: Users with gaps get synced first
 * 6. Delta sync: Fetches meeting list, finds missing, syncs in parallel
 * 7. Time budget with graceful early exit
 */

// Configuration
const MAX_CONCURRENCY = 3 // Process 3 users at a time (reduced for stability)
const TIME_BUDGET_MS = 130_000 // 130 seconds - leaves 20s buffer before 150s timeout
const SYNC_TIMEOUT_MS = 60_000 // 60 seconds max per individual user sync (increased from 30s)
const MEETING_BATCH_SIZE = 5 // Process 5 meetings concurrently within a user sync
const SINGLE_MEETING_TIMEOUT_MS = 15_000 // 15 seconds per individual meeting sync

interface IntegrationHealth {
  user_id: string
  error_count: number
  last_successful_sync: Date | null
  has_gaps: boolean
  gap_count: number
  priority_score: number
}

interface SyncDecision {
  sync_type: 'incremental' | 'manual' | 'gap_recovery'
  reason: string
  priority: 'high' | 'normal' | 'low'
}

/**
 * Calculate priority score for sync ordering
 * Higher score = sync first
 */
function calculatePriority(health: Omit<IntegrationHealth, 'priority_score'>): number {
  let score = 0

  // Gaps detected = highest priority
  if (health.has_gaps) score += 100 + (health.gap_count * 10)

  // Consecutive failures increase priority
  score += health.error_count * 20

  // Time since last sync (hours) adds priority
  if (health.last_successful_sync) {
    const hoursSinceSync = (Date.now() - health.last_successful_sync.getTime()) / (1000 * 60 * 60)
    score += Math.min(hoursSinceSync, 48) // Cap at 48 hours
  } else {
    score += 50 // Never synced = high priority
  }

  return score
}

/**
 * Decide sync type based on integration health
 */
function decideSyncType(health: IntegrationHealth): SyncDecision {
  // If gaps detected, do gap recovery (targeted sync)
  if (health.has_gaps && health.gap_count > 0) {
    return {
      sync_type: 'gap_recovery',
      reason: `${health.gap_count} missing meetings detected`,
      priority: 'high'
    }
  }

  // If never synced or very old (>6 hours), do manual (30-day) sync
  if (!health.last_successful_sync) {
    return {
      sync_type: 'manual',
      reason: 'No previous sync recorded',
      priority: 'high'
    }
  }

  const hoursSinceSync = (Date.now() - health.last_successful_sync.getTime()) / (1000 * 60 * 60)

  if (hoursSinceSync > 6) {
    return {
      sync_type: 'manual',
      reason: `Last sync ${hoursSinceSync.toFixed(1)} hours ago (>6h threshold)`,
      priority: 'high'
    }
  }

  // Recent sync, just do incremental
  return {
    sync_type: 'incremental',
    reason: `Regular incremental (last sync ${hoursSinceSync.toFixed(1)}h ago)`,
    priority: 'normal'
  }
}

/**
 * Get valid access token - refresh if needed, mark invalid if refresh fails
 */
async function getValidAccessToken(
  supabase: any,
  integration: any
): Promise<{ token: string | null; error?: string }> {
  const now = new Date()
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : new Date(0)
  const bufferMs = 5 * 60 * 1000 // 5 minutes buffer

  // Token is still valid
  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    console.log(`[fathom-cron-sync] Token still valid for user ${integration.user_id}, expires ${expiresAt.toISOString()}`)
    return { token: integration.access_token }
  }

  // Token expired - try to refresh
  console.log(`[fathom-cron-sync] Token expired for user ${integration.user_id}, attempting refresh`)

  const clientId = Deno.env.get('FATHOM_CLIENT_ID')
  const clientSecret = Deno.env.get('FATHOM_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    return { token: null, error: 'Missing Fathom OAuth configuration' }
  }

  if (!integration.refresh_token) {
    // Mark integration as needing reconnection
    await supabase
      .from('fathom_integrations')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', integration.id)
    return { token: null, error: 'No refresh token - user needs to reconnect Fathom' }
  }

  try {
    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    })

    const tokenResponse = await fetch('https://fathom.video/external/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      // Mark integration as needing reconnection
      await supabase
        .from('fathom_integrations')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', integration.id)
      return { token: null, error: `Token refresh failed (user needs to reconnect): ${errorText}` }
    }

    const tokenData = await tokenResponse.json()
    const expiresIn = tokenData.expires_in || 3600
    const newTokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    await supabase
      .from('fathom_integrations')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || integration.refresh_token,
        token_expires_at: newTokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)

    console.log(`[fathom-cron-sync] Token refreshed for user ${integration.user_id}`)
    return { token: tokenData.access_token }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return { token: null, error: `Token refresh error: ${msg}` }
  }
}

/**
 * Fetch meetings list from Fathom API (lightweight - just IDs and dates)
 */
async function fetchFathomMeetingsList(
  accessToken: string,
  startDate?: string
): Promise<Array<{ recording_id: string; recording_start_time: string; title: string }>> {
  const meetings: Array<{ recording_id: string; recording_start_time: string; title: string }> = []
  let cursor: string | undefined = undefined
  let pageCount = 0
  const maxPages = 20 // Safety limit

  const queryParams = new URLSearchParams()
  queryParams.set('limit', '100')
  if (startDate) {
    queryParams.set('created_after', startDate)
  }

  while (pageCount < maxPages) {
    pageCount++
    const url = cursor
      ? `https://api.fathom.ai/external/v1/meetings?${queryParams.toString()}&cursor=${cursor}`
      : `https://api.fathom.ai/external/v1/meetings?${queryParams.toString()}`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Fathom API error: ${response.status}`)
    }

    const data = await response.json()
    const items = data.items || data.meetings || data.data || []

    for (const item of items) {
      meetings.push({
        recording_id: String(item.recording_id || item.id),
        recording_start_time: item.recording_start_time || item.created_at,
        title: item.title || 'Meeting',
      })
    }

    cursor = data.next_cursor || data.cursor
    if (!cursor) break
  }

  return meetings
}

/**
 * Sync a single meeting by calling fathom-sync with webhook mode
 */
async function syncSingleMeeting(
  serviceRoleKey: string,
  userId: string,
  recordingId: string,
  timeoutMs: number
): Promise<{ success: boolean; error?: string }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const syncUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/fathom-sync`
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sync_type: 'webhook',
        user_id: userId,
        call_id: recordingId,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `${response.status}: ${errorText.substring(0, 100)}` }
    }

    return { success: true }
  } catch (error) {
    clearTimeout(timeoutId)
    const msg = error instanceof Error
      ? (error.name === 'AbortError' ? 'Timed out' : error.message)
      : 'Unknown error'
    return { success: false, error: msg }
  }
}

/**
 * Delta sync: Fetch meeting list, find missing, sync in parallel
 * This is much faster than bulk sync for users with many existing meetings
 */
async function syncUserDelta(
  supabase: any,
  serviceRoleKey: string,
  integration: any,
  timeoutMs: number
): Promise<{
  userId: string
  success: boolean
  syncType: 'delta'
  meetings_synced: number
  meetings_found: number
  meetings_skipped: number
  error?: string
  startDate?: string
}> {
  const userId = integration.user_id as string
  const startTime = Date.now()

  try {
    // 1. Get valid token (refresh if needed)
    console.log(`[fathom-cron-sync] User ${userId}: Starting delta sync`)
    const tokenResult = await getValidAccessToken(supabase, integration)
    if (!tokenResult.token) {
      return {
        userId,
        success: false,
        syncType: 'delta',
        meetings_synced: 0,
        meetings_found: 0,
        meetings_skipped: 0,
        error: tokenResult.error || 'Failed to get valid token',
      }
    }
    const accessToken = tokenResult.token

    // 2. Find the most recent meeting date as baseline
    const { data: lastMeeting } = await supabase
      .from('meetings')
      .select('meeting_start')
      .eq('owner_user_id', userId)
      .not('meeting_start', 'is', null)
      .order('meeting_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    let startDate: string | undefined = undefined
    if (lastMeeting?.meeting_start) {
      // Start from 1 day before last meeting
      const lastDate = new Date(lastMeeting.meeting_start)
      startDate = new Date(lastDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
    } else {
      // No meetings - use last 30 days
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    }
    console.log(`[fathom-cron-sync] User ${userId}: Fetching meetings since ${startDate}`)

    // 3. Fetch meetings list from Fathom API
    const fathomMeetings = await fetchFathomMeetingsList(accessToken, startDate)
    console.log(`[fathom-cron-sync] User ${userId}: Found ${fathomMeetings.length} meetings in Fathom`)

    if (fathomMeetings.length === 0) {
      return {
        userId,
        success: true,
        syncType: 'delta',
        meetings_synced: 0,
        meetings_found: 0,
        meetings_skipped: 0,
        startDate,
      }
    }

    // 4. Get existing meeting IDs from database
    const recordingIds = fathomMeetings.map(m => m.recording_id)
    const { data: existingMeetings } = await supabase
      .from('meetings')
      .select('fathom_recording_id')
      .eq('owner_user_id', userId)
      .in('fathom_recording_id', recordingIds)

    const existingIds = new Set((existingMeetings || []).map((m: any) => m.fathom_recording_id))
    const missingMeetings = fathomMeetings.filter(m => !existingIds.has(m.recording_id))

    console.log(`[fathom-cron-sync] User ${userId}: ${missingMeetings.length} missing meetings to sync`)

    if (missingMeetings.length === 0) {
      return {
        userId,
        success: true,
        syncType: 'delta',
        meetings_synced: 0,
        meetings_found: fathomMeetings.length,
        meetings_skipped: 0,
        startDate,
      }
    }

    // 5. Sync missing meetings in parallel batches
    let synced = 0
    let skipped = 0

    for (let i = 0; i < missingMeetings.length; i += MEETING_BATCH_SIZE) {
      // Check time budget
      const elapsed = Date.now() - startTime
      if (elapsed > timeoutMs - 5000) {
        console.log(`[fathom-cron-sync] User ${userId}: Time budget exceeded, skipping remaining meetings`)
        skipped = missingMeetings.length - i
        break
      }

      const batch = missingMeetings.slice(i, i + MEETING_BATCH_SIZE)
      console.log(`[fathom-cron-sync] User ${userId}: Syncing batch ${Math.floor(i / MEETING_BATCH_SIZE) + 1} (${batch.length} meetings)`)

      // Process batch in parallel
      const results = await Promise.all(
        batch.map(meeting =>
          syncSingleMeeting(serviceRoleKey, userId, meeting.recording_id, SINGLE_MEETING_TIMEOUT_MS)
        )
      )

      synced += results.filter(r => r.success).length
    }

    console.log(`[fathom-cron-sync] User ${userId}: Delta sync complete - ${synced}/${missingMeetings.length} synced, ${skipped} skipped`)

    return {
      userId,
      success: true,
      syncType: 'delta',
      meetings_synced: synced,
      meetings_found: fathomMeetings.length,
      meetings_skipped: skipped,
      startDate,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[fathom-cron-sync] User ${userId}: Delta sync error - ${msg}`)
    return {
      userId,
      success: false,
      syncType: 'delta',
      meetings_synced: 0,
      meetings_found: 0,
      meetings_skipped: 0,
      error: msg,
    }
  }
}

/**
 * Process a single user sync with timeout
 * Uses DELTA SYNC: fetches meeting list, finds missing, syncs in parallel
 * This is much faster than bulk sync for users with many existing meetings
 */
async function syncUserWithTimeout(
  supabase: any,
  serviceRoleKey: string,
  integration: any,
  timeoutMs: number
): Promise<{
  userId: string
  success: boolean
  syncType: 'delta' | 'incremental' | 'manual'
  syncResult?: any
  error?: string
  startDate?: string
}> {
  const userId = integration.user_id as string

  // Use delta sync - it's faster for users with many existing meetings
  // because it only syncs missing meetings in parallel
  const deltaResult = await syncUserDelta(supabase, serviceRoleKey, integration, timeoutMs)

  if (deltaResult.success) {
    return {
      userId,
      success: true,
      syncType: 'delta',
      syncResult: {
        meetings_synced: deltaResult.meetings_synced,
        total_meetings_found: deltaResult.meetings_found,
        meetings_skipped: deltaResult.meetings_skipped,
      },
      startDate: deltaResult.startDate,
    }
  }

  // Delta sync failed - return the error
  return {
    userId,
    success: false,
    syncType: 'delta',
    error: deltaResult.error,
    startDate: deltaResult.startDate,
  }
}

/**
 * Process a batch of users in parallel
 */
async function processBatch(
  supabase: any,
  serviceRoleKey: string,
  batch: any[],
  timeoutMs: number
): Promise<Array<{
  userId: string
  success: boolean
  syncType: 'delta' | 'incremental' | 'manual'
  syncResult?: any
  error?: string
  startDate?: string
}>> {
  const promises = batch.map(integration =>
    syncUserWithTimeout(supabase, serviceRoleKey, integration, timeoutMs)
  )
  return Promise.all(promises)
}

serve(async (req) => {
  const startTime = Date.now()

  try {
    // Authorize request as service-role
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const authHeader = (req.headers.get('Authorization') ?? '').trim()
    const providedToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : ''

    if (!supabaseUrl || !providedToken) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Cron jobs must use service role key' }),
        { status: 401 }
      )
    }

    const supabase = createClient(
      supabaseUrl,
      providedToken,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    )

    // Admin-only probe to confirm this token is service role
    const { error: adminProbeError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (adminProbeError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Cron jobs must use service role key' }),
        { status: 401 }
      )
    }

    const serviceRoleKey = providedToken

    // Fetch all active user integrations (need full token data for delta sync)
    const { data: userIntegrations, error: userIntegrationsError } = await supabase
      .from('fathom_integrations')
      .select('id, user_id, fathom_user_email, token_expires_at, access_token, refresh_token')
      .eq('is_active', true)

    if (userIntegrationsError) {
      throw new Error(`Failed to fetch user integrations: ${userIntegrationsError.message}`)
    }

    const hasUserIntegrations = !!userIntegrations && userIntegrations.length > 0

    const results = {
      mode: 'user' as const,
      version: 'v2-robust',
      run_duration_ms: 0,
      total: hasUserIntegrations ? userIntegrations.length : 0,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0, // Users skipped due to time budget
      gaps_detected: 0,
      gaps_recovered: 0,
      details: [] as Array<{
        id: string
        sync_type: string
        start_date?: string
        sync_reason?: string
        priority?: string
        meetings_synced: number
        total_meetings_found: number
        meetings_skipped?: number
        gaps_found?: number
        errors_count: number
        errors_sample?: Array<{ call_id: string; error: string }>
        db_meetings_total?: number
        db_meetings_last_90d?: number
        error_count?: number
      }>,
      errors: [] as Array<{ id: string; error: string }>,
      timing: {
        total_ms: 0,
        avg_per_user_ms: 0,
      },
    }

    if (!hasUserIntegrations) {
      await logCronRun(supabase, 'fathom_cron_sync_v2', 'success', 'No active integrations', results)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active Fathom user integrations',
          results: { ...results, total: 0 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[fathom-cron-sync-v2] Processing ${userIntegrations.length} user integrations (max ${MAX_CONCURRENCY} concurrent)`)

    // Split into batches for parallel processing with time budget
    let batchIndex = 0
    const batches: any[][] = []

    // Split into batches
    for (let i = 0; i < userIntegrations.length; i += MAX_CONCURRENCY) {
      batches.push(userIntegrations.slice(i, i + MAX_CONCURRENCY))
    }

    console.log(`[fathom-cron-sync-v2] Split into ${batches.length} batches of up to ${MAX_CONCURRENCY} users`)

    // Process batches until time budget is exhausted
    for (const batch of batches) {
      const elapsed = Date.now() - startTime
      const remaining = TIME_BUDGET_MS - elapsed

      // Check if we have enough time for another batch
      if (remaining < SYNC_TIMEOUT_MS) {
        console.log(`[fathom-cron-sync-v2] Time budget exhausted (${elapsed}ms elapsed). Skipping remaining ${userIntegrations.length - results.processed} users.`)
        results.skipped = userIntegrations.length - results.processed
        break
      }

      console.log(`[fathom-cron-sync-v2] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} users, ${remaining}ms remaining)`)

      // Process batch in parallel using delta sync
      const batchResults = await processBatch(supabase, serviceRoleKey, batch, Math.min(SYNC_TIMEOUT_MS, remaining))

      // Process results
      for (const result of batchResults) {
        results.processed++

        if (result.success && result.syncResult) {
          results.successful++
          results.details.push({
            id: result.userId,
            sync_type: result.syncType,
            start_date: result.startDate || 'default',
            meetings_synced: Number(result.syncResult.meetings_synced || 0),
            total_meetings_found: Number(result.syncResult.total_meetings_found || 0),
            meetings_skipped: Number(result.syncResult.meetings_skipped || 0),
            errors_count: Array.isArray(result.syncResult.errors) ? result.syncResult.errors.length : 0,
            errors_sample: Array.isArray(result.syncResult.errors) ? result.syncResult.errors.slice(0, 3) : undefined,
          })

          // Log success (non-fatal if logging fails)
          try {
            await supabase.from('cron_job_logs').insert({
              job_name: 'fathom_cron_sync_v2',
              user_id: result.userId,
              status: 'success',
              message: `[delta] Synced ${result.syncResult.meetings_synced || 0} meetings`,
            })
          } catch {
            // Ignore logging errors
          }
        } else {
          results.failed++
          results.errors.push({ id: result.userId, error: result.error || 'Unknown error' })

          // Log error (non-fatal if logging fails)
          try {
            await supabase.from('cron_job_logs').insert({
              job_name: 'fathom_cron_sync_v2',
              user_id: result.userId,
              status: 'error',
              message: 'Sync failed',
              error_details: result.error || 'Unknown error',
            })
          } catch {
            // Ignore logging errors
          }
        }
      }

      batchIndex++
    }

    // Calculate timing stats
    results.run_duration_ms = Date.now() - startTime
    results.timing.total_ms = Date.now() - startTime
    results.timing.avg_per_user_ms = results.processed > 0
      ? Math.round(results.timing.total_ms / results.processed)
      : 0

    console.log(`[fathom-cron-sync-v2] Complete: ${results.successful} success, ${results.failed} failed, ${results.skipped} skipped in ${results.timing.total_ms}ms`)

    await logCronRun(supabase, 'fathom_cron_sync_v2', 'success',
      `Processed ${results.total} integrations: ${results.successful} ok, ${results.failed} failed, ${results.skipped} skipped`,
      results)

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[fathom-cron-sync-v2] Fatal error: ${errorMessage}`)

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        run_duration_ms: Date.now() - startTime,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
})

/**
 * Log overall cron run for monitoring
 */
async function logCronRun(
  supabase: any,
  jobName: string,
  status: 'success' | 'error',
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('cron_job_logs').insert({
      job_name: jobName,
      status,
      message,
      error_details: status === 'error' ? JSON.stringify(metadata) : null,
    })
  } catch (e) {
    console.error(`[fathom-cron-sync-v2] Failed to log cron run: ${e}`)
  }
}
