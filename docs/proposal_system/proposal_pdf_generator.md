# PRD-PG-002: Proposal Generation Engine V2

**From Wizard to Pipeline: One-Click, Context-Rich, Pixel-Perfect Proposals**

| Field | Value |
|-------|-------|
| Author | Andrew Bryce, CEO |
| Date | March 2026 |
| Status | Draft -- V2 Upgrade Specification |
| Ref | PRD-PG-002 |
| Priority | P1 -- Revenue Feature |
| Supersedes | PRD-PG-001 (V1 -- 28 stories complete) |

---

## 1. Problem Statement

### The Original Problem

Sales reps spend 30--45 minutes writing each follow-up proposal after a meeting. The context is fresh but scattered across CRM fields, meeting transcripts, enrichment data, and internal notes. By the time the proposal is drafted, momentum has cooled.

### What V1 Already Delivers

V1 shipped 28 stories and established the foundational infrastructure:

- **ProposalWizard.tsx** (128KB, 8-step flow) -- a guided wizard that walks reps through proposal creation with AI-assisted section generation
- **generate-proposal** edge function with multi-action orchestrator (`analyze_focus_areas`, `generate_goals`, `generate_sow`, `generate_proposal`, `stream_proposal`, `get_job_status`, `process_job`)
- **ProposalSection interface** with 9 section types: `cover | executive_summary | problem | solution | approach | timeline | pricing | terms | custom` (defined in `src/components/proposals/ProposalPreview.tsx`)
- **PDF/DOCX generation** via `proposal-generate-docx` and `proposal-generate-pdf` edge functions -- but using pdf-lib, which produces 3/10 quality output
- **ProposalPreview** with inline editing, section reordering, and HTML content rendering
- **Template system**: `SaveTemplateModal`, `TemplateManager`, `TemplateUploader`, `TemplateExtractReview`, 5 starter templates, upload-to-template via `proposal-parse-document` (DOCX/PDF to AI-extracted template structure)
- **Logo.dev integration** via `fetch-logo` edge function, branding pipeline with resolution chain
- **Database tables**: `proposals` (with `template_id`, `output_format`, `brand_config`, `sections`, `generation_status`), `proposal_templates` (with `org_id`, `sections`, `brand_config`, `category`, `created_by`), `proposal_jobs`, `proposal_assets`
- **RLS policies**: proposal_templates are org-scoped -- users see global + org + personal templates
- **Orchestrator integration**: `detectProposalIntentAdapter` (PROP-001) detects `send_proposal` intent from `detect-intents` output, requires `deal_id`, calls `generate-proposal` async; `proposalApprovalAdapter` (PROP-002) creates `hitl_pending_approvals`, sends Slack DM with `[Approve & Send] [Edit in 60] [Skip]` buttons, pauses the sequence (both in `supabase/functions/_shared/orchestrator/adapters/proposalGenerator.ts`)
- **Sequence wiring** in `supabase/functions/_shared/orchestrator/eventSequences.ts`: `meeting_ended` -> `classify-call-type` -> `detect-intents` -> `detect-proposal-intent` (PROP-001) -> `proposal-approval` (PROP-002, HITL gate)
- **Intent registry** in `supabase/functions/_shared/orchestrator/intentActionRegistry.ts`: `send_proposal` -> `{ task_type: 'follow_up', deliverable_type: 'proposal', auto_generate: true, orchestrator_event: 'proposal_generation', confidence_threshold: 0.7 }`
- **Writing style analysis**: `analyze-writing-style` edge function + `WritingStyleTrainingService` (in `src/lib/services/writingStyleTrainingService.ts`) -- fetches Gmail sent emails, analyzes with Claude, extracts style fingerprint
- **Tone settings**: `user_tone_settings` table + `toneSettingsService.ts` (in `src/lib/services/toneSettingsService.ts`) -- stores per-content-type tone configuration with formality, emoji usage, brand voice, sample phrases, words to avoid/prefer
- **Autopilot infrastructure**: `autopilot_signals` table, `SIGNAL_WEIGHTS`, `RUBBER_STAMP_THRESHOLDS` (in `supabase/functions/_shared/autopilot/signals.ts`)
- **Credit governance**: `creditLedger.ts` (client-side, in `src/lib/services/creditLedger.ts`), `costTracking.ts` (server-side via `logAICostEvent`, `checkCreditBalance` in `supabase/functions/_shared/costTracking.ts`)
- **3 copilot skills**: `proposal` (`skills/atomic/proposal/SKILL.md`), `proposal-generator` (`skills/atomic/proposal-generator/SKILL.md`), `copilot-proposal` (`skills/atomic/copilot-proposal/SKILL.md`)

### The V2 Opportunity

V1 is wizard-based: the rep clicks through 8 steps, making decisions at each stage. V2 transforms this into a pipeline-based system where one click fires a 5-stage pipeline that assembles context from 8 sources, composes sections with Claude, merges into branded HTML, renders to pixel-perfect PDF via Gotenberg, and delivers via Slack -- all in under 60 seconds.

The key gaps V2 addresses:

1. **PDF quality**: pdf-lib produces basic text layout (3/10). Gotenberg renders real CSS and print media queries (8-9/10).
2. **Style intelligence**: `user_tone_settings` and `analyze-writing-style` exist but are NOT wired into proposal generation. V2 connects them.
3. **Offering knowledge**: Proposals reference the org's products and services, but there is no structured data source. V2 adds an offering profile extracted from uploaded collateral.
4. **UX friction**: The 8-step wizard is thorough but slow. V2 makes one-click the primary path and keeps the wizard as "Customise" for power users.
5. **Trigger coverage**: PROP-001 (post-meeting auto) and PROP-002 (Slack approval) exist. V2 adds the meetings page button, copilot consolidation, and Slack command triggers.

### Competitive Advantage

What makes 60 different from Sendr.ai, Ironclaw, and Qwilr: we already own the meeting transcript, the CRM data, the contact enrichment, the deal memory, and the conversation history. We can generate proposals that no standalone tool can match because the context is already inside the system.

---

## 2. Solution Overview

### 5-Stage Pipeline Architecture

| # | Stage | What Happens | Data Sources | Credits | Latency |
|---|-------|--------------|--------------|---------|---------|
| 1 | **Context Assembly** | Gather all relevant data for the deal, contact, meeting, style, and offerings into a single typed context payload | 8 data sources (see Section 3) | 0 (DB reads only) | 2--3s |
| 2 | **AI Composition** | Claude Sonnet generates structured proposal content as JSON sections matching the template schema, calibrated to the user's style fingerprint | Assembled context + template schema + style fingerprint | 3--5 credits | 8--12s |
| 3 | **Template Merge** | Merge AI-generated JSON sections into branded HTML template with org logo, colours, fonts, and CSS print layout | `proposal_templates` table, `org_settings`, AI output JSON | 0 (template engine) | 1--2s |
| 4 | **PDF Render** | Convert branded HTML to production PDF via Gotenberg (headless Chromium) on Railway | Merged HTML document | 0 (infra cost only) | 2--4s |
| 5 | **Deliver** | Store PDF in S3, create activity record, notify via Slack with download link, update proposal status | Generated PDF, CRM context | 0.5 credits | 1--2s |

