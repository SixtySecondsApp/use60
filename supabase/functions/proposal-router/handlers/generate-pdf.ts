// Handler extracted from proposal-generate-pdf/index.ts
/// <reference path="../../deno.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'
import type { PDFFont, PDFPage, RGB } from 'https://esm.sh/pdf-lib@1.17.1'

// =============================================================================
// CORS
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// =============================================================================
// Constants
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const LOG_PREFIX = '[proposal-generate-pdf]'

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN_TOP = 72
const MARGIN_BOTTOM = 72
const MARGIN_LEFT = 72
const MARGIN_RIGHT = 72
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

const FONT_SIZE_COVER_TITLE = 28
const FONT_SIZE_COVER_SUBTITLE = 14
const FONT_SIZE_HEADING = 16
const FONT_SIZE_BODY = 11
const FONT_SIZE_FOOTER = 9
const FONT_SIZE_BULLET = 11

const LINE_HEIGHT_BODY = 1.5
const LINE_HEIGHT_HEADING = 1.3

const SPACING_AFTER_HEADING = 12
const SPACING_AFTER_PARAGRAPH = 10
const SPACING_BEFORE_SECTION = 30
const BULLET_INDENT = 20
const LIST_ITEM_SPACING = 4

const DEFAULT_PRIMARY_COLOR = rgb(0.1, 0.2, 0.4)

// =============================================================================
// Types
// =============================================================================

interface ProposalSection {
  id: string
  type: 'cover' | 'executive_summary' | 'problem' | 'solution' | 'approach' | 'timeline' | 'pricing' | 'terms' | 'custom'
  title: string
  content: string
  order: number
}

interface BrandConfig {
  primary_color?: string
  secondary_color?: string
  font_family?: string
  logo_url?: string
  header_style?: string
}

interface TextSegment {
  text: string
  bold: boolean
}

// =============================================================================
// Utility functions
// =============================================================================

function parseHexColor(hex: string | undefined): RGB {
  if (!hex) return DEFAULT_PRIMARY_COLOR
  const clean = hex.replace(/^#/, '')
  if (clean.length !== 6 && clean.length !== 3) return DEFAULT_PRIMARY_COLOR
  let r: number, g: number, b: number
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) / 255
    g = parseInt(clean[1] + clean[1], 16) / 255
    b = parseInt(clean[2] + clean[2], 16) / 255
  } else {
    r = parseInt(clean.substring(0, 2), 16) / 255
    g = parseInt(clean.substring(2, 4), 16) / 255
    b = parseInt(clean.substring(4, 6), 16) / 255
  }
  if (isNaN(r) || isNaN(g) || isNaN(b)) return DEFAULT_PRIMARY_COLOR
  return rgb(r, g, b)
}

interface ContentBlock {
  type: 'paragraph' | 'bullet' | 'numbered'
  segments: TextSegment[]
  number?: number
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(Number(dec)))
}

function parseInlineSegments(html: string): TextSegment[] {
  const segments: TextSegment[] = []
  const parts = html.split(/(<\/?(?:strong|b)>)/i)
  let bold = false
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === '<strong>' || lower === '<b>') { bold = true; continue }
    if (lower === '</strong>' || lower === '</b>') { bold = false; continue }
    const clean = decodeHtmlEntities(stripTags(part)).trim()
    if (clean) segments.push({ text: clean, bold })
  }
  return segments
}

function extractListItems(listHtml: string): string[] {
  const items: string[] = []
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let match: RegExpExecArray | null
  while ((match = liRegex.exec(listHtml)) !== null) items.push(match[1])
  return items
}

