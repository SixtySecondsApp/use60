import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * linkedin-ad-capture — Capture LinkedIn ads from competitors using Apify scraper actors.
 *
 * Actions:
 *   capture_competitor — Scrape ads for a specific competitor by LinkedIn URL or name
 *   capture_keyword    — Scrape ads matching a keyword search
 *   get_status         — Return recent capture runs for the org
 *
 * POST body:
 *   { action, competitor_name?, competitor_linkedin_url?, keyword?, geography?, org_id? }
 */

const APIFY_ACTOR_ID = 'unlimitedleadtestinbox~linkedin-ads-scraper'
const APIFY_API_BASE = 'https://api.apify.com/v2'
const POLL_INTERVAL_MS = 5_000
const POLL_MAX_DURATION_MS = 120_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaptureRequest {
  action: 'capture_competitor' | 'capture_keyword' | 'get_status'
  competitor_name?: string
  competitor_linkedin_url?: string
  keyword?: string
  geography?: string
  org_id?: string
}

interface ApifyRunResult {
  id: string
  status: string
  defaultDatasetId: string
}

interface NormalizedAd {
  org_id: string
  watchlist_id: string | null
  advertiser_name: string
  advertiser_linkedin_url: string | null
  headline: string | null
  body_text: string | null
  cta_text: string | null
  destination_url: string | null
  media_type: 'image' | 'video' | 'carousel' | 'text'
  media_urls: string[]
  ad_format: string | null
  geography: string | null
  first_seen_at: string
  last_seen_at: string
  capture_source: 'apify'
  capture_run_id: string
  raw_data: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a LinkedIn Ad Library search URL from a company name */
function buildSearchUrl(competitorName?: string, competitorLinkedInUrl?: string): string {
  if (competitorLinkedInUrl) {
    // If it's already a full ad library URL, use as-is
    if (competitorLinkedInUrl.includes('/ad-library')) {
      return competitorLinkedInUrl
    }
    // Extract company slug from LinkedIn company URL (e.g. linkedin.com/company/hubspot)
    const companyMatch = competitorLinkedInUrl.match(/linkedin\.com\/company\/([^\/\?]+)/)
    if (companyMatch) {
      return `https://www.linkedin.com/ad-library/search?accountOwner=${companyMatch[1]}`
    }
    return competitorLinkedInUrl
  }
  if (competitorName) {
    // Use accountOwner param — LinkedIn uses the company page slug (e.g. "hubspot", "salesforce")
    // Just lowercase and strip spaces — don't kebab-case as that breaks multi-word slugs
    const slug = competitorName.toLowerCase().replace(/\s+/g, '')
    return `https://www.linkedin.com/ad-library/search?accountOwner=${encodeURIComponent(slug)}`
  }
  throw new Error('Either competitor_name or competitor_linkedin_url is required')
}

/** Start an Apify actor run */
async function startActorRun(
  apifyToken: string,
  input: Record<string, unknown>,
): Promise<ApifyRunResult> {
  const url = `${APIFY_API_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${apifyToken}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Apify start run failed (${response.status}): ${errorText.slice(0, 300)}`)
  }

  const result = await response.json()
  return result.data as ApifyRunResult
}

/** Poll an Apify run until it completes or times out */
async function pollRunCompletion(
  apifyToken: string,
  runId: string,
): Promise<ApifyRunResult> {
  const startTime = Date.now()

  while (Date.now() - startTime < POLL_MAX_DURATION_MS) {
    const url = `${APIFY_API_BASE}/actor-runs/${runId}?token=${apifyToken}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Apify poll failed (${response.status})`)
    }

    const result = await response.json()
    const run = result.data as ApifyRunResult

    if (run.status === 'SUCCEEDED') {
      return run
    }
    if (run.status === 'FAILED' || run.status === 'ABORTED' || run.status === 'TIMED-OUT') {
      throw new Error(`Apify run ${run.status}: ${runId}`)
    }

    // Still running — wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(`Apify run timed out after ${POLL_MAX_DURATION_MS / 1000}s: ${runId}`)
}

