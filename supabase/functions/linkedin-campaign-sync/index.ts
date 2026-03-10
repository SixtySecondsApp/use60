import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Campaign Sync
//
// Bidirectional campaign state sync between use60 and LinkedIn.
// LinkedIn is the source of truth. Detects drift (campaigns modified
// externally in LinkedIn Campaign Manager).
//
// Actions:
//   sync      — Manual sync for a specific org + ad account
//   sync_all  — Cron job: sync all connected orgs
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[linkedin-campaign-sync]'
const MAX_RETRIES = 3
const RETRY_BASE_MS = 2_000
const BATCH_SIZE = 100
const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest'
const LINKEDIN_API_VERSION = '202405'

type Action = 'sync' | 'sync_all'

interface RequestBody {
  action: Action
  org_id?: string
  ad_account_id?: string
}

interface LinkedInIntegration {
  id: string
  org_id: string
  linkedin_ad_account_id: string
  access_token_encrypted: string
}

interface LinkedInCampaign {
  id: number
  name: string
  account: string
  campaignGroup: string
  status: string
  type: string
  objectiveType: string
  dailyBudget?: { amount: string; currencyCode: string }
  totalBudget?: { amount: string; currencyCode: string }
  unitCost?: { amount: string; currencyCode: string }
  costType?: string
  runSchedule?: { start: number; end?: number }
  targetingCriteria?: Record<string, unknown>
  pacingStrategy?: string
  audienceExpansionEnabled?: boolean
  offsiteDeliveryEnabled?: boolean
  versionTag?: string
  changeAuditStamps?: { lastModified?: { time: number } }
}

interface LinkedInCampaignGroup {
  id: number
  name: string
  account: string
  status: string
  totalBudget?: { amount: string; currencyCode: string }
  runSchedule?: { start: number; end?: number }
  versionTag?: string
  changeAuditStamps?: { lastModified?: { time: number } }
}

interface SyncResult {
  campaigns_synced: number
  campaigns_created: number
  campaigns_updated: number
  campaigns_archived: number
  groups_synced: number
  groups_created: number
  groups_updated: number
  error?: string
}

// ---------------------------------------------------------------------------
// LinkedIn API helpers
// ---------------------------------------------------------------------------

function linkedInHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'LinkedIn-Version': LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

/** Fetch with retry + exponential backoff for 429s */
async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url, { headers })

    if (response.status === 429) {
      const waitMs = RETRY_BASE_MS * Math.pow(2, attempt)
      console.warn(`${LOG_PREFIX} Throttled (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
      await new Promise(r => setTimeout(r, waitMs))
      continue
    }

    return response
  }

  // Final attempt without retry
  return await fetch(url, { headers })
}

/** Fetch all pages of a LinkedIn paginated endpoint */
async function fetchAllPages<T>(
  baseUrl: string,
  accessToken: string,
): Promise<T[]> {
  const allElements: T[] = []
  let start = 0
  const count = 100

  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?'
    const url = `${baseUrl}${separator}start=${start}&count=${count}`
    const response = await fetchWithRetry(url, linkedInHeaders(accessToken))

    if (response.status === 401) {
      throw new Error('LINKEDIN_TOKEN_EXPIRED')
    }
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LinkedIn API error (${response.status}): ${text.slice(0, 300)}`)
    }

    const data = await response.json()
    const elements = data.elements ?? []
    allElements.push(...elements)

    // Check if we have all elements
    const total = data.paging?.total ?? elements.length
    if (allElements.length >= total || elements.length < count) {
      break
    }

    start += count
  }

  return allElements
}

// ---------------------------------------------------------------------------
// Data conversion: LinkedIn -> local schema
// ---------------------------------------------------------------------------

function extractIdFromUrn(urn: string | undefined, prefix: string): string | null {
  if (!urn) return null
  return urn.startsWith(prefix) ? urn.replace(prefix, '') : urn
}

