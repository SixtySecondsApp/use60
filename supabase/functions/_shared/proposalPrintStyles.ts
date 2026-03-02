// supabase/functions/_shared/proposalPrintStyles.ts
// CSS print media queries and brand-aware styles for Gotenberg PDF generation (GOT-003)

export interface PrintBrandConfig {
  primary_color: string;
  secondary_color: string;
  font_family: string;
}

/**
 * Returns CSS as a string, parameterized by brand config.
 * Designed for professional PDF output via Gotenberg/Chromium.
 *
 * Includes:
 *  - @page rules for A4 paper with proper margins
 *  - Page break control (section breaks, orphans/widows)
 *  - Cover page layout with brand bar and metadata
 *  - Typography hierarchy (h1–h3, body copy)
 *  - Pricing table styles with branded header row and alternating rows
 *  - Header/footer with logo and CSS-counter page numbers
 *  - Print-specific rules (hide interactives, expand link URLs)
 */
export function getProposalPrintCSS(brandConfig: PrintBrandConfig): string {
  const { primary_color, secondary_color, font_family } = brandConfig;

  // Derive a readable light tint of the secondary color for alternating rows
  // We keep this pure CSS to avoid runtime color math in Deno.
  const secondaryLight = `color-mix(in srgb, ${secondary_color} 15%, white)`;
  const primaryLight = `color-mix(in srgb, ${primary_color} 12%, white)`;

  return `
/* ============================================================
   PROPOSAL PRINT CSS — GOT-003
   Designed for Gotenberg (Chromium) → A4 PDF
   ============================================================ */

/* ---------- Counter setup for page numbers ---------- */
html {
  counter-reset: page-number;
}

/* ---------- Base reset & typography ---------- */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  font-family: ${font_family}, Inter, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: #1a1a2e;
  background: #ffffff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ---------- @page rules — A4 ---------- */
@page {
  size: 210mm 297mm;
  margin: 15mm 20mm 20mm 20mm;

  @top-right {
    content: element(running-header);
    vertical-align: middle;
  }

  @bottom-center {
    content: "Page " counter(page) " of " counter(pages);
    font-family: ${font_family}, Inter, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10px;
    color: #9ca3af;
  }
}

@page cover-page {
  margin: 0;
}

/* ---------- Running header (logo) ---------- */
#running-header {
  position: running(running-header);
  display: flex;
  align-items: center;
  gap: 8px;
  height: 12mm;
  padding-right: 0;
}

#running-header .header-logo {
  height: 28px;
  width: auto;
  object-fit: contain;
}

#running-header .header-company-name {
  font-size: 11px;
  font-weight: 600;
  color: ${primary_color};
  letter-spacing: 0.03em;
}

/* ---------- Cover page ---------- */
.cover-page {
  page: cover-page;
  page-break-after: always;
  display: flex;
  flex-direction: column;
  min-height: 297mm;
  position: relative;
  background: #ffffff;
}

.cover-brand-bar {
  height: 8mm;
  background-color: ${primary_color};
  width: 100%;
  flex-shrink: 0;
}

.cover-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 25mm 20mm 20mm 20mm;
  text-align: center;
  gap: 16px;
}

.cover-logo {
  height: 64px;
  width: auto;
  object-fit: contain;
  margin-bottom: 8px;
}

.cover-company-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: ${primary_color};
}

.cover-title {
  font-size: 34px;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
  max-width: 420px;
  margin: 0 auto;
}

.cover-subtitle {
  font-size: 16px;
  color: #6b7280;
  margin-top: 4px;
}

.cover-meta {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.cover-meta-row {
  font-size: 13px;
  color: #374151;
}

.cover-meta-row strong {
  color: #111827;
  font-weight: 600;
}

.cover-date {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 8px;
}

.cover-reference {
  font-size: 10px;
  color: #d1d5db;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.08em;
}

.cover-footer-bar {
  height: 3mm;
  background-color: ${secondary_color};
  width: 100%;
  flex-shrink: 0;
}

/* ---------- Table of contents ---------- */
.toc-section {
  page-break-after: always;
  padding: 12mm 0 8mm 0;
}

.toc-title {
  font-size: 22px;
  font-weight: 700;
  color: ${primary_color};
  border-bottom: 2px solid ${secondary_color};
  padding-bottom: 8px;
  margin-bottom: 20px;
}

.toc-list {
  list-style: none;
  padding: 0;
}

.toc-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: #374151;
  border-bottom: 1px dashed #e5e7eb;
}

.toc-item-number {
  font-weight: 600;
  color: ${primary_color};
  min-width: 24px;
}

.toc-item-title {
  flex: 1;
}

.toc-item-page {
  font-size: 11px;
  color: #9ca3af;
}

/* ---------- Content sections ---------- */
.proposal-section {
  page-break-before: always;
  padding: 0 0 10mm 0;
  orphans: 3;
  widows: 3;
}

.proposal-section:first-of-type {
  page-break-before: auto;
}

.section-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid ${secondaryLight};
}

.section-accent-bar {
  width: 4px;
  height: 32px;
  border-radius: 2px;
  background-color: ${primary_color};
  flex-shrink: 0;
  margin-top: 4px;
}

.section-title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
}

.section-content {
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
}

/* ---------- Heading hierarchy within content ---------- */
.section-content h1,
h1 {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
  margin: 20px 0 10px;
  line-height: 1.25;
}

.section-content h2,
h2 {
  font-size: 22px;
  font-weight: 700;
  color: ${primary_color};
  margin: 18px 0 8px;
  line-height: 1.3;
}

.section-content h3,
h3 {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 14px 0 6px;
  line-height: 1.4;
}

.section-content h4,
h4 {
  font-size: 15px;
  font-weight: 600;
  color: #374151;
  margin: 10px 0 4px;
}

.section-content p,
p {
  margin: 0 0 10px;
}

.section-content ul,
.section-content ol {
  margin: 8px 0 12px 20px;
}

.section-content li {
  margin-bottom: 4px;
}

.section-content strong {
  font-weight: 600;
  color: #111827;
}

.section-content em {
  font-style: italic;
}

.section-content a {
  color: ${primary_color};
  text-decoration: underline;
}

.section-content blockquote {
  border-left: 4px solid ${secondary_color};
  padding: 8px 16px;
  margin: 12px 0;
  background: ${secondaryLight};
  border-radius: 0 4px 4px 0;
  color: #4b5563;
  font-style: italic;
}

/* ---------- Tables (generic) ---------- */
table {
  width: 100%;
  border-collapse: collapse;
  page-break-inside: avoid;
  margin: 12px 0;
  font-size: 13px;
}

figure {
  page-break-inside: avoid;
}

thead {
  background-color: ${primary_color};
  color: #ffffff;
}

thead th {
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

tbody tr:nth-child(even) {
  background-color: ${primaryLight};
}

tbody tr:nth-child(odd) {
  background-color: #ffffff;
}

tbody td {
  padding: 9px 14px;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: top;
}

tfoot tr {
  background-color: #f9fafb;
  font-weight: 700;
}

tfoot td {
  padding: 10px 14px;
  border-top: 2px solid ${primary_color};
}

/* ---------- Pricing table (specific) ---------- */
.pricing-table {
  width: 100%;
  border-collapse: collapse;
  page-break-inside: avoid;
  margin: 16px 0;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
}

.pricing-table thead {
  background-color: ${primary_color};
}

.pricing-table thead th {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 700;
  color: #ffffff;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.pricing-table tbody tr:nth-child(even) {
  background-color: ${primaryLight};
}

.pricing-table tbody tr:nth-child(odd) {
  background-color: #ffffff;
}

.pricing-table tbody td {
  padding: 10px 16px;
  font-size: 13px;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: middle;
}

.pricing-table .price-col {
  text-align: right;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
}

.pricing-table tfoot tr {
  background-color: #f3f4f6;
}

.pricing-table tfoot td {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  border-top: 2px solid ${primary_color};
}

.pricing-table tfoot .price-col {
  color: ${primary_color};
  font-size: 16px;
}

/* ---------- Timeline section ---------- */
.timeline-list {
  list-style: none;
  padding: 0;
  position: relative;
}

.timeline-item {
  display: flex;
  gap: 16px;
  padding: 8px 0;
  page-break-inside: avoid;
}

.timeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.timeline-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background-color: ${primary_color};
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 2px ${primary_color};
  flex-shrink: 0;
  margin-top: 3px;
}

.timeline-line {
  width: 2px;
  flex: 1;
  background-color: ${secondary_color};
  margin: 4px auto 0;
}

.timeline-content {
  flex: 1;
  padding-bottom: 16px;
}

.timeline-phase {
  font-size: 12px;
  font-weight: 700;
  color: ${primary_color};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 2px;
}

.timeline-description {
  font-size: 13px;
  color: #4b5563;
}

/* ---------- Terms section ---------- */
.terms-section ol {
  padding-left: 20px;
}

.terms-section li {
  margin-bottom: 8px;
  font-size: 13px;
  color: #4b5563;
}

/* ---------- Page break utilities ---------- */
.page-break-before {
  page-break-before: always;
}

.page-break-after {
  page-break-after: always;
}

.no-page-break {
  page-break-inside: avoid;
}

/* ---------- Print-specific rules ---------- */
@media print {
  /* Hide any interactive / screen-only elements */
  .no-print,
  button,
  nav,
  .nav,
  .sidebar,
  [role="navigation"],
  [role="toolbar"],
  input,
  select,
  textarea {
    display: none !important;
  }

  /* Show full URLs after links */
  a[href]::after {
    content: " (" attr(href) ")";
    font-size: 10px;
    color: #9ca3af;
    word-break: break-all;
  }

  /* Avoid page breaks inside key elements */
  table, figure, blockquote, img {
    page-break-inside: avoid;
  }

  /* Orphan/widow control globally */
  p {
    orphans: 3;
    widows: 3;
  }

  /* Ensure images don't overflow */
  img {
    max-width: 100%;
    height: auto;
  }

  /* Preserve brand colors when printing */
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
}
`.trim();
}