/** Fetch dataset items from a completed Apify run */
async function fetchDatasetItems(
  apifyToken: string,
  datasetId: string,
): Promise<Record<string, unknown>[]> {
  const url = `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${apifyToken}&format=json`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Apify dataset fetch failed (${response.status})`)
  }

  return await response.json() as Record<string, unknown>[]
}

/** Detect media type from an Apify ad result */
function detectMediaType(item: Record<string, unknown>): 'image' | 'video' | 'carousel' | 'text' {
  const mediaType = String(item.mediaType ?? item.media_type ?? '').toLowerCase()
  if (mediaType.includes('video')) return 'video'
  if (mediaType.includes('carousel') || mediaType.includes('document')) return 'carousel'

  // Check for media presence
  const images = item.images ?? item.imageUrls ?? item.media_urls
  const video = item.videoUrl ?? item.video_url
  if (video) return 'video'
  if (Array.isArray(images) && images.length > 1) return 'carousel'
  if (Array.isArray(images) && images.length === 1) return 'image'

  return 'text'
}

/** Extract media URLs from an Apify ad result */
function extractMediaUrls(item: Record<string, unknown>): string[] {
  const urls: string[] = []

  // Try various known fields
  const candidates = [
    item.imageUrls,
    item.images,
    item.media_urls,
    item.mediaUrls,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const url of candidate) {
        if (typeof url === 'string' && url.startsWith('http')) {
          urls.push(url)
        }
      }
      if (urls.length > 0) return urls
    }
  }

  // Single image/video URL fields
  const singleFields = ['imageUrl', 'image_url', 'videoUrl', 'video_url', 'thumbnailUrl']
  for (const field of singleFields) {
    const val = item[field]
    if (typeof val === 'string' && val.startsWith('http')) {
      urls.push(val)
    }
  }

  return urls
}

/** Normalize a raw Apify result into our schema */
function normalizeAd(
  item: Record<string, unknown>,
  orgId: string,
  watchlistId: string | null,
  runId: string,
  geography: string | null,
): NormalizedAd {
  const now = new Date().toISOString()

  return {
    org_id: orgId,
    watchlist_id: watchlistId,
    advertiser_name: String(item.advertiserName ?? item.advertiser_name ?? item.companyName ?? item.company_name ?? 'Unknown'),
    advertiser_linkedin_url: (item.advertiserUrl ?? item.advertiser_url ?? item.companyUrl ?? item.company_url ?? null) as string | null,
    headline: (item.headline ?? item.title ?? null) as string | null,
    body_text: (item.bodyText ?? item.body_text ?? item.ad_copy ?? item.text ?? item.description ?? null) as string | null,
    cta_text: (item.ctaText ?? item.cta_text ?? item.callToAction ?? item.cta ?? null) as string | null,
    destination_url: (item.destinationUrl ?? item.destination_url ?? item.landingPageUrl ?? item.ad_detail_url ?? item.url ?? null) as string | null,
    media_type: detectMediaType(item),
    media_urls: extractMediaUrls(item),
    ad_format: (item.adFormat ?? item.ad_format ?? item.ad_type ?? item.format ?? null) as string | null,
    geography: geography ?? (item.geography ?? item.geo ?? item.country ?? null) as string | null,
    first_seen_at: (item.firstSeenAt ?? item.first_seen_at ?? item.startDate ?? now) as string,
    last_seen_at: (item.lastSeenAt ?? item.last_seen_at ?? item.endDate ?? now) as string,
    capture_source: 'apify',
    capture_run_id: runId,
    raw_data: item,
  }
}

/** Generate a dedup key for an ad */
function dedupKey(ad: NormalizedAd): string {
  return [ad.org_id, ad.advertiser_name, ad.headline ?? '', ad.body_text ?? ''].join('|||')
}

/** Upsert normalized ads with dedup logic */
async function upsertAds(
  serviceClient: SupabaseClient,
  ads: NormalizedAd[],
): Promise<{ inserted: number; updated: number }> {
  if (ads.length === 0) return { inserted: 0, updated: 0 }

  let inserted = 0
  let updated = 0

  // Group by dedup key to avoid duplicate inserts within the same batch
  const dedupMap = new Map<string, NormalizedAd>()
  for (const ad of ads) {
    const key = dedupKey(ad)
    const existing = dedupMap.get(key)
    if (!existing || ad.last_seen_at > existing.last_seen_at) {
      dedupMap.set(key, ad)
    }
  }

  const uniqueAds = Array.from(dedupMap.values())

  // Process in chunks of 50 to avoid payload limits
  const CHUNK_SIZE = 50
  for (let i = 0; i < uniqueAds.length; i += CHUNK_SIZE) {
    const chunk = uniqueAds.slice(i, i + CHUNK_SIZE)

    for (const ad of chunk) {
      // Check if ad already exists (dedup by org_id + advertiser_name + headline + body_text)
      const { data: existing } = await serviceClient
        .from('linkedin_ad_library_ads')
        .select('id, first_seen_at')
        .eq('org_id', ad.org_id)
        .eq('advertiser_name', ad.advertiser_name)
        .eq('headline', ad.headline ?? '')
        .eq('body_text', ad.body_text ?? '')
        .maybeSingle()

      if (existing) {
        // Update last_seen_at and raw_data
        await serviceClient
          .from('linkedin_ad_library_ads')
          .update({
            last_seen_at: ad.last_seen_at,
            raw_data: ad.raw_data,
            capture_run_id: ad.capture_run_id,
          })
          .eq('id', existing.id)
        updated++
      } else {
        const { error: insertError } = await serviceClient
          .from('linkedin_ad_library_ads')
          .insert(ad)

        if (insertError) {
          console.error(`[linkedin-ad-capture] Insert error: ${insertError.message}`)
        } else {
          inserted++
        }
      }
    }
  }

  return { inserted, updated }
}

/** Look up the watchlist entry for a competitor in this org */
async function findWatchlistEntry(
  serviceClient: SupabaseClient,
  orgId: string,
  advertiserName?: string,
  advertiserUrl?: string,
): Promise<{ id: string } | null> {
  if (advertiserUrl) {
    const { data } = await serviceClient
      .from('linkedin_ad_library_watchlist')
      .select('id')
      .eq('org_id', orgId)
      .eq('competitor_linkedin_url', advertiserUrl)
      .maybeSingle()
    if (data) return data
  }

  if (advertiserName) {
    const { data } = await serviceClient
      .from('linkedin_ad_library_watchlist')
      .select('id')
      .eq('org_id', orgId)
      .ilike('competitor_name', advertiserName)
      .maybeSingle()
    if (data) return data
  }

  return null
}

/** Update watchlist entry after a successful capture */
async function updateWatchlistStats(
  serviceClient: SupabaseClient,
  watchlistId: string,
  adsCaptured: number,
): Promise<void> {
  const { data: current } = await serviceClient
    .from('linkedin_ad_library_watchlist')
    .select('total_ads_captured')
    .eq('id', watchlistId)
    .maybeSingle()

  const existingTotal = (current?.total_ads_captured as number) ?? 0

  await serviceClient
    .from('linkedin_ad_library_watchlist')
    .update({
      last_captured_at: new Date().toISOString(),
      total_ads_captured: existingTotal + adsCaptured,
    })
    .eq('id', watchlistId)
}

/** Trigger the linkedin-ad-classify function for newly captured ads */
async function triggerClassification(
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  captureRunId: string,
): Promise<void> {
  try {
    const classifyUrl = `${supabaseUrl}/functions/v1/linkedin-ad-classify`
    const response = await fetch(classifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'x-internal-call': 'true',
      },
      body: JSON.stringify({ org_id: orgId, capture_run_id: captureRunId }),
    })

    if (!response.ok) {
      console.warn(`[linkedin-ad-capture] Classification trigger returned ${response.status}`)
    }
  } catch (err) {
    // Non-fatal: classification can be retried
    console.warn(`[linkedin-ad-capture] Classification trigger failed: ${err}`)
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleCaptureCompetitor(
  serviceClient: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  apifyToken: string,
  orgId: string,
  body: CaptureRequest,
): Promise<Record<string, unknown>> {
  const { competitor_name, competitor_linkedin_url, geography } = body

  if (!competitor_name && !competitor_linkedin_url) {
    throw new Error('Either competitor_name or competitor_linkedin_url is required')
  }

  const searchUrl = buildSearchUrl(competitor_name, competitor_linkedin_url)

  // Find watchlist entry
  const watchlistEntry = await findWatchlistEntry(
    serviceClient,
    orgId,
    competitor_name,
    competitor_linkedin_url,
  )

  // Start Apify actor — actor expects startUrls as array of {url} objects
  const actorInput: Record<string, unknown> = {
    startUrls: [{ url: searchUrl }],
    maxResults: 100,
  }
  if (geography) {
    actorInput.geography = geography
  }

  console.log(`[linkedin-ad-capture] Starting competitor capture: ${searchUrl}`)
  const run = await startActorRun(apifyToken, actorInput)
  const runId = run.id

  // Poll for completion
  const completedRun = await pollRunCompletion(apifyToken, runId)

  // Fetch results
  const items = await fetchDatasetItems(apifyToken, completedRun.defaultDatasetId)
  console.log(`[linkedin-ad-capture] Fetched ${items.length} ads from run ${runId}`)

  // Normalize
  const normalizedAds = items.map((item) =>
    normalizeAd(item, orgId, watchlistEntry?.id ?? null, runId, geography ?? null)
  )

  // Upsert with dedup
  const { inserted, updated } = await upsertAds(serviceClient, normalizedAds)

  // Update watchlist stats
  if (watchlistEntry) {
    await updateWatchlistStats(serviceClient, watchlistEntry.id, inserted)
  }

  // Trigger classification (non-blocking fire-and-forget style, but we await for error logging)
  if (inserted > 0) {
    await triggerClassification(supabaseUrl, serviceRoleKey, orgId, runId)
  }

  return {
    run_id: runId,
    total_scraped: items.length,
    inserted,
    updated,
    watchlist_id: watchlistEntry?.id ?? null,
  }
}

async function handleCaptureKeyword(
  serviceClient: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  apifyToken: string,
  orgId: string,
  body: CaptureRequest,
): Promise<Record<string, unknown>> {
  const { keyword, geography } = body

  if (!keyword) {
    throw new Error('keyword is required for capture_keyword action')
  }

  const searchUrl = `https://www.linkedin.com/ad-library/search?q=${encodeURIComponent(keyword)}`

  const actorInput: Record<string, unknown> = {
    startUrls: [{ url: searchUrl }],
    maxResults: 100,
  }
  if (geography) {
    actorInput.geography = geography
  }

  console.log(`[linkedin-ad-capture] Starting keyword capture: "${keyword}"`)
  const run = await startActorRun(apifyToken, actorInput)
  const runId = run.id

  // Poll for completion
  const completedRun = await pollRunCompletion(apifyToken, runId)

  // Fetch results
  const items = await fetchDatasetItems(apifyToken, completedRun.defaultDatasetId)
  console.log(`[linkedin-ad-capture] Fetched ${items.length} ads for keyword "${keyword}" from run ${runId}`)

  // Normalize — no specific watchlist entry for keyword searches
  const normalizedAds = items.map((item) =>
    normalizeAd(item, orgId, null, runId, geography ?? null)
  )

  // Upsert with dedup
  const { inserted, updated } = await upsertAds(serviceClient, normalizedAds)

  // Trigger classification
  if (inserted > 0) {
    await triggerClassification(supabaseUrl, serviceRoleKey, orgId, runId)
  }

  return {
    run_id: runId,
    keyword,
    total_scraped: items.length,
    inserted,
    updated,
  }
}

