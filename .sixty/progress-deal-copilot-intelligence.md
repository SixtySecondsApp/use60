# Progress Log — Deal Copilot Intelligence

## Codebase Patterns

- Meetings table has NO `deal_id` column — link via `primary_contact_id` / `company_id`
- `meetings.summary` is a JSON blob from Fathom with `markdown_formatted` containing bold key takeaways
- `deal_truth_fields` table stores 6 structured fields (pain, champion, economic_buyer, success_metric, next_step, top_risks) with confidence scores
- `entityResolutionService.ts` has `ensureDealEntities()` for contact/company resolution
- `buildDealContextBlock()` prepends `[DEAL_CONTEXT]...[/DEAL_CONTEXT]` to first user message only
- `copilot-autonomous` detects `[DEAL_CONTEXT]` block and enters Deal Copilot Mode
- Deals update via `supabase.from('deals').update()` — requires `owner_id` match for RLS
- Edge function deploys to staging: `npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`

---

## Session Log

### 2026-02-28 — Full Feature Execution (10/10 stories)

#### MTG-001 ✅ — Fetch and inject Fathom summary into context block
**Files**: `src/components/Pipeline/hooks/useDealCopilotChat.ts`
**What**: Added `extractMeetingSummary()` helper that parses Fathom `markdown_formatted` JSON to extract key takeaways, action items, and pricing mentions. Top 2 meetings' summaries injected into `[DEAL_CONTEXT]` block as "Meeting Summaries" section. Added `summary` field to meetings query select.
**Commit**: `feat: MTG-001 - Fetch and inject Fathom summary into context block`

#### HEAL-001 ✅ — Write back resolved contact/company links on enrichment
**Files**: `src/components/Pipeline/hooks/useDealCopilotChat.ts`
**What**: Fire-and-forget PATCH to deals table when enrichment resolves contact_id, company_id, contact_name, or contact_email that the deal is missing. Only writes null fields.
**Commit**: `feat: HEAL-001 - Write back resolved contact/company links on enrichment`

#### MTG-002 ✅ — Inject deal truth fields into context block
**Files**: `src/components/Pipeline/hooks/useDealCopilotChat.ts`
**What**: Added `deal_truth_fields` query (parallel, filtered by confidence >= 0.3) and "Deal Intelligence" section in context block with pain, champion, economic_buyer, success_metric, next_step, top_risks.
**Commit**: `feat: MTG-002 - Inject deal truth fields into context block`

#### MTG-003 ✅ — Enrich greeting with meeting-specific insights
**Files**: `src/components/Pipeline/hooks/useDealCopilotChat.ts`
**What**: Greeting now shows contact name, last meeting date with key takeaway (from full summary extraction, not just oneliner), next step nudge from truth fields, and dossier narrative.
**Commit**: `feat: MTG-003 - Enrich greeting with meeting-specific insights`

#### HEAL-002 ✅ — Create batch heal edge function for nightly run
**Files**: `supabase/functions/heal-deal-links/index.ts`
**What**: New edge function processes deals with null primary_contact_id or company_id. Matches contacts by company name/email domain, companies by name/domain. Batches of 50, service_role auth.
**Commit**: `feat: HEAL-002 - Create batch heal edge function for nightly run`

#### DOSS-001 ✅ — Create deal_dossiers table schema
**Files**: `supabase/migrations/20260228100001_deal_dossiers.sql`
**What**: New table with JSONB snapshot, last_meetings_hash, unique on deal_id, org-scoped RLS.
**Commit**: `feat: DOSS-001 - Create deal_dossiers table schema`

#### HEAL-003 ✅ — Schedule nightly heal job via pg_cron
**Files**: `supabase/migrations/20260228200001_heal_deal_links_cron.sql`
**What**: cron.schedule at 03:00 UTC daily, calls heal-deal-links via net.http_post with service_role auth.
**Commit**: `feat: HEAL-003 - Schedule nightly heal job via pg_cron`

