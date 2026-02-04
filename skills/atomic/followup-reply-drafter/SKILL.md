---
name: Follow-Up Reply Drafter
description: |
  Draft contextual reply emails for threads needing response, with suggested subject lines and clear CTAs.
metadata:
  author: sixty-ai
  version: "1"
  category: writing
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "followup_triage_complete"
  requires_capabilities:
    - email
    - crm
  requires_context:
    - threads_needing_response
    - contact_data
  outputs:
    - reply_drafts
    - task_previews
  priority: high
---

# Follow-Up Reply Drafter

## Goal
Draft **contextual reply emails** for threads needing response, with suggested subject lines and clear CTAs.

## Inputs
- `threads_needing_response`: output from `followup-triage`
- `contact_data`: from `execute_action("get_contact", { id })` for each thread's contact_id

## Output Contract
Return a SkillResult with:
- `data.reply_drafts`: array of 3-5 email drafts (top threads)
  - `to`: string (contact email)
  - `subject`: string (suggested subject, e.g., "Re: [original subject]")
  - `context`: string (structured bullets for the email writer)
  - `tone`: "professional" | "friendly" | "executive"
  - `thread_id`: string | null
  - `contact_id`: string | null
  - `deal_id`: string | null
- `data.task_previews`: array of 2-3 task previews (for follow-up actions)
  - `title`: string
  - `description`: string
  - `due_date`: string (ISO date, prefer "tomorrow")
  - `priority`: "high" | "medium" | "low"
  - `contact_id`: string | null
  - `deal_id`: string | null

## Guidance
- Use thread context to acknowledge what was asked/promised.
- Keep replies **short** (<= 150 words) with a single clear CTA.
- If thread is deal-related, include deal context subtly.
- Task previews should be: 1 internal follow-up, 1 customer-facing action.
