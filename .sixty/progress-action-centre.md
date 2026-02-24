# Progress Log — Action Centre & Conversation Memory

## Overview

Add a personal AI inbox and 7-day conversation memory to the Proactive AI Sales Teammate.

### Scope

| Feature | Description |
|---------|-------------|
| **Action Centre** | Personal inbox showing all AI-generated suggestions |
| **Conversation Memory** | 7-day context that AI references automatically |

---

## Phases

| Phase | Name | Stories | Priority | Status |
|-------|------|---------|----------|--------|
| 1 | Action Centre Foundation | 6 | P0 | ✅ Complete |
| 2 | Conversation Memory | 5 | P0 | ✅ Complete |
| 3 | Slack Sync & Polish | 5 | P1 | ✅ Complete |

---

## Phase 1: Action Centre Foundation

**Goal**: Personal inbox with smart approve UX

### Stories

| ID | Title | Status | Est. | Depends On |
|----|-------|--------|------|------------|
| AC-001 | Create `action_centre_items` table and RLS policies | ✅ Complete | 2h | — |
| AC-002 | Build ActionCentre page with tabs UI | ✅ Complete | 3h | AC-001 |
| AC-003 | Implement ActionCard components (simple + editable) | ✅ Complete | 4h | AC-002 |
| AC-004 | Add nav badge with pending count | ✅ Complete | 1h | AC-001 |
| AC-005 | Wire proactive functions to create Action Centre items | ✅ Complete | 3h | AC-001 |
| AC-006 | Implement approve/dismiss API endpoints | ✅ Complete | 2h | AC-001 |

**Phase 1 Total**: ~15h

### AC-001: Database Schema

**Acceptance Criteria**:
- [ ] `action_centre_items` table created
- [ ] RLS policies for user-only access
- [ ] Indexes for efficient queries
- [ ] Migration file created

**Files**:
- `supabase/migrations/YYYYMMDD_create_action_centre.sql`

### AC-002: ActionCentre Page

**Acceptance Criteria**:
- [ ] New route `/action-centre`
- [ ] Tab navigation: Pending | Completed | Recent Activity
- [ ] Empty states for each tab
- [ ] Responsive layout

**Files**:
- `src/pages/platform/ActionCentre.tsx`
- `src/components/action-centre/ActionCentreTabs.tsx`

### AC-003: ActionCard Components

**Acceptance Criteria**:
- [ ] Simple card with one-click approve (low risk)
- [ ] Editable card with preview modal (high risk)
- [ ] Insight card with acknowledge (info)
- [ ] Risk level indicators (green/yellow/red/blue dots)
- [ ] Framer Motion animations

**Files**:
- `src/components/action-centre/ActionCard.tsx`
- `src/components/action-centre/ActionCardSimple.tsx`
- `src/components/action-centre/ActionCardEditable.tsx`
- `src/components/action-centre/ActionCardInsight.tsx`
- `src/components/action-centre/ActionPreviewModal.tsx`

### AC-004: Nav Badge

**Acceptance Criteria**:
- [ ] Badge shows pending count on sidebar
- [ ] Real-time updates via React Query
- [ ] Zero state hides badge

**Files**:
- `src/components/action-centre/ActionCentreNav.tsx`
- Update `src/components/layout/Sidebar.tsx`

### AC-005: Wire Proactive Functions

**Acceptance Criteria**:
- [ ] `proactive-pipeline-analysis` creates Action Centre items
- [ ] `proactive-meeting-prep` creates Action Centre items
- [ ] Items include Slack reference for sync
- [ ] Copilot sequences create items

**Files**:
- Update `supabase/functions/proactive-pipeline-analysis/index.ts`
- Update `supabase/functions/proactive-meeting-prep/index.ts`
- Update `supabase/functions/_shared/sequenceExecutor.ts`

### AC-006: API Endpoints

**Acceptance Criteria**:
- [ ] `POST /api/action-centre/:id/approve` with optional edits
- [ ] `POST /api/action-centre/:id/dismiss`
- [ ] `POST /api/action-centre/:id/done`
- [ ] Executes underlying action on approve

**Files**:
- `supabase/functions/api-action-centre/index.ts`

---

## Phase 2: Conversation Memory

**Goal**: AI remembers last 7 days of context

### Stories