function parseHtmlToBlocksOrdered(html: string): ContentBlock[] {
  if (!html || !html.trim()) return []
  const blocks: ContentBlock[] = []
  const tokenRegex = /(<(?:ul|ol)[^>]*>[\s\S]*?<\/(?:ul|ol)>)/gi
  const tokens = html.split(tokenRegex)

  for (const token of tokens) {
    const trimmed = token.trim()
    if (!trimmed) continue
    if (/^<ol[^>]*>/i.test(trimmed)) {
      const items = extractListItems(trimmed)
      items.forEach((item, idx) => {
        blocks.push({ type: 'numbered', segments: parseInlineSegments(item), number: idx + 1 })
      })
      continue
    }
    if (/^<ul[^>]*>/i.test(trimmed)) {
      const items = extractListItems(trimmed)
      items.forEach((item) => {
        blocks.push({ type: 'bullet', segments: parseInlineSegments(item) })
      })
      continue
    }
    const paragraphs = trimmed
      .split(/<\/(?:p|div|h[1-6])>|<br\s*\/?>|<\/br>/gi)
      .map((chunk) => parseInlineSegments(chunk))
      .filter((segs) => segs.length > 0)
    for (const segments of paragraphs) {
      blocks.push({ type: 'paragraph', segments })
    }
  }

  if (blocks.length === 0) {
    const plain = decodeHtmlEntities(stripTags(html)).trim()
    if (plain) blocks.push({ type: 'paragraph', segments: [{ text: plain, bold: false }] })
  }
  return blocks
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let currentLine = ''
  for (const word of words) {
    if (!word) continue
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const width = font.widthOfTextAtSize(testLine, fontSize)
    if (width > maxWidth && currentLine) { lines.push(currentLine); currentLine = word }
    else currentLine = testLine
  }
  if (currentLine) lines.push(currentLine)
  return lines
}

function wrapSegments(segments: TextSegment[], regularFont: PDFFont, boldFont: PDFFont, fontSize: number, maxWidth: number): TextSegment[][] {
  interface Word { text: string; bold: boolean }
  const allWords: Word[] = []
  for (const seg of segments) {
    const words = seg.text.split(/\s+/).filter(Boolean)
    for (const w of words) allWords.push({ text: w, bold: seg.bold })
  }
  const lines: TextSegment[][] = []
  let currentLineWords: Word[] = []
  let currentLineWidth = 0
  for (const word of allWords) {
    const font = word.bold ? boldFont : regularFont
    const spaceWidth = currentLineWords.length > 0 ? regularFont.widthOfTextAtSize(' ', fontSize) : 0
    const wordWidth = font.widthOfTextAtSize(word.text, fontSize)
    if (currentLineWidth + spaceWidth + wordWidth > maxWidth && currentLineWords.length > 0) {
      lines.push(wordsToSegments(currentLineWords))
      currentLineWords = [word]
      currentLineWidth = wordWidth
    } else {
      currentLineWidth += spaceWidth + wordWidth
      currentLineWords.push(word)
    }
  }
  if (currentLineWords.length > 0) lines.push(wordsToSegments(currentLineWords))
  return lines
}

function wordsToSegments(words: { text: string; bold: boolean }[]): TextSegment[] {
  if (words.length === 0) return []
  const segments: TextSegment[] = []
  let current = { text: words[0].text, bold: words[0].bold }
  for (let i = 1; i < words.length; i++) {
    if (words[i].bold === current.bold) current.text += ' ' + words[i].text
    else { segments.push(current); current = { text: words[i].text, bold: words[i].bold } }
  }
  segments.push(current)
  return segments
}

// =============================================================================
// PDF Generation
// =============================================================================

interface PdfContext {
  doc: InstanceType<typeof PDFDocument>
  regularFont: PDFFont
  boldFont: PDFFont
  primaryColor: RGB
  currentPage: PDFPage
  currentY: number
  pageCount: number
  pages: PDFPage[]
}

function addNewPage(ctx: PdfContext): void {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  ctx.currentPage = page
  ctx.currentY = PAGE_HEIGHT - MARGIN_TOP
  ctx.pageCount++
  ctx.pages.push(page)
}

function ensureSpace(ctx: PdfContext, needed: number): boolean {
  if (ctx.currentY - needed < MARGIN_BOTTOM) { addNewPage(ctx); return true }
  return false
}

function drawSegmentLine(ctx: PdfContext, segments: TextSegment[], x: number, y: number, fontSize: number, defaultColor: RGB): void {
  let cursorX = x
  for (const seg of segments) {
    const font = seg.bold ? ctx.boldFont : ctx.regularFont
    ctx.currentPage.drawText(seg.text, { x: cursorX, y, size: fontSize, font, color: defaultColor })
    cursorX += font.widthOfTextAtSize(seg.text, fontSize)
    cursorX += ctx.regularFont.widthOfTextAtSize(' ', fontSize)
  }
}

