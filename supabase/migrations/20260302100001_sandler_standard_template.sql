-- Migration: GOT-004 — Sandler Standard default HTML template
-- Adds html_template, css_styles, and section_schema columns to proposal_templates,
-- then seeds the 'Sandler Standard' platform default template (org_id = NULL).
-- Date: 2026-03-02

-- ============================================================================
-- 1. ADD NEW COLUMNS (idempotent)
-- ============================================================================

-- html_template: full HTML string with {{variable}} placeholders for the template engine
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'html_template'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN html_template text;
  END IF;
END $$;

-- css_styles: print-optimised CSS injected into the template <style> block
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'css_styles'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN css_styles text;
  END IF;
END $$;

-- section_schema: JSON array defining the ordered section slots this template supports
-- e.g. [{"id":"cover","type":"cover","title":"Cover","required":true,"order":0}, ...]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'section_schema'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN section_schema jsonb;
  END IF;
END $$;

COMMENT ON COLUMN proposal_templates.html_template IS 'Full HTML template string with {{variable}} placeholders; processed by templateEngine.ts mergeTemplate(). NULL = use programmatic default from proposalPrintStyles.ts.';
COMMENT ON COLUMN proposal_templates.css_styles IS 'Print-optimised CSS injected into the template <style> block as supplemental styles. NULL = no extra CSS.';
COMMENT ON COLUMN proposal_templates.section_schema IS 'JSON array of section slot definitions: [{id, type, title, required, order}]. Drives section creation during proposal generation.';

-- ============================================================================
-- 2. SEED SANDLER STANDARD (idempotent — skips if already present)
-- ============================================================================

DO $OUTER$
BEGIN
  -- Delete any prior version so we can re-seed with the updated template
  DELETE FROM proposal_templates
    WHERE name = 'Sandler Standard' AND org_id IS NULL;

  INSERT INTO proposal_templates (
    name,
    type,
    content,
    description,
    org_id,
    category,
    is_default,
    html_template,
    css_styles,
    section_schema,
    sections,
    brand_config
  )
  VALUES (
    'Sandler Standard',
    'proposal',
    'V2 Sandler Standard — uses html_template column',

    'The flagship 60 proposal template. Full-width brand cover with metadata card, structured 8-section layout with left accent bar, professional pricing tables, vertical timeline milestones, action-item next steps with checkboxes, and company stats row. Renders as a pixel-perfect A4 PDF via Gotenberg.',

    NULL,   -- platform default — visible to all orgs

    'starter',

    true,   -- is_default

    -- html_template: full Sandler Standard HTML ({{embedded_css}} injected by generateProposalHTML)
    $TEMPLATE$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{metadata.proposal_title}}</title>
  <style>
{{embedded_css}}

/* ============================================================
   SANDLER STANDARD — Template-Specific Overrides
   Builds on the base print CSS from proposalPrintStyles.ts / proposal-print.css
   Targeted at Gotenberg headless Chromium → A4 PDF
   ============================================================ */

/* ---------- Cover page — full-bleed brand treatment ---------- */
.ss-cover {
  page: cover-page;
  page-break-after: always;
  display: flex;
  flex-direction: column;
  min-height: 297mm;
  background: #ffffff;
  overflow: hidden;
}

.ss-cover-brand-bar {
  height: 10mm;
  background: {{brand.primary_color}};
  width: 100%;
  flex-shrink: 0;
}

.ss-cover-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20mm 25mm;
  text-align: center;
}

.ss-cover-logo {
  height: 72px;
  width: auto;
  max-width: 240px;
  object-fit: contain;
  margin-bottom: 14px;
}

.ss-cover-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: {{brand.primary_color}};
  margin-bottom: 18px;
}

.ss-cover-divider {
  width: 48px;
  height: 3px;
  background: {{brand.primary_color}};
  border-radius: 2px;
  margin: 0 auto 22px auto;
}

.ss-cover-title {
  font-size: 38px;
  font-weight: 800;
  color: #111827;
  line-height: 1.12;
  max-width: 480px;
  margin: 0 auto 10px auto;
  letter-spacing: -0.025em;
}

.ss-cover-subtitle {
  font-size: 16px;
  font-weight: 400;
  color: #6b7280;
  margin-bottom: 32px;
}

