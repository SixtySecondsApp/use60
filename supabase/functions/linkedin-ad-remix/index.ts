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
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const NANO_BANANA_MODEL = 'google/gemini-3-pro-image-preview'

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
    const { ad_id, similarity = 50 } = body

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

    // Look up org profile with brand guidelines
    const { data: org } = await serviceClient
      .from('organizations')
      .select('name, website, company_website, brand_guidelines, logo_url')
      .eq('id', orgId)
      .maybeSingle()

    const orgName = org?.name || 'Our Company'
    const orgWebsite = org?.website || org?.company_website || ''
    const brandGuidelines = org?.brand_guidelines as Record<string, unknown> | null

    // Build brand context for prompts
    let brandContext = ''
    if (brandGuidelines) {
      const parts: string[] = []
      const colors = brandGuidelines.colors as Array<{ hex: string; role: string }> | undefined
      if (colors?.length) {
        parts.push(`Brand Colors: ${colors.map(c => `${c.role || 'accent'}: ${c.hex}`).join(', ')}`)
      }
      if (brandGuidelines.heading_font) parts.push(`Heading Font: ${brandGuidelines.heading_font}`)
      if (brandGuidelines.body_font) parts.push(`Body Font: ${brandGuidelines.body_font}`)
      if (brandGuidelines.tone) parts.push(`Brand Tone: ${brandGuidelines.tone}`)
      if (parts.length > 0) brandContext = `\n\nBRAND GUIDELINES:\n${parts.join('\n')}`
    }

    // Map similarity (0-100) to creative direction
    // 0 = completely different, 100 = very similar to original
    const simPercent = Math.max(0, Math.min(100, Number(similarity) || 50))
    const temperature = simPercent <= 25 ? 1.2 : simPercent <= 50 ? 0.9 : simPercent <= 75 ? 0.6 : 0.3

    let styleDirection: string
    if (simPercent <= 25) {
      styleDirection = 'Create COMPLETELY DIFFERENT ads. New angles, new hooks, new messaging strategy. Only keep the general topic.'
    } else if (simPercent <= 50) {
      styleDirection = 'Create MODERATELY DIFFERENT ads. Keep the core message but use fresh angles, different hooks, and varied copy styles.'
    } else if (simPercent <= 75) {
      styleDirection = 'Create SIMILAR ads. Closely mirror the original structure and messaging, but adapt for the target company with minor variations.'
    } else {
      styleDirection = 'Create VERY SIMILAR ads. Keep the same structure, tone, hooks, and messaging pattern. Only change company-specific details.'
    }

    // Build the Gemini copy generation prompt
    const prompt = `You are an expert LinkedIn ad copywriter. Given the following competitor ad, create 3 adapted variants for a different company.

ORIGINAL AD:
Headline: ${ad.headline || '(none)'}
Body: ${ad.body_text || '(none)'}
CTA: ${ad.cta_text || '(none)'}
Advertiser: ${ad.advertiser_name || '(unknown)'}

TARGET COMPANY: ${orgName}
${orgWebsite ? `Website: ${orgWebsite}` : ''}${brandContext}

CREATIVE DIRECTION (similarity: ${simPercent}%):
${styleDirection}

Create 3 variants with different angles:
1. Direct adaptation (same angle, adapted for target company)
2. Alternative hook (different opening, same core message)
3. Bold/contrarian take (provocative angle on the same topic)

${brandGuidelines?.tone ? `Match the brand tone: "${brandGuidelines.tone}".` : ''}

Return ONLY valid JSON (no markdown, no code fences):
{"variants":[{"headline":"...","body":"...","cta":"...","angle":"..."}]}`

    // Call Gemini 2.5 Flash for copy variants
    const geminiResponse = await fetch(`${GEMINI_URL}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
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

    // Generate an image using Nano Banana 2 (Gemini 3 Pro Image via OpenRouter)
    let imageUrl: string | undefined
    let imageDebug: Record<string, unknown> | undefined
    if (variants.length > 0) {
      try {
        // Get OpenRouter API key from user_settings
        const { data: userSettings } = await serviceClient
          .from('user_settings')
          .select('ai_provider_keys')
          .eq('user_id', user.id)
          .maybeSingle()

        const openrouterKey = userSettings?.ai_provider_keys?.openrouter as string | undefined

        if (openrouterKey) {
          const firstVariant = variants[0]
          // Build brand-aware image prompt
          const brandColorStr = brandGuidelines?.colors
            ? (brandGuidelines.colors as Array<{ hex: string; role: string }>).map(c => c.hex).join(', ')
            : ''
          const imagePrompt = `Create a professional LinkedIn ad creative image for a company called "${orgName}". The ad headline is: "${firstVariant.headline}". The message: "${firstVariant.body?.slice(0, 200)}". Style: clean, modern, professional B2B SaaS marketing visual. Minimalist design, no text overlay — just the visual concept.${brandColorStr ? ` Use these brand colors: ${brandColorStr}.` : ''}${simPercent >= 70 ? ' Keep the visual style very close to a typical LinkedIn sponsored content ad.' : simPercent <= 30 ? ' Be bold and creative with an unconventional visual approach.' : ''}`

          console.log('[linkedin-ad-remix] Generating image via Nano Banana 2 (OpenRouter)')
          console.log('[linkedin-ad-remix] OpenRouter key length:', openrouterKey.length)

          const imageResponse = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openrouterKey}`,
              'HTTP-Referer': `${supabaseUrl}/functions/v1/linkedin-ad-remix`,
              'X-Title': 'Sixty - Ad Remix',
            },
            body: JSON.stringify({
              model: NANO_BANANA_MODEL,
              messages: [{ role: 'user', content: [{ type: 'text', text: imagePrompt }] }],
            }),
          })

          console.log('[linkedin-ad-remix] OpenRouter response status:', imageResponse.status)

          if (imageResponse.ok) {
            const imageData = await imageResponse.json()
            const content = imageData?.choices?.[0]?.message?.content

            // Log the response structure for debugging
            console.log('[linkedin-ad-remix] OpenRouter response keys:', JSON.stringify(Object.keys(imageData)))
            console.log('[linkedin-ad-remix] Content type:', typeof content)
            if (typeof content === 'string') {
              console.log('[linkedin-ad-remix] Content preview (string):', content.slice(0, 300))
            } else if (Array.isArray(content)) {
              console.log('[linkedin-ad-remix] Content blocks:', content.length, 'types:', content.map((b: { type?: string }) => b.type))
            } else if (content && typeof content === 'object') {
              console.log('[linkedin-ad-remix] Content (object) keys:', Object.keys(content))
            }

            // Extract image from response — OpenRouter returns various formats
            if (typeof content === 'string') {
              // Check for direct data URL or HTTP URL
              if (content.startsWith('data:image/') || content.startsWith('http')) {
                imageUrl = content
              } else {
                // Try to extract base64 data URL
                const b64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+\/]+=*/)?.[0]
                if (b64Match) {
                  imageUrl = b64Match
                } else {
                  // Try to extract HTTP URL
                  const urlMatch = content.match(/https?:\/\/[^\s\)\]\>\"\'\,]+/)?.[0]
                  if (urlMatch) imageUrl = urlMatch
                }
              }
            } else if (Array.isArray(content)) {
              for (const block of content) {
                // OpenAI-style image_url block
                if (block.type === 'image_url' && block.image_url?.url) {
                  imageUrl = block.image_url.url
                  break
                }
                // Gemini-style inline_data block (via OpenRouter)
                if (block.type === 'image' && block.source?.type === 'base64') {
                  imageUrl = `data:${block.source.media_type};base64,${block.source.data}`
                  break
                }
                if (block.type === 'image' && block.image) {
                  imageUrl = typeof block.image === 'string' ? block.image : block.image.url
                  break
                }
                // Text block that contains base64 image
                if (block.type === 'text' && typeof block.text === 'string') {
                  const b64 = block.text.match(/data:image\/[^;]+;base64,[A-Za-z0-9+\/]+=*/)?.[0]
                  if (b64) { imageUrl = b64; break }
                  const url = block.text.match(/https?:\/\/[^\s\)\]\>\"\'\,]+/)?.[0]
                  if (url) { imageUrl = url; break }
                }
              }
            }

            // Fallback: scan entire response JSON for base64 images or URLs
            if (!imageUrl) {
              const fullJson = JSON.stringify(imageData)
              const b64Fallback = fullJson.match(/data:image\/[^;]+;base64,[A-Za-z0-9+\/]+=*/)?.[0]
              if (b64Fallback) {
                imageUrl = b64Fallback
              } else {
                // Look for image URLs in the full response
                const imgUrlMatch = fullJson.match(/https?:\/\/[^\s\"\'\,\\]+\.(?:png|jpg|jpeg|webp|gif)[^\s\"\'\,\\]*/)?.[0]
                if (imgUrlMatch) imageUrl = imgUrlMatch
              }
            }

            if (imageUrl) {
              console.log('[linkedin-ad-remix] Image generated successfully, URL type:', imageUrl.startsWith('data:') ? 'base64' : 'http', 'length:', imageUrl.length)
            } else {
              // Return debug info so we can see exactly what OpenRouter returned
              imageDebug = {
                status: 'no_image_extracted',
                openrouter_status: imageResponse.status,
                response_keys: Object.keys(imageData),
                content_type: typeof content,
                content_preview: typeof content === 'string' ? content.slice(0, 500) : null,
                content_array_types: Array.isArray(content) ? content.map((b: { type?: string }) => ({ type: b.type, keys: Object.keys(b) })) : null,
                full_response_preview: JSON.stringify(imageData).slice(0, 2000),
              }
            }
          } else {
            const errText = await imageResponse.text()
            imageDebug = {
              status: 'openrouter_error',
              openrouter_status: imageResponse.status,
              error: errText.slice(0, 500),
            }
          }
        } else {
          imageDebug = { status: 'no_openrouter_key' }
        }
      } catch (imgErr) {
        console.warn('[linkedin-ad-remix] Image generation error:', imgErr)
      }
    }

    const result: Record<string, unknown> = { variants }
    if (imageUrl) result.image_url = imageUrl
    if (imageDebug) result._image_debug = imageDebug

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
