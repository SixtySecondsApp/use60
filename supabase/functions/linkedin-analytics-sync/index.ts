import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
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

const LINKEDIN_API_VERSION = '202511'
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

/** Fetch the first active ad account for the authenticated user */
async function fetchAdAccountId(
  accessToken: string,
): Promise<{ id: string; name: string; _debug?: string[] } | null> {
  const debugLog: string[] = []

  // Strategy 1: REST API with status filter
  // Strategy 2: REST API without status filter
  // Strategy 3: Legacy v2 API (different response format)
  const strategies: { url: string; headers: Record<string, string>; label: string }[] = [
    {
      url: `https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE)))&count=10`,
      headers: linkedInHeaders(accessToken),
      label: 'REST /rest/adAccounts (active filter)',
    },
    {
      url: `https://api.linkedin.com/rest/adAccounts?q=search&count=10`,
      headers: linkedInHeaders(accessToken),
      label: 'REST /rest/adAccounts (no filter)',
    },
    {
      url: `https://api.linkedin.com/v2/adAccountsV2?q=search&search=(status:(values:List(ACTIVE)))&count=10`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      label: 'Legacy /v2/adAccountsV2 (active filter)',
    },
    {
      url: `https://api.linkedin.com/v2/adAccountsV2?q=search&count=10`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      label: 'Legacy /v2/adAccountsV2 (no filter)',
    },
  ]

  for (const { url, headers, label } of strategies) {
    try {
      const response = await fetch(url, { headers })
      const text = await response.text()
      const snippet = text.slice(0, 400)
      debugLog.push(`[${label}] ${response.status}: ${snippet}`)
      console.log(`${LOG_PREFIX} ${label} => ${response.status}: ${snippet}`)

      if (response.ok) {
        const data = JSON.parse(text)
        const account = data?.elements?.[0]
        if (account) {
          const rawId = account.id ? String(account.id) : ''
          const id = rawId.replace('urn:li:sponsoredAccount:', '')
          const name = account.name || `Account ${id}`
          if (id) return { id, name }
        }
      }
    } catch (err) {
      const msg = `[${label}] Error: ${err}`
      debugLog.push(msg)
      console.warn(`${LOG_PREFIX} ${msg}`)
    }
  }

  // Return null but attach debug info for the caller
  console.error(`${LOG_PREFIX} All ad account strategies failed. Debug: ${JSON.stringify(debugLog)}`)
  return null
}

/** Statuses worth syncing — skip ARCHIVED, CANCELED, DRAFT */
const SYNCABLE_STATUSES = new Set(['ACTIVE', 'PAUSED', 'COMPLETED'])