.ss-cover-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 20px 28px;
  text-align: left;
  max-width: 380px;
  width: 100%;
}

.ss-cover-card-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px 0;
  font-size: 13px;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
}

.ss-cover-card-row:last-child {
  border-bottom: none;
}

.ss-cover-card-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #9ca3af;
  min-width: 90px;
}

.ss-cover-card-value {
  font-weight: 600;
  color: #111827;
  text-align: right;
  flex: 1;
  padding-left: 12px;
}

.ss-cover-ref {
  font-size: 10px;
  color: #d1d5db;
  font-family: 'SF Mono', 'Courier New', monospace;
  letter-spacing: 0.08em;
  margin-top: 20px;
}

.ss-cover-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 6mm 20mm;
  border-top: 1px solid #f3f4f6;
  flex-shrink: 0;
}

.ss-cover-footer-brand {
  height: 3mm;
  background: {{brand.secondary_color}};
  width: 100%;
  flex-shrink: 0;
}

.ss-cover-conf {
  font-size: 10px;
  color: #d1d5db;
  letter-spacing: 0.04em;
}

/* ---------- Table of contents ---------- */
.ss-toc {
  page-break-after: always;
  padding: 10mm 0 8mm 0;
}

.ss-toc-heading {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: {{brand.primary_color}};
  margin-bottom: 6px;
}

.ss-toc-rule {
  height: 2px;
  background: linear-gradient(to right, {{brand.primary_color}}, {{brand.secondary_color}});
  border: none;
  margin-bottom: 20px;
  border-radius: 1px;
}

.ss-toc-list { list-style: none; padding: 0; margin: 0; }

.ss-toc-item {
  display: flex;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px dashed #e5e7eb;
  gap: 10px;
}

.ss-toc-num {
  font-size: 11px;
  font-weight: 700;
  color: {{brand.primary_color}};
  min-width: 22px;
  flex-shrink: 0;
}

.ss-toc-label {
  font-size: 13px;
  color: #374151;
  font-weight: 500;
}

.ss-toc-dots {
  flex: 1;
  border-bottom: 1px dotted #d1d5db;
  margin: 0 8px;
  align-self: center;
  height: 1px;
}

/* ---------- Section layout ---------- */
.ss-section {
  page-break-before: always;
  padding: 0 0 12mm 0;
  orphans: 3;
  widows: 3;
}

.ss-section-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f3f4f6;
}

.ss-accent-bar {
  width: 4px;
  height: 32px;
  border-radius: 2px;
  background: {{brand.primary_color}};
  flex-shrink: 0;
}

.ss-section-title {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
  letter-spacing: -0.01em;
  margin: 0;
}

.ss-section-num {
  font-size: 11px;
  font-weight: 700;
  color: {{brand.primary_color}};
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.ss-section-body {
  font-size: 14px;
  line-height: 1.75;
  color: #374151;
}

.ss-section-body p { margin: 0 0 12px; }
.ss-section-body ul, .ss-section-body ol { margin: 8px 0 14px 22px; }
.ss-section-body li { margin-bottom: 5px; }

.ss-section-body h3 {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
  margin: 18px 0 8px;
}

.ss-section-body h4 {
  font-size: 15px;
  font-weight: 600;
  color: #374151;
  margin: 14px 0 6px;
}

/* Executive summary — larger body text */
.ss-section[data-section-type="executive_summary"] .ss-section-body {
  font-size: 15px;
  line-height: 1.8;
}

/* ---------- Callout box ---------- */
.ss-callout {
  background: color-mix(in srgb, {{brand.primary_color}} 4%, white);
  border-left: 4px solid {{brand.primary_color}};
  border-radius: 0 8px 8px 0;
  padding: 14px 18px;
  margin: 16px 0;
  page-break-inside: avoid;
}

.ss-callout p { margin: 0; font-size: 14px; color: #1f2937; }
.ss-callout p + p { margin-top: 8px; }

.ss-callout-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: {{brand.primary_color}};
  margin-bottom: 6px;
}

.ss-callout-case-study {
  background: #fefce8;
  border-left-color: #eab308;
}

.ss-callout-case-study .ss-callout-label { color: #a16207; }

/* ---------- Feature-benefit grid ---------- */
.ss-feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 16px 0;
}

.ss-feature-card {
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  page-break-inside: avoid;
}

.ss-feature-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
}

