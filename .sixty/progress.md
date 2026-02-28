# Progress Log — Landing Builder v2

## Current Feature: landing-builder-v2 (13/13 stories) COMPLETE

---

### 2026-02-28 — LBV2-001 + LBV2-002 (parallel) + LBV2-003 + LBV2-012 (parallel)
**Stories**: Workspace schema + generate-svg edge function + workspace service + geminiSvgService
**Files**: migration, generate-svg/index.ts, landingBuilderWorkspaceService.ts, geminiSvgService.ts, useLandingBuilderWorkspace.ts, types.ts
**Gates**: lint pass | test: n/a (new files)
**Learnings**: Gemini 3.1 Pro uses thinkingConfig.thinkingBudget for thinking models; response has parts with thought=true to filter

---

### 2026-02-28 — LBV2-004
**Story**: Refactor LandingPageBuilder to workspace state
**Files**: LandingPageBuilder.tsx
**Gates**: lint pass
**Learnings**: buildWorkspaceContext gives each phase only the data it needs; workspace.phase_status tracks per-phase state

---

### 2026-02-28 — LBV2-005 + LBV2-006 + LBV2-007 + LBV2-008 (4 agents)
**Stories**: Strategist + Copywriter + Visual Artist + Builder agents
**Files**: agents/strategistAgent.ts, copywriterAgent.ts, visualArtistAgent.ts, builderAgent.ts, LandingPageBuilder.tsx
**Gates**: lint pass
**Learnings**: Agents are system prompt configurations injected via builderApiTransform; gap detection logic in strategistAgent for follow-up questions

---

### 2026-02-28 — LBV2-009
**Story**: Agent badges on ChatMessage and PhaseTimeline
**Files**: AssistantShell.tsx, LandingPageBuilder.tsx, PhaseTimeline.tsx
**Gates**: lint pass
**Learnings**: messageBadge prop on AssistantShell renders above assistant messages; AGENT_BADGES maps role to color

---

### 2026-02-28 — LBV2-010 + LBV2-011 (parallel)
**Stories**: Wizard reduction (7 to 5 questions) + SvgGallery component
**Files**: DiscoveryWizard.tsx, SvgGallery.tsx
**Gates**: lint pass
**Learnings**: Tone and sections inferred by Strategist; SvgGallery uses approve/reject/regenerate pattern with geminiSvgService

---

# Previous: Follow-Up Email v2 (COMPLETE)

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
