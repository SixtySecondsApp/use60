import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * linkedin-ad-landing-capture — Capture landing page data from ad destination URLs
 *
 * Fetches the destination_url, extracts metadata (title, description, OG image,
 * H1, CTAs), and stores it in the landing_page JSONB column.
 *
 * POST body: { ad_id: string }
 */

serve(async (req: Request) => {
  const corsResult = handleCorsPreflightRequest(req)
  if (corsResult) return corsResult
  const corsHeaders = getCorsHeaders(req)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Authenticate user
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve org
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const orgId = membership.org_id as string

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json()
    const { ad_id } = body

    if (!ad_id) {
      return new Response(JSON.stringify({ error: 'ad_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up the ad
    const { data: ad, error: adError } = await serviceClient
      .from('linkedin_ad_library_ads')
      .select('id, destination_url, advertiser_name')
      .eq('id', ad_id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (adError || !ad) {
      return new Response(JSON.stringify({ error: 'Ad not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const destinationUrl = ad.destination_url
    if (!destinationUrl) {
      return new Response(JSON.stringify({ error: 'Ad has no destination URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[linkedin-ad-landing-capture] Fetching: ${destinationUrl}`)

    // Fetch the landing page
    let html = ''
    let finalUrl = destinationUrl
    try {
      const response = await fetch(destinationUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      })

      finalUrl = response.url
      html = await response.text()
    } catch (fetchErr) {
      console.error('[linkedin-ad-landing-capture] Fetch error:', fetchErr)
      return new Response(JSON.stringify({ error: `Failed to fetch landing page: ${(fetchErr as Error).message}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Extract metadata from HTML
    const title = extractMeta(html, /<title[^>]*>([^<]+)<\/title>/i)
    const metaDescription = extractMetaTag(html, 'description')
    const ogTitle = extractMetaProperty(html, 'og:title')
    const ogDescription = extractMetaProperty(html, 'og:description')
    const ogImage = extractMetaProperty(html, 'og:image')
    const h1 = extractMeta(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)

    // Extract CTA buttons (common patterns)
    const ctaPatterns = [
      /<(?:a|button)[^>]*class="[^"]*(?:cta|btn-primary|hero-btn|main-cta)[^"]*"[^>]*>([\s\S]*?)<\/(?:a|button)>/gi,
      /<(?:a|button)[^>]*>((?:Get Started|Sign Up|Book a Demo|Start Free|Try Free|Request Demo|Learn More|Contact Us|Schedule|Buy Now|Subscribe)[^<]*)<\/(?:a|button)>/gi,
    ]

    const ctas: string[] = []
    for (const pattern of ctaPatterns) {
      let match
      while ((match = pattern.exec(html)) !== null) {
        const text = stripHtml(match[1]).trim()
        if (text && text.length < 100 && !ctas.includes(text)) {
          ctas.push(text)
        }
      }
    }

    const landingPage = {
      url: finalUrl,
      title: ogTitle || title || null,
      description: ogDescription || metaDescription || null,
      og_image: ogImage || null,
      h1: h1 ? stripHtml(h1).trim() : null,
      ctas: ctas.slice(0, 5),
      captured_at: new Date().toISOString(),
    }

    // Store on the ad record
    const { error: updateError } = await serviceClient
      .from('linkedin_ad_library_ads')
      .update({ landing_page: landingPage })
      .eq('id', ad_id)
      .eq('org_id', orgId)

    if (updateError) {
      console.error('[linkedin-ad-landing-capture] Update error:', updateError)
      return new Response(JSON.stringify({ error: `Failed to save: ${updateError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[linkedin-ad-landing-capture] Captured landing page for ad ${ad_id}: ${landingPage.title}`)

    return new Response(
      JSON.stringify({ landing_page: landingPage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    console.error('[linkedin-ad-landing-capture] Error:', error)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// ---------------------------------------------------------------------------
// HTML parsing helpers (no DOM parser in Deno edge runtime)
// ---------------------------------------------------------------------------

function extractMeta(html: string, regex: RegExp): string | null {
  const match = html.match(regex)
  return match ? match[1] : null
}

function extractMetaTag(html: string, name: string): string | null {
  const regex = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i')
  const match = html.match(regex)
  if (match) return match[1]
  // Try reverse order (content before name)
  const regex2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i')
  const match2 = html.match(regex2)
  return match2 ? match2[1] : null
}

function extractMetaProperty(html: string, property: string): string | null {
  const regex = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
  const match = html.match(regex)
  if (match) return match[1]
  const regex2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i')
  const match2 = html.match(regex2)
  return match2 ? match2[1] : null
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ')
}