#### DOSS-002 ✅ — Build dossier on copilot session close
**Files**: `src/components/Pipeline/hooks/useDealCopilotChat.ts`
**What**: On reset() with >= 2 user messages, fire-and-forget sends conversation to copilot-autonomous for structured dossier extraction (narrative, key_facts, stakeholders, commitments, objections, timeline). Upserts into deal_dossiers.
**Commit**: `feat: DOSS-002 - Build dossier on copilot session close`

#### DOSS-003 ✅ — Load dossier into context block on copilot open
**Files**: `src/components/Pipeline/hooks/useDealCopilotChat.ts`
**What**: Added deal_dossiers query (parallel, maybeSingle), [DEAL_HISTORY] section in context block with narrative, key_facts, commitments, objections, stakeholders. Greeting shows dossier narrative.
**Commit**: `feat: DOSS-003 - Load dossier into context block on copilot open`

#### DOSS-004 ✅ — Auto-update dossier when new meetings are synced
**Files**: `supabase/functions/update-deal-dossier/index.ts`, `supabase/migrations/20260228300001_dossier_meeting_trigger.sql`
**What**: Edge function triggered by database trigger on meetings.summary_status → 'complete'. Finds linked deals, checks meetings_hash dedup, appends takeaway to timeline and updates narrative.
**Commit**: `feat: DOSS-004 - Auto-update dossier when new meetings are synced`

---

## Deployment Checklist (Previous Features)

- [ ] Run migrations: `20260228100001_deal_dossiers.sql`, `20260228200001_heal_deal_links_cron.sql`, `20260228300001_dossier_meeting_trigger.sql`
- [ ] Deploy edge functions: `heal-deal-links`, `update-deal-dossier` (both with `--no-verify-jwt`)
- [ ] Verify pg_cron job registered: `SELECT * FROM cron.job WHERE jobname = 'heal-deal-links-nightly';`
- [ ] Verify trigger registered: `SELECT * FROM pg_trigger WHERE tgname = 'trg_dossier_meeting_summary';`

---

## Feature: Copilot Email Intelligence & Quality

### Context
- `structureEmailDraftResponse()` in `structuredResponseDetector.ts` uses hardcoded Gemini 2.0 Flash
- Should use `modelRouter.ts` to resolve model based on user's intelligence tier setting (low=Haiku, medium=Sonnet 4.6, high=Opus 4.6)
- Missing: em dash prohibition, user sign-off phrases, wordsToAvoid
- Detection patterns too narrow — "follow up" without "email" keyword falls through to plain text

### Key References
- `modelRouter.ts` — `resolveModel()` with circuit-breaker and tier resolution
- `structuredResponseDetector.ts:2010-2077` — existing writing style loading
- `structuredResponseDetector.ts:2117-2199` — Gemini email generation (replace with model router)
- `structuredResponseDetector.ts:7069-7085` — email detection patterns (broaden)
- `follow-up/composer.ts:435` — em dash prohibition wording reference
- `follow-up/composer.ts:198-199` — signoffs pattern reference
- Anthropic API call pattern exists at line 4567 (meeting prep)

### Session Log

#### INTEL-001 — Wire model router into email draft generation
**Files**: `supabase/functions/_shared/structuredResponseDetector.ts`
**What**: Imported `resolveModel` from `modelRouter.ts`. Replaced hardcoded Gemini 2.0 Flash with model router resolution (`resolveModel({ feature: 'copilot', userId, orgId })`). When provider is `anthropic`, calls Claude API with resolved modelId (temp 0.6). Keeps Gemini as fallback when no Anthropic key or router fails.
**Gates**: N/A (edge function)

---

#### INTEL-002 — Add em dash prohibition and sign-off instructions
**Files**: `supabase/functions/_shared/structuredResponseDetector.ts`
**What**: Added extraction of `meta.signoffs`, `meta.greetings_signoffs.signoffs`, and `meta.wordsToAvoid` arrays into style instruction. Added instruction #8: "Never use em dashes". Updated instruction #7 to reference user's preferred sign-off.
**Gates**: N/A (edge function)

---

#### INTEL-003 — Broaden email draft detection patterns
**Files**: `supabase/functions/_shared/structuredResponseDetector.ts`
**What**: Added 5 new detection patterns: "follow up" / "follow-up" / "followup" without requiring "email" keyword (excluded when "task" present), "reach out to", and "get in touch".
**Gates**: N/A (edge function)

