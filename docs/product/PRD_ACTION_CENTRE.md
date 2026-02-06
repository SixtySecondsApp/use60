# PRD: Action Centre & Conversation Memory

> **Status**: Draft
> **Created**: 2026-01-24
> **Author**: Product Team
> **Related**: [PRD_PROACTIVE_AI_TEAMMATE.md](./PRD_PROACTIVE_AI_TEAMMATE.md)

---

## Executive Summary

Extend the Proactive AI Sales Teammate with two complementary features:

1. **Action Centre** — A personal inbox where reps see all AI-generated suggestions awaiting approval, with smart one-click or edit-mode confirmation
2. **7-Day Conversation Memory** — Automatic context resumption from recent conversations, with a searchable activity log

Together, these create a unified hub for human-AI collaboration in sales workflows.

---

## Problem Statement

### Current State
- Proactive AI sends notifications via Slack only
- Users without Slack miss AI suggestions entirely
- No in-app view of pending AI-generated actions
- Each copilot conversation starts fresh — no memory of recent context
- Reps repeat themselves ("I already told you about the Acme situation yesterday")
- No audit trail of what the AI suggested or executed

### Desired State
- Single in-app hub showing all AI activity (pending, completed, dismissed)
- Smart approval UX: one-click for simple actions, edit mode for high-stakes
- Slack becomes optional notification layer, not the only channel
- AI remembers last 7 days of conversations automatically
- Searchable history for reference and accountability

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| AI suggestion visibility | Slack-only | 100% in-app | Action Centre adoption |
| Approval rate | ~40% (Slack) | >70% | Actions approved / suggested |
| Context repetition | Frequent | Rare | User feedback, repeat queries |
| Time to approve | ~2 min | <30 sec | Timestamp analysis |
| Non-Slack user engagement | 0% proactive | >50% proactive | Action Centre interactions |

---

## User Stories

### Action Centre

| ID | Story | Priority |
|----|-------|----------|
| AC-001 | As a rep, I see a badge on my nav showing pending AI suggestions | P0 |
| AC-002 | As a rep, I can view all pending actions in a dedicated Action Centre | P0 |
| AC-003 | As a rep, I can one-click approve simple actions (log note, update field) | P0 |
| AC-004 | As a rep, I can edit high-stakes actions before approving (emails, messages) | P0 |
| AC-005 | As a rep, I can dismiss suggestions I don't want to act on | P0 |
| AC-006 | As a rep, actions I approve via Slack auto-move to "Done" in Action Centre | P1 |
| AC-007 | As a rep, I can filter actions by type (emails, tasks, alerts, insights) | P1 |
| AC-008 | As a rep, I can see completed actions with timestamps | P1 |
| AC-009 | As a rep, I receive in-app notifications for new AI suggestions | P2 |

### Conversation Memory

| ID | Story | Priority |
|----|-------|----------|
| CM-001 | As a rep, the AI remembers context from my last 7 days of conversations | P0 |
| CM-002 | As a rep, I can see a "Recent Activity" tab with my conversation history | P0 |
| CM-003 | As a rep, I can search my recent conversations and AI actions | P1 |
| CM-004 | As a rep, the AI references recent context naturally ("Following up on...") | P1 |
| CM-005 | As a rep, I can click on a past conversation to resume it | P2 |

---

## Feature Specification

### 1. Action Centre

