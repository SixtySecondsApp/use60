# Professional Proposal Generator — Progress

## Feature: proposal-generator
## Plan: `.sixty/plan-proposal-generator.json`
## Started: 2026-02-06
## Last Updated: 2026-02-06

---

### Phase 1: Core Generation Engine (16 stories) — COMPLETE

| Story | Title | Status |
|-------|-------|--------|
| REL-001 | Chunked transcript processing | Pre-existing |
| REL-002 | Retry logic with exponential backoff | Pre-existing |
| REL-003 | Structured JSON output validation | Pre-existing |
| REL-004 | Stream generation progress via Realtime | Pre-existing |
| SCH-001 | Proposals table structured columns | Pre-existing |
| SCH-002 | proposal_templates table with RLS | Pre-existing |
| SCH-003 | proposal_assets table and storage | Pre-existing |
| DOC-001 | DOCX generation edge function | Pre-existing |
| DOC-002 | PDF generation edge function | Pre-existing |
| DOC-003 | Download DOCX/PDF from frontend | Implemented |
| BRD-001 | fetch-logo edge function | Pre-existing |
| BRD-002 | Logo upload to proposal_assets | Pre-existing |
| BRD-003 | Logo resolution chain with fallback | Implemented |
| PRV-001 | ProposalPreview component | Pre-existing |
| PRV-002 | Inline editing and section reordering | Implemented |
| WIZ-001 | Step 4 format selection | Pre-existing |
| WIZ-002 | Brand config panel in Step 5 | Implemented |
| WIZ-003 | Download buttons and progress in Step 6 | Implemented |

### Phase 2: Templates & Branding (3 stories) — COMPLETE

| Story | Title | Status |
|-------|-------|--------|
| TPL-001 | Save proposal as reusable template | Implemented |
| TPL-002 | Template selection pre-populates wizard | Implemented |
| PRC-001 | Pricing table extraction instructions | Implemented |

### Phase 3: Starter Templates & Polish (2 stories) — COMPLETE

| Story | Title | Status |
|-------|-------|--------|
| STR-001 | 5 built-in starter templates seed migration | Implemented |
| STR-002 | Template management UI (view, edit, delete, duplicate) | Implemented |

### Phase 4: Upload Example → Auto-Create Template (5 stories) — COMPLETE

| Story | Title | Status |
|-------|-------|--------|
| UPL-001 | Expand storage bucket for document uploads | Implemented |
| UPL-002 | proposal-parse-document edge function (DOCX/PDF → AI) | Implemented |
| UPL-003 | Service functions: uploadAndParseDocument, createTemplateFromExtraction | Implemented |
| UPL-004 | TemplateUploader + TemplateExtractReview components | Implemented |
| UPL-005 | Integration into TemplateManager + wizard template picker | Implemented |

---

### Files Created (Phase 1-3)
- `src/components/proposals/ProposalPreview.tsx` (full rewrite)
- `src/components/proposals/BrandConfigPanel.tsx`
- `src/components/proposals/SaveTemplateModal.tsx`
- `src/components/proposals/TemplateManager.tsx`
- `supabase/migrations/20260207000000_proposal_starter_templates.sql`

### Files Created (Phase 4)
- `supabase/migrations/20260207100000_upload_to_template_schema.sql`
- `supabase/functions/proposal-parse-document/index.ts`
- `src/components/proposals/TemplateUploader.tsx`
- `src/components/proposals/TemplateExtractReview.tsx`

### Files Modified (Phase 1-3)
- `src/lib/services/proposalService.ts` — download, logo resolution, saveAsTemplate, structured template CRUD
- `src/components/proposals/ProposalWizard.tsx` — brand config, download buttons, progress, template pre-population
- `src/lib/prompts/proposalGeneration.ts` — pricing extraction instructions
- `src/pages/settings/ProposalSettings.tsx` — added Templates tab with TemplateManager

### Files Modified (Phase 4)
- `src/lib/services/proposalService.ts` — uploadAndParseDocument, createTemplateFromExtraction, TemplateExtraction type
- `src/components/proposals/TemplateManager.tsx` — upload flow (TemplateUploader → TemplateExtractReview), "Upload Example" button
- `src/components/proposals/ProposalWizard.tsx` — "Upload Example" card in template picker, inline upload + auto-select

### Summary
All 28 stories across 4 phases complete. 13 were pre-existing, 15 implemented across two sessions.
