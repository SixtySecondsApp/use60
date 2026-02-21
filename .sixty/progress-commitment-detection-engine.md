# Progress: Commitment Detection & Actioning Engine

## Execution Log

### 2026-02-20 — CDE-001 ✅
**Story**: Expand detect-intents with 5 new intent types + deadline parsing
**Files**: `supabase/functions/detect-intents/index.ts`
**Agent**: Sonnet
**Changes**: Added 6 new intent types (check_with_team, pricing_request, stakeholder_introduction, competitive_mention, timeline_signal, objection_blocker), deadline_parsed field, TODAY'S DATE context in prompt

---

### 2026-02-20 — CDE-002 ✅
**Story**: Create Intent Action Registry
**Files**: `supabase/functions/_shared/orchestrator/intentActionRegistry.ts` (new)
**Agent**: Sonnet
**Changes**: Created registry with all 10 intent configs, CHANNEL_KEYWORD_MAP, resolveIntentAction(), resolveSlackChannel()

---

### 2026-02-20 — CDE-003 ✅
**Story**: Wire registry into detect-intents orchestrator adapter
**Files**: `supabase/functions/_shared/orchestrator/adapters/detectIntents.ts`
**Agent**: Sonnet
**Changes**: Replaced hardcoded 2-intent mapping with registry-driven loop handling all 10 intents, deadline passthrough, skill/CRM/Slack event queuing

---

### 2026-02-20 — CDE-004 ✅
**Story**: Deadline passthrough in task-signal-processor
**Files**: `supabase/functions/task-signal-processor/index.ts`
**Agent**: Sonnet
**Changes**: Updated verbal_commitment_detected and buyer_commitment_due cases with deadline_parsed support, validated future dates, 4-hour buffer on expires_at

---

### 2026-02-20 — CDE-005 ✅
**Story**: Add Slack channel ping action
**Files**: `supabase/functions/_shared/orchestrator/adapters/pingSlackChannel.ts` (new), `adapters/index.ts`
**Agent**: Sonnet
**Changes**: New adapter with channel resolution, Block Kit message, DM fallback, registered in adapter index

---

### 2026-02-20 — CDE-006 ✅ (covered by CDE-002 + CDE-003)
**Story**: Wire skill-based actions for competitive/objection intents
**Notes**: Already handled by the registry-driven approach — linked_skill and crm_updates configs in CDE-002, queued by CDE-003

---

### 2026-02-20 — CDE-007 ✅
**Story**: CRM auto-update actions for timeline and pricing intents
**Files**: `supabase/functions/_shared/orchestrator/adapters/updateDealTimeline.ts` (new), `adapters/index.ts`
**Agent**: Sonnet
**Changes**: New adapter handling deal.close_date (HITL, only pull forward), deal.tags (direct), deal.meddicc_competition (HITL), contact.create_stakeholder (task creation)

---

### 2026-02-20 — CDE-008 ✅
**Story**: Update detect-intents SKILL.md with new intent documentation
**Files**: `skills/atomic/detect-intents/SKILL.md`
**Agent**: Sonnet
**Changes**: Added deadline_parsed output, 6 new intent mapping rows, intent-specific confidence thresholds section

---

### 2026-02-20 — OPUS REVIEW ✅
**Agent**: Opus
**Bugs Found & Fixed**: 4
1. **CRITICAL**: task-signal-processor rejected all new signal types (not in validSignalTypes allowlist, no case handlers) — Added all 10 new signal types with proper handlers
2. **Minor**: detectIntents adapter used wrong field name `transcript_text` vs `transcript` for tier2 fallback — Fixed to try both
3. **Logic**: updateDealTimeline overwrote pending approvals when multiple HITL updates in same batch — Changed to accumulate array
4. **Docs**: SKILL.md listed deadline_parsed as top-level output instead of executive_summary — Fixed

---

## Files Changed (11 total)

| File | Status |
|------|--------|
| `supabase/functions/detect-intents/index.ts` | Modified |
| `supabase/functions/_shared/orchestrator/intentActionRegistry.ts` | **New** |
| `supabase/functions/_shared/orchestrator/adapters/detectIntents.ts` | Modified |
| `supabase/functions/task-signal-processor/index.ts` | Modified |
| `supabase/functions/_shared/orchestrator/adapters/pingSlackChannel.ts` | **New** |
| `supabase/functions/_shared/orchestrator/adapters/updateDealTimeline.ts` | **New** |
| `supabase/functions/_shared/orchestrator/adapters/index.ts` | Modified |
| `skills/atomic/detect-intents/SKILL.md` | Modified |