/** Fetch campaign IDs for an ad account, filtered to active/recent campaigns */
async function fetchCampaignIds(
  accessToken: string,
  adAccountId: string,
): Promise<{ id: string; name: string; status: string }[]> {
  const accountId = adAccountId.replace('urn:li:sponsoredAccount:', '')

  const allCampaigns: { id: string; name: string; status: string }[] = []
  let start = 0
  const count = 100

  // Strategy 1: REST path-based endpoint (preferred, scoped to account)
  const restUrl = `https://api.linkedin.com/rest/adAccounts/${accountId}/adCampaigns`
  try {
    while (true) {
      const url = `${restUrl}?q=search&count=${count}&start=${start}`
      const response = await fetchWithRetry(url, linkedInHeaders(accessToken))

      if (response.status === 401) throw new Error('LINKEDIN_TOKEN_EXPIRED')

      if (!response.ok) {
        const text = await response.text()
        console.warn(`${LOG_PREFIX} REST path campaigns (${response.status}): ${text.slice(0, 300)}`)
        break
      }

      const data = await response.json()
      const elements = data.elements ?? []
      for (const el of elements) {
        const status = el.status ?? 'UNKNOWN'
        if (!SYNCABLE_STATUSES.has(status)) continue
        allCampaigns.push({
          id: String(el.id ?? '').replace('urn:li:sponsoredCampaign:', ''),
          name: el.name ?? `Campaign ${el.id}`,
          status,
        })
      }

      const hasMore = data.metadata?.nextPageToken || (data.paging && start + count < (data.paging.total ?? 0))
      start += count
      if (!hasMore || elements.length === 0) break
    }

    if (allCampaigns.length > 0) {
      console.log(`${LOG_PREFIX} Found ${allCampaigns.length} syncable campaigns (ACTIVE/PAUSED/COMPLETED) via REST path`)
      return allCampaigns
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'LINKEDIN_TOKEN_EXPIRED') throw err
    console.warn(`${LOG_PREFIX} REST path endpoint error: ${err}`)
  }

  // Strategy 2: Legacy v2 endpoint fallback
  start = 0
  try {
    while (true) {
      const url = `https://api.linkedin.com/v2/adCampaignsV2?q=search&count=${count}&start=${start}`
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      }
      const response = await fetchWithRetry(url, headers)

      if (response.status === 401) throw new Error('LINKEDIN_TOKEN_EXPIRED')

      if (!response.ok) {
        const text = await response.text()
        console.warn(`${LOG_PREFIX} v2 campaigns (${response.status}): ${text.slice(0, 300)}`)
        break
      }

      const data = await response.json()
      const elements = data.elements ?? []
      for (const el of elements) {
        const elAccount = String(el.account ?? '')
        const matchesAccount = elAccount === `urn:li:sponsoredAccount:${accountId}` || elAccount === accountId
        const status = el.status ?? 'UNKNOWN'
        if (matchesAccount && SYNCABLE_STATUSES.has(status)) {
          allCampaigns.push({
            id: String(el.id ?? '').replace('urn:li:sponsoredCampaign:', ''),
            name: el.name ?? `Campaign ${el.id}`,
            status,
          })
        }
      }

      const total = data.paging?.total ?? elements.length
      start += count
      if (start >= total || elements.length === 0) break
    }

    if (allCampaigns.length > 0) {
      console.log(`${LOG_PREFIX} Found ${allCampaigns.length} syncable campaigns via v2 (filtered to account ${accountId})`)
      return allCampaigns
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'LINKEDIN_TOKEN_EXPIRED') throw err
    console.warn(`${LOG_PREFIX} v2 campaigns error: ${err}`)
  }

  console.log(`${LOG_PREFIX} No syncable campaigns found for account ${accountId}`)
  return []
}

/** URL-encode a URN for use in LinkedIn query parameters */
function encodeUrn(urn: string): string {
  return urn.replace(/:/g, '%3A')
}

/** Build dot-notation dateRange params for v2 API */
function buildV2DateRange(dr: DateRange): string {
  return `dateRange.start.year=${dr.start.year}&dateRange.start.month=${dr.start.month}&dateRange.start.day=${dr.start.day}&dateRange.end.year=${dr.end.year}&dateRange.end.month=${dr.end.month}&dateRange.end.day=${dr.end.day}`
}

/** Build parenthesized dateRange param for REST API */
function buildRestDateRange(dr: DateRange): string {
  return `dateRange=(start:(year:${dr.start.year},month:${dr.start.month},day:${dr.start.day}),end:(year:${dr.end.year},month:${dr.end.month},day:${dr.end.day}))`
}

