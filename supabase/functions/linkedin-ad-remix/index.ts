import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * linkedin-ad-remix — AI Ad Remix
 *
 * Generates adapted copy variants from a saved ad using Gemini 2.5 Flash,
 * and optionally generates a new creative image using Gemini image generation.
 *
 * POST body:
 *   { ad_id: string }
 *
 * Returns:
 *   { variants: [{ headline, body, cta, angle }], image_url?: string }
 */

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent`

serve(async (req: Request) => {
  const corsResult = handleCorsPreflightRequest(req)
  if (corsResult) return corsResult
  const corsHeaders = getCorsHeaders(req)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')!
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

    // Get org membership
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

    // Parse body
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
      .select('id, headline, body_text, cta_text, advertiser_name, media_type, media_urls, org_id')
      .eq('id', ad_id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (adError || !ad) {
      return new Response(JSON.stringify({ error: 'Ad not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up org profile
    const { data: org } = await serviceClient
      .from('organizations')
      .select('name, website')
      .eq('id', orgId)
      .maybeSingle()

    const orgName = org?.name || 'Our Company'
    const orgWebsite = org?.website || ''

    // Build the Gemini copy generation prompt
    const prompt = `You are an expert LinkedIn ad copywriter. Given the following competitor ad, create 3 adapted variants for a different company.

ORIGINAL AD:
Headline: ${ad.headline || '(none)'}
Body: ${ad.body_text || '(none)'}
CTA: ${ad.cta_text || '(none)'}
Advertiser: ${ad.advertiser_name || '(unknown)'}

TARGET COMPANY: ${orgName}
${orgWebsite ? `Website: ${orgWebsite}` : ''}

Create 3 variants with different angles:
1. Direct adaptation (same angle, adapted for target company)
2. Alternative hook (different opening, same core message)
3. Bold/contrarian take (provocative angle on the same topic)

Return ONLY valid JSON (no markdown, no code fences):
{"variants":[{"headline":"...","body":"...","cta":"...","angle":"..."}]}`

    // Call Gemini 2.5 Flash for copy variants
    const geminiResponse = await fetch(`${GEMINI_URL}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 2000,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    })

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text()
      console.error('[linkedin-ad-remix] Gemini error:', errText.slice(0, 500))
      throw new Error(`Gemini API error (${geminiResponse.status})`)
    }

    const geminiData = await geminiResponse.json()
    const candidate = geminiData?.candidates?.[0]
    if (!candidate) throw new Error('No response from Gemini')

    // Filter out thinking parts and extract text
    const textParts = (candidate.content?.parts ?? []).filter(
      (p: { thought?: boolean; text?: string }) => p.thought !== true && p.text
    )
    const rawText = textParts.map((p: { text: string }) => p.text).join('')

    // Parse JSON from the response (strip any accidental markdown fences)
    const jsonMatch = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    let variants: Array<{ headline: string; body: string; cta: string; angle: string }>
    try {
      const parsed = JSON.parse(jsonMatch)
      variants = parsed.variants ?? []
    } catch (parseErr) {
      console.error('[linkedin-ad-remix] JSON parse error:', rawText.slice(0, 500))
      throw new Error('Failed to parse Gemini response as JSON')
    }

    // Optionally generate an image if the original ad has images
    let imageUrl: string | undefined
    const hasImages = ad.media_type === 'image' || ad.media_type === 'carousel'
    if (hasImages && variants.length > 0) {
      try {
        const firstVariant = variants[0]
        const imagePrompt = `Create a professional LinkedIn ad creative image for a company called "${orgName}". The ad promotes: "${firstVariant.headline}". The message is about: "${firstVariant.body?.slice(0, 200)}". Style: clean, modern, professional B2B marketing visual. No text overlay needed — just the visual concept.`

        const imageResponse = await fetch(`${GEMINI_IMAGE_URL}?key=${geminiApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: imagePrompt }] }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          }),
        })

        if (imageResponse.ok) {
          const imageData = await imageResponse.json()
          const imageCandidate = imageData?.candidates?.[0]
          const imageParts = (imageCandidate?.content?.parts ?? []).filter(
            (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData?.data
          )

          if (imageParts.length > 0) {
            const { mimeType, data: base64data } = imageParts[0].inlineData
            imageUrl = `data:${mimeType};base64,${base64data}`
          }
        } else {
          // Image generation is optional — log but don't fail
          const errText = await imageResponse.text()
          console.warn('[linkedin-ad-remix] Image generation failed:', errText.slice(0, 300))
        }
      } catch (imgErr) {
        console.warn('[linkedin-ad-remix] Image generation error:', imgErr)
      }
    }

    const result: { variants: typeof variants; image_url?: string } = { variants }
    if (imageUrl) result.image_url = imageUrl

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    console.error('[linkedin-ad-remix] Error:', error)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