/**
 * Returns the full default HTML template string with {{variable}} placeholders.
 * Used by the template engine (templateEngine.ts) to generate proposal HTML
 * when no custom template is provided.
 *
 * Placeholders supported:
 *  - {{metadata.proposal_title}}, {{metadata.client_name}}, {{metadata.client_company}}
 *  - {{metadata.prepared_by}}, {{metadata.prepared_date}}, {{metadata.reference_number}}
 *  - {{brand.logo_url}}, {{brand.company_name}} (optional)
 *  - {{embedded_css}} — injected by generateProposalHTML()
 *  - {{#each sections}}...{{/each}} — section loop
 *  - {{section.title}}, {{section.content}}, {{section.type}}, {{section.order}}
 */
export function getDefaultProposalTemplate(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{metadata.proposal_title}}</title>
  <style>
{{embedded_css}}
  </style>
</head>
<body>

  <!-- Running header (used by @page named string for headers/footers) -->
  <div id="running-header">
    {{#if brand.logo_url}}
    <img class="header-logo" src="{{brand.logo_url}}" alt="{{metadata.prepared_by}}" />
    {{/if}}
    <span class="header-company-name">{{metadata.prepared_by}}</span>
  </div>

  <!-- ======================================================
       COVER PAGE
       ====================================================== -->
  <div class="cover-page">
    <div class="cover-brand-bar"></div>

    <div class="cover-body">
      {{#if brand.logo_url}}
      <img class="cover-logo" src="{{brand.logo_url}}" alt="{{metadata.prepared_by}} logo" />
      {{/if}}

      <p class="cover-company-label">{{metadata.prepared_by}}</p>

      <h1 class="cover-title">{{metadata.proposal_title}}</h1>

      <p class="cover-subtitle">Proposal</p>

      <div class="cover-meta">
        <p class="cover-meta-row">Prepared for <strong>{{metadata.client_name}}</strong></p>
        <p class="cover-meta-row">{{metadata.client_company}}</p>
        <p class="cover-date">{{metadata.prepared_date}}</p>
        <p class="cover-reference">Ref: {{metadata.reference_number}}</p>
      </div>
    </div>

    <div class="cover-footer-bar"></div>
  </div>

  <!-- ======================================================
       TABLE OF CONTENTS
       ====================================================== -->
  <div class="toc-section">
    <h2 class="toc-title">Contents</h2>
    <ul class="toc-list">
    {{#each sections}}
    {{#unless section.type_is_cover}}
      <li class="toc-item">
        <span class="toc-item-number">{{section.order}}</span>
        <span class="toc-item-title">{{section.title}}</span>
      </li>
    {{/unless}}
    {{/each}}
    </ul>
  </div>

  <!-- ======================================================
       PROPOSAL SECTIONS
       ====================================================== -->
  {{#each sections}}
  {{#unless section.type_is_cover}}
  <div class="proposal-section" data-section-type="{{section.type}}">
    <div class="section-header">
      <div class="section-accent-bar"></div>
      <h2 class="section-title">{{section.title}}</h2>
    </div>
    <div class="section-content">
      {{section.content}}
    </div>
  </div>
  {{/unless}}
  {{/each}}

</body>
</html>`.trim();
}
