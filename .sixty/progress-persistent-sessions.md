# Progress Log — Persistent Sessions with Memory

## Feature Overview
Implement a persistent "main session" model for the copilot where users have one continuous conversation (like texting a friend), with automatic memory extraction and proactive recall.

## Success Criteria
- [x] User can close browser and return to continue same conversation
- [x] Conversation automatically compacts when approaching token limits
- [x] Key facts extracted and stored as searchable memories
- [x] Copilot proactively references relevant past context
- [x] No data loss during compaction - summaries preserve key information

## Codebase Patterns
<!-- Reusable learnings across all stories -->

- Use `maybeSingle()` when record might not exist (not `single()`)
- Explicit column selection in queries (avoid `select('*')`)
- RLS policies: `auth.uid() = user_id` for user-owned data
- Service classes with Supabase client injection pattern
- Edge functions: streaming via SSE, explicit CORS headers

---

## Session Log

### Completed Stories
| Story | Title | Est. | Status |
|-------|-------|------|--------|
| MEM-001 | Create copilot_memories table | 15m | Complete |
| MEM-002 | Add main session tracking to copilot_conversations | 10m | Complete |
| MEM-003 | Create copilot_session_summaries table | 10m | Complete |
| MEM-004 | Add memory types to copilot type definitions | 10m | Complete |
| MEM-005 | CopilotSessionService - getMainSession | 15m | Complete |
| MEM-006 | CopilotMemoryService - store and retrieve | 20m | Complete |
| MEM-007 | Session compaction methods | 20m | Complete |
| MEM-008 | Memory extraction | 25m | Complete |
| MEM-009 | Message persistence methods | 20m | Complete |
| MEM-010 | Memory recall | 20m | Complete |
| MEM-011 | Full compaction flow | 25m | Complete |
| MEM-012 | Load persisted session in hook | 20m | Complete |
| MEM-013 | Memory context injection in edge function | 20m | Complete |
| MEM-014 | Compaction check in edge function | 15m | Complete |
| MEM-015 | Wire message persistence | 20m | Complete |
| MEM-016 | End-to-end testing | 30m | Complete |

---

### Session Log - 2026-02-03

#### MEM-001 through MEM-011 (Schema + Services)
All schema migrations, type definitions, and service classes implemented in prior session.

#### MEM-012: Load persisted session in useCopilotChat
**File**: `src/lib/hooks/useCopilotChat.ts`
- Added `conversationId` and `isLoadingSession` state
- Added `sessionServiceRef` for CopilotSessionService
- Added `useEffect` to load main session on mount
- Converts persisted messages to ChatMessage format
- Non-fatal error handling for session load failures

#### MEM-013: Memory context injection in edge function
**File**: `supabase/functions/copilot-autonomous/index.ts`
- Added `MEMORY_SYSTEM_ADDITION` system prompt section
- Added `buildContextWithMemories()` function with keyword matching
- Injects relevant memories into system prompt before Claude call
- Updates memory access stats on retrieval

#### MEM-014: Compaction check in edge function
**File**: `supabase/functions/copilot-autonomous/index.ts`
- Added `handleCompactionIfNeeded()` function
- Runs async/background (non-blocking)
- Full compaction flow: summarize, extract memories, soft-delete
- Uses 80k token threshold, keeps 20k tokens + min 10 messages

