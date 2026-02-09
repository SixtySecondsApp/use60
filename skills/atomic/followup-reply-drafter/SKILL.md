---
name: Follow-Up Reply Drafter
description: |
  Draft contextual reply emails for threads that need a response, with subject lines and clear CTAs.
  Use when a user asks "draft a reply", "help me respond to this email", "write a follow-up email",
  or needs email drafts for outstanding threads. Returns reply drafts and follow-up task previews.
metadata:
  author: sixty-ai
  version: "2"
  category: writing
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "draft a reply"
      intent: "reply_drafting"
      confidence: 0.85
      examples:
        - "draft a reply to this email"
        - "help me respond to this thread"
        - "write a reply"
    - pattern: "write a follow-up email"
      intent: "followup_email"
      confidence: 0.85
      examples:
        - "draft a follow-up email"
        - "help me write a follow-up"
        - "compose a reply email"
    - pattern: "respond to this email"
      intent: "email_response"
      confidence: 0.80
      examples:
        - "I need to reply to this"
        - "help me answer this email"
        - "what should I say in response"
  keywords:
    - "reply"
    - "draft"
    - "email"
    - "respond"
    - "follow-up"
    - "compose"
    - "write"
    - "thread"
  requires_capabilities:
    - email
    - crm
  requires_context:
    - threads_needing_response
    - contact_data
  inputs:
    - name: context
      type: string
      description: "Email thread content or summary requiring a reply"
      required: true
    - name: tone
      type: string
      description: "Desired tone for the reply"
      required: false
      default: "professional"
      example: "friendly"
    - name: recipient_name
      type: string
      description: "Name of the person being replied to"
      required: false
  outputs:
    - name: reply_drafts
      type: array
      description: "3-5 email draft objects with to, subject, context, tone, and linked IDs"
    - name: task_previews
      type: array
      description: "2-3 follow-up task previews with title, description, due date, and priority"
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