---

#### INTEL-004 — Deploy copilot-autonomous to staging
**What**: Deployed via `npx supabase functions deploy copilot-autonomous --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`. Both `structuredResponseDetector.ts` and `modelRouter.ts` uploaded successfully.

---

## Debugging — Structured Email Response Not Rendering

### Root Cause Investigation
User reported "No improvement" — emails still render as plain markdown with emojis, em dashes, "[Your Name]".

### Findings
1. **`context.orgId` was missing** — `copilot-autonomous` receives `organizationId` in request body but never mapped it to `context.orgId`. The model router code checks `context?.orgId || ''` which was always empty string → skipped model resolution entirely → always fell back to Gemini.
2. **`model_config` table has correct data** on staging (seeded previously) — `claude-sonnet-4-6` for medium tier copilot is there. But RLS hides rows from anon key; service role key (used by copilot-autonomous) can see them.
3. **Structured response pipeline looks correct in code** — email detection patterns match, `structureEmailDraftResponse` always returns `{type:'email'}`, SSE event sent before `done` event, frontend handler sets `structuredResponse` on message, render conditional checks it.
4. **Unable to confirm SSE delivery** — can't access Supabase function logs via CLI. Added diagnostic logging and redeployed.

### Fixes Applied (2026-02-28)
- **`copilot-autonomous/index.ts`**: Added `context.orgId = organizationId` so model router gets org context
- **`useCopilotChat.ts`**: Added `orgId: options.organizationId` to request context payload
- **Both files**: Added diagnostic console.logs around structured response detection and SSE sending
- **Redeployed** copilot-autonomous to staging with all fixes

### Root Cause Found & Fixed (2026-02-28, session 2)

**Root cause**: Multi-agent path in `copilot-autonomous/index.ts` NEVER called `detectAndStructureResponse`. Email draft requests routed to "outreach" specialist agent went through `handleMultiAgentRequest()` which sent `message_complete` + `done` SSE events but skipped structured response detection entirely. The detection only existed in the single-agent path (line ~2636).

**Secondary issue**: `context` variable was not passed to `handleMultiAgentRequest()` — it was scoped to the Deno serve handler. Code referencing `context` inside the function threw a ReferenceError caught by try/catch, silently failing.

**Tertiary issue**: Specialist agent ("outreach") generates emails with emojis, em dashes, and placeholders like `[Your Name]`, `[Your Company]`, `[Email]` that need stripping before rendering in the EmailResponse component.

### Fixes Applied (session 2 - initial)
1. **`copilot-autonomous/index.ts`**: Added `detectAndStructureResponse` call after `message_complete` in multi-agent path (before `done` event). Added `context` parameter to `handleMultiAgentRequest` signature and passed it from the calling site.
2. **`structuredResponseDetector.ts`**: When `[DEAL_CONTEXT]` is present in user message, generate email using AI (Claude via model router or Gemini fallback) from the deal context directly. Do NOT extract from the specialist agent's response (agent may use wrong meeting data). Fallback: if no deal context AND agent drafted an email, extract/clean from response (strip emojis, em dashes, placeholders). Extract recipient email/name from `[DEAL_CONTEXT]` block.

### Wrong Email Bug & Final Fix (2026-02-28, session 3)

**Bug**: Agent streams correct email about deal contact (Peter/Bigrockdigital), but `structureEmailDraftResponse` runs its own independent meeting queries and generates a DIFFERENT email about unrelated meetings (Owen King/staging deployment). The user sees the correct email in the chat stream, then the UI switches to the email component showing a completely different email.

**Root cause**: `structureEmailDraftResponse` has its own AI email generation pipeline that doesn't use the agent's response. It queries meetings independently and picks up unrelated data from the `[DEAL_CONTEXT]` meeting summaries.

