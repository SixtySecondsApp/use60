import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Action =
  | 'search'
  | 'get_clusters'
  | 'get_trends'
  | 'get_likely_winners'
  | 'get_competitor_stats'
  | 'detect_ab_tests'
  | 'get_watchlist'
  | 'add_watchlist'
  | 'remove_watchlist'
  | 'update_watchlist'
  | 'get_ad_detail'
  | 'submit_manual_ad'
  | 'save_ad'
  | 'unsave_ad'

interface RequestBody {
  action: Action
  // search params
  query?: string
  advertiser_name?: string
  geography?: string
  media_type?: string
  angle?: string
  persona?: string
  offer_type?: string
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
  // filters
  saved_only?: boolean
  sort_by?: 'first_seen_at' | 'last_seen_at' | 'longevity'
  sort_order?: 'asc' | 'desc'
  min_longevity_days?: number
  // watchlist params
  competitor_name?: string
  competitor_linkedin_url?: string
  competitor_website?: string
  capture_frequency?: string
  watchlist_id?: string
  is_active?: boolean
  // manual ad / detail params
  ad_id?: string
  headline?: string
  body_text?: string
  cta_text?: string
  advertiser?: string
  destination_url?: string
  media_type_manual?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampPageSize(raw?: number): number {
  const size = raw ?? DEFAULT_PAGE_SIZE
  return Math.max(1, Math.min(size, MAX_PAGE_SIZE))
}

function clampPage(raw?: number): number {
  return Math.max(0, (raw ?? 0))
}

/** Build a service-role client for writes that bypass RLS */
function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

/** Build a user client scoped to the caller's JWT for RLS-protected reads */
function userClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

/** Extract Bearer token from request */
function extractToken(req: Request): string | null {
  const header = req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  return header.slice(7)
}

/** Resolve org_id for authenticated user via organization_memberships */
async function resolveOrgId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data.org_id
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleSearch(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  const pageSize = clampPageSize(body.page_size)
  const page = clampPage(body.page)
  const offset = page * pageSize

  // Build the base query — ads joined with classifications
  // We use the RPC-style raw query because we need full-text search + join + count
  const svc = serviceClient()

  // Build WHERE clauses
  const conditions: string[] = [`a.org_id = '${orgId}'`]
  const params: string[] = []

  if (body.query) {
    conditions.push(`a.search_vector @@ plainto_tsquery('english', $${params.length + 1})`)
    params.push(body.query)
  }
  if (body.advertiser_name) {
    conditions.push(`a.advertiser_name ILIKE $${params.length + 1}`)
    params.push(`%${body.advertiser_name}%`)
  }
  if (body.geography) {
    conditions.push(`a.geography ILIKE $${params.length + 1}`)
    params.push(`%${body.geography}%`)
  }
  if (body.media_type) {
    conditions.push(`a.media_type = $${params.length + 1}::linkedin_ad_media_type`)
    params.push(body.media_type)
  }
  if (body.date_from) {
    conditions.push(`a.first_seen_at >= $${params.length + 1}::timestamptz`)
    params.push(body.date_from)
  }
  if (body.date_to) {
    conditions.push(`a.last_seen_at <= $${params.length + 1}::timestamptz`)
    params.push(body.date_to)
  }
  if (body.angle) {
    conditions.push(`c.angle ILIKE $${params.length + 1}`)
    params.push(`%${body.angle}%`)
  }
  if (body.persona) {
    conditions.push(`c.target_persona ILIKE $${params.length + 1}`)
    params.push(`%${body.persona}%`)
  }
  if (body.offer_type) {
    conditions.push(`c.offer_type ILIKE $${params.length + 1}`)
    params.push(`%${body.offer_type}%`)
  }

  const whereClause = conditions.join(' AND ')

  // Count query
  const countSql = `
    SELECT count(*)::int as total
    FROM linkedin_ad_library_ads a
    LEFT JOIN linkedin_ad_library_classifications c ON c.ad_id = a.id
    WHERE ${whereClause}
  `

  // Data query
  const dataSql = `
    SELECT
      a.id, a.advertiser_name, a.advertiser_linkedin_url,
      a.headline, a.body_text, a.cta_text, a.destination_url,
      a.media_type, a.media_urls, a.ad_format, a.geography,
      a.first_seen_at, a.last_seen_at, a.capture_source,
      a.is_likely_winner, a.winner_signals, a.is_saved,
      a.is_likely_dead, a.landing_page,
      a.num_likes, a.num_comments, a.num_reactions,
      a.engagement_post_url, a.engagement_updated_at,
      a.raw_data->>'advertiser_logo_url' as advertiser_logo_url,
      c.angle, c.target_persona, c.offer_type, c.cta_type,
      c.creative_format, c.industry_vertical, c.messaging_theme,
      c.confidence as classification_confidence
    FROM linkedin_ad_library_ads a
    LEFT JOIN linkedin_ad_library_classifications c ON c.ad_id = a.id
    WHERE ${whereClause}
    ORDER BY a.first_seen_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `

  const [countResult, dataResult] = await Promise.all([
    svc.rpc('exec_sql', { query: countSql, params }),
    svc.rpc('exec_sql', { query: dataSql, params }),
  ]).catch(() => [null, null])

  // Fallback: use supabase query builder if exec_sql RPC doesn't exist
  // This is the safer approach — build with the query builder
  let total = 0
  let ads: Record<string, unknown>[] = []

  if (dataResult?.error || !dataResult) {
    // Use query builder approach instead
    let adsQuery = supabase
      .from('linkedin_ad_library_ads')
      .select(`
        id, advertiser_name, advertiser_linkedin_url,
        headline, body_text, cta_text, destination_url,
        media_type, media_urls, ad_format, geography,
        first_seen_at, last_seen_at, capture_source,
        is_likely_winner, winner_signals, is_saved,
        is_likely_dead, landing_page,
        num_likes, num_comments, num_reactions,
        engagement_post_url, engagement_updated_at,
        linkedin_ad_library_classifications (
          angle, target_persona, offer_type, cta_type,
          creative_format, industry_vertical, messaging_theme,
          confidence
        )
      `, { count: 'exact' })
      .eq('org_id', orgId)
      .range(offset, offset + pageSize - 1)

    // Sort
    const sortBy = body.sort_by || 'first_seen_at'
    const sortAsc = (body.sort_order || 'desc') === 'asc'
    if (sortBy === 'longevity') {
      // Can't sort by computed column with query builder — fall back to first_seen_at
      adsQuery = adsQuery.order('first_seen_at', { ascending: sortAsc })
    } else {
      adsQuery = adsQuery.order(sortBy, { ascending: sortAsc })
    }

    if (body.saved_only) {
      adsQuery = adsQuery.eq('is_saved', true)
    }
    if (body.advertiser_name) {
      adsQuery = adsQuery.ilike('advertiser_name', `%${body.advertiser_name}%`)
    }
    if (body.geography) {
      adsQuery = adsQuery.ilike('geography', `%${body.geography}%`)
    }
    if (body.media_type) {
      adsQuery = adsQuery.eq('media_type', body.media_type)
    }
    if (body.date_from) {
      adsQuery = adsQuery.gte('first_seen_at', body.date_from)
    }
    if (body.date_to) {
      adsQuery = adsQuery.lte('last_seen_at', body.date_to)
    }

    // Full-text search requires textSearch filter
    if (body.query) {
      adsQuery = adsQuery.textSearch('search_vector', body.query, { type: 'plain' })
    }

    const { data: adsData, count, error: adsError } = await adsQuery

    if (adsError) {
      console.error('[linkedin-ad-search] search error:', adsError)
      return errorResponse(`Search failed: ${adsError.message}`, req, 500)
    }

    ads = (adsData ?? []).map((ad: Record<string, unknown>) => {
      const classification = Array.isArray(ad.linkedin_ad_library_classifications)
        ? ad.linkedin_ad_library_classifications[0] ?? null
        : ad.linkedin_ad_library_classifications ?? null
      const { linkedin_ad_library_classifications: _removed, ...rest } = ad
      return { ...rest, classification }
    })

    // If classification filters were requested, filter client-side
    // (PostgREST doesn't support filtering on joined table columns directly in .eq)
    if (body.angle || body.persona || body.offer_type) {
      ads = ads.filter((ad: Record<string, unknown>) => {
        const cls = ad.classification as Record<string, unknown> | null
        if (!cls) return false
        if (body.angle && !(cls.angle as string || '').toLowerCase().includes(body.angle.toLowerCase())) return false
        if (body.persona && !(cls.target_persona as string || '').toLowerCase().includes(body.persona.toLowerCase())) return false
        if (body.offer_type && !(cls.offer_type as string || '').toLowerCase().includes(body.offer_type.toLowerCase())) return false
        return true
      })
    }

    total = body.angle || body.persona || body.offer_type
      ? ads.length
      : (count ?? ads.length)
  } else {
    // RPC worked
    ads = dataResult.data ?? []
    total = countResult?.data?.[0]?.total ?? ads.length
  }

  return jsonResponse({
    ads,
    total,
    page,
    page_size: pageSize,
    has_more: offset + pageSize < total,
  }, req)
}

async function handleGetClusters(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  // Get all classifications for this org to cluster
  const { data: classifications, error } = await supabase
    .from('linkedin_ad_library_classifications')
    .select(`
      ad_id, angle, target_persona, offer_type, cta_type,
      creative_format, industry_vertical, messaging_theme,
      confidence,
      linkedin_ad_library_ads!inner (
        id, advertiser_name, headline, body_text, media_type,
        first_seen_at, is_likely_winner
      )
    `)
    .eq('org_id', orgId)
    .order('confidence', { ascending: false })

  if (error) {
    console.error('[linkedin-ad-search] get_clusters error:', error)
    return errorResponse(`Failed to get clusters: ${error.message}`, req, 500)
  }

  const items = classifications ?? []

  // Group by each dimension
  const clusterByDimension = (dimension: string) => {
    const groups: Record<string, { count: number; sample_ads: Record<string, unknown>[] }> = {}
    for (const item of items) {
      const value = (item as Record<string, unknown>)[dimension] as string | null
      const key = value || 'Unclassified'
      if (!groups[key]) {
        groups[key] = { count: 0, sample_ads: [] }
      }
      groups[key].count++
      if (groups[key].sample_ads.length < 3) {
        groups[key].sample_ads.push(item.linkedin_ad_library_ads as Record<string, unknown>)
      }
    }
    return Object.entries(groups)
      .map(([label, data]) => ({ label, ...data }))
      .sort((a, b) => b.count - a.count)
  }

  return jsonResponse({
    by_angle: clusterByDimension('angle'),
    by_persona: clusterByDimension('target_persona'),
    by_offer_type: clusterByDimension('offer_type'),
    total_classified: items.length,
  }, req)
}

async function handleGetTrends(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  // Get ads with classifications, grouped by week
  const { data: ads, error } = await supabase
    .from('linkedin_ad_library_ads')
    .select(`
      id, first_seen_at, advertiser_name,
      linkedin_ad_library_classifications (
        angle, target_persona, offer_type
      )
    `)
    .eq('org_id', orgId)
    .order('first_seen_at', { ascending: true })

  if (error) {
    console.error('[linkedin-ad-search] get_trends error:', error)
    return errorResponse(`Failed to get trends: ${error.message}`, req, 500)
  }

  const items = ads ?? []

  // Group by ISO week
  const weeklyData: Record<string, Record<string, number>> = {}
  const angleCounts: Record<string, number> = {}
  const prevAngleCounts: Record<string, number> = {}

  const now = new Date()
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000)

