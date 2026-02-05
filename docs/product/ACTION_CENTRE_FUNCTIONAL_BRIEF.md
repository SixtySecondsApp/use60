# Action Centre - Functional Brief

> **Purpose**: Personal inbox for AI-generated suggestions awaiting user approval
> **URL**: `/action-centre`
> **Status**: Live, ready for design review

---

## Overview

The Action Centre is where users review and act on AI-suggested actions. Think of it as a "to-do inbox" where the AI proposes actions (send email, create task, post to Slack) and the user approves, edits, or dismisses them.

---

## Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Header                                                      │
│  ├─ Icon + "Action Centre" + Badge (pending count)          │
│  └─ Subtitle: "Review and approve AI-suggested actions"     │
├─────────────────────────────────────────────────────────────┤
│  Toolbar                                                     │
│  ├─ Search input ("Search actions...")                      │
│  ├─ Type filter dropdown                                    │
│  └─ Date filter dropdown                                    │
├─────────────────────────────────────────────────────────────┤
│  Tabs                                                        │
│  ├─ Pending (with count badge)                              │
│  ├─ Completed                                               │
│  └─ Recent Activity                                         │
├─────────────────────────────────────────────────────────────┤
│  Content Area                                                │
│  └─ List of ActionCards (or empty state)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Action Types (8 total)

| Type | Icon | Description | Example |
|------|------|-------------|---------|
| `email` | Mail | Draft email to send | "Follow up with Acme Corp" |
| `task` | CheckSquare | Task to create | "Schedule demo with TechStart" |
| `slack_message` | MessageSquare | Slack message to post | "Share deal update with team" |
| `field_update` | Edit | CRM field update | "Update deal stage to Negotiation" |
| `alert` | AlertTriangle | Deal/pipeline alert | "Deal at risk - no activity 14 days" |
| `insight` | Lightbulb | AI insight/recommendation | "Pipeline Health Alert" |
| `meeting_prep` | FileText | Meeting preparation brief | "Prep brief for TechCorp call" |

### Risk Levels (4 total)

| Level | Color | Dot | Use Case |
|-------|-------|-----|----------|
| `low` | Green | 🟢 | Safe actions (create task, acknowledge) |
| `medium` | Yellow/Amber | 🟡 | External actions (post to Slack) |
| `high` | Red | 🔴 | Sensitive actions (send email externally) |
| `info` | Blue | 🔵 | Informational (insights, alerts) |

### Statuses

| Status | Description |
|--------|-------------|
| `pending` | Awaiting user action |
| `approved` | User approved (action executed) |
| `dismissed` | User dismissed (no action taken) |
| `done` | Manually marked complete |
| `expired` | Auto-expired after 7 days |

---

## Components

### 1. ActionCard (Pending State)

```
┌────────────────────────────────────────────────────────────┐
│ [Icon]  Title                    [Type Badge] [Risk Dot]   │
│                                              "2 minutes ago"│
│         Description text goes here...                       │
│                                                             │
│         ▼ Show details                                      │
│                                                             │
│         [✓ Approve]  [✕ Dismiss]                           │
└────────────────────────────────────────────────────────────┘
```

**Variations by risk level:**
- **Low risk**: "Approve" + "Dismiss" buttons
- **Medium risk**: "Review & Approve" + "Dismiss" buttons (opens preview first)
- **High risk**: "Review & Approve" + "Dismiss" buttons (requires confirmation modal)
- **Info (insights)**: "Acknowledge" button only

**Expanded details panel:**
```
┌────────────────────────────────────────────────────────────┐
│ [Expanded ActionCard]                                       │
│                                                             │
│         ▲ Hide details                                      │
│         ┌──────────────────────────────────────────────┐   │
│         │ To: john@acme.com                            │   │
│         │ Subject: Following up on our proposal        │   │
│         │ Body: Hi John, I wanted to follow up...      │   │
│         └──────────────────────────────────────────────┘   │
│                                                             │
│         [✓ Approve]  [✕ Dismiss]                           │
└────────────────────────────────────────────────────────────┘
```

### 2. ActionCard (Completed State)

```
┌────────────────────────────────────────────────────────────┐
│ [Icon]  Title                    [Type Badge] [✓ Approved] │
│                                              "2 minutes ago"│
│         Description text goes here...                       │
│                                                             │
│         ▼ Show details                                      │
│                                                             │
│         "Approved 2 minutes ago"                            │
└────────────────────────────────────────────────────────────┘
```

### 3. Empty States

**Pending tab (empty):**
```
┌────────────────────────────────────────────────────────────┐
│                        [Bell Off Icon]                      │
│                                                             │
│                    No pending actions                       │
│     You're all caught up! New AI suggestions will appear    │
│                          here.                              │
└────────────────────────────────────────────────────────────┘
```

