# Copilot Audit Report — Post-Implementation Deep Review

Generated: 2026-02-27
Auditors: bug-hunter, design-auditor, code-reviewer (3 parallel agents)

## Executive Summary

Three specialized agents audited the entire copilot sidebar implementation across 10+ files. Found **5 critical bugs**, **6 high-severity issues**, **9 medium issues**, and **11 low-severity findings** across three categories.

### Findings by Category

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| **Bugs & Race Conditions** | 3 | 3 | 4 | 4 | 14 |
| **Design & UX** | 0 | 2 | 5 | 5 | 12 |
| **Architecture & Code Quality** | 2 | 4 | 8 | 6 | 20 |

### Most Dangerous Issues

1. **RPC security hole** — `ensure_copilot_conversation` returns other users' conversation metadata (title, timestamps) because SELECT doesn't filter by user_id
2. **Blank chat on history click** — In autonomous mode, loaded messages go into `state.messages` but UI reads from `autonomousCopilot.messages` (which was cleared)
3. **Crash on first render** — `ensureConversation` is defined after `startNewChat` in CopilotContext, causing undefined function error
4. **Seeded prompt race condition** — setTimeout(100ms) hack + stale closure = messages sent to wrong conversation
5. **window.location.href** — ConnectedSection navigation destroys conversation state via full page reload

---

## Deduplicated Finding Tracker

### Cross-Agent Agreement (found by 2+ agents)

| Finding | Bug Hunter | Code Reviewer | Design Auditor |
|---------|------------|---------------|----------------|
| Dual message store / blank history | BUG-002 | ARCH-001, ARCH-002 | — |
| RPC SELECT leaks metadata | BUG-010 | ARCH-006 | — |
| Title uses wrong conversationId | BUG-007 | ARCH-005 | — |
| History query fetches all messages | BUG-006 | ARCH-004 | — |
| sendMessage dependency array | BUG-004 | ARCH-010 | — |
| as any in integration hook | BUG-008 | ARCH-019 | — |
| Seeded prompt timing | BUG-003 | ARCH-018 | — |
| window.location.href navigation | — | — | DESIGN-006 |

---

## Consolidated Plan: 14 Stories

### Phase 1: Critical Fixes (must fix before shipping)

| # | Story | Severity | Est |
|---|-------|----------|-----|
| AUDIT-001 | Fix RPC security — add user_id filter to SELECT | Critical | 10m |
| AUDIT-002 | Fix dual message store — inject loaded messages into autonomousCopilot | Critical | 30m |
| AUDIT-003 | Fix ensureConversation declaration order crash | Critical | 15m |
| AUDIT-004 | Fix seeded prompt race — remove setTimeout hack | Critical | 15m |
| AUDIT-005 | Fix title auto-generation using wrong conversationId | High | 10m |

### Phase 2: High Priority (parallelizable)

| # | Story | Severity | Est |
|---|-------|----------|-----|
| AUDIT-006 | ConnectedSection: React Router instead of window.location | High | 10m |
| AUDIT-007 | Deletion: handle session summaries FK + styled confirm dialog | High | 20m |
| AUDIT-008 | sendMessage deps + message persistence ordering | High | 15m |
| AUDIT-009 | Integration hook: remove as any, add error handling, fix logo fallback | Medium | 20m |

### Phase 3: Performance & UX

| # | Story | Severity | Est |
|---|-------|----------|-----|
| AUDIT-010 | Make Context + Connected sections collapsible | Medium | 15m |
| AUDIT-011 | Conversation summaries RPC for history performance | High | 25m |
| AUDIT-012 | Memoize getActiveMessages + debounce scanning effects | Medium | 20m |

### Phase 4: Cleanup

| # | Story | Severity | Est |
|---|-------|----------|-----|
| AUDIT-013 | Remove dead code: getMainSession, email modal, agent mode | Medium | 20m |
| AUDIT-014 | Design polish: colors, contrast, badge sizing | Low | 10m |

**Total: ~3.5 hours estimated**

---

## Deferred / Future Considerations

These were identified but not included in the plan (lower priority):

- **Conversation pagination** (ARCH-011): Hard limit of 20, no load more
- **Message pagination** (ARCH-012): Hard limit of 50, no load more
- **Conversation search** (ARCH-013): No search/filter in history
- **Conversation rename** (ARCH-013): No rename capability
- **Compaction pipeline** (ARCH-008): Fully built but never triggered
- **Desktop panel toggle** (DESIGN-008): Right panel can't be hidden on desktop
- **Bot avatar light mode** (DESIGN-011): Hardcoded dark colors
- **Link color consistency** (DESIGN-014): Blue vs violet accent in markdown

---

## Files Affected

### Migrations (new)
- `supabase/migrations/20260227110000_conversation_summaries_rpc.sql`

### Modified (update to existing changes)
- `supabase/migrations/20260227100000_copilot_ensure_conversation.sql` — Security fix
- `src/lib/contexts/CopilotContext.tsx` — Declaration order, message injection, title fix, memoization
- `src/lib/hooks/useCopilotChat.ts` — Dependency array, message ordering
- `src/pages/CopilotPage.tsx` — Seeded prompt flow, return type
- `src/components/copilot/CopilotRightPanel.tsx` — Collapsibility, navigation, logo fallback
- `src/components/copilot/ConversationHistory.tsx` — Confirm dialog, colors
- `src/lib/hooks/useConversationHistory.ts` — Deletion FK, RPC query
- `src/lib/hooks/useCopilotIntegrationStatus.ts` — Type safety, error handling
- `src/lib/services/copilotSessionService.ts` — Dead code removal
- `src/components/Copilot.tsx` — Dead code removal, memoization
