// Handler extracted from proposal-parse-document/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import mammoth from 'https://esm.sh/mammoth@1.6.0'
import JSZip from 'https://esm.sh/jszip@3.10.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOG_PREFIX = '[proposal-parse-document]'

// =============================================================================
// Types
// =============================================================================

interface StyleAnalysis {
  avg_sentence_length: number
  vocabulary_formality: 'casual' | 'professional' | 'technical' | 'academic'
  tone_formality: 'formal' | 'semi-formal' | 'casual'
  tone_directness: 'direct' | 'diplomatic'
  tone_warmth: 'warm' | 'neutral' | 'cool'
  common_transition_phrases: string[]
  style_summary: string
}

interface TemplateExtraction {
  sections: Array<{
    id: string
    type: string
    title: string
    content_hint: string
    order: number
  }>
  brand_config: {
    primary_color: string | null
    secondary_color: string | null
    font_family: string | null
    style_analysis: StyleAnalysis | null
  }
  metadata: {
    page_count: number | null
    word_count: number
    detected_type: string
    file_type: 'docx' | 'pdf'
  }
}

interface ParseRequest {
  asset_id: string
}

// =============================================================================
// DOCX Theme/Style Extraction via JSZip
// =============================================================================

async function extractDocxStyles(arrayBuffer: ArrayBuffer): Promise<{
  colors: string[]
  fontFamily: string | null
}> {
  const colors: string[] = []
  let fontFamily: string | null = null

  try {
    const zip = await JSZip.loadAsync(arrayBuffer)

    const themeFile = zip.file('word/theme/theme1.xml')
    if (themeFile) {
      const themeXml = await themeFile.async('text')
      const accentMatches = themeXml.matchAll(/<a:accent\d[^>]*>[\s\S]*?<a:srgbClr val="([0-9a-fA-F]{6})"/g)
      for (const match of accentMatches) colors.push(`#${match[1]}`)
      const dk1Match = themeXml.match(/<a:dk1[^>]*>[\s\S]*?<a:srgbClr val="([0-9a-fA-F]{6})"/)
      if (dk1Match) colors.unshift(`#${dk1Match[1]}`)
      const majorFontMatch = themeXml.match(/<a:majorFont[^>]*>[\s\S]*?<a:latin typeface="([^"]+)"/)
      if (majorFontMatch && majorFontMatch[1] !== '') fontFamily = majorFontMatch[1]
    }

    const stylesFile = zip.file('word/styles.xml')
    if (stylesFile) {
      const stylesXml = await stylesFile.async('text')
      const headingColorMatches = stylesXml.matchAll(/w:styleId="Heading\d"[\s\S]*?<w:color w:val="([0-9a-fA-F]{6})"/g)
      for (const match of headingColorMatches) {
        const color = `#${match[1]}`
        if (!colors.includes(color)) colors.push(color)
      }
      if (!fontFamily) {
        const defaultFontMatch = stylesXml.match(/<w:rFonts[^>]*w:ascii="([^"]+)"/)
        if (defaultFontMatch) fontFamily = defaultFontMatch[1]
      }
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} Error extracting DOCX styles:`, err)
  }

  return { colors, fontFamily }
}

// =============================================================================
// DOCX Text Extraction via mammoth
// =============================================================================

async function parseDocx(arrayBuffer: ArrayBuffer): Promise<{
  html: string
  text: string
  styles: { colors: string[]; fontFamily: string | null }
}> {
  const uint8 = new Uint8Array(arrayBuffer)
  const result = await mammoth.convertToHtml({ arrayBuffer: uint8.buffer })
  const html = result.value || ''
  const textResult = await mammoth.extractRawText({ arrayBuffer: uint8.buffer })
  const text = textResult.value || ''
  const styles = await extractDocxStyles(arrayBuffer)
  return { html, text, styles }
}

// =============================================================================
// PDF Text Extraction
// =============================================================================

async function parsePdf(arrayBuffer: ArrayBuffer): Promise<{
  text: string
  pageCount: number
}> {
  const bytes = new Uint8Array(arrayBuffer)
  const rawText = new TextDecoder('latin1').decode(bytes)
  const pageMatches = rawText.match(/\/Type\s*\/Page[^s]/g)
  const pageCount = pageMatches ? pageMatches.length : 1

  const textSegments: string[] = []
  const streamRegex = /BT\s([\s\S]*?)ET/g
  let match
  while ((match = streamRegex.exec(rawText)) !== null) {
    const segment = match[1]
    const tjMatches = segment.matchAll(/\(([^)]*)\)\s*Tj/g)
    for (const tj of tjMatches) textSegments.push(tj[1])
    const tjArrayMatches = segment.matchAll(/\[([^\]]*)\]\s*TJ/g)
    for (const tja of tjArrayMatches) {
      const innerTexts = tja[1].matchAll(/\(([^)]*)\)/g)
      for (const it of innerTexts) textSegments.push(it[1])
    }
  }

  let text = textSegments.join(' ')

  if (text.trim().length < 50) {
    const readableChunks: string[] = []
    const readable = rawText.match(/[\x20-\x7E]{10,}/g)
    if (readable) {
      for (const chunk of readable) {
        if (!chunk.match(/^[\/\[\]\(\)<>{}%]/) && !chunk.match(/^\d+\s+\d+\s+obj/)) readableChunks.push(chunk)
      }
    }
    text = readableChunks.join('\n')
  }

  return { text, pageCount }
}

// =============================================================================
// AI Style Analysis via OpenRouter (STY-002)
// =============================================================================

async function analyzeWritingStyle(content: string, apiKey: string): Promise<StyleAnalysis | null> {
  const sample = content.length > 4000 ? content.substring(0, 4000) + '\n\n[... truncated ...]' : content

  const prompt = `Analyze the writing style of the following proposal document excerpt and return ONLY valid JSON.

