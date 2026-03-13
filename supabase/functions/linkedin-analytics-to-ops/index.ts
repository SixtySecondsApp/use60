import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Analytics → Ops Table
//
// Reads LinkedIn campaign metrics (from linkedin_campaign_metrics table or
// directly from the LinkedIn Analytics API) and writes aggregated values
// into dynamic_table_cells for linkedin_analytics column types.
//
// POST body:
//   { table_id, column_id?, metric?, date_range?, row_ids?: string[] }
//
// If column_id is provided: sync just that column.
// Otherwise: sync ALL linkedin_analytics columns in the table.
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[linkedin-analytics-to-ops]'
const CHUNK_SIZE = 50

const LINKEDIN_API_VERSION = '202511'
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestBody {
  table_id: string
  column_id?: string
  metric?: string
  date_range?: string
  row_ids?: string[]
}

interface DateRange {
  start: { year: number; month: number; day: number }
  end: { year: number; month: number; day: number }
}

interface LinkedInIntegration {
  id: string
  org_id: string
  linkedin_ad_account_id: string | null
  access_token_encrypted: string
  refresh_token_encrypted?: string | null
  token_expires_at?: string | null
}

interface AnalyticsColumn {
  id: string
  key: string
  label: string
  integration_config: {
    metric?: string
    date_range?: string
    refresh_schedule?: string
  } | null
}

interface CellUpsert {
  row_id: string
  column_id: string
  value: string | null
  metadata: Record<string, unknown>
  status: string
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

/** Parse YYYY-MM-DD into { year, month, day } */
function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { year, month, day }
}

/** Resolve a named date_range string to { startDate, endDate } in YYYY-MM-DD */
function resolveDateRange(dateRange: string): { startDate: string; endDate: string } {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const subtractDays = (days: number): string => {
    const d = new Date(today)
    d.setDate(d.getDate() - days)
    return d.toISOString().split('T')[0]
  }

  switch (dateRange) {
    case 'last_7_days':
      return { startDate: subtractDays(7), endDate: todayStr }
    case 'last_14_days':
      return { startDate: subtractDays(14), endDate: todayStr }
    case 'last_30_days':
      return { startDate: subtractDays(30), endDate: todayStr }
    case 'last_60_days':
      return { startDate: subtractDays(60), endDate: todayStr }
    case 'last_90_days':
      return { startDate: subtractDays(90), endDate: todayStr }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { startDate: start.toISOString().split('T')[0], endDate: todayStr }
    }
    case 'last_month': {
      const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
      return {
        startDate: firstOfLastMonth.toISOString().split('T')[0],
        endDate: lastOfLastMonth.toISOString().split('T')[0],
      }
    }
    default:
      // Default to last 30 days
      return { startDate: subtractDays(30), endDate: todayStr }
  }
}

/** Build parenthesized dateRange param for REST API */
function buildRestDateRange(dr: DateRange): string {
  return `dateRange=(start:(year:${dr.start.year},month:${dr.start.month},day:${dr.start.day}),end:(year:${dr.end.year},month:${dr.end.month},day:${dr.end.day}))`
}

/** Build dot-notation dateRange params for v2 API */
function buildV2DateRange(dr: DateRange): string {
  return `dateRange.start.year=${dr.start.year}&dateRange.start.month=${dr.start.month}&dateRange.start.day=${dr.start.day}&dateRange.end.year=${dr.end.year}&dateRange.end.month=${dr.end.month}&dateRange.end.day=${dr.end.day}`
}

/** URL-encode a URN for use in LinkedIn query parameters */
function encodeUrn(urn: string): string {
  return urn.replace(/:/g, '%3A')
}