async function handleGetStatus(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Record<string, unknown>> {
  // Get recent ads grouped by capture_run_id
  const { data: recentAds, error } = await serviceClient
    .from('linkedin_ad_library_ads')
    .select('capture_run_id, capture_source, created_at, advertiser_name')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(`Failed to fetch capture status: ${error.message}`)
  }

  // Aggregate by run
  const runs = new Map<string, { run_id: string; ads_count: number; created_at: string; advertisers: Set<string> }>()
  for (const ad of recentAds ?? []) {
    const runId = ad.capture_run_id as string
    if (!runId) continue

    const existing = runs.get(runId)
    if (existing) {
      existing.ads_count++
      existing.advertisers.add(ad.advertiser_name as string)
    } else {
      runs.set(runId, {
        run_id: runId,
        ads_count: 1,
        created_at: ad.created_at as string,
        advertisers: new Set([ad.advertiser_name as string]),
      })
    }
  }

  const runList = Array.from(runs.values())
    .map((r) => ({
      run_id: r.run_id,
      ads_count: r.ads_count,
      created_at: r.created_at,
      advertisers: Array.from(r.advertisers),
    }))
    .slice(0, 20) // Last 20 runs

  // Get watchlist summary
  const { data: watchlist } = await serviceClient
    .from('linkedin_ad_library_watchlist')
    .select('id, competitor_name, competitor_linkedin_url, last_captured_at, total_ads_captured')
    .eq('org_id', orgId)
    .order('last_captured_at', { ascending: false, nullsFirst: false })

  return {
    recent_runs: runList,
    watchlist: watchlist ?? [],
    total_ads: recentAds?.length ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Parse request
    const body = await req.json() as CaptureRequest
    const { action } = body

    if (!action || !['capture_competitor', 'capture_keyword', 'get_status'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Must be one of: capture_competitor, capture_keyword, get_status' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Authenticate user via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Service role client for DB writes
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Resolve org_id — prefer explicit, fall back to user's membership
    let orgId = body.org_id
    if (!orgId) {
      const { data: membership } = await userClient
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (!membership) {
        return new Response(
          JSON.stringify({ error: 'No organization found for user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      orgId = membership.org_id as string
    }

    // For get_status, no Apify token needed
    if (action === 'get_status') {
      const result = await handleGetStatus(serviceClient, orgId)
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // For capture actions, get Apify API token from integration_credentials
    const { data: creds } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'apify')
      .maybeSingle()

    const apifyToken = (creds?.credentials as Record<string, string>)?.api_token
    if (!apifyToken) {
      return new Response(
        JSON.stringify({
          error: 'Apify API token not configured. Add it in Settings > Integrations.',
          code: 'APIFY_NOT_CONFIGURED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let result: Record<string, unknown>

    if (action === 'capture_competitor') {
      result = await handleCaptureCompetitor(
        serviceClient, supabaseUrl, serviceRoleKey, apifyToken, orgId, body,
      )
    } else {
      result = await handleCaptureKeyword(
        serviceClient, supabaseUrl, serviceRoleKey, apifyToken, orgId, body,
      )
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    console.error(`[linkedin-ad-capture] Error:`, error)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
