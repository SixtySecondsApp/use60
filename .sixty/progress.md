# Progress Log — Pipeline Real Deals Migration & Full Audit

## Feature: pipeline-migration (17 stories)

### Codebase Patterns (Pipeline)
- Pipeline components: `src/components/Pipeline/` (16 files + hooks subfolder)
- Pipeline data: `usePipelineData.ts` calls `get_pipeline_with_health` RPC, falls back to direct table queries
- CRM index: `crm_deal_index` table with `is_materialized`/`materialized_deal_id` — no materialization logic yet
- Deal CRUD: `useDealCRUD.ts` tries Edge Function first via `apiCall`, falls back to direct Supabase
- Seed data: 8 deals with patterned UUIDs (11111111- through 88888888-) in staging org `1d1b4274-c9c4-4cb7-9efc-243c90c86f4c`
- HubSpot webhook: unpinned `@supabase/supabase-js@2` import (broken), uses `legacyCorsHeaders`
- Attio webhook: correctly pinned `@2.43.4`, handles contacts+companies but NOT deals yet
- upsertCrmIndex.ts: pinned to `@2.39.3` (should be `@2.43.4`)
- DealIntelligenceSheet: SheetContent classes correct (`!top-16 !h-[calc(100vh-4rem)]`)
- useDealStages.ts: has `select('*')` in fallback path — needs explicit columns

### Dependency Graph
```
Phase 1 (Data):    PIPE-001 ─┬→ PIPE-003..008 (UI audit)
                   PIPE-002 ─┘  (parallel, independent)

Phase 2 (UI):      PIPE-003 ═══ PIPE-004 (parallel: Kanban + Table)
                   PIPE-005 → PIPE-006 (Create → Edit/Delete)
                   PIPE-007 ═══ PIPE-008 (parallel: Filters + Sheet)

Phase 3 (Backend): PIPE-009 ─┬→ PIPE-010 (HubSpot webhook)
                             ├→ PIPE-011 (Attio webhook)
                             └→ PIPE-013 → PIPE-014 + PIPE-015 (Import UI)
                   PIPE-012 ═══ (parallel: fix import version)

Phase 5 (Verify):  PIPE-016 ═══ PIPE-017 (parallel verification)
```

---

# Previous Feature: Follow-Up Email v2

## Codebase Patterns
- Edge functions: `getCorsHeaders(req)` from `_shared/corsHelper.ts`, pin `@supabase/supabase-js@2.43.4`
- Writing style: `user_writing_styles` table (not `writing_styles`), `style_metadata` JSONB has nested `tone.formality` etc.
- Attendee resolution: `meeting_attendees` → `meeting_contacts` → `contacts` → placeholder fallback
- Action items: `meeting_action_items.title` (not `description`), `deadline_at` (not `due_date`)
- RAG: meeting-analytics V2 via `/api/search`, auth via `x-edge-function-secret` header
- Composer: `_shared/follow-up/composer.ts` — two paths: `composeReturnMeetingFollowUp` (with RAG) and `composeFirstMeetingFollowUp`
- SSE streaming: `generate-follow-up` POST returns `event: step` + `event: result` events

## Previous Session Fixes (Pre-V2)
- Fixed table name `writing_styles` → `user_writing_styles` with correct columns
- Fixed action items columns: `description` → `title`, `due_date` → `deadline_at`
- Fixed attendee join hang: split embedded resource join into two separate queries
- Added placeholder attendee fallback instead of hard-stopping generation
- Fixed frontend SSE error handler: `reader.cancel()` on error so spinner stops
- Added em dash ban to both composer prompts
- Deployed `generate-follow-up` to both production and staging

---

## Session Log

### 2026-02-25 — FUV2-001 + FUV2-003 (parallel) ✅
**Stories**: Enrich analysis object + Styled email preview
**Files**: supabase/functions/generate-follow-up/index.ts, src/pages/platform/FollowUpDemoPage.tsx
**Time**: 15 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: extractKeyTopics/extractBuyingSignals use regex on summary text; renderEmailBody handles paragraphs, bullet lists, bold

---

### 2026-02-25 — FUV2-006 + FUV2-007 + FUV2-008 (parallel) ✅
**Stories**: RAG findings display + Step timing + Degradation warnings
**Files**: supabase/functions/generate-follow-up/index.ts, src/pages/platform/FollowUpDemoPage.tsx
**Time**: 12 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: stepTimers Map tracks per-step duration; ragSummary returns first 2 chunks truncated to 120 chars

---

### 2026-02-25 — FUV2-002 ✅
**Story**: Add regenerate-with-guidance flow (backend + frontend)
**Files**: generate-follow-up/index.ts, _shared/follow-up/composer.ts, FollowUpDemoPage.tsx
**Time**: 18 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: cached_rag_context skips RAG queries on regeneration; guidance appended to user message in composer

---

### 2026-02-25 — FUV2-004 ✅
**Story**: Add inline email editor with edit/preview toggle
**Files**: src/pages/platform/FollowUpDemoPage.tsx
**Time**: 12 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: EmailPreview now accepts editing props; edited content persists across preview/edit toggles; Cancel reverts to original

---

### 2026-02-25 — FUV2-005 ✅
**Story**: Add Send to Slack approval button with preview block
**Files**: supabase/functions/generate-follow-up/index.ts, src/pages/platform/FollowUpDemoPage.tsx
**Time**: 20 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: sendSlackDM from deliverySlack.ts; bot token from slack_org_settings; user ID from slack_user_mappings; Block Kit with approve/edit/dismiss actions

---