#### 1.1 Navigation & Entry Points

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar Navigation                                      │
├─────────────────────────────────────────────────────────┤
│  📊 Dashboard                                            │
│  👥 Contacts                                             │
│  💼 Deals                                                │
│  📅 Meetings                                             │
│  ✅ Tasks                                                │
│  ──────────────────                                      │
│  🤖 Action Centre (3)  ← Badge shows pending count      │
│  ──────────────────                                      │
│  ⚙️ Settings                                             │
└─────────────────────────────────────────────────────────┘
```

#### 1.2 Action Centre Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Action Centre                                            Filter ▼  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─── Tabs ───────────────────────────────────────────────────────┐ │
│  │  Pending (3)  │  Completed  │  Recent Activity  │              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─── Action Card (High-Stakes: Email) ───────────────────────────┐ │
│  │  ✉️  Follow-up email to Sarah Chen                    2h ago   │ │
│  │  Re: Q1 Contract Renewal                                       │ │
│  │                                                                 │ │
│  │  "Hi Sarah, I wanted to follow up on our conversation..."      │ │
│  │                                                                 │ │
│  │  📎 Acme Corp Deal • $45,000 ARR                               │ │
│  │                                                                 │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │ │
│  │  │ ✏️ Edit  │  │ ✓ Approve│  │ ✕ Dismiss│                     │ │
│  │  └──────────┘  └──────────┘  └──────────┘                     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─── Action Card (Simple: Task) ─────────────────────────────────┐ │
│  │  ✅  Create follow-up task                            4h ago   │ │
│  │  "Schedule demo with TechCorp team"                            │ │
│  │  Due: Tomorrow • Priority: High                                │ │
│  │                                                                 │ │
│  │  ┌────────────────┐  ┌──────────┐                             │ │
│  │  │ ✓ Quick Approve│  │ ✕ Dismiss│   ← One-click for simple   │ │
│  │  └────────────────┘  └──────────┘                             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─── Action Card (Insight: Alert) ───────────────────────────────┐ │
│  │  ⚠️  Deal at risk: Globex Corp                        1d ago   │ │
│  │  No activity for 14 days. Champion went silent.                │ │
│  │                                                                 │ │
│  │  Suggested actions:                                            │ │
│  │  • Send re-engagement email                                    │ │
│  │  • Schedule internal review                                    │ │
│  │                                                                 │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │ │
│  │  │ 📧 Email │  │ 📅 Review│  │ ✓ Noted  │                     │ │
│  │  └──────────┘  └──────────┘  └──────────┘                     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 1.3 Action Types & Risk Classification

| Type | Risk Level | Approval UX | Examples |
|------|------------|-------------|----------|
| **Log Activity** | Low | One-click | Log call, add note |
| **Create Task** | Low | One-click | Follow-up reminder |
| **Update Field** | Low | One-click | Update deal stage |
| **Send Email** | High | Edit mode | Outbound email |
| **Post to Slack** | High | Edit mode | Channel message |
| **Create Meeting** | Medium | Preview | Calendar invite |
| **Deal Alert** | Info | Acknowledge | Stalled deal warning |
| **Meeting Brief** | Info | View | Pre-meeting prep |
| **Pipeline Insight** | Info | Acknowledge | Daily summary |

#### 1.4 Action States

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ PENDING  │ ──► │ APPROVED │ ──► │   DONE   │
└──────────┘     └──────────┘     └──────────┘
      │                                 ▲
      │          ┌──────────┐           │
      └────────► │ DISMISSED│           │
                 └──────────┘           │
                                        │
      Slack interaction ────────────────┘
      (auto-sync to Done)
```

#### 1.5 Slack Sync Behavior

When a user interacts with a proactive Slack message:
- **Confirms action** → Action Centre item moves to "Done"
- **Dismisses/Cancels** → Action Centre item moves to "Dismissed"
- **Clicks "View in App"** → Opens Action Centre with item highlighted

For users without Slack:
- All proactive suggestions appear only in Action Centre
- In-app notification badge alerts them to new items

---

### 2. Conversation Memory

#### 2.1 Memory Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CONVERSATION MEMORY SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │  Conversations  │    │  AI Actions     │    │  Context Index  │ │
│  │  (7-day window) │    │  (sent/created) │    │  (searchable)   │ │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘ │
│           │                      │                      │          │
│           └──────────────────────┼──────────────────────┘          │
│                                  ▼                                  │
│                    ┌─────────────────────────┐                     │
│                    │    Memory Compiler      │                     │
│                    │  (builds context for    │                     │
│                    │   each new conversation)│                     │
│                    └─────────────────────────┘                     │
│                                  │                                  │
│                                  ▼                                  │
│                    ┌─────────────────────────┐                     │
│                    │   Copilot System Prompt │                     │
│                    │  + Recent Context Block │                     │
│                    └─────────────────────────┘                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.2 Recent Activity Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│  Action Centre > Recent Activity                     🔍 Search...   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Today                                                              │
│  ─────                                                              │
│  💬 10:30am — Discussed Acme Corp renewal strategy                 │
│     "Prep me for my meeting with Sarah Chen"                        │
│     → Generated meeting brief, 3 talking points                     │
│     [Resume Conversation]                                           │
│                                                                     │
│  ✉️ 9:15am — Sent follow-up to TechCorp                            │
│     Re: Product Demo Follow-up                                      │
│     → Email sent via copilot                                        │
│     [View Email]                                                    │
│                                                                     │
│  Yesterday                                                          │
│  ─────────                                                          │
│  📊 4:00pm — Pipeline review with AI                               │
│     "Show me deals at risk"                                         │
│     → Identified 3 stalled deals, created 2 tasks                   │
│     [Resume Conversation]                                           │
│                                                                     │
│  💬 2:30pm — Discussed Globex negotiation                          │
│     "How should I handle the pricing objection?"                    │
│     → Provided objection handling script                            │
│     [Resume Conversation]                                           │
│                                                                     │
│  Monday, Jan 20                                                     │
│  ───────────────                                                    │
│  ...                                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.3 Context Injection in Copilot

