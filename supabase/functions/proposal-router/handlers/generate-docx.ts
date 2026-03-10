// Handler extracted from proposal-generate-docx/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import * as docx from 'https://esm.sh/docx@8.5.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOG_PREFIX = '[proposal-generate-docx]'

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

interface Proposal {
  id: string
  title: string | null
  sections: { sections: ProposalSection[] } | null
  brand_config: BrandConfig | null
  contact_id: string | null
  user_id: string | null
}

// =============================================================================
// Color Utilities
// =============================================================================

function normalizeHexColor(color: string): string {
  const cleaned = color.replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return cleaned.toUpperCase()
  }
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return cleaned
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()
  }
  return '1F2937'
}

// =============================================================================
// HTML to DOCX Conversion Helpers
// =============================================================================

function parseInlineFormatting(html: string): docx.TextRun[] {
  const runs: docx.TextRun[] = []
  let text = html.replace(/<br\s*\/?>/gi, '\n')
  const inlinePattern = /<(strong|b|em|i)>([\s\S]*?)<\/\1>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  inlinePattern.lastIndex = 0

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plainText = stripAllTags(text.substring(lastIndex, match.index))
      if (plainText) {
        runs.push(new docx.TextRun({ text: plainText, size: 22 }))
      }
    }

    const tag = match[1].toLowerCase()
    let innerContent = match[2]

    const nestedBoldPattern = /<(strong|b)>([\s\S]*?)<\/\1>/gi
    const nestedItalicPattern = /<(em|i)>([\s\S]*?)<\/\1>/gi

    if ((tag === 'strong' || tag === 'b') && nestedItalicPattern.test(innerContent)) {
      nestedItalicPattern.lastIndex = 0
      let nestedLastIndex = 0
      let nestedMatch: RegExpExecArray | null
      while ((nestedMatch = nestedItalicPattern.exec(innerContent)) !== null) {
        if (nestedMatch.index > nestedLastIndex) {
          const seg = stripAllTags(innerContent.substring(nestedLastIndex, nestedMatch.index))
          if (seg) runs.push(new docx.TextRun({ text: seg, bold: true, size: 22 }))
        }
        const seg = stripAllTags(nestedMatch[2])
        if (seg) runs.push(new docx.TextRun({ text: seg, bold: true, italics: true, size: 22 }))
        nestedLastIndex = nestedMatch.index + nestedMatch[0].length
      }
      if (nestedLastIndex < innerContent.length) {
        const seg = stripAllTags(innerContent.substring(nestedLastIndex))
        if (seg) runs.push(new docx.TextRun({ text: seg, bold: true, size: 22 }))
      }
    } else if ((tag === 'em' || tag === 'i') && nestedBoldPattern.test(innerContent)) {
      nestedBoldPattern.lastIndex = 0
      let nestedLastIndex = 0
      let nestedMatch: RegExpExecArray | null
      while ((nestedMatch = nestedBoldPattern.exec(innerContent)) !== null) {
        if (nestedMatch.index > nestedLastIndex) {
          const seg = stripAllTags(innerContent.substring(nestedLastIndex, nestedMatch.index))
          if (seg) runs.push(new docx.TextRun({ text: seg, italics: true, size: 22 }))
        }
        const seg = stripAllTags(nestedMatch[2])
        if (seg) runs.push(new docx.TextRun({ text: seg, bold: true, italics: true, size: 22 }))
        nestedLastIndex = nestedMatch.index + nestedMatch[0].length
      }
      if (nestedLastIndex < innerContent.length) {
        const seg = stripAllTags(innerContent.substring(nestedLastIndex))
        if (seg) runs.push(new docx.TextRun({ text: seg, italics: true, size: 22 }))
      }
    } else {
      const cleanText = stripAllTags(innerContent)
      if (cleanText) {
        const isBold = tag === 'strong' || tag === 'b'
        const isItalic = tag === 'em' || tag === 'i'
        runs.push(
          new docx.TextRun({
            text: cleanText,
            bold: isBold,
            italics: isItalic,
            size: 22,
          })
        )
      }
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    const remaining = stripAllTags(text.substring(lastIndex))
    if (remaining) {
      runs.push(new docx.TextRun({ text: remaining, size: 22 }))
    }
  }

  if (runs.length === 0) {
    const plain = stripAllTags(text)
    if (plain) {
      runs.push(new docx.TextRun({ text: plain, size: 22 }))
    }
  }

  return runs
}

function stripAllTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function parseHtmlTable(tableHtml: string, primaryColor: string): docx.Table {
  const rows: docx.TableRow[] = []
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch: RegExpExecArray | null
  let isFirstRow = true

  while ((trMatch = trPattern.exec(tableHtml)) !== null) {
    const trContent = trMatch[1]
    const cells: docx.TableCell[] = []
    const cellPattern = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi
    let cellMatch: RegExpExecArray | null

    while ((cellMatch = cellPattern.exec(trContent)) !== null) {
      const isHeader = cellMatch[1].toLowerCase() === 'th' || isFirstRow
      const cellText = stripAllTags(cellMatch[2]).trim()

      cells.push(
        new docx.TableCell({
          children: [
            new docx.Paragraph({
              children: [
                new docx.TextRun({
                  text: cellText,
                  bold: isHeader,
                  size: isHeader ? 22 : 20,
                  color: isHeader ? 'FFFFFF' : '374151',
                }),
              ],
              spacing: { before: 60, after: 60 },
            }),
          ],
          shading: isHeader
            ? { fill: primaryColor, type: docx.ShadingType.SOLID }
            : undefined,
          verticalAlign: docx.VerticalAlign.CENTER,
        })
      )
    }

    if (cells.length > 0) {
      rows.push(new docx.TableRow({ children: cells }))
    }

    isFirstRow = false
  }

  if (rows.length === 0) {
    rows.push(
      new docx.TableRow({
        children: [
          new docx.TableCell({
            children: [new docx.Paragraph({ children: [new docx.TextRun({ text: '' })] })],
          }),
        ],
      })
    )
  }

  return new docx.Table({
    rows,
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
  })
}

function htmlToDocxElements(
  html: string,
  primaryColor: string,
  numberingRef: string
): (docx.Paragraph | docx.Table)[] {
  const elements: (docx.Paragraph | docx.Table)[] = []
  if (!html) return elements

  const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi
  let tableMatch: RegExpExecArray | null

  const tableParts: Array<{ start: number; end: number; html: string }> = []
  while ((tableMatch = tablePattern.exec(html)) !== null) {
    tableParts.push({
      start: tableMatch.index,
      end: tableMatch.index + tableMatch[0].length,
      html: tableMatch[0],
    })
  }

  let lastIndex = 0
  for (const part of tableParts) {
    if (part.start > lastIndex) {
      const beforeContent = html.substring(lastIndex, part.start)
      elements.push(...parseBlockElements(beforeContent, primaryColor, numberingRef))
    }
    elements.push(parseHtmlTable(part.html, primaryColor))
    elements.push(new docx.Paragraph({ spacing: { after: 120 } }))
    lastIndex = part.end
  }

  if (lastIndex < html.length) {
    const afterContent = html.substring(lastIndex)
    elements.push(...parseBlockElements(afterContent, primaryColor, numberingRef))
  }

  return elements
}

