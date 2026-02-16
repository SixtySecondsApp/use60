# PRD: Unified Task System — "Command Centre"

**Status**: Draft
**Author**: AI-Assisted Discovery Session
**Date**: 2026-02-16
**Version**: 1.0

---

## Executive Summary

Redesign and consolidate the platform's four fragmented action surfaces (Tasks, Action Centre, Next Action Suggestions, Meeting Action Items) into a single **Unified Task System** — a personal AI-powered command centre where every actionable item lives, AI proactively creates and executes work, and users review/approve deliverables through inline editing in a prioritized stream.

**Core Loop**: Signal Detected → AI Creates Task → AI Executes & Produces Deliverable → Human Reviews → Approve/Edit → Done

---

## 1. Problem Statement

### Current State (4 Fragmented Systems)

| System | Table | Purpose | Limitation |
|--------|-------|---------|------------|
| **Tasks** | `tasks` | Persistent TODOs with CRM linking | Dated UI, poor edit cards, not AI-native |
| **Action Centre** | `action_centre_items` | AI suggestion inbox (7-day expiry) | Separate from tasks, ephemeral only |
| **Next Action Suggestions** | `next_action_suggestions` | Post-meeting AI recommendations | Creates tasks on accept — redundant hop |
| **Meeting Action Items** | `meeting_action_items` | Extracted from transcripts | Manual conversion to tasks required |

**Result**: Users don't know where to look. AI suggestions expire unused. Tasks feel like a chore, not a superpower. The systems don't talk to each other.

### Desired State

One system. One table. One UI. Every actionable item — whether AI-generated or human-created — is a **Task** with a type, a status, a source, and optionally an AI-produced **deliverable** attached.

---

## 2. Vision

### The AI Teammate Model

The Unified Task System treats AI as a **proactive teammate**, not a passive tool:

1. **AI Watches Signals** — Meetings end, deals go stale, emails arrive, calendar events approach, deal stages change
2. **AI Creates Tasks** — Automatically, with context, assigned to the right person
3. **AI Executes Work** — Drafts emails, produces research briefs, generates proposals, updates CRM fields
4. **AI Delivers for Review** — Attaches the deliverable to the task
5. **Human Reviews & Approves** — One-click approve, inline edit, or reject with feedback
6. **AI Executes Final Action** — Sends the email, posts to Slack, updates the deal
7. **When Unsure** — AI sends Slack DM or email asking for confirmation before acting

### User Experience Principles

- **Unified Inbox** — One prioritized stream: "Here's what needs your attention right now"
- **Inline Editing** — Click any field to edit directly in the list (Linear/Notion-style)
- **AI-First** — Most tasks created by AI, not humans. Humans are reviewers/approvers
- **Personal** — Each user sees only their tasks. No team-shared task boards
- **Bidirectional Copilot** — Create, manage, and review tasks in chat OR in the task UI. Always in sync
- **Zero Manual Organization** — Smart filters + AI auto-grouping. No manual tags or projects

---

## 3. Consolidation Strategy — Full Merge

### What Gets Absorbed

| Current System | Becomes | Migration Path |
|----------------|---------|----------------|
| `tasks` table | **Unified tasks** (schema extended) | Add new columns, keep existing data |
| `action_centre_items` | Tasks with `source: 'ai_proactive'` + `status: 'pending_review'` | Migrate rows, deprecate table |
| `next_action_suggestions` | Tasks with `source: 'meeting_ai'` + `status: 'pending_review'` | Migrate rows, deprecate table |
| `meeting_action_items` | Tasks with `source: 'meeting_transcript'` + auto-created | Auto-create tasks, deprecate manual conversion |
| `call_action_items` | Tasks with `source: 'call_transcript'` + auto-created | Auto-create tasks, deprecate manual conversion |
| ProjectsHub UI | **Removed** — replaced by smart filters + auto-groups | Delete components |

### What Gets Killed

- `/action-centre` page → Absorbed into unified task view
- `ProjectsHub` page → Replaced by unified task view with company grouping filter
- `action_centre_items` table → Deprecated after migration
- `next_action_suggestions` table → Deprecated after migration
- Manual "Create Task from Action Item" buttons → AI auto-creates tasks
- `ActionCentreNavBadge` → Replaced by unified task count badge

---

