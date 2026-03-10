import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Analytics Sync
//
// Pulls campaign performance and demographic data from the LinkedIn
// Advertising API and stores it in linkedin_campaign_metrics and
// linkedin_demographic_metrics tables.
//
// Actions:
//   sync       — Sync metrics for a specific org + ad account + date range
//   sync_all   — Sync all orgs with active LinkedIn integrations (cron)
//   backfill   — Historical backfill (default 90 days lookback)
//   status     — Get sync run history for an org
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[linkedin-analytics-sync]'
const MAX_RETRIES = 3
const RETRY_BASE_MS = 2_000
const DATE_CHUNK_DAYS = 30 // chunk date ranges to stay under LinkedIn's 15k element limit

const LINKEDIN_API_VERSION = '202405'
const LINKEDIN_ANALYTICS_BASE = 'https://api.linkedin.com/rest/adAnalytics'
const LINKEDIN_CAMPAIGNS_BASE = 'https://api.linkedin.com/rest/adCampaigns'
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

const ANALYTICS_FIELDS = [
  'impressions', 'clicks', 'costInLocalCurrency',
  'externalWebsiteConversions', 'oneClickLeads', 'videoViews',
  'videoCompletions', 'likes', 'comments', 'shares', 'follows',
  'landingPageClicks', 'totalEngagements',
].join(',')

const DEMOGRAPHIC_PIVOTS = [
  'MEMBER_JOB_TITLE', 'MEMBER_JOB_FUNCTION', 'MEMBER_SENIORITY',
  'MEMBER_INDUSTRY', 'MEMBER_COMPANY_SIZE', 'MEMBER_COUNTRY_V2',
] as const

type Action = 'sync' | 'sync_all' | 'backfill' | 'status'

interface RequestBody {
  action: Action
  org_id?: string
  ad_account_id?: string
  start_date?: string // YYYY-MM-DD
  end_date?: string   // YYYY-MM-DD
  lookback_days?: number
}

interface DateRange {
  start: { year: number; month: number; day: number }
  end: { year: number; month: number; day: number }
}

interface LinkedInIntegration {
  id: string
  org_id: string
  linkedin_ad_account_id: string
  access_token_encrypted: string
  refresh_token_encrypted?: string
  token_expires_at?: string
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

/** Parse YYYY-MM-DD into { year, month, day } */
function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { year, month, day }
}

