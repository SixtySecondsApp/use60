// supabase/functions/proposal-render-gotenberg/index.ts
// GOT-005 + GOT-006: Stage 3+4+5 of the V2 proposal pipeline — Render + Upload + Thumbnail
//
// Responsibilities:
//   1. Load proposal row (content_json, template_id, deal_id, contact_id, user_id)
//   2. Load or fall back to a default HTML template and brand config
//   3. Resolve metadata (client name, company, prepared_by, reference number)
//   4. Call generateProposalHTML() to merge sections into a self-contained HTML document
//   5. POST multipart/form-data to Gotenberg → receive raw PDF bytes
//   6. Upload PDF to Supabase Storage (bucket: proposal-assets)
//   7. Generate PNG thumbnail of first page via Gotenberg screenshot endpoint (non-fatal)
//   8. Upload thumbnail to proposal-assets/{org_id}/thumbnails/{proposal_id}.png
//   9. Update proposals row: pdf_url, pdf_s3_key, generation_status, brand_config (+ thumbnail_url)
//  10. Return pdf_url, thumbnail_url and storage info

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'
import {
  generateProposalHTML,
  type ProposalSection,
  type TemplateContext,
} from '../_shared/templateEngine.ts'

// =============================================================================
// Constants
// =============================================================================

const LOG_PREFIX = '[proposal-render-gotenberg]'

// Default brand config used when no template or org override is present
const DEFAULT_BRAND_CONFIG: TemplateContext['brandConfig'] = {
  primary_color: '#1e3a5f',
  secondary_color: '#4a90d9',
  font_family: 'Inter, Helvetica, Arial, sans-serif',
  logo_url: null,
  header_style: 'default',
}

// =============================================================================
// Types
// =============================================================================

interface RenderRequest {
  proposal_id: string
  /** Optional override — if null, reads from proposals.content_json */
  content_json?: ProposalSection[] | null
  /** Optional override — if null, uses org's default template */
  template_id?: string | null
}

interface ProposalRow {
  id: string
  org_id: string
  user_id: string
  deal_id: string | null
  contact_id: string | null
  title: string | null
  content_json: ProposalSection[] | null
  template_id: string | null
  brand_config: Record<string, unknown> | null
  generation_status: string | null
}

interface TemplateRow {
  id: string
  html_template: string | null
  css_styles: string | null
  brand_config: Record<string, unknown> | null
  section_schema: unknown | null
}

interface DealRow {
  id: string
  company: string | null
  name: string | null
}

interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  email: string | null
}

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
}