function parseBlockElements(
  html: string,
  primaryColor: string,
  numberingRef: string
): docx.Paragraph[] {
  const paragraphs: docx.Paragraph[] = []
  const blockPattern =
    /<(p|h[1-6]|ul|ol|li|blockquote|div)[^>]*>([\s\S]*?)<\/\1>/gi
  let match: RegExpExecArray | null
  let lastIndex = 0
  let inOrderedList = false
  let inUnorderedList = false

  while ((match = blockPattern.exec(html)) !== null) {
    if (match.index > lastIndex) {
      const betweenText = stripAllTags(html.substring(lastIndex, match.index)).trim()
      if (betweenText) {
        paragraphs.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: betweenText, size: 22 })],
            spacing: { after: 120 },
          })
        )
      }
    }

    const tag = match[1].toLowerCase()
    const content = match[2]

    switch (tag) {
      case 'h1':
        paragraphs.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: stripAllTags(content), bold: true, size: 36, color: primaryColor })],
            heading: docx.HeadingLevel.HEADING_1,
            spacing: { before: 360, after: 200 },
          })
        )
        break
      case 'h2':
        paragraphs.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: stripAllTags(content), bold: true, size: 30, color: primaryColor })],
            heading: docx.HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 160 },
          })
        )
        break
      case 'h3':
        paragraphs.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: stripAllTags(content), bold: true, size: 26, color: primaryColor })],
            heading: docx.HeadingLevel.HEADING_3,
            spacing: { before: 240, after: 120 },
          })
        )
        break
      case 'h4': case 'h5': case 'h6':
        paragraphs.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: stripAllTags(content), bold: true, size: 24, color: primaryColor })],
            heading: docx.HeadingLevel.HEADING_4,
            spacing: { before: 200, after: 100 },
          })
        )
        break
      case 'ul':
        inUnorderedList = true
        inOrderedList = false
        {
          const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi
          let liMatch: RegExpExecArray | null
          while ((liMatch = liPattern.exec(content)) !== null) {
            const runs = parseInlineFormatting(liMatch[1])
            paragraphs.push(new docx.Paragraph({ children: runs, bullet: { level: 0 }, spacing: { after: 60 } }))
          }
        }
        inUnorderedList = false
        break
      case 'ol':
        inOrderedList = true
        inUnorderedList = false
        {
          const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi
          let liMatch: RegExpExecArray | null
          while ((liMatch = liPattern.exec(content)) !== null) {
            const runs = parseInlineFormatting(liMatch[1])
            paragraphs.push(new docx.Paragraph({ children: runs, numbering: { reference: numberingRef, level: 0 }, spacing: { after: 60 } }))
          }
        }
        inOrderedList = false
        break
      case 'li':
        {
          const runs = parseInlineFormatting(content)
          if (inOrderedList) {
            paragraphs.push(new docx.Paragraph({ children: runs, numbering: { reference: numberingRef, level: 0 }, spacing: { after: 60 } }))
          } else {
            paragraphs.push(new docx.Paragraph({ children: runs, bullet: { level: 0 }, spacing: { after: 60 } }))
          }
        }
        break
      case 'blockquote':
        paragraphs.push(
          new docx.Paragraph({
            children: parseInlineFormatting(content),
            indent: { left: 720 },
            border: { left: { style: docx.BorderStyle.SINGLE, size: 6, color: primaryColor } },
            spacing: { before: 120, after: 120 },
          })
        )
        break
      case 'p': case 'div': default:
        {
          const runs = parseInlineFormatting(content)
          if (runs.length > 0) {
            paragraphs.push(new docx.Paragraph({ children: runs, spacing: { after: 120 } }))
          }
        }
        break
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < html.length) {
    const remaining = stripAllTags(html.substring(lastIndex)).trim()
    if (remaining) {
      const textParagraphs = remaining.split(/\n\s*\n/)
      for (const tp of textParagraphs) {
        const trimmed = tp.trim()
        if (trimmed) {
          paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun({ text: trimmed, size: 22 })], spacing: { after: 120 } }))
        }
      }
    }
  }

  return paragraphs
}

// =============================================================================
// Cover Page Builder
// =============================================================================