  for (const ad of items) {
    const date = new Date(ad.first_seen_at as string)
    // Get ISO week start (Monday)
    const dayOfWeek = date.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(date)
    monday.setDate(date.getDate() + mondayOffset)
    const weekKey = monday.toISOString().slice(0, 10)

    if (!weeklyData[weekKey]) weeklyData[weekKey] = {}
    weeklyData[weekKey]['total'] = (weeklyData[weekKey]['total'] || 0) + 1

    const classification = Array.isArray(ad.linkedin_ad_library_classifications)
      ? ad.linkedin_ad_library_classifications[0]
      : ad.linkedin_ad_library_classifications

    if (classification) {
      const angle = (classification as Record<string, unknown>).angle as string | null
      if (angle) {
        weeklyData[weekKey][angle] = (weeklyData[weekKey][angle] || 0) + 1

        // Track angle momentum (recent 4 weeks vs prior)
        if (date >= fourWeeksAgo) {
          angleCounts[angle] = (angleCounts[angle] || 0) + 1
        } else {
          prevAngleCounts[angle] = (prevAngleCounts[angle] || 0) + 1
        }
      }
    }
  }

  // Identify trending angles (higher count in recent 4 weeks vs average prior)
  const trendingAngles = Object.entries(angleCounts)
    .map(([angle, recentCount]) => {
      const prevCount = prevAngleCounts[angle] || 0
      const growth = prevCount > 0 ? ((recentCount - prevCount) / prevCount) * 100 : 100
      return { angle, recent_count: recentCount, previous_count: prevCount, growth_pct: Math.round(growth) }
    })
    .sort((a, b) => b.growth_pct - a.growth_pct)
    .slice(0, 10)