**Completed tab (empty):**
```
┌────────────────────────────────────────────────────────────┐
│                      [CheckCircle Icon]                     │
│                                                             │
│                   No completed actions                      │
│         Actions you approve will appear here.               │
└────────────────────────────────────────────────────────────┘
```

**Search (no results):**
```
┌────────────────────────────────────────────────────────────┐
│                        [Search Icon]                        │
│                                                             │
│                     No results found                        │
│               Try a different search term                   │
└────────────────────────────────────────────────────────────┘
```

### 4. Filter Dropdowns

**Type Filter Options:**
- All Types (default)
- Emails
- Tasks
- Slack
- Field Updates
- Alerts
- Insights
- Meeting Prep

**Date Filter Options:**
- All Time (default)
- Today
- Last 7 Days
- Last 30 Days

---

## Interactions

### User Actions

| Action | Trigger | Result |
|--------|---------|--------|
| Approve | Click "Approve" button | Execute action, move to Completed |
| Dismiss | Click "Dismiss" button | Mark dismissed, remove from Pending |
| Acknowledge | Click "Acknowledge" (insights) | Mark done, remove from Pending |
| Expand details | Click "Show details" | Toggle preview panel |
| Search | Type in search box | Filter items by title/description |
| Filter by type | Select from dropdown | Show only matching action types |
| Filter by date | Select from dropdown | Show items within date range |
| Switch tabs | Click tab | Show Pending/Completed/Recent Activity |

### Real-time Updates

- New items appear automatically (Supabase Realtime)
- Toast notification: "New action suggestion: [title]"
- Badge count updates in real-time

---

## Third Tab: Recent Activity

Shows 7-day conversation memory with the AI copilot.

```
┌────────────────────────────────────────────────────────────┐
│  [Search bar]                              [Refresh button] │
├────────────────────────────────────────────────────────────┤
│  TODAY                                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [Icon] [Conversation Badge]              "2:30 PM"    │  │
│  │        Discussed TechCorp deal strategy               │  │
│  │        "Focus on their integration needs..."          │  │
│  │        [👤 John Smith] [💰 TechCorp Deal]             │  │
│  │                                         [Resume →]    │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [Icon] [Action Sent Badge]               "11:45 AM"   │  │
│  │        Sent follow-up email to Acme Corp              │  │
│  │        [👤 Sarah Johnson]                             │  │
│  └──────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────┤
│  YESTERDAY                                                  │
│  ...                                                        │
└────────────────────────────────────────────────────────────┘
```

**Memory Types:**
- Conversation (chat with AI)
- Action Sent (email sent, Slack posted)
- Action Created (task created)
- Insight Viewed
- Meeting Prep
- Sequence Run

**Entity Links:**
- Contacts (blue, links to CRM contact)
- Deals (green, links to CRM deal)
- Companies (purple, links to CRM company)

---

## Navigation Badge

The sidebar shows a badge with the pending count:

```
Action Centre [4]
```

- Shows count of pending items
- Hides when count is 0
- Updates in real-time

---

## Design Considerations

### Current Pain Points
1. Cards are information-dense - may need visual hierarchy improvements
2. Risk level dots are small and easy to miss
3. Expanded details panel could be more scannable
4. No bulk actions (approve all, dismiss all)

### Suggested Improvements
1. Clearer visual distinction between risk levels
2. Preview thumbnails for emails/messages
3. Grouping by source (Pipeline Analysis, Meeting Prep, etc.)
4. Swipe gestures for mobile (swipe right = approve, left = dismiss)
5. Keyboard shortcuts (A = approve, D = dismiss, J/K = navigate)
6. Snooze option ("Remind me later")

### Accessibility
- All interactive elements have focus states
- Screen reader support via ARIA labels
- Keyboard navigable
- Color is not the only indicator (dots have tooltips)

---

## Technical Notes

- **Data source**: `action_centre_items` table in Supabase
- **Real-time**: Supabase Realtime subscriptions
- **State**: React Query for caching, Zustand for UI state
- **Animations**: Framer Motion for card transitions

---

## Files

| File | Purpose |
|------|---------|
| `src/pages/platform/ActionCentre.tsx` | Main page component |
| `src/components/action-centre/ActionCard.tsx` | Card component |
| `src/components/action-centre/ActionCentreTabs.tsx` | Tab navigation |
| `src/components/action-centre/RecentActivityList.tsx` | Memory/activity tab |
| `src/components/action-centre/ActionPreviewModal.tsx` | Preview modal |

---

## Questions for Designer

1. How should we differentiate risk levels more clearly?
2. Should we add a "bulk actions" toolbar for power users?
3. What's the ideal information density for the cards?
4. Should completed items show what action was taken (e.g., "Email sent to john@acme.com")?
5. How should we handle very long descriptions/previews?
6. Should we add a "pinned" or "starred" state for important items?