function renderCoverPage(ctx: PdfContext, title: string, companyName: string | undefined, date: string): void {
  const page = ctx.currentPage
  const titleLines = wrapText(title, ctx.boldFont, FONT_SIZE_COVER_TITLE, CONTENT_WIDTH)
  const titleBlockHeight = titleLines.length * FONT_SIZE_COVER_TITLE * LINE_HEIGHT_HEADING
  let titleY = PAGE_HEIGHT * 0.6 + titleBlockHeight / 2
  for (const line of titleLines) {
    const lineWidth = ctx.boldFont.widthOfTextAtSize(line, FONT_SIZE_COVER_TITLE)
    const x = (PAGE_WIDTH - lineWidth) / 2
    page.drawText(line, { x, y: titleY, size: FONT_SIZE_COVER_TITLE, font: ctx.boldFont, color: ctx.primaryColor })
    titleY -= FONT_SIZE_COVER_TITLE * LINE_HEIGHT_HEADING
  }
  if (companyName) {
    const companyWidth = ctx.regularFont.widthOfTextAtSize(companyName, FONT_SIZE_COVER_SUBTITLE)
    page.drawText(companyName, { x: (PAGE_WIDTH - companyWidth) / 2, y: titleY - 20, size: FONT_SIZE_COVER_SUBTITLE, font: ctx.regularFont, color: rgb(0.4, 0.4, 0.4) })
    titleY -= 20 + FONT_SIZE_COVER_SUBTITLE * LINE_HEIGHT_BODY
  }
  const dateWidth = ctx.regularFont.widthOfTextAtSize(date, FONT_SIZE_COVER_SUBTITLE)
  page.drawText(date, { x: (PAGE_WIDTH - dateWidth) / 2, y: titleY - 10, size: FONT_SIZE_COVER_SUBTITLE, font: ctx.regularFont, color: rgb(0.5, 0.5, 0.5) })
  const lineY = titleY - 40
  page.drawLine({ start: { x: PAGE_WIDTH * 0.3, y: lineY }, end: { x: PAGE_WIDTH * 0.7, y: lineY }, thickness: 1.5, color: ctx.primaryColor })
}

function renderSectionHeading(ctx: PdfContext, title: string): void {
  const lineHeight = FONT_SIZE_HEADING * LINE_HEIGHT_HEADING
  const lines = wrapText(title, ctx.boldFont, FONT_SIZE_HEADING, CONTENT_WIDTH)
  const totalHeight = lines.length * lineHeight + SPACING_AFTER_HEADING
  ensureSpace(ctx, totalHeight)
  for (const line of lines) {
    ctx.currentPage.drawText(line, { x: MARGIN_LEFT, y: ctx.currentY, size: FONT_SIZE_HEADING, font: ctx.boldFont, color: ctx.primaryColor })
    ctx.currentY -= lineHeight
  }
  ctx.currentPage.drawLine({ start: { x: MARGIN_LEFT, y: ctx.currentY + 2 }, end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.currentY + 2 }, thickness: 0.5, color: ctx.primaryColor })
  ctx.currentY -= SPACING_AFTER_HEADING
}

function renderParagraph(ctx: PdfContext, segments: TextSegment[]): void {
  const lineHeight = FONT_SIZE_BODY * LINE_HEIGHT_BODY
  const wrappedLines = wrapSegments(segments, ctx.regularFont, ctx.boldFont, FONT_SIZE_BODY, CONTENT_WIDTH)
  for (const lineSegs of wrappedLines) {
    ensureSpace(ctx, lineHeight)
    drawSegmentLine(ctx, lineSegs, MARGIN_LEFT, ctx.currentY, FONT_SIZE_BODY, rgb(0.1, 0.1, 0.1))
    ctx.currentY -= lineHeight
  }
  ctx.currentY -= SPACING_AFTER_PARAGRAPH
}