function buildCoverPage(title: string, primaryColor: string, coverSection?: ProposalSection): docx.Paragraph[] {
  const paragraphs: docx.Paragraph[] = []
  paragraphs.push(new docx.Paragraph({ spacing: { before: 4000 } }))
  paragraphs.push(new docx.Paragraph({
    children: [new docx.TextRun({ text: '', size: 2 })],
    border: { bottom: { style: docx.BorderStyle.SINGLE, size: 12, color: primaryColor } },
    spacing: { after: 400 },
  }))
  paragraphs.push(new docx.Paragraph({
    children: [new docx.TextRun({ text: title, bold: true, size: 56, color: primaryColor })],
    alignment: docx.AlignmentType.LEFT,
    spacing: { after: 200 },
  }))

  if (coverSection && coverSection.content) {
    const coverText = stripAllTags(coverSection.content).trim()
    if (coverText) {
      const lines = coverText.split('\n').filter((l) => l.trim())
      for (const line of lines) {
        paragraphs.push(new docx.Paragraph({
          children: [new docx.TextRun({ text: line.trim(), size: 28, color: '6B7280' })],
          alignment: docx.AlignmentType.LEFT,
          spacing: { after: 100 },
        }))
      }
    }
  }

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  paragraphs.push(new docx.Paragraph({
    children: [new docx.TextRun({ text: dateStr, size: 24, color: '9CA3AF', italics: true })],
    alignment: docx.AlignmentType.LEFT,
    spacing: { before: 400, after: 200 },
  }))
  paragraphs.push(new docx.Paragraph({ children: [], pageBreakBefore: true }))

  return paragraphs
}

// =============================================================================
// Section Builder
// =============================================================================

function shouldPageBreakBefore(sectionType: string): boolean {
  const majorSections = ['executive_summary', 'problem', 'solution', 'approach', 'timeline', 'pricing', 'terms']
  return majorSections.includes(sectionType)
}

function buildSectionElements(section: ProposalSection, primaryColor: string, numberingRef: string, isFirst: boolean): (docx.Paragraph | docx.Table)[] {
  const elements: (docx.Paragraph | docx.Table)[] = []

  if (!isFirst && shouldPageBreakBefore(section.type)) {
    elements.push(new docx.Paragraph({ children: [], pageBreakBefore: true }))
  }

  elements.push(new docx.Paragraph({
    children: [new docx.TextRun({ text: section.title, bold: true, size: 32, color: primaryColor })],
    heading: docx.HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    border: { bottom: { style: docx.BorderStyle.SINGLE, size: 2, color: primaryColor } },
  }))

  const contentElements = htmlToDocxElements(section.content, primaryColor, numberingRef)
  elements.push(...contentElements)
  elements.push(new docx.Paragraph({ spacing: { after: 200 } }))

  return elements
}

// =============================================================================
// DOCX Document Assembly
// =============================================================================