**Total pipeline time: 15--25 seconds.** Target: under 60 seconds end-to-end including queue time.

### 4 Trigger Points (All V1)

All four triggers ship simultaneously. This was a deliberate V1 decision -- there is no reason to gate any trigger behind another.

| Trigger | How It Works | Autonomy | Infrastructure |
|---------|--------------|----------|----------------|
| **Post-meeting auto** | Fires via `meeting_ended` sequence. PROP-001 (`detectProposalIntentAdapter`) detects `send_proposal` intent, kicks off pipeline. PROP-002 (`proposalApprovalAdapter`) sends Slack HITL. | Confidence-gated via autopilot | Already wired in `eventSequences.ts` -- update to use V2 pipeline |
| **Meetings page button** | `ProposalQuickGenerate` button on meeting detail view. One click fires the 5-stage pipeline with `ProposalProgressOverlay`. | Manual trigger | New component |
| **Copilot chat** | "Write a proposal for the Acme meeting" -- consolidated `generate-proposal-v2` skill triggers pipeline | Copilot routing at 0.7 threshold | Consolidate 3 existing skills |
| **Slack command** | "@60 write proposal for deal X" -- existing `proposal_request` intent handler in `slack-copilot`, updated to use V2 pipeline | Slack intent | Update existing handler |

### UX Philosophy

**One-click primary, wizard as "Customise" advanced path.** The `ProposalQuickGenerate` button fires the full pipeline with zero configuration. The existing `ProposalWizard.tsx` (128KB, 8-step flow) remains accessible via a "Customise" link for reps who want to select a specific template, adjust sections, tweak branding, or override pricing before generation.

---

## 3. Context Assembly Pipeline

The quality of the proposal is directly proportional to the richness of the context. Stage 1 assembles a comprehensive payload from 8 data sources before the AI sees anything.

### 8 Data Sources

| # | Source | Data Loaded | Table / API | Fallback | Status |
|---|--------|-------------|-------------|----------|--------|
| 1 | **Deal Context** | Deal name, stage, value, close date, custom fields, owner, deal memory events | `deals` + `deal_custom_fields` + `deal_memory_events` | Omit section if no deal linked | Partially exists in PROP-001 |
| 2 | **Contact Profile** | Name, title, company, email, phone, LinkedIn, last interaction, role inference | `contacts` + `activities` + `contact_org_history` | Use attendee name from calendar | Partially exists in PROP-001 |
| 3 | **Meeting Transcript** | Full transcript, AI summary, highlights, action items, speaker map | `meetings` + process-recording output | Use meeting notes if no recording | Exists -- PROP-001 uses 5k char substring |
| 4 | **Company Research** | Industry, size, tech stack, recent news, competitors, funding | Apollo enrichment (`apollo-enrich`) + Apify (`apify-news-scan`) | Skip section, note as "limited data" | Exists via enrichment pipeline |
| 5 | **Conversation History** | Previous meetings, emails, deal progression, relationship score | `activities` + `meetings` + `tasks` + `relationship_graph` | First-meeting template variant | Exists in orchestrator tier2 context |
| 6 | **Org Preferences** | Tone of voice, pricing model, product descriptions, case studies, brand config | `org_settings` + `proposal_templates.brand_config` | Platform defaults | Exists |
| 7 | **Style Fingerprint** | User's writing tone, formality, directness, warmth, sentence patterns, sign-off style, words to avoid | `user_tone_settings` + uploaded proposal examples (via `proposal-parse-document`) + edit history learning | Default professional tone | **NEW** -- tables exist, not wired to proposals |
| 8 | **Offering Profile** | Structured product/service descriptions, case studies, pricing models, differentiators | `org_offering_profiles` (new table) | Use org_settings.value_propositions | **NEW** -- schema and extraction needed |

### Transcript Handling

If the transcript exceeds 15k tokens, use the `process-recording` Claude summary rather than the raw transcript. This saves credits and improves signal-to-noise. The existing PROP-001 adapter already truncates to 5k characters; V2 increases this to the full 15k token budget.

### Context Payload Structure

