import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * scrape-brand-guidelines — Auto-extract brand identity from a website, uploaded file, or both
 *
 * Uses Exa search + Gemini 2.5 Flash to extract:
 *   - Brand colors (hex values with roles)
 *   - Typography (heading + body fonts)
 *   - Brand tone/voice
 *   - Logo URL
 *
 * POST body (all fields optional, but at least one source required):
 *   {
 *     website_url?: string,                       // Website analysis (falls back to org's company_website)
 *     file_data?: string,                          // Base64-encoded file content
 *     file_type?: string,                          // MIME type: application/pdf, image/png, image/jpeg, image/svg+xml, text/markdown
 *     file_name?: string                           // Original filename
 *   }
 *
 * Supports three input modes:
 *   1. Website analysis only — { website_url }
 *   2. File upload only — { file_data, file_type, file_name }
 *   3. Both combined — all fields
 *
 * Returns:
 *   { brand_guidelines: { colors, heading_font, body_font, tone }, source: string }
 */

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'text/markdown',
] as const

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
const EXA_URL = 'https://api.exa.ai/search'

const TONE_DESCRIPTIONS: Record<string, string> = {
  formal: 'Write in a polished, professional manner. Use proper grammar, avoid slang, and maintain authority. Suitable for enterprise, legal, and finance audiences.',
  conversational: 'Write like a knowledgeable friend. Use contractions, ask rhetorical questions, and keep sentences short. Approachable but still credible.',
  playful: 'Write with energy and personality. Use bold statements, wordplay, and punchy rhythm. Not afraid to break conventions — but never at the expense of clarity.',
  authoritative: 'Write with deep confidence and domain expertise. Lead with data, use decisive language, and position as the definitive source. No hedging.',
  minimal: 'Write with radical brevity. Every word earns its place. Short sentences. No filler. Let whitespace do the work.',
}

/**
 * Build a ready-to-use AI system prompt from structured brand guidelines.
 * This prompt can be injected into any agent's system message to enforce brand consistency.
 */
function buildBrandPrompt(
  guidelines: Record<string, unknown>,
  orgName: string,
  websiteUrl?: string
): string {
  const lines: string[] = []
  lines.push(`## Brand Identity — ${orgName}`)
  if (websiteUrl) lines.push(`Website: ${websiteUrl}`)
  lines.push('')

  // Colors
  const colors = guidelines.colors as Array<{ hex: string; role: string }> | undefined
  if (colors?.length) {
    lines.push('### Color Palette')
    for (const c of colors) {
      const role = (c.role || 'accent').toLowerCase()
      let usage = ''
      if (role.includes('primary')) usage = ' — Use for headings, buttons, and primary CTAs'
      else if (role.includes('secondary')) usage = ' — Use for supporting elements, borders, and secondary actions'
      else if (role.includes('accent')) usage = ' — Use sparingly for highlights, badges, and emphasis'
      else if (role.includes('background')) usage = ' — Use for page/section backgrounds'
      else if (role.includes('text') || role.includes('dark')) usage = ' — Use for body text and dark UI elements'
      lines.push(`- ${c.role || 'Accent'}: \`${c.hex}\`${usage}`)
    }
    lines.push('')
    lines.push('When generating HTML/CSS, landing pages, emails, or visual assets, use ONLY these brand colors. Do not introduce new colors unless asked. Ensure sufficient contrast for accessibility (WCAG AA).')
    lines.push('')
  }

  // Typography
  const headingFont = guidelines.heading_font as string | null
  const bodyFont = guidelines.body_font as string | null
  if (headingFont || bodyFont) {
    lines.push('### Typography')
    if (headingFont) lines.push(`- **Headings**: ${headingFont} — Use for all h1-h4, hero text, and display copy`)
    if (bodyFont) lines.push(`- **Body**: ${bodyFont} — Use for paragraphs, descriptions, UI labels, and long-form text`)
    if (headingFont && bodyFont && headingFont !== bodyFont) {
      lines.push(`- Pair ${headingFont} headings with ${bodyFont} body text for visual hierarchy`)
    }
    lines.push('')
    lines.push('Always specify these fonts in CSS/HTML output. Include Google Fonts imports or system font fallbacks.')
    lines.push('')
  }

  // Tone
  const tone = guidelines.tone as string | null
  if (tone) {
    lines.push('### Voice & Tone')
    const toneKey = tone.toLowerCase().trim()
    const desc = TONE_DESCRIPTIONS[toneKey]
    if (desc) {
      lines.push(`Style: **${tone}**`)
      lines.push(desc)
    } else {
      lines.push(`Style: **${tone}**`)
      lines.push(`Write in a ${tone} manner. Match this tone consistently across all copy — headlines, body text, CTAs, and microcopy.`)
    }
    lines.push('')
    lines.push('Apply this tone to ALL generated content: email subject lines, ad copy, landing page headlines, proposals, follow-up messages, and social posts.')
    lines.push('')
  }

  // Usage rules
  lines.push('### Rules')
  lines.push('- Never deviate from the brand colors, fonts, or tone unless explicitly asked')
  lines.push('- When creating visual assets, prioritize brand consistency over generic best practices')
  lines.push('- Match the energy level implied by the tone — formal brands need measured copy, playful brands can be bold')
  if (colors?.length) {
    const primary = colors.find(c => c.role?.toLowerCase().includes('primary'))
    if (primary) lines.push(`- Default CTA/button color: \`${primary.hex}\``)
  }

  return lines.join('\n')
}

