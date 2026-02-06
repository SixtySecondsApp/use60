# Feature Brief: Professional Proposal Generator

**Product:** use60 Platform
**Owner:** Andrew Bryce
**Date:** 6 February 2026
**Status:** Specification | **Version:** 1.0 | **Target Release:** Q1 2026

---

## Executive Summary

use60 currently generates proposals through a 6-step wizard (Meetings → Focus → Goals → Format → Config → Preview) that produces basic SOW overviews or simple HTML proposals. Users have consistently reported that the output quality is insufficient for client-facing use, requiring significant manual rework before sending.

This feature will upgrade the proposal generator to produce professionally branded, multi-format documents (DOCX, PDF, and live HTML preview) that are ready to send immediately after generation. The system will leverage AI to auto-structure proposals from meeting transcript data, apply client branding via Logo.dev integration, and support reusable templates for recurring proposal types.

---

## Problem Statement

The current proposal generator suffers from several critical limitations:

- Output is limited to basic SOW text or unstyled HTML — neither is suitable for direct client delivery
- No brand customisation: proposals lack client logos, colour schemes, or professional typography
- No template system: users rebuild proposal structures from scratch for every engagement
- Single output format with no DOCX or PDF export, forcing users to manually recreate proposals in Word or Google Docs
- The `proposal-analyze` Edge Function is unreliable, frequently returning non-2xx status codes and timing out on longer transcripts
- No logo management or asset storage for client organisations

These limitations mean that the proposal feature, while conceptually strong, delivers minimal time savings and often creates more work than it eliminates.

---

## Goals & Success Metrics

### Goals

1. Produce client-ready, professionally branded proposals directly from meeting transcripts with zero manual formatting required
2. Support multiple output formats (DOCX download, PDF download, and live HTML preview) from a single generation
3. Enable template reuse so recurring proposal types (training programmes, consulting engagements, SaaS onboarding) can be generated in seconds
4. Automatically fetch and apply client logos and branding via Logo.dev with manual override
5. Resolve Edge Function reliability issues to achieve consistent proposal generation under 30 seconds

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Proposals sent without manual rework | <10% | >80% |
| Time from transcript to sent proposal | 45–90 min | <5 min |
| Edge Function success rate | ~70% | >98% |
| Template reuse rate | 0% (no templates) | >50% of proposals |
| Proposal generation time (p95) | 60s+ (with failures) | <30s |

---

## User Experience

### Revised Wizard Flow

The existing 6-step wizard is retained but enhanced at key stages:

**Step 1 — Meetings:** Unchanged. Select one or more meeting transcripts as source material.

**Step 2 — Focus:** Unchanged. Choose key topics and pain points from the transcript analysis.

**Step 3 — Goals:** Unchanged. Define the objectives the proposal will address.

**Step 4 — Format: Enhanced.** Select from saved templates or start fresh. Choose output format (DOCX, PDF, or HTML). Toggle client branding on/off.

**Step 5 — Config: Enhanced.** Review auto-populated client logo (via Logo.dev or manual upload). Adjust brand colours. Set proposal sections and ordering. Configure pricing tables.

**Step 6 — Preview & Export: New.** Live HTML preview with real-time editing. One-click DOCX or PDF download. Save as template for future use.

---

## Technical Architecture

### Hybrid Server-Client Model

The architecture follows a hybrid approach: heavy computation runs server-side via Supabase Edge Functions, while instant preview rendering happens client-side for real-time feedback.

**Server-side (Edge Functions):**
- AI content generation: transcript analysis, section writing, pricing extraction
- DOCX assembly via `docx` npm package (server-side Node.js)
- PDF generation from DOCX via conversion pipeline
- Logo fetching from Logo.dev API and caching

**Client-side (React / Next.js):**
- Live HTML preview rendering from the same structured data
- Real-time section reordering and inline text editing
- Template selection and configuration UI

### Edge Function Improvements

The current `proposal-analyze` function will be refactored to address reliability:

- **Chunked AI calls:** Break transcript processing into segments to avoid the 150-second Edge Function timeout
- **Retry logic with exponential backoff:** 1s → 3s → 9s intervals on failure
- **Structured JSON output from AI:** Enforce schema validation on generated content before document assembly
- **Progress streaming via Supabase Realtime:** Push status updates to the client during generation

### Logo Integration (Logo.dev)

Logo resolution follows a priority hierarchy:

1. Manually uploaded logo in `proposal_assets` table (highest priority)
2. Template-stored logo (if a saved template includes one)
3. Logo.dev domain lookup using the client's email domain
4. Text-only fallback rendering the company name in styled typography

---

## Data Model

New and modified tables in Supabase (Postgres):

### `proposal_templates`
- `id` (UUID, PK), `org_id` (FK → organisations), `name`, `description`
- `sections` (JSONB) — ordered array of section definitions with content placeholders
- `brand_config` (JSONB) — colours, fonts, logo reference
- `created_at`, `updated_at`, `created_by` (FK → users)

### `proposal_assets`
- `id` (UUID, PK), `proposal_id` (FK → proposals), `org_id` (FK → organisations)
- `asset_type` (enum: logo, image, attachment)
- `storage_path` — Supabase Storage path: `/proposals/{user_id}/{proposal_id}/`
- `source` (enum: upload, logo_dev, template)

