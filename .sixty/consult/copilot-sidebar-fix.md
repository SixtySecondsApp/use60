# Consult Report: Copilot Sidebar — Full Fix

Generated: 2026-02-27

## User Request

"I want this entire bar inside the copilot screen to work — it currently inconsistently displays updated data and the history doesn't save nor allows me to create new conversations and switch between conversation history. Make sure this is working exactly as intended."

## Clarifications

- **Conversation model**: Multiple conversations (like ChatGPT) — create, switch, persist
- **Connected section**: Show real integration status from user's settings
- **Scope**: Full fix — all 5 sections working seamlessly

---

## Architecture Analysis

### Current State

The copilot sidebar (`CopilotRightPanel`) has 5 sections:

| Section | Status | Issue |
|---------|--------|-------|
| **Progress** | Working | Derives from agent tool calls correctly |
| **Action Items** | Working | Reads from `useActionItemStore`, approval flow functional |
| **Context** | Working | Merges tool results + DB queries correctly |
| **Connected** | Broken | Hardcoded defaults, never fetches real status |
| **History** | Broken | Renders but conversations don't persist or switch |

### Root Cause: Two Competing Conversation Systems

**System 1 — Main Session (useCopilotChat.ts:603-659)**:
- On mount, calls `getMainSession()` → always returns/creates ONE session with `is_main_session=true`
- Sets `conversationId` to main session ID
- Loads persisted messages from that single session

**System 2 — URL Routing (CopilotPage.tsx:33-73)**:
- Generates UUID for URL: `/copilot/{uuid}`
- Calls `setConversationId(uuid)` or `loadConversation(uuid)`
- Expects each URL to be a unique conversation

**The Conflict**:
1. User navigates to `/copilot/new-uuid`
2. `CopilotPage` calls `setConversationId(new-uuid)` (state-only, no DB record)
3. `useCopilotChat` effect fires `getMainSession()` → sets `conversationId` to `main-session-id`
4. Race condition: which one wins depends on async timing
5. Messages get saved to main session, not the URL conversation
6. On reload, main session loads — URL conversation has no messages

### Conversation Lifecycle Bugs

1. **No DB record created for new conversations** — `setConversationId()` only updates React state, never inserts into `copilot_conversations`
2. **`loadConversation()` fails silently** — if conversation doesn't exist in DB, catches error and falls back to `setConversationId()` (state-only)
3. **`startNewChat()` clears state but doesn't create DB record** — new conversation has no persistence target
4. **Message persistence uses `conversationIdRef`** — ref may be stale due to useEffect lag, messages go to wrong conversation
5. **No conversation title generation** — conversations have no meaningful title, always "New Conversation"

### Connected Section Bugs

1. **`integrations` prop never passed** from `Copilot.tsx` to `CopilotRightPanel`
2. **Defaults to hardcoded list** with `connected: false` for all
3. **Existing hooks available** — `useHubSpotIntegration`, `useFathomIntegration`, etc. all return `isConnected` boolean
4. **No aggregate hook** to get status of all integrations at once

### History Section Issues

1. **UI renders correctly** when callbacks are passed (they ARE passed from `Copilot.tsx`)
2. **`useConversationHistory` queries work** — fetches from `copilot_conversations` + message counts
3. **BUT no conversations exist in DB** because new conversation creation doesn't persist
4. **Conversation switching navigates URL** but `loadConversation()` fails (no DB record)
5. **Performance: fetches ALL messages** just to get counts (should use COUNT aggregate)

---

## Recommended Execution Plan

### Phase 1: Fix Conversation Lifecycle (Foundation)

**COPILOT-001: Create `ensureConversation` RPC for atomic conversation creation**
- Create DB function that inserts conversation if not exists (upsert-like)
- Accept `conversation_id`, `user_id`, `org_id`, `title`
- Returns conversation record (created or existing)
- Prevents race conditions with `ON CONFLICT DO NOTHING`
- Migration file needed

**COPILOT-002: Refactor conversation initialization in `useCopilotChat`**
- Remove `getMainSession()` auto-load behavior
- Instead: accept `conversationId` as a prop/option
- If `conversationId` provided: load that conversation's messages
- If not provided: don't auto-create — let the caller decide
- Add `createConversation()` method to hook's return value
- Fix `conversationIdRef` sync to use layout effect (immediate, not deferred)

**COPILOT-003: Fix `CopilotPage` conversation routing**
- On mount with URL ID: call `ensureConversation()` RPC to create DB record
- On mount without URL ID: generate UUID, create DB record, redirect
- On `startNewChat()`: generate UUID, create DB record, navigate
- Remove `setConversationId()` calls that bypass DB
- Ensure conversation exists in DB BEFORE any message can be sent