The assembled context is a typed JSON object passed to the AI composition stage. Maximum context window target: **30k tokens** (leaves room for template schema, style instructions, and generation prompts within Claude's context window).

```typescript
interface ProposalContextPayload {
  deal: {
    id: string;
    name: string;
    value: number | null;
    stage: string;
    expected_close_date: string | null;
    custom_fields: Record<string, unknown>;
    memory_events: Array<{ category: string; content: string }>;
  };
  contact: {
    id: string;
    name: string;
    title: string | null;
    company: string | null;
    email: string | null;
    role_inference: string | null;
  };
  transcript: {
    summary: string;
    highlights: string[];
    action_items: string[];
    pain_points: string[];
    pricing_discussion: string | null;
    commitments: Array<{ type: string; phrase: string }>;
  };
  company: {
    industry: string | null;
    size: string | null;
    tech_stack: string[];
    recent_news: string[];
    competitors: string[];
  };
  conversation_history: {
    meeting_count: number;
    last_email_date: string | null;
    relationship_score: number | null;
    key_interactions: string[];
  };
  org_preferences: {
    tone_of_voice: string;
    brand_config: Record<string, unknown>;
    pricing_model: string | null;
  };
  style_fingerprint: {
    formality: number;
    directness: number;
    warmth: number;
    preferred_length: 'brief' | 'moderate' | 'detailed';
    sentence_patterns: string[];
    words_to_avoid: string[];
    sign_off_style: string | null;
    source: 'email_analysis' | 'proposal_examples' | 'edit_learning' | 'compound';
  };
  offering_profile: {
    products: Array<{ name: string; description: string; pricing: string | null }>;
    services: Array<{ name: string; description: string; pricing: string | null }>;
    case_studies: Array<{ title: string; outcome: string; industry: string }>;
    differentiators: string[];
  };
}
```

---

## 4. AI Composition Engine

The AI composition stage uses Claude Sonnet to generate structured proposal content. The output is a JSON object matching the `ProposalSection` schema -- not freeform text. This ensures consistent formatting and allows template-level control over layout.

### Section Schema (Default Template)

| # | Section | Type Enum | Content Generated | Data Sources Used |
|---|---------|-----------|-------------------|-------------------|
| 1 | **Cover Page** | `cover` | Proposal title, client name, your name, date, reference number | Deal + contact + org_settings |
| 2 | **Executive Summary** | `executive_summary` | 2--3 paragraph summary: what was discussed, what was agreed, what comes next | Transcript summary + action items + style fingerprint |
| 3 | **Understanding** | `problem` | Restate the client's problem/needs as discussed in the meeting, using their language | Transcript highlights + pain points + conversation history |
| 4 | **Proposed Solution** | `solution` | How your product/service addresses their needs, mapped to their language | Offering profile + transcript context + case studies |
| 5 | **Investment** | `pricing` | Pricing table, payment terms, package details (3 tiers when applicable) | Deal value + offering profile pricing models |
| 6 | **Timeline** | `timeline` | Implementation timeline with milestones | Org templates + deal close date + action items |
| 7 | **Next Steps** | `custom` (subtype: `next_steps`) | Specific actions with owners and dates | Meeting action items + deal stage + commitments |
| 8 | **About Us** | `custom` (subtype: `about_us`) | Company overview, credentials, case studies | Offering profile + org_settings |

### ProposalSection Type (Existing)

Already defined in `src/components/proposals/ProposalPreview.tsx`:

```typescript
export interface ProposalSection {
  id: string;
  type:
    | 'cover'
    | 'executive_summary'
    | 'problem'
    | 'solution'
    | 'approach'
    | 'timeline'
    | 'pricing'
    | 'terms'
    | 'custom';
  title: string;
  content: string; // HTML content
  order: number;
}
```

Also mirrored in `supabase/functions/generate-proposal/index.ts` (lines 67--72) with the same shape.

### Model Selection

Claude Sonnet 4.5 for composition (best quality for client-facing documents). The model router is already configured for proposal tasks -- `generateCustomSectionsAdapter` currently uses `claude-haiku-4-5-20251001` for cost efficiency; V2 elevates the main composition call to Sonnet for quality. Estimated 3--5 credits per generation at ~4k output tokens.

### Tone Calibration

The AI prompt includes a compound style fingerprint built from three sources:

1. **Email analysis** (`user_tone_settings` populated by `analyze-writing-style`) -- formality, directness, warmth, sentence patterns
2. **Uploaded proposal examples** (via `proposal-parse-document`) -- structural patterns, section ordering, language style from the user's own past proposals
3. **Edit learning** (new) -- when a user edits a generated proposal before sending, track the edit distance and direction of changes to refine the fingerprint over time

If no style data exists, defaults to: "professional, consultative, confident but not aggressive." Users can override per-proposal via copilot: "make it more formal" or "keep it casual."

### Credit Governance

Every AI call flows through `costTracking.ts` (`logAICostEvent`, `checkCreditBalance`). Feature key: `proposal_generation`. Intelligence tier: `high` (uses the org's configured intelligence tier from `ai_feature_config`). Budget check runs before Stage 2 -- if budget exhausted, proposal enters "queued" status and retries on next budget cycle.

Credit breakdown per proposal:
- Stage 2 (AI Composition): 3--5 credits (Sonnet, ~4k output tokens)
- Stage 5 (Delivery notification): 0.5 credits (if AI-assisted notification copy)
- **Total: 3.5--5.5 credits per proposal**

---

## 5. Template System

### Existing Architecture (KEEP)

The template system is already built and functional:

- **`proposal_templates` table**: org-scoped with `org_id`, `sections` (JSONB section definitions), `brand_config` (JSONB: colors, fonts, logo), `category` (starter / org / personal), `created_by`, `source_document_id` (FK to `proposal_assets` for uploaded templates)
- **`proposal_assets` table**: stores logos, images, attachments, fonts, and uploaded documents. Storage bucket: `proposal-assets` (private, 15MB limit). Path convention: `{org_id}/{user_id}/{asset_id}/{filename}`
- **RLS policies**: users see global (org_id IS NULL) + their org's + personal templates. Insert/update scoped to org membership.
- **Section registry**: JSON column in `proposal_templates.sections` defines available sections, ordering, required flags, and prompt hints per template
- **UI components**: `TemplateManager`, `TemplateUploader`, `TemplateExtractReview`, `SaveTemplateModal`, `LogoUploader`, `BrandConfigPanel`

### What Is New for V2

Existing HTML templates stay. V2 adds **CSS print media queries** optimized for Gotenberg's headless Chromium renderer:

- `@page` rules for margins, headers, footers, page numbers
- `@media print` blocks for page-break control, orphan/widow handling
- Print-specific typography (fonts embedded as base64 or loaded from CDN)
- Brand bar, cover page layout, and section styling that render identically in browser preview and PDF output

### Gotenberg Integration

Gotenberg is an open-source Docker container wrapping headless Chromium. Single API call: POST HTML, receive PDF bytes.

**Deployment**: Gotenberg container on Railway (same infrastructure as the rest of the backend). Internal network URL, no public exposure needed. Edge function calls Gotenberg over the internal network.

**API call pattern**:
```
POST https://gotenberg-internal.railway.internal/forms/chromium/convert/html
Content-Type: multipart/form-data

- index.html: The merged HTML document
- header.html: Optional header template
- footer.html: Optional footer with page numbers
- paperWidth: 8.27 (A4)
- paperHeight: 11.69 (A4)
- marginTop: 0.5
- marginBottom: 0.75
- marginLeft: 0.5
- marginRight: 0.5
- printBackground: true
- waitDelay: 500ms (for web font loading)
```

### Default Template: "Sandler Standard"

Ships with 60 as the default. Clean cover page with brand bar, structured sections with consistent typography, professional pricing tables, and clear next steps. Built as HTML + CSS print media queries. Orgs can clone and customise via the existing `TemplateManager`.

### PDF Quality Comparison

| Approach | Quality | CSS Support | Branding | Page Layout | Status |
|----------|---------|-------------|----------|-------------|--------|
| **pdf-lib** (current) | 3/10 | None -- programmatic only | Basic text insertion | Manual coordinate math | Exists in `proposal-generate-pdf` -- to be deprecated |
| **Gotenberg** (target) | 8--9/10 | Full CSS3 + print media queries | Complete brand rendering | Native `@page` rules, headers/footers | V2 build |
| **Browserless.io** (backup) | 8/10 | Full CSS3 | Complete | Native | Cloud fallback if Railway infra issues |

---

## 6. Database Schema

### Existing Tables (KEEP)

#### `proposals` -- Core proposal records

Current columns (from `database.types.ts` + migrations):

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid PK | Baseline |
| `meeting_id` | uuid FK | Baseline |
| `contact_id` | uuid FK | Baseline |
| `type` | text (goals / sow / proposal) | Baseline |
| `status` | text (draft / generated / approved / sent) | Baseline |
| `content` | text | Baseline |
| `title` | text | Baseline |
| `user_id` | uuid FK | Baseline |
| `share_token` | uuid | Baseline |
| `password_hash` | text | Baseline |
| `is_public` | boolean | Baseline |
| `share_views` | integer | Baseline |
| `last_viewed_at` | timestamptz | Baseline |
| `template_id` | uuid FK -> proposal_templates | Migration `20260206120000` |
| `output_format` | text (docx / pdf / html) | Migration `20260206120000` |
| `brand_config` | jsonb | Migration `20260206120000` |
| `sections` | jsonb | Migration `20260206120000` |
| `generation_status` | text (pending / processing / complete / failed) | Migration `20260206120000` |
| `created_at` | timestamptz | Baseline |
| `updated_at` | timestamptz | Baseline |

#### `proposal_templates` -- Org-scoped HTML templates

Current columns: `id`, `name`, `type`, `content`, `is_default`, `user_id`, `org_id`, `description`, `sections`, `brand_config`, `preview_image_url`, `category`, `created_by`, `source_document_id`, `created_at`, `updated_at`.

#### `proposal_jobs` -- Async job queue

Current columns: `id`, `user_id`, `action`, `status`, `input_data`, `output_content`, `output_usage`, `error_message`, `created_at`, `started_at`, `completed_at`, `retry_count`, `max_retries`.

#### `proposal_assets` -- Logos, images, documents

Current columns: `id`, `proposal_id`, `org_id`, `asset_type` (logo / image / attachment / font / document), `storage_path`, `source` (upload / logo_dev / template / generated), `file_name`, `file_size_bytes`, `mime_type`, `metadata`, `created_at`, `created_by`.

### Schema Modifications Needed

#### `proposals` -- Add V2 pipeline columns

```sql
-- V2 pipeline columns
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES deals(id);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS trigger_type text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS autonomy_tier text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS context_payload jsonb;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pdf_url text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pdf_s3_key text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS credits_used numeric(8,4);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS style_config jsonb;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pipeline_version integer DEFAULT 1;

-- CHECK constraints
ALTER TABLE proposals ADD CONSTRAINT proposals_trigger_type_check
  CHECK (trigger_type IS NULL OR trigger_type IN ('auto_post_meeting', 'manual_button', 'copilot', 'slack'));
ALTER TABLE proposals ADD CONSTRAINT proposals_autonomy_tier_check
  CHECK (autonomy_tier IS NULL OR autonomy_tier IN ('disabled', 'suggest', 'approve', 'auto'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proposals_deal_id ON proposals (deal_id);
CREATE INDEX IF NOT EXISTS idx_proposals_org_id ON proposals (org_id);
CREATE INDEX IF NOT EXISTS idx_proposals_trigger_type ON proposals (trigger_type);
```

#### Autopilot -- Register proposal thresholds

Add to `RUBBER_STAMP_THRESHOLDS` in `supabase/functions/_shared/autopilot/signals.ts`:

```typescript
'proposal.generate':       4000,  // 4s  — proposal generation needs review
'proposal.send':           5000,  // 5s  — sending to client is high stakes
```

### New Table: `org_offering_profiles`

Stores structured product/service data extracted from uploaded collateral (pitch decks, product sheets, one-pagers).

```sql
CREATE TABLE IF NOT EXISTS org_offering_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id),
    name text NOT NULL,
    description text,
    products_json jsonb DEFAULT '[]'::jsonb,
    services_json jsonb DEFAULT '[]'::jsonb,
    case_studies_json jsonb DEFAULT '[]'::jsonb,
    pricing_models_json jsonb DEFAULT '[]'::jsonb,
    differentiators_json jsonb DEFAULT '[]'::jsonb,
    source_document_id uuid REFERENCES proposal_assets(id),
    is_active boolean DEFAULT true,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_offering_profiles_org_id ON org_offering_profiles (org_id);

-- RLS
ALTER TABLE org_offering_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org offering profiles" ON org_offering_profiles
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can manage org offering profiles" ON org_offering_profiles
    FOR ALL USING (
        org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid())
    );
```

---

## 7. Edge Functions

### Existing Functions (KEEP)

| Function | Location | Purpose | V2 Changes |
|----------|----------|---------|------------|
| `generate-proposal` | `supabase/functions/generate-proposal/index.ts` | Multi-action orchestrator (analyze, generate, stream, jobs) | Keep as-is -- V2 pipeline calls it or runs alongside |
| `proposal-generate-docx` | `supabase/functions/proposal-generate-docx/index.ts` | DOCX generation | Keep -- DOCX remains an output format option |
| `proposal-generate-pdf` | `supabase/functions/proposal-generate-pdf/index.ts` | pdf-lib PDF generation (3/10 quality) | **Deprecate** -- replaced by Gotenberg pipeline |
| `fetch-logo` | `supabase/functions/fetch-logo/index.ts` | Logo.dev resolution chain | Keep |
| `proposal-parse-document` | `supabase/functions/proposal-parse-document/index.ts` | DOCX/PDF upload to AI-extracted template structure | Keep |
| `analyze-writing-style` | `supabase/functions/analyze-writing-style/index.ts` | Gmail email analysis for style extraction | Keep -- V2 wires output into proposal context |

### Existing Orchestrator Adapters (KEEP)

All adapters in `supabase/functions/_shared/orchestrator/adapters/proposalGenerator.ts`:

| Adapter | Registry Key | Purpose | V2 Changes |
|---------|-------------|---------|------------|
| `detectProposalIntentAdapter` | `detect-proposal-intent` | PROP-001: detects `send_proposal` intent, kicks off proposal job | Update to use V2 pipeline for generation |
| `proposalApprovalAdapter` | `proposal-approval` | PROP-002: Slack HITL with Approve/Edit/Skip buttons | Keep -- already functional |
| `proposalGeneratorAdapter` | `select-proposal-template` | Template selection step in `proposal_generation` sequence | Update to use V2 template logic |
| `populateProposalAdapter` | `populate-proposal` | Populates template with CRM data | Subsumed by V2 context assembly |
| `generateCustomSectionsAdapter` | `generate-custom-sections` | AI-generates executive summary, ROI, custom sections | Subsumed by V2 AI composition |
| `presentForReviewAdapter` | `present-for-review` | Slack review message with deal details | Keep for backward compat |

### New Edge Functions

#### `proposal-assemble-context` -- Stage 1

Queries all 8 data sources and assembles the typed `ProposalContextPayload`. This is the single source of truth for everything the AI needs.

- Queries: `deals`, `deal_custom_fields`, `deal_memory_events`, `contacts`, `activities`, `meetings`, `relationship_graph`, `org_settings`, `user_tone_settings`, `org_offering_profiles`
- Calls `apollo-enrich` if company data is stale (>7 days)
- Truncates transcript to 15k tokens; falls back to process-recording summary if over
- Returns typed JSON payload + stores snapshot in `proposals.context_payload`
- Credit cost: 0 (database reads only)

#### `proposal-compose-v2` -- Stage 2

Sends assembled context + template schema + style fingerprint to Claude Sonnet. Returns structured JSON matching the `ProposalSection[]` schema.

- Model: Claude Sonnet 4.5 via model router
- Structured output: JSON matching `ProposalSection[]` schema (validated against `PROPOSAL_SECTIONS_SCHEMA` from `generate-proposal/index.ts`)
- Style calibration: injects `style_fingerprint` from context payload into system prompt
- Offering awareness: maps products/services from `offering_profile` into the Solution and Investment sections
- Credit cost: 3--5 credits, logged via `logAICostEvent`
- Credit check: calls `checkCreditBalance` before generation; queues if insufficient

#### `proposal-render-gotenberg` -- Stages 3--4

Merges AI-generated sections into HTML template, then POSTs to Gotenberg for PDF rendering.

- Template merge: Handlebars-style variable substitution into `proposal_templates.content` HTML
- CSS injection: print media queries, `@page` rules, brand colors/fonts from `brand_config`
- Logo injection: resolves logo URL from `proposal_assets` or `fetch-logo`
- Gotenberg POST: `multipart/form-data` with `index.html`, `header.html`, `footer.html`
- Upload: stores PDF in S3 (`proposal-assets` bucket), updates `proposals.pdf_url` and `proposals.pdf_s3_key`
- Credit cost: 0 (infrastructure cost only)

#### `proposal-deliver` -- Stage 5

Creates activity record, sends Slack notification, updates proposal status.

- Creates `activities` row: type `proposal_generated`, linked to deal and contact
- Sends Slack DM to the rep with PDF download link and preview
- Updates `proposals.status` to `ready`
- If autonomy tier is `auto`: additionally sends to the client email (with undo window)
- Credit cost: 0.5 credits (AI-assisted notification copy, optional)

#### `offering-extract` -- Collateral Analysis

AI-powered extraction of structured offering data from uploaded collateral (pitch decks, product sheets, one-pagers).

- Input: `proposal_assets` row (asset_type: `document`)
- Processing: extracts text via mammoth (DOCX) or pdf-parse; sends to Claude for structured extraction
- Output: creates/updates `org_offering_profiles` row with `products_json`, `services_json`, `case_studies_json`, `pricing_models_json`, `differentiators_json`
- Credit cost: 1--2 credits (text extraction + Claude analysis)

### Credit Governance Integration

| Function | Feature Key | Tier | Credits |
|----------|------------|------|---------|
| `proposal-compose-v2` | `proposal_generation` | `high` | 3--5 |
| `proposal-deliver` | `proposal_notification` | `low` | 0--0.5 |
| `offering-extract` | `offering_analysis` | `medium` | 1--2 |

Budget check runs before Stage 2 via `checkCreditBalance`. If budget is exhausted, the proposal enters `generation_status: 'queued'` and retries on the next budget cycle.

---

## 8. Copilot Skill

### Current State: 3 Overlapping Skills

| Skill | Location | Purpose | Problem |
|-------|----------|---------|---------|
| `proposal` | `skills/atomic/proposal/SKILL.md` | Full proposal generation with templates and pricing tiers | Comprehensive but doesn't use V2 pipeline |
| `proposal-generator` | `skills/atomic/proposal-generator/SKILL.md` | Wrapper for generate-proposal edge function | Redundant with `proposal` |
| `copilot-proposal` | `skills/atomic/copilot-proposal/SKILL.md` | Copilot-specific proposal handling with pricing strategy refs | Overlaps with both above |

### Consolidation Plan

Merge all three into a single `generate-proposal-v2` skill that routes to the 5-stage pipeline.

### Skill Frontmatter

```yaml
---
name: Proposal Generator V2
description: |
  Generate professional, context-rich proposals using the 5-stage pipeline.
  Triggers on: "write a proposal", "generate proposal", "create proposal",
  "draft proposal", "proposal for [deal/meeting]", "SOW for", "quote for".
  Uses deal context, meeting transcripts, style fingerprint, and offering profile.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: atomic
  is_active: true
  agent_affinity:
    - pipeline
    - outreach
  triggers:
    - pattern: "write a proposal"
      intent: "generate_proposal_v2"
      confidence: 0.90
    - pattern: "proposal for"
      intent: "generate_proposal_v2"
      confidence: 0.85
    - pattern: "create a SOW"
      intent: "generate_proposal_v2"
      confidence: 0.85
  keywords:
    - proposal
    - SOW
    - statement of work
    - quote
    - pricing document
  required_context:
    - meeting_id OR deal_id
  inputs:
    - name: entity_ref
      type: string
      description: "Meeting ID, deal ID, or entity name to resolve"
      required: true
    - name: template_override
      type: string
      description: "Optional template ID to use instead of default"
      required: false
  outputs:
    - name: proposal_id
      type: string
      description: "ID of the generated proposal"
    - name: pdf_url
      type: string
      description: "Download URL for the PDF"
  priority: high
  tags:
    - sales
    - proposal
    - deal-closing
---
```

### Slack Intent Handler

The existing `proposal_request` handler in `slack-copilot` is already wired. V2 update:

1. Resolve entity reference (deal name or meeting title) to `deal_id` / `meeting_id`
2. Fire the 5-stage pipeline via `proposal-assemble-context` -> `proposal-compose-v2` -> `proposal-render-gotenberg` -> `proposal-deliver`
3. Post progress updates in the Slack thread (Stage 1... Stage 2... etc.)
4. Final message: PDF file upload + download link + "Edit in 60" button

---

## 9. UI Components

### Existing Components (KEEP)

| Component | Location | Purpose | V2 Changes |
|-----------|----------|---------|------------|
| `ProposalWizard` | `src/components/proposals/ProposalWizard.tsx` | 8-step guided wizard (128KB) | Becomes "Customise" advanced path |
| `ProposalPreview` | `src/components/proposals/ProposalPreview.tsx` | Inline editing, section reordering | Keep -- used for post-generation editing |
| `BrandConfigPanel` | (within ProposalWizard) | Brand colors, fonts, logo config | Keep |
| `TemplateManager` | `src/components/proposals/TemplateManager.tsx` | Template CRUD, picker | Keep |
| `SaveTemplateModal` | `src/components/proposals/SaveTemplateModal.tsx` | Save current proposal as template | Keep |
| `TemplateUploader` | `src/components/proposals/TemplateUploader.tsx` | Upload DOCX/PDF example | Keep |
| `TemplateExtractReview` | `src/components/proposals/TemplateExtractReview.tsx` | Review AI-extracted template from upload | Keep |
| `ProposalSelectionResponse` | `src/components/copilot/responses/ProposalSelectionResponse.tsx` | Copilot response for proposal selection | Update for V2 pipeline |
| `ProposalWorkflowSettings` | `src/pages/settings/ProposalWorkflowSettings.tsx` | Proposal workflow configuration | Keep |
| `ProposalSettings` | `src/pages/settings/ProposalSettings.tsx` | General proposal settings | Keep |
| `ProposalConfirmationModal` | `src/components/ProposalConfirmationModal.tsx` | Confirmation dialog | Keep |

### New Components

#### `ProposalQuickGenerate`

One-click button placed on the meeting detail page, positioned next to existing action buttons.

- **Trigger**: single click fires the 5-stage pipeline with default template and deal context
- **States**: Idle (blue primary button, "Generate Proposal") -> Processing (opens `ProposalProgressOverlay`) -> Done (links to preview)
- **Disabled state**: when meeting has no recording AND no notes, with tooltip: "No meeting data available yet"
- **"Customise" link**: secondary text link below the button that opens the existing `ProposalWizard`
- **Icon**: `FileText` from lucide-react

#### `ProposalProgressOverlay`

Modal overlay showing 5-stage pipeline progress. Follows the same pattern as existing processing overlays in the app.

| # | Stage Label | Description Shown | Duration (est) |
|---|-------------|-------------------|----------------|
| 1 | Gathering context... | "Pulling deal data, transcript, and company research" | 2--3s |
| 2 | Writing proposal... | "AI is composing your proposal sections" | 8--12s |
| 3 | Applying branding... | "Merging with your org template and brand" | 1--2s |
| 4 | Generating PDF... | "Rendering pixel-perfect document" | 2--4s |
| 5 | Done! | PDF thumbnail preview + action buttons | -- |

Final state reveals: PDF thumbnail, "Download PDF" button, "Edit Sections" button (opens `ProposalPreview`), "Send to Client" button, and credit cost badge.

#### `ProposalPanel`

New copilot response panel type for the 48-panel architecture. Renders when the copilot generates a proposal via the `generate-proposal-v2` skill.

- PDF thumbnail preview (first page render)
- Title and client name
- Quick actions: Download PDF, Edit in 60, Regenerate, Send to Client
- Credits used badge
- Status indicator (generating / ready / sent)

#### `OfferingUploader`

Upload collateral (pitch decks, product sheets, one-pagers) to extract structured offering profile.

- File input accepting PDF, DOCX, PPTX
- Upload to `proposal_assets` with `asset_type: 'document'`
- Fires `offering-extract` edge function
- Review screen showing extracted products, services, case studies, pricing models
- Edit/approve before saving to `org_offering_profiles`
- Placed in Settings > Proposal Settings or as part of onboarding flow

#### Proposals List View

New table view accessible from the main navigation. Shows all proposals for the org.

| Column | Source |
|--------|--------|
| Title | `proposals.title` |
| Client | `contacts.name` via `proposals.contact_id` |
| Deal | `deals.name` via `proposals.deal_id` |
| Created | `proposals.created_at` |
| Status | `proposals.status` (draft / ready / sent) |
| Trigger | `proposals.trigger_type` (auto / manual / copilot / slack) |
| Credits | `proposals.credits_used` |
| Actions | Download PDF, Edit, Regenerate, Send, Delete |

Filterable by status, trigger type, and date range. Sortable by all columns.

---

## 10. Autopilot Integration

### Existing Infrastructure (KEEP)

The autopilot system is fully built and operational:

- **`autopilot_signals` table**: records every approval/rejection/edit event
- **`SIGNAL_WEIGHTS`** (in `supabase/functions/_shared/autopilot/signals.ts`): `approved: +1.0`, `approved_edited: +0.3`, `rejected: -1.0`, `expired: -0.2`, `undone: -2.0`, `auto_executed: +0.1`, `auto_undone: -3.0`
- **`RUBBER_STAMP_THRESHOLDS`**: action-type-specific thresholds (e.g., `email.send: 5000ms`, `crm.deal_stage_change: 3000ms`). Uses `DEFAULT_RUBBER_STAMP_MS = 2000` as fallback.
- **`isRubberStamp()` function**: checks if approval was too fast to be meaningful
- **`ApprovalEvent` interface**: full signal recording with `action_type`, `signal`, `time_to_respond_ms`

### What Is Already Built for Proposals

- **PROP-001** (`detectProposalIntentAdapter`): detects `send_proposal` intent from `detect-intents` output, fires async proposal job via `generate-proposal`, stores `proposal_job_id` in step output
- **PROP-002** (`proposalApprovalAdapter`): creates `hitl_pending_approvals` row, sends Slack DM with `[Approve & Send] [Edit in 60] [Skip]` buttons, pauses the `meeting_ended` sequence for rep action
- **Sequence wiring**: `meeting_ended` -> `classify-call-type` -> `detect-intents` -> `detect-proposal-intent` -> `proposal-approval` (in `supabase/functions/_shared/orchestrator/eventSequences.ts`)

### What Is New for V2

#### Register Proposal Thresholds

Add two entries to `RUBBER_STAMP_THRESHOLDS`:

```typescript
'proposal.generate':       4000,  // 4s  — proposal needs review before committing
'proposal.send':           5000,  // 5s  — sending to client is high stakes
```

#### Autonomy Tiers

Same tier pattern as all other actions:

| Tier | Behaviour | Default Threshold |
|------|-----------|-------------------|
| **disabled** | No automatic proposals. Manual trigger only via ProposalQuickGenerate or wizard. | N/A |
| **suggest** | After meeting, 60 suggests via Slack: "I can write a proposal for this meeting. Want me to?" | Default for new users |
| **approve** | 60 drafts the proposal automatically via the V2 pipeline, sends Slack HITL: "I've drafted a proposal for [deal]. Review and send?" with `[Approve & Send] [Edit in 60] [Skip]` | After 5+ approved proposals |
| **auto** | 60 generates and sends the proposal PDF to the client automatically. User gets Slack notification with undo option (5 min window). | After 15+ approved with <5% edit rate |

#### Style Learning from Edit Signals

When a user edits a generated proposal before approving (via `ProposalPreview` inline editing or the wizard), V2 tracks the changes:

1. **`approved_edited` signal** is recorded with additional metadata: `edit_distance` (Levenshtein ratio between original and edited content)
2. Edit patterns are analyzed: which sections get edited most? Is the tone being made more/less formal? Are specific phrases being replaced?
3. These patterns feed back into the style fingerprint over time, improving future proposals
4. Signal weights follow the existing autopilot pattern: `approved: +1.0`, `approved_edited: +0.3` (sent with edits), `rejected: -1.0`, `auto_undone: -3.0`

---

## 11. Implementation Plan

### Phase 0: Already Built (V1 Complete)

**Status: DONE -- 28 stories shipped**

- ProposalWizard.tsx (8-step flow)
- generate-proposal edge function (multi-action orchestrator)
- proposal-generate-pdf and proposal-generate-docx
- ProposalPreview with inline editing
- Template system (proposal_templates, proposal_assets, upload-to-template)
- Logo.dev integration and branding pipeline
- Database schema (proposals, proposal_templates, proposal_jobs, proposal_assets)
- PROP-001 (detectProposalIntentAdapter) and PROP-002 (proposalApprovalAdapter)
- Sequence wiring in eventSequences.ts
- analyze-writing-style + user_tone_settings
- creditLedger.ts and costTracking.ts

### Phase 1: Style Fingerprint -- Wire into Proposals

**Dependencies: None (can start immediately)**

| Story | Description | Effort |
|-------|-------------|--------|
| STY-001 | Wire `user_tone_settings` into `proposal-compose-v2` prompt: query tone settings for the user, inject formality/directness/warmth/words-to-avoid into the system prompt | S |
| STY-002 | Extract style patterns from uploaded proposal examples: when `proposal-parse-document` processes an upload, analyze writing style (sentence length, tone, vocabulary) and store alongside template | M |
| STY-003 | Build compound style fingerprint: merge email analysis (from `analyze-writing-style`) + proposal examples + org defaults into a single `style_config` JSON | S |
| STY-004 | Edit distance tracking: when `approved_edited` signal fires, compute Levenshtein distance between original sections and edited sections, store in signal metadata | M |
| STY-005 | Style learning loop: periodically aggregate edit patterns per user, update `user_tone_settings` with learned preferences (e.g., "user always makes pricing section more formal") | M |

### Phase 2: Offering Profile -- Structured Product Data

**Dependencies: None (can start immediately, parallel with Phase 1)**

| Story | Description | Effort |
|-------|-------------|--------|
| OFR-001 | Migration: create `org_offering_profiles` table with RLS policies | S |
| OFR-002 | `OfferingUploader` component: file upload UI for pitch decks/product sheets, upload to `proposal_assets` | M |
| OFR-003 | `offering-extract` edge function: AI-powered extraction of products, services, case studies, pricing models from uploaded documents | L |
| OFR-004 | Offering review UI: display extracted data, allow editing/approval before saving to `org_offering_profiles` | M |
| OFR-005 | Wire offering profile into context assembly: `proposal-assemble-context` queries `org_offering_profiles` and includes in context payload | S |
| OFR-006 | Offering profile settings page: view/edit/delete offering profiles, upload new collateral | M |

### Phase 3: Gotenberg PDF -- Pixel-Perfect Rendering

**Dependencies: None (can start immediately, parallel with Phases 1 and 2)**

| Story | Description | Effort |
|-------|-------------|--------|
| GOT-001 | Deploy Gotenberg Docker container on Railway with internal networking | S |
| GOT-002 | Build HTML template engine: Handlebars-style variable substitution for `proposal_templates.content` | M |
| GOT-003 | CSS print media queries: `@page` rules, page breaks, headers/footers, brand bar, typography | M |
| GOT-004 | "Sandler Standard" default template: HTML + CSS print for clean cover page, professional tables, consistent typography | L |
| GOT-005 | `proposal-render-gotenberg` edge function: merge HTML + POST to Gotenberg + upload PDF to S3 | M |
| GOT-006 | PDF preview: generate first-page thumbnail for UI display (can use Gotenberg screenshot endpoint) | S |
| GOT-007 | Deprecation: add `v1_legacy` flag to `proposal-generate-pdf`, route new requests to Gotenberg pipeline | S |

### Phase 4: 5-Stage Pipeline -- End-to-End

**Dependencies: Phases 1 + 2 + 3 must be complete**

| Story | Description | Effort |
|-------|-------------|--------|
| PIP-001 | `proposal-assemble-context` edge function: query 8 data sources, build typed `ProposalContextPayload`, store snapshot | L |
| PIP-002 | `proposal-compose-v2` edge function: Claude Sonnet structured output with style fingerprint and offering awareness | L |
| PIP-003 | `proposal-deliver` edge function: S3 storage, activity creation, Slack notification, status update | M |
| PIP-004 | Pipeline orchestration: chain Stage 1 -> 2 -> 3-4 -> 5 with status updates at each stage via Supabase realtime | M |
| PIP-005 | Error handling and retry: graceful degradation at each stage, retry logic for transient failures, clear error states | M |
| PIP-006 | Pipeline monitoring: log timing, credit usage, and error rates for each stage | S |

### Phase 5: One-Click UX -- Frontend

**Dependencies: Phase 4 must be complete**

| Story | Description | Effort |
|-------|-------------|--------|
| UX-001 | `ProposalQuickGenerate` button on meeting detail page with disabled/enabled states | M |
| UX-002 | `ProposalProgressOverlay` modal with 5-stage progress bar, subscribing to realtime status updates | M |
| UX-003 | `ProposalPanel` copilot response panel: PDF thumbnail, title, quick actions | M |
| UX-004 | Proposals list view: table with filters, sort, actions | M |
| UX-005 | Wire ProposalWizard as "Customise" path: secondary link below QuickGenerate button | S |
| UX-006 | Post-generation edit flow: from ProposalProgressOverlay "Done" state -> ProposalPreview for inline editing -> re-render PDF | M |

### Phase 6: All 4 Triggers -- Wiring

**Dependencies: Phase 4 must be complete (can parallel with Phase 5)**

| Story | Description | Effort |
|-------|-------------|--------|
| TRG-001 | Update `detectProposalIntentAdapter` (PROP-001) to use V2 pipeline instead of legacy `generate-proposal` | M |
| TRG-002 | Consolidate 3 copilot skills into `generate-proposal-v2`: merge skill files, update routing in `copilotRoutingService.ts` | M |
| TRG-003 | Update Slack `proposal_request` handler to use V2 pipeline with progress updates in thread | M |
| TRG-004 | Manual button trigger: `ProposalQuickGenerate` creates proposal record, fires pipeline, subscribes to updates | S (mostly done in UX-001) |

### Phase 7: Autopilot and Polish

**Dependencies: Phases 5 + 6 must be complete**

| Story | Description | Effort |
|-------|-------------|--------|
| AUT-001 | Register `proposal.generate` (4000ms) and `proposal.send` (5000ms) in `RUBBER_STAMP_THRESHOLDS` | S |
| AUT-002 | Edit distance tracking in autopilot signals: compute and store Levenshtein ratio on `approved_edited` | M |
| AUT-003 | Autonomy tier display: show current tier in proposal settings, explain promotion criteria | S |
| AUT-004 | QA pass: test all 4 triggers end-to-end with real meeting data | M |
| AUT-005 | Template refinement: iterate on Sandler Standard based on real proposal output quality | M |
| AUT-006 | Performance tuning: optimize pipeline latency, Gotenberg warm-up, caching for repeated context queries | M |

### Parallelization and Critical Path

```
Phase 1 (Style)   ─────┐
Phase 2 (Offering) ─────┼──▶ Phase 4 (Pipeline) ──▶ Phase 5 (UX) ───────┐
Phase 3 (Gotenberg) ────┘                          Phase 6 (Triggers) ──┼──▶ Phase 7 (Polish)
                                                                        │
                                                                        └──▶ SHIP
```

- **Phases 1 + 2 + 3** run in parallel (completely independent)
- **Phase 4** depends on all three completing (assembles all data sources, uses Gotenberg)
- **Phases 5 + 6** depend on Phase 4 (need working pipeline) but can run in parallel with each other
- **Phase 7** depends on 5 + 6 (integration testing and polish)

**Estimated total: 5--7 weeks** from start, assuming Phases 1--3 run in parallel.

---

## 12. Success Metrics

### Primary Metrics

| Metric | Target (90 days) | Measurement |
|--------|-------------------|-------------|
| Proposals generated per week | 50+ across all orgs | `proposals` table count where `pipeline_version = 2` |
| Time from trigger to proposal ready | < 60 seconds | `created_at` to `generation_status = 'complete'` delta |
| Approval rate (sent without major edits) | > 70% | `autopilot_signals` where `action_type = 'proposal.send'` and `signal IN ('approved', 'approved_edited')` |
| Feature adoption | > 40% of sales meetings trigger a proposal | `proposals.count` / `meetings.count` (filtered to sales meetings) |

### Secondary Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Autonomy progression | 30% of active users at "approve"+ tier within 90 days | Autopilot confidence scores for `proposal.generate` |
| Style accuracy | Edit distance decreasing over time per user | Average Levenshtein ratio in `approved_edited` signals trending downward |
| Offering coverage | > 60% of orgs have at least one offering profile uploaded | `org_offering_profiles` count vs active orgs |
| Trigger distribution | All 4 triggers used, no single trigger > 60% | `proposals.trigger_type` distribution |

### Guardrails

| Guardrail | Threshold | Action if Breached |
|-----------|-----------|-------------------|
| Credit budget per proposal | < 5 credits | Alert, investigate prompt efficiency |
| Pipeline error rate | < 2% | Alert on-call, auto-retry with exponential backoff |
| Gotenberg latency (p95) | < 5 seconds | Scale Railway container, investigate HTML complexity |
| PDF file size | < 5MB | Optimize images, compress fonts |
| Context assembly latency (p95) | < 3 seconds | Add query caching, optimize joins |

---

## 13. Architecture Alignment

This feature follows all four engineering principles with specific implementation in the codebase.

### 1. Protect the loop, not the feature

Proposals flow through the same autopilot confidence system as every other action. The trust cycle is preserved: `disabled` -> `suggest` -> `approve` -> `auto`.

- **PROP-002** (`proposalApprovalAdapter` in `supabase/functions/_shared/orchestrator/adapters/proposalGenerator.ts`) creates `hitl_pending_approvals` with `[Approve & Send] [Edit in 60] [Skip]` buttons -- identical pattern to email draft approval
- Signal recording uses the same `SIGNAL_WEIGHTS` and `RUBBER_STAMP_THRESHOLDS` in `supabase/functions/_shared/autopilot/signals.ts`
- Edit distance tracking feeds the style fingerprint, closing the learning loop: generate -> approve/edit -> learn -> generate better

### 2. Extend, don't rebuild

V2 is additive. It reuses existing infrastructure everywhere:

- Context assembly queries the same CRM tables, transcript summaries, Apollo enrichment, and relationship graph data that the orchestrator's `contextLoader.ts` already loads as `tier1` and `tier2`
- Credit governance flows through the existing `logAICostEvent` / `checkCreditBalance` pipeline in `supabase/functions/_shared/costTracking.ts`
- Template system keeps `proposal_templates`, `proposal_assets`, and all existing UI components
- The `meeting_ended` sequence in `eventSequences.ts` already has PROP-001 and PROP-002 wired -- V2 updates the generation call, not the sequence structure

### 3. Default to action, gate with confidence

The one-click `ProposalQuickGenerate` button defaults to action: one click fires the full 5-stage pipeline with zero configuration. The confidence gate determines what happens after generation:

- `suggest` tier: "I've prepared a proposal. Want me to generate it?"
- `approve` tier: generates automatically, sends HITL approval via Slack
- `auto` tier: generates and sends to the client, with undo window

The `intentActionRegistry` entry for `send_proposal` already sets `confidence_threshold: 0.7` -- below that threshold, the system suggests rather than acts.

### 4. Make it visible before you make it clever

The `ProposalProgressOverlay` shows exactly what the AI is doing at each of the 5 stages. Every proposal is logged with:

- Full `context_payload` snapshot (stored in `proposals.context_payload`) for debugging what data the AI saw
- Credit breakdown per stage
- Pipeline timing per stage
- The generated sections (stored in `proposals.sections`) before and after any user edits

The Proposals list view gives reps and managers visibility into every proposal generated, its trigger source, credits consumed, and current status. Nothing happens in the dark.

### Technical Architecture: Data Flow

```
TRIGGER (any of 4)
    |
    v
[proposal-assemble-context] ──── Stage 1: Context Assembly
    |   queries: deals, contacts, meetings, activities,
    |   user_tone_settings, org_offering_profiles,
    |   Apollo enrichment, relationship_graph
    |   output: ProposalContextPayload (30k tokens max)
    v
[proposal-compose-v2] ──── Stage 2: AI Composition
    |   model: Claude Sonnet 4.5
    |   input: context payload + template schema + style fingerprint
    |   output: ProposalSection[] (structured JSON)
    |   cost: 3-5 credits via logAICostEvent
    v
[proposal-render-gotenberg] ──── Stages 3-4: Template Merge + PDF Render
    |   merge: sections into HTML template (Handlebars)
    |   inject: CSS print media queries, brand_config, logos
    |   render: POST to Gotenberg (Railway internal)
    |   upload: PDF to S3 (proposal-assets bucket)
    v
[proposal-deliver] ──── Stage 5: Deliver
    |   create: activities row (type: proposal_generated)
    |   notify: Slack DM with PDF download link
    |   update: proposals.status = 'ready'
    |   gate: if autonomy_tier == 'approve', fire PROP-002 HITL
    v
DONE -> ProposalProgressOverlay shows "Done!" with PDF preview
```

Each stage updates `proposals.generation_status` in real time. The frontend subscribes via Supabase Realtime to `proposals` table changes, driving the `ProposalProgressOverlay` progress bar.