interface OrgRow {
  id: string
  name: string | null
  brand_config: Record<string, unknown> | null
  default_template_id: string | null
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format a Date as "2 March 2026"
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Build a short reference number from a UUID.
 * Takes the first 8 characters of the UUID (before the first dash).
 */
function buildReferenceNumber(proposalId: string): string {
  const short = proposalId.replace(/-/g, '').slice(0, 8).toUpperCase()
  return `PROP-${short}`
}

/**
 * Merge brand config objects. Priority: org overrides → template defaults → system defaults.
 * Only non-null/non-undefined values from higher-priority sources win.
 */
function mergeBrandConfig(
  templateBrand: Record<string, unknown> | null,
  orgBrand: Record<string, unknown> | null,
): TemplateContext['brandConfig'] {
  const base: TemplateContext['brandConfig'] = { ...DEFAULT_BRAND_CONFIG }

  // Apply template brand first
  if (templateBrand) {
    if (typeof templateBrand.primary_color === 'string') base.primary_color = templateBrand.primary_color
    if (typeof templateBrand.secondary_color === 'string') base.secondary_color = templateBrand.secondary_color
    if (typeof templateBrand.font_family === 'string') base.font_family = templateBrand.font_family
    if (typeof templateBrand.logo_url === 'string') base.logo_url = templateBrand.logo_url
    if (typeof templateBrand.header_style === 'string') base.header_style = templateBrand.header_style
  }

  // Org overrides win over template brand
  if (orgBrand) {
    if (typeof orgBrand.primary_color === 'string') base.primary_color = orgBrand.primary_color
    if (typeof orgBrand.secondary_color === 'string') base.secondary_color = orgBrand.secondary_color
    if (typeof orgBrand.font_family === 'string') base.font_family = orgBrand.font_family
    if (typeof orgBrand.logo_url === 'string') base.logo_url = orgBrand.logo_url
    if (typeof orgBrand.header_style === 'string') base.header_style = orgBrand.header_style
  }

  return base
}

/**
 * Send the merged HTML to Gotenberg and receive raw PDF bytes.
 * Uses multipart/form-data as required by the Gotenberg Chromium HTML endpoint.
 */
async function renderWithGotenberg(html: string, gotenbergUrl: string): Promise<Uint8Array> {
  const formData = new FormData()

  // Gotenberg requires the HTML file to be named exactly "index.html"
  const htmlBlob = new Blob([html], { type: 'text/html; charset=utf-8' })
  formData.append('files', htmlBlob, 'index.html')

  // A4 paper dimensions (inches)
  formData.append('paperWidth', '8.27')
  formData.append('paperHeight', '11.69')

  // Margins (inches) — matches README spec
  formData.append('marginTop', '0.59')
  formData.append('marginBottom', '0.79')
  formData.append('marginLeft', '0.79')
  formData.append('marginRight', '0.79')

  // Required for brand colors and background fills
  formData.append('printBackground', 'true')

  // Allow 500ms for web fonts to load
  formData.append('waitDelay', '500ms')

  const gotenbergEndpoint = `${gotenbergUrl}/forms/chromium/convert/html`

  console.log(`${LOG_PREFIX} Sending HTML to Gotenberg: ${gotenbergEndpoint}`)

  let gotenbergResponse: Response
  try {
    gotenbergResponse = await fetch(gotenbergEndpoint, {
      method: 'POST',
      body: formData,
    })
  } catch (fetchErr) {
    const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    throw new Error(`Gotenberg unreachable: ${message}`)
  }

  if (!gotenbergResponse.ok) {
    const errorText = await gotenbergResponse.text().catch(() => '(no body)')
    throw new Error(
      `Gotenberg returned ${gotenbergResponse.status}: ${errorText}`,
    )
  }

  const pdfBuffer = await gotenbergResponse.arrayBuffer()

  if (pdfBuffer.byteLength === 0) {
    throw new Error('Gotenberg returned an empty PDF')
  }

  console.log(`${LOG_PREFIX} PDF received from Gotenberg: ${pdfBuffer.byteLength} bytes`)

  return new Uint8Array(pdfBuffer)
}

/**
 * GOT-006: Capture the first page of the proposal as a PNG thumbnail.
 * Uses Gotenberg's Chromium screenshot endpoint with A4 dimensions at 96 dpi.
 *
 * This function is intentionally non-fatal — callers must catch errors and
 * treat a failure as a warning, not a hard stop.
 */
async function generateThumbnail(html: string, gotenbergUrl: string): Promise<Uint8Array> {
  const formData = new FormData()

  // Gotenberg requires the HTML file to be named exactly "index.html"
  const htmlBlob = new Blob([html], { type: 'text/html; charset=utf-8' })
  formData.append('files', htmlBlob, 'index.html')

  // PNG output
  formData.append('format', 'png')

  // A4 at 96 dpi: 794 × 1123 px
  formData.append('width', '794')
  formData.append('height', '1123')

  // JPEG quality is not applicable for PNG, but quality param is sent to
  // keep parity with spec — Gotenberg ignores it for PNG output.
  formData.append('quality', '80')

  // Clip to the first page only (only capture above-the-fold content)
  formData.append('clip', 'true')

  // Required for brand colors and background fills
  formData.append('printBackground', 'true')

  // Allow 500ms for web fonts to load (same as PDF render)
  formData.append('waitDelay', '500ms')

  const screenshotEndpoint = `${gotenbergUrl}/forms/chromium/screenshot/html`

  console.log(`${LOG_PREFIX} Requesting thumbnail from Gotenberg: ${screenshotEndpoint}`)

  let response: Response
  try {
    response = await fetch(screenshotEndpoint, {
      method: 'POST',
      body: formData,
    })
  } catch (fetchErr) {
    const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    throw new Error(`Gotenberg screenshot unreachable: ${message}`)
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(no body)')
    throw new Error(
      `Gotenberg screenshot returned ${response.status}: ${errorText}`,
    )
  }

  const pngBuffer = await response.arrayBuffer()

  if (pngBuffer.byteLength === 0) {
    throw new Error('Gotenberg screenshot returned empty PNG')
  }

  console.log(`${LOG_PREFIX} Thumbnail PNG received from Gotenberg: ${pngBuffer.byteLength} bytes`)

  return new Uint8Array(pngBuffer)
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req: Request) => {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    // --------------------------
    // Parse request
    // --------------------------
    const body: RenderRequest = await req.json()

    if (!body.proposal_id) {
      return errorResponse('proposal_id is required', req, 400)
    }

    const gotenbergUrl = Deno.env.get('GOTENBERG_URL')
    if (!gotenbergUrl) {
      return errorResponse('GOTENBERG_URL env var is not configured', req, 500)
    }

    // --------------------------
    // Build service-role client
    // (internal pipeline call — no user JWT required)
    // --------------------------
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`${LOG_PREFIX} Rendering proposal ${body.proposal_id}`)