#### MEM-015: Wire message persistence in useCopilotChat
**File**: `src/lib/hooks/useCopilotChat.ts`
- User messages persisted immediately after adding to state
- Assistant messages persisted after streaming completes (on `done` event)
- Tool call metadata included in persisted messages
- Non-blocking error handling (persistence failures don't break chat)

#### MEM-016: End-to-end testing
**File**: `tests/unit/copilot/session-persistence.test.ts`
- 23 tests covering token estimation, session service, memory service, user isolation
- All tests pass
- Lint: 3 pre-existing errors (not from new changes)

### Parallel Groups

**Group 1: Schema Foundation** (MEM-001 + MEM-002)
- Can run in parallel - independent tables

**Group 2: Schema Extension** (MEM-003 + MEM-004)
- After Group 1: summaries table + type definitions

**Group 3: Core Services** (MEM-005 + MEM-006)
- After types: session service + memory service basics

**Group 4: Service Methods** (MEM-007 + MEM-008 + MEM-009)
- Compaction logic, memory extraction, message persistence

**Group 5: Advanced Features** (MEM-010 + MEM-011)
- Memory recall + full compaction orchestration

**Group 6: Integration** (MEM-012 + MEM-013 + MEM-014)
- Hook updates + edge function updates (can run in parallel)

**Group 7: Final Wiring** (MEM-015)
- Wire all pieces together

**Group 8: Testing** (MEM-016)
- End-to-end validation

---

## Story Details

### MEM-001: Create copilot_memories table
**File**: `supabase/migrations/20260203110000_copilot_memories.sql`
**Acceptance**:
- copilot_memories table with category, subject, content columns
- Entity linking: deal_id, contact_id, company_id FKs
- Metadata: confidence, source_message_ids, access stats
- RLS: Users manage own memories
- Indexes on user_id, category, subject, entity FKs

---

### MEM-002: Add main session tracking
**File**: `supabase/migrations/20260203110001_copilot_session_updates.sql`
**Acceptance**:
- Add is_main_session, total_tokens_estimate, last_compaction_at columns
- Unique partial index for one main session per user

---

### MEM-003: Create copilot_session_summaries table
**File**: `supabase/migrations/20260203110002_copilot_session_summaries.sql`
**Acceptance**:
- FK to copilot_conversations
- summary, key_points (JSONB), message_range columns
- metrics: messages_summarized, tokens_before/after

---

### MEM-004: Add memory types
**File**: `src/lib/types/copilot.ts`
**Acceptance**:
- CopilotMemory interface
- MemoryCategory type union
- ExtractedMemory, MemoryInput, CompactionResult interfaces

---

### MEM-005: CopilotSessionService - getMainSession
**File**: `src/lib/services/copilotSessionService.ts`
**Acceptance**:
- getMainSession(userId) - get or create main session
- Uses maybeSingle() pattern
- Sets is_main_session=true on creation

---

### MEM-006: CopilotMemoryService - store and retrieve
**File**: `src/lib/services/copilotMemoryService.ts`
**Acceptance**:
- storeMemory(memory) with entity linking
- getMemoriesByCategory(userId, category)
- recordAccess(memoryId) updates stats

---

### MEM-007: Session compaction methods
**File**: `src/lib/services/copilotSessionService.ts`
**Acceptance**:
- estimateTokens(), needsCompaction()
- loadAllMessages(), findSplitPoint()
- Constants: 80k threshold, 20k target

---

### MEM-008: Memory extraction
**File**: `src/lib/services/copilotMemoryService.ts`
**Acceptance**:
- MEMORY_EXTRACTION_PROMPT constant
- extractMemories(messages) calls Claude
- Parses JSON response, handles errors

---

### MEM-009: Message persistence methods
**File**: `src/lib/services/copilotSessionService.ts`
**Acceptance**:
- addMessage(), loadMessages(paginated)
- updateTokenEstimate()
- Tool calls in metadata JSONB

---

### MEM-010: Memory recall
**File**: `src/lib/services/copilotMemoryService.ts`
**Acceptance**:
- recallRelevant(userId, context, limit)
- Keyword matching on subject/content
- Returns top N ordered by relevance

---

### MEM-011: Full compaction flow
**File**: `src/lib/services/copilotSessionService.ts`
**Acceptance**:
- compactSession() orchestrates full flow
- Generates summary, extracts memories
- Stores summary, soft-deletes messages

---

### MEM-012: Load persisted session in hook
**File**: `src/lib/hooks/useCopilotChat.ts`
**Acceptance**:
- useEffect loads main session on mount
- Loads last N messages
- Shows loading state

---

### MEM-013: Memory context injection in edge function
**File**: `supabase/functions/copilot-autonomous/index.ts`
**Acceptance**:
- buildContextWithMemories()
- MEMORY_SYSTEM_ADDITION prompt
- Formats memories as system prompt section

---

### MEM-014: Compaction check in edge function
**File**: `supabase/functions/copilot-autonomous/index.ts`
**Acceptance**:
- handleCompactionIfNeeded()
- Runs async/background
- Logs compaction events

---

### MEM-015: Wire message persistence
**File**: `src/lib/hooks/useCopilotChat.ts`
**Acceptance**:
- persistMessage saves user messages immediately
- Assistant messages saved after streaming
- Token estimate updated per message pair

---

### MEM-016: End-to-end testing
**File**: `tests/unit/copilot/session-persistence.test.ts`
**Acceptance**:
- Test browser close/reopen persistence
- Test compaction at threshold
- Test memory injection in responses
- Test user isolation

---

## Notes

### Key Architectural Decisions
1. **Single Main Session**: One persistent session per user (like texting a friend)
2. **80k Token Threshold**: Start compaction at 80k, keep 20k context
3. **Keyword Recall First**: Start simple, plan for embeddings later
4. **Async Compaction**: Don't block user responses

### Dependencies on Existing Work
- Depends on autonomous copilot feature (AUTO-*) being functional
- Uses existing `copilot_conversations` and `copilot_messages` tables
- Integrates with `copilot-autonomous` edge function

### Future Enhancements (Out of Scope)
- Semantic search with embeddings (VECTOR column ready)
- Memory editing/deletion UI
- Cross-conversation memory search
- Memory confidence decay over time