  // Convert weekly data to sorted array
  const timeSeries = Object.entries(weeklyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, dimensions]) => ({ week, ...dimensions }))

  return jsonResponse({
    time_series: timeSeries,
    trending_angles: trendingAngles,
    total_ads: items.length,
  }, req)
}

async function handleGetLikelyWinners(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  const pageSize = clampPageSize(body.page_size)
  const page = clampPage(body.page)
  const offset = page * pageSize

  const { data: winners, count, error } = await supabase
    .from('linkedin_ad_library_ads')
    .select(`
      id, advertiser_name, advertiser_linkedin_url,
      headline, body_text, cta_text, destination_url,
      media_type, media_urls, ad_format, geography,
      first_seen_at, last_seen_at, capture_source,
      is_likely_winner, winner_signals,
      linkedin_ad_library_classifications (
        angle, target_persona, offer_type, cta_type,
        creative_format, industry_vertical, messaging_theme,
        confidence
      )
    `, { count: 'exact' })
    .eq('org_id', orgId)
    .eq('is_likely_winner', true)
    .order('last_seen_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error) {
    console.error('[linkedin-ad-search] get_likely_winners error:', error)
    return errorResponse(`Failed to get likely winners: ${error.message}`, req, 500)
  }

  const ads = (winners ?? []).map((ad: Record<string, unknown>) => {
    const classification = Array.isArray(ad.linkedin_ad_library_classifications)
      ? ad.linkedin_ad_library_classifications[0] ?? null
      : ad.linkedin_ad_library_classifications ?? null
    const { linkedin_ad_library_classifications: _removed, ...rest } = ad
    return { ...rest, classification }
  })

  const total = count ?? ads.length

  return jsonResponse({
    ads,
    total,
    page,
    page_size: pageSize,
    has_more: offset + pageSize < total,
  }, req)
}

