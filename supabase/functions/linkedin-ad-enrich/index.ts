import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * linkedin-ad-enrich — Enrich ad library entries with engagement metrics
 *
 * Scrapes company posts from LinkedIn using Apify, then fuzzy-matches
 * post text to ad library body_text to attach likes/comments/reactions.
 *
 * POST body:
 *   { action: "enrich_advertiser", advertiser_name: "HubSpot" }
 *   { action: "enrich_all" }  — enrich all advertisers with ads in the library
 */

const APIFY_COMPANY_POST_ACTOR = 'dROPwXpqeCOK9ZRGG'
const APIFY_API_BASE = 'https://api.apify.com/v2'
const POLL_INTERVAL_MS = 5_000
const POLL_MAX_DURATION_MS = 120_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize text for fuzzy matching — lowercase, strip whitespace/emoji/punctuation */
function normalizeText(text: string | null): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Calculate similarity between two strings (Jaccard index on word sets) */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeText(a).split(' ').filter(w => w.length > 2))
  const wordsB = new Set(normalizeText(b).split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let intersection = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++
  }

  const union = new Set([...wordsA, ...wordsB]).size
  return intersection / union
}

/** Start an Apify actor run */
async function startActorRun(
  apifyToken: string,
  actorId: string,
  input: Record<string, unknown>,
): Promise<{ id: string; status: string; defaultDatasetId: string }> {
  const url = `${APIFY_API_BASE}/acts/${actorId}/runs?token=${apifyToken}`
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
  return result.data
}

/** Poll an Apify run until it completes */
async function pollRunCompletion(
  apifyToken: string,
  runId: string,
): Promise<{ id: string; status: string; defaultDatasetId: string }> {
  const startTime = Date.now()

  while (Date.now() - startTime < POLL_MAX_DURATION_MS) {
    const url = `${APIFY_API_BASE}/actor-runs/${runId}?token=${apifyToken}`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Apify poll failed (${response.status})`)

    const result = await response.json()
    const run = result.data

    if (run.status === 'SUCCEEDED') return run
    if (run.status === 'FAILED' || run.status === 'ABORTED' || run.status === 'TIMED-OUT') {
      throw new Error(`Apify run ${run.status}: ${runId}`)
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(`Apify run timed out after ${POLL_MAX_DURATION_MS / 1000}s`)
}

/** Fetch dataset items */
async function fetchDatasetItems(
  apifyToken: string,
  datasetId: string,
): Promise<Record<string, unknown>[]> {
  const url = `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${apifyToken}&format=json`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Apify dataset fetch failed (${response.status})`)
  return await response.json()
}

