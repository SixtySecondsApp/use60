---
name: Slack Actions Query
namespace: slack
description: |
  Execute quick sales actions from Slack DM: draft follow-up emails, create tasks, and schedule meetings.
  Use when a Slack user wants to draft an email, write a follow-up, create a task or reminder,
  or schedule a meeting. Returns AI-drafted email previews with approve/edit/dismiss actions,
  or task creation confirmations. Supports preview-then-confirm flow for sends.
metadata:
  author: sixty-ai
  version: "1"
  category: slack-copilot
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - slack
  triggers:
    - pattern: "draft a follow-up"
      intent: "draft_email"
      confidence: 0.92
      examples:
        - "draft a follow-up for the Acme deal"
        - "write a follow-up email to Sarah Chen"
        - "compose a follow-up after yesterday's call"
    - pattern: "create a task"
      intent: "create_task"
      confidence: 0.90
      examples:
        - "create a task to send the proposal"
        - "add a task: follow up with Acme next Monday"
        - "remind me to send the contract"
        - "create a reminder to call John"
    - pattern: "schedule a meeting"
      intent: "schedule_meeting"
      confidence: 0.85
      examples:
        - "schedule a meeting with Sarah Chen"
        - "book a call with Acme"
        - "set up a demo with GlobalTech"
    - pattern: "write an email"
      intent: "draft_email"
      confidence: 0.88
      examples:
        - "write an email to follow up on the proposal"
        - "draft an email to John about the contract"
        - "compose a message for the Acme contact"
    - pattern: "send a follow-up"
      intent: "send_email"
      confidence: 0.82
      examples:
        - "send a follow-up to Sarah"
        - "send an email to Acme"
  keywords:
    - "draft"
    - "write"
    - "compose"
    - "send"
    - "create"
    - "schedule"
    - "book"
    - "set up"
    - "make"
    - "email"
    - "follow-up"
    - "follow up"
    - "message"
    - "note"
    - "task"
    - "todo"
    - "reminder"
    - "action item"
    - "meeting"
    - "call"
    - "calendar"
  required_context:
    - slack_user_id
  inputs:
    - name: action_type
      type: string
      enum: ["draft_email", "create_task", "schedule_meeting", "send_email"]
      description: "The type of action to perform"
      required: true
    - name: deal_name
      type: string
      description: "Deal name to associate the action with"
      required: false
    - name: contact_name
      type: string
      description: "Contact name to associate the action with"
      required: false
    - name: raw_query
      type: string
      description: "The original Slack message text"
      required: true
  outputs:
    - name: slack_blocks
      type: array
      description: "Slack Block Kit blocks with action buttons for approve/edit/dismiss"
    - name: text
      type: string
      description: "Fallback plain text if blocks are unavailable"
    - name: pending_action
      type: object
      description: "Stored pending action for preview->confirm flow"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - slack
    - actions
    - email
    - task
    - draft
    - create
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Slack Actions Query

## Goal
Enable quick sales actions from Slack without leaving the conversation. The pattern is always preview-then-confirm — show the draft or task details, let the user approve or edit, then execute. Never execute irreversible actions (sending emails, creating records) without explicit user confirmation.

## Action Types

### Draft Email (`draft_email`)

Generate a follow-up email draft using AI, then present it for approval.

**Context gathering**:
1. Find the most relevant deal (by `deal_name` or first active deal)
2. Find the most relevant contact (by `contact_name` or contact linked to the deal)
3. Fetch last meeting summary for context

**If no deal and no contact found**: Return "I need more context to draft an email. Try: 'Draft a follow-up for [deal name]' or 'Draft an email to [contact name]'."

**AI email generation** (Claude Haiku):
- System prompt: "You are a sales email assistant. Write concise, professional follow-up emails. Today's date: {today}. Keep emails under 150 words. Be warm but direct. Include a clear next step or CTA."
- Context injected: deal name + stage, contact name + title + company, last meeting summary (first 500 chars)
- User prompt: the raw query + context parts

