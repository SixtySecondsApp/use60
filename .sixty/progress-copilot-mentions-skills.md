# Progress Log — Copilot @ Mentions & /Skills

## Codebase Patterns
<!-- Reusable learnings across all features -->

- Chat input was a plain `<textarea>` in `AssistantShell.tsx` — replaced with RichCopilotInput (contenteditable)
- `CopilotContext.tsx` `sendMessage()` is the orchestrator: autonomous → agent → regular mode routing
- Autonomous mode (active default) streams from `copilot-autonomous` edge function via `useCopilotChat.ts`
- Skills live in `platform_skills` → `organization_skills` (compiled per-org) — loaded via `get_organization_skills_for_agent` RPC
- Entity resolution already exists in `_shared/resolveEntityAdapter.ts` (first-name-only → full contact)
- Contact/company/deal services: `apiContactService.ts`, `companyService.ts`, `dealTruthService.ts`
- Column gotchas: contacts/companies/deals use `owner_id` (NOT `user_id`), meetings use `owner_user_id`
- Structured responses render in `ChatMessage.tsx` with priority-based component routing
- New edge functions MUST use `getCorsHeaders(req)` from `corsHelper.ts`

---

## Session Log

### 2026-02-22 — MENT-001 ✅
**Story**: Create entity-search edge function
**Files**: supabase/functions/entity-search/index.ts
**Learnings**: Used parallel search across contacts/companies/deals with weighted scoring

---

### 2026-02-22 — MENT-002 ✅
**Story**: Create useEntitySearch React Query hook
**Files**: src/lib/hooks/useEntitySearch.ts, src/lib/types/entitySearch.ts
**Learnings**: 150ms debounce, 30s stale time, abort controller for in-flight cancellation

---

### 2026-02-22 — MENT-003 ✅
**Story**: Build EntityMentionDropdown autocomplete component
**Files**: src/components/copilot/EntityMentionDropdown.tsx
**Learnings**: Fixed position dropdown near caret, keyboard navigation via document-level keydown listener

---

### 2026-02-22 — MENT-004 ✅
**Story**: Replace textarea with RichCopilotInput (contenteditable)
**Files**: src/components/copilot/RichCopilotInput.tsx, src/components/assistant/AssistantShell.tsx
**Learnings**: contenteditable with chip insertion. Paste handler strips HTML. Backspace removes whole chip.

---

### 2026-02-22 — MENT-005 ✅
**Story**: Wire EntityMentionDropdown into RichCopilotInput
**Files**: src/components/copilot/RichCopilotInput.tsx, src/components/assistant/AssistantShell.tsx
**Learnings**: @ trigger detected via regex on text before caret. mentionStartRef tracks where @ was typed for removal on selection.

---

### 2026-02-22 — MENT-006 ✅
**Story**: Build entity context resolver service
**Files**: src/lib/services/entityContextService.ts
**Learnings**: Parallel fetch for each entity type. Context capped at ~2000 tokens per entity. Uses maybeSingle() for safety.

---

### 2026-02-22 — MENT-007 ✅
**Story**: Inject entity context into copilot sendMessage
**Files**: src/lib/contexts/CopilotContext.tsx
**Learnings**: Dynamic import of entityContextService to avoid bundle bloat. enrichedMessage used for all 3 modes (autonomous/agent/regular). User sees original message, AI sees enriched.

---

### 2026-02-22 — SKILL-001 ✅
**Story**: Create copilot_skill_executions tracking table
**Files**: supabase/migrations/20260222600001_copilot_skill_executions.sql
**Learnings**: RLS policy uses auth.uid() = user_id for insert/select

---

### 2026-02-22 — SKILL-002, SKILL-003 ✅
**Story**: Build SkillCommandDropdown and wire into input
**Files**: src/components/copilot/SkillCommandDropdown.tsx, src/components/assistant/AssistantShell.tsx
**Learnings**: 10 built-in skills hardcoded in dropdown (will be replaced by dynamic from org_skills later). Grouped by category.

---

### 2026-02-22 — SKILL-004, SKILL-005 ✅
**Story**: Skill parser, validator, and execution pipeline
**Files**: src/lib/copilot/skillCommandParser.ts, src/lib/contexts/CopilotContext.tsx
**Learnings**: Skill command parsing happens client-side. Validation checks required entity types. Enriched prompt built with <skill_command> and <entity_context> tags. Execution tracked via fire-and-forget insert.

---

### 2026-02-22 — SKILL-006 ✅
**Story**: Build SkillOutputCard response component
**Files**: src/components/copilot/responses/SkillOutputCard.tsx
**Learnings**: Expandable card with header/body/footer. Tabbed variant for multi-section outputs. Actions: Copy, Send Email, Create Task, Regenerate.

---

### 2026-02-22 — BSKILL-001 through BSKILL-004 ✅
**Story**: Create all 10 skill definitions
**Files**: skills/atomic/copilot-{proposal,followup,research,summary,objection,battlecard,handoff,chase,agenda,win}/SKILL.md
**Learnings**: All follow V2 frontmatter format with triggers, keywords, inputs/outputs. Each has /command trigger at 0.95 confidence.

---

### 2026-02-22 — POL-001 ✅
**Story**: Natural language intent detection for skill suggestion
**Files**: src/lib/copilot/skillIntentDetector.ts, src/components/copilot/SkillSuggestionBanner.tsx
**Learnings**: Keyword-based detection with confidence scoring (base 0.65, boosted by multi-match and entity presence). Returns null if already /command. Banner uses violet theme with Sparkles icon.

---

### 2026-02-22 — POL-002 ✅
**Story**: Interactive entity chip expansion (click-to-expand popover)
**Files**: src/components/copilot/EntityChipPopover.tsx
**Learnings**: Pure presentational — metadata passed at send time, no React Query fetching. Popover position adapts (above/below) based on viewport space. Emits open_contact/open_deal via onActionClick.

---

### 2026-02-22 — POL-003 ✅
**Story**: Slack @ mention resolution (fuzzy entity matching)
**Files**: supabase/functions/_shared/slackEntityResolver.ts
**Learnings**: Four regex pattern groups for name extraction (explicit @, preposition-based, possessive, contextual). Stop word filtering reduces false positives. Block Kit disambiguation buttons carry JSON payloads. Uses Deno-compatible esm.sh imports.

---

### 2026-02-22 — POL-004 ✅
**Story**: Stale data warnings and ghost chips for deleted entities
**Files**: src/components/copilot/EntityChip.tsx
**Learnings**: Three states: normal, stale (>24h sync, yellow AlertTriangle), ghost (deleted, strikethrough + Ghost icon). Ghost takes priority over stale. Exports isStaleSync() helper for reuse. Keyboard accessible with role="button".

---