/** Fetch with retry + exponential backoff for 429s */
async function fetchWithRetry(url: string, headers: Record<string, string>, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, { headers })

    if (response.status === 429) {
      const waitMs = 2000 * Math.pow(2, attempt)
      console.warn(`${LOG_PREFIX} Throttled (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, waitMs))
      continue
    }

    return response
  }

  return await fetch(url, { headers })
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

async function ensureFreshToken(
  svc: SupabaseClient,
  integration: LinkedInIntegration,
): Promise<string> {
  const accessToken = integration.access_token_encrypted

  // Check if token is still valid (10 min buffer)
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at)
    if (expiresAt.getTime() > Date.now() + 10 * 60 * 1000) {
      return accessToken
    }
  }

  const refreshToken = integration.refresh_token_encrypted
  if (!refreshToken) {
    throw new Error('LINKEDIN_TOKEN_EXPIRED')
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
      await svc
        .from('linkedin_org_integrations')
        .update({ is_connected: false, updated_at: new Date().toISOString() })
        .eq('id', integration.id)
    }
    throw new Error('LINKEDIN_TOKEN_EXPIRED')
  }

  const tokenData = await tokenResp.json()
  const newAccessToken = String(tokenData.access_token || '')
  const newRefreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : refreshToken
  const expiresIn = Number(tokenData.expires_in || 5184000)
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  await svc
    .from('linkedin_org_integrations')
    .update({
      access_token_encrypted: newAccessToken,
      refresh_token_encrypted: newRefreshToken,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id)

  console.log(`${LOG_PREFIX} Token refreshed for org ${integration.org_id}`)
  return newAccessToken
}

// ---------------------------------------------------------------------------
// LinkedIn Analytics API — CREATIVE pivot
// ---------------------------------------------------------------------------

/**
 * Fetch creative-level analytics from LinkedIn REST API.
 * Returns map of creative URN → aggregated metric value.
 * Tries REST API first, falls back to v2.
 */
async function fetchCreativeAnalytics(
  accessToken: string,
  adAccountId: string,
  creativeUrns: string[],
  metric: string,
  dateRange: DateRange,
): Promise<Map<string, number>> {
  const accountUrn = encodeUrn(`urn:li:sponsoredAccount:${adAccountId}`)

  // Fields always include the requested metric + pivotValues for creative identification
  const fields = `${getApiMetricField(metric)},pivotValues`

  // Strategy 1: REST API with CREATIVE pivot, filtered by creatives list
  const creativeList = creativeUrns.map(encodeUrn).join(',')
  const restUrl = [
    `https://api.linkedin.com/rest/adAnalytics`,
    `?q=analytics`,
    `&pivot=CREATIVE`,
    `&${buildRestDateRange(dateRange)}`,
    `&timeGranularity=ALL`,
    `&accounts=List(${accountUrn})`,
    `&creatives=List(${creativeList})`,
    `&fields=${fields}`,
    `&count=1000`,
  ].join('')

  try {
    const response = await fetchWithRetry(restUrl, linkedInHeaders(accessToken))
    if (response.status === 401) throw new Error('LINKEDIN_TOKEN_EXPIRED')
    if (response.ok) {
      const data = await response.json()
      const elements: any[] = data.elements ?? []
      if (elements.length > 0) {
        console.log(`${LOG_PREFIX} REST creative analytics: ${elements.length} elements`)
        return buildCreativeMetricMap(elements, metric)
      }
    } else {
      const text = await response.text()
      console.warn(`${LOG_PREFIX} REST creative analytics (${response.status}): ${text.slice(0, 300)}`)
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'LINKEDIN_TOKEN_EXPIRED') throw err
    console.warn(`${LOG_PREFIX} REST creative analytics error: ${err}`)
  }

  // Strategy 2: v2 API fallback
  const v2Url = [
    `https://api.linkedin.com/v2/adAnalyticsV2`,
    `?q=analytics`,
    `&pivot=CREATIVE`,
    `&${buildV2DateRange(dateRange)}`,
    `&timeGranularity=ALL`,
    `&accounts=${accountUrn}`,
    `&fields=${getApiMetricField(metric)},pivotValue`,
  ].join('')

  try {
    const v2Headers = {
      'Authorization': `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    }
    const response = await fetchWithRetry(v2Url, v2Headers)
    if (response.status === 401) throw new Error('LINKEDIN_TOKEN_EXPIRED')
    if (response.ok) {
      const data = await response.json()
      const elements: any[] = data.elements ?? []
      // Normalize pivotValue → pivotValues
      for (const el of elements) {
        if (el.pivotValue && !el.pivotValues) {
          el.pivotValues = [el.pivotValue]
        }
      }
      if (elements.length > 0) {
        console.log(`${LOG_PREFIX} v2 creative analytics: ${elements.length} elements`)
        return buildCreativeMetricMap(elements, metric)
      }
    } else {
      const text = await response.text()
      console.warn(`${LOG_PREFIX} v2 creative analytics (${response.status}): ${text.slice(0, 300)}`)
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'LINKEDIN_TOKEN_EXPIRED') throw err
    console.warn(`${LOG_PREFIX} v2 creative analytics error: ${err}`)
  }

  console.warn(`${LOG_PREFIX} All creative analytics strategies returned empty for account ${adAccountId}`)
  return new Map()
}

/**
 * Map LinkedIn API field name for a given metric key.
 * Derived metrics (ctr, cpm, cpc, cpl) need their base fields for computation.
 */
function getApiMetricField(metric: string): string {
  switch (metric) {
    case 'impressions': return 'impressions'
    case 'clicks': return 'clicks'
    case 'spend': return 'costInLocalCurrency'
    case 'leads': return 'oneClickLeads,externalWebsiteConversions'
    case 'conversions': return 'externalWebsiteConversions'
    case 'video_views': return 'videoViews'
    case 'video_completions': return 'videoCompletions'
    case 'likes': return 'likes'
    case 'comments': return 'comments'
    case 'shares': return 'shares'
    case 'follows': return 'follows'
    case 'landing_page_clicks': return 'landingPageClicks'
    case 'total_engagements': return 'totalEngagements'
    // Derived metrics: fetch the required fields
    case 'ctr': return 'impressions,clicks'
    case 'cpm': return 'impressions,costInLocalCurrency'
    case 'cpc': return 'clicks,costInLocalCurrency'
    case 'cpl': return 'oneClickLeads,externalWebsiteConversions,costInLocalCurrency'
    default: return metric // pass through
  }
}

/**
 * Build a map of creative URN → aggregated metric value from API elements.
 */
function buildCreativeMetricMap(elements: any[], metric: string): Map<string, number> {
  const result = new Map<string, number>()

  for (const el of elements) {
    const pivotValues: string[] = el.pivotValues ?? (el.pivotValue ? [el.pivotValue] : [])
    if (pivotValues.length === 0) continue

    const creativeUrn = pivotValues[0] // e.g. "urn:li:sponsoredCreative:12345"
    const value = extractMetricValue(el, metric)

    if (value !== null) {
      // Sum values if a creative appears in multiple elements
      result.set(creativeUrn, (result.get(creativeUrn) ?? 0) + value)
    }
  }

  return result
}

/**
 * Extract the requested metric value from an API element.
 * Handles derived metrics (ctr, cpm, cpc, cpl) by computing from raw fields.
 */
function extractMetricValue(el: any, metric: string): number | null {
  const impressions = Number(el.impressions ?? 0)
  const clicks = Number(el.clicks ?? 0)
  const spend = parseFloat(el.costInLocalCurrency ?? '0')
  const leads = Number(el.oneClickLeads ?? 0) + Number(el.externalWebsiteConversions ?? 0)

  switch (metric) {
    case 'impressions': return Number(el.impressions ?? 0)
    case 'clicks': return Number(el.clicks ?? 0)
    case 'spend': return parseFloat(el.costInLocalCurrency ?? '0')
    case 'leads': return leads
    case 'conversions': return Number(el.externalWebsiteConversions ?? 0)
    case 'video_views': return Number(el.videoViews ?? 0)
    case 'video_completions': return Number(el.videoCompletions ?? 0)
    case 'likes': return Number(el.likes ?? 0)
    case 'comments': return Number(el.comments ?? 0)
    case 'shares': return Number(el.shares ?? 0)
    case 'follows': return Number(el.follows ?? 0)
    case 'landing_page_clicks': return Number(el.landingPageClicks ?? 0)
    case 'total_engagements': return Number(el.totalEngagements ?? 0)
    // Derived — compute if base data available
    case 'ctr': return impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0
    case 'cpm': return impressions > 0 ? Math.round((spend / impressions) * 1000 * 100) / 100 : 0
    case 'cpc': return clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0
    case 'cpl': return leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0
    default: return typeof el[metric] !== 'undefined' ? Number(el[metric]) : null
  }
}

// ---------------------------------------------------------------------------
// Query linkedin_campaign_metrics table (if creative_id is available)
// ---------------------------------------------------------------------------

/**
 * Query the linkedin_campaign_metrics table for aggregated metric values
 * per campaign. Returns map of campaign_id → aggregated value.
 *
 * Note: linkedin_campaign_metrics is campaign-level, not creative-level.
 * This is used as a fallback when direct creative-level API calls are not feasible.
 */
async function queryMetricsTable(
  svc: SupabaseClient,
  orgId: string,
  campaignIds: string[],
  metric: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  const dbColumn = getDbMetricColumn(metric)
  if (!dbColumn) return new Map()

  const { data, error } = await svc
    .from('linkedin_campaign_metrics')
    .select(`campaign_id, ${dbColumn}`)
    .eq('org_id', orgId)
    .in('campaign_id', campaignIds)
    .gte('date', startDate)
    .lte('date', endDate)

  if (error) {
    console.warn(`${LOG_PREFIX} linkedin_campaign_metrics query error: ${error.message}`)
    return new Map()
  }

  // Aggregate by campaign_id (sum across dates)
  const result = new Map<string, number>()
  for (const row of data ?? []) {
    const val = Number((row as any)[dbColumn] ?? 0)
    result.set(row.campaign_id, (result.get(row.campaign_id) ?? 0) + val)
  }

  return result
}

/**
 * Map metric key to database column name in linkedin_campaign_metrics.
 * Returns null for derived metrics not stored directly.
 */
function getDbMetricColumn(metric: string): string | null {
  const map: Record<string, string> = {
    impressions: 'impressions',
    clicks: 'clicks',
    spend: 'spend',
    leads: 'leads',
    conversions: 'conversions',
    video_views: 'video_views',
    video_completions: 'video_completions',
    likes: 'likes',
    comments: 'comments',
    shares: 'shares',
    follows: 'follows',
    landing_page_clicks: 'landing_page_clicks',
    total_engagements: 'total_engagements',
    ctr: 'ctr',
    cpm: 'cpm',
    cpc: 'cpc',
    cpl: 'cpl',
  }
  return map[metric] ?? null
}

// ---------------------------------------------------------------------------
// Core sync logic for a single analytics column
// ---------------------------------------------------------------------------

interface SyncColumnResult {
  column_id: string
  synced_cells: number
  skipped_cells: number
  failed_cells: number
  error?: string
}

async function syncAnalyticsColumn(
  svc: SupabaseClient,
  orgId: string,
  tableId: string,
  column: AnalyticsColumn,
  rowIds: string[] | undefined,
  integration: LinkedInIntegration,
  accessToken: string,
): Promise<SyncColumnResult> {
  const metric = column.integration_config?.metric ?? 'impressions'
  const dateRangeStr = column.integration_config?.date_range ?? 'last_30_days'
  const { startDate, endDate } = resolveDateRange(dateRangeStr)

  console.log(`${LOG_PREFIX} Syncing column "${column.label}" (${metric}, ${dateRangeStr}) for table ${tableId}`)

  // 1. Fetch all rows in the table (or just the requested row IDs)
  let rowsQuery = svc
    .from('dynamic_table_rows')
    .select('id, metadata')
    .eq('table_id', tableId)

  if (rowIds && rowIds.length > 0) {
    rowsQuery = rowsQuery.in('id', rowIds)
  }

  const { data: rows, error: rowsError } = await rowsQuery

  if (rowsError) {
    return {
      column_id: column.id,
      synced_cells: 0,
      skipped_cells: 0,
      failed_cells: 0,
      error: `Failed to fetch rows: ${rowsError.message}`,
    }
  }

  if (!rows || rows.length === 0) {
    return { column_id: column.id, synced_cells: 0, skipped_cells: 0, failed_cells: 0 }
  }

  // 2. Partition rows: those with creative URN vs without
  const rowsWithCreative: Array<{ id: string; creativeUrn: string }> = []
  const rowsWithoutCreative: string[] = []

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    const creativeUrn = meta['linkedin_creative_urn'] as string | undefined
    if (creativeUrn) {
      rowsWithCreative.push({ id: row.id, creativeUrn })
    } else {
      rowsWithoutCreative.push(row.id)
    }
  }

  console.log(`${LOG_PREFIX} ${rowsWithCreative.length} rows with creative URN, ${rowsWithoutCreative.length} without`)

  let syncedCells = 0
  let skippedCells = rowsWithoutCreative.length
  let failedCells = 0
  const now = new Date().toISOString()

  // 3. For rows without creative URN — set value to null (no error)
  if (rowsWithoutCreative.length > 0) {
    const nullCells: CellUpsert[] = rowsWithoutCreative.map(rowId => ({
      row_id: rowId,
      column_id: column.id,
      value: null,
      metadata: { last_synced_at: now, date_range: dateRangeStr, metric, reason: 'no_creative_urn' },
      status: 'complete',
    }))

    // Batch upsert in chunks
    for (let i = 0; i < nullCells.length; i += CHUNK_SIZE) {
      const chunk = nullCells.slice(i, i + CHUNK_SIZE)
      const { error } = await svc
        .from('dynamic_table_cells')
        .upsert(chunk, { onConflict: 'row_id,column_id' })

      if (error) {
        console.warn(`${LOG_PREFIX} Failed to upsert null cells: ${error.message}`)
      }
    }
  }

  // 4. For rows with creative URNs — fetch analytics and write values
  if (rowsWithCreative.length > 0) {
    // Process in chunks of CHUNK_SIZE
    for (let chunkStart = 0; chunkStart < rowsWithCreative.length; chunkStart += CHUNK_SIZE) {
      const chunk = rowsWithCreative.slice(chunkStart, chunkStart + CHUNK_SIZE)
      const chunkCreativeUrns = chunk.map(r => r.creativeUrn)
      const uniqueCreativeUrns = [...new Set(chunkCreativeUrns)]

      let metricMap: Map<string, number>

      // Try linkedin_campaign_metrics table first (fast, no API call needed)
      // Note: that table is campaign-level; for creative-level we go to the API.
      // We always use the API for creative-level accuracy.
      const adAccountId = integration.linkedin_ad_account_id
      if (!adAccountId) {
        console.warn(`${LOG_PREFIX} No ad account ID for org ${orgId} — cannot call LinkedIn API`)
        failedCells += chunk.length
        continue
      }

      try {
        const dateRange: DateRange = {
          start: parseDate(startDate),
          end: parseDate(endDate),
        }
        metricMap = await fetchCreativeAnalytics(
          accessToken,
          adAccountId,
          uniqueCreativeUrns,
          metric,
          dateRange,
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`${LOG_PREFIX} Creative analytics fetch failed: ${message}`)
        failedCells += chunk.length
        continue
      }

      // Build cell upserts for this chunk
      const cellsToUpsert: CellUpsert[] = []

      for (const row of chunk) {
        const value = metricMap.get(row.creativeUrn) ?? null

        cellsToUpsert.push({
          row_id: row.id,
          column_id: column.id,
          value: value !== null ? String(value) : null,
          metadata: {
            last_synced_at: now,
            date_range: dateRangeStr,
            metric,
            creative_urn: row.creativeUrn,
          },
          status: 'complete',
        })
      }

      const { error: upsertError } = await svc
        .from('dynamic_table_cells')
        .upsert(cellsToUpsert, { onConflict: 'row_id,column_id' })

      if (upsertError) {
        console.error(`${LOG_PREFIX} Cell upsert error: ${upsertError.message}`)
        failedCells += cellsToUpsert.length
      } else {
        syncedCells += cellsToUpsert.length
      }
    }
  }

  return {
    column_id: column.id,
    synced_cells: syncedCells,
    skipped_cells: skippedCells,
    failed_cells: failedCells,
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Server misconfigured', req, 500)
  }

  // Auth — accept either a valid user JWT or an internal service-role call
  // (internal calls come from linkedin-analytics-cron via X-Internal-Call header)
  const authHeader = req.headers.get('Authorization') || ''
  const internalCallHeader = req.headers.get('X-Internal-Call') || ''
  const isInternalCall = internalCallHeader === 'linkedin-analytics-cron' &&
    authHeader === `Bearer ${serviceRoleKey}`

  if (!authHeader) {
    return errorResponse('Missing authorization header', req, 401)
  }

  // For non-internal calls, validate the user JWT
  let userId: string | null = null
  if (!isInternalCall) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }
    userId = user.id
  }

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const body: RequestBody = await req.json()
    const { table_id, column_id, metric: bodyMetric, date_range: bodyDateRange, row_ids } = body

    if (!table_id) {
      return errorResponse('Missing table_id', req, 400)
    }

    // 1. Resolve table and verify org membership
    const { data: table, error: tableError } = await svc
      .from('dynamic_tables')
      .select('id, org_id, name')
      .eq('id', table_id)
      .maybeSingle()

    if (tableError || !table) {
      return errorResponse('Table not found', req, 404)
    }

    const orgId: string = table.org_id

    // Verify user is a member of this org (skip for internal cron calls)
    if (!isInternalCall && userId) {
      const { data: membership, error: memberError } = await svc
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .maybeSingle()

      if (memberError || !membership) {
        return errorResponse('Forbidden — not a member of this organization', req, 403)
      }
    }

    // 2. Resolve LinkedIn integration for this org
    const { data: integration, error: integrationError } = await svc
      .from('linkedin_org_integrations')
      .select('id, org_id, linkedin_ad_account_id, access_token_encrypted, refresh_token_encrypted, token_expires_at')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle()

    if (integrationError || !integration) {
      return errorResponse('LinkedIn integration not connected for this organization', req, 422)
    }

    // Ensure access token is fresh
    let accessToken: string
    try {
      accessToken = await ensureFreshToken(svc, integration as LinkedInIntegration)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'LINKEDIN_TOKEN_EXPIRED') {
        return errorResponse('LinkedIn token expired — please reconnect your LinkedIn account', req, 422)
      }
      throw err
    }

    // 3. Resolve columns to sync
    let columnsToSync: AnalyticsColumn[] = []

    if (column_id) {
      // Single column mode
      const { data: col, error: colError } = await svc
        .from('dynamic_table_columns')
        .select('id, key, label, integration_config')
        .eq('id', column_id)
        .eq('table_id', table_id)
        .eq('column_type', 'linkedin_analytics')
        .maybeSingle()

      if (colError || !col) {
        return errorResponse('Column not found or not a linkedin_analytics column', req, 404)
      }

      // Allow body-level overrides of metric/date_range
      const colWithOverrides: AnalyticsColumn = {
        ...col,
        integration_config: {
          ...(col.integration_config ?? {}),
          ...(bodyMetric ? { metric: bodyMetric } : {}),
          ...(bodyDateRange ? { date_range: bodyDateRange } : {}),
        },
      }
      columnsToSync = [colWithOverrides]
    } else {
      // All linkedin_analytics columns in the table
      const { data: cols, error: colsError } = await svc
        .from('dynamic_table_columns')
        .select('id, key, label, integration_config')
        .eq('table_id', table_id)
        .eq('column_type', 'linkedin_analytics')

      if (colsError) {
        return errorResponse(`Failed to fetch columns: ${colsError.message}`, req, 500)
      }

      if (!cols || cols.length === 0) {
        return jsonResponse({ synced_columns: 0, synced_cells: 0, errors: [] }, req)
      }

      columnsToSync = cols as AnalyticsColumn[]
    }

    // 4. Sync each column
    const errors: Array<{ column_id: string; error: string }> = []
    let totalSyncedCells = 0
    let syncedColumnsCount = 0

    for (const col of columnsToSync) {
      const result = await syncAnalyticsColumn(
        svc,
        orgId,
        table_id,
        col,
        row_ids,
        integration as LinkedInIntegration,
        accessToken,
      )

      totalSyncedCells += result.synced_cells

      if (result.error) {
        errors.push({ column_id: result.column_id, error: result.error })
        console.error(`${LOG_PREFIX} Column ${result.column_id} failed: ${result.error}`)
      } else {
        syncedColumnsCount++
        console.log(
          `${LOG_PREFIX} Column ${result.column_id} synced: ` +
          `${result.synced_cells} cells written, ` +
          `${result.skipped_cells} skipped (no creative URN), ` +
          `${result.failed_cells} failed`,
        )
      }
    }

    return jsonResponse(
      {
        synced_columns: syncedColumnsCount,
        synced_cells: totalSyncedCells,
        errors,
      },
      req,
    )
  } catch (err) {
    console.error(`${LOG_PREFIX} Unhandled error:`, err)
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    )
  }
})
