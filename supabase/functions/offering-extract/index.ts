import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import mammoth from 'https://esm.sh/mammoth@1.6.0'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { logAICostEvent, checkCreditBalance } from '../_shared/costTracking.ts'

const LOG_PREFIX = '[offering-extract]'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

// =============================================================================
// Types
// =============================================================================

interface ExtractRequest {
  asset_id: string
  org_id: string
}

interface OfferingExtraction {
  products: Array<{
    name: string
    description: string
    key_features: string[]
    target_audience: string
  }>
  services: Array<{
    name: string
    description: string
    deliverables: string[]
    typical_duration: string
  }>
  case_studies: Array<{
    client_name: string
    industry: string
    challenge: string
    solution: string
    outcome: string
    metrics: string[]
  }>
  pricing_models: Array<{
    model_type: string
    description: string
    typical_range: string
  }>
  differentiators: string[]
}

// =============================================================================
// DOCX Text Extraction via mammoth
// =============================================================================

async function parseDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const uint8 = new Uint8Array(arrayBuffer)
  const result = await mammoth.extractRawText({ arrayBuffer: uint8.buffer })
  return result.value || ''
}

// =============================================================================
// PDF Text Extraction (binary approach for Deno)
// =============================================================================

function parsePdf(arrayBuffer: ArrayBuffer): { text: string; pageCount: number } {
  const bytes = new Uint8Array(arrayBuffer)
  const rawText = new TextDecoder('latin1').decode(bytes)

  // Count pages via /Type /Page entries
  const pageMatches = rawText.match(/\/Type\s*\/Page[^s]/g)
  const pageCount = pageMatches ? pageMatches.length : 1

  // Extract text from PDF streams (between BT and ET markers)
  const textSegments: string[] = []
  const streamRegex = /BT\s([\s\S]*?)ET/g
  let match
  while ((match = streamRegex.exec(rawText)) !== null) {
    const segment = match[1]
    // Extract text from Tj operators
    const tjMatches = segment.matchAll(/\(([^)]*)\)\s*Tj/g)
    for (const tj of tjMatches) {
      textSegments.push(tj[1])
    }
    // TJ array operator
    const tjArrayMatches = segment.matchAll(/\[([^\]]*)\]\s*TJ/g)
    for (const tja of tjArrayMatches) {
      const innerTexts = tja[1].matchAll(/\(([^)]*)\)/g)
      for (const it of innerTexts) {
        textSegments.push(it[1])
      }
    }
  }

  let text = textSegments.join(' ')

  // Fallback: extract any readable ASCII sequences
  if (text.trim().length < 50) {
    const readableChunks: string[] = []
    const readable = rawText.match(/[\x20-\x7E]{10,}/g)
    if (readable) {
      for (const chunk of readable) {
        if (!chunk.match(/^[\/\[\]\(\)<>{}%]/) && !chunk.match(/^\d+\s+\d+\s+obj/)) {
          readableChunks.push(chunk)
        }
      }
    }
    text = readableChunks.join('\n')
  }

  return { text, pageCount }
}

// =============================================================================
// PPTX Text Extraction (ZIP-based, slide XML parsing)
// =============================================================================

async function parsePptx(arrayBuffer: ArrayBuffer): Promise<string> {
  // Dynamically import JSZip for PPTX parsing
  const { default: JSZip } = await import('https://esm.sh/jszip@3.10.1')

  const zip = await JSZip.loadAsync(arrayBuffer)
  const textSegments: string[] = []

  // PPTX slides are stored at ppt/slides/slide*.xml
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort()

  for (const slidePath of slideFiles) {
    const slideFile = zip.file(slidePath)
    if (!slideFile) continue
    const xml = await slideFile.async('text')

    // Extract text from <a:t> elements (DrawingML text runs)
    const textMatches = xml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)
    for (const match of textMatches) {
      const decoded = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
      textSegments.push(decoded)
    }
  }

  return textSegments.join(' ')
}

// =============================================================================
// AI Offering Extraction via Anthropic Claude Haiku
// =============================================================================

