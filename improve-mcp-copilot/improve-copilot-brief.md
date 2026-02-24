# U60 Sales Copilot Integration Brief
## Version 2 — Focused on Brilliance, Not Breadth

---

## Executive Summary

This brief outlines how to integrate the new Sales Copilot chat interface into U60. The guiding principle: **make what we have brilliant before adding anything new.**

We're shipping a chat interface that feels like talking to a teammate who's been in every meeting and knows your HubSpot inside out. The magic isn't more features—it's deeper context and faster action.

---

## Core Focus: Current Integrations Only

### What We're Making Brilliant

| Integration | Role in Copilot | Why It Matters |
|-------------|-----------------|----------------|
| **HubSpot** | Primary CRM context — contacts, companies, deals, activities | The source of truth for every conversation |
| **Fathom** | Meeting transcripts, action items, key moments | "I was in the room" knowledge |
| **Slack** | Notification delivery, quick approvals | Where reps already live |
| **Calendar** | Meeting awareness, prep triggers | Contextual timing |

### What We're NOT Adding (For Now)

- Salesforce
- Additional CRMs
- Email providers beyond what's connected
- Enrichment/research tools
- Sequence builders

**If it's not in the table above, it's not in scope.**

---

## Critical UI Changes Required

### 1. Remove "Artifacts" — Replace with "Action Items"

The current design has an "Artifacts" panel showing outputs like documents and reports. **Remove this entirely.**

Replace with **Action Items** — a human-in-the-loop approval queue.

**What Action Items Are:**
- Tasks the AI has prepared that need human approval
- Follow-up emails ready to send
- Meeting prep briefs to review
- Suggested next steps to confirm

**Action Item States:**
```
┌─────────────────────────────────────────────────┐
│ 📧 Follow-up: Sarah Chen (Acme Corp)            │
│ "Thanks for the call today. As discussed..."   │
│                                                 │
│ [👁️ Preview]  [✏️ Edit]  [✓ Approve & Send]    │
└─────────────────────────────────────────────────┘
```

**User Flow:**
1. AI generates a follow-up based on Fathom transcript
2. Action Item appears in right panel
3. User clicks "Preview" to see full email
4. User can "Edit" (opens editor), "Approve & Send", or "Dismiss"
5. On approval → sends via connected email or pushes to Slack
6. Item moves to "Completed" or disappears

**Action Item Types (V1):**
- Follow-up email drafts
- Meeting prep summaries
- Suggested HubSpot updates (e.g., "Update deal stage to Negotiation?")
- Reminder nudges ("You haven't followed up with X in 7 days")

### 2. 100% Viewport Height — No Scroll Past Screen

**Problem:** The current design pushes content below the fold. Users lose sight of the chat input or message history.

**Requirement:** The entire interface must fit within `100vh`. Always visible:
- Chat input at bottom
- Message history (scrollable within its container)
- Right panel (Action Items, Context, Connections)

**CSS Constraint:**
```css
.copilot-container {
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto; /* Scroll WITHIN this container only */
}

.chat-input {
  flex-shrink: 0; /* Never collapse, always visible */
}
```

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────────┐ ─┐
│  Header (workspace title, back button)                      │  │
├─────────────────────────────────────┬───────────────────────┤  │
│                                     │  Action Items         │  │
│  Chat Messages                      │  ───────────────────  │  │
│  (scrolls internally)               │  [Pending items...]   │  │
│                                     │                       │  │ 100vh
│                                     ├───────────────────────┤  │
│                                     │  Context              │  │
│                                     │  (HubSpot, Fathom)    │  │
│                                     ├───────────────────────┤  │
│                                     │  Connected            │  │
├─────────────────────────────────────┤  (integration icons)  │  │
│  Chat Input (always visible)        │                       │  │
└─────────────────────────────────────┴───────────────────────┘ ─┘
```

**Non-Negotiable:** The chat input and send button must be visible at all times without scrolling the page. Message overflow happens inside the message container, not the page.

---

## Right Panel Redesign

### Panel 1: Action Items (Replaces Artifacts)

**Header:** "Action Items" with count badge

**Empty State:**
```
No pending actions.
Ask me to draft a follow-up or prep for a meeting.
```

**With Items:**
```
Action Items (2)
─────────────────────────────────────
📧 Follow-up: Sarah Chen
   Ready to send • Generated 2m ago
   [Preview] [Approve]