**COPILOT-004: Fix `CopilotContext` to coordinate with new lifecycle**
- Update `loadConversation()` to use `ensureConversation()` (create-if-missing)
- Update `setConversationId()` to also call `ensureConversation()`
- Update `startNewChat()` to create DB record for new conversation
- Update `sendMessage()` to verify `conversationId` is persisted before sending
- Add conversation title generation from first user message

### Phase 2: Fix History & Switching

**COPILOT-005: Fix conversation switching flow**
- When user clicks conversation in history: navigate to `/copilot/{id}`
- `CopilotPage` detects URL change → loads conversation messages
- Clear current messages, load new conversation's messages
- Update `initializedForUrl` ref properly on re-navigation
- Fix autonomous copilot messages to clear on conversation switch

**COPILOT-006: Add conversation title auto-generation**
- After first user message: extract title (first 50 chars or AI-generated)
- Update `copilot_conversations.title` in DB
- Invalidate conversation history query cache
- Show title in History section instead of "New Conversation"

**COPILOT-007: Optimize `useConversationHistory` performance**
- Replace full message fetch with COUNT aggregate query
- Use `select('conversation_id.count()')` or RPC for message counts
- Fetch only first user message for preview (LIMIT 1 per conversation)
- Reduce bandwidth from fetching ALL messages for ALL conversations

### Phase 3: Fix Connected Section

**COPILOT-008: Create `useCopilotIntegrationStatus` hook**
- Aggregate integration status from existing hooks:
  - HubSpot: `useHubSpotIntegration().isConnected`
  - Fathom: `useFathomIntegration().isConnected`
  - Slack: check `user_settings` for slack token
  - Calendar: check Google Calendar OAuth status
- Return `Integration[]` array matching `CopilotRightPanel`'s interface
- Cache with 60s stale time (React Query)

**COPILOT-009: Wire real integration status to ConnectedSection**
- Import `useCopilotIntegrationStatus` in `Copilot.tsx`
- Pass result as `integrations` prop to `CopilotRightPanel`
- Remove hardcoded defaults in `ConnectedSection`
- Show accurate connected/disconnected state with count

### Phase 4: Polish & Error Handling

**COPILOT-010: Add user-visible persistence error handling**
- Replace `console.warn` with toast feedback on message persistence failure
- Show retry option if message fails to save
- Add visual indicator (warning icon) on messages that aren't persisted
- Handle FK constraint violations gracefully (auto-create conversation)

**COPILOT-011: Fix silent failures and edge cases**
- Handle conversation deletion → navigate to new conversation
- Handle org switching → clear conversation state, start fresh
- Fix `useDeleteConversation` to add user_id filter on message deletion (RLS gap)
- Add loading state while conversation is being created/loaded
- Fix tool call timestamps (persist `startedAt` from metadata, not `new Date()`)

---

## Story Dependency Graph

```
COPILOT-001 (RPC)
    ├── COPILOT-002 (Hook refactor) ──┐
    ├── COPILOT-003 (Page routing) ───┤
    └── COPILOT-004 (Context fix) ────┤
                                       ├── COPILOT-005 (Switching)
                                       ├── COPILOT-006 (Titles)
                                       └── COPILOT-007 (Performance)

COPILOT-008 (Integration hook) ── COPILOT-009 (Wire to UI)

COPILOT-010 (Error handling) ── independent
COPILOT-011 (Edge cases) ── depends on COPILOT-005
```

## Parallel Opportunities

- **Group A**: COPILOT-008 + COPILOT-009 (Connected section) — fully independent of conversation fixes
- **Group B**: COPILOT-006 (titles) + COPILOT-007 (performance) — can run in parallel after Phase 1
- **Group C**: COPILOT-010 (errors) — independent, can run anytime

## Estimate

| Phase | Stories | Estimate |
|-------|---------|----------|
| Phase 1: Foundation | 4 stories | 2-3 hours |
| Phase 2: History | 3 stories | 1.5-2 hours |
| Phase 3: Connected | 2 stories | 45min-1 hour |
| Phase 4: Polish | 2 stories | 1-1.5 hours |
| **Total** | **11 stories** | **5-7 hours** |

## Files Affected

### Modified
- `src/lib/hooks/useCopilotChat.ts` — Remove main session auto-load, accept conversationId prop
- `src/lib/contexts/CopilotContext.tsx` — Coordinate conversation lifecycle
- `src/pages/CopilotPage.tsx` — Fix routing to create DB records
- `src/components/Copilot.tsx` — Pass integration status prop
- `src/components/copilot/CopilotRightPanel.tsx` — Remove hardcoded integration defaults
- `src/lib/hooks/useConversationHistory.ts` — Optimize queries, add count aggregation
- `src/lib/services/copilotSessionService.ts` — Remove getMainSession dependency

### New
- `supabase/migrations/XXXXXX_copilot_ensure_conversation.sql` — RPC + indexes
- `src/lib/hooks/useCopilotIntegrationStatus.ts` — Aggregate integration status hook
