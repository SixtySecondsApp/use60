# Progress Log — Landing Builder UX Redesign

## Current Feature: landing-builder-ux-redesign (5/5 stories) COMPLETE

### 2026-03-01 — LB-UX-001 through LB-UX-005 (all 5 stories)
**Feature**: Landing Builder UX Redesign (Preview Fix + Layout Overhaul)
**Stories completed**: 5/5
**Time**: ~25 minutes
**Gates**: lint 0 errors | test: pass (no test files changed)

**LB-UX-001 — Fix preview render bug**: `LandingCodePreview.tsx` now detects raw HTML (`<!DOCTYPE`) vs React JSX. Raw HTML renders directly as `srcDoc` bypassing Babel/React pipeline. Fixes "Script error" in assembly mode.

**LB-UX-002 — Wire right panel (LandingEditorPanel.tsx)**: New component wraps `SectionListPanel` (top) + `PropertiesPanel` (bottom). Clicking section → properties load. Drag-drop reorder → sections update. Progress indicator shows asset count.

**LB-UX-003 — FloatingChatBar.tsx**: Spotlight-style chat overlay — centered bottom, max-w-[600px], input always visible. Collapsed (120px) by default, expands upward to 50vh. Backdrop blur, smooth 300ms transition.

**LB-UX-004 — Hero layout assembly**: Assembly mode now: `flex row` with `AssemblyPreview` (flex-1) + `LandingEditorPanel` (w-80) side by side. FloatingChatBar absolute overlay at bottom center z-20. Old bottom-left 380x480 floating panel removed. Preview gets bottom padding to avoid chat overlap.

**LB-UX-005 — Polish**: Section click in preview → selects in editor panel (via shared `highlightSectionId`). Asset regeneration wired via `assetQueue.prioritise()`. Expand/collapse animates via `transition-all duration-300 ease-in-out`. Progress badge in editor header.

**Commits**: pending (uncommitted)

---

## Previous Feature: landing-builder-progressive (16/16 stories) COMPLETE

**PRD:** `docs/landing-page-builder/landing-page-builder-improvements.md`

### Execution Phases

```
Phase A — Foundation (EDIT-001 → 002 → 003)
  Schema migration → Types + workspace CRUD → Section renderer (16 templates)

Phase B — Progressive Assembly Engine (EDIT-004 → 005 → 006)
  Assembly orchestrator → Asset queue + retry → Progressive preview component

Phase C — Chat Editing + Pipeline Wiring (EDIT-007 ∥ 004, then 008 → 012 → 013 → 014)
  Section edit agent (clarify-first) → Preview-first layout → Phase restructure → Remove visuals → Builder agent JSON

Phase D — Advanced Editor (EDIT-009 → 010 ∥ 011)
  Editor toolbar → Section list (dnd-kit) ∥ Properties panel

Phase E — Polish (EDIT-015 ∥ 016)
  Export polish agent (AI pass + cache) ∥ Session recovery
```

**Critical path:** A → B → C → ship. Phases D and E can follow.

**Key decisions (from consult):**
1. Launch with 2 layout variants per section type (16 templates total), expand post-launch
2. Assembly phase collapses to full-width preview with floating chat panel (no right panel)
3. Section edit agent always clarifies ambiguous requests (creative director role)
4. Asset failures auto-retry with simplified prompt, then fall back to placeholder
5. Export triggers AI polish pass (Sonnet) for production-quality code, cached until sections change

### 2026-03-01 — EDIT-001 through EDIT-016 (all 16 stories)
**Feature**: Progressive Assembly Pipeline — Landing Page Builder
**Stories completed**: 16/16
**Time**: ~2 hours
**Gates**: lint 0 errors | test: pass (no test files changed)

**Phase A — Foundation**: Migration, types, workspace CRUD, section renderer (16 templates)
**Phase B — Assembly Engine**: Orchestrator (strategy+copy→sections), asset queue (priority, retry, placeholder), AssemblyPreview
**Phase C — Pipeline Wiring**: Section edit agent (clarify-first), 3-phase pipeline, floating chat panel, removed Visuals phase
**Phase D — Advanced Editor**: EditorToolbar (device toggles, mode switch), SectionListPanel (dnd-kit), PropertiesPanel (copy/layout/style)
**Phase E — Polish**: Export polish agent (cache, HTML download, clipboard), session recovery (detects workspace sections, restores assembly)

**Key architectural decisions**:
- parseWorkspaceToSections converts strategy+copy into LandingSection[] with brand config extraction
- AssetGenerationQueue processes serially: hero image → above-fold SVGs → remaining images → remaining SVGs
- sectionRenderer is pure (no side effects): 8 section types × 2 layout variants = 16 templates
- Section edit agent returns JSON ops (not prose), applied by phaseComponent in LandingPageBuilder
- Assembly mode: CopilotLayout replaced with full-width preview + 380px floating chat panel
- Session recovery: workspace.sections persisted every 2s, generating statuses reset to idle on reload

**Commits**:
- b1f399ac: feat: landing page builder — progressive assembly pipeline (EDIT-001 through EDIT-013)
- df1dd124: feat: landing builder — editor panels, export agent, session recovery (EDIT-009 through EDIT-016)

---

## Previous Feature: landing-builder-v2 (13/13 stories) COMPLETE

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
