// Handler extracted from proposal-render-gotenberg/index.ts
// GOT-005 + GOT-006: Stage 3+4+5 of the V2 proposal pipeline — Render + Upload + Thumbnail

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../../_shared/corsHelper.ts'
import {
  generateProposalHTML,
  type ProposalSection,
  type TemplateContext,
} from '../../_shared/templateEngine.ts'

// =============================================================================
// Constants
// =============================================================================

const LOG_PREFIX = '[proposal-render-gotenberg]'

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
  content_json?: ProposalSection[] | null
  template_id?: string | null
  line_y_offset_px?: number | null
}

interface ProposalRow {
  id: string
  org_id: string
  user_id: string
  deal_id: string | null
  contact_id: string | null
  title: string | null
  sections: ProposalSection[] | null
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

interface DealRow { id: string; company: string | null; name: string | null }
interface ContactRow { id: string; full_name: string | null; company: string | null; email: string | null }
interface ProfileRow { id: string; first_name: string | null; last_name: string | null; email: string | null }
interface OrgRow { id: string; name: string | null; brand_config: Record<string, unknown> | null; default_template_id: string | null }

// =============================================================================
// Helpers
// =============================================================================

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function buildReferenceNumber(proposalId: string): string {
  const short = proposalId.replace(/-/g, '').slice(0, 8).toUpperCase()
  return `PROP-${short}`
}

function mergeBrandConfig(
  templateBrand: Record<string, unknown> | null,
  orgBrand: Record<string, unknown> | null,
): TemplateContext['brandConfig'] {
  const base: TemplateContext['brandConfig'] = { ...DEFAULT_BRAND_CONFIG }
  if (templateBrand) {
    if (typeof templateBrand.primary_color === 'string') base.primary_color = templateBrand.primary_color
    if (typeof templateBrand.secondary_color === 'string') base.secondary_color = templateBrand.secondary_color
    if (typeof templateBrand.font_family === 'string') base.font_family = templateBrand.font_family
    if (typeof templateBrand.logo_url === 'string') base.logo_url = templateBrand.logo_url
    if (typeof templateBrand.header_style === 'string') base.header_style = templateBrand.header_style
  }
  if (orgBrand) {
    if (typeof orgBrand.primary_color === 'string') base.primary_color = orgBrand.primary_color
    if (typeof orgBrand.secondary_color === 'string') base.secondary_color = orgBrand.secondary_color
    if (typeof orgBrand.font_family === 'string') base.font_family = orgBrand.font_family
    if (typeof orgBrand.logo_url === 'string') base.logo_url = orgBrand.logo_url
    if (typeof orgBrand.header_style === 'string') base.header_style = orgBrand.header_style
  }
  return base
}

function companyNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const atIndex = email.indexOf('@')
  if (atIndex < 0) return null
  const domain = email.slice(atIndex + 1).toLowerCase()
  const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com', 'me.com', 'live.com', 'mail.com']
  if (freeProviders.includes(domain)) return null
  const parts = domain.split('.')
  const name = parts[0]
  return name.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function resolveWaitDelay(html: string): string {
  const hasRemoteImages = /<img\s[^>]*src=["']https?:\/\//i.test(html)
  const hasRemoteScripts = /<script\s[^>]*src=["']https?:\/\//i.test(html)
  if (!hasRemoteImages && !hasRemoteScripts) return '100ms'
  return '500ms'
}

function applySectionHeaderAlignmentOverrides(html: string, lineYOffsetPx: number = 0): string {
  const alignmentOverrideCss = `
<style id="proposal-section-alignment-fix">
  .section-header, .ss-section-header { align-items: center !important; padding-bottom: 0 !important; margin-bottom: 24px !important; position: relative !important; border-bottom: none !important; }
  .section-header::after, .ss-section-header::after { content: "" !important; position: absolute !important; left: 16px !important; right: 0 !important; bottom: -10px !important; height: 2px !important; background: #dbe5f3 !important; }
  .section-accent-bar, .ss-accent-bar { display: none !important; }
  .section-title, .ss-section-title { position: relative !important; padding-left: 16px !important; margin: 0 !important; line-height: 1.2 !important; padding-bottom: 0 !important; border-bottom: none !important; }
  .section-title::before, .ss-section-title::before { content: "" !important; position: absolute !important; left: 0 !important; top: 50% !important; transform: translateY(calc(-50% + ${lineYOffsetPx}px)) !important; width: 4px !important; height: 1em !important; min-height: 1em !important; border-radius: 2px !important; background: #1e3a5f !important; }
</style>`.trim()

  if (html.includes('</head>')) return html.replace('</head>', `${alignmentOverrideCss}\n</head>`)
  return `${alignmentOverrideCss}\n${html}`
}

async function fetchGotenberg(endpoint: string, body: FormData): Promise<Response> {
  const TIMEOUT_MS = 30_000
  const attempt = async (): Promise<Response> => {
    try {
      return await fetch(endpoint, { method: 'POST', headers: { Connection: 'keep-alive' }, body, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      throw new Error(`Gotenberg unreachable: ${message}`)
    }
  }
  let response = await attempt()
  if (response.status === 503) {
    console.warn(`${LOG_PREFIX} AUT-006: Gotenberg 503 — waiting 2s and retrying`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    response = await attempt()
  }
  return response
}

async function renderWithGotenberg(html: string, gotenbergUrl: string): Promise<Uint8Array> {
  const formData = new FormData()
  const htmlBlob = new Blob([html], { type: 'text/html; charset=utf-8' })
  formData.append('files', htmlBlob, 'index.html')
  formData.append('paperWidth', '8.27')
  formData.append('paperHeight', '11.69')
  formData.append('marginTop', '0.59')
  formData.append('marginBottom', '0.79')
  formData.append('marginLeft', '0.79')
  formData.append('marginRight', '0.79')
  formData.append('printBackground', 'true')
  const waitDelay = resolveWaitDelay(html)
  console.log(`${LOG_PREFIX} Gotenberg waitDelay: ${waitDelay}`)
  formData.append('waitDelay', waitDelay)
  const gotenbergEndpoint = `${gotenbergUrl}/forms/chromium/convert/html`
  console.log(`${LOG_PREFIX} Sending HTML to Gotenberg: ${gotenbergEndpoint}`)
  const gotenbergResponse = await fetchGotenberg(gotenbergEndpoint, formData)
  if (!gotenbergResponse.ok) {
    const errorText = await gotenbergResponse.text().catch(() => '(no body)')
    throw new Error(`Gotenberg returned ${gotenbergResponse.status}: ${errorText}`)
  }
  const pdfBuffer = await gotenbergResponse.arrayBuffer()
  if (pdfBuffer.byteLength === 0) throw new Error('Gotenberg returned an empty PDF')
  console.log(`${LOG_PREFIX} PDF received from Gotenberg: ${pdfBuffer.byteLength} bytes`)
  return new Uint8Array(pdfBuffer)
}

async function generateThumbnail(html: string, gotenbergUrl: string): Promise<Uint8Array> {
  const formData = new FormData()
  const htmlBlob = new Blob([html], { type: 'text/html; charset=utf-8' })
  formData.append('files', htmlBlob, 'index.html')
  formData.append('format', 'png')
  formData.append('width', '794')
  formData.append('height', '1123')
  formData.append('quality', '80')
  formData.append('clip', 'true')
  formData.append('printBackground', 'true')
  formData.append('waitDelay', resolveWaitDelay(html))
  const screenshotEndpoint = `${gotenbergUrl}/forms/chromium/screenshot/html`
  console.log(`${LOG_PREFIX} Requesting thumbnail from Gotenberg: ${screenshotEndpoint}`)
  let response: Response
  try { response = await fetchGotenberg(screenshotEndpoint, formData) }
  catch (fetchErr) { const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr); throw new Error(`Gotenberg screenshot unreachable: ${message}`) }
  if (!response.ok) { const errorText = await response.text().catch(() => '(no body)'); throw new Error(`Gotenberg screenshot returned ${response.status}: ${errorText}`) }
  const pngBuffer = await response.arrayBuffer()
  if (pngBuffer.byteLength === 0) throw new Error('Gotenberg screenshot returned empty PNG')
  console.log(`${LOG_PREFIX} Thumbnail PNG received from Gotenberg: ${pngBuffer.byteLength} bytes`)
  return new Uint8Array(pngBuffer)
}

// =============================================================================
// Handler
// =============================================================================

export async function handleRenderGotenberg(req: Request): Promise<Response> {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  if (req.method !== 'POST') return errorResponse('Method not allowed', req, 405)

  try {
    const renderStart = Date.now()
    const body: RenderRequest = await req.json()
    if (!body.proposal_id) return errorResponse('proposal_id is required', req, 400)

    const gotenbergUrl = Deno.env.get('GOTENBERG_URL')
    if (!gotenbergUrl) return errorResponse('GOTENBERG_URL env var is not configured', req, 500)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`${LOG_PREFIX} Rendering proposal ${body.proposal_id}`)

    // Step 1: Load proposal
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('id, org_id, user_id, deal_id, contact_id, title, sections, template_id, brand_config, generation_status, context_payload')
      .eq('id', body.proposal_id)
      .maybeSingle<ProposalRow & { context_payload: Record<string, unknown> | null }>()

    if (proposalError || !proposal) { console.error(`${LOG_PREFIX} Proposal not found:`, proposalError?.message); return errorResponse('Proposal not found', req, 404) }

    const sections: ProposalSection[] = body.content_json ?? proposal.sections ?? []
    if (sections.length === 0) return errorResponse('Proposal has no content sections to render', req, 400)

    // Step 2+3: Load template + brand config
    const templateId = body.template_id ?? proposal.template_id
    const [templateResult, orgResult] = await Promise.all([
      templateId ? supabase.from('proposal_templates').select('id, html_template, css_styles, brand_config, section_schema').eq('id', templateId).maybeSingle<TemplateRow>() : Promise.resolve({ data: null, error: null }),
      supabase.from('organizations').select('id, name, brand_config, default_template_id').eq('id', proposal.org_id).maybeSingle<OrgRow>(),
    ])

    const template = templateResult.data
    const org = orgResult.data

    let resolvedTemplate: TemplateRow | null = template
    if (!resolvedTemplate && org?.default_template_id && org.default_template_id !== templateId) {
      const { data: defaultTemplate } = await supabase.from('proposal_templates').select('id, html_template, css_styles, brand_config, section_schema').eq('id', org.default_template_id).maybeSingle<TemplateRow>()
      resolvedTemplate = defaultTemplate
    }

    const brandConfig = mergeBrandConfig(resolvedTemplate?.brand_config ?? null, org?.brand_config ?? null)

    // Step 4: Load metadata
    const [dealResult, contactResult, profileResult] = await Promise.all([
      proposal.deal_id ? supabase.from('deals').select('id, company, name').eq('id', proposal.deal_id).maybeSingle<DealRow>() : Promise.resolve({ data: null, error: null }),
      proposal.contact_id ? supabase.from('contacts').select('id, full_name, company, email').eq('id', proposal.contact_id).maybeSingle<ContactRow>() : Promise.resolve({ data: null, error: null }),
      supabase.from('profiles').select('id, first_name, last_name, email').eq('id', proposal.user_id).maybeSingle<ProfileRow>(),
    ])

    const deal = dealResult.data
    const contact = contactResult.data
    const profile = profileResult.data

    const ctx = proposal.context_payload as Record<string, unknown> | null
    const ctxContact = ctx?.contact as Record<string, unknown> | null
    const ctxDeal = ctx?.deal as Record<string, unknown> | null
    const ctxOrg = ctx?.org_preferences as Record<string, unknown> | null

    const clientName = (ctxContact?.name as string) || contact?.full_name || [contact?.email?.split('@')[0]].filter(Boolean).join('') || 'Valued Client'
    const clientCompany = (ctxDeal?.company as string) || (ctxContact?.company as string) || deal?.company || contact?.company || companyNameFromEmail(contact?.email) || org?.name || 'Client'
    const profileFullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
    const preparedBy = (ctxOrg?.company_name as string) || profileFullName || profile?.email || org?.name || 'Sales Team'

    const metadata: TemplateContext['metadata'] = {
      proposal_title: proposal.title || (ctxDeal?.name as string) || 'Proposal',
      client_name: clientName, client_company: clientCompany,
      prepared_by: preparedBy, prepared_date: formatDate(new Date()),
      reference_number: buildReferenceNumber(proposal.id),
    }

    // Step 5: Generate HTML
    const context: TemplateContext = { sections, brandConfig, metadata }
    console.log(`${LOG_PREFIX} Generating HTML for proposal "${metadata.proposal_title}" (${sections.length} sections, ref: ${metadata.reference_number})`)

    const generatedHtml = generateProposalHTML(context, resolvedTemplate?.html_template ?? undefined)
    const lineYOffsetRaw = typeof body.line_y_offset_px === 'number' ? body.line_y_offset_px : 0
    const lineYOffsetPx = Number.isFinite(lineYOffsetRaw) ? Math.max(-20, Math.min(20, Math.round(lineYOffsetRaw))) : 0
    const htmlDocument = applySectionHeaderAlignmentOverrides(generatedHtml, lineYOffsetPx)

    // Step 5b: Store rendered HTML
    try {
      const { error: htmlStoreError } = await supabase.from('proposals').update({ rendered_html: htmlDocument, updated_at: new Date().toISOString() }).eq('id', proposal.id)
      if (htmlStoreError) console.warn(`${LOG_PREFIX} Failed to store rendered_html (non-fatal):`, htmlStoreError.message)
      else console.log(`${LOG_PREFIX} rendered_html stored for inline preview`)
    } catch (htmlErr) { console.warn(`${LOG_PREFIX} rendered_html store threw (non-fatal):`, htmlErr) }

    // Step 6: Send to Gotenberg
    const pdfBytes = await renderWithGotenberg(htmlDocument, gotenbergUrl)

    // Step 7: Upload to Storage
    const storagePath = `${proposal.org_id}/proposals/${proposal.id}.pdf`
    console.log(`${LOG_PREFIX} Uploading PDF to storage: ${storagePath}`)
    const { error: uploadError } = await supabase.storage.from('proposal-assets').upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (uploadError) { console.error(`${LOG_PREFIX} Storage upload failed:`, uploadError.message); throw new Error(`Storage upload failed: ${uploadError.message}`) }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage.from('proposal-assets').createSignedUrl(storagePath, 604800)
    if (signedUrlError || !signedUrlData?.signedUrl) { console.error(`${LOG_PREFIX} Failed to create signed URL:`, signedUrlError?.message); throw new Error(`Failed to create signed URL: ${signedUrlError?.message}`) }
    const pdfUrl = signedUrlData.signedUrl
    console.log(`${LOG_PREFIX} PDF uploaded. Signed URL generated.`)

    // Step 8: Generate thumbnail (non-fatal)
    let thumbnailUrl: string | null = null
    try {
      const thumbnailBytes = await generateThumbnail(htmlDocument, gotenbergUrl)
      const thumbnailPath = `${proposal.org_id}/thumbnails/${proposal.id}.png`
      console.log(`${LOG_PREFIX} Uploading thumbnail to storage: ${thumbnailPath}`)
      const { error: thumbnailUploadError } = await supabase.storage.from('proposal-assets').upload(thumbnailPath, thumbnailBytes, { contentType: 'image/png', upsert: true })
      if (thumbnailUploadError) throw new Error(`Thumbnail upload failed: ${thumbnailUploadError.message}`)
      const { data: thumbnailSignedUrlData, error: thumbnailSignedUrlError } = await supabase.storage.from('proposal-assets').createSignedUrl(thumbnailPath, 604800)
      if (thumbnailSignedUrlError || !thumbnailSignedUrlData?.signedUrl) throw new Error(`Failed to create thumbnail signed URL: ${thumbnailSignedUrlError?.message}`)
      thumbnailUrl = thumbnailSignedUrlData.signedUrl
      console.log(`${LOG_PREFIX} Thumbnail uploaded and signed URL generated.`)
    } catch (thumbnailErr) {
      const msg = thumbnailErr instanceof Error ? thumbnailErr.message : String(thumbnailErr)
      console.warn(`${LOG_PREFIX} Thumbnail generation failed (non-fatal): ${msg}`)
    }

    // Step 9: Update proposals row
    const updatedBrandConfig: Record<string, unknown> = { ...brandConfig, ...(thumbnailUrl !== null ? { thumbnail_url: thumbnailUrl } : {}) }
    const { error: updateError } = await supabase.from('proposals').update({
      pdf_url: pdfUrl, pdf_s3_key: storagePath, generation_status: 'rendered',
      brand_config: updatedBrandConfig, updated_at: new Date().toISOString(),
    }).eq('id', proposal.id)
    if (updateError) console.error(`${LOG_PREFIX} Failed to update proposal row:`, updateError.message)

    // Step 10: Return result
    const renderTotalMs = Date.now() - renderStart
    console.log(`${LOG_PREFIX} Render complete for proposal ${proposal.id} in ${renderTotalMs}ms`)

    const corsHeaders = getCorsHeaders(req)
    return new Response(
      JSON.stringify({
        success: true, proposal_id: proposal.id, pdf_url: pdfUrl, pdf_s3_key: storagePath,
        generation_status: 'rendered', pdf_size_bytes: pdfBytes.length, thumbnail_url: thumbnailUrl,
        metadata: { proposal_title: metadata.proposal_title, reference_number: metadata.reference_number, sections_count: sections.length },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Render-Timing': `total=${renderTotalMs}ms, wait_delay=${resolveWaitDelay(htmlDocument)}` } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Error:`, message)
    return errorResponse(message, req, 500)
  }
}