function buildDocxDocument(proposal: Proposal, sections: ProposalSection[], brandConfig: BrandConfig): docx.Document {
  const primaryColor = normalizeHexColor(brandConfig.primary_color || '#3B82F6')
  const title = proposal.title || 'Proposal'
  const numberingRef = 'ordered-list-numbering'

  const sortedSections = [...sections].sort((a, b) => a.order - b.order)
  const coverSection = sortedSections.find((s) => s.type === 'cover')
  const bodySections = sortedSections.filter((s) => s.type !== 'cover')
  const children: (docx.Paragraph | docx.Table)[] = []

  children.push(...buildCoverPage(title, primaryColor, coverSection))

  children.push(new docx.Paragraph({
    children: [new docx.TextRun({ text: 'Table of Contents', bold: true, size: 32, color: primaryColor })],
    heading: docx.HeadingLevel.HEADING_1,
    spacing: { before: 200, after: 200 },
  }))

  children.push(new docx.TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }))
  children.push(new docx.Paragraph({ children: [], pageBreakBefore: true }))

  let isFirst = true
  for (const section of bodySections) {
    const sectionElements = buildSectionElements(section, primaryColor, numberingRef, isFirst)
    children.push(...sectionElements)
    isFirst = false
  }

  const doc = new docx.Document({
    features: { updateFields: true },
    numbering: {
      config: [{
        reference: numberingRef,
        levels: [{
          level: 0,
          format: docx.LevelFormat.DECIMAL,
          text: '%1.',
          alignment: docx.AlignmentType.START,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },
    styles: {
      default: {
        document: {
          run: { font: brandConfig.font_family || 'Calibri', size: 22, color: '374151' },
          paragraph: { spacing: { line: 276 } },
        },
        heading1: {
          run: { font: brandConfig.font_family || 'Calibri', size: 32, bold: true, color: primaryColor },
          paragraph: { spacing: { before: 360, after: 200 } },
        },
        heading2: {
          run: { font: brandConfig.font_family || 'Calibri', size: 28, bold: true, color: primaryColor },
          paragraph: { spacing: { before: 300, after: 160 } },
        },
        heading3: {
          run: { font: brandConfig.font_family || 'Calibri', size: 24, bold: true, color: primaryColor },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      headers: {
        default: new docx.Header({
          children: [new docx.Paragraph({
            children: [new docx.TextRun({ text: title, size: 16, color: '9CA3AF', italics: true })],
            alignment: docx.AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new docx.Footer({
          children: [new docx.Paragraph({
            children: [
              new docx.TextRun({ children: [docx.PageNumber.CURRENT], size: 18, color: '9CA3AF' }),
              new docx.TextRun({ text: ' of ', size: 18, color: '9CA3AF' }),
              new docx.TextRun({ children: [docx.PageNumber.TOTAL_PAGES], size: 18, color: '9CA3AF' }),
            ],
            alignment: docx.AlignmentType.CENTER,
            border: { top: { style: docx.BorderStyle.SINGLE, size: 1, color: 'E5E7EB' } },
            spacing: { before: 200 },
          })],
        }),
      },
      children,
    }],
  })

  return doc
}

// =============================================================================
// Handler
// =============================================================================

export async function handleGenerateDocx(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { proposal_id } = await req.json()

    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: 'proposal_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error(`${LOG_PREFIX} Auth error:`, userError?.message)
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`${LOG_PREFIX} User ${user.id} requesting DOCX for proposal ${proposal_id}`)

    const { data: proposal, error: fetchError } = await supabase
      .from('proposals')
      .select('id, title, sections, brand_config, contact_id, user_id')
      .eq('id', proposal_id)
      .maybeSingle()

    if (fetchError) {
      console.error(`${LOG_PREFIX} Fetch error:`, fetchError.message)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch proposal' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!proposal) {
      return new Response(
        JSON.stringify({ error: 'Proposal not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const sectionsData = proposal.sections as { sections: ProposalSection[] } | null
    if (!sectionsData || !sectionsData.sections || sectionsData.sections.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Proposal has no sections to generate. Please generate proposal content first.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const sections: ProposalSection[] = sectionsData.sections
    const brandConfig: BrandConfig = (proposal.brand_config as BrandConfig) || {}

    console.log(
      `${LOG_PREFIX} Building DOCX with ${sections.length} sections, ` +
        `primary_color=${brandConfig.primary_color || 'default'}, ` +
        `font=${brandConfig.font_family || 'Calibri'}`
    )

    const doc = buildDocxDocument(proposal as Proposal, sections, brandConfig)
    const buffer = await docx.Packer.toBuffer(doc)

    const uint8Array = new Uint8Array(buffer)
    let binaryString = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i])
    }
    const docxBase64 = btoa(binaryString)

    const sanitizedTitle = (proposal.title || 'proposal')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .substring(0, 50)
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `${sanitizedTitle}-${dateStr}.docx`

    console.log(
      `${LOG_PREFIX} DOCX generated successfully: ${filename} (${Math.round(uint8Array.length / 1024)}KB)`
    )

    return new Response(
      JSON.stringify({
        docx_base64: docxBase64,
        filename,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error(`${LOG_PREFIX} Unexpected error:`, error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