When a new conversation starts, the system prompt includes:

```
RECENT CONTEXT (last 7 days):

- 2 days ago: You helped {rep_name} prepare for meeting with Sarah Chen (Acme Corp).
  They were concerned about competitor positioning. Meeting happened yesterday.

- 3 days ago: You drafted a follow-up email to TechCorp after their demo.
  They said they'd review internally and get back this week.

- 5 days ago: You identified Globex Corp as at-risk (no activity 14 days).
  {rep_name} dismissed the alert, said they're waiting on legal.

Use this context naturally. If relevant, reference it: "Following up on our
discussion about Acme..." or "Have you heard back from TechCorp yet?"
```

#### 2.4 Memory Data Model

```sql
-- Conversation memory entries
CREATE TABLE copilot_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Conversation reference
  conversation_id UUID,

  -- Memory content
  memory_type TEXT NOT NULL, -- 'conversation', 'action_sent', 'action_created', 'insight_viewed'
  summary TEXT NOT NULL, -- AI-generated summary of the interaction
  entities JSONB DEFAULT '{}', -- {contacts: [], deals: [], companies: []}
  context_snippet TEXT, -- Key quote or detail for context injection

  -- Timestamps
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),

  -- Indexing
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', summary || ' ' || COALESCE(context_snippet, ''))) STORED
);

-- Index for efficient queries
CREATE INDEX idx_copilot_memory_user_time
  ON copilot_memory(user_id, occurred_at DESC)
  WHERE expires_at > NOW();

CREATE INDEX idx_copilot_memory_search
  ON copilot_memory USING gin(search_vector);
```

---

## Technical Architecture

### Database Schema

```sql
-- Action Centre items
CREATE TABLE action_centre_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Action details
  action_type TEXT NOT NULL, -- 'email', 'task', 'slack_message', 'field_update', 'alert', 'insight'
  risk_level TEXT NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'info'
  title TEXT NOT NULL,
  description TEXT,
  preview_data JSONB DEFAULT '{}', -- Full action payload for preview/edit

  -- Related entities
  contact_id UUID REFERENCES contacts(id),
  deal_id UUID REFERENCES deals(id),
  meeting_id UUID REFERENCES meetings(id),

  -- State management
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'dismissed', 'done'

  -- Source tracking
  source_type TEXT NOT NULL, -- 'proactive_pipeline', 'proactive_meeting', 'copilot_conversation', 'sequence'
  source_id TEXT, -- Reference to workflow_execution or conversation
  slack_message_ts TEXT, -- For Slack sync
  slack_channel_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  actioned_at TIMESTAMPTZ, -- When approved/dismissed
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Indexes
CREATE INDEX idx_action_centre_user_status ON action_centre_items(user_id, status, created_at DESC);
CREATE INDEX idx_action_centre_slack ON action_centre_items(slack_channel_id, slack_message_ts) WHERE slack_message_ts IS NOT NULL;
```

### API Endpoints

```yaml
# Action Centre
GET  /api/action-centre                    # List items (with filters)
GET  /api/action-centre/:id                # Get single item with full preview
POST /api/action-centre/:id/approve        # Approve (with optional edits)
POST /api/action-centre/:id/dismiss        # Dismiss
POST /api/action-centre/:id/done           # Mark as done (for info items)

# Conversation Memory
GET  /api/copilot/memory                   # Get 7-day memory summary
GET  /api/copilot/memory/search?q=acme     # Search memory
POST /api/copilot/memory                   # Add memory entry (internal)
```

### Component Structure

```
src/
├── pages/
│   └── platform/
│       └── ActionCentre.tsx              # Main page
│
├── components/
│   └── action-centre/
│       ├── ActionCentreNav.tsx           # Sidebar item with badge
│       ├── ActionCentreTabs.tsx          # Pending/Completed/Recent tabs
│       ├── ActionCard.tsx                # Individual action card
│       ├── ActionCardSimple.tsx          # One-click approve variant
│       ├── ActionCardEditable.tsx        # Edit mode variant
│       ├── ActionCardInsight.tsx         # Info/alert variant
│       ├── ActionPreviewModal.tsx        # Full edit modal
│       ├── RecentActivityList.tsx        # Conversation history
│       ├── RecentActivityItem.tsx        # Single history item
│       └── MemorySearchBar.tsx           # Search component
│
├── lib/
│   ├── services/
│   │   ├── ActionCentreService.ts        # API calls
│   │   └── ConversationMemoryService.ts  # Memory API calls
│   └── hooks/
│       ├── useActionCentre.ts            # React Query hooks
│       └── useConversationMemory.ts      # Memory hooks
```

