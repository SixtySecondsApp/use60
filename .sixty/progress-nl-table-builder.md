# Progress Log — Natural Language Table Builder

## Codebase Patterns

- Edge functions use `_shared/` for reusable modules (e.g. `rateLimiter.ts`, `instantly.ts`)
- SSE streaming pattern: `new ReadableStream({ start(controller) { ... } })` with `text/event-stream` content type
- Apollo enrichment uses "enrich once, column many" — cache full response in `source_data.apollo`
- Instantly campaign creation requires `campaign_schedule` with restricted timezone enum (see MEMORY.md)
- Business context stored across multiple tables: `icp_profiles`, org onboarding data, `integration_credentials`, `profiles`
- Column types registered in `dynamic_table_columns.column_type` CHECK constraint
- Enrichment cells use `status` ('pending', 'complete', 'failed') and `source` ('enrichment', 'formula', 'manual')

---

## Session Log

### Session 1 — 2026-02-07

**Completed all 11 stories:**

| Story | Status | Files |
|-------|--------|-------|
| NLT-001: Business context loader | Done | `supabase/functions/_shared/businessContext.ts` |
| NLT-002: Email sign-off preference | Done | `supabase/migrations/20260207100000_email_sign_off.sql`, `src/pages/Profile.tsx` |
| NLT-003: Workflow orchestrator | Done | `supabase/functions/ops-workflow-orchestrator/index.ts` |
| NLT-004: Clarifying questions | Done | (built into orchestrator) |
| NLT-005: Email sequence generator | Done | `supabase/functions/generate-email-sequence/index.ts` |
| NLT-006: Existing campaign support | Done | `supabase/functions/instantly-admin/index.ts`, `supabase/functions/instantly-push/index.ts` |
| NLT-007: Campaign with email steps | Done | `supabase/functions/ops-workflow-orchestrator/index.ts` (enhanced) |
| NLT-008: Campaign approval gate | Done | `src/components/ops/CampaignApprovalBanner.tsx`, `src/pages/OpsDetailPage.tsx` |
| NLT-009: Workflow query bar | Done | `src/lib/hooks/useWorkflowOrchestrator.ts`, `src/pages/OpsDetailPage.tsx` |
| NLT-010: Progress stepper | Done | `src/components/ops/WorkflowProgressStepper.tsx`, `src/pages/OpsDetailPage.tsx` |
| NLT-011: E2E wiring | Done | `src/components/ops/CreateTableModal.tsx`, `src/pages/OpsPage.tsx` |

**Key decisions:**
- `instantly-push` now checks `instantly_org_credentials` first, falls back to `integration_credentials`
- Fixed unpinned `@supabase/supabase-js@2` import in `instantly-push`
- Workflow prompt detection uses keyword matching (`isWorkflowPrompt()`)
- Campaign creation passes email step content via custom variables (`{{step_N_subject}}`, `{{step_N_body}}`)
- Build verified: `npx vite build --mode staging` — success, no errors

### Session 2 — 2026-02-07

**Completed all 6 post-test fix stories (NLT-012 through NLT-017):**

| Story | Status | Files |
|-------|--------|-------|
| NLT-012: Post-enrichment name unmasking | Done | `supabase/functions/copilot-dynamic-table/index.ts` |
| NLT-013: Rich enrichment data + sign-off fix | Done | `supabase/functions/generate-email-sequence/index.ts` |
| NLT-014: Two-tier email gen (Claude + Gemini) | Done | `supabase/functions/generate-email-sequence/index.ts` |
| NLT-015: Broader search + sign-off passthrough | Done | `supabase/functions/ops-workflow-orchestrator/index.ts` |
| NLT-016: Instantly columns + campaign links | Done | `supabase/functions/ops-workflow-orchestrator/index.ts` |
| NLT-017: Deploy + verify E2E | Done | All 3 edge functions deployed to staging |

**Key decisions:**
- **NLT-014 revised per user feedback**: Instead of Claude generating templates with {{placeholders}}, Claude now writes REAL emails for the first prospect only (1 API call). Gemini then uses those as a style example to generate emails for all remaining prospects. Saves cost by minimizing Claude API calls.
- Post-enrichment step is non-fatal (try/catch) — table still works even if unmasking fails
- 3 new planner rules: person_seniorities for C-level, broaden city to region, 3x per_page for dedup headroom
- Instantly columns use `column_type='instantly'` with `integration_config.instantly_subtype` to differentiate `campaign_config` vs `push_action`
- Push status cells batch upserted in chunks of 500
- `instantly_campaign_links` record created with `field_mapping` for each email step column
- Build verified: `npx vite build --mode staging` — success, no errors
- All 3 functions deployed: `copilot-dynamic-table`, `generate-email-sequence`, `ops-workflow-orchestrator`