async function handleGetWatchlist(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  req: Request,
): Promise<Response> {
  const { data, error } = await supabase
    .from('linkedin_ad_library_watchlist')
    .select(`
      id, competitor_name, competitor_linkedin_url, competitor_website,
      capture_frequency, is_active, last_captured_at, total_ads_captured,
      created_by, created_at, updated_at
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[linkedin-ad-search] get_watchlist error:', error)
    return errorResponse(`Failed to get watchlist: ${error.message}`, req, 500)
  }

  return jsonResponse({ watchlist: data ?? [] }, req)
}

async function handleAddWatchlist(
  orgId: string,
  userId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  if (!body.competitor_name) {
    return errorResponse('competitor_name is required', req, 400)
  }

  const svc = serviceClient()

  const { data, error } = await svc
    .from('linkedin_ad_library_watchlist')
    .insert({
      org_id: orgId,
      competitor_name: body.competitor_name,
      competitor_linkedin_url: body.competitor_linkedin_url || null,
      competitor_website: body.competitor_website || null,
      capture_frequency: body.capture_frequency || 'weekly',
      is_active: true,
      created_by: userId,
    })
    .select('id, competitor_name, competitor_linkedin_url, competitor_website, capture_frequency, is_active, created_at')
    .single()

  if (error) {
    console.error('[linkedin-ad-search] add_watchlist error:', error)
    if (error.code === '23505') {
      return errorResponse('This competitor is already on your watchlist', req, 409)
    }
    return errorResponse(`Failed to add to watchlist: ${error.message}`, req, 500)
  }

  return jsonResponse({ watchlist_entry: data }, req, 201)
}

async function handleRemoveWatchlist(
  orgId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  if (!body.watchlist_id) {
    return errorResponse('watchlist_id is required', req, 400)
  }

  const svc = serviceClient()

  const { error } = await svc
    .from('linkedin_ad_library_watchlist')
    .delete()
    .eq('id', body.watchlist_id)
    .eq('org_id', orgId)

  if (error) {
    console.error('[linkedin-ad-search] remove_watchlist error:', error)
    return errorResponse(`Failed to remove from watchlist: ${error.message}`, req, 500)
  }

  return jsonResponse({ success: true }, req)
}

async function handleUpdateWatchlist(
  orgId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  if (!body.watchlist_id) {
    return errorResponse('watchlist_id is required', req, 400)
  }

  const updates: Record<string, unknown> = {}
  if (body.capture_frequency !== undefined) updates.capture_frequency = body.capture_frequency
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.competitor_name !== undefined) updates.competitor_name = body.competitor_name
  if (body.competitor_linkedin_url !== undefined) updates.competitor_linkedin_url = body.competitor_linkedin_url
  if (body.competitor_website !== undefined) updates.competitor_website = body.competitor_website

  if (Object.keys(updates).length === 0) {
    return errorResponse('No fields to update', req, 400)
  }

  const svc = serviceClient()

  const { data, error } = await svc
    .from('linkedin_ad_library_watchlist')
    .update(updates)
    .eq('id', body.watchlist_id)
    .eq('org_id', orgId)
    .select('id, competitor_name, competitor_linkedin_url, competitor_website, capture_frequency, is_active, updated_at')
    .single()

  if (error) {
    console.error('[linkedin-ad-search] update_watchlist error:', error)
    return errorResponse(`Failed to update watchlist: ${error.message}`, req, 500)
  }

  return jsonResponse({ watchlist_entry: data }, req)
}

async function handleGetAdDetail(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  if (!body.ad_id) {
    return errorResponse('ad_id is required', req, 400)
  }

  const { data, error } = await supabase
    .from('linkedin_ad_library_ads')
    .select(`
      id, advertiser_name, advertiser_linkedin_url,
      headline, body_text, cta_text, destination_url,
      media_type, media_urls, cached_media_paths, ad_format, geography,
      first_seen_at, last_seen_at, capture_source, capture_run_id,
      is_likely_winner, winner_signals, raw_data,
      created_at, updated_at,
      linkedin_ad_library_classifications (
        id, angle, target_persona, offer_type, cta_type,
        creative_format, industry_vertical, messaging_theme,
        confidence, classified_by, classified_at
      )
    `)
    .eq('id', body.ad_id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    console.error('[linkedin-ad-search] get_ad_detail error:', error)
    return errorResponse(`Failed to get ad detail: ${error.message}`, req, 500)
  }

  if (!data) {
    return errorResponse('Ad not found', req, 404)
  }

  const classification = Array.isArray(data.linkedin_ad_library_classifications)
    ? data.linkedin_ad_library_classifications[0] ?? null
    : data.linkedin_ad_library_classifications ?? null
  const { linkedin_ad_library_classifications: _removed, ...rest } = data
  const ad = { ...rest, classification }

  return jsonResponse({ ad }, req)
}

async function handleSubmitManualAd(
  orgId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  if (!body.advertiser && !body.headline && !body.body_text) {
    return errorResponse('At least one of advertiser, headline, or body_text is required', req, 400)
  }

  const svc = serviceClient()

  const { data, error } = await svc
    .from('linkedin_ad_library_ads')
    .insert({
      org_id: orgId,
      advertiser_name: body.advertiser || 'Unknown',
      headline: body.headline || null,
      body_text: body.body_text || null,
      cta_text: body.cta_text || null,
      destination_url: body.destination_url || null,
      media_type: body.media_type_manual || 'text',
      capture_source: 'manual',
    })
    .select('id, advertiser_name, headline, body_text, cta_text, destination_url, media_type, capture_source, created_at')
    .single()

  if (error) {
    console.error('[linkedin-ad-search] submit_manual_ad error:', error)
    return errorResponse(`Failed to submit ad: ${error.message}`, req, 500)
  }

  return jsonResponse({ ad: data }, req, 201)
}

async function handleGetCompetitorStats(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  req: Request,
): Promise<Response> {
  // Fetch all ads for this org with the columns needed for aggregation
  const { data: allAds, error } = await supabase
    .from('linkedin_ad_library_ads')
    .select(
      'advertiser_name, advertiser_linkedin_url, media_type, capture_source, ' +
      'num_likes, num_comments, num_reactions, first_seen_at, last_seen_at, is_saved, raw_data'
    )
    .eq('org_id', orgId)

  if (error) {
    console.error('[linkedin-ad-search] get_competitor_stats error:', error)
    return errorResponse(`Failed to get competitor stats: ${error.message}`, req, 500)
  }

  const items = allAds ?? []

  // Aggregate in JavaScript grouped by advertiser_name
  const grouped: Record<string, {
    advertiser_name: string
    advertiser_linkedin_url: string | null
    advertiser_logo_url: string | null
    ad_count: number
    organic_count: number
    format_breakdown: Record<string, number>
    total_engagement: number
    first_capture: string | null
    last_capture: string | null
    saved_count: number
  }> = {}

  for (const ad of items) {
    const name = (ad as Record<string, unknown>).advertiser_name as string
    if (!name) continue

    if (!grouped[name]) {
      grouped[name] = {
        advertiser_name: name,
        advertiser_linkedin_url: (ad as Record<string, unknown>).advertiser_linkedin_url as string | null,
        advertiser_logo_url: null,
        ad_count: 0,
        organic_count: 0,
        format_breakdown: {},
        total_engagement: 0,
        first_capture: null,
        last_capture: null,
        saved_count: 0,
      }
    }

    const g = grouped[name]

    // Count ads vs organic
    const captureSource = (ad as Record<string, unknown>).capture_source as string | null
    if (captureSource === 'organic') {
      g.organic_count++
    }
    g.ad_count++

    // Format breakdown
    const mediaType = ((ad as Record<string, unknown>).media_type as string) || 'unknown'
    g.format_breakdown[mediaType] = (g.format_breakdown[mediaType] || 0) + 1

    // Engagement
    const likes = ((ad as Record<string, unknown>).num_likes as number) || 0
    const comments = ((ad as Record<string, unknown>).num_comments as number) || 0
    const reactions = ((ad as Record<string, unknown>).num_reactions as number) || 0
    g.total_engagement += likes + comments + reactions

    // Date range
    const firstSeen = (ad as Record<string, unknown>).first_seen_at as string | null
    const lastSeen = (ad as Record<string, unknown>).last_seen_at as string | null
    if (firstSeen && (!g.first_capture || firstSeen < g.first_capture)) {
      g.first_capture = firstSeen
    }
    if (lastSeen && (!g.last_capture || lastSeen > g.last_capture)) {
      g.last_capture = lastSeen
    }

    // Saved count
    if ((ad as Record<string, unknown>).is_saved) {
      g.saved_count++
    }

    // Logo — grab from raw_data if available
    if (!g.advertiser_logo_url) {
      const rawData = (ad as Record<string, unknown>).raw_data as Record<string, unknown> | null
      if (rawData?.advertiser_logo_url) {
        g.advertiser_logo_url = rawData.advertiser_logo_url as string
      }
    }

    // Update linkedin url if we don't have one yet
    if (!g.advertiser_linkedin_url && (ad as Record<string, unknown>).advertiser_linkedin_url) {
      g.advertiser_linkedin_url = (ad as Record<string, unknown>).advertiser_linkedin_url as string
    }
  }

  // Convert to array and compute averages
  const competitors = Object.values(grouped)
    .map((g) => ({
      advertiser_name: g.advertiser_name,
      advertiser_linkedin_url: g.advertiser_linkedin_url,
      advertiser_logo_url: g.advertiser_logo_url,
      ad_count: g.ad_count,
      organic_count: g.organic_count,
      total_count: g.ad_count,
      format_breakdown: g.format_breakdown,
      total_engagement: g.total_engagement,
      avg_engagement: g.ad_count > 0 ? Math.round((g.total_engagement / g.ad_count) * 10) / 10 : 0,
      first_capture: g.first_capture,
      last_capture: g.last_capture,
      saved_count: g.saved_count,
    }))
    .sort((a, b) => b.ad_count - a.ad_count)

  return jsonResponse({ competitors }, req)
}

async function handleSaveAd(
  orgId: string,
  body: RequestBody,
  req: Request,
  saved: boolean,
): Promise<Response> {
  if (!body.ad_id) {
    return errorResponse('ad_id is required', req, 400)
  }

  const svc = serviceClient()

  const { data, error } = await svc
    .from('linkedin_ad_library_ads')
    .update({ is_saved: saved })
    .eq('id', body.ad_id)
    .eq('org_id', orgId)
    .select('id, is_saved')
    .maybeSingle()

  if (error) {
    console.error(`[linkedin-ad-search] ${saved ? 'save' : 'unsave'}_ad error:`, error)
    return errorResponse(`Failed to ${saved ? 'save' : 'unsave'} ad: ${error.message}`, req, 500)
  }

  if (!data) {
    return errorResponse('Ad not found', req, 404)
  }

  return jsonResponse({ ad: data }, req)
}

/** Normalize text for similarity matching */
function normalizeText(text: string | null): string {
  if (!text) return ''
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

/** Jaccard word-set similarity */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeText(a).split(' ').filter(w => w.length > 2))
  const wordsB = new Set(normalizeText(b).split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let intersection = 0
  for (const word of wordsA) { if (wordsB.has(word)) intersection++ }
  return intersection / new Set([...wordsA, ...wordsB]).size
}

async function handleDetectAbTests(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  // Get all ads (optionally filtered by advertiser)
  let query = supabase
    .from('linkedin_ad_library_ads')
    .select('id, advertiser_name, headline, body_text, cta_text, media_type, first_seen_at, last_seen_at, num_likes, num_comments, num_reactions, is_saved')
    .eq('org_id', orgId)
    .neq('capture_source', 'organic')
    .order('advertiser_name')

  if (body.advertiser_name) {
    query = query.ilike('advertiser_name', `%${body.advertiser_name}%`)
  }

  const { data: ads, error } = await query

  if (error) {
    console.error('[linkedin-ad-search] detect_ab_tests error:', error)
    return errorResponse(`Failed to detect A/B tests: ${error.message}`, req, 500)
  }

  if (!ads || ads.length < 2) {
    return jsonResponse({ test_groups: [], total_groups: 0 }, req)
  }

  // Group by advertiser
  const byAdvertiser: Record<string, typeof ads> = {}
  for (const ad of ads) {
    const name = ad.advertiser_name || 'Unknown'
    if (!byAdvertiser[name]) byAdvertiser[name] = []
    byAdvertiser[name].push(ad)
  }

  // Within each advertiser, find similar ad pairs (>60% Jaccard)
  const AB_THRESHOLD = 0.6
  const testGroups: Array<{
    advertiser: string
    ads: typeof ads
    variable_type: string
    winner_id: string | null
  }> = []

  for (const [advertiser, advAds] of Object.entries(byAdvertiser)) {
    if (advAds.length < 2) continue

    const used = new Set<number>()

    for (let i = 0; i < advAds.length; i++) {
      if (used.has(i)) continue

      const group = [advAds[i]]
      used.add(i)

      for (let j = i + 1; j < advAds.length; j++) {
        if (used.has(j)) continue

        const sim = textSimilarity(advAds[i].body_text, advAds[j].body_text)
        if (sim >= AB_THRESHOLD) {
          group.push(advAds[j])
          used.add(j)
        }
      }

      if (group.length >= 2) {
        // Identify what's different
        const sameHeadline = group.every(a => normalizeText(a.headline) === normalizeText(group[0].headline))
        const sameCta = group.every(a => normalizeText(a.cta_text) === normalizeText(group[0].cta_text))
        const sameMedia = group.every(a => a.media_type === group[0].media_type)

        let variableType = 'body copy'
        if (!sameHeadline) variableType = 'headline'
        else if (!sameCta) variableType = 'CTA'
        else if (!sameMedia) variableType = 'creative format'

        // Pick winner: longest running or highest engagement
        let winner = group[0]
        for (const ad of group) {
          const adDays = (new Date(ad.last_seen_at).getTime() - new Date(ad.first_seen_at).getTime()) / 86400000
          const winnerDays = (new Date(winner.last_seen_at).getTime() - new Date(winner.first_seen_at).getTime()) / 86400000
          const adEngagement = (ad.num_likes ?? 0) + (ad.num_comments ?? 0) + (ad.num_reactions ?? 0)
          const winnerEngagement = (winner.num_likes ?? 0) + (winner.num_comments ?? 0) + (winner.num_reactions ?? 0)

          if (adDays > winnerDays || (adDays === winnerDays && adEngagement > winnerEngagement)) {
            winner = ad
          }
        }

        testGroups.push({
          advertiser,
          ads: group,
          variable_type: variableType,
          winner_id: winner.id,
        })
      }
    }
  }

  // Sort by group size descending
  testGroups.sort((a, b) => b.ads.length - a.ads.length)

  return jsonResponse({
    test_groups: testGroups.slice(0, 20),
    total_groups: testGroups.length,
  }, req)
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', req, 405)
    }

    // Authenticate
    const token = extractToken(req)
    if (!token) {
      return errorResponse('Missing authorization token', req, 401)
    }

    const supabase = userClient(token)
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    // Resolve org
    const orgId = await resolveOrgId(supabase, user.id)
    if (!orgId) {
      return errorResponse('User is not a member of any organization', req, 403)
    }

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

    console.log(`[linkedin-ad-search] action=${body.action} org=${orgId} user=${user.id}`)

    // Route to handler
    switch (body.action) {
      case 'search':
        return await handleSearch(supabase, orgId, body, req)

      case 'get_clusters':
        return await handleGetClusters(supabase, orgId, body, req)

      case 'get_trends':
        return await handleGetTrends(supabase, orgId, body, req)

      case 'get_likely_winners':
        return await handleGetLikelyWinners(supabase, orgId, body, req)

      case 'get_competitor_stats':
        return await handleGetCompetitorStats(supabase, orgId, req)

      case 'detect_ab_tests':
        return await handleDetectAbTests(supabase, orgId, body, req)

      case 'get_watchlist':
        return await handleGetWatchlist(supabase, orgId, req)

      case 'add_watchlist':
        return await handleAddWatchlist(orgId, user.id, body, req)

      case 'remove_watchlist':
        return await handleRemoveWatchlist(orgId, body, req)

      case 'update_watchlist':
        return await handleUpdateWatchlist(orgId, body, req)

      case 'get_ad_detail':
        return await handleGetAdDetail(supabase, orgId, body, req)

      case 'submit_manual_ad':
        return await handleSubmitManualAd(orgId, body, req)

      case 'save_ad':
        return await handleSaveAd(orgId, body, req, true)

      case 'unsave_ad':
        return await handleSaveAd(orgId, body, req, false)

      default:
        return errorResponse(`Unknown action: ${body.action}`, req, 400)
    }
  } catch (err) {
    console.error('[linkedin-ad-search] Unhandled error:', err)
    return errorResponse('Internal server error', req, 500)
  }
})