| ID | Title | Status | Est. | Depends On |
|----|-------|--------|------|------------|
| CM-001 | Create `copilot_memory` table with search index | ✅ Complete | 2h | — |
| CM-002 | Build memory compiler (summarize conversations) | ✅ Complete | 4h | CM-001 |
| CM-003 | Inject recent context into copilot system prompt | ✅ Complete | 2h | CM-002 |
| CM-004 | Build Recent Activity tab UI | ✅ Complete | 3h | CM-001, AC-002 |
| CM-005 | Implement memory search API | ✅ Complete | 2h | CM-001 |

**Phase 2 Total**: ~13h

### CM-001: Database Schema

**Acceptance Criteria**:
- [ ] `copilot_memory` table created
- [ ] Full-text search index on summary
- [ ] Auto-expiration after 7 days
- [ ] Entity linking (contacts, deals)

**Files**:
- `supabase/migrations/YYYYMMDD_create_copilot_memory.sql`

### CM-002: Memory Compiler

**Acceptance Criteria**:
- [ ] After each conversation, generate summary
- [ ] Extract key entities mentioned
- [ ] Store context snippet for injection
- [ ] Handle action executions (emails sent, tasks created)

**Files**:
- `supabase/functions/_shared/conversationMemory.ts`
- Update `supabase/functions/api-copilot/index.ts`

### CM-003: Context Injection

**Acceptance Criteria**:
- [ ] Load last 7 days of memory on conversation start
- [ ] Format as RECENT CONTEXT block in system prompt
- [ ] Limit to ~500 tokens of context
- [ ] AI references naturally ("Following up on...")

**Files**:
- Update `supabase/functions/_shared/salesCopilotPersona.ts`
- Update `supabase/functions/api-copilot/index.ts`

### CM-004: Recent Activity Tab

**Acceptance Criteria**:
- [ ] Shows conversation history grouped by day
- [ ] Each item shows summary + entities
- [ ] "Resume Conversation" button
- [ ] Search bar with instant results

**Files**:
- `src/components/action-centre/RecentActivityList.tsx`
- `src/components/action-centre/RecentActivityItem.tsx`
- `src/components/action-centre/MemorySearchBar.tsx`

### CM-005: Search API

**Acceptance Criteria**:
- [ ] `GET /api/copilot/memory/search?q=acme`
- [ ] Full-text search on summary
- [ ] Filter by date range
- [ ] Return with highlights

**Files**:
- `supabase/functions/api-copilot-memory/index.ts`

---

## Phase 3: Slack Sync & Polish

**Goal**: Seamless Slack ↔ Action Centre sync

### Stories

| ID | Title | Status | Est. | Depends On |
|----|-------|--------|------|------------|
| SS-001 | Sync Slack interactions to Action Centre status | ✅ Complete | 3h | AC-001 |
| SS-002 | Add "View in App" button to Slack messages | ✅ Complete | 1h | AC-002 |
| SS-003 | Implement action filters (by type, date) | ✅ Complete | 2h | AC-002 |
| SS-004 | Add in-app notifications for new items | ✅ Complete | 2h | AC-001 |
| SS-005 | Resume conversation from Recent Activity | ✅ Complete | 2h | CM-004 |

**Phase 3 Total**: ~10h

---

## Quality Gates

| Gate | Status | When |
|------|--------|------|
| Type check | Required | Phase complete |
| Build | Required | Phase complete |
| Lint | Required | Every story |
| Manual test | Required | AC-003, CM-003 |

---

## Risk Register

| Risk | Mitigation | Owner |
|------|------------|-------|
| Memory context too long | Limit to 500 tokens, prioritize recent | Backend |
| Action Centre overwhelming | Smart grouping, daily digest option | Product |
| Slack sync latency | Optimistic UI, background sync | Backend |

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| AI suggestions seen | 100% | Action Centre views |
| Approval rate | >70% | Approved / total |
| Context repetition | -80% | User feedback |
| Time to approve | <30s | Event timestamps |

---

## Estimated Timeline

| Week | Focus | Stories | Hours |
|------|-------|---------|-------|
| Week 1 | Phase 1 | 6 stories | ~15h |
| Week 2 | Phase 2 | 5 stories | ~13h |
| Week 3 | Phase 3 | 5 stories | ~10h |
| **Total** | | **16 stories** | **~38h** |

---

## Next Steps

```bash
# Start execution
60/run AC-001

# Check status
60/status --detail

# View full PRD
cat docs/project-requirements/PRD_ACTION_CENTRE.md
```