function renderBulletItem(ctx: PdfContext, segments: TextSegment[]): void {
  const lineHeight = FONT_SIZE_BULLET * LINE_HEIGHT_BODY
  const availableWidth = CONTENT_WIDTH - BULLET_INDENT
  const wrappedLines = wrapSegments(segments, ctx.regularFont, ctx.boldFont, FONT_SIZE_BULLET, availableWidth)
  for (let i = 0; i < wrappedLines.length; i++) {
    ensureSpace(ctx, lineHeight)
    if (i === 0) ctx.currentPage.drawText('\u2022', { x: MARGIN_LEFT + 6, y: ctx.currentY, size: FONT_SIZE_BULLET, font: ctx.regularFont, color: rgb(0.2, 0.2, 0.2) })
    drawSegmentLine(ctx, wrappedLines[i], MARGIN_LEFT + BULLET_INDENT, ctx.currentY, FONT_SIZE_BULLET, rgb(0.1, 0.1, 0.1))
    ctx.currentY -= lineHeight
  }
  ctx.currentY -= LIST_ITEM_SPACING
}

function renderNumberedItem(ctx: PdfContext, segments: TextSegment[], number: number): void {
  const lineHeight = FONT_SIZE_BULLET * LINE_HEIGHT_BODY
  const availableWidth = CONTENT_WIDTH - BULLET_INDENT
  const wrappedLines = wrapSegments(segments, ctx.regularFont, ctx.boldFont, FONT_SIZE_BULLET, availableWidth)
  for (let i = 0; i < wrappedLines.length; i++) {
    ensureSpace(ctx, lineHeight)
    if (i === 0) ctx.currentPage.drawText(`${number}.`, { x: MARGIN_LEFT + 2, y: ctx.currentY, size: FONT_SIZE_BULLET, font: ctx.regularFont, color: rgb(0.2, 0.2, 0.2) })
    drawSegmentLine(ctx, wrappedLines[i], MARGIN_LEFT + BULLET_INDENT, ctx.currentY, FONT_SIZE_BULLET, rgb(0.1, 0.1, 0.1))
    ctx.currentY -= lineHeight
  }
  ctx.currentY -= LIST_ITEM_SPACING
}

function renderPageNumbers(ctx: PdfContext): void {
  for (let i = 0; i < ctx.pages.length; i++) {
    const page = ctx.pages[i]
    if (i === 0) continue
    const text = `Page ${i} of ${ctx.pages.length - 1}`
    const textWidth = ctx.regularFont.widthOfTextAtSize(text, FONT_SIZE_FOOTER)
    page.drawText(text, { x: (PAGE_WIDTH - textWidth) / 2, y: MARGIN_BOTTOM - 30, size: FONT_SIZE_FOOTER, font: ctx.regularFont, color: rgb(0.5, 0.5, 0.5) })
  }
}

async function generatePdf(title: string, sections: ProposalSection[], brandConfig: BrandConfig | null, companyName: string | undefined): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const primaryColor = parseHexColor(brandConfig?.primary_color)
  const firstPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const ctx: PdfContext = { doc: pdfDoc, regularFont, boldFont, primaryColor, currentPage: firstPage, currentY: PAGE_HEIGHT - MARGIN_TOP, pageCount: 1, pages: [firstPage] }
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const sorted = [...sections].sort((a, b) => a.order - b.order)
  const hasCoverSection = sorted.length > 0 && sorted[0].type === 'cover'
  if (hasCoverSection) renderCoverPage(ctx, title || sorted[0].title, companyName, dateStr)
  else renderCoverPage(ctx, title || 'Proposal', companyName, dateStr)
  addNewPage(ctx)
  const contentSections = hasCoverSection ? sorted.slice(1) : sorted
  for (let i = 0; i < contentSections.length; i++) {
    const section = contentSections[i]
    const isMajorSection = ['executive_summary', 'problem', 'solution', 'approach', 'timeline', 'pricing', 'terms'].includes(section.type)
    if (i > 0 && isMajorSection) addNewPage(ctx)
    else if (i > 0) { ensureSpace(ctx, SPACING_BEFORE_SECTION + FONT_SIZE_HEADING * 2); ctx.currentY -= SPACING_BEFORE_SECTION }
    renderSectionHeading(ctx, section.title)
    const blocks = parseHtmlToBlocksOrdered(section.content || '')
    for (const block of blocks) {
      switch (block.type) {
        case 'paragraph': renderParagraph(ctx, block.segments); break
        case 'bullet': renderBulletItem(ctx, block.segments); break
        case 'numbered': renderNumberedItem(ctx, block.segments, block.number || 1); break
      }
    }
  }
  renderPageNumbers(ctx)
  const pdfBytes = await pdfDoc.save()
  return pdfBytes
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length))
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