📋 Meeting Prep: TechCorp call (3pm)
   5 talking points • 2 risks flagged
   [View Brief]
─────────────────────────────────────
```

**Interaction Pattern:**
- Click item → expands inline OR opens modal
- "Approve & Send" → confirms action, shows success state
- "Edit" → opens editable version
- "Dismiss" → removes with optional feedback ("Not relevant" / "Bad timing")

### Panel 2: Context (What the AI Knows)

Show exactly what data the Copilot is drawing from. This builds trust.

**Structure:**
```
Context
─────────────────────────────────────
🟠 HubSpot
   Acme Corp (Deal: £45,000)
   Sarah Chen (Decision Maker)
   12 activities in last 30 days

🎙️ Fathom
   3 calls with Sarah Chen
   Last: 14 Jan (32 min)
   Key: Budget approval pending Q2

📅 Calendar
   Next meeting: Tomorrow, 2pm
─────────────────────────────────────
```

Each item should be clickable to show more detail or link out to the source.

### Panel 3: Connected (Compact)

Simple status row showing active integrations:

```
Connected
─────────────────────────────────────
[HubSpot ✓] [Fathom ✓] [Slack ✓] [Cal ✓]

[+ Add connector]
─────────────────────────────────────
```

Keep this minimal. The integrations are working—no need to oversell.

---

## Suggested Actions (Welcome State)

Reduce from 6 cards to 4. Only show what we deliver well today:

| Action | Icon | Description | Triggers |
|--------|------|-------------|----------|
| **Draft a follow-up** | ✉️ | Post-meeting emails with context | Fathom + HubSpot |
| **Prep for a meeting** | 📅 | Briefing before your next call | Calendar + Fathom + HubSpot |
| **What needs attention?** | 🎯 | Stale deals, overdue tasks | HubSpot analysis |
| **Catch me up** | 📊 | Summary of recent activity | Fathom + HubSpot |

**Removed:**
- "Research a prospect" (no enrichment)
- "Build a sequence" (not in scope)
- "Analyse my pipeline" (too vague, overpromises)

---

## Quick Prompts (Welcome State)

Update to reflect actual capabilities:

```
"Draft follow-ups for today's meetings"
"What did Sarah say about budget?"
"Which deals haven't moved in 2 weeks?"
"Prep me for my 3pm call"
"Summarise my calls with Acme"
"What action items am I behind on?"
```

Every prompt should return a useful response with current integrations.

---

## Chat Behaviour

### Response Style

The AI should speak with confidence because it has real context:

**Good:**
> "Sarah mentioned budget sign-off is stuck with finance—that came up in both your January calls. The deal's been in negotiation for 32 days. I've drafted a check-in email that references the ROI calculator. It's in your Action Items—want me to walk through it?"

**Bad:**
> "I can help you with that! Let me search for information about Acme Corp in your CRM..."

### What the AI Should Never Say

- "I don't have access to..."
- "I'm not sure, but..."
- "You might want to check..."
- "I can't do that yet..."

If the AI can't do something, it should offer what it *can* do instead.

### Proactive Suggestions

After completing a task, the AI should suggest logical next steps:

> "Follow-up sent to Sarah. Want me to set a reminder if she doesn't reply in 3 days, or prep talking points for your meeting on Thursday?"

---

## HubSpot Integration Depth

Since HubSpot is the focus, define what "brilliant" looks like:

### Data We Pull

| HubSpot Object | What We Use | How It Appears |
|----------------|-------------|----------------|
| **Contacts** | Name, email, role, company, last activity | Context panel + AI responses |
| **Companies** | Name, industry, deal value, lifecycle stage | Context panel |
| **Deals** | Stage, value, close date, associated contacts | "What needs attention" + AI responses |
| **Activities** | Emails, calls, meetings, notes | Timeline awareness |
| **Tasks** | Open tasks, due dates | Action Items suggestions |

### Actions We Can Take

| Action | Via Copilot | Notes |
|--------|-------------|-------|
| View contact/deal info | ✅ | In context panel and responses |
| Draft email to contact | ✅ | Action Item with send |
| Update deal stage | ✅ | Suggest as Action Item, user confirms |
| Create follow-up task | ✅ | After email sent |
| Log activity | ✅ | Automatic after actions |

### What We Don't Do (Yet)

- Create new contacts/deals
- Bulk updates
- Workflow automation
- Custom property management

---

## Action Items: Full Specification

### Data Model

```typescript
interface ActionItem {
  id: string;
  type: 'follow-up' | 'meeting-prep' | 'crm-update' | 'reminder';
  status: 'pending' | 'approved' | 'dismissed' | 'edited';
  title: string;
  preview: string;
  content: object; // Full email, brief, etc.
  context: {
    hubspotContact?: string;
    hubspotDeal?: string;
    fathomCallIds?: string[];
  };
  createdAt: Date;
  actions: ('preview' | 'edit' | 'approve' | 'dismiss')[];
}
```

### Approval Flow

```
[AI generates action]
        ↓
