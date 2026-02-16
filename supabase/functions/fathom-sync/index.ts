import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"
import { captureException } from '../_shared/sentryEdge.ts'
import { matchOrCreateCompany } from '../_shared/companyMatching.ts'
import { selectPrimaryContact, determineMeetingCompany } from '../_shared/primaryContactSelection.ts'

// Import refactored services
import {
  // Owner Resolution
  resolveMeetingOwner,
  // Participants
  processParticipants,
  extractAndTruncateSummary,
  // Action Items
  processActionItems,
  // Helpers
  buildEmbedUrl,
  normalizeInviteesType,
  calculateTranscriptFetchCooldownMinutes,
  generatePlaceholderThumbnail,
  retryWithBackoff,
  corsHeaders,
  getDefaultDateRange,
  // Meeting Upsert
  getExistingThumbnail,
  upsertMeeting,
  seedOrgCallTypesIfNeeded,
  enqueueTranscriptRetry,
  // Transcript Processing
  condenseMeetingSummary,
  autoFetchTranscriptAndAnalyze,
} from './services/index.ts'

// Helper for logging sync operations to integration_sync_logs table
async function logSyncOperation(
  supabase: any,
  args: {
    orgId?: string | null
    userId?: string | null
    operation: 'sync' | 'create' | 'update' | 'delete' | 'push' | 'pull' | 'webhook' | 'error'
    direction: 'inbound' | 'outbound'
    entityType: string
    entityId?: string | null
    entityName?: string | null
    status?: 'success' | 'failed' | 'skipped'
    errorMessage?: string | null
    metadata?: Record<string, unknown>
    batchId?: string | null
  }
): Promise<void> {
  try {
    await supabase.rpc('log_integration_sync', {
      p_org_id: args.orgId ?? null,
      p_user_id: args.userId ?? null,
      p_integration_name: 'fathom',
      p_operation: args.operation,
      p_direction: args.direction,
      p_entity_type: args.entityType,
      p_entity_id: args.entityId ?? null,
      p_entity_name: args.entityName ?? null,
      p_status: args.status ?? 'success',
      p_error_message: args.errorMessage ?? null,
      p_metadata: args.metadata ?? {},
      p_batch_id: args.batchId ?? null,
    })
  } catch (e) {
    // Non-fatal: log to console but don't fail the sync
    console.error('[fathom-sync] Failed to log sync operation:', e)
  }
}

/**
 * Fathom Sync Engine Edge Function
 *
 * Purpose: Sync meetings from Fathom API to CRM database
 * Sync Types:
 *   - initial: User-initiated with custom date range
 *   - incremental: Hourly cron job (last 24h)
 *   - manual: User-triggered refresh (last 30 days)
 *   - all_time: Complete historical sync (all meetings ever)
 *   - webhook: Immediate sync on webhook notification
 */

interface SyncRequest {
  sync_type: 'initial' | 'incremental' | 'manual' | 'webhook' | 'all_time' | 'onboarding_fast' | 'onboarding_background'
  start_date?: string // ISO 8601
  end_date?: string
  call_id?: string // For webhook-triggered single call sync
  user_id?: string // For webhook calls that explicitly pass user ID
  org_id?: string // Org-scoped sync (preferred)
  limit?: number // Optional limit for test syncs (e.g., only sync last 5 calls)
  webhook_payload?: any // For webhook calls that pass the complete Fathom payload
  skip_thumbnails?: boolean // Skip thumbnail generation for faster syncs
  is_onboarding?: boolean // Flag to mark meetings as historical imports
}

interface MeetingLimits {
  is_free_tier: boolean
  max_meetings_per_month: number
  new_meetings_used: number
  historical_meetings: number
  total_meetings: number
  meetings_remaining: number
  can_sync_new: boolean
  historical_cutoff_date: string | null
}

interface FathomCall {
  id: string
  recording_id?: string | number // Alternative ID field from Fathom API
  title: string
  start_time: string
  end_time: string
  duration: number
  host_email: string
  host_name: string
  share_url: string
  app_url: string
  transcript_url?: string
  ai_summary?: {
    text: string
    key_points?: string[]
  }
  participants?: Array<{
    name: string
    email?: string
    is_host: boolean
  }>
  recording_status: 'processing' | 'ready' | 'failed'
}

interface FathomAnalytics {
  call_id: string
  sentiment?: {
    score: number
    label: 'positive' | 'neutral' | 'negative'
  }
  talk_time_analysis?: {
    rep_percentage: number
    customer_percentage: number
  }
  key_moments?: Array<{
    timestamp: number
    description: string
    type: 'question' | 'objection' | 'next_step' | 'highlight'
  }>
}

/**
 * Helper: Refresh OAuth access token if expired
 */
async function refreshAccessToken(
  supabase: any,
  integration: any,
  scope: 'org' | 'user'
): Promise<string> {
  const now = new Date()
  const expiresAt = new Date(integration.token_expires_at)

  // Check if token is expired or will expire within 5 minutes
  const bufferMs = 5 * 60 * 1000 // 5 minutes buffer
  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    // Token is still valid
    return integration.access_token
  }
  // Get OAuth configuration
  const clientId = Deno.env.get('FATHOM_CLIENT_ID')
  const clientSecret = Deno.env.get('FATHOM_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('Missing Fathom OAuth configuration for token refresh')
  }

  // Exchange refresh token for new access token
  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: integration.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const tokenResponse = await fetch('https://fathom.video/external/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString(),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Token refresh failed: ${errorText}. Please reconnect your Fathom integration.`)
  }

  const tokenData = await tokenResponse.json()
  // Calculate new token expiry
  const expiresIn = tokenData.expires_in || 3600 // Default 1 hour
  const newTokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Update tokens in database
  const updatePayload = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || integration.refresh_token, // Some OAuth providers don't issue new refresh tokens
    token_expires_at: newTokenExpiresAt,
    updated_at: new Date().toISOString(),
  }

  const updateQuery =
    scope === 'org'
      ? supabase.from('fathom_org_credentials').update(updatePayload).eq('org_id', integration.org_id)
      : supabase.from('fathom_integrations').update(updatePayload).eq('id', integration.id)

  const { error: updateError } = await updateQuery

  if (updateError) {
    throw new Error(`Failed to update refreshed tokens: ${updateError.message}`)
  }
  return tokenData.access_token
}

/**
 * Helper: Check meeting limits for an organization
 * Returns limit info and whether sync is allowed
 */
async function checkMeetingLimits(supabase: any, orgId: string): Promise<MeetingLimits | null> {
  try {
    const { data, error } = await supabase.rpc('check_meeting_limits', { p_org_id: orgId })
    
    if (error) {
      console.error('[fathom-sync] Error checking meeting limits:', error)
      return null
    }
    
    if (!data || data.length === 0) {
      // No subscription found - treat as free tier with defaults
      return {
        is_free_tier: true,
        max_meetings_per_month: 15,
        new_meetings_used: 0,
        historical_meetings: 0,
        total_meetings: 0,
        meetings_remaining: 15,
        can_sync_new: true,
        historical_cutoff_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }
    }
    
    return data[0] as MeetingLimits
  } catch (err) {
    console.error('[fathom-sync] Exception checking meeting limits:', err)
    return null
  }
}

/**
 * Helper: Enforce free tier date limit
 * Returns adjusted start date for free tier users
 */
function enforceFreeTierDateLimit(
  requestedStartDate: string | undefined,
  limits: MeetingLimits | null,
  syncType: string
): { startDate: string | undefined; upgradeRequired: boolean; reason?: string } {
  // Skip limit enforcement for paid users
  if (!limits?.is_free_tier) {
    return { startDate: requestedStartDate, upgradeRequired: false }
  }
  
  // Calculate 30 days ago
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  
  // If no start date specified, use defaults based on sync type
  if (!requestedStartDate) {
    // For most sync types, default to 30 days
    return { 
      startDate: thirtyDaysAgo.toISOString(), 
      upgradeRequired: false 
    }
  }
  
  // Check if requested date is older than 30 days
  const requestedDate = new Date(requestedStartDate)
  if (requestedDate < thirtyDaysAgo) {
    console.log(`[fathom-sync] Free tier: Requested ${requestedStartDate} but limiting to ${thirtyDaysAgo.toISOString()}`)
    return {
      startDate: thirtyDaysAgo.toISOString(),
      upgradeRequired: true,
      reason: 'Free tier is limited to meetings from the last 30 days. Upgrade to access your full history.',
    }
  }
  
  return { startDate: requestedStartDate, upgradeRequired: false }
}

// buildEmbedUrl and normalizeInviteesType are now imported from ./services/helpers.ts

/**
 * Helper: Generate video thumbnail by calling the thumbnail generation service
 */
async function generateVideoThumbnail(
  recordingId: string | number,
  shareUrl: string,
  embedUrl: string,
  meetingId?: string
): Promise<string | null> {
  try {
    const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-video-thumbnail-v2`
    const requestBody: any = {
      recording_id: String(recordingId),
      share_url: shareUrl,
      fathom_embed_url: embedUrl,
    }
    
    // Include meeting_id if available so thumbnail can be persisted to database
    if (meetingId) {
      requestBody.meeting_id = meetingId
    }
    
    // Use ANON key for internal edge function calls - the thumbnail function doesn't require
    // elevated permissions and the service role key may not work for cross-function calls.
    // The thumbnail function uses its own service role key for database updates.
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Thumbnail generation failed (status ${response.status}):`, errorText.substring(0, 200))
      return null
    }

    const data = await response.json()

    if (data.success && data.thumbnail_url) {
      return data.thumbnail_url
    }
    
    console.warn(`⚠️  Thumbnail generation returned unsuccessful response:`, data)
    return null
  } catch (error) {
    console.error(`❌ Error calling thumbnail generation function:`, error instanceof Error ? error.message : String(error))
    return null
  }
}