// =============================================================================
// Handler
// =============================================================================

export async function handleGeneratePdf(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    const { proposal_id } = body

    if (!proposal_id) {
      return new Response(JSON.stringify({ error: 'proposal_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // -------------------------------------------------------------------------
    // Pipeline version routing
    // -------------------------------------------------------------------------
    const pipelineVersion = body.pipeline_version

    if (pipelineVersion === undefined || pipelineVersion === 2) {
      console.log(`${LOG_PREFIX} Routing to proposal-render-gotenberg (pipeline_version: ${pipelineVersion ?? 'unset → default v2'})`)

      const routingClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      const authHeader = req.headers.get('Authorization')
      const { data: gotenbergData, error: gotenbergError } =
        await routingClient.functions.invoke('proposal-router', {
          body: { action: 'render_gotenberg', proposal_id },
          headers: authHeader ? { Authorization: authHeader } : {},
        })

      if (gotenbergError) {
        console.error(`${LOG_PREFIX} Error forwarding to proposal-render-gotenberg:`, gotenbergError)
        return new Response(JSON.stringify({ error: 'Failed to forward to Gotenberg renderer', message: gotenbergError.message }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify(gotenbergData), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // pipeline_version === 1 → legacy pdf-lib path
    console.warn(`${LOG_PREFIX} [DEPRECATED] proposal-generate-pdf using pdf-lib. Migrate to proposal-render-gotenberg.`)
    console.log(`${LOG_PREFIX} Generating PDF for proposal: ${proposal_id}`)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error(`${LOG_PREFIX} Auth error:`, userError?.message)
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log(`${LOG_PREFIX} Authenticated user: ${user.id}`)

    const { data: proposal, error: fetchError } = await supabase
      .from('proposals')
      .select('id, title, sections, brand_config, contact_id, type, status')
      .eq('id', proposal_id)
      .maybeSingle()

    if (fetchError) {
      console.error(`${LOG_PREFIX} DB error fetching proposal:`, fetchError.message)
      return new Response(JSON.stringify({ error: 'Failed to fetch proposal' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!proposal) {
      return new Response(JSON.stringify({ error: 'Proposal not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let sections: ProposalSection[] = []
    if (proposal.sections) {
      if (Array.isArray(proposal.sections)) sections = proposal.sections
      else if (typeof proposal.sections === 'object' && Array.isArray(proposal.sections.sections)) sections = proposal.sections.sections
    }

    if (sections.length === 0) {
      console.warn(`${LOG_PREFIX} Proposal ${proposal_id} has no sections`)
      return new Response(JSON.stringify({ error: 'Proposal has no sections to generate PDF from' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log(`${LOG_PREFIX} Generating PDF with ${sections.length} sections`)

    let companyName: string | undefined
    if (proposal.contact_id) {
      const { data: contact } = await supabase.from('contacts').select('company_name').eq('id', proposal.contact_id).maybeSingle()
      if (contact?.company_name) companyName = contact.company_name
    }

    const brandConfig: BrandConfig | null = proposal.brand_config || null
    const pdfBytes = await generatePdf(proposal.title || 'Proposal', sections, brandConfig, companyName)
    const pdfBase64 = uint8ArrayToBase64(pdfBytes)

    const safeTitle = (proposal.title || 'proposal').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase().substring(0, 50)
    const filename = `${safeTitle}-${new Date().toISOString().split('T')[0]}.pdf`

    console.log(`${LOG_PREFIX} PDF generated successfully: ${filename} (${pdfBytes.length} bytes)`)

    return new Response(
      JSON.stringify({ pdf_base64: pdfBase64, filename, v1_legacy: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Deprecated': 'proposal-generate-pdf (pdf-lib) is deprecated. Use proposal-render-gotenberg with pipeline_version: 2.' } }
    )
  } catch (error) {
    console.error(`${LOG_PREFIX} Unexpected error:`, error)
    return new Response(JSON.stringify({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}