function timestampToIso(ts: number | undefined): string | null {
  if (!ts) return null
  return new Date(ts).toISOString()
}

function linkedInCampaignToLocal(
  el: LinkedInCampaign,
  orgId: string,
  adAccountId: string,
): Record<string, unknown> {
  return {
    org_id: orgId,
    ad_account_id: adAccountId,
    linkedin_campaign_id: String(el.id),
    name: el.name ?? `Campaign ${el.id}`,
    objective_type: el.objectiveType ?? 'UNKNOWN',
    campaign_type: el.type ?? null,
    status: el.status ?? 'ACTIVE',
    daily_budget_amount: el.dailyBudget ? parseFloat(el.dailyBudget.amount) : null,
    total_budget_amount: el.totalBudget ? parseFloat(el.totalBudget.amount) : null,
    currency_code: el.dailyBudget?.currencyCode ?? el.totalBudget?.currencyCode ?? 'USD',
    unit_cost_amount: el.unitCost ? parseFloat(el.unitCost.amount) : null,
    cost_type: el.costType ?? null,
    targeting_criteria: el.targetingCriteria ?? {},
    run_schedule_start: timestampToIso(el.runSchedule?.start),
    run_schedule_end: timestampToIso(el.runSchedule?.end),
    pacing_strategy: el.pacingStrategy ?? 'DAILY',
    audience_expansion_enabled: el.audienceExpansionEnabled ?? false,
    offsite_delivery_enabled: el.offsiteDeliveryEnabled ?? false,
    version_tag: el.versionTag ?? null,
    linkedin_group_urn: el.campaignGroup ?? null,
    last_synced_at: new Date().toISOString(),
  }
}

