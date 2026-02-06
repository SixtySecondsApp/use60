# followup-triage

> This reference is auto-populated from `skills/atomic/followup-triage/SKILL.md`.
> Do not edit directly — edit the source skill and re-sync.


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