[Action Item appears in panel: "Pending"]
        ↓
[User clicks "Preview"]
        ↓
[Modal/inline shows full content]
        ↓
    ┌───┴───┐
[Edit]    [Approve]    [Dismiss]
    ↓         ↓            ↓
[Editor]  [Execute]   [Remove + 
    ↓         ↓        feedback]
[Save →   [Success 
Approve]   toast]
```

### Slack Fallback

If email sending isn't configured, "Approve & Send" should:
1. Push the draft to a Slack DM or channel
2. User copies/sends manually
3. Still counts as approved for tracking

---

## Implementation Checklist

### UI Changes (Dev Team)

- [ ] Remove Artifacts panel
- [ ] Add Action Items panel with approval flow
- [ ] Enforce 100vh container height
- [ ] Chat messages scroll within fixed container
- [ ] Chat input always visible at bottom
- [ ] Reduce welcome actions from 6 to 4
- [ ] Update quick prompts to capability-matched list
- [ ] Context panel shows HubSpot + Fathom sources

### Integration Work

- [ ] HubSpot: Ensure all data points listed above are accessible
- [ ] Fathom: Call history and transcript snippets in context
- [ ] Slack: Action Item approval notifications
- [ ] Calendar: Next meeting awareness for prep triggers

### AI Behaviour

- [ ] Response style guide implemented
- [ ] Proactive suggestions after task completion
- [ ] No "I can't" responses—always offer alternatives
- [ ] Context references include specific names, dates, quotes

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Action Items generated/day | 5+ per active user | Count in DB |
| Approval rate | >60% | Approved / Generated |
| Time to approval | <5 min | Timestamp delta |
| Follow-ups sent via Copilot | 10+/week per user | Tracking |
| Daily active users | 70% of accounts | Login + action |

---

## Summary

**Three things to get right:**

1. **Action Items over Artifacts** — Everything the AI produces should be approvable, editable, and actionable. No passive documents.

2. **100vh always** — The chat interface should feel like a chat app, not a scrolling webpage. Input visible, messages contained.

3. **HubSpot brilliance** — Deep integration with one CRM beats shallow integration with three. Know the contacts, know the deals, know the timeline.

Ship this. Then make it better.

---

*Brief v2 — January 2026*