    // -------------------------------------------------------------------------
    // Step 1: Load proposal
    // -------------------------------------------------------------------------
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('id, org_id, user_id, deal_id, contact_id, title, content_json, template_id, brand_config, generation_status')
      .eq('id', body.proposal_id)
      .maybeSingle<ProposalRow>()

    if (proposalError || !proposal) {
      console.error(`${LOG_PREFIX} Proposal not found:`, proposalError?.message)
      return errorResponse('Proposal not found', req, 404)
    }

    // Determine the sections to use (request override takes priority)
    const sections: ProposalSection[] = body.content_json ?? proposal.content_json ?? []

    if (sections.length === 0) {
      return errorResponse('Proposal has no content sections to render', req, 400)
    }

    // -------------------------------------------------------------------------
    // Step 2: Load template + Step 3: Load brand config (parallel with metadata)
    // -------------------------------------------------------------------------
    const templateId = body.template_id ?? proposal.template_id

    const [templateResult, orgResult] = await Promise.all([
      // Load template (if we have a template_id)
      templateId
        ? supabase
            .from('proposal_templates')
            .select('id, html_template, css_styles, brand_config, section_schema')
            .eq('id', templateId)
            .maybeSingle<TemplateRow>()
        : Promise.resolve({ data: null, error: null }),

      // Load org for brand overrides + default template fallback
      supabase
        .from('organizations')
        .select('id, name, brand_config, default_template_id')
        .eq('id', proposal.org_id)
        .maybeSingle<OrgRow>(),
    ])

    const template = templateResult.data
    const org = orgResult.data

    // If no template was found by ID, try the org's default template
    let resolvedTemplate: TemplateRow | null = template
    if (!resolvedTemplate && org?.default_template_id && org.default_template_id !== templateId) {
      const { data: defaultTemplate } = await supabase
        .from('proposal_templates')
        .select('id, html_template, css_styles, brand_config, section_schema')
        .eq('id', org.default_template_id)
        .maybeSingle<TemplateRow>()
      resolvedTemplate = defaultTemplate
    }

    // Build merged brand config
    const brandConfig = mergeBrandConfig(
      resolvedTemplate?.brand_config ?? null,
      org?.brand_config ?? null,
    )

    // -------------------------------------------------------------------------
    // Step 4: Load metadata (deal + contact + user profile — parallel)
    // -------------------------------------------------------------------------
    const [dealResult, contactResult, profileResult] = await Promise.all([
      proposal.deal_id
        ? supabase
            .from('deals')
            .select('id, company, name')
            .eq('id', proposal.deal_id)
            .maybeSingle<DealRow>()
        : Promise.resolve({ data: null, error: null }),

      proposal.contact_id
        ? supabase
            .from('contacts')
            .select('id, first_name, last_name, company, email')
            .eq('id', proposal.contact_id)
            .maybeSingle<ContactRow>()
        : Promise.resolve({ data: null, error: null }),

      supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', proposal.user_id)
        .maybeSingle<ProfileRow>(),
    ])

    const deal = dealResult.data
    const contact = contactResult.data
    const profile = profileResult.data

    // Resolve metadata fields
    const clientName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Valued Client'
      : 'Valued Client'

    const clientCompany =
      deal?.company ||
      contact?.company ||
      org?.name ||
      'Client'

    const preparedBy =
      profile?.full_name ||
      profile?.email ||
      'Sales Team'

    const metadata: TemplateContext['metadata'] = {
      proposal_title: proposal.title || 'Proposal',
      client_name: clientName,
      client_company: clientCompany,
      prepared_by: preparedBy,
      prepared_date: formatDate(new Date()),
      reference_number: buildReferenceNumber(proposal.id),
    }

    // -------------------------------------------------------------------------
    // Step 5: Generate HTML
    // -------------------------------------------------------------------------
    const context: TemplateContext = {
      sections,
      brandConfig,
      metadata,
    }

    console.log(
      `${LOG_PREFIX} Generating HTML for proposal "${metadata.proposal_title}" ` +
      `(${sections.length} sections, ref: ${metadata.reference_number})`,
    )

    // Use custom template HTML if available, otherwise fall back to the default
    const htmlDocument = generateProposalHTML(
      context,
      resolvedTemplate?.html_template ?? undefined,
    )