**Fix**: Bypassed `structureEmailDraftResponse` entirely for outreach agent email requests. New code in `handleMultiAgentRequest` extracts the email DIRECTLY from the agent's streamed response:
1. Finds greeting line (`Hi/Hey/Hello/Dear` + uppercase letter) in agent text
2. Extracts through sign-off, cutting at section breaks (`---`, `##`, strategy headers)
3. Cleans: bold/italic markdown, em dashes (`\u2014` → `, `), emojis, `[Your Name]` → actual user name, all remaining `[...]` placeholders
4. Looks up user name from `profiles` table, falls back to email local part
5. Appends name after sign-off line if missing
6. Extracts Subject from `**Subject:**` line or generates from deal name
7. Extracts recipient from `[DEAL_CONTEXT]` Contact/Email fields
8. Builds `StructuredResponse` object directly and sends via SSE

**Key bug during implementation**: `userName` was declared inside `if (greetingIdx >= 0)` block but referenced outside it in sign-off code, causing `ReferenceError: userName is not defined` caught silently by try/catch. Fixed by hoisting variable declaration.

**Deployed** and verified via API tests:
   - `structured_response` SSE event: PRESENT
   - Deal relevance: PASS (Peter/Bigrockdigital/SEO, NOT Owen King)
   - Em dashes: PASS (none)
   - Emojis: PASS (none)
   - Placeholders: PASS (none, including `[Your Name]` → "Ralph")
   - To field: `peter@bigrockdigital.com.au`
   - Subject: "SEO Proposal for Bigrockdigital - Following Up"
   - Sign-off: "Warm regards,\nRalph" (proper line break)

### Tone Buttons 500 Fix (2026-02-28, session 3)

**Bug**: `api-copilot/actions/regenerate-email-tone` returns 500.
**Root cause**: `corsHeaders` only defined inside `serve()` closure (line 217), not in scope for top-level handler functions (`handleRegenerateEmailTone`, etc.) → `ReferenceError: corsHeaders is not defined`.
**Fix**: Added `const corsHeaders = getCorsHeaders(req)` to all 6 handler functions in `api-copilot/index.ts`.

### Greeting Name Missing Fix (2026-02-28, session 4)

**Bug**: Email greeting says "Hi," without the contact's name.
**Root cause**: Agent generates "Hi," or "Hi,\n" without the contact name; extraction preserves it as-is.
**Fix**: Added greeting name injection in BOTH paths:
1. **`copilot-autonomous/index.ts`** (multi-agent): regex replaces `^(Hi|Hey|Hello|Dear),?\s*$` → `$1 ${recipientFirstName},`
2. **`structuredResponseDetector.ts`** (single-agent/fallback): same regex right before building response object, after all body generation paths complete

**Deployed** and verified:
   - Greeting: "Hi Edward," (PASS - includes contact first name)
   - Em dashes: PASS (none)
   - Placeholders: PASS (none, `[Your Name]` → "Ralph")
   - Sign-off: "Best regards,\nRalph"
   - Deal relevance: PASS (Construction by Arbor proposal)

---

## Feature: Deal Copilot V2 — Intelligence, Memory & Actions

### 2026-03-01 — Final Verification & Deployment

All 10 DCV2 stories verified complete. Implementation was already in codebase from prior sessions.

#### DCV2-001 through DCV2-008 — Already Implemented
All frontend stories (enrichment, greeting alerts, structured responses, slash commands, deal sessions, persistence) were already fully implemented in:
- `src/components/Pipeline/hooks/useDealCopilotChat.ts`
- `src/components/Pipeline/DealIntelligenceSheet.tsx`
- `src/lib/hooks/useCopilotChat.ts`
- `src/lib/services/copilotSessionService.ts`
- `src/lib/types/copilot.ts`
- `supabase/migrations/20260227800001_add_deal_id_to_copilot_conversations.sql`

#### DCV2-009 — Deploy migration and edge function to staging
- Migration `deal_id` column already existed on staging
- copilot-autonomous redeployed with `--no-verify-jwt`
- Build succeeds (34.31s, no errors)

#### DCV2-010 — End-to-end verification
All 5 criteria PASS:
1. Greeting shows health + proactive alerts + meeting intel one-liner
2. 11 slash commands with full keyboard navigation (ArrowUp/Down/Enter/Tab/Escape)
3. Structured responses render CopilotResponse component (not plain markdown)
4. Per-deal persistent sessions via `getDealSession()`
5. Cross-deal isolation via `user_id + deal_id` query constraint