serve(async (req: Request) => {
  const corsResult = handleCorsPreflightRequest(req)
  if (corsResult) return corsResult
  const corsHeaders = getCorsHeaders(req)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')!
    const exaApiKey = Deno.env.get('EXA_API_KEY') || ''
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get org
    const { data: membership } = await serviceClient
      .from('organization_memberships').select('org_id')
      .eq('user_id', user.id).limit(1).maybeSingle()
    if (!membership) {
      return new Response(JSON.stringify({ error: 'No org membership' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const orgId = membership.org_id as string

    // Get org details
    const { data: org } = await serviceClient
      .from('organizations')
      .select('name, company_website, website, logo_url')
      .eq('id', orgId).maybeSingle()

    const body = await req.json().catch(() => ({}))
    const websiteUrl = body.website_url || org?.company_website || org?.website || ''
    const fileData: string | undefined = body.file_data
    const fileType: string | undefined = body.file_type
    const fileName: string | undefined = body.file_name

    const hasFile = !!(fileData && fileType)
    const hasWebsite = !!websiteUrl

    if (!hasFile && !hasWebsite) {
      return new Response(JSON.stringify({ error: 'No website URL or file provided. Set your company website in Organization Settings or upload a brand guidelines file.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate file type if a file is provided
    if (hasFile && !ALLOWED_FILE_TYPES.includes(fileType as typeof ALLOWED_FILE_TYPES[number])) {
      return new Response(JSON.stringify({ error: `Unsupported file type: ${fileType}. Supported: ${ALLOWED_FILE_TYPES.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sources: string[] = []
    if (hasWebsite) sources.push(websiteUrl)
    if (hasFile) sources.push(fileName || 'uploaded file')
    console.log(`[scrape-brand] Extracting brand from: ${sources.join(' + ')}`)

    // Phase 1: Gather content from all sources
    let pageContent = ''

    // Fetch website content (only when we have a URL)
    if (hasWebsite) {
      // Try Exa first for rich content extraction
      if (exaApiKey) {
        try {
          const domain = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname
          const exaResponse = await fetch(EXA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': exaApiKey },
            body: JSON.stringify({
              query: `${domain} brand guidelines colors design`,
              numResults: 3,
              includeDomains: [domain],
              type: 'auto',
              contents: { text: { maxCharacters: 5000 } },
            }),
          })
          if (exaResponse.ok) {
            const exaData = await exaResponse.json()
            const texts = (exaData.results || []).map((r: { text?: string; title?: string; url?: string }) =>
              `[${r.title || r.url}]\n${r.text || ''}`
            )
            pageContent = texts.join('\n\n---\n\n')
            console.log(`[scrape-brand] Exa returned ${exaData.results?.length || 0} results`)
          }
        } catch (exaErr) {
          console.warn('[scrape-brand] Exa search failed:', exaErr)
        }
      }

      // Fallback: direct fetch of the homepage
      if (!pageContent) {
        try {
          const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`
          const pageResponse = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SixtyBot/1.0)' },
            redirect: 'follow',
          })
          if (pageResponse.ok) {
            const html = await pageResponse.text()
            // Extract useful parts: meta tags, CSS custom properties, visible text
            const metaMatch = html.match(/<meta[^>]*>/gi)?.join('\n') || ''
            const styleMatch = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi)?.join('\n').slice(0, 3000) || ''
            const linkTags = html.match(/<link[^>]*>/gi)?.join('\n') || ''
            // Strip HTML tags for body text
            const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .slice(0, 3000)
            pageContent = `META TAGS:\n${metaMatch}\n\nLINK TAGS:\n${linkTags}\n\nSTYLES:\n${styleMatch}\n\nBODY TEXT:\n${bodyText}`
            console.log('[scrape-brand] Direct fetch successful')
          }
        } catch (fetchErr) {
          console.warn('[scrape-brand] Direct fetch failed:', fetchErr)
        }
      }

      if (!pageContent && !hasFile) {
        return new Response(JSON.stringify({ error: 'Could not fetch website content' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Phase 2: Build Gemini request parts (multimodal when files are present)
    const extractionPrompt = `Analyze the provided content and extract the brand identity. Look for:
1. Brand colors — find hex/rgb color values, CSS custom properties, or colors visible in images/PDFs. Identify primary, secondary, and accent colors.
2. Typography — find font-family declarations, Google Fonts links, or font names mentioned.
3. Brand tone/voice — analyze the copy style. Is it formal, casual, bold, playful, technical, etc?

${pageContent ? `WEBSITE CONTENT:\n${pageContent.slice(0, 8000)}\n` : ''}
Return ONLY valid JSON (no markdown, no code fences):
{
  "colors": [
    { "hex": "#XXXXXX", "role": "primary" },
    { "hex": "#XXXXXX", "role": "secondary" },
    { "hex": "#XXXXXX", "role": "accent" }
  ],
  "heading_font": "Font Name or null",
  "body_font": "Font Name or null",
  "tone": "2-3 word description like: professional, bold, friendly"
}`

    // Build content parts array for Gemini
    const geminiParts: Array<Record<string, unknown>> = [{ text: extractionPrompt }]

    // Add file as additional content for Gemini multimodal analysis
    if (hasFile && fileData && fileType) {
      if (fileType === 'text/markdown') {
        // Decode markdown from base64 and send as text
        const markdownText = new TextDecoder().decode(
          Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0))
        )
        geminiParts.push({ text: `\n\nBRAND GUIDELINES DOCUMENT (${fileName || 'file.md'}):\n${markdownText.slice(0, 10000)}` })
        console.log(`[scrape-brand] Added markdown file content (${markdownText.length} chars)`)
      } else {
        // Send PDF/images as inline_data for Gemini multimodal
        geminiParts.push({
          inline_data: {
            mime_type: fileType,
            data: fileData,
          },
        })
        console.log(`[scrape-brand] Added inline ${fileType} file (${fileName || 'unknown'})`)
      }
    }

    const geminiResponse = await fetch(`${GEMINI_URL}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000, thinkingConfig: { thinkingBudget: 0 } },
      }),
    })

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text()
      console.error('[scrape-brand] Gemini error:', errText.slice(0, 500))
      throw new Error(`Gemini API error (${geminiResponse.status})`)
    }

    const geminiData = await geminiResponse.json()
    const candidate = geminiData?.candidates?.[0]
    if (!candidate) throw new Error('No response from Gemini')

    const textParts = (candidate.content?.parts ?? []).filter(
      (p: { thought?: boolean; text?: string }) => p.thought !== true && p.text
    )
    const rawText = textParts.map((p: { text: string }) => p.text).join('')
    const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    let brandGuidelines: Record<string, unknown>
    try {
      brandGuidelines = JSON.parse(jsonStr)
    } catch {
      console.error('[scrape-brand] JSON parse error:', rawText.slice(0, 500))
      throw new Error('Failed to parse brand extraction result')
    }

    // Validate colors are proper hex
    if (Array.isArray(brandGuidelines.colors)) {
      brandGuidelines.colors = (brandGuidelines.colors as Array<{ hex: string; role: string }>)
        .filter(c => c.hex && /^#[0-9A-Fa-f]{3,8}$/.test(c.hex))
    }

    // Generate brand_prompt — a ready-to-use AI system prompt for all agents
    const orgName = org?.name || 'the company'
    brandGuidelines.brand_prompt = buildBrandPrompt(brandGuidelines, orgName, websiteUrl)

    // Save to organization
    const { error: updateError } = await serviceClient
      .from('organizations')
      .update({
        brand_guidelines: brandGuidelines,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId)

    if (updateError) {
      console.error('[scrape-brand] Failed to save:', updateError)
      throw new Error('Failed to save brand guidelines')
    }

    console.log('[scrape-brand] Brand guidelines saved with brand_prompt')

    return new Response(JSON.stringify({
      brand_guidelines: brandGuidelines,
      source: sources.join(' + '),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    console.error('[scrape-brand] Error:', error)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