/** Extract posts from the company post scraper response */
function extractPosts(items: Record<string, unknown>[]): Array<{
  text: string
  num_likes: number
  num_comments: number
  num_reactions: number
  url: string
  posted: string
}> {
  const posts: Array<{
    text: string
    num_likes: number
    num_comments: number
    num_reactions: number
    url: string
    posted: string
  }> = []

  for (const item of items) {
    // The actor returns { data: [...posts] } or a flat array
    const dataArr = Array.isArray(item.data) ? item.data as Record<string, unknown>[] : [item]
    for (const post of dataArr) {
      const likes = Number(post.num_likes ?? 0)
      const comments = Number(post.num_comments ?? 0)
      const empathy = Number(post.num_empathy ?? 0)
      const praises = Number(post.num_praises ?? 0)
      const appreciations = Number(post.num_appreciations ?? 0)
      const interests = Number(post.num_interests ?? 0)
      const totalReactions = likes + empathy + praises + appreciations + interests

      posts.push({
        text: String(post.text ?? ''),
        num_likes: likes,
        num_comments: comments,
        num_reactions: totalReactions,
        url: String(post.url ?? ''),
        posted: String(post.posted ?? ''),
      })
    }
  }

  return posts
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const corsResult = handleCorsPreflightRequest(req)
  if (corsResult) return corsResult
  const corsHeaders = getCorsHeaders(req)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    // Authenticate user
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get org
    const { data: membership } = await serviceClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return new Response(JSON.stringify({ error: 'No org membership' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const orgId = membership.org_id as string

    const body = await req.json()
    const { action } = body

    // Get Apify token
    const { data: creds } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'apify')
      .maybeSingle()

    const apifyToken = (creds?.credentials as Record<string, string>)?.api_token
    if (!apifyToken) {
      return new Response(
        JSON.stringify({ error: 'Apify API token not configured', code: 'APIFY_NOT_CONFIGURED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'enrich_advertiser') {
      const { advertiser_name } = body
      if (!advertiser_name) throw new Error('advertiser_name is required')

      const result = await enrichAdvertiser(serviceClient, apifyToken, orgId, advertiser_name)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'enrich_all') {
      // Get all distinct advertisers
      const { data: advertisers } = await serviceClient
        .from('linkedin_ad_library_ads')
        .select('advertiser_name')
        .eq('org_id', orgId)
        .is('engagement_updated_at', null)

      const uniqueNames = [...new Set((advertisers ?? []).map((a: { advertiser_name: string }) => a.advertiser_name))]
      const results: Array<{ name: string; matched: number; error?: string }> = []

      for (const name of uniqueNames) {
        try {
          const r = await enrichAdvertiser(serviceClient, apifyToken, orgId, name)
          results.push({ name, matched: r.matched })
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Unknown error'
          results.push({ name, matched: 0, error: message })
        }
      }

      return new Response(JSON.stringify({ enriched: results.length, results }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Unknown action: ${action}`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    console.error(`[linkedin-ad-enrich] Error:`, error)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})

// ---------------------------------------------------------------------------
// Enrichment logic
// ---------------------------------------------------------------------------

async function enrichAdvertiser(
  serviceClient: ReturnType<typeof createClient>,
  apifyToken: string,
  orgId: string,
  advertiserName: string,
): Promise<{ advertiser: string; posts_scraped: number; matched: number }> {
  console.log(`[linkedin-ad-enrich] Enriching: ${advertiserName}`)

  // Get ads for this advertiser
  const { data: ads } = await serviceClient
    .from('linkedin_ad_library_ads')
    .select('id, headline, body_text, advertiser_linkedin_url')
    .eq('org_id', orgId)
    .eq('advertiser_name', advertiserName)

  if (!ads || ads.length === 0) {
    return { advertiser: advertiserName, posts_scraped: 0, matched: 0 }
  }

  // Build company URL from first ad's advertiser URL, or guess from name
  let companyUrl = ''
  const firstAdUrl = ads[0].advertiser_linkedin_url
  if (firstAdUrl && firstAdUrl.includes('linkedin.com/company/')) {
    companyUrl = firstAdUrl.replace(/\/posts\/?$/, '')
    if (!companyUrl.endsWith('/')) companyUrl += '/'
  } else {
    const slug = advertiserName.toLowerCase().replace(/[^a-z0-9]/g, '')
    companyUrl = `https://www.linkedin.com/company/${slug}/`
  }

  console.log(`[linkedin-ad-enrich] Scraping posts from: ${companyUrl}`)

  // Start Apify company post scraper
  const run = await startActorRun(apifyToken, APIFY_COMPANY_POST_ACTOR, {
    linkedin_url: companyUrl,
  })

  const completedRun = await pollRunCompletion(apifyToken, run.id)
  const items = await fetchDatasetItems(apifyToken, completedRun.defaultDatasetId)
  const posts = extractPosts(items)

  console.log(`[linkedin-ad-enrich] Got ${posts.length} posts for ${advertiserName}`)

  // Match posts to ads using text similarity
  const MATCH_THRESHOLD = 0.25 // At least 25% word overlap
  let matched = 0

  for (const ad of ads) {
    const adText = [ad.headline, ad.body_text].filter(Boolean).join(' ')
    if (!adText.trim()) continue

    let bestMatch: typeof posts[0] | null = null
    let bestScore = 0

    for (const post of posts) {
      if (!post.text.trim()) continue
      const score = textSimilarity(adText, post.text)
      if (score > bestScore && score >= MATCH_THRESHOLD) {
        bestScore = score
        bestMatch = post
      }
    }

    if (bestMatch) {
      const { error: updateError } = await serviceClient
        .from('linkedin_ad_library_ads')
        .update({
          num_likes: bestMatch.num_likes,
          num_comments: bestMatch.num_comments,
          num_reactions: bestMatch.num_reactions,
          engagement_post_url: bestMatch.url,
          engagement_updated_at: new Date().toISOString(),
        })
        .eq('id', ad.id)

      if (updateError) {
        console.error(`[linkedin-ad-enrich] Update error for ad ${ad.id}:`, updateError.message)
      } else {
        matched++
        console.log(`[linkedin-ad-enrich] Matched ad ${ad.id} → ${bestMatch.num_reactions} reactions (score: ${bestScore.toFixed(2)})`)
      }
    }
  }

  // Mark unmatched ads as enriched (so we don't retry them)
  await serviceClient
    .from('linkedin_ad_library_ads')
    .update({ engagement_updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('advertiser_name', advertiserName)
    .is('engagement_updated_at', null)

  return { advertiser: advertiserName, posts_scraped: posts.length, matched }
}