### `proposals` (modifications to existing table)
- Add: `template_id` (FK → proposal_templates, nullable)
- Add: `output_format` (enum: docx, pdf, html)
- Add: `brand_config` (JSONB) — overrides from template
- Add: `sections` (JSONB) — generated content per section
- Add: `generation_status` (enum: pending, processing, complete, failed)

All tables enforce Row Level Security (RLS) scoped to `org_id` for multi-tenant isolation.

---

## Requirements

### Document Generation

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| PG-01 | Generate structured DOCX proposals from meeting transcript data with professional formatting (headers, tables, page breaks) | Must Have | 1 |
| PG-02 | Generate PDF output from the same structured data | Must Have | 1 |
| PG-03 | Render live HTML preview that updates in real-time as users edit sections | Must Have | 1 |
| PG-04 | AI generates full proposal structure and content (fully automated, not just assisted) | Must Have | 1 |
| PG-05 | Support inline editing of AI-generated content before export | Should Have | 1 |
| PG-06 | Include pricing/investment tables auto-populated from transcript data | Should Have | 2 |

### Branding & Templates

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| BT-01 | Fetch client logos automatically via Logo.dev domain lookup | Must Have | 1 |
| BT-02 | Allow manual logo upload with drag-and-drop to override auto-fetched logos | Must Have | 1 |
| BT-03 | Save any proposal as a reusable template (sections, branding, layout) | Must Have | 2 |
| BT-04 | Apply saved templates when creating new proposals via the Format step | Must Have | 2 |
| BT-05 | Support custom brand colour schemes per proposal (primary, secondary, accent) | Should Have | 2 |
| BT-06 | Provide 3–5 built-in starter templates (Training, Consulting, SaaS, Retainer, Custom) | Nice to Have | 3 |

### Reliability & Performance

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| RP-01 | Refactor proposal-analyze Edge Function with chunked AI processing to avoid 150s timeout | Must Have | 1 |
| RP-02 | Implement retry logic with exponential backoff (1s, 3s, 9s) on AI call failures | Must Have | 1 |
| RP-03 | Stream generation progress to client via Supabase Realtime | Should Have | 1 |
| RP-04 | Achieve >98% Edge Function success rate (up from ~70%) | Must Have | 1 |
| RP-05 | Complete proposal generation in <30 seconds (p95) | Should Have | 2 |

---

## Phased Delivery Plan

### Phase 1 — Core Generation Engine (Weeks 1–3)

- Refactor `proposal-analyze` Edge Function with chunked processing and retry logic
- Implement DOCX generation using `docx` npm package server-side
- Implement PDF export pipeline
- Build live HTML preview component
- Integrate Logo.dev API with priority fallback chain
- Updated wizard steps 4–6 with format selection and preview

### Phase 2 — Templates & Branding (Weeks 4–5)

- Build `proposal_templates` and `proposal_assets` database schema and RLS policies
- Save-as-template functionality from completed proposals
- Template selection UI in wizard Step 4
- Brand colour customisation per proposal
- Auto-populated pricing/investment tables from transcript extraction

### Phase 3 — Polish & Starter Templates (Week 6)

- Create 3–5 built-in starter templates for common proposal types
- Template management UI (view, edit, delete, duplicate)
- Analytics: track proposal generation count, template usage, and export formats
- QA and load testing on Edge Functions

---

## Risks & Dependencies

| Risk | Description | Mitigation |
|------|-------------|------------|
| 🔴 High | Edge Function 150s timeout may still be insufficient for very long transcripts (60+ min meetings) | Chunk transcripts into 15-min segments; process in parallel; stitch results |
| 🟡 Medium | Logo.dev API rate limits or downtime could delay proposal generation | Cache fetched logos in proposal_assets; text fallback renders immediately |
| 🟡 Medium | DOCX rendering inconsistencies across Word, Google Docs, and Pages | Test across all three; use DXA units exclusively; avoid percentage widths |
| 🟢 Low | Template schema evolution as new proposal types are added | Use JSONB for flexible section storage; version templates |

---

## Out of Scope (v1)

- E-signature integration (DocuSign, PandaDoc) — potential Phase 4
- Multi-language proposal generation
- Collaborative real-time editing (Google Docs-style)
- CRM integration for auto-populating client data (Bullhorn, HubSpot)
- Proposal analytics / tracking (opens, views, time spent)

---

## Immediate Action Items

| Owner | Action | Priority | Status |
|-------|--------|----------|--------|
| Dev Team | Audit current proposal-analyze Edge Function; document failure modes and timeout patterns | P0 | To Do |
| Andrew | Obtain Logo.dev API key and confirm rate limits / pricing tier | P0 | To Do |
| Dev Team | Spike: Test docx npm package in Supabase Edge Function (Deno) environment | P0 | To Do |
| Max | Design updated wizard steps 4–6 with format selection, brand config, and preview | P1 | To Do |
| Andrew | Collect 5 example proposals from existing clients to use as template seeds | P1 | To Do |