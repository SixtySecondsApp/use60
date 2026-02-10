---
name: Post-Meeting Follow-Up Pack Builder
description: |
  Build a complete follow-up pack after a meeting: buyer-facing email, internal Slack update,
  and 3 actionable tasks. Use when a user asks "build a follow-up pack for the meeting",
  "create post-meeting deliverables", "what do I need to send after the call", or needs
  a full set of post-meeting communications and tasks ready to go.
metadata:
  author: sixty-ai
  version: "2"
  category: writing
  skill_type: atomic
  is_active: true
  agent_affinity:
    - outreach
    - meetings
  triggers:
    - pattern: "follow-up pack for the meeting"
      intent: "followup_pack"
      confidence: 0.85
      examples:
        - "build a follow-up pack"
        - "create post-meeting deliverables"
        - "meeting follow-up package"
    - pattern: "what do I need to send after the call"
      intent: "post_call_actions"
      confidence: 0.85
      examples:
        - "post-meeting tasks and emails"
        - "after meeting to-dos"
        - "what's needed after the meeting"
    - pattern: "post-meeting email and tasks"
      intent: "post_meeting_bundle"
      confidence: 0.80
      examples:
        - "email and tasks from the meeting"
        - "meeting follow-up bundle"
        - "create follow-up from meeting"
  keywords:
    - "follow-up pack"
    - "post-meeting"
    - "email"
    - "slack"
    - "tasks"
    - "meeting"
    - "deliverables"
    - "after call"
  requires_capabilities:
    - crm
    - email
    - messaging
  requires_context:
    - meeting_data
    - meeting_digest
  inputs:
    - name: context
      type: string
      description: "Meeting digest or summary to build the follow-up pack from"
      required: true
    - name: tone
      type: string
      description: "Desired tone for the buyer-facing email"
      required: false
      default: "professional"
      example: "friendly"
    - name: recipient_name
      type: string
      description: "Name of the buyer/recipient for the follow-up email"
      required: false
    - name: meeting_id
      type: string
      description: "Meeting identifier for fetching meeting data and transcript"
      required: false
  outputs:
    - name: buyer_email
      type: object
      description: "Buyer-facing email with to, subject, structured context, and tone"
    - name: slack_update
      type: object
      description: "Internal Slack update with summary, risks, next steps, and optional Block Kit"
    - name: tasks
      type: array
      description: "3 actionable task previews: internal follow-up, customer follow-up, deal hygiene"
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
