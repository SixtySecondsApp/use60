---
name: Follow-Up Triage
description: |
  Identify email threads that need a response: unanswered questions, promised deliverables,
  and stale conversations. Use when a user asks "which emails need replies", "what follow-ups
  am I missing", "triage my inbox", or wants to find threads they haven't responded to.
  Returns prioritized threads needing attention.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "which emails need replies"
      intent: "email_triage"
      confidence: 0.85
      examples:
        - "what emails need my response"
        - "which threads am I behind on"
        - "emails I haven't replied to"
    - pattern: "triage my inbox"
      intent: "inbox_triage"
      confidence: 0.85
      examples:
        - "help me triage my inbox"
        - "sort my follow-ups"
        - "prioritize my email responses"
    - pattern: "what follow-ups am I missing"
      intent: "missed_followups"
      confidence: 0.80
      examples:
        - "am I missing any follow-ups"
        - "stale email threads"
        - "overdue responses"
  keywords:
    - "email"
    - "inbox"
    - "triage"
    - "follow-up"
    - "reply"
    - "respond"
    - "unanswered"
    - "stale"
    - "overdue"
  requires_capabilities:
    - email
    - crm
  requires_context:
    - email_threads
    - recent_contacts
  inputs:
    - name: days_since_contact
      type: number
      description: "Number of days without contact to flag as stale"
      required: false
      default: 7
    - name: limit
      type: number
      description: "Maximum number of threads to analyze"
      required: false
      default: 50
    - name: filter
      type: string
      description: "Filter criteria for thread selection"
      required: false
      example: "deal_related"
  outputs:
    - name: threads_needing_response
      type: array
      description: "5-10 threads needing response with contact, subject, reason, urgency, and context"
    - name: priorities
      type: array
      description: "Top 3 most urgent threads requiring immediate attention"
  priority: high
---

# Follow-Up Triage

## Goal
Identify **email threads** that need a response: unanswered questions, promised deliverables, stale conversations.

## Inputs
- `email_threads`: from `execute_action("search_emails", { limit: 50 })` (recent emails)
- `recent_contacts`: from `execute_action("get_contacts_needing_attention", { days_since_contact: 7, limit: 20 })`

## Output Contract
Return a SkillResult with:
- `data.threads_needing_response`: array of 5-10 threads
  - `thread_id`: string | null
  - `contact_email`: string
  - `contact_id`: string | null
  - `subject`: string
  - `last_message_date`: string (ISO date)
  - `reason`: string (why it needs response: "unanswered_question", "promised_deliverable", "stale_conversation", "follow_up_requested")
  - `urgency`: "high" | "medium" | "low"
  - `context`: string (deal name, company, etc.)
- `data.priorities`: array of top 3 threads (most urgent)

## Guidance
- Prioritize by: unanswered questions > promised deliverables > stale conversations.
- If a thread is linked to a deal (via contact_id → deal), include deal context.
- Mark as "high" urgency if: unanswered question > 2 days old, promised deliverable past due, or deal-related.