Return this exact JSON schema (no markdown fencing, no extra keys):
{
  "avg_sentence_length": <number — average words per sentence, integer>,
  "vocabulary_formality": "<casual|professional|technical|academic>",
  "tone_formality": "<formal|semi-formal|casual>",
  "tone_directness": "<direct|diplomatic>",
  "tone_warmth": "<warm|neutral|cool>",
  "common_transition_phrases": [<up to 6 short phrases found in the text>],
  "style_summary": "<1–2 sentence plain-English description of the writing style>"
}

Document excerpt:
---
${sample}
---`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.use60.com',
        'X-Title': 'use60 Proposal Style Analysis',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku-20240307',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.warn(`${LOG_PREFIX} Style analysis API error ${response.status}:`, errText)
      return null
    }

    const data = await response.json()
    const aiContent: string = data.choices?.[0]?.message?.content || ''
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
    if (!jsonMatch) { console.warn(`${LOG_PREFIX} Style analysis: no JSON in AI response`); return null }

    const parsed = JSON.parse(jsonMatch[0]) as StyleAnalysis
    const validVocab = ['casual', 'professional', 'technical', 'academic']
    const validFormality = ['formal', 'semi-formal', 'casual']
    const validDirectness = ['direct', 'diplomatic']
    const validWarmth = ['warm', 'neutral', 'cool']

    if (
      typeof parsed.avg_sentence_length !== 'number' ||
      !validVocab.includes(parsed.vocabulary_formality) ||
      !validFormality.includes(parsed.tone_formality) ||
      !validDirectness.includes(parsed.tone_directness) ||
      !validWarmth.includes(parsed.tone_warmth)
    ) {
      console.warn(`${LOG_PREFIX} Style analysis: invalid field values in AI response`)
      return null
    }

    if (!Array.isArray(parsed.common_transition_phrases)) parsed.common_transition_phrases = []
    return parsed
  } catch (err) {
    console.warn(`${LOG_PREFIX} Style analysis failed (non-fatal):`, err)
    return null
  }
}

// =============================================================================
// AI Section Analysis via OpenRouter
// =============================================================================

async function analyzeDocumentStructure(
  content: string,
  fileType: 'docx' | 'pdf',
  brandHints: { colors: string[]; fontFamily: string | null },
  apiKey: string,
  styleAnalysis: StyleAnalysis | null = null
): Promise<TemplateExtraction> {
  const truncated = content.length > 12000 ? content.substring(0, 12000) + '\n\n[... content truncated ...]' : content

  const prompt = `You are analyzing an example proposal document to extract its structure as a reusable template.

The document was a ${fileType.toUpperCase()} file.
${brandHints.colors.length > 0 ? `Brand colors detected from the document theme: ${brandHints.colors.join(', ')}` : ''}
${brandHints.fontFamily ? `Font detected: ${brandHints.fontFamily}` : ''}

Analyze the following document content and identify its sections. For each section, determine:
1. A suitable section TYPE from this list: cover, executive_summary, problem, solution, approach, scope, timeline, pricing, terms, team, case_study, custom
2. The section TITLE as it appears (or a reasonable title if none is explicit)
3. A brief CONTENT_HINT (1-2 sentences describing what this section contains, to guide future AI generation)

Also determine:
- The overall document type (e.g. "consulting proposal", "training proposal", "SaaS proposal", "project proposal", etc.)
- Primary brand color (hex) if detectable from content or provided hints
- Secondary brand color (hex) if detectable

IMPORTANT: Return ONLY valid JSON, no markdown fencing. Use this exact schema:
{
  "sections": [
    {"type": "cover", "title": "Cover Page", "content_hint": "Company logo and proposal title", "order": 1},
    ...more sections
  ],
  "primary_color": "#hex or null",
  "secondary_color": "#hex or null",
  "detected_type": "consulting proposal"
}