.ss-feature-desc {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.ss-feature-card::before {
  content: "";
  display: block;
  width: 24px;
  height: 3px;
  background: {{brand.primary_color}};
  border-radius: 2px;
  margin-bottom: 10px;
}

/* ---------- Pricing table ---------- */
.ss-pricing-wrapper { margin: 18px 0; }

.ss-pricing-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9ca3af;
  margin-bottom: 8px;
}

.ss-pricing-table {
  width: 100%;
  border-collapse: collapse;
  page-break-inside: avoid;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
}

.ss-pricing-table thead { background: {{brand.primary_color}}; }

.ss-pricing-table thead th {
  padding: 12px 16px;
  font-size: 11px;
  font-weight: 700;
  color: #ffffff;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-align: left;
}

.ss-pricing-table thead th:last-child { text-align: right; }

.ss-pricing-table tbody tr:nth-child(even) {
  background: color-mix(in srgb, {{brand.primary_color}} 4%, white);
}

.ss-pricing-table tbody td {
  padding: 10px 16px;
  font-size: 13px;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: middle;
}

.ss-pricing-table .ss-price-amount {
  text-align: right;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ss-pricing-table .ss-item-desc small {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

.ss-total-row {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 20px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 2px solid {{brand.primary_color}};
}

.ss-total-label {
  font-size: 13px;
  font-weight: 700;
  color: #374151;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ss-total-value {
  font-size: 22px;
  font-weight: 800;
  color: {{brand.primary_color}};
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.ss-payment-terms {
  margin-top: 14px;
  padding: 12px 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
}

.ss-payment-terms strong { color: #374151; }

/* ---------- Timeline milestones ---------- */
.ss-timeline { list-style: none; padding: 0; margin: 16px 0; }

.ss-timeline-item {
  display: flex;
  gap: 18px;
  page-break-inside: avoid;
  position: relative;
}

.ss-timeline-spine {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 20px;
}

.ss-timeline-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: {{brand.primary_color}};
  border: 3px solid #ffffff;
  box-shadow: 0 0 0 2px {{brand.primary_color}};
  flex-shrink: 0;
  margin-top: 2px;
}

.ss-timeline-connector {
  width: 2px;
  flex: 1;
  background: #e5e7eb;
  margin: 6px auto 0;
  min-height: 20px;
}

.ss-timeline-item:last-child .ss-timeline-connector { display: none; }

.ss-timeline-content { flex: 1; padding-bottom: 22px; }

.ss-milestone-phase {
  font-size: 10px;
  font-weight: 700;
  color: {{brand.primary_color}};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 2px;
}

.ss-milestone-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 2px;
}

.ss-milestone-dates {
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 4px;
}

.ss-milestone-detail {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.55;
}

.ss-milestone-deliverables { list-style: none; padding: 0; margin-top: 6px; }

.ss-milestone-deliverables li {
  font-size: 12px;
  color: #374151;
  padding-left: 14px;
  position: relative;
  margin-bottom: 3px;
}

.ss-milestone-deliverables li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 6px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: {{brand.secondary_color}};
}

/* ---------- Next steps — action items ---------- */
.ss-action-list { list-style: none; padding: 0; margin: 14px 0; }

.ss-action-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 8px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  page-break-inside: avoid;
}

.ss-action-checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid {{brand.primary_color}};
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 1px;
}

.ss-action-body { flex: 1; }

.ss-action-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 2px;
}