---

## Implementation Phases

### Phase 1: Action Centre Foundation (P0)

| ID | Story | Est. |
|----|-------|------|
| AC-001 | Create `action_centre_items` table and RLS policies | 2h |
| AC-002 | Build ActionCentre page with tabs UI | 3h |
| AC-003 | Implement ActionCard components (simple + editable) | 4h |
| AC-004 | Add nav badge with pending count | 1h |
| AC-005 | Wire proactive functions to create Action Centre items | 3h |
| AC-006 | Implement approve/dismiss API endpoints | 2h |

**Phase 1 Total**: ~15h

### Phase 2: Conversation Memory (P0)

| ID | Story | Est. |
|----|-------|------|
| CM-001 | Create `copilot_memory` table with search index | 2h |
| CM-002 | Build memory compiler (summarize conversations) | 4h |
| CM-003 | Inject recent context into copilot system prompt | 2h |
| CM-004 | Build Recent Activity tab UI | 3h |
| CM-005 | Implement memory search API | 2h |

**Phase 2 Total**: ~13h

### Phase 3: Slack Sync & Polish (P1)

| ID | Story | Est. |
|----|-------|------|
| SS-001 | Sync Slack interactions to Action Centre status | 3h |
| SS-002 | Add "View in App" button to Slack messages | 1h |
| SS-003 | Implement action filters (by type, date) | 2h |
| SS-004 | Add in-app notifications for new items | 2h |
| SS-005 | Resume conversation from Recent Activity | 2h |

**Phase 3 Total**: ~10h

---

## UX Specifications

### Action Card States

| State | Visual | Actions Available |
|-------|--------|-------------------|
| Pending | White card, blue left border | Approve, Edit, Dismiss |
| Approved | Light green bg, checkmark | View, Undo (30s) |
| Dismissed | Light gray bg, strikethrough | Restore |
| Done | Light green bg, "Completed" badge | View |

### Risk Level Indicators

| Risk | Indicator | Approval Flow |
|------|-----------|---------------|
| Low | Green dot | One-click approve button |
| Medium | Yellow dot | Preview required, one-click approve |
| High | Red dot | Edit modal required before approve |
| Info | Blue dot | Acknowledge only, no action needed |

### Empty States

**No Pending Actions:**
```
┌─────────────────────────────────────────┐
│                                         │
│       🎉 You're all caught up!          │
│                                         │
│   No pending suggestions from your      │
│   AI teammate right now.                │
│                                         │
│   Check back later or ask the           │
│   copilot for help with something.      │
│                                         │
│        [Open Copilot]                   │
│                                         │
└─────────────────────────────────────────┘
```

**No Recent Activity:**
```
┌─────────────────────────────────────────┐
│                                         │
│       💬 Start a conversation           │
│                                         │
│   Your recent AI interactions will      │
│   appear here. The AI remembers your    │
│   last 7 days of conversations.         │
│                                         │
│        [Open Copilot]                   │
│                                         │
└─────────────────────────────────────────┘
```

---

## Privacy & Data Retention

- **Memory expires after 7 days** — automatic cleanup via `expires_at`
- **User can clear memory** — "Forget my history" button in settings
- **Memory is per-user** — no cross-user memory sharing
- **Sensitive data excluded** — No passwords, API keys, or PII beyond contact names in memory
- **Action Centre items expire after 7 days** — dismissed/completed items auto-archive

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Rep can see pending AI suggestions in Action Centre
- [ ] Rep can one-click approve simple actions
- [ ] Rep can edit and approve high-stakes actions
- [ ] Proactive pipeline and meeting prep appear in Action Centre
- [ ] Badge shows accurate pending count

### Phase 2 Complete When:
- [ ] AI references recent context naturally in conversations
- [ ] Rep can view 7-day conversation history
- [ ] Rep can search past conversations
- [ ] Memory is injected into copilot system prompt

### Phase 3 Complete When:
- [ ] Slack interactions sync to Action Centre status
- [ ] Non-Slack users have full proactive experience
- [ ] Rep can resume past conversations with one click

---

## Dependencies

- Requires: Proactive AI Teammate (complete)
- Requires: HITL confirmation pattern (complete)
- Requires: Copilot conversation storage (exists)

---

## Open Questions

1. **Memory granularity** — Should we summarize per-conversation or per-day?
2. **Action expiration** — 7 days for all types, or longer for some?
3. **Edit undo** — Allow undo after approve? If so, for how long?
4. **Mobile** — Same UI or simplified for mobile?

---

## Appendix: Wireframes

*See Figma: [Action Centre Designs](#)* (to be created)