    // -------------------------------------------------------------------------
    // Step 6: Send to Gotenberg → receive PDF bytes
    // -------------------------------------------------------------------------
    const pdfBytes = await renderWithGotenberg(htmlDocument, gotenbergUrl)

    // -------------------------------------------------------------------------
    // Step 7: Upload to Supabase Storage (bucket: proposal-assets)
    // -------------------------------------------------------------------------
    const storagePath = `${proposal.org_id}/proposals/${proposal.id}.pdf`

    console.log(`${LOG_PREFIX} Uploading PDF to storage: ${storagePath}`)

    const { error: uploadError } = await supabase.storage
      .from('proposal-assets')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true, // overwrite if a previous render exists
      })

    if (uploadError) {
      console.error(`${LOG_PREFIX} Storage upload failed:`, uploadError.message)
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    // Generate a signed URL valid for 7 days (604800 seconds)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('proposal-assets')
      .createSignedUrl(storagePath, 604800)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error(`${LOG_PREFIX} Failed to create signed URL:`, signedUrlError?.message)
      throw new Error(`Failed to create signed URL: ${signedUrlError?.message}`)
    }

    const pdfUrl = signedUrlData.signedUrl

    console.log(`${LOG_PREFIX} PDF uploaded. Signed URL generated.`)

    // -------------------------------------------------------------------------
    // Step 8 (GOT-006): Generate PNG thumbnail — non-fatal
    // -------------------------------------------------------------------------
    let thumbnailUrl: string | null = null

    try {
      const thumbnailBytes = await generateThumbnail(htmlDocument, gotenbergUrl)

      const thumbnailPath = `${proposal.org_id}/thumbnails/${proposal.id}.png`

      console.log(`${LOG_PREFIX} Uploading thumbnail to storage: ${thumbnailPath}`)

      const { error: thumbnailUploadError } = await supabase.storage
        .from('proposal-assets')
        .upload(thumbnailPath, thumbnailBytes, {
          contentType: 'image/png',
          upsert: true,
        })

      if (thumbnailUploadError) {
        throw new Error(`Thumbnail upload failed: ${thumbnailUploadError.message}`)
      }

      // Signed URL valid for 7 days — same window as the PDF
      const { data: thumbnailSignedUrlData, error: thumbnailSignedUrlError } =
        await supabase.storage
          .from('proposal-assets')
          .createSignedUrl(thumbnailPath, 604800)

      if (thumbnailSignedUrlError || !thumbnailSignedUrlData?.signedUrl) {
        throw new Error(
          `Failed to create thumbnail signed URL: ${thumbnailSignedUrlError?.message}`,
        )
      }

      thumbnailUrl = thumbnailSignedUrlData.signedUrl
      console.log(`${LOG_PREFIX} Thumbnail uploaded and signed URL generated.`)
    } catch (thumbnailErr) {
      // Thumbnail failure must never block the response — log and continue
      const msg = thumbnailErr instanceof Error ? thumbnailErr.message : String(thumbnailErr)
      console.warn(`${LOG_PREFIX} Thumbnail generation failed (non-fatal): ${msg}`)
    }

    // -------------------------------------------------------------------------
    // Step 9: Update proposals row
    // Merge thumbnail_url into brand_config so we never overwrite other fields.
    // -------------------------------------------------------------------------
    const updatedBrandConfig: Record<string, unknown> = {
      ...brandConfig,
      ...(thumbnailUrl !== null ? { thumbnail_url: thumbnailUrl } : {}),
    }

    const { error: updateError } = await supabase
      .from('proposals')
      .update({
        pdf_url: pdfUrl,
        pdf_s3_key: storagePath,
        generation_status: 'rendered',
        brand_config: updatedBrandConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)

    if (updateError) {
      console.error(`${LOG_PREFIX} Failed to update proposal row:`, updateError.message)
      // Non-fatal: the PDF was uploaded successfully; log but continue
    }

    // -------------------------------------------------------------------------
    // Step 10: Return result
    // -------------------------------------------------------------------------
    console.log(`${LOG_PREFIX} Render complete for proposal ${proposal.id}`)

    return jsonResponse(
      {
        success: true,
        proposal_id: proposal.id,
        pdf_url: pdfUrl,
        pdf_s3_key: storagePath,
        generation_status: 'rendered',
        pdf_size_bytes: pdfBytes.length,
        thumbnail_url: thumbnailUrl,
        metadata: {
          proposal_title: metadata.proposal_title,
          reference_number: metadata.reference_number,
          sections_count: sections.length,
        },
      },
      req,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Error:`, message)
    return errorResponse(message, req, 500)
  }
})