/** Fetch analytics for an ad account in a date range chunk (account-level query) */
async function fetchAccountAnalytics(
  accessToken: string,
  adAccountId: string,
  dateRange: DateRange,
): Promise<any[]> {
  const accountUrn = encodeUrn(`urn:li:sponsoredAccount:${adAccountId}`)
  const restFields = `${ANALYTICS_FIELDS},pivotValues,dateRange`
  const v2Fields = `${ANALYTICS_FIELDS},pivotValue,dateRange`

  // Strategy 1: REST endpoint with parenthesized dateRange — official format
  // Use count=10000 to minimize pagination (LinkedIn allows up to 10000)
  const restBaseUrl = `https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&${buildRestDateRange(dateRange)}&timeGranularity=DAILY&accounts=List(${accountUrn})&fields=${restFields}&count=10000`
  try {
    let allElements: any[] = []
    let start = 0
    while (true) {
      const restUrl = `${restBaseUrl}&start=${start}`
      const response = await fetchWithRetry(restUrl, linkedInHeaders(accessToken))
      if (response.status === 401) throw new Error('LINKEDIN_TOKEN_EXPIRED')
      if (!response.ok) {
        const text = await response.text()
        console.warn(`${LOG_PREFIX} REST account analytics (${response.status}): ${text.slice(0, 300)}`)
        break
      }
      const data = await response.json()
      const elements = data.elements ?? []
      allElements = allElements.concat(elements)
      // Check if more pages exist
      const hasNext = data.paging?.links?.some((l: any) => l.rel === 'next')
      if (!hasNext || elements.length === 0) break
      start += elements.length
    }
    if (allElements.length > 0) {
      console.log(`${LOG_PREFIX} REST account analytics: ${allElements.length} elements`)
      return allElements
    }
    console.log(`${LOG_PREFIX} REST account analytics: 0 elements (200 OK)`)
  } catch (err) {
    if (err instanceof Error && err.message === 'LINKEDIN_TOKEN_EXPIRED') throw err
    console.warn(`${LOG_PREFIX} REST account analytics error: ${err}`)
  }

  // Strategy 2: v2 endpoint with dot-notation dateRange — legacy but often works
  const v2Url = `https://api.linkedin.com/v2/adAnalyticsV2?q=analytics&pivot=CAMPAIGN&${buildV2DateRange(dateRange)}&timeGranularity=DAILY&accounts=${accountUrn}&fields=${v2Fields}`
  const v2Headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
  }
  try {
    const response = await fetchWithRetry(v2Url, v2Headers)
    if (response.status === 401) throw new Error('LINKEDIN_TOKEN_EXPIRED')
    if (response.ok) {
      const data = await response.json()
      const elements = data.elements ?? []
      // v2 uses pivotValue (singular) — normalize to pivotValues array
      for (const el of elements) {
        if (el.pivotValue && !el.pivotValues) {
          el.pivotValues = [el.pivotValue]
        }
      }
      if (elements.length > 0) {
        console.log(`${LOG_PREFIX} v2 account analytics: ${elements.length} elements`)
        return elements
      }
      console.log(`${LOG_PREFIX} v2 account analytics: 0 elements (200 OK)`)
    } else {
      const text = await response.text()
      console.warn(`${LOG_PREFIX} v2 account analytics (${response.status}): ${text.slice(0, 300)}`)
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'LINKEDIN_TOKEN_EXPIRED') throw err
    console.warn(`${LOG_PREFIX} v2 account analytics error: ${err}`)
  }

  // Strategy 3: v2 with parenthesized dateRange (old format, last resort)
  const v2ParenUrl = `https://api.linkedin.com/v2/adAnalyticsV2?q=analytics&pivot=CAMPAIGN&dateRange=(start:(year:${dateRange.start.year},month:${dateRange.start.month},day:${dateRange.start.day}),end:(year:${dateRange.end.year},month:${dateRange.end.month},day:${dateRange.end.day}))&timeGranularity=DAILY&accounts=${accountUrn}&fields=${v2Fields}`
  try {
    const response = await fetchWithRetry(v2ParenUrl, v2Headers)
    if (response.status === 401) throw new Error('LINKEDIN_TOKEN_EXPIRED')
    if (response.ok) {
      const data = await response.json()
      const elements = data.elements ?? []
      for (const el of elements) {
        if (el.pivotValue && !el.pivotValues) {
          el.pivotValues = [el.pivotValue]
        }
      }
      if (elements.length > 0) {
        console.log(`${LOG_PREFIX} v2 paren account analytics: ${elements.length} elements`)
        return elements
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'LINKEDIN_TOKEN_EXPIRED') throw err
    console.warn(`${LOG_PREFIX} v2 paren account analytics error: ${err}`)
  }

  console.warn(`${LOG_PREFIX} All analytics strategies returned 0 elements for account ${adAccountId}`)
  return []
}

