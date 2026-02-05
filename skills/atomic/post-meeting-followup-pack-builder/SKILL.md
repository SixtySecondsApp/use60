---
name: Post-Meeting Follow-Up Pack Builder
description: |
  Build a multi-thread follow-up pack: buyer email context, internal Slack update, and 3 task previews from meeting context + digest.
metadata:
  author: sixty-ai
  version: "1"
  category: writing
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "meeting_ended"
    - pattern: "transcript_ready"
    - pattern: "user_request"
  requires_capabilities:
    - crm
    - email
    - messaging
  requires_context:
    - meeting_data
    - meeting_digest
  outputs:
    - buyer_email
    - slack_update
    - tasks
  priority: critical
---

# Post-Meeting Follow-Up Pack Builder

## Goal
Create a complete follow-up pack that a rep can use immediately:
- A **buyer-facing email** (context + subject suggestions)
- An **internal Slack update** (what happened + risks + asks)
- **3 task previews** (actionable, time-bound)

## Inputs
- `meeting_data`: output from `execute_action("get_meetings", {...})` (should include `meetings[0].summary` and optionally `meetings[0].transcript_text`)
- `meeting_digest`: output from `meeting-digest-truth-extractor`
- (Optional) `contact_data`: output from `execute_action("get_contact", { id })`

## Output Contract
Return a SkillResult with:
- `data.buyer_email`:
  - `to`: string | null
  - `subject`: string
  - `context`: string (structured bullets the email writer can use)
  - `tone`: "professional" | "friendly" | "executive"
- `data.slack_update`:
  - `channel`: "slack"
  - `message`: string (Slack-formatted)
  - `blocks`: optional Slack Block Kit payload (best-effort)
- `data.tasks`: array (3 items), each:
  - `title`: string
  - `description`: string (include checklist)
  - `due_date`: string (ISO date or relative like "tomorrow" if unsure)
  - `priority`: "high" | "medium" | "low"

## Guidance
- Use truth hierarchy from `meeting_digest` for decisions/commitments/risks.
- If you have a contact email (from `contact_data.contacts[0].email`), set `buyer_email.to`.
- Keep the buyer email **short** (<= 180 words) with a single clear CTA.
- Slack update should include: Summary, Risks, Next steps, Ask.
- Tasks should be: 1 internal follow-up, 1 customer follow-up, 1 deal hygiene/CRM.