## 4. Data Model — Extended Task Schema

### New/Modified Columns on `tasks` Table

```sql
-- New columns for unified system
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
-- Values: 'manual', 'ai_proactive', 'meeting_transcript', 'call_transcript',
--         'meeting_ai', 'email_detected', 'deal_signal', 'calendar_trigger',
--         'copilot', 'sequence', 'workflow'

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_status TEXT DEFAULT 'none';
-- Values: 'none', 'queued', 'working', 'draft_ready', 'approved', 'executed', 'failed'

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deliverable_type TEXT;
-- Values: 'email_draft', 'research_brief', 'proposal', 'meeting_prep',
--         'crm_update', 'slack_message', 'content_draft', NULL (no deliverable)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deliverable_data JSONB;
-- Stores the AI-produced output:
-- For email: { to, cc, subject, body, thread_id }
-- For research: { sections: [...], sources: [...] }
-- For proposal: { content, template_used }
-- For CRM update: { field, old_value, new_value, entity_type, entity_id }
-- For meeting prep: { brief, talking_points, risks, attendee_intel }

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low';
-- Values: 'low', 'medium', 'high', 'info'
-- Inherited from Action Centre concept
-- High risk = requires explicit review before execution

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confidence_score NUMERIC;
-- 0.0–1.0, AI's confidence this task/action is appropriate

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reasoning TEXT;
-- AI's explanation of why it created this task

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS trigger_event JSONB;
-- What signal triggered this task:
-- { type: 'meeting_ended', meeting_id: '...', timestamp: '...' }
-- { type: 'deal_stale', deal_id: '...', days_inactive: 14 }
-- { type: 'email_received', email_id: '...', detected_intent: 'proposal_request' }

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
-- Optional expiry for AI-generated suggestions (inherited from Action Centre)
-- NULL = never expires (default for human-created tasks)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ;
-- When the deliverable was approved/executed

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_group TEXT;
-- AI-assigned grouping label for auto-clustering
-- Values: company name, deal name, 'meeting_followups', 'overdue', etc.
```

### Updated Status Enum

```sql
-- Extended status values
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN (
    'pending',           -- Human-created, not started
    'pending_review',    -- AI-created, awaiting human triage
    'in_progress',       -- Actively being worked on (human or AI)
    'ai_working',        -- AI is currently executing on this task
    'draft_ready',       -- AI produced a deliverable, awaiting review
    'approved',          -- Human approved the deliverable
    'completed',         -- Task is done (deliverable executed or manual completion)
    'cancelled',         -- User cancelled
    'dismissed',         -- User dismissed AI suggestion (replaces Action Centre dismiss)
    'expired'            -- Auto-expired (AI suggestions past expiry window)
  ));
```

### Updated Task Type Enum

```sql
-- Extended task types
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check
  CHECK (task_type IN (
    -- Existing
    'call', 'email', 'meeting', 'follow_up', 'proposal', 'demo', 'general',
    -- New
    'research',          -- Research brief / company intel
    'meeting_prep',      -- Pre-meeting preparation
    'crm_update',        -- Field/stage update
    'slack_message',     -- Draft Slack message
    'content',           -- Content creation (LinkedIn post, case study, etc.)
    'alert',             -- Informational alert (no action needed)
    'insight'            -- AI insight / recommendation
  ));
```

---

## 5. AI Task Lifecycle

### State Machine

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
   Signal Detected  │                                             │
        │           │                                             │
        ▼           │                                             │
  ┌──────────────┐  │  ┌──────────────┐    ┌──────────────┐      │
  │ pending_     │──┼─►│  dismissed   │    │   expired    │      │
  │ review       │  │  └──────────────┘    └──────────────┘      │
  └──────┬───────┘  │         ▲                    ▲              │
         │          │         │                    │              │
    User accepts    │    User dismisses      Past expires_at     │
         │          │                                             │
         ▼          │                                             │
  ┌──────────────┐  │                                             │
  │ ai_working   │──┼── AI fails ──► retry or mark failed        │
  └──────┬───────┘  │                                             │
         │          │                                             │
   AI completes     │                                             │
         │          │                                             │
         ▼          │                                             │
  ┌──────────────┐  │                                             │
  │ draft_ready  │  │                                             │
  └──────┬───────┘  │                                             │
         │          │                                             │
    ┌────┴────┐     │                                             │
    │         │     │                                             │
  Approve   Edit    │                                             │
    │      & Save   │                                             │
    │         │     │                                             │
    ▼         ▼     │                                             │
  ┌──────────────┐  │                                             │
  │  approved    │  │                                             │
  └──────┬───────┘  │                                             │
         │          │                                             │
   AI executes      │                                             │
   (send email,     │                                             │
    update CRM,     │                                             │
    post Slack)     │                                             │
         │          │                                             │
         ▼          │                                             │
  ┌──────────────┐  │                                             │
  │  completed   │◄─┘  (manual tasks skip AI states)             │
  └──────────────┘                                                │
                                                                  │
  Human-created tasks: pending → in_progress → completed          │
  ──────────────────────────────────────────────────────────────────