/** Fetch demographic analytics for an ad account with a specific pivot */
async function fetchDemographicAnalytics(
  accessToken: string,
  adAccountId: string,
  dateRange: DateRange,
  pivot: string,
): Promise<any[]> {
  const accountUrn = encodeUrn(`urn:li:sponsoredAccount:${adAccountId}`)

  // Strategy 1: REST endpoint
  const restUrl = `https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=${pivot}&${buildRestDateRange(dateRange)}&timeGranularity=ALL&accounts=List(${accountUrn})&fields=impressions,clicks,costInLocalCurrency,pivotValues&count=10000`
  try {
    const response = await fetchWithRetry(restUrl, linkedInHeaders(accessToken))
    if (response.status === 401) throw new Error('LINKEDIN_TOKEN_EXPIRED')
    if (response.ok) {
      const data = await response.json()
      const elements = data.elements ?? []
      if (elements.length > 0) return elements
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'LINKEDIN_TOKEN_EXPIRED') throw err
    console.warn(`${LOG_PREFIX} REST demographics ${pivot} error: ${err}`)
  }

  // Strategy 2: v2 endpoint with dot notation
  const v2Url = `https://api.linkedin.com/v2/adAnalyticsV2?q=analytics&pivot=${pivot}&${buildV2DateRange(dateRange)}&timeGranularity=ALL&accounts=${accountUrn}&fields=impressions,clicks,costInLocalCurrency,pivotValue`
  const v2Headers = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
  }
  try {
    const response = await fetchWithRetry(v2Url, v2Headers)
    if (response.status === 401) throw new Error('LINKEDIN_TOKEN_EXPIRED')
    if (response.ok) {
      const data = await response.json()
      const elements = data.elements ?? []
      // Normalize v2 pivotValue → pivotValues
      for (const el of elements) {
        if (el.pivotValue && !el.pivotValues) {
          el.pivotValues = [el.pivotValue]
        }
      }
      if (elements.length > 0) return elements
    } else {
      const text = await response.text()
      console.warn(`${LOG_PREFIX} v2 demographics ${pivot} (${response.status}): ${text.slice(0, 200)}`)
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'LINKEDIN_TOKEN_EXPIRED') throw err
    console.warn(`${LOG_PREFIX} v2 demographics ${pivot} error: ${err}`)
  }

  return []
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
  const { org_id } = integration
  let ad_account_id = integration.linkedin_ad_account_id

  // Ensure we have a fresh access token before calling LinkedIn API
  const access_token_encrypted = await ensureFreshToken(serviceClient, integration)

  // If no ad account ID stored, fetch it from LinkedIn and persist
  if (!ad_account_id) {
    console.log(`${LOG_PREFIX} No ad account ID stored for org ${org_id}, fetching from LinkedIn...`)
    const fetchedResult = await fetchAdAccountId(access_token_encrypted)
    if (!fetchedResult) {
      return { campaigns_synced: 0, metrics_upserted: 0, demographics_upserted: 0, error: 'No LinkedIn ad accounts found. See debug_log for API responses.', debug_log: 'Check edge function logs — all 4 LinkedIn API strategies returned empty.' }
    }
    const fetchedId = fetchedResult
    ad_account_id = fetchedId.id
    // Persist so we don't fetch every time
    await serviceClient
      .from('linkedin_org_integrations')
      .update({ linkedin_ad_account_id: fetchedId.id, linkedin_ad_account_name: fetchedId.name, updated_at: new Date().toISOString() })
      .eq('id', integration.id)
    console.log(`${LOG_PREFIX} Stored ad account ${fetchedId.id} (${fetchedId.name}) for org ${org_id}`)
  }

  try {
    // 1. Fetch analytics by account — no need to list campaigns first
    const dateChunks = chunkDateRange(startDate, endDate)
    let metricsUpserted = 0
    const seenCampaignIds = new Set<string>()

    for (const chunk of dateChunks) {
      const elements = await fetchAccountAnalytics(access_token_encrypted, ad_account_id!, chunk)

      if (elements.length === 0) continue

      // Build rows for upsert
      const rows = elements.map((el: any) => {
        const pivotVal = el.pivotValues?.[0] ?? el.pivotValue ?? el.pivot ?? ''
        const campaignId = extractCampaignId(pivotVal)
        seenCampaignIds.add(campaignId)
        const derived = computeDerivedMetrics(el)
        const dateStart = el.dateRange?.start
        const metricDate = dateStart
          ? formatDate({ year: dateStart.year, month: dateStart.month, day: dateStart.day })
          : startDate

        return {
          org_id,
          campaign_id: campaignId,
          campaign_name: `Campaign ${campaignId}`, // placeholder — updated below
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

    // 2. Fetch campaign names — REST path endpoint with large page size
    if (seenCampaignIds.size > 0) {
      try {
        const accountId = ad_account_id!.replace('urn:li:sponsoredAccount:', '')
        const nameMap = new Map<string, string>()
        // Fetch campaigns with count=500 to cover most accounts in one request
        // Paginate with fields=id,name using cursor-based pageToken (REST uses tokens, not offsets)
        let pageToken: string | null = null
        const NAME_PAGE = 100
        let totalFetched = 0
        while (true) {
          let nameUrl = `https://api.linkedin.com/rest/adAccounts/${accountId}/adCampaigns?q=search&count=${NAME_PAGE}&fields=id,name`
          if (pageToken) nameUrl += `&pageToken=${encodeURIComponent(pageToken)}`
          const nameResp = await fetch(nameUrl, { headers: linkedInHeaders(access_token_encrypted) })
          if (!nameResp.ok) {
            console.warn(`${LOG_PREFIX} Campaign name fetch (${nameResp.status})`)
            break
          }
          const nameData = await nameResp.json()
          const elements = nameData.elements ?? []
          totalFetched += elements.length
          for (const el of elements) {
            const id = String(el.id ?? '').replace('urn:li:sponsoredCampaign:', '')
            if (seenCampaignIds.has(id) && el.name) {
              nameMap.set(id, el.name)
            }
          }
          // Stop if all names found or no more pages
          if (nameMap.size >= seenCampaignIds.size) break
          const nextToken = nameData.metadata?.nextPageToken
          if (!nextToken || elements.length === 0) break
          pageToken = nextToken
        }
        console.log(`${LOG_PREFIX} Scanned ${totalFetched} campaigns, matched ${nameMap.size}/${seenCampaignIds.size} names`)
        for (const [cid, cname] of nameMap) {
          await serviceClient
            .from('linkedin_campaign_metrics')
            .update({ campaign_name: cname })
            .eq('org_id', org_id)
            .eq('campaign_id', cid)
        }
      } catch (nameErr) {
        console.warn(`${LOG_PREFIX} Campaign name fetch failed (non-critical): ${nameErr}`)
      }
    }

    // 3. Skip demographics on regular sync (too slow — 6 API calls)
    // Demographics are fetched on backfill action only
    const demographicsUpserted = 0

    return {
      campaigns_synced: seenCampaignIds.size,
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

/** Get default date range (last 30 days) */
function getDefaultDateRange(): { startDate: string; endDate: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
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

/** Diagnostic action — raw LinkedIn API responses for debugging */
async function handleDiagnose(
  serviceClient: SupabaseClient,
  body: RequestBody,
): Promise<Record<string, unknown>> {
  if (!body.org_id) return { error: 'org_id is required' }

  const { data: integration } = await serviceClient
    .from('linkedin_org_integrations')
    .select('id, org_id, linkedin_ad_account_id, linkedin_ad_account_name, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes')
    .eq('org_id', body.org_id)
    .eq('is_connected', true)
    .maybeSingle()

  if (!integration) return { error: 'No active LinkedIn integration' }

  const token = await ensureFreshToken(serviceClient, integration as LinkedInIntegration)
  const adAccountId = integration.linkedin_ad_account_id
  const results: Record<string, unknown> = {
    ad_account_id: adAccountId,
    ad_account_name: integration.linkedin_ad_account_name,
    scopes: integration.scopes,
    token_valid: !!token,
  }

  if (!adAccountId) return { ...results, error: 'No ad account ID stored' }

  const restHeaders = linkedInHeaders(token)
  const v2Headers = { 'Authorization': `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' }

  // Test campaigns
  const campaignTests = [
    { url: `https://api.linkedin.com/rest/adAccounts/${adAccountId}/adCampaigns?q=search&count=3&fields=id,name,status`, headers: restHeaders, label: 'campaigns' },
  ]

  for (const { url, headers, label } of campaignTests) {
    try {
      const r = await fetch(url, { headers })
      const t = await r.text()
      results[label] = { status: r.status, body: t.slice(0, 600) }
    } catch (e) {
      results[label] = { error: String(e) }
    }
  }

  // Test analytics with account-level queries — wider date range (90 days)
  const today = new Date()
  const ninetyDaysAgo = new Date(today)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const accountUrn = encodeUrn(`urn:li:sponsoredAccount:${adAccountId}`)

  const analyticsTests = [
    // REST: account-level, parenthesized dateRange (official format per docs)
    {
      url: `https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&dateRange=(start:(year:${ninetyDaysAgo.getFullYear()},month:${ninetyDaysAgo.getMonth() + 1},day:${ninetyDaysAgo.getDate()}),end:(year:${today.getFullYear()},month:${today.getMonth() + 1},day:${today.getDate()}))&timeGranularity=ALL&accounts=List(${accountUrn})&fields=impressions,clicks,costInLocalCurrency,pivotValues,dateRange`,
      headers: restHeaders,
      label: 'rest_account_paren',
    },
    // v2: account-level, dot-notation dateRange (v2 format per docs)
    {
      url: `https://api.linkedin.com/v2/adAnalyticsV2?q=analytics&pivot=CAMPAIGN&dateRange.start.year=${ninetyDaysAgo.getFullYear()}&dateRange.start.month=${ninetyDaysAgo.getMonth() + 1}&dateRange.start.day=${ninetyDaysAgo.getDate()}&dateRange.end.year=${today.getFullYear()}&dateRange.end.month=${today.getMonth() + 1}&dateRange.end.day=${today.getDate()}&timeGranularity=ALL&accounts=${accountUrn}&fields=impressions,clicks,costInLocalCurrency,pivotValue,dateRange`,
      headers: v2Headers,
      label: 'v2_account_dot',
    },
    // v2: account-level, parenthesized dateRange (fallback)
    {
      url: `https://api.linkedin.com/v2/adAnalyticsV2?q=analytics&pivot=CAMPAIGN&dateRange=(start:(year:${ninetyDaysAgo.getFullYear()},month:${ninetyDaysAgo.getMonth() + 1},day:${ninetyDaysAgo.getDate()}),end:(year:${today.getFullYear()},month:${today.getMonth() + 1},day:${today.getDate()}))&timeGranularity=ALL&accounts=${accountUrn}&fields=impressions,clicks,costInLocalCurrency,pivotValue,dateRange`,
      headers: v2Headers,
      label: 'v2_account_paren',
    },
    // REST: no fields param (test if fields is causing issues)
    {
      url: `https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&dateRange=(start:(year:${ninetyDaysAgo.getFullYear()},month:${ninetyDaysAgo.getMonth() + 1},day:${ninetyDaysAgo.getDate()}),end:(year:${today.getFullYear()},month:${today.getMonth() + 1},day:${today.getDate()}))&timeGranularity=ALL&accounts=List(${accountUrn})`,
      headers: restHeaders,
      label: 'rest_account_no_fields',
    },
  ]

  for (const { url, headers, label } of analyticsTests) {
    try {
      const r = await fetch(url, { headers })
      const t = await r.text()
      results[label] = { status: r.status, body: t.slice(0, 800) }
    } catch (e) {
      results[label] = { error: String(e) }
    }
  }

  return results
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

    if (!action || !['sync', 'sync_all', 'backfill', 'status', 'diagnose'].includes(action)) {
      return errorResponse('Invalid action. Must be one of: sync, sync_all, backfill, status, diagnose', req, 400)
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
      case 'diagnose':
        result = await handleDiagnose(serviceClient, body)
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
