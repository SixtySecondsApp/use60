// supabase/functions/_shared/templateEngine.ts
// Server-side HTML template engine for proposal PDF generation (GOT-002)
// Merges ProposalSection[] data into an HTML template using lightweight
// {{variable}} substitution — no Handlebars import required in Deno.

import { getProposalPrintCSS, getDefaultProposalTemplate } from './proposalPrintStyles.ts'

// =============================================================================
// Types
// =============================================================================

export interface ProposalSection {
  id: string
  type:
    | 'cover'
    | 'executive_summary'
    | 'problem'
    | 'solution'
    | 'approach'
    | 'timeline'
    | 'pricing'
    | 'terms'
    | 'custom'
  title: string
  content: string // HTML content — already sanitized upstream
  order: number
}

export interface TemplateContext {
  sections: ProposalSection[]
  brandConfig: {
    primary_color: string
    secondary_color: string
    font_family: string
    logo_url: string | null
    header_style?: string
  }
  metadata: {
    proposal_title: string
    client_name: string
    client_company: string
    prepared_by: string
    prepared_date: string
    reference_number: string
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Escape special HTML characters in a plain-text value.
 * Section content is intentionally excluded from this — it is already HTML.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Build a flat substitution map from a TemplateContext.
 * Keys use dot-notation matching the template placeholders.
 *
 * Note: section.content values are NOT HTML-escaped because the content is
 * already trusted HTML produced by the proposal generator.
 * All other values ARE escaped to prevent XSS in metadata fields.
 */
function buildSubstitutionMap(context: TemplateContext): Record<string, string> {
  const { metadata, brandConfig } = context

  const map: Record<string, string> = {
    // Metadata
    'metadata.proposal_title': escapeHtml(metadata.proposal_title),
    'metadata.client_name': escapeHtml(metadata.client_name),
    'metadata.client_company': escapeHtml(metadata.client_company),
    'metadata.prepared_by': escapeHtml(metadata.prepared_by),
    'metadata.prepared_date': escapeHtml(metadata.prepared_date),
    'metadata.reference_number': escapeHtml(metadata.reference_number),

    // Brand
    'brand.primary_color': escapeHtml(brandConfig.primary_color),
    'brand.secondary_color': escapeHtml(brandConfig.secondary_color),
    'brand.font_family': escapeHtml(brandConfig.font_family),
    'brand.logo_url': brandConfig.logo_url ? escapeHtml(brandConfig.logo_url) : '',
    'brand.header_style': brandConfig.header_style ? escapeHtml(brandConfig.header_style) : '',
  }

  return map
}

/**
 * Replace all simple {{key}} placeholders in a template string.
 * Processes dot-notation keys; unknown keys are left intact rather than
 * silently replaced with an empty string (aids debugging).
 */
function substituteVariables(
  template: string,
  substitutions: Record<string, string>,
): string {
  return template.replace(/\{\{([^#/][^}]*)\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim()

    // Skip block helpers — handled separately
    if (key.startsWith('#') || key.startsWith('/') || key.startsWith('!')) {
      return match
    }

    if (Object.prototype.hasOwnProperty.call(substitutions, key)) {
      return substitutions[key]
    }

    // Return the original placeholder so callers can detect missing keys
    return match
  })
}

/**
 * Render a per-section template block for one ProposalSection.
 * Within the block, {{section.title}}, {{section.content}}, {{section.type}},
 * {{section.order}}, {{section.type_is_cover}} are substituted.
 *
 * section.content is injected as raw HTML.
 * All other section fields are HTML-escaped.
 */
function renderSectionBlock(blockTemplate: string, section: ProposalSection): string {
  const sectionSubs: Record<string, string> = {
    'section.title': escapeHtml(section.title),
    'section.content': section.content, // raw HTML — do not escape
    'section.type': escapeHtml(section.type),
    'section.order': String(section.order),
    'section.id': escapeHtml(section.id),
    'section.type_is_cover': section.type === 'cover' ? 'true' : '',
  }

  let rendered = substituteVariables(blockTemplate, sectionSubs)

  // Handle {{#unless section.type_is_cover}}...{{/unless}}
  rendered = processUnlessBlocks(rendered, sectionSubs)

  // Handle {{#if brand.logo_url}} etc. inside section blocks
  // (these will have been resolved by the outer pass already, but guard here)
  rendered = processIfBlocks(rendered, sectionSubs)

  return rendered
}

/**
 * Process {{#each sections}}...{{/each}} blocks.
 * Iterates context.sections in order and renders one copy of the block per
 * section, with section-scoped substitutions applied.
 */
function processSectionLoop(template: string, sections: ProposalSection[]): string {
  const EACH_RE = /\{\{#each sections\}\}([\s\S]*?)\{\{\/each\}\}/g

  return template.replace(EACH_RE, (_match, blockTemplate: string) => {
    const sorted = [...sections].sort((a, b) => a.order - b.order)
    return sorted.map((section) => renderSectionBlock(blockTemplate, section)).join('\n')
  })
}

/**
 * Process {{#if key}}...{{/if}} blocks.
 * A block is rendered when the substitution value is truthy (non-empty string).
 */
function processIfBlocks(
  template: string,
  substitutions: Record<string, string>,
): string {
  const IF_RE = /\{\{#if ([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g

  return template.replace(IF_RE, (_match, rawKey: string, inner: string) => {
    const key = rawKey.trim()
    const value = substitutions[key]
    return value ? inner : ''
  })
}

/**
 * Process {{#unless key}}...{{/unless}} blocks.
 * A block is rendered when the substitution value is falsy (empty string / undefined).
 */
function processUnlessBlocks(
  template: string,
  substitutions: Record<string, string>,
): string {
  const UNLESS_RE = /\{\{#unless ([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g

  return template.replace(UNLESS_RE, (_match, rawKey: string, inner: string) => {
    const key = rawKey.trim()
    const value = substitutions[key]
    return !value ? inner : ''
  })
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Merge proposal data into an HTML template string.
 *
 * Processing order:
 *  1. {{#if ...}} / {{#unless ...}} blocks (using top-level substitution map)
 *  2. {{#each sections}} loops (renders per-section, handles nested blocks)
 *  3. Simple {{variable}} substitution for remaining placeholders
 *
 * @param htmlTemplate - Raw HTML string with {{variable}} placeholders
 * @param context      - The proposal context containing sections, brandConfig, metadata
 * @returns            - Merged HTML string ready for Gotenberg
 */
export function mergeTemplate(htmlTemplate: string, context: TemplateContext): string {
  const substitutions = buildSubstitutionMap(context)

  // Step 1: resolve top-level {{#if}} / {{#unless}} blocks
  let result = processIfBlocks(htmlTemplate, substitutions)
  result = processUnlessBlocks(result, substitutions)

  // Step 2: resolve {{#each sections}} loops
  result = processSectionLoop(result, context.sections)

  // Step 3: replace all remaining simple {{variable}} placeholders
  result = substituteVariables(result, substitutions)

  return result
}

/**
 * Generate a complete HTML document from sections and brand config.
 *
 * Uses the default template from proposalPrintStyles.ts unless a custom
 * template string is provided. Embeds brand-aware CSS into the <head>.
 *
 * @param context        - Proposal context (sections, brandConfig, metadata)
 * @param customTemplate - Optional override HTML template with {{placeholders}}
 * @returns              - A self-contained HTML string ready for Gotenberg
 */
export function generateProposalHTML(
  context: TemplateContext,
  customTemplate?: string,
): string {
  const template = customTemplate ?? getDefaultProposalTemplate()

  // Generate brand-aware CSS and inject it into the template as {{embedded_css}}
  const css = getProposalPrintCSS({
    primary_color: context.brandConfig.primary_color,
    secondary_color: context.brandConfig.secondary_color,
    font_family: context.brandConfig.font_family,
  })

  // Pre-inject the CSS before the main merge pass so that {{embedded_css}}
  // is handled by the simple substituteVariables step.
  const contextWithCss: TemplateContext = context
  const substitutionsWithCss = {
    ...buildSubstitutionMap(contextWithCss),
    embedded_css: css, // raw CSS — no HTML escaping needed inside <style>
  }

  // Run the full merge pipeline
  const substitutions = substitutionsWithCss

  // Step 1: section loops FIRST — renderSectionBlock handles section-scoped
  // {{#unless section.type_is_cover}} blocks correctly per-section.
  // Running this before top-level if/unless prevents the top-level pass from
  // stripping section-scoped conditionals prematurely.
  let result = processSectionLoop(template, context.sections)

  // Step 2: top-level if/unless blocks (e.g. {{#if brand.logo_url}})
  result = processIfBlocks(result, substitutions)
  result = processUnlessBlocks(result, substitutions)

  // Step 3: scalar substitutions (includes embedded_css)
  result = substituteVariables(result, substitutions)

  return result
}

// =============================================================================
// buildProposalHtml — alias matching the GOT-002 interface spec
// =============================================================================

/**
 * Build a complete, self-contained HTML document ready for Gotenberg.
 * Alias of generateProposalHTML using the GOT-002 interface signature.
 *
 * @param sections    Ordered list of ProposalSection objects
 * @param brandConfig Brand configuration (primary_color, secondary_color, font_family, logo_url)
 * @param metadata    Proposal metadata (title, client name, dates, etc.)
 * @param templateHtml Optional custom HTML template (defaults to getDefaultProposalTemplate())
 */
export function buildProposalHtml(
  sections: ProposalSection[],
  brandConfig: TemplateContext['brandConfig'],
  metadata: TemplateContext['metadata'],
  templateHtml?: string,
): string {
  return generateProposalHTML({ sections, brandConfig, metadata }, templateHtml)
}

// =============================================================================
// Utilities re-exported for convenience
// =============================================================================

export { escapeHtml }