function linkedInGroupToLocal(
  el: LinkedInCampaignGroup,
  orgId: string,
  adAccountId: string,
): Record<string, unknown> {
  return {
    org_id: orgId,
    ad_account_id: adAccountId,
    linkedin_group_id: String(el.id),
    name: el.name ?? `Group ${el.id}`,
    status: el.status ?? 'ACTIVE',
    total_budget_amount: el.totalBudget ? parseFloat(el.totalBudget.amount) : null,
    currency_code: el.totalBudget?.currencyCode ?? 'USD',
    run_schedule_start: timestampToIso(el.runSchedule?.start),
    run_schedule_end: timestampToIso(el.runSchedule?.end),
    version_tag: el.versionTag ?? null,
    last_synced_at: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Sync orchestration
// ---------------------------------------------------------------------------

async function syncOrgCampaigns(
  serviceClient: SupabaseClient,
  integration: LinkedInIntegration,
): Promise<SyncResult> {
  const { org_id, linkedin_ad_account_id: adAccountId, access_token_encrypted: accessToken } = integration

  const result: SyncResult = {
    campaigns_synced: 0,
    campaigns_created: 0,
    campaigns_updated: 0,
    campaigns_archived: 0,
    groups_synced: 0,
    groups_created: 0,
    groups_updated: 0,
  }

  try {
    // ------------------------------------------------------------------
    // 1. Fetch campaign groups from LinkedIn
    // ------------------------------------------------------------------
    const groupsUrl = `${LINKEDIN_API_BASE}/adCampaignGroups?q=search&search=(account:(values:List(urn:li:sponsoredAccount:${adAccountId})))`
    console.log(`${LOG_PREFIX} Fetching campaign groups for org ${org_id} (account ${adAccountId})`)
    const linkedInGroups = await fetchAllPages<LinkedInCampaignGroup>(groupsUrl, accessToken)
    console.log(`${LOG_PREFIX} Found ${linkedInGroups.length} campaign groups from LinkedIn`)

    // Fetch existing local groups
    const { data: localGroups } = await serviceClient
      .from('linkedin_managed_campaign_groups')
      .select('id, linkedin_group_id, version_tag')
      .eq('org_id', org_id)
      .eq('ad_account_id', adAccountId)

    const localGroupMap = new Map(
      (localGroups ?? []).map(g => [g.linkedin_group_id, g])
    )

    // Upsert groups
    for (let i = 0; i < linkedInGroups.length; i += BATCH_SIZE) {
      const batch = linkedInGroups.slice(i, i + BATCH_SIZE)

      for (const liGroup of batch) {
        const groupIdStr = String(liGroup.id)
        const localGroup = localGroupMap.get(groupIdStr)
        const localData = linkedInGroupToLocal(liGroup, org_id, adAccountId)

        if (localGroup) {
          // Existing group — check for version drift
          if (localGroup.version_tag !== liGroup.versionTag) {
            const { error: updateErr } = await serviceClient
              .from('linkedin_managed_campaign_groups')
              .update(localData)
              .eq('id', localGroup.id)

            if (updateErr) {
              console.error(`${LOG_PREFIX} Failed to update group ${groupIdStr}: ${updateErr.message}`)
            } else {
              result.groups_updated++
            }
          }
        } else {
          // New group from LinkedIn
          const { error: insertErr } = await serviceClient
            .from('linkedin_managed_campaign_groups')
            .insert(localData)

          if (insertErr) {
            console.error(`${LOG_PREFIX} Failed to insert group ${groupIdStr}: ${insertErr.message}`)
          } else {
            result.groups_created++
          }
        }
      }
    }
    result.groups_synced = linkedInGroups.length

    // ------------------------------------------------------------------
    // 2. Fetch campaigns from LinkedIn
    // ------------------------------------------------------------------
    const campaignsUrl = `${LINKEDIN_API_BASE}/adCampaigns?q=search&search=(account:(values:List(urn:li:sponsoredAccount:${adAccountId})))`
    console.log(`${LOG_PREFIX} Fetching campaigns for org ${org_id}`)
    const linkedInCampaigns = await fetchAllPages<LinkedInCampaign>(campaignsUrl, accessToken)
    console.log(`${LOG_PREFIX} Found ${linkedInCampaigns.length} campaigns from LinkedIn`)

    // Fetch existing local campaigns
    const { data: localCampaigns } = await serviceClient
      .from('linkedin_managed_campaigns')
      .select('id, linkedin_campaign_id, version_tag, status')
      .eq('org_id', org_id)
      .eq('ad_account_id', adAccountId)

    const localCampaignMap = new Map(
      (localCampaigns ?? []).map(c => [c.linkedin_campaign_id, c])
    )

    // Track which LinkedIn campaign IDs we see (for archive detection)
    const seenLinkedInIds = new Set<string>()

    // Upsert campaigns
    for (let i = 0; i < linkedInCampaigns.length; i += BATCH_SIZE) {
      const batch = linkedInCampaigns.slice(i, i + BATCH_SIZE)

      for (const liCampaign of batch) {
        const campaignIdStr = String(liCampaign.id)
        seenLinkedInIds.add(campaignIdStr)

        const localCampaign = localCampaignMap.get(campaignIdStr)
        const localData = linkedInCampaignToLocal(liCampaign, org_id, adAccountId)

        if (localCampaign) {
          // Existing campaign — check for version drift
          const versionChanged = localCampaign.version_tag !== liCampaign.versionTag

          if (versionChanged) {
            const { error: updateErr } = await serviceClient
              .from('linkedin_managed_campaigns')
              .update({
                ...localData,
                is_externally_modified: true,
                last_external_modification_at: new Date().toISOString(),
              })
              .eq('id', localCampaign.id)

            if (updateErr) {
              console.error(`${LOG_PREFIX} Failed to update campaign ${campaignIdStr}: ${updateErr.message}`)
            } else {
              result.campaigns_updated++
            }
          } else {
            // Version unchanged — just update last_synced_at
            await serviceClient
              .from('linkedin_managed_campaigns')
              .update({ last_synced_at: new Date().toISOString() })
              .eq('id', localCampaign.id)
          }
        } else {
          // New campaign from LinkedIn
          const { error: insertErr } = await serviceClient
            .from('linkedin_managed_campaigns')
            .insert(localData)

          if (insertErr) {
            console.error(`${LOG_PREFIX} Failed to insert campaign ${campaignIdStr}: ${insertErr.message}`)
          } else {
            result.campaigns_created++
          }
        }
      }
    }
    result.campaigns_synced = linkedInCampaigns.length

    // ------------------------------------------------------------------
    // 3. Archive local campaigns not found in LinkedIn
    // ------------------------------------------------------------------
    const localCampaignsToArchive = (localCampaigns ?? []).filter(
      c => c.linkedin_campaign_id &&
        !seenLinkedInIds.has(c.linkedin_campaign_id) &&
        c.status !== 'ARCHIVED' &&
        c.status !== 'DRAFT' // Don't archive local drafts not yet pushed to LinkedIn
    )

    if (localCampaignsToArchive.length > 0) {
      const idsToArchive = localCampaignsToArchive.map(c => c.id)

      for (let i = 0; i < idsToArchive.length; i += BATCH_SIZE) {
        const batch = idsToArchive.slice(i, i + BATCH_SIZE)
        const { error: archiveErr } = await serviceClient
          .from('linkedin_managed_campaigns')
          .update({
            status: 'ARCHIVED',
            is_externally_modified: true,
            last_external_modification_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString(),
          })
          .in('id', batch)

        if (archiveErr) {
          console.error(`${LOG_PREFIX} Failed to archive campaigns: ${archiveErr.message}`)
        } else {
          result.campaigns_archived += batch.length
        }
      }

      console.log(`${LOG_PREFIX} Archived ${localCampaignsToArchive.length} campaigns no longer in LinkedIn`)
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (message === 'LINKEDIN_TOKEN_EXPIRED') {
      console.warn(`${LOG_PREFIX} Token expired for org ${org_id}, skipping`)
      return { ...result, error: 'Token expired' }
    }

    throw err
  }
}

/** Record a sync run in the audit trail table */
async function recordSyncRun(
  serviceClient: SupabaseClient,
  orgId: string,
  adAccountId: string,
  syncType: string,
  status: 'complete' | 'error',
  details: Record<string, unknown>,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]

  const { error } = await serviceClient
    .from('linkedin_analytics_sync_runs')
    .insert({
      org_id: orgId,
      ad_account_id: adAccountId,
      sync_type: syncType,
      date_range_start: today,
      date_range_end: today,
      status,
      campaigns_synced: details.campaigns_synced ?? 0,
      metrics_upserted: (details.campaigns_created as number ?? 0) + (details.campaigns_updated as number ?? 0),
      demographics_upserted: details.groups_synced ?? 0,
      error_message: details.error ?? null,
      started_at: details.started_at ?? new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })

  if (error) {
    console.error(`${LOG_PREFIX} Failed to record sync run: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleSync(
  serviceClient: SupabaseClient,
  body: RequestBody,
): Promise<Record<string, unknown>> {
  if (!body.org_id) throw new Error('org_id is required')

  // Look up integration — use ad_account_id if provided, otherwise find the active one
  let query = serviceClient
    .from('linkedin_org_integrations')
    .select('id, org_id, linkedin_ad_account_id, access_token_encrypted')
    .eq('org_id', body.org_id)
    .eq('is_connected', true)

  if (body.ad_account_id) {
    query = query.eq('linkedin_ad_account_id', body.ad_account_id)
  }

  const { data: integration } = await query.maybeSingle()

  if (!integration) {
    throw new Error('No active LinkedIn integration found for this org')
  }
  if (!integration.access_token_encrypted) {
    throw new Error('LinkedIn access token not found for this integration')
  }

  const startedAt = new Date().toISOString()
  const result = await syncOrgCampaigns(serviceClient, integration as LinkedInIntegration)

  const runStatus = result.error ? 'error' : 'complete'
  await recordSyncRun(
    serviceClient,
    body.org_id,
    integration.linkedin_ad_account_id,
    'campaign_sync_manual',
    runStatus,
    { ...result, started_at: startedAt },
  )

  return {
    org_id: body.org_id,
    ad_account_id: integration.linkedin_ad_account_id,
    status: runStatus,
    ...result,
  }
}

async function handleSyncAll(
  serviceClient: SupabaseClient,
): Promise<Record<string, unknown>> {
  const { data: integrations } = await serviceClient
    .from('linkedin_org_integrations')
    .select('id, org_id, linkedin_ad_account_id, access_token_encrypted')
    .eq('is_connected', true)
    .not('access_token_encrypted', 'is', null)

  if (!integrations || integrations.length === 0) {
    return { processed: 0, results: [] }
  }

  console.log(`${LOG_PREFIX} sync_all: processing ${integrations.length} integrations`)

  const results: Record<string, unknown>[] = []

  for (const integration of integrations) {
    const startedAt = new Date().toISOString()
    try {
      const result = await syncOrgCampaigns(serviceClient, integration as LinkedInIntegration)

      const runStatus = result.error ? 'error' : 'complete'
      await recordSyncRun(
        serviceClient,
        integration.org_id,
        integration.linkedin_ad_account_id,
        'campaign_sync_scheduled',
        runStatus,
        { ...result, started_at: startedAt },
      )

      results.push({
        org_id: integration.org_id,
        ad_account_id: integration.linkedin_ad_account_id,
        status: runStatus,
        campaigns_synced: result.campaigns_synced,
        campaigns_created: result.campaigns_created,
        campaigns_updated: result.campaigns_updated,
        campaigns_archived: result.campaigns_archived,
        error: result.error,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`${LOG_PREFIX} Sync failed for org ${integration.org_id}: ${message}`)

      await recordSyncRun(
        serviceClient,
        integration.org_id,
        integration.linkedin_ad_account_id,
        'campaign_sync_scheduled',
        'error',
        {
          campaigns_synced: 0,
          campaigns_created: 0,
          campaigns_updated: 0,
          campaigns_archived: 0,
          groups_synced: 0,
          error: message,
          started_at: startedAt,
        },
      )

      results.push({
        org_id: integration.org_id,
        ad_account_id: integration.linkedin_ad_account_id,
        status: 'error',
        campaigns_synced: 0,
        error: message,
      })
    }
  }

  return {
    processed: results.length,
    successful: results.filter(r => r.status === 'complete').length,
    failed: results.filter(r => r.status === 'error').length,
    results,
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const body: RequestBody = await req.json()
    const { action } = body

    if (!action || !['sync', 'sync_all'].includes(action)) {
      return errorResponse('Invalid action. Must be one of: sync, sync_all', req, 400)
    }

    // Auth: cron secret or JWT
    const cronSecret = req.headers.get('x-cron-secret')
    const isCron = cronSecret === Deno.env.get('CRON_SECRET')

    if (!isCron) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return errorResponse('Unauthorized', req, 401)

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error: authError } = await userClient.auth.getUser()
      if (authError || !user) return errorResponse('Unauthorized', req, 401)
    }

    // sync_all requires cron access
    if (action === 'sync_all' && !isCron) {
      return errorResponse('Cron access required for sync_all', req, 403)
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let result: Record<string, unknown>

    switch (action) {
      case 'sync':
        result = await handleSync(serviceClient, body)
        break
      case 'sync_all':
        result = await handleSyncAll(serviceClient)
        break
      default:
        return errorResponse(`Unknown action: ${action}`, req, 400)
    }

    return jsonResponse(result, req)
  } catch (err) {
    console.error(`${LOG_PREFIX} Error:`, err)
    return errorResponse(err instanceof Error ? err.message : 'Internal error', req, 500)
  }
})