```

### Risk-Based Review Rules

| Risk Level | AI Behavior | User Experience |
|------------|-------------|-----------------|
| **Low** | Auto-execute, notify after | "AI updated deal stage to Negotiation" (toast) |
| **Medium** | Draft and wait | Task appears with deliverable, user reviews inline |
| **High** | Draft, require explicit approval | Modal review before execution (emails to external contacts, Slack posts) |
| **Info** | Create as read-only insight | Dismissible card, no action needed |

### Confidence-Based Routing

```
confidence >= 0.9 + risk_level = 'low'  → Auto-execute silently
confidence >= 0.7 + risk_level = 'low'  → Auto-execute, notify via toast
confidence >= 0.7 + risk_level != 'low' → Draft and wait for review
confidence <  0.7                       → Ask via Slack/email before creating
confidence <  0.5                       → Don't create, log as potential insight
```

---

## 6. AI Trigger System

### Signal Sources

| # | Signal | Detection Method | Task Type Created | Risk Level |
|---|--------|-----------------|-------------------|------------|
| 1 | **Meeting ends** | `meetingbaas-webhook` / Fathom sync | `follow_up`, `email`, `proposal` | Medium |
| 2 | **Deal goes stale** | `proactive-pipeline-analysis` cron | `follow_up`, `call` | Medium |
| 3 | **Email received** | Email sync / webhook | `email` (reply draft), `proposal`, `general` | High |
| 4 | **Calendar event approaching** | Cron (24h before) | `meeting_prep` | Low |
| 5 | **Deal stage changes** | Database trigger / webhook | Stage-appropriate tasks | Medium |
| 6 | **Manual copilot prompt** | Copilot chat | Any type | Varies |
| 7 | **Task overdue** | Daily cron | `alert` (escalation) | Info |
| 8 | **Contact goes cold** | Activity analysis cron | `follow_up`, `call` | Medium |

### Deliverable Templates by Task Type

| Task Type | AI Produces | Stored In `deliverable_data` |
|-----------|-------------|------------------------------|
| `email` | Full email draft (to, subject, body) with context from past conversations, deal data, meeting transcripts | `{ to, cc, subject, body, thread_id, context_sources }` |
| `research` | Company/contact intelligence brief | `{ sections, key_findings, sources, recommended_talking_points }` |
| `meeting_prep` | Pre-meeting brief with attendee intel, risks, agenda | `{ brief, attendees, talking_points, risks, related_deals }` |
| `proposal` | Full proposal/SOW draft | `{ content, template_used, pricing, terms }` |
| `crm_update` | Field change preview | `{ entity_type, entity_id, field, old_value, new_value }` |
| `slack_message` | Slack message draft | `{ channel, message, blocks }` |
| `content` | Content draft (LinkedIn, case study, etc.) | `{ content_type, title, body, platform }` |
| `follow_up` | Follow-up email or call script | `{ type: 'email'|'call_script', content }` |
| `call` | Call prep notes + script | `{ contact, talking_points, objection_handling }` |

---

## 7. Unified Inbox UI — Full-Screen Master-Detail (Design V2)

> **Design Decision**: After evaluating two prototypes, the full-screen unibox with Notion-style editor (Design V2) was selected over the grouped stream layout (Design V1). V2 provides a better surface for reviewing and editing AI deliverables inline.
>
> **Reference Prototypes**: `/command-centre` (Design V1, archived), `/command-centre-v2` (Design V2, selected)

### Layout: Full-Screen Master-Detail with Notion-Style Editor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ┌──── Sidebar (340px, collapsible) ────┐ ┌──── Detail Panel ────────────┐  │
│ │                                       │ │                              │  │
│ │  [Zap] Command Centre    [collapse]   │ │  [Mail] Email · AI Generated │  │
│ │                                       │ │  · 94% confidence            │  │
│ │  [Search tasks...]                    │ │                              │  │
│ │                                       │ │  Draft follow-up email to    │  │
│ │  [All] [Review] [Drafts] [Working]    │ │  Sarah Chen                  │  │
│ │                                       │ │  Post-demo follow-up with... │  │
│ │  ┃ ✦ Draft follow-up to Sarah   HIGH  │ │                              │  │
│ │  ┃   Acme Corp · Today               │ │  [Building] Acme Corp        │  │
│ │  ┃   [Draft ready]                    │ │  [User] Sarah Chen           │  │
│ │  ┃                          ← selected│ │  [Target] Enterprise ($72K)  │  │
│ │                                       │ │  [Cal] Today · [!] High      │  │
│ │    ⟳ Prep for GlobalTech    HIGH      │ │                              │  │
│ │      GlobalTech · Tomorrow            │ │  [Approve & Send] [Revise]   │  │
│ │      [Working 3/6]                    │ │  [Dismiss]                   │  │
│ │                                       │ │                              │  │
│ │    ○ Update deal stage       MED      │ │  [Content] [Comments (2)]    │  │
│ │      Acme Corp                        │ │  [Activity]                  │  │
│ │                                       │ │  ──────────────────────────  │  │
│ │    ✦ Send pricing to Mike    HIGH     │ │  [B] [I] [Link] [List] ...  │  │
│ │      GlobalTech · Today               │ │  ──────────────────────────  │  │
│ │      [Draft ready]                    │ │                              │  │
│ │                                       │ │  To: sarah.chen@acme.com     │  │
│ │    ⟳ Research BrightWave     MED      │ │  Subject: Great connecting   │  │
│ │      BrightWave · Feb 20             │ │                              │  │
│ │      [Working 2/5]                    │ │  Hi Sarah,                   │  │
│ │                                       │ │                              │  │
│ │  ! ○ Re-engage TechFlow     URG      │ │  Thank you for taking the   │  │
│ │      TechFlow · 2d overdue            │ │  time to see the platform   │  │
│ │                                       │ │  in action today...          │  │
│ │    ○ Draft proposal          HIGH     │ │                              │  │
│ │      NovaStar · Feb 19               │ │  ## Pricing                  │  │
│ │                                       │ │  | Plan | Price | Seats |   │  │
│ │  ──────────────────────────────       │ │  |------|-------|-------|   │  │
│ │  [+ New task                    N]    │ │  | Growth | $49  | 10   |   │  │
│ │                                       │ │  | Enterprise | $99 | ∞ |   │  │
│ └───────────────────────────────────────┘ │                              │  │
│                                           │  ──────────────────────────  │  │
│                                           │  [Brain] AI Reasoning:       │  │
│                                           │  Sarah expressed strong      │  │
│                                           │  interest in pricing...      │  │
│                                           └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Left Sidebar (340px, collapsible to 48px)

**Header**: Logo + title + collapse button
**Search**: Full-text search across task titles and descriptions
**Filter pills**: All / Review / Drafts / AI Working / Done — with live counts

**Task Items** display:
- Status icon: Circle (pending), Sparkles (draft ready), Spinner (AI working), Checkmark (done)
- Title (2-line clamp)
- Type icon + company name + due date
- Priority indicated by colored left-edge bar on hover/selection
- AI status tag below: "Draft ready" (green) or "Working 3/6" (violet with spinner)

**Collapsed state** (48px): Shows toggle button + badge counts for drafts and working tasks

**Quick-add** bar at bottom with keyboard shortcut hint

### Right Detail Panel — Notion-Style Editor

The right panel fills the remaining screen width and contains:

**Header section**:
- Type badge with icon + "AI Generated" indicator + confidence score
- Task title (large, bold, editable)
- Description (editable)
- Meta row: Company, Contact (with email), Deal (with value), Due date, Priority dot
- Subtask progress bar (when applicable)
- Context-aware action buttons:
  - Email drafts: "Approve & Send" / "Revise with AI" / "Dismiss"
  - CRM updates: "Approve Update" / "Revise with AI" / "Dismiss"
  - Pending review: "Accept" / "Let AI Draft" / "Dismiss"

**Three-tab content area**:

| Tab | Content |
|-----|---------|
| **Content** | Notion-style prose renderer with editor toolbar. Renders markdown deliverables as styled HTML: headers, tables, blockquotes (with generating-in-progress spinners), numbered/bulleted lists, bold/italic, links. Editor toolbar: Bold, Italic, Link, Lists, Mention, Attach, Image. |
| **Comments** | Threaded comment thread. AI comments show gradient violet avatar + "AI Copilot" name. User comments show blue avatar. Input: "Add a comment or instruction for AI..." with submit on Enter. |
| **Activity** | Vertical timeline with actor-colored icons (violet for AI, blue for human), connecting lines. Shows full history: "Task created → Draft generated → Attachments added." |

**AI Reasoning footer**: Persistent bar at bottom of panel with Brain icon explaining why AI created/drafted this task.

### Interaction Patterns

| Action | Behavior |
|--------|----------|
| Click task in sidebar | Loads task in detail panel, switches to Content tab |
| Click "Approve & Send" | Executes deliverable, marks task complete, shows toast |
| Click "Revise with AI" | Opens comment input pre-filled with "Please revise:", AI regenerates |
| Click "Dismiss" | Marks task dismissed, removes from default filter |
| Edit content in editor | Changes saved to `deliverable_data` JSONB, dirty state indicator |
| Add comment | Posts to comment thread, AI comments trigger re-processing if instructed |
| Collapse sidebar | Sidebar shrinks to 48px strip with badge counts |
| Keyboard: Up/Down | Navigate task list in sidebar |
| Keyboard: N | Focus quick-add input |
| Keyboard: Enter | Open selected task |

### Task Sidebar States

| State | Visual Treatment |
|-------|-----------------|
| `pending_review` | Circle icon, no AI tag |
| `ai_working` | Spinning loader icon, violet "Working X/Y" tag |
| `draft_ready` | Sparkle icon, green "Draft ready" tag |
| `in_progress` | Circle icon, no special treatment |
| `completed` | Checkmark icon, 50% opacity, strikethrough title |
| `overdue` | Red due date text + "Xd overdue" label |

### Smart Filters (Sidebar pills)

| Filter | Shows |
|--------|-------|
| **All** | Everything |
| **Review** | `pending_review` + `draft_ready` tasks — items needing human attention |
| **Drafts** | Only `draft_ready` — AI work ready for approval |
| **AI Working** | Only tasks where AI is actively generating |
| **Done** | Completed tasks |

---

## 8. Copilot Integration — Bidirectional

### Copilot → Task System

| User Says in Chat | System Does |
|-------------------|-------------|
| "What's on my plate?" | Shows prioritized task list as structured response |
| "Draft follow-up for Sarah" | Creates task (type: `email`, status: `ai_working`), produces draft, shows in chat AND task UI |
| "Research Acme Corp" | Creates task (type: `research`, status: `ai_working`), produces brief |
| "Mark the Acme email as done" | Updates task status to `completed` |
| "Snooze the GlobalTech follow-up to Friday" | Updates due date |
| "What did AI suggest after yesterday's meetings?" | Filters tasks by `source: 'meeting_ai'` + yesterday's date |

### Task System → Copilot

| Event in Task UI | Copilot Awareness |
|------------------|-------------------|
| User approves email draft | Copilot logs action, can reference in future conversations |
| User edits AI draft significantly | Copilot learns from edits for future personalization |
| User dismisses AI suggestion | Copilot reduces confidence for similar suggestions |
| User creates manual task | Copilot can offer to help execute it |
| Task becomes overdue | Copilot proactively mentions it in next conversation |

### Copilot Response Components (Updated)

Replace existing `TaskResponse`, `TaskCreationResponse`, and Action Centre components with:

| Component | Purpose |
|-----------|---------|
| `UnifiedTaskListResponse` | Shows filtered task list with inline actions |
| `TaskDeliverableResponse` | Shows AI-produced deliverable with approve/edit/dismiss |
| `TaskCreatedResponse` | Confirms task creation with estimated completion |
| `TaskStatusResponse` | Shows task progress / status update |
| `DailyBriefResponse` | Morning summary: overdue, due today, AI drafts ready |

---

## 9. Slack Integration

### Proactive Notifications

| Trigger | Slack Message |
|---------|---------------|
| AI draft ready (high priority) | DM: "I drafted a follow-up email to Sarah at Acme. [Review in App] [Approve Now]" |
| Task overdue (2+ days) | DM: "Reminder: Follow up with Jen at TechFlow is 2 days overdue. [Snooze] [Let AI Handle]" |
| AI unsure (confidence < 0.7) | DM: "After your call with Mike, should I draft a pricing proposal? [Yes] [No] [I'll Handle It]" |
| Daily digest (morning) | DM: "Good morning. 3 drafts ready for review, 2 tasks due today, 1 overdue. [Open Command Centre]" |

### Slack Actions → Task System

| Slack Button | Task Update |
|--------------|-------------|
| "Approve Now" | Status → `approved` → AI executes → `completed` |
| "Snooze" | Due date pushed, status unchanged |
| "Let AI Handle" | Status → `ai_working`, AI auto-executes |
| "Dismiss" | Status → `dismissed` |
| "Yes" (confirmation) | AI creates task and begins execution |

---

## 10. Smart Filters

### Filter Dimensions

| Filter | Options | Default |
|--------|---------|---------|
| **Status** | All, Needs Review, In Progress, AI Working, Draft Ready, Completed | Needs Review + In Progress + Draft Ready |
| **Type** | All, Email, Follow-up, Research, Meeting Prep, Proposal, CRM Update, Call, Content | All |
| **Priority** | All, Urgent, High, Medium, Low | All |
| **Source** | All, AI Proactive, Meeting, Email, Calendar, Manual, Copilot | All |
| **Company** | Searchable dropdown of companies with active tasks | All |
| **Deal** | Searchable dropdown of deals with active tasks | All |
| **Contact** | Searchable dropdown of contacts with active tasks | All |
| **Due** | All, Overdue, Today, This Week, Next Week, No Date | All |
| **AI Status** | All, Has Draft, AI Working, No AI Involvement | All |

### Saved Views (System-Defined)

| View Name | Filters Applied |
|-----------|----------------|
| **My Focus** | Status: Needs Review + Draft Ready, sorted by priority then due date |
| **AI Drafts** | AI Status: Has Draft, sorted by creation time |
| **Overdue** | Due: Overdue, sorted by days overdue |
| **Today** | Due: Today + Overdue, sorted by priority |
| **By Company** | Grouped by company, sorted by task count |
| **Everything** | No filters, sorted by creation time |

---

## 11. Components to Build

### New Components — Master-Detail Layout

| Component | Purpose |
|-----------|---------|
| **Page** | |
| `CommandCentre.tsx` | Main full-screen page — sidebar + detail panel layout |
| **Sidebar (left panel)** | |
| `TaskSidebar.tsx` | Collapsible sidebar container with search, filters, task list, quick-add |
| `SidebarTaskItem.tsx` | Compact task row: status icon, title, company, due date, AI tag |
| `SidebarFilterPills.tsx` | Filter pill row: All / Review / Drafts / Working / Done |
| `SidebarQuickAdd.tsx` | Quick-add task input at sidebar bottom |
| **Detail Panel (right panel)** | |
| `TaskDetailPanel.tsx` | Full detail view: header + tabs + content + reasoning footer |
| `TaskDetailHeader.tsx` | Type badge, title, meta row, action buttons |
| `TaskActionBar.tsx` | Context-aware buttons: Approve & Send, Revise with AI, Dismiss |
| `DeliverableEditor.tsx` | Notion-style prose renderer + editor toolbar for AI deliverables |
| `EditorToolbar.tsx` | Formatting toolbar: Bold, Italic, Link, Lists, Mention, Attach |
| `CommentThread.tsx` | Threaded comments with AI/human avatars and input |
| `ActivityTimeline.tsx` | Vertical timeline with actor-colored icons and connecting lines |
| `AIReasoningFooter.tsx` | Persistent footer explaining AI's reasoning |
| **Shared** | |
| `AIStatusPill.tsx` | "Draft ready" / "Working X/Y" animated pill |
| `PriorityDot.tsx` | Colored dot indicator for priority |
| `ConfidenceBar.tsx` | Mini progress bar showing AI confidence score |
| `SourceChip.tsx` | Small chip showing task source (AI Proactive, Meeting, etc.) |

### Updated Copilot Response Components

| Component | Replaces |
|-----------|----------|
| `UnifiedTaskListResponse.tsx` | `TaskResponse.tsx` |
| `TaskDeliverableResponse.tsx` | `TaskCreationResponse.tsx` + Action Centre modals |
| `DailyBriefResponse.tsx` | Standalone daily brief |

### Components to Remove

| Component | Reason |
|-----------|--------|
| `ActionCentre.tsx` + all children | Absorbed into Command Centre |
| `ActionCentreNavBadge.tsx` | Replaced by unified task count badge |
| `ProjectsHub.tsx` + all children | Killed — Projects concept removed |
| `ProjectsToolbar.tsx` | Replaced by SidebarFilterPills |
| `ProjectsKanbanView.tsx` | Removed — V2 is master-detail only |
| `CompanyTaskGroup.tsx` | Replaced by smart filtering |
| `ProjectTaskRow.tsx` | Replaced by SidebarTaskItem |
| `NextActionSuggestions.tsx` | Tasks auto-created, no separate component needed |
| `CreateTaskFromSuggestionModal.tsx` | No longer needed — suggestions ARE tasks |
| `TaskDetailModal.tsx` | Replaced by TaskDetailPanel (always visible, not a modal) |
| `CommandCentreDemo.tsx` | Design V1 prototype — archived |

---

## 12. Edge Functions — New & Modified

### New Edge Functions

| Function | Purpose | Trigger |
|----------|---------|---------|
| `unified-task-ai-worker` | Executes AI work on tasks (draft emails, research, proposals) | Called when task enters `ai_working` status |
| `task-signal-processor` | Processes incoming signals and creates tasks | Called by meeting webhooks, deal triggers, email sync, cron |
| `task-auto-expire` | Expires AI suggestions past their `expires_at` | Daily cron |
| `task-auto-group` | Recalculates auto-grouping labels | On task create/update |

### Modified Edge Functions

| Function | Change |
|----------|--------|
| `proactive-pipeline-analysis` | Write to `tasks` table (not `action_centre_items`) |
| `suggest-next-actions` | Write to `tasks` table (not `next_action_suggestions`) |
| `create-task-unified` | Extended to handle all new task types + AI status |
| `slack-task-reminders` | Updated to include AI draft notifications |
| `meetingbaas-webhook` | Auto-create follow-up tasks (not just action items) |

### Deprecated Edge Functions

| Function | Reason |
|----------|--------|
| `api-action-centre` | Absorbed into task API |

---

## 13. Migration Plan

### Phase 1: Schema Extension
- Add new columns to `tasks` table
- Update status + type enums
- Add indexes for new query patterns
- Update RLS policies

### Phase 2: Data Migration
- Migrate `action_centre_items` → `tasks` (with `source: 'ai_proactive'`)
- Migrate `next_action_suggestions` → `tasks` (with `source: 'meeting_ai'`)
- Auto-create tasks from `meeting_action_items` (link via `meeting_action_item_id`)
- Preserve all historical data

### Phase 3: UI Build
- Build Command Centre page + all new components
- Implement inline editing
- Build deliverable preview/editor
- Smart filters + auto-grouping
- Updated navigation (replace Tasks + Action Centre + Projects with Command Centre)

### Phase 4: AI Worker
- Build `unified-task-ai-worker` edge function
- Implement deliverable generation for each task type
- Context assembly (pull from conversations, deals, meetings, contacts)
- Confidence scoring + risk-level routing

### Phase 5: Signal Processor
- Build `task-signal-processor` edge function
- Connect all 8 signal sources
- Implement confidence-based routing (auto-execute vs draft vs ask)
- Slack confirmation flow for low-confidence signals

### Phase 6: Copilot Integration
- Update copilot to read/write unified task system
- New response components
- Bidirectional sync (edits in chat reflect in UI and vice versa)
- Learning from user edits and dismissals

### Phase 7: Cleanup
- Deprecate old tables (keep as archive for 90 days)
- Remove old components
- Update navigation
- Remove old edge functions

---

## 14. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Consolidation approach | Full merge into `tasks` | One mental model, one query surface, simpler architecture |
| Task visibility | Personal only | Users want their own view, no team permissions overhead |
| Primary UI pattern | **Full-screen master-detail with Notion-style editor (V2)** | Best surface for reviewing/editing AI deliverables inline. Evaluated against grouped stream (V1) — V2 selected for deeper content interaction |
| AI autonomy model | Risk + confidence based routing | Low-risk auto-executes; high-risk requires review |
| Organization | Smart filters (sidebar pills) | No manual overhead, quick filtering by status/AI state |
| Projects | Killed | No real data model existed, smart filters replace it |
| Copilot integration | Bidirectional | Users should work wherever they prefer |
| Deliverable model | JSONB on task row | Co-located with task, no separate tables |
| Kanban view | Removed | V2 master-detail layout is the sole view — kanban adds complexity without value for AI review workflows |
| Content rendering | Notion-style prose with editor toolbar | Rich deliverable display (tables, formatting, blockquotes) with inline editing capability |
| Comments | Threaded per-task with AI/human distinction | Users can instruct AI to revise via comments; AI explains its reasoning via comments |
| Activity trail | Per-task timeline | Full audit history of AI actions and human decisions |

---

## 15. Success Metrics

| Metric | Current Baseline | Target |
|--------|-----------------|--------|
| Daily active task users | Low (feature underutilized) | 80%+ of daily active users |
| AI-created tasks actioned (not dismissed/expired) | N/A | 60%+ acceptance rate |
| Time from meeting → follow-up sent | Manual (hours/days) | < 30 minutes (AI draft → approve) |
| Tasks completed per user per day | ~2 | ~8 (with AI doing the heavy lifting) |
| Action Centre items expired unused | High | 0 (no more expiry — tasks persist) |
| Surfaces user checks for actions | 4 (Tasks, AC, Next Actions, Meeting Items) | 1 (Command Centre) |

---

## 16. Open Questions

1. **Google Tasks Sync** — Should the unified system maintain Google Tasks bidirectional sync, or deprecate it in favor of the native experience?
2. **Subtask Hierarchy** — Keep the existing 5-level subtask system, or flatten to single-level checklists within tasks?
3. **Kanban View** — Keep as an optional view toggle in Command Centre, or fully commit to the list/stream view?
4. **Email Execution** — When AI sends an approved email, should it go through the user's connected Gmail/O365, or through a platform sending service?
5. **Notification Preferences** — How granular should Slack/email notification preferences be? Per-type? Per-risk-level? Per-company?
6. **Historical Data** — How long to keep completed tasks visible? Auto-archive after 30/60/90 days?
7. **Mobile Experience** — Is mobile web a priority for the Command Centre, or desktop-first?

---

## Appendix A: Current Schema Reference

See agent exploration reports for full current schema details:
- Tasks: 30+ columns with CRM linking, subtasks, Google sync
- Action Centre: 15+ columns with risk levels, source tracking, Slack sync
- Next Action Suggestions: 15+ columns with confidence scoring, activity linking
- Meeting Action Items: 10+ columns with importance classification

## Appendix B: Files to Modify/Remove

### Remove (after migration)
- `src/pages/platform/ActionCentre.tsx`
- `src/components/action-centre/*` (all files)
- `src/components/projects/*` (all files)
- `src/pages/ProjectsPage.tsx` (if exists)
- `src/components/meetings/NextActionSuggestions.tsx`
- `src/components/next-actions/CreateTaskFromSuggestionModal.tsx`
- `src/components/TaskDetailModal.tsx`

### Modify
- `src/lib/hooks/useTasks.ts` — Extended for new statuses, types, AI fields
- `src/lib/database/models.ts` — Updated Task interface
- `src/components/TaskForm.tsx` — Updated for new task types
- `src/components/TaskList.tsx` — Replaced by Command Centre (may keep as base)
- `src/lib/contexts/CopilotContext.tsx` — Updated to reference unified tasks
- Navigation/sidebar — Replace 3 nav items with 1

### Create
- `src/pages/platform/CommandCentre.tsx`
- `src/components/command-centre/*` (new component directory)
- `supabase/functions/unified-task-ai-worker/`
- `supabase/functions/task-signal-processor/`
- `supabase/migrations/YYYYMMDD_unified_task_system.sql`