async function extractOfferingData(
  textContent: string,
  anthropicApiKey: string
): Promise<{ extraction: OfferingExtraction; inputTokens: number; outputTokens: number }> {
  // Truncate to keep cost manageable — 12k chars is ample for Haiku
  const truncated =
    textContent.length > 12000
      ? textContent.substring(0, 12000) + '\n\n[... content truncated ...]'
      : textContent

  const prompt = `You are an expert at analyzing sales collateral. Extract structured offering data from this document.

Return a JSON object with these keys:
- products: Array of {name, description, key_features: string[], target_audience}
- services: Array of {name, description, deliverables: string[], typical_duration}
- case_studies: Array of {client_name, industry, challenge, solution, outcome, metrics: string[]}
- pricing_models: Array of {model_type, description, typical_range} (e.g., "subscription", "project-based")
- differentiators: Array of strings — what makes this offering unique

If a category has no data in the document, return an empty array for it.
Be specific and detailed in extractions. Use the exact language from the document.

Return ONLY valid JSON, no markdown fencing, no extra keys.

Document content:
---
${truncated}
---`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const aiContent: string = data.content?.[0]?.text || ''
  const inputTokens: number = data.usage?.input_tokens || 0
  const outputTokens: number = data.usage?.output_tokens || 0

  // Extract JSON from response — handle accidental markdown fencing
  const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('AI extraction returned no valid JSON. Please try again.')
  }

  let parsed: OfferingExtraction
  try {
    parsed = JSON.parse(jsonMatch[0]) as OfferingExtraction
  } catch (parseErr) {
    throw new Error(`Failed to parse AI extraction response: ${parseErr}`)
  }

  // Ensure all expected arrays are present and are arrays
  const extraction: OfferingExtraction = {
    products: Array.isArray(parsed.products) ? parsed.products : [],
    services: Array.isArray(parsed.services) ? parsed.services : [],
    case_studies: Array.isArray(parsed.case_studies) ? parsed.case_studies : [],
    pricing_models: Array.isArray(parsed.pricing_models) ? parsed.pricing_models : [],
    differentiators: Array.isArray(parsed.differentiators) ? parsed.differentiators : [],
  }

  return { extraction, inputTokens, outputTokens }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  const corsHeaders = getCorsHeaders(req)

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (!anthropicApiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create user-scoped client (respects RLS)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Validate user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const body: ExtractRequest = await req.json()
    if (!body.asset_id) {
      return new Response(JSON.stringify({ error: 'asset_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!body.org_id) {
      return new Response(JSON.stringify({ error: 'org_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { asset_id, org_id } = body

    // Budget / credit check before AI call
    const creditCheck = await checkCreditBalance(supabase, org_id)
    if (!creditCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient credits. Please top up to continue.',
          balance: creditCheck.balance,
          message: creditCheck.message,
        }),
        {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log(`${LOG_PREFIX} Extracting offering data for asset: ${asset_id}, org: ${org_id}`)

    // Step 1: Load asset record
    const { data: asset, error: assetError } = await supabase
      .from('proposal_assets')
      .select('id, storage_path, file_name, mime_type, asset_type')
      .eq('id', asset_id)
      .maybeSingle()

    if (assetError || !asset) {
      return new Response(
        JSON.stringify({ error: `Asset not found: ${asset_id}` }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Step 2: Download file from Supabase Storage
    console.log(`${LOG_PREFIX} Downloading file: ${asset.storage_path}`)
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('proposal-assets')
      .download(asset.storage_path)

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({
          error: `Failed to download file: ${downloadError?.message || 'unknown error'}`,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const arrayBuffer = await fileData.arrayBuffer()
    console.log(`${LOG_PREFIX} File downloaded, size: ${arrayBuffer.byteLength} bytes`)

    // Step 3: Detect file type and extract text
    const fileName = asset.file_name?.toLowerCase() || ''
    const mimeType = asset.mime_type || ''

    const isDocx =
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    const isPdf = mimeType === 'application/pdf' || fileName.endsWith('.pdf')
    const isPptx =
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      fileName.endsWith('.pptx')

    let textContent: string

    if (isDocx) {
      console.log(`${LOG_PREFIX} Parsing DOCX...`)
      textContent = await parseDocx(arrayBuffer)
      console.log(`${LOG_PREFIX} DOCX parsed: ${textContent.length} chars`)
    } else if (isPdf) {
      console.log(`${LOG_PREFIX} Parsing PDF...`)
      const result = parsePdf(arrayBuffer)
      textContent = result.text
      console.log(`${LOG_PREFIX} PDF parsed: ${textContent.length} chars, ${result.pageCount} pages`)
    } else if (isPptx) {
      console.log(`${LOG_PREFIX} Parsing PPTX...`)
      textContent = await parsePptx(arrayBuffer)
      console.log(`${LOG_PREFIX} PPTX parsed: ${textContent.length} chars`)
    } else {
      return new Response(
        JSON.stringify({
          error: `Unsupported file type: ${mimeType || fileName}. Supported formats: PDF, DOCX, PPTX`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (textContent.trim().length < 20) {
      return new Response(
        JSON.stringify({
          error:
            'Could not extract meaningful text from the document. The file may be image-based or encrypted.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Step 4: AI extraction via Claude Haiku
    console.log(`${LOG_PREFIX} Sending to Claude Haiku for structured extraction...`)
    let extraction: OfferingExtraction
    let inputTokens: number
    let outputTokens: number

    try {
      const result = await extractOfferingData(textContent, anthropicApiKey)
      extraction = result.extraction
      inputTokens = result.inputTokens
      outputTokens = result.outputTokens
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : 'AI extraction failed'
      console.error(`${LOG_PREFIX} AI extraction error:`, aiError)
      return new Response(
        JSON.stringify({
          error: message,
          suggestion: 'Please try again. If the problem persists, check that the document contains readable text.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log(
      `${LOG_PREFIX} Extraction complete: ${extraction.products.length} products, ${extraction.services.length} services, ${extraction.case_studies.length} case studies, ${extraction.pricing_models.length} pricing models, ${extraction.differentiators.length} differentiators`
    )

    // Step 5: Save to org_offering_profiles (upsert by org_id + source_document_id)
    // Derive a profile name from the file name (strip extension)
    const baseName = asset.file_name
      ? asset.file_name.replace(/\.[^/.]+$/, '')
      : 'Offering Profile'

    // Check if a profile already exists for this source document in this org
    const { data: existingProfile } = await supabase
      .from('org_offering_profiles')
      .select('id')
      .eq('org_id', org_id)
      .eq('source_document_id', asset_id)
      .maybeSingle()

    let profileId: string

    if (existingProfile) {
      // Update existing profile
      const { data: updated, error: updateError } = await supabase
        .from('org_offering_profiles')
        .update({
          products_json: extraction.products,
          services_json: extraction.services,
          case_studies_json: extraction.case_studies,
          pricing_models_json: extraction.pricing_models,
          differentiators_json: extraction.differentiators,
          is_active: true,
        })
        .eq('id', existingProfile.id)
        .select('id')
        .single()

      if (updateError || !updated) {
        console.error(`${LOG_PREFIX} Failed to update profile:`, updateError)
        return new Response(
          JSON.stringify({ error: `Failed to update offering profile: ${updateError?.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      profileId = updated.id
      console.log(`${LOG_PREFIX} Updated existing profile: ${profileId}`)
    } else {
      // Insert new profile
      const { data: inserted, error: insertError } = await supabase
        .from('org_offering_profiles')
        .insert({
          org_id,
          name: baseName,
          created_by: user.id,
          source_document_id: asset_id,
          products_json: extraction.products,
          services_json: extraction.services,
          case_studies_json: extraction.case_studies,
          pricing_models_json: extraction.pricing_models,
          differentiators_json: extraction.differentiators,
          is_active: true,
        })
        .select('id')
        .single()

      if (insertError || !inserted) {
        console.error(`${LOG_PREFIX} Failed to insert profile:`, insertError)
        return new Response(
          JSON.stringify({ error: `Failed to create offering profile: ${insertError?.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      profileId = inserted.id
      console.log(`${LOG_PREFIX} Created new profile: ${profileId}`)
    }

    // Step 6: Update asset status to 'analyzed' (best-effort — column may not exist yet)
    try {
      await supabase
        .from('proposal_assets')
        .update({ status: 'analyzed' })
        .eq('id', asset_id)
    } catch (statusErr) {
      // Non-fatal — status column may not be present on older schema
      console.warn(`${LOG_PREFIX} Could not update asset status (non-fatal):`, statusErr)
    }

    // Step 7: Log credit cost (fire-and-forget, non-blocking)
    logAICostEvent(
      supabase,
      user.id,
      org_id,
      'anthropic',
      HAIKU_MODEL,
      inputTokens,
      outputTokens,
      'offering_extraction',
      {
        asset_id,
        profile_id: profileId,
        products_count: extraction.products.length,
        services_count: extraction.services.length,
        case_studies_count: extraction.case_studies.length,
        pricing_models_count: extraction.pricing_models.length,
        differentiators_count: extraction.differentiators.length,
      },
      { source: 'user_initiated' }
    ).catch((err) => {
      console.warn(`${LOG_PREFIX} logAICostEvent failed (non-fatal):`, err)
    })

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        profile_id: profileId,
        extracted: {
          products_count: extraction.products.length,
          services_count: extraction.services.length,
          case_studies_count: extraction.case_studies.length,
          pricing_models_count: extraction.pricing_models.length,
          differentiators_count: extraction.differentiators.length,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error(`${LOG_PREFIX} Unhandled error:`, error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  }
})