/** Format { year, month, day } to YYYY-MM-DD */
function formatDate(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

/** Split a date range into chunks of DATE_CHUNK_DAYS */
function chunkDateRange(startDate: string, endDate: string): DateRange[] {
  const chunks: DateRange[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  let chunkStart = new Date(start)
  while (chunkStart < end) {
    const chunkEnd = new Date(chunkStart)
    chunkEnd.setDate(chunkEnd.getDate() + DATE_CHUNK_DAYS - 1)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())

    chunks.push({
      start: { year: chunkStart.getFullYear(), month: chunkStart.getMonth() + 1, day: chunkStart.getDate() },
      end: { year: chunkEnd.getFullYear(), month: chunkEnd.getMonth() + 1, day: chunkEnd.getDate() },
    })

    chunkStart = new Date(chunkEnd)
    chunkStart.setDate(chunkStart.getDate() + 1)
  }

  return chunks
}

/** Fetch campaign IDs for an ad account */
async function fetchCampaignIds(
  accessToken: string,
  adAccountId: string,
): Promise<{ id: string; name: string }[]> {
  const url = `${LINKEDIN_CAMPAIGNS_BASE}?q=search&search=(account:(values:List(urn:li:sponsoredAccount:${adAccountId})))&fields=id,name`
  const response = await fetchWithRetry(url, linkedInHeaders(accessToken))

  if (response.status === 401) {
    throw new Error('LINKEDIN_TOKEN_EXPIRED')
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LinkedIn campaigns API error (${response.status}): ${text.slice(0, 300)}`)
  }

  const data = await response.json()
  const elements = data.elements ?? []
  return elements.map((el: any) => ({
    id: String(el.id ?? '').replace('urn:li:sponsoredCampaign:', ''),
    name: el.name ?? `Campaign ${el.id}`,
  }))
}

/** Fetch analytics for a list of campaigns in a date range chunk */
async function fetchCampaignAnalytics(
  accessToken: string,
  campaignIds: string[],
  dateRange: DateRange,
): Promise<any[]> {
  if (campaignIds.length === 0) return []

  const campaignUrns = campaignIds.map(id => `urn:li:sponsoredCampaign:${id}`).join(',')
  const url = [
    `${LINKEDIN_ANALYTICS_BASE}?q=analytics`,
    `pivot=CAMPAIGN`,
    `dateRange=(start:(year:${dateRange.start.year},month:${dateRange.start.month},day:${dateRange.start.day}),end:(year:${dateRange.end.year},month:${dateRange.end.month},day:${dateRange.end.day}))`,
    `timeGranularity=DAILY`,
    `campaigns=List(${campaignUrns})`,
    `fields=${ANALYTICS_FIELDS}`,
  ].join('&')

  const response = await fetchWithRetry(url, linkedInHeaders(accessToken))

  if (response.status === 401) {
    throw new Error('LINKEDIN_TOKEN_EXPIRED')
  }
  if (!response.ok) {
    const text = await response.text()
    console.error(`${LOG_PREFIX} Analytics API error (${response.status}): ${text.slice(0, 200)}`)
    return []
  }

  const data = await response.json()
  return data.elements ?? []
}

/** Fetch demographic analytics for a specific pivot */
async function fetchDemographicAnalytics(
  accessToken: string,
  campaignIds: string[],
  dateRange: DateRange,
  pivot: string,
): Promise<any[]> {
  if (campaignIds.length === 0) return []

  const campaignUrns = campaignIds.map(id => `urn:li:sponsoredCampaign:${id}`).join(',')
  const url = [
    `${LINKEDIN_ANALYTICS_BASE}?q=analytics`,
    `pivot=${pivot}`,
    `dateRange=(start:(year:${dateRange.start.year},month:${dateRange.start.month},day:${dateRange.start.day}),end:(year:${dateRange.end.year},month:${dateRange.end.month},day:${dateRange.end.day}))`,
    `timeGranularity=ALL`,
    `campaigns=List(${campaignUrns})`,
    `fields=impressions,clicks,costInLocalCurrency`,
  ].join('&')

  const response = await fetchWithRetry(url, linkedInHeaders(accessToken))

  if (response.status === 401) {
    throw new Error('LINKEDIN_TOKEN_EXPIRED')
  }
  if (!response.ok) {
    const text = await response.text()
    console.warn(`${LOG_PREFIX} Demographics API error for ${pivot} (${response.status}): ${text.slice(0, 200)}`)
    return []
  }

  const data = await response.json()
  return data.elements ?? []
}

// ---------------------------------------------------------------------------
// Metric computation
// ---------------------------------------------------------------------------

function computeDerivedMetrics(row: any): {
  ctr: number
  cpm: number
  cpc: number
  cpl: number
} {
  const impressions = row.impressions ?? 0
  const clicks = row.clicks ?? 0
  const cost = parseFloat(row.costInLocalCurrency ?? '0')
  const leads = (row.externalWebsiteConversions ?? 0) + (row.oneClickLeads ?? 0)

  return {
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    cpm: impressions > 0 ? Math.round((cost / impressions) * 1000 * 100) / 100 : 0,
    cpc: clicks > 0 ? Math.round((cost / clicks) * 100) / 100 : 0,
    cpl: leads > 0 ? Math.round((cost / leads) * 100) / 100 : 0,
  }
}

/** Extract campaign ID from a LinkedIn URN */
function extractCampaignId(pivotValue: string): string {
  return pivotValue.replace('urn:li:sponsoredCampaign:', '')
}

// ---------------------------------------------------------------------------
// Token refresh (inline, before sync)
// ---------------------------------------------------------------------------

/**
 * Check if access token is expired/expiring and refresh it.
 * Returns a valid access token or throws.
 */
async function ensureFreshToken(
  serviceClient: SupabaseClient,
  integration: LinkedInIntegration,
): Promise<string> {
  const accessToken = integration.access_token_encrypted

  // If we have token_expires_at, check if it's still valid (10 min buffer)
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at)
    const bufferMs = 10 * 60 * 1000
    if (expiresAt.getTime() > Date.now() + bufferMs) {
      return accessToken // still valid
    }
  }

  // Token expired or expiring — try to refresh
  const refreshToken = integration.refresh_token_encrypted
  if (!refreshToken) {
    throw new Error('LINKEDIN_TOKEN_EXPIRED') // no refresh token, caller handles
  }

  const clientId = Deno.env.get('LINKEDIN_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET') || ''

  if (!clientId || !clientSecret) {
    console.warn(`${LOG_PREFIX} Missing LINKEDIN_CLIENT_ID/SECRET, cannot refresh token`)
    throw new Error('LINKEDIN_TOKEN_EXPIRED')
  }

  console.log(`${LOG_PREFIX} Token expired for org ${integration.org_id}, refreshing...`)

  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const tokenResp = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  })

  if (!tokenResp.ok) {
    const errorText = await tokenResp.text()
    console.error(`${LOG_PREFIX} Token refresh failed (${tokenResp.status}): ${errorText.slice(0, 200)}`)

    if (tokenResp.status === 400 || tokenResp.status === 401) {
      // Permanent failure — mark disconnected
      if (integration.id) {
        await serviceClient
          .from('linkedin_org_integrations')
          .update({ is_connected: false, updated_at: new Date().toISOString() })
          .eq('id', integration.id)
      }
    }
    throw new Error('LINKEDIN_TOKEN_EXPIRED')
  }

  const tokenData = await tokenResp.json()
  const newAccessToken = String(tokenData.access_token || '')
  const newRefreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : refreshToken
  const expiresIn = Number(tokenData.expires_in || 5184000)
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Update the integration row
  const updateData: Record<string, unknown> = {
    access_token_encrypted: newAccessToken,
    refresh_token_encrypted: newRefreshToken,
    token_expires_at: tokenExpiresAt,
    updated_at: new Date().toISOString(),
  }

  if (integration.id) {
    await serviceClient
      .from('linkedin_org_integrations')
      .update(updateData)
      .eq('id', integration.id)
  } else {
    await serviceClient
      .from('linkedin_org_integrations')
      .update(updateData)
      .eq('org_id', integration.org_id)
      .eq('is_connected', true)
  }

  console.log(`${LOG_PREFIX} Token refreshed for org ${integration.org_id}, expires ${tokenExpiresAt}`)
  return newAccessToken
}

// ---------------------------------------------------------------------------
// Sync orchestration
// ---------------------------------------------------------------------------

async function syncOrgMetrics(
  serviceClient: SupabaseClient,
  integration: LinkedInIntegration,
  startDate: string,
  endDate: string,
): Promise<{ campaigns_synced: number; metrics_upserted: number; demographics_upserted: number; error?: string }> {
  const { org_id, linkedin_ad_account_id: ad_account_id } = integration

  // Ensure we have a fresh access token before calling LinkedIn API
  const access_token_encrypted = await ensureFreshToken(serviceClient, integration)

  try {
    // 1. Fetch campaign list
    const campaigns = await fetchCampaignIds(access_token_encrypted, ad_account_id)
    if (campaigns.length === 0) {
      console.log(`${LOG_PREFIX} No campaigns found for org ${org_id}`)
      return { campaigns_synced: 0, metrics_upserted: 0, demographics_upserted: 0 }
    }
    console.log(`${LOG_PREFIX} Found ${campaigns.length} campaigns for org ${org_id}`)

    const campaignNameMap = new Map(campaigns.map(c => [c.id, c.name]))
    const campaignIds = campaigns.map(c => c.id)

    // 2. Fetch analytics in date range chunks
    const dateChunks = chunkDateRange(startDate, endDate)
    let metricsUpserted = 0

    for (const chunk of dateChunks) {
      const elements = await fetchCampaignAnalytics(access_token_encrypted, campaignIds, chunk)

      if (elements.length === 0) continue

      // Build rows for upsert
      const rows = elements.map((el: any) => {
        const campaignId = extractCampaignId(el.pivotValue ?? el.pivot ?? '')
        const derived = computeDerivedMetrics(el)
        const dateStart = el.dateRange?.start
        const metricDate = dateStart
          ? formatDate({ year: dateStart.year, month: dateStart.month, day: dateStart.day })
          : startDate

        return {
          org_id,
          campaign_id: campaignId,
          campaign_name: campaignNameMap.get(campaignId) ?? `Campaign ${campaignId}`,
          ad_account_id,
          date: metricDate,
          impressions: el.impressions ?? 0,
          clicks: el.clicks ?? 0,
          spend: parseFloat(el.costInLocalCurrency ?? '0'),
          leads: el.oneClickLeads ?? 0,
          conversions: el.externalWebsiteConversions ?? 0,
          video_views: el.videoViews ?? 0,
          video_completions: el.videoCompletions ?? 0,
          likes: el.likes ?? 0,
          comments: el.comments ?? 0,
          shares: el.shares ?? 0,
          follows: el.follows ?? 0,
          landing_page_clicks: el.landingPageClicks ?? 0,
          total_engagements: el.totalEngagements ?? 0,
          ctr: derived.ctr,
          cpm: derived.cpm,
          cpc: derived.cpc,
          cpl: derived.cpl,
        }
      })

      // Upsert in chunks of 100
      const CHUNK_SIZE = 100
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const batch = rows.slice(i, i + CHUNK_SIZE)
        const { error: upsertError } = await serviceClient
          .from('linkedin_campaign_metrics')
          .upsert(batch, { onConflict: 'org_id,campaign_id,date' })

        if (upsertError) {
          console.error(`${LOG_PREFIX} Upsert error for org ${org_id}: ${upsertError.message}`)
        } else {
          metricsUpserted += batch.length
        }
      }
    }

    // 3. Fetch demographic analytics
    let demographicsUpserted = 0
    const fullRange: DateRange = {
      start: parseDate(startDate),
      end: parseDate(endDate),
    }

    for (const pivot of DEMOGRAPHIC_PIVOTS) {
      try {
        const elements = await fetchDemographicAnalytics(
          access_token_encrypted, campaignIds, fullRange, pivot,
        )

        if (elements.length === 0) continue

        const demoRows = elements.map((el: any) => {
          const campaignId = extractCampaignId(el.pivotValues?.[0] ?? '')
          return {
            org_id,
            ad_account_id,
            campaign_id: campaignId || campaignIds[0] || '',
            date: startDate,
            pivot_type: pivot.replace('MEMBER_', ''),
            pivot_value: el.pivotValue ?? el.pivot ?? 'Unknown',
            impressions: el.impressions ?? 0,
            clicks: el.clicks ?? 0,
            spend: parseFloat(el.costInLocalCurrency ?? '0'),
          }
        })

        const { error: demoError } = await serviceClient
          .from('linkedin_demographic_metrics')
          .upsert(demoRows, { onConflict: 'org_id,campaign_id,date,pivot_type,pivot_value' })

        if (demoError) {
          console.warn(`${LOG_PREFIX} Demo upsert error (${pivot}): ${demoError.message}`)
        } else {
          demographicsUpserted += demoRows.length
        }
      } catch (demoErr) {
        // Don't let one pivot failure break the entire sync
        console.warn(`${LOG_PREFIX} Demographics fetch failed for ${pivot}: ${demoErr}`)
      }
    }

    return {
      campaigns_synced: campaigns.length,
      metrics_upserted: metricsUpserted,
      demographics_upserted: demographicsUpserted,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (message === 'LINKEDIN_TOKEN_EXPIRED') {
      console.warn(`${LOG_PREFIX} Token expired for org ${org_id}, skipping`)
      return { campaigns_synced: 0, metrics_upserted: 0, demographics_upserted: 0, error: 'Token expired' }
    }

    throw err
  }
}

/** Record a sync run in the tracking table */
async function recordSyncRun(
  serviceClient: SupabaseClient,
  orgId: string,
  status: 'complete' | 'error',
  details: Record<string, unknown>,
): Promise<void> {
  const { error } = await serviceClient
    .from('linkedin_analytics_sync_runs')
    .insert({
      org_id: orgId,
      ad_account_id: (details.ad_account_id as string) ?? 'unknown',
      sync_type: (details.sync_type as string) ?? 'manual',
      date_range_start: (details.date_range_start as string) ?? new Date().toISOString().split('T')[0],
      date_range_end: (details.date_range_end as string) ?? new Date().toISOString().split('T')[0],
      status,
      campaigns_synced: details.campaigns_synced ?? 0,
      metrics_upserted: details.metrics_upserted ?? 0,
      demographics_upserted: details.demographics_upserted ?? 0,
      error_message: details.error ?? null,
      started_at: details.started_at ?? new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })

  if (error) {
    console.error(`${LOG_PREFIX} Failed to record sync run: ${error.message}`)
  }
}

/** Get default date range (last 7 days) */
function getDefaultDateRange(): { startDate: string; endDate: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)
  return {
    startDate: formatDate({ year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate() }),
    endDate: formatDate({ year: end.getFullYear(), month: end.getMonth() + 1, day: end.getDate() }),
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleSync(
  serviceClient: SupabaseClient,
  body: RequestBody,
): Promise<Record<string, unknown>> {
  if (!body.org_id) return { error: 'org_id is required' }

  const { data: integration } = await serviceClient
    .from('linkedin_org_integrations')
    .select('id, org_id, linkedin_ad_account_id, access_token_encrypted, refresh_token_encrypted, token_expires_at')
    .eq('org_id', body.org_id)
    .eq('is_connected', true)
    .maybeSingle()

  if (!integration) {
    return { error: 'No active LinkedIn integration found for this org', status: 'not_configured' }
  }

  const { startDate, endDate } = body.start_date && body.end_date
    ? { startDate: body.start_date, endDate: body.end_date }
    : getDefaultDateRange()

  const startedAt = new Date().toISOString()
  const result = await syncOrgMetrics(serviceClient, integration as LinkedInIntegration, startDate, endDate)

  const runStatus = result.error ? 'error' : 'complete'
  await recordSyncRun(serviceClient, body.org_id, runStatus, {
    ...result,
    ad_account_id: integration.linkedin_ad_account_id,
    sync_type: 'manual',
    date_range_start: startDate,
    date_range_end: endDate,
    started_at: startedAt,
  })

  return {
    org_id: body.org_id,
    status: runStatus,
    date_range: { start: startDate, end: endDate },
    ...result,
  }
}

async function handleSyncAll(
  serviceClient: SupabaseClient,
): Promise<Record<string, unknown>> {
  const { data: integrations } = await serviceClient
    .from('linkedin_org_integrations')
    .select('id, org_id, linkedin_ad_account_id, access_token_encrypted, refresh_token_encrypted, token_expires_at')
    .eq('is_connected', true)

  if (!integrations || integrations.length === 0) {
    return { processed: 0, results: [] }
  }

  const { startDate, endDate } = getDefaultDateRange()
  const results: { org_id: string; status: string; campaigns_synced: number; error?: string }[] = []

  for (const integration of integrations) {
    const startedAt = new Date().toISOString()
    try {
      const result = await syncOrgMetrics(
        serviceClient,
        integration as LinkedInIntegration,
        startDate,
        endDate,
      )

      const runStatus = result.error ? 'error' : 'complete'
      await recordSyncRun(serviceClient, integration.org_id, runStatus, {
        ...result,
        ad_account_id: integration.linkedin_ad_account_id,
        sync_type: 'scheduled',
        date_range_start: startDate,
        date_range_end: endDate,
        started_at: startedAt,
      })

      results.push({
        org_id: integration.org_id,
        status: runStatus,
        campaigns_synced: result.campaigns_synced,
        error: result.error,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`${LOG_PREFIX} Sync failed for org ${integration.org_id}: ${message}`)

      await recordSyncRun(serviceClient, integration.org_id, 'error', {
        campaigns_synced: 0,
        metrics_upserted: 0,
        demographics_upserted: 0,
        ad_account_id: integration.linkedin_ad_account_id,
        sync_type: 'scheduled',
        date_range_start: startDate,
        date_range_end: endDate,
        error: message,
        started_at: startedAt,
      })

      results.push({
        org_id: integration.org_id,
        status: 'error',
        campaigns_synced: 0,
        error: message,
      })
    }
  }

  return {
    processed: results.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'error').length,
    date_range: { start: startDate, end: endDate },
    results,
  }
}

async function handleBackfill(
  serviceClient: SupabaseClient,
  body: RequestBody,
): Promise<Record<string, unknown>> {
  if (!body.org_id) return { error: 'org_id is required' }

  const { data: integration } = await serviceClient
    .from('linkedin_org_integrations')
    .select('id, org_id, linkedin_ad_account_id, access_token_encrypted, refresh_token_encrypted, token_expires_at')
    .eq('org_id', body.org_id)
    .eq('is_connected', true)
    .maybeSingle()

  if (!integration) {
    return { error: 'No active LinkedIn integration found for this org', status: 'not_configured' }
  }

  const lookbackDays = body.lookback_days ?? 90
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - lookbackDays)

  const startDate = formatDate({ year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate() })
  const endDate = formatDate({ year: end.getFullYear(), month: end.getMonth() + 1, day: end.getDate() })

  console.log(`${LOG_PREFIX} Backfilling ${lookbackDays} days for org ${body.org_id} (${startDate} to ${endDate})`)

  const startedAt = new Date().toISOString()
  const result = await syncOrgMetrics(serviceClient, integration as LinkedInIntegration, startDate, endDate)

  const runStatus = result.error ? 'error' : 'complete'
  await recordSyncRun(serviceClient, body.org_id, runStatus, {
    ...result,
    ad_account_id: integration.linkedin_ad_account_id,
    sync_type: 'backfill',
    date_range_start: startDate,
    date_range_end: endDate,
    started_at: startedAt,
  })

  return {
    org_id: body.org_id,
    status: runStatus,
    lookback_days: lookbackDays,
    date_range: { start: startDate, end: endDate },
    ...result,
  }
}

async function handleStatus(
  serviceClient: SupabaseClient,
  body: RequestBody,
): Promise<Record<string, unknown>> {
  if (!body.org_id) return { error: 'org_id is required' }

  const { data: runs, error } = await serviceClient
    .from('linkedin_analytics_sync_runs')
    .select('id, org_id, status, campaigns_synced, metrics_upserted, demographics_upserted, error_message, started_at, completed_at')
    .eq('org_id', body.org_id)
    .order('completed_at', { ascending: false })
    .limit(20)

  if (error) {
    return { error: `Failed to fetch sync runs: ${error.message}` }
  }

  // Get latest metric date
  const { data: latestMetric } = await serviceClient
    .from('linkedin_campaign_metrics')
    .select('date')
    .eq('org_id', body.org_id)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    org_id: body.org_id,
    recent_runs: runs ?? [],
    latest_metric_date: latestMetric?.date ?? null,
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

    if (!action || !['sync', 'sync_all', 'backfill', 'status'].includes(action)) {
      return errorResponse('Invalid action. Must be one of: sync, sync_all, backfill, status', req, 400)
    }

    // Auth: cron or JWT
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
      case 'backfill':
        result = await handleBackfill(serviceClient, body)
        break
      case 'status':
        result = await handleStatus(serviceClient, body)
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