.ss-action-meta { font-size: 12px; color: #9ca3af; }
.ss-action-owner { font-weight: 600; color: {{brand.primary_color}}; }

/* ---------- Stats / key metrics ---------- */
.ss-stats-row {
  display: flex;
  gap: 14px;
  margin: 18px 0;
  page-break-inside: avoid;
}

.ss-stat-card {
  flex: 1;
  text-align: center;
  padding: 16px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}

.ss-stat-value {
  font-size: 26px;
  font-weight: 800;
  color: {{brand.primary_color}};
  line-height: 1;
  margin-bottom: 4px;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.ss-stat-label {
  font-size: 10px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

/* ---------- Team grid ---------- */
.ss-team-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin: 16px 0;
}

.ss-team-member {
  text-align: center;
  padding: 14px 10px;
  page-break-inside: avoid;
}

.ss-team-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #e5e7eb;
  margin: 0 auto 8px auto;
  display: block;
}

.ss-team-name { font-size: 13px; font-weight: 600; color: #111827; }
.ss-team-role { font-size: 11px; color: #9ca3af; }

/* ---------- Signature block ---------- */
.ss-signature-block {
  margin-top: 20mm;
  page-break-inside: avoid;
  display: flex;
  gap: 40px;
}

.ss-sig-party { flex: 1; }

.ss-sig-label {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 28px;
}

.ss-sig-line {
  border-top: 1px solid #374151;
  padding-top: 8px;
}

.ss-sig-name { font-size: 13px; font-weight: 600; color: #111827; }
.ss-sig-role { font-size: 12px; color: #6b7280; }

.ss-sig-date-line {
  margin-top: 20px;
  border-top: 1px dashed #d1d5db;
  padding-top: 6px;
  font-size: 11px;
  color: #9ca3af;
}

/* ---------- Confidentiality notice ---------- */
.ss-conf-notice {
  margin-top: 8mm;
  padding-top: 6mm;
  border-top: 1px solid #f3f4f6;
  font-size: 10px;
  color: #d1d5db;
  line-height: 1.5;
  text-align: center;
}
  </style>
</head>
<body>

  <!-- Running header — used by @page named string for repeating headers -->
  <div id="running-header">
    {{#if brand.logo_url}}
    <img class="header-logo" src="{{brand.logo_url}}" alt="{{metadata.prepared_by}}" />
    {{/if}}
    <span class="header-company-name">{{metadata.prepared_by}}</span>
  </div>

  <!-- ============================================================
       COVER PAGE
       ============================================================ -->
  <div class="ss-cover">
    <div class="ss-cover-brand-bar"></div>

    <div class="ss-cover-body">
      {{#if brand.logo_url}}
      <img class="ss-cover-logo" src="{{brand.logo_url}}" alt="{{metadata.prepared_by}}" />
      {{/if}}

      <p class="ss-cover-eyebrow">{{metadata.prepared_by}}</p>

      <div class="ss-cover-divider"></div>

      <h1 class="ss-cover-title">{{metadata.proposal_title}}</h1>
      <p class="ss-cover-subtitle">Proposal</p>

      <div class="ss-cover-card">
        <div class="ss-cover-card-row">
          <span class="ss-cover-card-label">Prepared for</span>
          <span class="ss-cover-card-value">{{metadata.client_name}}</span>
        </div>
        <div class="ss-cover-card-row">
          <span class="ss-cover-card-label">Company</span>
          <span class="ss-cover-card-value">{{metadata.client_company}}</span>
        </div>
        <div class="ss-cover-card-row">
          <span class="ss-cover-card-label">Prepared by</span>
          <span class="ss-cover-card-value">{{metadata.prepared_by}}</span>
        </div>
        <div class="ss-cover-card-row">
          <span class="ss-cover-card-label">Date</span>
          <span class="ss-cover-card-value">{{metadata.prepared_date}}</span>
        </div>
      </div>

      <p class="ss-cover-ref">Ref: {{metadata.reference_number}}</p>
    </div>

    <div class="ss-cover-footer">
      <span class="ss-cover-conf">Confidential &mdash; prepared exclusively for {{metadata.client_company}}</span>
    </div>

    <div class="ss-cover-footer-brand"></div>
  </div>

  <!-- ============================================================
       TABLE OF CONTENTS
       ============================================================ -->
  <div class="ss-toc">
    <p class="ss-toc-heading">Contents</p>
    <hr class="ss-toc-rule" />
    <ul class="ss-toc-list">
    {{#each sections}}
    {{#unless section.type_is_cover}}
      <li class="ss-toc-item">
        <span class="ss-toc-num">{{section.order}}</span>
        <span class="ss-toc-label">{{section.title}}</span>
        <span class="ss-toc-dots"></span>
      </li>
    {{/unless}}
    {{/each}}
    </ul>
  </div>

  <!-- ============================================================
       PROPOSAL SECTIONS
       ============================================================ -->
  {{#each sections}}
  {{#unless section.type_is_cover}}
  <div class="ss-section" data-section-type="{{section.type}}" id="section-{{section.id}}">
    <div class="ss-section-header">
      <div class="ss-accent-bar"></div>
      <div>
        <p class="ss-section-num">Section {{section.order}}</p>
        <h2 class="ss-section-title">{{section.title}}</h2>
      </div>
    </div>
    <div class="ss-section-body">
      {{section.content}}
    </div>
  </div>
  {{/unless}}
  {{/each}}

  <!-- ============================================================
       CONFIDENTIALITY NOTICE
       ============================================================ -->
  <div class="ss-conf-notice">
    This document is confidential and has been prepared exclusively for {{metadata.client_company}}.
    It contains proprietary information belonging to {{metadata.prepared_by}} and may not be
    reproduced, distributed, or disclosed to any third party without prior written consent.
    &copy; {{metadata.prepared_by}}. All rights reserved.
  </div>

</body>
</html>$TEMPLATE$,

    -- css_styles: supplemental CSS stored separately for reference / overrides
    -- The full CSS is embedded inside the html_template <style> block above.
    -- Base print CSS is generated dynamically by getProposalPrintCSS() at render time.
    $CSS$/* Sandler Standard — supplemental CSS (stored for reference/overrides) */
/* Full CSS is embedded inside the html_template <style> block. */
/* Base print CSS is generated dynamically by getProposalPrintCSS() at render time. */$CSS$,

    -- section_schema: the canonical 8-section order for the Sandler Standard template
    '[
      {"id":"cover",     "type":"cover",             "title":"Cover",             "required":true,  "order":0},
      {"id":"exec",      "type":"executive_summary",  "title":"Executive Summary", "required":true,  "order":1},
      {"id":"problem",   "type":"problem",            "title":"The Challenge",     "required":false, "order":2},
      {"id":"solution",  "type":"solution",            "title":"Our Solution",      "required":true,  "order":3},
      {"id":"pricing",   "type":"pricing",             "title":"Investment",        "required":true,  "order":4},
      {"id":"timeline",  "type":"timeline",            "title":"Timeline",          "required":false, "order":5},
      {"id":"terms",     "type":"terms",               "title":"Next Steps",        "required":true,  "order":6},
      {"id":"about",     "type":"custom",              "title":"About Us",          "required":false, "order":7}
    ]'::jsonb,

    -- sections: default placeholder content for each section (AI replaces these)
    '[
      {"id":"cover",    "type":"cover",             "title":"Cover",             "content":"",                                                                                                                                  "order":0},
      {"id":"exec",     "type":"executive_summary", "title":"Executive Summary", "content":"<p>A concise overview of the proposed engagement, the key outcomes you can expect, and why now is the right time to move forward.</p><div class=\"ss-callout\"><p class=\"ss-callout-label\">Key Outcome</p><p>The single most important result this engagement will deliver for your business.</p></div>","order":1},
      {"id":"problem",  "type":"problem",           "title":"The Challenge",     "content":"<p>A clear articulation of the challenges and pain points we identified during our conversations.</p><ul><li>Challenge one — the gap between where you are and where you need to be</li><li>Challenge two — the operational friction slowing your team down</li><li>Challenge three — the opportunity cost of inaction</li></ul>","order":2},
      {"id":"solution", "type":"solution",          "title":"Our Solution",      "content":"<p>The specific solution we are proposing, how it directly addresses your challenges, and the tangible outcomes it will deliver.</p><div class=\"ss-feature-grid\"><div class=\"ss-feature-card\"><p class=\"ss-feature-title\">Feature</p><p class=\"ss-feature-desc\">How this capability maps to your specific requirement and the benefit it delivers.</p></div><div class=\"ss-feature-card\"><p class=\"ss-feature-title\">Feature</p><p class=\"ss-feature-desc\">How this capability maps to your specific requirement and the benefit it delivers.</p></div></div>","order":3},
      {"id":"pricing",  "type":"pricing",           "title":"Investment",        "content":"<div class=\"ss-pricing-wrapper\"><p class=\"ss-pricing-label\">Investment Breakdown</p><table class=\"ss-pricing-table\"><thead><tr><th>Item</th><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td class=\"ss-item-desc\">Line item<small>Supporting detail</small></td><td>Description of deliverable</td><td class=\"ss-price-amount\">$0,000</td></tr></tbody></table><div class=\"ss-total-row\"><span class=\"ss-total-label\">Total Investment</span><span class=\"ss-total-value\">$0,000</span></div></div><div class=\"ss-payment-terms\"><strong>Payment Terms:</strong> Details of payment schedule and conditions.</div>","order":4},
      {"id":"timeline", "type":"timeline",          "title":"Timeline",          "content":"<ul class=\"ss-timeline\"><li class=\"ss-timeline-item\"><div class=\"ss-timeline-spine\"><div class=\"ss-timeline-dot\"></div><div class=\"ss-timeline-connector\"></div></div><div class=\"ss-timeline-content\"><p class=\"ss-milestone-phase\">Phase 1</p><p class=\"ss-milestone-title\">Milestone Title</p><p class=\"ss-milestone-dates\">Week 1-2</p><p class=\"ss-milestone-detail\">Description of this phase and its deliverables.</p><ul class=\"ss-milestone-deliverables\"><li>Deliverable one</li><li>Deliverable two</li></ul></div></li><li class=\"ss-timeline-item\"><div class=\"ss-timeline-spine\"><div class=\"ss-timeline-dot\"></div><div class=\"ss-timeline-connector\"></div></div><div class=\"ss-timeline-content\"><p class=\"ss-milestone-phase\">Phase 2</p><p class=\"ss-milestone-title\">Milestone Title</p><p class=\"ss-milestone-dates\">Week 3-4</p><p class=\"ss-milestone-detail\">Description of this phase and its deliverables.</p></div></li></ul>","order":5},
      {"id":"terms",    "type":"terms",             "title":"Next Steps",        "content":"<p>To move forward, here are the immediate actions:</p><ul class=\"ss-action-list\"><li class=\"ss-action-item\"><div class=\"ss-action-checkbox\"></div><div class=\"ss-action-body\"><p class=\"ss-action-title\">Action item</p><p class=\"ss-action-meta\">Owner: <span class=\"ss-action-owner\">Name</span> &middot; By: Date</p></div></li><li class=\"ss-action-item\"><div class=\"ss-action-checkbox\"></div><div class=\"ss-action-body\"><p class=\"ss-action-title\">Action item</p><p class=\"ss-action-meta\">Owner: <span class=\"ss-action-owner\">Name</span> &middot; By: Date</p></div></li></ul><div class=\"ss-signature-block\"><div class=\"ss-sig-party\"><p class=\"ss-sig-label\">For the Client</p><div class=\"ss-sig-line\"><p class=\"ss-sig-name\">&nbsp;</p><p class=\"ss-sig-role\">&nbsp;</p></div><p class=\"ss-sig-date-line\">Date: _______________</p></div><div class=\"ss-sig-party\"><p class=\"ss-sig-label\">For the Provider</p><div class=\"ss-sig-line\"><p class=\"ss-sig-name\">&nbsp;</p><p class=\"ss-sig-role\">&nbsp;</p></div><p class=\"ss-sig-date-line\">Date: _______________</p></div></div>","order":6},
      {"id":"about",    "type":"custom",            "title":"About Us",          "content":"<p>A brief overview of the company, its mission, and why it is uniquely qualified to deliver this engagement.</p><div class=\"ss-stats-row\"><div class=\"ss-stat-card\"><p class=\"ss-stat-value\">100+</p><p class=\"ss-stat-label\">Clients Served</p></div><div class=\"ss-stat-card\"><p class=\"ss-stat-value\">10+</p><p class=\"ss-stat-label\">Years Experience</p></div><div class=\"ss-stat-card\"><p class=\"ss-stat-value\">98%</p><p class=\"ss-stat-label\">Satisfaction Rate</p></div></div>","order":7}
    ]'::jsonb,

    -- brand_config: conservative default — works with any brand override
    '{"primary_color":"#1e40af","secondary_color":"#64748b","font_family":"Inter, system-ui, sans-serif"}'::jsonb
  );

  RAISE NOTICE 'Seeded Sandler Standard platform default template (GOT-004)';
END $OUTER$;

-- ============================================================================
-- Done
-- ============================================================================

NOTIFY pgrst, 'reload schema';