/**
 * Helper: Fetch summary text for a recording when not present in bulk payload
 */
async function fetchRecordingSummary(apiKey: string, recordingId: string | number): Promise<string | null> {
  const url = `https://api.fathom.ai/external/v1/recordings/${recordingId}/summary`
  const resp = await fetch(url, { headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' } })
  if (!resp.ok) return null
  const data = await resp.json().catch(() => null)
  // Prefer markdown if present; otherwise look for plain text
  const md = data?.summary?.markdown_formatted || data?.summary?.markdown || null
  const txt = data?.summary?.text || null
  return md || txt
}

/**
 * Helper: Fetch transcript plaintext when needed (optional)
 */
async function fetchRecordingTranscriptPlaintext(apiKey: string, recordingId: string | number): Promise<string | null> {
  const url = `https://api.fathom.ai/external/v1/recordings/${recordingId}/transcript`
  const resp = await fetch(url, { headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' } })
  if (!resp.ok) return null
  const data = await resp.json().catch(() => null)
  if (!data) return null
  // If the API returns an array of transcript lines, join them into plaintext
  if (Array.isArray(data.transcript)) {
    const lines = data.transcript.map((t: any) => {
      const speaker = t?.speaker?.display_name ? `${t.speaker.display_name}: ` : ''
      const text = t?.text || ''
      return `${speaker}${text}`.trim()
    })
    return lines.join('\n')
  }
  return typeof data === 'string' ? data : null
}

/**
 * Helper: Fetch full recording details including action items
 * Action items are not included in the bulk meetings API response
 * We must fetch the full recording details to get action items
 */
async function fetchRecordingActionItems(apiKey: string, recordingId: string | number): Promise<any[] | null> {
  // Use the full recording details endpoint, not the separate action_items endpoint
  const url = `https://api.fathom.ai/external/v1/recordings/${recordingId}`
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  })

  if (!resp.ok) {
    // Try with X-Api-Key header instead
    const resp2 = await fetch(url, {
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    })

    if (!resp2.ok) {
      return null
    }
    const data = await resp2.json().catch((err) => {
      return null
    })

    // Log the actual response for debugging
    if (data?.action_items !== undefined) {
    }

    if (data?.action_items && Array.isArray(data.action_items)) {
      return data.action_items
    }
    return null
  }
  const data = await resp.json().catch((err) => {
    return null
  })

  // Log the actual response for debugging
  if (data?.action_items !== undefined) {
  }

  if (data?.action_items && Array.isArray(data.action_items)) {
    return data.action_items
  }
  return null
}

async function createGoogleDocForTranscript(supabase: any, userId: string, meetingId: string, title: string, plaintext: string): Promise<string | null> {
  try {
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-docs-create`
    // Create a service role client to mint a short-lived user JWT by calling auth API
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Create a JWT for the user via admin API (if available) or fetch session from DB
    // Fallback: use service role header; function uses Authorization header to lookup user via getUser(jwt)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title || 'Meeting Transcript',
        content: plaintext,
        metadata: { meetingId },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return null
    }

    const data = await response.json()
    return data?.url || null
  } catch (e) {
    return null
  }
}

serve(async (req) => {
  // For error handling: capture which sync state row to update
  let syncStateOrgId: string | null = null
  let syncStateUserId: string | null = null
  let syncStateScope: 'org' | 'user' | null = null

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    )

    // Parse request body first
    const body: SyncRequest = await req.json()

    // Determine caller context
    const authHeaderRaw = req.headers.get('Authorization')?.trim() || ''
    const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

    const bearerToken =
      authHeaderRaw.toLowerCase().startsWith('bearer ')
        ? authHeaderRaw.slice('Bearer '.length).trim()
        : ''

    // IMPORTANT:
    // Supabase service-role keys can be stored/represented in different formats (JWT vs `sb_secret_*`)
    // and env UIs sometimes introduce whitespace. Relying on a strict string match can break internal
    // calls (cron/webhooks) and cause "Unauthorized: Invalid token" errors when we incorrectly treat
    // service-role calls as end-user calls.
    //
    // We first try the fast path (exact match to env key). If that fails, we verify service-role by
    // probing an admin-only endpoint using the provided Bearer token.
    let isServiceRoleCall = !!serviceRoleKey && !!bearerToken && bearerToken === serviceRoleKey

    if (!isServiceRoleCall && bearerToken && supabaseUrl) {
      try {
        const probe = createClient(supabaseUrl, bearerToken, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const { error: probeError } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 })
        if (!probeError) isServiceRoleCall = true
      } catch {
        // ignore probe failures; treat as non-service-role
      }
    }

    // Resolve org/user from body and/or auth
    let userId: string | null = null
    let orgId: string | null = body.org_id || null

    if (body.user_id) {
      // SECURITY: only internal callers (service role) may specify user_id explicitly.
      if (!isServiceRoleCall) throw new Error('Unauthorized: user_id can only be provided by internal callers')
      userId = body.user_id

      // Legacy: if org_id isn't provided, use first org membership
      if (!orgId) {
        const { data: membership } = await supabase
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        orgId = membership?.org_id || null
      }
    } else if (orgId && isServiceRoleCall) {
      // Internal org-scoped call (preferred for webhook/cron). No user context required.
      userId = null
    } else {
      // Regular authenticated call
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        throw new Error('Missing authorization header')
      }

      // Get user from token
      const token = authHeader.replace('Bearer ', '').trim()
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)

      if (userError || !user) {
        throw new Error('Unauthorized: Invalid token')
      }

      userId = user.id

      // If org_id isn't provided, use first membership. If it is provided, enforce membership.
      if (!orgId) {
        const { data: membership } = await supabase
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        orgId = membership?.org_id || null
      } else {
        const { data: membership } = await supabase
          .from('organization_memberships')
          .select('org_id')
          .eq('org_id', orgId)
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle()
        if (!membership) throw new Error('Forbidden: You are not a member of this organization')
      }
    }
    const { sync_type, start_date, end_date, call_id, limit, webhook_payload, skip_thumbnails } = body

    // Load integration (per-user is PRIMARY - each user connects their own Fathom account)
    // Fathom OAuth tokens only grant access to recordings owned by the authenticated user
    let integration: any = null
    let integrationScope: 'org' | 'user' = 'user'

    // Per-user integration (PRIMARY approach)
    if (userId) {
      const { data: userIntegration, error: integrationError } = await supabase
        .from('fathom_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()

      if (integrationError) {
        throw new Error(`Fathom integration error: ${integrationError.message}`)
      }

      if (userIntegration) {
        integration = { ...userIntegration, _scope: 'user' }
        integrationScope = 'user'
      }
    }

    // Fallback to org-scoped integration (for backwards compatibility during transition)
    if (!integration && orgId) {
      const { data: orgIntegration, error: orgIntegrationError } = await supabase
        .from('fathom_org_integrations')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .maybeSingle()

      if (!orgIntegrationError && orgIntegration) {
        const { data: creds, error: credsError } = await supabase
          .from('fathom_org_credentials')
          .select('*')
          .eq('org_id', orgId)
          .maybeSingle()

        if (creds) {
          integration = {
            ...orgIntegration,
            ...creds,
            org_id: orgId,
            _scope: 'org',
          }
          integrationScope = 'org'
          console.log(`[fathom-sync] Using org-scoped fallback for user ${userId}. Consider connecting Fathom directly.`)
        }
      }
    }

    if (!integration) {
      throw new Error('No active Fathom integration found. Please connect Fathom in Integrations.')
    }

    const effectiveUserIdForOwnership =
      userId || integration.connected_by_user_id || integration.user_id || null

    // Capture for error-state updates
    syncStateOrgId = orgId
    syncStateUserId = userId
    syncStateScope = integrationScope

    console.log(`[fathom-sync] scope=${integrationScope} org_id=${orgId || 'null'} user_id=${userId || 'null'}`)

    // ========================================================================
    // FREE TIER ENFORCEMENT: Check meeting limits before syncing
    // ========================================================================
    let meetingLimits: MeetingLimits | null = null
    let upgradeRequired = false
    let limitWarning: string | undefined
    const isOnboardingSync = sync_type === 'onboarding_fast' || sync_type === 'onboarding_background' || body.is_onboarding
    
    if (orgId) {
      meetingLimits = await checkMeetingLimits(supabase, orgId)
      
      if (meetingLimits) {
        console.log(`[fathom-sync] Meeting limits for org ${orgId}:`, {
          is_free_tier: meetingLimits.is_free_tier,
          new_meetings_used: meetingLimits.new_meetings_used,
          max_meetings: meetingLimits.max_meetings_per_month,
          can_sync_new: meetingLimits.can_sync_new,
          meetings_remaining: meetingLimits.meetings_remaining,
        })
        
        // Check if free tier can sync new meetings (skip for onboarding syncs which are historical)
        if (meetingLimits.is_free_tier && !meetingLimits.can_sync_new && !isOnboardingSync) {
          // Return early with upgrade required response
          return new Response(
            JSON.stringify({
              success: false,
              upgrade_required: true,
              error: `You've reached your free tier limit of ${meetingLimits.max_meetings_per_month} meetings. Upgrade to sync more meetings.`,
              limits: {
                used: meetingLimits.new_meetings_used,
                max: meetingLimits.max_meetings_per_month,
                remaining: 0,
              },
            }),
            {
              status: 402, // Payment Required
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
      }
    }

    // Check for stale sync state and auto-reset before starting new sync
    // Edge functions can timeout (60s limit) leaving sync_status stuck at 'syncing'
    const STALE_SYNC_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes
    if (integrationScope === 'org' && orgId) {
      const { data: currentState } = await supabase
        .from('fathom_org_sync_state')
        .select('sync_status, last_sync_started_at')
        .eq('org_id', orgId)
        .maybeSingle()
      if (currentState?.sync_status === 'syncing' && currentState.last_sync_started_at) {
        const staleDuration = Date.now() - new Date(currentState.last_sync_started_at).getTime()
        if (staleDuration > STALE_SYNC_THRESHOLD_MS) {
          console.warn(`⚠️  Resetting stale org sync state (stuck for ${Math.round(staleDuration / 60000)}min)`)
        } else {
          console.log(`⏳ Sync already in progress for org (started ${Math.round(staleDuration / 1000)}s ago), skipping`)
          return new Response(
            JSON.stringify({ success: false, error: 'Sync already in progress', retry_after_seconds: Math.ceil((STALE_SYNC_THRESHOLD_MS - staleDuration) / 1000) }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    } else if (userId) {
      const { data: currentState } = await supabase
        .from('fathom_sync_state')
        .select('sync_status, last_sync_started_at')
        .eq('user_id', userId)
        .maybeSingle()
      if (currentState?.sync_status === 'syncing' && currentState.last_sync_started_at) {
        const staleDuration = Date.now() - new Date(currentState.last_sync_started_at).getTime()
        if (staleDuration > STALE_SYNC_THRESHOLD_MS) {
          console.warn(`⚠️  Resetting stale user sync state (stuck for ${Math.round(staleDuration / 60000)}min)`)
        } else {
          console.log(`⏳ Sync already in progress for user (started ${Math.round(staleDuration / 1000)}s ago), skipping`)
          return new Response(
            JSON.stringify({ success: false, error: 'Sync already in progress', retry_after_seconds: Math.ceil((STALE_SYNC_THRESHOLD_MS - staleDuration) / 1000) }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // Update sync state to 'syncing'
    if (integrationScope === 'org') {
      await supabase
        .from('fathom_org_sync_state')
        .upsert({
          org_id: orgId,
          integration_id: integration.id,
          sync_status: 'syncing',
          last_sync_started_at: new Date().toISOString(),
        }, { onConflict: 'org_id' })
    } else if (userId) {
      await supabase
        .from('fathom_sync_state')
        .upsert({
          user_id: userId,
          integration_id: integration.id,
          sync_status: 'syncing',
          last_sync_started_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
    }

    let meetingsSynced = 0
    let meetingsSkipped = 0
    let totalMeetingsFound = 0
    const errors: Array<{ call_id: string; error: string }> = []
    let bulkSyncFastMode = false // Track if fast mode was used for bulk sync

    // Single call sync (webhook-triggered)
    if (sync_type === 'webhook') {
      // If webhook_payload is provided, use it directly
      if (webhook_payload) {
        // Webhook syncs are for new meetings (not historical)
        // DO NOT skip transcript fetch for webhooks - we want full processing for single meetings
        if (!effectiveUserIdForOwnership) throw new Error('Cannot resolve user context for webhook sync')
        const result = await syncSingleCall(
          supabase,
          effectiveUserIdForOwnership,
          orgId,
          integration,
          webhook_payload,
          skip_thumbnails ?? false, // skipThumbnails
          false, // markAsHistorical
          false, // skipTranscriptFetch - process transcripts immediately for webhooks
          true // isWebhookSync - always process webhooks
        )

        if (result.success) {
          meetingsSynced = 1
          totalMeetingsFound = 1
        } else {
          const recordingId = webhook_payload.recording_id || webhook_payload.id || 'unknown'
          errors.push({ call_id: recordingId, error: result.error || 'Unknown error' })
        }
      } else if (call_id) {
        // Legacy: fetch single call by ID (not historical)
        if (!effectiveUserIdForOwnership) throw new Error('Cannot resolve user context for webhook sync')
        const result = await syncSingleCall(
          supabase,
          effectiveUserIdForOwnership,
          orgId,
          integration,
          call_id,
          skip_thumbnails ?? false, // skipThumbnails
          false, // markAsHistorical
          false, // skipTranscriptFetch - process transcripts immediately
          true // isWebhookSync - always process webhooks
        )

        if (result.success) {
          meetingsSynced = 1
          totalMeetingsFound = 1
        } else {
          errors.push({ call_id, error: result.error || 'Unknown error' })
        }
      } else {
        errors.push({ call_id: 'unknown', error: 'Webhook sync requires either webhook_payload or call_id' })
      }
    } else {
      // Bulk sync (initial, incremental, manual, onboarding_fast, onboarding_background)
      let apiStartDate = start_date
      let apiEndDate = end_date
      let syncLimit = limit

      // For onboarding syncs, set specific behaviors
      const isOnboardingFast = sync_type === 'onboarding_fast'
      const isOnboardingBackground = sync_type === 'onboarding_background'
      const markAsHistorical = isOnboardingFast || isOnboardingBackground || body.is_onboarding

      // Determine if we should allow re-syncing existing meetings
      // - Incremental: false (only fetch new meetings, skip existing)
      // - Date-range syncs: true (user explicitly requested that period, may want updates)
      const allowResync = sync_type !== 'incremental'
      console.log(`🔄 Sync mode: ${sync_type}, allowResync: ${allowResync}`)

      // Default date ranges based on sync type
      if (!apiStartDate) {
        const now = new Date()
        switch (sync_type) {
          case 'incremental':
            // SMART INCREMENTAL: Fetch only meetings newer than our most recent synced meeting
            // This avoids fetching and processing meetings we already have
            if (orgId) {
              const { data: mostRecentMeeting } = await supabase
                .from('meetings')
                .select('meeting_start, title')
                .eq('org_id', orgId)
                .order('meeting_start', { ascending: false })
                .limit(1)
                .maybeSingle()

              if (mostRecentMeeting) {
                // Start from the most recent meeting we have (add 1 second to avoid duplicate)
                const mostRecentDate = new Date(mostRecentMeeting.meeting_start)
                apiStartDate = new Date(mostRecentDate.getTime() + 1000).toISOString()
                console.log(`📅 Incremental sync: fetching meetings after ${apiStartDate} (most recent: ${mostRecentMeeting.title})`)
              } else {
                // No meetings yet - fall back to last 24 hours
                apiStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
                console.log(`📅 Incremental sync: no existing meetings, fetching last 24 hours`)
              }
            } else {
              // No org context - fall back to last 24 hours
              apiStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
            }
            apiEndDate = now.toISOString()
            break
          case 'all_time':
            // All time - BUT enforce free tier limit
            if (meetingLimits?.is_free_tier) {
              // Free tier: limit to 30 days
              apiStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
              upgradeRequired = true
              limitWarning = 'Free tier is limited to meetings from the last 30 days. Upgrade to access your full history.'
            } else {
              apiStartDate = undefined
            }
            apiEndDate = now.toISOString()
            break
          case 'onboarding_fast':
            // Phase 1: 9 most recent meetings for instant value with full processing
            apiStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
            apiEndDate = now.toISOString()
            syncLimit = 9 // Sync 9 meetings fully (with thumbnails, transcripts, summaries)
            console.log('[fathom-sync] Onboarding fast sync: limiting to 9 most recent meetings with full processing')
            break
          case 'onboarding_background':
            // Phase 2: Rest of last 30 days (for free tier)
            if (meetingLimits?.is_free_tier) {
              apiStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
            } else {
              // Paid: can sync more history
              apiStartDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
            }
            apiEndDate = now.toISOString()
            console.log('[fathom-sync] Onboarding background sync: syncing remaining meetings from', apiStartDate)
            break
          case 'initial':
          case 'manual':
            // Last 30 days for initial/manual sync (can be overridden by request)
            apiStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
            apiEndDate = now.toISOString()
            break
        }
      }
      // Fetch calls from Fathom API with cursor-based pagination
      let cursor: string | undefined = undefined
      const apiLimit = syncLimit || limit || 100 // Use syncLimit (from onboarding types) or provided limit or default
      let hasMore = true
      let pageCount = 0
      const maxPages = 100 // Safety limit to prevent infinite loops

      // If user specified a limit or we set one for onboarding, only fetch one batch
      const isLimitedSync = !!syncLimit || !!limit

      // BULK SYNC OPTIMIZATION: For syncs with many meetings, use fast mode
      // to avoid Edge Function timeout. Thumbnails and transcripts will be
      // processed by background jobs (fathom-transcript-retry cron).
      // Fast mode is auto-enabled when:
      // - Processing more than 10 meetings AND
      // - Not a limited/onboarding sync (which should be quick by design)
      // - OR elapsed time approaches edge function timeout (safety guard)
      const BULK_THRESHOLD = 10
      let useFastMode = false
      let fastModeSkipThumbnails = skip_thumbnails ?? false
      let fastModeSkipTranscripts = false

      // Track how many meetings have been fully processed (with thumbnails + transcripts)
      // For limited syncs, process ALL meetings fully (user explicitly chose a small batch)
      // For open-ended syncs, cap at 9 to leave room for background processing
      const FULL_PROCESSING_LIMIT = isLimitedSync ? 999 : 9
      let meetingsFullyProcessed = 0

      // Elapsed time guard: switch to fast mode when approaching edge function timeout
      // Supabase edge functions timeout at ~60s CPU (150s wall clock)
      // For limited syncs (explicit limit or small count), we can use a higher threshold
      // since we know the total scope and can afford to use more of the wall clock time
      const syncStartTime = Date.now()
      // Elapsed time guard threshold:
      // - Limited syncs get more headroom (90s) since scope is bounded
      // - Open-ended syncs switch to fast mode earlier (40s) to avoid timeout
      // Note: Edge function wall clock timeout is ~150s, so we need buffer
      const TIMEOUT_SAFETY_MS = isLimitedSync ? 90_000 : 40_000
      console.log(`📊 Sync config: isLimitedSync=${isLimitedSync}, syncLimit=${syncLimit}, limit=${limit}, apiLimit=${apiLimit}, TIMEOUT_SAFETY_MS=${TIMEOUT_SAFETY_MS}ms, FULL_PROCESSING_LIMIT=${FULL_PROCESSING_LIMIT}`)

      while (hasMore && pageCount < maxPages) {
        pageCount++
        const response = await fetchFathomCalls(integration, {
          start_date: apiStartDate,
          end_date: apiEndDate,
          limit: apiLimit,
          cursor,
        }, supabase)

        let calls = response.items

        // Enforce limit on items if API returned more than requested
        if (isLimitedSync && apiLimit && calls.length > apiLimit) {
          console.log(`📊 API returned ${calls.length} items but limit is ${apiLimit}, truncating`)
          calls = calls.slice(0, apiLimit)
        }

        totalMeetingsFound += calls.length

        // Sort by newest first (recording_start_time or created_at descending)
        // This ensures the most recent meetings get priority processing
        calls = calls.sort((a: any, b: any) => {
          const dateA = new Date(a.start_time || a.recording_start_time || a.created_at || 0).getTime()
          const dateB = new Date(b.start_time || b.recording_start_time || b.created_at || 0).getTime()
          return dateB - dateA // Descending (newest first)
        })

        // Auto-enable fast mode if we're processing many meetings
        // This check runs after first page fetch so we know the total scope
        if (!useFastMode && !isLimitedSync && (totalMeetingsFound > BULK_THRESHOLD || (response.has_more && calls.length > 0))) {
          useFastMode = true
          bulkSyncFastMode = true // Set outer variable for response
          console.log(`⚡ BULK SYNC: Auto-enabled fast mode (${totalMeetingsFound}+ meetings detected). First ${FULL_PROCESSING_LIMIT} meetings will be fully processed, rest in background.`)
        }

        // Process each call
        for (const call of calls) {
          try {
            // Pass markAsHistorical flag for onboarding syncs
            if (!effectiveUserIdForOwnership) throw new Error('Cannot resolve user context for sync')

            // Elapsed time guard: auto-switch to fast mode when approaching timeout
            const elapsedMs = Date.now() - syncStartTime
            console.log(`⏱️  Meeting ${meetingsFullyProcessed + 1}: elapsed=${Math.round(elapsedMs / 1000)}s, useFastMode=${useFastMode}, threshold=${TIMEOUT_SAFETY_MS / 1000}s`)
            if (!useFastMode && elapsedMs > TIMEOUT_SAFETY_MS) {
              useFastMode = true
              bulkSyncFastMode = true
              console.log(`⏱️  TIMEOUT GUARD: Elapsed ${Math.round(elapsedMs / 1000)}s > ${TIMEOUT_SAFETY_MS / 1000}s, switching to fast mode for remaining meetings`)
            }

            // Determine if this meeting should be fully processed
            // First 9 meetings get full processing (thumbnails + transcripts)
            // After that, use fast mode for bulk syncs
            // Also skip full processing if we're running low on time
            const shouldProcessFully = meetingsFullyProcessed < FULL_PROCESSING_LIMIT && !useFastMode
            const skipThumbsForThis = shouldProcessFully ? false : (useFastMode ? true : fastModeSkipThumbnails)
            const skipTranscriptsForThis = shouldProcessFully ? false : (useFastMode ? true : fastModeSkipTranscripts)

            if (shouldProcessFully) {
              console.log(`🎯 Full processing for meeting ${meetingsFullyProcessed + 1}/${FULL_PROCESSING_LIMIT}: ${call.title || call.recording_id}`)
            }

            const result = await syncSingleCall(
              supabase,
              effectiveUserIdForOwnership,
              orgId,
              integration,
              call,
              skipThumbsForThis,
              markAsHistorical,
              skipTranscriptsForThis,
              allowResync // Allow re-sync for date-range syncs, skip for incremental
            )

            if (result.success) {
              // Check if it was actually synced or just skipped
              if (result.error && result.error.includes('already synced')) {
                meetingsSkipped++
              } else {
                meetingsSynced++
                if (shouldProcessFully) {
                  meetingsFullyProcessed++
                }
              }
            } else {
              // Only add to errors if it's a real error (not just missing recording_id)
              if (!result.error || !result.error.includes('Missing recording_id')) {
                errors.push({ call_id: String(call.recording_id || call.id), error: result.error || 'Unknown error' })
              } else {
                meetingsSkipped++
              }
            }
          } catch (error) {
            errors.push({
              call_id: String(call.recording_id || call.id),
              error: error instanceof Error ? error.message : 'Unknown error',
            })
          }
        }

        // Check if there are more results using cursor-based pagination
        // If this is a limited sync (test mode), stop after first batch
        if (isLimitedSync) {
          hasMore = false
        } else {
          // Use has_more from API response and cursor for next page
          hasMore = response.has_more && !!response.cursor
          cursor = response.cursor
        }
      }

      // Log bulk sync completion
      if (useFastMode) {
        console.log(`⚡ BULK SYNC COMPLETE: ${meetingsSynced}/${totalMeetingsFound} meetings saved. Transcripts/thumbnails queued for background processing.`)
      }

      // Fallback: if nothing found in the selected window, retry once without date filters
      if (totalMeetingsFound === 0 && (apiStartDate || apiEndDate)) {
        const retryResponse = await fetchFathomCalls(integration, { limit: apiLimit }, supabase)
        const retryCalls = retryResponse.items
        totalMeetingsFound += retryCalls.length

        if (retryCalls.length > 0) {
          for (const call of retryCalls) {
            try {
              // Fallback retries also use markAsHistorical flag
              if (!effectiveUserIdForOwnership) throw new Error('Cannot resolve user context for sync')
              const result = await syncSingleCall(
                supabase,
                effectiveUserIdForOwnership,
                orgId,
                integration,
                call,
                fastModeSkipThumbnails,
                markAsHistorical,
                fastModeSkipTranscripts,
                allowResync // Use same allowResync logic for fallback retries
              )
              if (result.success) meetingsSynced++
            } catch (error) {
            }
          }
        }
      }
    }

    // Update sync state to 'idle' with results
    if (integrationScope === 'org') {
      await supabase
        .from('fathom_org_sync_state')
        .update({
          sync_status: 'idle',
          last_successful_sync: new Date().toISOString(),
          last_sync_completed_at: new Date().toISOString(),
          meetings_synced: meetingsSynced,
          total_meetings_found: totalMeetingsFound,
          error_message: errors.length > 0 ? JSON.stringify(errors.slice(0, 10)) : null,
        })
        .eq('org_id', orgId)

      // Update integration metadata
      if (orgId) {
        await supabase
          .from('fathom_org_integrations')
          .update({
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', orgId)
      }
    } else if (userId) {
      await supabase
        .from('fathom_sync_state')
        .update({
          sync_status: 'idle',
          last_sync_completed_at: new Date().toISOString(),
          meetings_synced: meetingsSynced,
          total_meetings_found: totalMeetingsFound,
          last_sync_error: errors.length > 0 ? JSON.stringify(errors.slice(0, 10)) : null,
        })
        .eq('user_id', userId)

      // Best-effort: update legacy integration metadata
      await supabase
        .from('fathom_integrations')
        .update({
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
    }

    // USAGE LIMIT WARNING: Check if user is approaching their limit (80%) and send email
    if (meetingLimits && meetingLimits.is_free_tier && meetingsSynced > 0) {
      const warningUserId: string | null = userId || integration.connected_by_user_id || null
      const newUsed = meetingLimits.new_meetings_used + meetingsSynced
      const usagePercent = (newUsed / meetingLimits.max_meetings_per_month) * 100
      
      // Send warning at 80% usage (12 out of 15 meetings)
      if (usagePercent >= 80 && usagePercent < 100) {
        console.log(`⚠️ User approaching limit: ${newUsed}/${meetingLimits.max_meetings_per_month} (${usagePercent.toFixed(0)}%)`)
        
        // Check if we've already sent a warning email (to avoid spam)
        try {
          if (!warningUserId) {
            console.warn('[fathom-sync] Cannot send usage warning: no user context available')
          } else {
          const { data: existingWarning } = await supabase
            .from('email_logs')
            .select('id')
            .eq('user_id', warningUserId)
            .eq('email_type', 'meeting_limit_warning')
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
            .limit(1)
          
          if (!existingWarning || existingWarning.length === 0) {
            // Get user email
            const { data: userData } = await supabase.auth.admin.getUserById(warningUserId)
            
            if (userData?.user?.email) {
              // Fire-and-forget: Send warning email via encharge-email function
              fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/encharge-email`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  email_type: 'meeting_limit_warning',
                  to_email: userData.user.email,
                  to_name: userData.user.user_metadata?.full_name || userData.user.email.split('@')[0],
                  user_id: warningUserId,
                  data: {
                    meetings_used: newUsed,
                    meetings_limit: meetingLimits.max_meetings_per_month,
                    meetings_remaining: meetingLimits.max_meetings_per_month - newUsed,
                    usage_percent: usagePercent,
                  },
                }),
              }).then(response => {
                if (response.ok) {
                  console.log(`✅ Usage limit warning email sent to ${userData.user?.email}`)
                } else {
                  console.warn(`⚠️ Failed to send usage limit warning email: ${response.status}`)
                }
              }).catch(err => {
                console.error(`⚠️ Error sending usage limit warning email:`, err)
              })
            }
          } else {
            console.log(`📧 Usage limit warning already sent recently, skipping`)
          }
          }
        } catch (emailError) {
          console.error(`⚠️ Error checking/sending usage limit warning:`, emailError)
        }
        
        // Set the limit warning message
        limitWarning = `You're using ${newUsed} of ${meetingLimits.max_meetings_per_month} meetings. Upgrade to get unlimited meetings.`
      }
    }

    // AUTO-INDEX: Trigger queue processor to index newly synced meetings
    // This runs asynchronously in the background after sync completes
    if (meetingsSynced > 0) {
      console.log(`🔍 Triggering AI search indexing for ${meetingsSynced} synced meetings`)
      try {
        // Fire-and-forget: Don't await to avoid blocking the sync response
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-intelligence-process-queue`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            limit: Math.min(meetingsSynced, 50), // Process up to 50 meetings per batch
          }),
        }).then(response => {
          if (response.ok) {
            console.log(`✅ AI search indexing triggered successfully`)
          } else {
            console.warn(`⚠️  AI search indexing trigger returned status ${response.status}`)
          }
        }).catch(err => {
          console.error(`⚠️  Failed to trigger AI search indexing:`, err)
        })
      } catch (triggerError) {
        // Non-fatal - log but don't fail the sync response
        console.error(`⚠️  Error triggering AI search indexing:`, triggerError)
      }
    }

    // BULK SYNC: Trigger repeated background transcript processing if fast mode was used.
    // The retry processor runs jobs in parallel (concurrency=5) and each invocation
    // processes one batch. We trigger it multiple times with staggered delays so the
    // queue drains progressively instead of sitting idle after a single fire-and-forget.
    if (bulkSyncFastMode && meetingsSynced > 0) {
      const retryUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/fathom-transcript-retry`
      const retryHeaders = {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        'Content-Type': 'application/json',
      }
      const retryBody = JSON.stringify({ batch_size: 50, concurrency: 5 })

      // Calculate how many rounds we need (each round processes up to 50 jobs)
      const rounds = Math.min(Math.ceil(meetingsSynced / 50), 6) // Cap at 6 rounds
      console.log(`📋 Scheduling ${rounds} background transcript processor rounds for ${meetingsSynced} queued meetings`)

      // Fire first round immediately, then stagger subsequent rounds
      // Each round waits for jobs whose next_retry_at has passed, so spacing
      // them 60s apart gives Fathom time to process recordings.
      for (let round = 0; round < rounds; round++) {
        const delayMs = round * 60_000 // 0s, 60s, 120s, 180s, ...
        setTimeout(() => {
          fetch(retryUrl, { method: 'POST', headers: retryHeaders, body: retryBody })
            .then(response => {
              if (response.ok) {
                console.log(`✅ Background transcript processor round ${round + 1}/${rounds} triggered successfully`)
              } else {
                console.warn(`⚠️  Background transcript processor round ${round + 1} returned status ${response.status}`)
              }
            })
            .catch(err => {
              console.error(`⚠️  Failed to trigger background transcript processor round ${round + 1}:`, err)
            })
        }, delayMs)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sync_type,
        meetings_synced: meetingsSynced,
        meetings_skipped: meetingsSkipped,
        total_meetings_found: totalMeetingsFound,
        errors: errors.length > 0 ? errors : undefined,
        // Fast mode indicator - transcripts will be processed in background
        fast_mode: bulkSyncFastMode,
        fast_mode_message: bulkSyncFastMode
          ? 'Meetings synced successfully. Transcripts and summaries will be processed in the background and may take a few minutes to appear.'
          : undefined,
        // Free tier limit info
        upgrade_required: upgradeRequired,
        limit_warning: limitWarning,
        limits: meetingLimits ? {
          is_free_tier: meetingLimits.is_free_tier,
          used: meetingLimits.new_meetings_used + meetingsSynced, // Include newly synced
          max: meetingLimits.max_meetings_per_month,
          remaining: Math.max(0, meetingLimits.meetings_remaining - meetingsSynced),
          historical: meetingLimits.historical_meetings,
        } : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    // Try to update sync state to error
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const message = error instanceof Error ? error.message : 'Unknown error'

      if (syncStateScope === 'org' && syncStateOrgId) {
        await supabase
          .from('fathom_org_sync_state')
          .update({
            sync_status: 'error',
            error_message: message,
            last_error_at: new Date().toISOString(),
            last_sync_completed_at: new Date().toISOString(),
          })
          .eq('org_id', syncStateOrgId)
      } else if (syncStateUserId) {
        await supabase
          .from('fathom_sync_state')
          .update({
            sync_status: 'error',
            last_sync_error: message,
            last_sync_completed_at: new Date().toISOString(),
          })
          .eq('user_id', syncStateUserId)
      }
    } catch (updateError) {
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

// retryWithBackoff is now imported from ./services/helpers.ts

/**
 * Response type for paginated Fathom API calls
 */
interface FathomPaginatedResponse {
  items: FathomCall[]
  has_more: boolean
  cursor?: string
}

/**
 * Fetch calls from Fathom API with proper cursor-based pagination
 */
async function fetchFathomCalls(
  integration: any,
  params: {
    start_date?: string
    end_date?: string
    limit?: number
    cursor?: string  // Use cursor instead of offset for proper pagination
  },
  supabase?: any
): Promise<FathomPaginatedResponse> {
  const queryParams = new URLSearchParams()

  // Fathom API uses created_after/created_before instead of start_date/end_date
  if (params.start_date) queryParams.set('created_after', params.start_date)
  if (params.end_date) queryParams.set('created_before', params.end_date)
  // Request larger page size (100) to get more meetings per request
  queryParams.set('limit', String(params.limit ?? 100))

  // Use cursor for pagination (Fathom uses cursor-based pagination)
  if (params.cursor) {
    queryParams.set('cursor', params.cursor)
  }

  // Correct API base URL
  const url = `https://api.fathom.ai/external/v1/meetings?${queryParams.toString()}`

  return await retryWithBackoff(async () => {
    // Refresh token if expired (only if supabase client is provided)
    let accessToken = integration.access_token
    if (supabase) {
      try {
        accessToken = await refreshAccessToken(supabase, integration, integration._scope === 'org' ? 'org' : 'user')
        // Update the integration object with the new token
        integration.access_token = accessToken
        console.log(`✅ Token refreshed successfully (${integration._scope || 'user'} scope)`)
      } catch (error) {
        // Log the error but continue with existing token
        console.error(`⚠️ Token refresh failed (${integration._scope || 'user'} scope):`, error instanceof Error ? error.message : String(error))
        console.error('Token refresh error details:', error)
        // Continue with existing token - it might still work
      }
    }
    // OAuth tokens typically use Authorization: Bearer, not X-Api-Key
    // Try Bearer first (standard for OAuth), then fallback to X-Api-Key
    let response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
    // If Bearer fails with 401, try X-Api-Key (for API keys)
    if (response.status === 401) {
      response = await fetch(url, {
        headers: {
          'X-Api-Key': accessToken,
          'Content-Type': 'application/json',
        },
      })
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Fathom API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    // DEBUG: Log raw API response to understand pagination structure
    console.log('[Fathom API] Raw response keys:', Object.keys(data))
    console.log('[Fathom API] has_more:', data.has_more, 'hasMore:', data.hasMore)
    console.log('[Fathom API] cursor:', data.cursor, 'next_cursor:', data.next_cursor)
    console.log('[Fathom API] total_count:', data.total_count, 'total:', data.total)
    if (data.items) console.log('[Fathom API] items count:', data.items.length)
    if (data.meetings) console.log('[Fathom API] meetings count:', data.meetings.length)

    // Fathom API returns meetings array directly or in a data wrapper
    // Handle different possible response structures
    let meetings: FathomCall[] = []
    let has_more = false
    let cursor: string | undefined = undefined

    if (Array.isArray(data)) {
      // Response is directly an array (no pagination info)
      meetings = data
      has_more = false
    } else if (data.items && Array.isArray(data.items)) {
      // Response has an items property that's an array (actual Fathom API structure)
      meetings = data.items
      // Fathom API uses next_cursor for pagination - presence of next_cursor means more results
      cursor = data.next_cursor || data.cursor || data.nextCursor || undefined
      // If next_cursor exists, there are more results to fetch
      has_more = !!cursor
    } else if (data.meetings && Array.isArray(data.meetings)) {
      // Response has a meetings property that's an array
      meetings = data.meetings
      has_more = data.has_more === true || false
      cursor = data.cursor || data.next_cursor || undefined
    } else if (data.data && Array.isArray(data.data)) {
      // Response has a data property that's an array
      meetings = data.data
      has_more = data.has_more === true || false
      cursor = data.cursor || data.next_cursor || undefined
    } else if (data.calls && Array.isArray(data.calls)) {
      // Response has a calls property that's an array
      meetings = data.calls
      has_more = data.has_more === true || false
      cursor = data.cursor || data.next_cursor || undefined
    } else {
      // Unknown structure, return empty
      meetings = []
      has_more = false
    }

    return { items: meetings, has_more, cursor }
  })
}

// condenseMeetingSummary is now imported from ./services/transcriptService.ts
// calculateTranscriptFetchCooldownMinutes is now imported from ./services/helpers.ts
// autoFetchTranscriptAndAnalyze is now imported from ./services/transcriptService.ts

// autoFetchTranscriptAndAnalyze extracted to ./services/transcriptService.ts
// Transcript fetching functions are imported from _shared/fathomTranscript.ts

/**
 * Sync a single call from Fathom to database
 *
 * @param skipTranscriptFetch - When true, skips transcript/summary fetching and AI analysis.
 *                              Meeting will be queued for background processing via fathom-transcript-retry.
 *                              Use this for bulk syncs to avoid Edge Function timeout.
 */
async function syncSingleCall(
  supabase: any,
  userId: string,
  orgId: string | null,
  integration: any,
  call: any, // Directly receive the call object from bulk API
  skipThumbnails: boolean = false,
  markAsHistorical: boolean = false, // Mark as historical import (doesn't count toward new meeting limit)
  skipTranscriptFetch: boolean = false, // Skip transcript/summary fetch for bulk syncs
  allowResync: boolean = false // Flag to allow re-syncing existing meetings (for date-range syncs or webhooks)
): Promise<{ success: boolean; error?: string }> {
  try {
    // Call object already contains all necessary data from bulk API

    // EARLY EXIT: Skip meetings without valid recording ID
    const recordingIdRaw = call?.recording_id ?? call?.id ?? call?.recordingId ?? null
    if (!recordingIdRaw) {
      console.warn(`⚠️  Skipping meeting without recording ID: ${call.title || 'Unknown'}`)
      return { success: false, error: 'Missing recording_id - cannot uniquely identify meeting' }
    }

    // EARLY EXIT: Skip already-synced meetings (unless allowResync is true)
    // allowResync is true for:
    // - Webhook syncs (always get latest data)
    // - Date-range syncs (user explicitly requested that period, may want updates)
    // allowResync is false for:
    // - Incremental syncs (only new meetings, skip existing)
    if (!allowResync && orgId) {
      const { data: existingMeeting } = await supabase
        .from('meetings')
        .select('id, fathom_recording_id, last_synced_at')
        .eq('org_id', orgId)
        .eq('fathom_recording_id', String(recordingIdRaw))
        .maybeSingle()

      if (existingMeeting) {
        console.log(`⏭️  Skipping already-synced meeting: ${call.title || recordingIdRaw} (last synced: ${existingMeeting.last_synced_at})`)
        return { success: true, error: 'Meeting already synced' }
      }
    }

    // Use the owner resolution service to resolve meeting owner
    const ownerResult = await resolveMeetingOwner(
      supabase,
      call,
      orgId,
      userId,
      integration?.connected_by_user_id || null
    )
    const ownerUserId = ownerResult.ownerUserId
    const ownerResolved = ownerResult.ownerResolved
    const ownerEmailCandidate = ownerResult.ownerEmail

    // Calculate duration — prefer Fathom's native duration field (seconds), fallback to time diff
    let durationMinutes = 0
    if (call.duration && typeof call.duration === 'number' && call.duration > 0) {
      durationMinutes = Math.round(call.duration / 60)
    } else {
      const startTime = new Date(call.start_time || call.recording_start_time || call.scheduled_start_time)
      const endTime = new Date(call.end_time || call.recording_end_time || call.scheduled_end_time)
      const diff = endTime.getTime() - startTime.getTime()
      if (!isNaN(diff) && diff > 0) {
        durationMinutes = Math.round(diff / (1000 * 60))
      }
    }

    // Compute derived fields prior to DB write
    const embedUrl = buildEmbedUrl(call.share_url, call.recording_id)

    // Check for existing meeting to preserve completed processing statuses during re-sync
    const recordingIdForLookup = call?.recording_id ?? call?.id ?? call?.recordingId ?? null
    let existingThumbnailUrl: string | null = null
    let existingThumbnailStatus: string | null = null
    let existingTranscriptStatus: string | null = null
    let existingSummaryStatus: string | null = null

    if (recordingIdForLookup) {
      try {
        const lookupQuery = orgId
          ? supabase.from('meetings').select('thumbnail_url, thumbnail_status, transcript_status, summary_status').eq('org_id', orgId).eq('fathom_recording_id', String(recordingIdForLookup)).maybeSingle()
          : supabase.from('meetings').select('thumbnail_url, thumbnail_status, transcript_status, summary_status').eq('fathom_recording_id', String(recordingIdForLookup)).maybeSingle()

        const { data: existingMeeting } = await lookupQuery

        if (existingMeeting?.thumbnail_url && !existingMeeting.thumbnail_url.includes('dummyimage.com')) {
          existingThumbnailUrl = existingMeeting.thumbnail_url
          existingThumbnailStatus = existingMeeting.thumbnail_status
          console.log(`🖼️  Preserving existing thumbnail for recording ${recordingIdForLookup}: ${existingThumbnailUrl.substring(0, 60)}...`)
        }
        if (existingMeeting?.transcript_status === 'complete') {
          existingTranscriptStatus = 'complete'
        }
        if (existingMeeting?.summary_status === 'complete') {
          existingSummaryStatus = 'complete'
        }
      } catch (lookupErr) {
        // Non-fatal - continue with normal thumbnail generation
        console.warn(`⚠️  Could not check for existing thumbnail: ${lookupErr instanceof Error ? lookupErr.message : String(lookupErr)}`)
      }
    }

    // Generate thumbnail using thumbnail service
    let thumbnailUrl: string | null = existingThumbnailUrl // Start with existing thumbnail if available

    // Only attempt thumbnail generation if we don't have a valid existing thumbnail
    // The generateVideoThumbnail function will handle fallbacks internally
    // Note: We'll call it again after meeting is created to pass meeting_id for DB persistence
    if (!thumbnailUrl && !skipThumbnails && embedUrl) {
      try {
        console.log(`🖼️  Generating thumbnail for recording ${call.recording_id}`)
        thumbnailUrl = await generateVideoThumbnail(call.recording_id, call.share_url, embedUrl)
        if (thumbnailUrl) {
          console.log(`✅ Thumbnail generated successfully: ${thumbnailUrl.substring(0, 100)}...`)
        } else {
          console.log(`⚠️  Thumbnail generation returned null for recording ${call.recording_id}`)
        }
      } catch (error) {
        console.error(`❌ Error generating thumbnail for recording ${call.recording_id}:`, error instanceof Error ? error.message : String(error))
        // Continue with fallback placeholder
      }
    }

    // Fallback to placeholder if thumbnail service failed or disabled
    if (!thumbnailUrl) {
      const firstLetter = (call.title || 'M')[0].toUpperCase()
      thumbnailUrl = `https://dummyimage.com/640x360/1a1a1a/10b981&text=${encodeURIComponent(firstLetter)}`
      console.log(`📝 Using placeholder thumbnail for meeting ${call.recording_id}`)
    }
    // NOTE: recordingIdRaw already resolved at top of function (line ~1435)
    // Using the same value for DB uniqueness / upserts.

    // Use summary from bulk API response only (don't fetch separately)
    // Summary and transcript should be fetched on-demand via separate endpoint
    const summaryText: string | null = call.default_summary || call.summary || null
    // Determine initial processing statuses based on skip flags and available data
    // - 'complete': Already has data or successfully processed
    // - 'pending': Queued for background processing
    // - 'processing': Currently being processed (set during actual processing)
    // Preserve existing thumbnail status if we have a valid existing thumbnail
    const initialThumbnailStatus = existingThumbnailStatus === 'complete'
      ? 'complete'  // Preserve existing complete status
      : skipThumbnails
        ? 'pending'  // Queued for background thumbnail generation
        : (thumbnailUrl && !thumbnailUrl.includes('dummyimage.com') ? 'complete' : 'pending')

    // Preserve existing 'complete' status during re-sync to avoid losing processed transcripts
    const initialTranscriptStatus = existingTranscriptStatus === 'complete'
      ? 'complete'  // Preserve existing complete status
      : skipTranscriptFetch
        ? 'pending'  // Queued for background transcript fetch
        : 'processing'  // Will be updated after transcript fetch

    const initialSummaryStatus = existingSummaryStatus === 'complete'
      ? 'complete'  // Preserve existing complete status
      : skipTranscriptFetch
        ? 'pending'  // Queued for background summary generation
        : (summaryText ? 'complete' : 'processing')  // Will be updated after AI analysis

    // Map to meetings table schema using actual Fathom API fields
    const meetingData: Record<string, any> = {
      org_id: orgId, // Required for RLS compliance
      owner_user_id: ownerUserId,
      fathom_recording_id: recordingIdRaw ? String(recordingIdRaw) : null, // Use recording_id as unique identifier
      fathom_user_id: integration.fathom_user_id,
      title: call.title || call.meeting_title,
      meeting_start: call.start_time || call.recording_start_time || call.scheduled_start_time,
      meeting_end: call.end_time || call.recording_end_time || call.scheduled_end_time,
      duration_minutes: durationMinutes,
      owner_email: ownerEmailCandidate || call.recorded_by?.email || call.host_email || null,
      team_name: call.recorded_by?.team || null,
      share_url: call.share_url,
      calls_url: call.url,
      transcript_doc_url: call.transcript || null, // If Fathom provided a URL
      sentiment_score: null, // Not available in bulk API response
      coach_summary: null, // Not available in bulk API response
      talk_time_rep_pct: null, // Not available in bulk API response
      talk_time_customer_pct: null, // Not available in bulk API response
      talk_time_judgement: null, // Not available in bulk API response
      fathom_embed_url: embedUrl,
      thumbnail_url: thumbnailUrl,
      // Processing status columns for real-time UI updates
      thumbnail_status: initialThumbnailStatus,
      transcript_status: initialTranscriptStatus,
      summary_status: initialSummaryStatus,
      // Additional metadata fields
      fathom_created_at: call.created_at || null,
      transcript_language: call.transcript_language || 'en',
      // Validate calendar_invitees_type against check constraint (only two allowed values)
      calendar_invitees_type: normalizeInviteesType(
        call.calendar_invitees_domains_type || call.calendar_invitees_type
      ),
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      // Free tier enforcement: mark historical imports
      is_historical_import: markAsHistorical,
    }

    if (summaryText) {
      meetingData.summary = summaryText
    }

    // UPSERT meeting
    //
    // Use the refactored upsertMeeting service which handles:
    // 1. Org-scoped constraint: (org_id, fathom_recording_id)
    // 2. Legacy constraint fallback: (fathom_recording_id)
    // 3. Manual find-then-update/insert fallback
    // 4. Retry logic for transient gateway errors (Cloudflare 500, etc.)
    const { meeting, error: meetingError } = await upsertMeeting(supabase, meetingData, orgId)

    if (meetingError) {
      // Return error instead of throwing - prevents single meeting failure from killing entire sync
      console.error(`❌ Failed to upsert meeting ${recordingIdRaw}: ${meetingError.message}`)
      return { success: false, error: `Failed to upsert meeting: ${meetingError.message}` }
    }

    // Seed default call types for org on first sync (if org exists and has no call types)
    if (orgId) {
      try {
        const { data: existingCallTypes, error: checkError } = await supabase
          .from('org_call_types')
          .select('id')
          .eq('org_id', orgId)
          .limit(1)

        if (!checkError && (!existingCallTypes || existingCallTypes.length === 0)) {
          // Seed default call types for this org
          console.log(`🌱 Seeding default call types for org ${orgId}`)
          const { error: seedError } = await supabase.rpc('seed_default_call_types', {
            p_org_id: orgId,
          })

          if (seedError) {
            console.warn(`⚠️  Failed to seed default call types: ${seedError.message}`)
          } else {
            console.log(`✅ Default call types seeded for org ${orgId}`)
          }
        }
      } catch (error) {
        // Non-fatal - continue with sync even if seeding fails
        console.warn(`⚠️  Error checking/seeding call types: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    // If thumbnail wasn't generated or is a placeholder, try again now that we have meeting.id
    // This allows the thumbnail function to persist directly to the database
    if (meeting && (!thumbnailUrl || thumbnailUrl.includes('dummyimage.com')) && embedUrl && !skipThumbnails) {
      console.log(`🖼️  Retrying thumbnail generation for meeting ${meeting.id} (recording ${call.recording_id})`)

      // Update status to 'processing' before thumbnail generation
      await supabase
        .from('meetings')
        .update({ thumbnail_status: 'processing' })
        .eq('id', meeting.id)

      try {
        const retryThumbnail = await generateVideoThumbnail(
          call.recording_id,
          call.share_url,
          embedUrl,
          meeting.id // Pass meeting_id so thumbnail can be persisted to DB
        )
        if (retryThumbnail && !retryThumbnail.includes('via.placeholder.com')) {
          thumbnailUrl = retryThumbnail
          console.log(`✅ Retry thumbnail generation successful for meeting ${meeting.id}`)

          // Update status to 'complete' on success
          await supabase
            .from('meetings')
            .update({ thumbnail_status: 'complete' })
            .eq('id', meeting.id)
        } else {
          // Still pending - no valid thumbnail generated
          await supabase
            .from('meetings')
            .update({ thumbnail_status: 'pending' })
            .eq('id', meeting.id)
        }
      } catch (error) {
        console.warn(`⚠️  Thumbnail retry failed for meeting ${meeting.id}:`, error instanceof Error ? error.message : String(error))
        // Mark as failed so UI can show appropriate state
        await supabase
          .from('meetings')
          .update({ thumbnail_status: 'failed' })
          .eq('id', meeting.id)
      }
    }
    
    // CONDENSE SUMMARY IF AVAILABLE (non-blocking)
    // If we already have a summary from the bulk API, condense it in background
    if (summaryText && summaryText.length > 0) {
      // Fire-and-forget - don't block sync on AI summarization
      condenseMeetingSummary(supabase, meeting.id, summaryText, call.title || 'Meeting')
        .catch(err => undefined)
    }

    // TRANSCRIPT/SUMMARY FETCHING
    // For bulk syncs (skipTranscriptFetch=true), skip immediate fetching to avoid timeout.
    // The meeting will be processed by the background fathom-transcript-retry job.
    // Skip entirely if meeting already has complete transcript (preserve during re-sync)
    if (existingTranscriptStatus === 'complete' && skipTranscriptFetch) {
      console.log(`✅ Meeting ${meeting.id} already has complete transcript - skipping re-processing`)
    } else if (skipTranscriptFetch) {
      console.log(`⏭️  Skipping transcript fetch for meeting ${meeting.id} (bulk sync mode) - will process in background`)

      // Queue for background processing
      const recordingId = call.recording_id || call.id || meeting.fathom_recording_id
      if (recordingId) {
        try {
          const { error: enqueueError } = await supabase
            .rpc('enqueue_transcript_retry', {
              p_meeting_id: meeting.id,
              p_user_id: ownerUserId,
              p_recording_id: String(recordingId),
              p_initial_attempt_count: 0, // Fresh start for background processing
            })
          if (enqueueError) {
            console.warn(`⚠️  Failed to enqueue background job for meeting ${meeting.id}: ${enqueueError.message}`)
          } else {
            console.log(`📋 Queued meeting ${meeting.id} for background transcript processing`)
          }
        } catch (err) {
          // Non-fatal
          console.warn(`⚠️  Error queueing meeting ${meeting.id} for background:`, err instanceof Error ? err.message : String(err))
        }
      }
    } else {
      // REFRESH TOKEN BEFORE FETCHING TRANSCRIPT/SUMMARY
      // Webhook syncs don't go through fetchFathomCalls, so we need to refresh here
      try {
        console.log(`🔄 Attempting token refresh (${integration._scope || 'user'} scope) before fetching transcript`)
        const refreshedToken = await refreshAccessToken(supabase, integration, integration._scope === 'org' ? 'org' : 'user')
        // Update integration object with refreshed token for subsequent API calls
        integration.access_token = refreshedToken
        console.log(`✅ Token refreshed successfully (${integration._scope || 'user'} scope)`)
      } catch (error) {
        // Log the error but continue with existing token
        console.error(`⚠️ Token refresh failed (${integration._scope || 'user'} scope):`, error instanceof Error ? error.message : String(error))
        console.error('Token refresh error details:', error)
        // Continue with existing token - it might still work
      }

      // Update status to 'processing' before transcript fetch
      await supabase
        .from('meetings')
        .update({ transcript_status: 'processing', summary_status: 'processing' })
        .eq('id', meeting.id)

      // AUTO-FETCH TRANSCRIPT AND SUMMARY
      // Attempt to fetch transcript and summary automatically for AI analysis
      await autoFetchTranscriptAndAnalyze(supabase, ownerUserId, integration, meeting, call)

      // Check if transcript was fetched and update status accordingly
      try {
        const { data: updatedMeeting, error: checkError } = await supabase
          .from('meetings')
          .select('id, transcript_text, summary, fathom_recording_id, transcript_fetch_attempts')
          .eq('id', meeting.id)
          .single()

        if (!checkError && updatedMeeting) {
          // Update transcript status based on result
          const transcriptStatus = updatedMeeting.transcript_text ? 'complete' : 'pending'
          const summaryStatus = updatedMeeting.summary ? 'complete' : 'pending'

          await supabase
            .from('meetings')
            .update({ transcript_status: transcriptStatus, summary_status: summaryStatus })
            .eq('id', meeting.id)

          if (!updatedMeeting.transcript_text) {
            // Transcript still not available - enqueue retry job
            const recordingId = call.recording_id || call.id || updatedMeeting.fathom_recording_id
            if (recordingId) {
              console.log(`📋 Enqueueing transcript retry job for meeting ${updatedMeeting.id} (recording: ${recordingId}, attempts: ${updatedMeeting.transcript_fetch_attempts || 0})`)

              const { data: retryJobId, error: enqueueError } = await supabase
                .rpc('enqueue_transcript_retry', {
                  p_meeting_id: updatedMeeting.id,
                  p_user_id: ownerUserId,
                  p_recording_id: String(recordingId),
                  p_initial_attempt_count: updatedMeeting.transcript_fetch_attempts || 1,
                })

              if (enqueueError) {
                console.error(`⚠️  Failed to enqueue retry job: ${enqueueError.message}`)
              } else {
                console.log(`✅ Enqueued retry job ${retryJobId} for meeting ${updatedMeeting.id}`)
              }
            }
          }
        }
      } catch (error) {
        // Non-fatal - log but don't fail the sync
        console.error(`⚠️  Error checking/enqueueing retry job:`, error instanceof Error ? error.message : String(error))
        // Mark as failed on error
        await supabase
          .from('meetings')
          .update({ transcript_status: 'failed', summary_status: 'failed' })
          .eq('id', meeting.id)
      }
    }

    // Process participants: prefer calendar_invitees, fallback to participants
    // calendar_invitees has is_external flag from Fathom's calendar integration
    // participants has who actually joined the call (always available)
    // IMPORTANT: Separate handling for internal vs external participants to avoid duplication
    // - Internal users: Create meeting_attendees entry only (no contact creation)
    // - External users: Create/update contacts + meeting_contacts junction (no meeting_attendees)
    const externalContactIds: string[] = []

    // Determine which participant list to use
    const inviteeList = (call.calendar_invitees && call.calendar_invitees.length > 0)
      ? call.calendar_invitees
      : (call.participants && call.participants.length > 0)
        ? call.participants.map((p: any) => ({
            ...p,
            // participants don't have is_external — infer: non-host = external
            is_external: p.is_external ?? !p.is_host,
          }))
        : [];

    if (inviteeList.length > 0) {
      console.log(`[fathom-sync] Processing ${inviteeList.length} participants (source: ${call.calendar_invitees?.length ? 'calendar_invitees' : 'participants'})`)
      for (const invitee of inviteeList) {
        // Handle internal participants (team members) - store in meeting_attendees only
        if (!invitee.is_external) {
          // Check if already exists to avoid duplicates
          const { data: existingAttendee } = await supabase
            .from('meeting_attendees')
            .select('id')
            .eq('meeting_id', meeting.id)
            .eq('email', invitee.email || invitee.name) // Use name as fallback if no email
            .single()

          if (!existingAttendee) {
            await supabase
              .from('meeting_attendees')
              .insert({
                meeting_id: meeting.id,
                name: invitee.name,
                email: invitee.email || null,
                is_external: false,
                role: 'host',
              })
          } else {
          }

          continue // Skip to next participant
        }

        // Handle external participants without email — still store in meeting_attendees
        if (invitee.is_external && !invitee.email) {
          const { data: existingNameAttendee } = await supabase
            .from('meeting_attendees')
            .select('id')
            .eq('meeting_id', meeting.id)
            .eq('name', invitee.name)
            .maybeSingle()

          if (!existingNameAttendee) {
            await supabase
              .from('meeting_attendees')
              .insert({
                meeting_id: meeting.id,
                name: invitee.name,
                email: null,
                is_external: true,
                role: 'attendee',
              })
          }
          continue
        }

        // Handle external participants (customers/prospects) - create contacts + meeting_contacts
        if (invitee.email && invitee.is_external) {
          // 1. Match or create company from email domain
          const { company } = await matchOrCreateCompany(supabase, invitee.email, userId, invitee.name)
          if (company) {
          }

          // 2. Check for existing contact (email is unique globally, not per owner)
          const { data: existingContact } = await supabase
            .from('contacts')
            .select('id, company_id, owner_id, last_interaction_at')
            .eq('email', invitee.email)
            .single()

          // Get the meeting date for last_interaction_at
          const meetingDate = call.start_time || call.recording_start_time || call.scheduled_start_time

          if (existingContact) {
            // Build update object - always update last_interaction_at if meeting is newer
            const updateData: Record<string, any> = {}

            // Update company if not set
            if (!existingContact.company_id && company) {
              updateData.company_id = company.id
            }

            // Update last_interaction_at only if this meeting is newer
            if (meetingDate) {
              const existingDate = existingContact.last_interaction_at ? new Date(existingContact.last_interaction_at) : null
              const newDate = new Date(meetingDate)
              if (!existingDate || newDate > existingDate) {
                updateData.last_interaction_at = meetingDate
              }
            }

            // Only update if there are changes
            if (Object.keys(updateData).length > 0) {
              await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', existingContact.id)
            }

            externalContactIds.push(existingContact.id)
          } else {
            // Create new contact with company link
            // FIXED: Use owner_id (not user_id) and first_name/last_name (not name)
            const nameParts = invitee.name.split(' ')
            const firstName = nameParts[0] || invitee.name
            const lastName = nameParts.slice(1).join(' ') || null

            const { data: newContact, error: contactError } = await supabase
              .from('contacts')
              .insert({
                owner_id: userId, // FIXED: Use owner_id not user_id
                first_name: firstName, // FIXED: Use first_name not name
                last_name: lastName, // FIXED: Use last_name
                email: invitee.email,
                company_id: company?.id || null,
                source: 'fathom_sync',
                first_seen_at: new Date().toISOString(),
                last_interaction_at: meetingDate || null // Set to actual meeting date
              })
              .select('id')
              .single()

            if (contactError) {
            } else if (newContact) {
              if (company) {
              }
              externalContactIds.push(newContact.id)
            }
          }
        }
      }
    }

    // After processing all contacts, determine primary contact and company
    if (externalContactIds.length > 0) {
      // Select primary contact using smart logic
      const primaryContactId = await selectPrimaryContact(supabase, externalContactIds, ownerUserId)

      if (primaryContactId) {
        // Determine meeting company (use primary contact's company)
        const meetingCompanyId = await determineMeetingCompany(supabase, externalContactIds, primaryContactId, ownerUserId)

        if (meetingCompanyId) {
          // Fetch and log company name for transparency
          const { data: companyDetails } = await supabase
            .from('companies')
            .select('name, domain')
            .eq('id', meetingCompanyId)
            .single()

          if (companyDetails) {
          } else {
          }
        } else {
        }

        // Update meeting with primary contact and company
        await supabase
          .from('meetings')
          .update({
            primary_contact_id: primaryContactId,
            company_id: meetingCompanyId,
            updated_at: new Date().toISOString()
          })
          .eq('id', meeting.id)

        // Create meeting_contacts junction records
        const meetingContactRecords = externalContactIds.map((contactId, idx) => ({
          meeting_id: meeting.id,
          contact_id: contactId,
          is_primary: contactId === primaryContactId,
          role: 'attendee'
        }))

        const { error: junctionError } = await supabase
          .from('meeting_contacts')
          .upsert(meetingContactRecords, { onConflict: 'meeting_id,contact_id' })

        if (junctionError) {
        } else {
        }

    // Conditional activity creation based on per-user preference and meeting date
        try {
          // Load user preference
      const { data: settings } = await supabase
        .from('user_settings')
        .select('preferences')
        .eq('user_id', ownerUserId)
        .single()

          const prefs = (settings?.preferences || {}) as any
          const autoPref = prefs.auto_fathom_activity || {}
          const enabled = !!autoPref.enabled
          const fromDateStr = typeof autoPref.from_date === 'string' ? autoPref.from_date : null

      // Only auto-log if: owner was resolved to an internal user AND preferences allow AND from_date provided
      if (!ownerResolved || !enabled || !fromDateStr) {
          } else {
            // Only log if meeting_start is on/after from_date (user-locality not known; use ISO date)
            const meetingDateOnly = new Date(meetingData.meeting_start)
            const fromDateOnly = new Date(`${fromDateStr}T00:00:00.000Z`)

            if (isNaN(meetingDateOnly.getTime()) || isNaN(fromDateOnly.getTime())) {
            } else if (meetingDateOnly >= fromDateOnly) {
              // Get sales rep email - use ownerEmailCandidate or lookup from profile
              let salesRepEmail = ownerEmailCandidate
              if (!salesRepEmail) {
                // Fallback: lookup email from profiles table
                const { data: ownerProfile } = await supabase
                  .from('profiles')
                  .select('email')
                  .eq('id', ownerUserId)
                  .single()
                salesRepEmail = ownerProfile?.email || ownerUserId
              }

              // Get company name from meetingCompanyId (extracted from attendee emails)
              let companyName = meetingData.title || 'Fathom Meeting' // Fallback to meeting title
              if (meetingCompanyId) {
                const { data: companyData, error: companyError } = await supabase
                  .from('companies')
                  .select('name')
                  .eq('id', meetingCompanyId)
                  .single()

                if (!companyError && companyData?.name) {
                  companyName = companyData.name
                } else if (companyError) {
                }
              } else {
              }

              // Insert activity - unique constraint on (meeting_id, user_id, type) prevents duplicates
              // If a race condition occurs, the constraint will reject the duplicate
              const { error: activityError } = await supabase.from('activities').insert({
                user_id: ownerUserId,
                sales_rep: salesRepEmail,  // Use email instead of UUID
                meeting_id: meeting.id,
                contact_id: primaryContactId,
                company_id: meetingCompanyId,
                type: 'meeting',
                status: 'completed',
                client_name: companyName, // FIXED: Use company name instead of meeting title
                details: extractAndTruncateSummary(meetingData.summary),
                date: meetingData.meeting_start,
                created_at: new Date().toISOString()
              })

              // Ignore duplicate key errors (23505) - activity already exists
              if (activityError && activityError.code !== '23505') {
                console.error(`[fathom-sync] Error creating activity for meeting ${meeting.id}:`, activityError)
              }
            } else {
            }
          }
        } catch (e) {
        }
      } else {
      }
    }

    // Process action items using the action items service
    // Note: action_items will be null until Fathom processes the recording (can take several minutes)
    await processActionItems(supabase, meeting.id, call.action_items)

    // Log successful meeting sync
    const meetingTitle = call.title || call.meeting_title || 'Meeting'
    const meetingDate = call.start_time || call.recording_start_time || call.scheduled_start_time
    const formattedDate = meetingDate ? new Date(meetingDate).toLocaleDateString() : ''
    await logSyncOperation(supabase, {
      orgId,
      userId,
      operation: 'sync',
      direction: 'inbound',
      entityType: 'meeting',
      entityId: meeting?.id || null,
      entityName: `${meetingTitle}${formattedDate ? ` (${formattedDate})` : ''}`,
      metadata: {
        fathom_recording_id: call.recording_id || call.id,
        duration_minutes: call.duration_minutes,
      },
    })

    return { success: true }
  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'fathom-sync',
        integration: 'fathom',
      },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