Document content:
---
${truncated}
---`

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://app.use60.com',
      'X-Title': 'use60 Proposal Template Extraction',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3-haiku-20240307',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`)
  }

  const data = await response.json()
  const aiContent = data.choices?.[0]?.message?.content || ''

  let parsed: {
    sections: Array<{ type: string; title: string; content_hint: string; order: number }>
    primary_color: string | null
    secondary_color: string | null
    detected_type: string
  }

  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in AI response')
    parsed = JSON.parse(jsonMatch[0])
  } catch (parseErr) {
    console.error(`${LOG_PREFIX} Failed to parse AI response:`, aiContent)
    parsed = {
      sections: [
        { type: 'cover', title: 'Cover Page', content_hint: 'Proposal title and branding', order: 1 },
        { type: 'executive_summary', title: 'Executive Summary', content_hint: 'Overview of the proposal', order: 2 },
        { type: 'scope', title: 'Scope of Work', content_hint: 'Detailed scope description', order: 3 },
        { type: 'timeline', title: 'Timeline', content_hint: 'Project timeline and milestones', order: 4 },
        { type: 'pricing', title: 'Investment', content_hint: 'Pricing and payment terms', order: 5 },
        { type: 'terms', title: 'Terms & Conditions', content_hint: 'Legal and contractual terms', order: 6 },
      ],
      primary_color: brandHints.colors[0] || null,
      secondary_color: brandHints.colors[1] || null,
      detected_type: 'proposal',
    }
  }

  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length

  return {
    sections: parsed.sections.map((s, i) => ({
      id: `section-${i + 1}`,
      type: s.type,
      title: s.title,
      content_hint: s.content_hint,
      order: s.order || i + 1,
    })),
    brand_config: {
      primary_color: parsed.primary_color || brandHints.colors[0] || null,
      secondary_color: parsed.secondary_color || brandHints.colors[1] || null,
      font_family: brandHints.fontFamily,
      style_analysis: styleAnalysis,
    },
    metadata: {
      page_count: null,
      word_count: wordCount,
      detected_type: parsed.detected_type || 'proposal',
      file_type: fileType,
    },
  }
}

// =============================================================================
// Handler
// =============================================================================

export async function handleParseDocument(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: ParseRequest = await req.json()
    if (!body.asset_id) {
      throw new Error('asset_id is required')
    }

    console.log(`${LOG_PREFIX} Parsing document for asset: ${body.asset_id}`)

    const { data: asset, error: assetError } = await supabase
      .from('proposal_assets')
      .select('id, storage_path, file_name, mime_type, asset_type')
      .eq('id', body.asset_id)
      .maybeSingle()

    if (assetError || !asset) throw new Error(`Asset not found: ${body.asset_id}`)
    if (asset.asset_type !== 'document') throw new Error(`Asset is not a document (type: ${asset.asset_type})`)

    console.log(`${LOG_PREFIX} Downloading file from: ${asset.storage_path}`)
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('proposal-assets')
      .download(asset.storage_path)

    if (downloadError || !fileData) throw new Error(`Failed to download file: ${downloadError?.message || 'unknown error'}`)

    const arrayBuffer = await fileData.arrayBuffer()
    console.log(`${LOG_PREFIX} File downloaded, size: ${arrayBuffer.byteLength} bytes`)

    const isDocx = asset.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || asset.file_name?.toLowerCase().endsWith('.docx')
    const isPdf = asset.mime_type === 'application/pdf'
      || asset.file_name?.toLowerCase().endsWith('.pdf')

    let textContent: string
    let brandHints: { colors: string[]; fontFamily: string | null } = { colors: [], fontFamily: null }
    let pageCount: number | null = null
    let fileType: 'docx' | 'pdf'

    if (isDocx) {
      fileType = 'docx'
      console.log(`${LOG_PREFIX} Parsing DOCX...`)
      const result = await parseDocx(arrayBuffer)
      textContent = result.html || result.text
      brandHints = result.styles
      console.log(`${LOG_PREFIX} DOCX parsed: ${result.text.length} chars, ${brandHints.colors.length} colors found`)
    } else if (isPdf) {
      fileType = 'pdf'
      console.log(`${LOG_PREFIX} Parsing PDF...`)
      const result = await parsePdf(arrayBuffer)
      textContent = result.text
      pageCount = result.pageCount
      console.log(`${LOG_PREFIX} PDF parsed: ${result.text.length} chars, ${pageCount} pages`)
    } else {
      throw new Error(`Unsupported file type: ${asset.mime_type || asset.file_name}`)
    }

    if (textContent.trim().length < 20) {
      throw new Error('Could not extract meaningful text from the document. The file may be image-based or encrypted.')
    }

    console.log(`${LOG_PREFIX} Analyzing document structure and writing style in parallel...`)
    const [extraction, styleAnalysis] = await Promise.all([
      analyzeDocumentStructure(textContent, fileType, brandHints, openRouterApiKey),
      analyzeWritingStyle(textContent, openRouterApiKey),
    ])

    extraction.brand_config.style_analysis = styleAnalysis

    if (pageCount !== null) extraction.metadata.page_count = pageCount

    console.log(
      `${LOG_PREFIX} Extraction complete: ${extraction.sections.length} sections, type: ${extraction.metadata.detected_type}, style_analysis: ${styleAnalysis ? 'present' : 'unavailable'}`,
    )

    return new Response(JSON.stringify(extraction), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
}