**Response format**:
- Section: `*Draft Follow-up for {Recipient Name}:*`
- Divider
- Section: the AI-generated email draft
- Divider
- Actions:
  - "Approve & Send" (primary, green) — `actionId: copilot_send_email`, value: `{ draft, dealId, contactId }`
  - "Edit" — `actionId: copilot_edit_draft`, value: `{ draft, dealId }`
  - "Dismiss" — `actionId: copilot_dismiss`, value: `dismiss`
- Context: "I'll hold this draft until you approve. Reply with edits if you want changes."

**Store `pendingAction`**:
```json
{
  "type": "send_email",
  "data": { "draft": "...", "dealId": "...", "contactId": "...", "recipientEmail": "..." }
}
```

**Fallback (AI unavailable)**:
- Section: "I'd draft a follow-up for *{Recipient Name}*, but I need the AI service to generate it."
- Section (if last meeting summary available): "Based on your last meeting: _{summary truncated to 200 chars}_"
- Context: "Try again in a moment, or draft it manually in the app."

### Create Task (`create_task`)

Extract the task description from the message and present a confirmation.

**Task title extraction**:
- Match pattern: `/(?:create|add|make)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)/i`
- If no match: use the full raw query as the task title
- Strip trailing period from extracted title

**Response format**:
- Section: `*Create Task:*\n{taskTitle}\nDeal: {deal.title}` (omit deal line if no deal)
- Actions:
  - "Create Task" (primary, green) — `actionId: copilot_create_task`, value: `{ title, dealId }`
  - "Edit First" — `actionId: copilot_edit_task`, value: `{ title, dealId }`
  - "Cancel" — `actionId: copilot_dismiss`, value: `dismiss`

**Store `pendingAction`**:
```json
{
  "type": "create_task",
  "data": { "title": "...", "dealId": "..." }
}
```

### Schedule Meeting (`schedule_meeting`)

Meeting creation requires the full app — redirect the user gracefully.

**Response format**:
- Section: If contact found: "Schedule a meeting with *{Contact Name}* in the app. Use /sixty calendar to check availability."
         If no contact: "Meeting creation is in the app. Use /sixty calendar to check availability."
- Context: "Use `/sixty calendar` to see your schedule, or ask me 'show my meetings this week'."

### Send Email Confirmation (`send_email`)

User said "send" without first drafting — guide them to the correct flow.

**Response format**:
- Plain text: "To send an email, first draft one with 'Draft a follow-up for [deal]' and then approve it."

## Data Sources

- **Deals**: `execute_action("list_deals", { status: "active", owner: slack_user_id })`
- **Contacts**: `execute_action("search_contacts", { query: contact_name })`
- **Last meeting**: `execute_action("list_meetings", { owner: slack_user_id, limit: 1 })`

## Preview-Confirm Flow

All actions that create or send data use the preview-confirm pattern:
1. User requests action → show preview with Approve/Edit/Dismiss buttons
2. User clicks "Approve" → system executes the action
3. User clicks "Edit" → system opens editor (in-app or inline)
4. User clicks "Dismiss" → clear pending action, no action taken

The `pendingAction` object is stored server-side keyed to the Slack thread so follow-up "confirm" messages can execute it.

## Response Constraints

- Never execute sends or creates without explicit button click confirmation
- Email drafts: 150 words maximum — brevity beats comprehensiveness for follow-ups
- Task titles: preserve the user's language — don't rewrite or clean up their phrasing significantly
- Always include "Dismiss" / "Cancel" option — give users an escape hatch
- Today's date MUST be injected into email generation prompts for temporal accuracy

## Error Cases

- **No context for email draft**: Return guidance message with example phrasings
- **AI unavailable**: Show structured fallback with last meeting context (never fail silently)
- **Action type unrecognised**: Return "Choose: draft email, create task, or schedule meeting."
