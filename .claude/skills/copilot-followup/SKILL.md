---
name: Copilot Follow-up
description: |
  Draft a follow-up email based on the most recent meeting or activity with a contact.
  Use when a user asks "/followup", "follow up", "follow-up email", "draft a follow-up",
  "send a follow-up to [contact]", or "write a follow-up after the meeting".
  Pulls the latest meeting digest, activity history, and deal context to generate a
  personalized email with subject line, body, and suggested send time.
  Requires a contact or deal entity in context.
  Do NOT use for post-meeting recap emails -- use post-meeting-followup-drafter for those.
  This skill is for general follow-ups triggered by any recent activity or inactivity.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/followup"
    description: "Draft a follow-up email from recent activity"
    icon: "mail"
  context_profile: sales
  agent_affinity:
    - outreach
    - pipeline
  triggers:
    - pattern: "/followup"
      intent: "slash_followup"
      confidence: 0.95
      examples:
        - "/followup"
        - "/followup for Sarah"
        - "/followup on the Acme deal"
    - pattern: "follow up"
      intent: "draft_followup"
      confidence: 0.90
      examples:
        - "follow up with this contact"
        - "send a follow up"
        - "I need to follow up"
    - pattern: "follow-up email"
      intent: "followup_email"
      confidence: 0.90
      examples:
        - "draft a follow-up email"
        - "write a follow-up email to them"
        - "compose follow-up email"
  keywords:
    - "follow-up"
    - "followup"
    - "email"
    - "follow up"
    - "check in"
    - "touch base"
    - "nudge"
  requires_context:
    - contact
    - deal
  inputs:
    - name: contact_id
      type: string
      description: "The contact to follow up with"
      required: false
    - name: deal_id
      type: string
      description: "The deal context for the follow-up"
      required: false
    - name: context
      type: string
      description: "Additional context or instructions for the follow-up (e.g., 'about the pricing discussion')"
      required: false
    - name: tone
      type: string
      description: "Desired tone: professional, friendly, or executive"
      required: false
      default: "professional"
  outputs:
    - name: email_subject
      type: string
      description: "Recommended subject line for the follow-up email"
    - name: email_body
      type: string
      description: "Complete follow-up email body in plain text"
    - name: suggested_send_time
      type: string
      description: "Recommended send time based on activity recency and day/time optimization"
  requires_capabilities:
    - email
    - crm
  priority: high
  tags:
    - sales
    - email
    - follow-up
    - outreach
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

## Instructions

You are executing the /followup skill. Your job is to draft a contextual follow-up email based on the most recent interaction or activity with a contact or deal.

## Data Gathering

Collect intelligence before drafting:

1. **Fetch contact details**: `execute_action("get_contact", { id: contact_id })` -- name, title, company, email, last interaction
2. **Fetch deal context**: `execute_action("get_deal", { id: deal_id })` -- stage, amount, last activity, next steps
3. **Fetch recent activities**: Look for the most recent meeting, email, call, or task involving this contact in the last 30 days
4. **Fetch meeting digest**: If the most recent activity is a meeting, pull the digest for quotes and decisions
5. **Fetch open tasks**: Check for any pending tasks or commitments related to this contact/deal

## Follow-up Type Detection

Determine the follow-up type from the most recent activity:

| Last Activity | Follow-up Type | Timing |
|--------------|---------------|--------|
| Meeting (today) | Post-meeting recap | Within 1 hour |
| Meeting (1-3 days ago) | Check-in on commitments | Same day or next morning |
| Email sent (3-5 days, no reply) | Gentle nudge | Mid-morning, mid-week |
| Email sent (7+ days, no reply) | Re-engagement | With new value-add |
| Deal gone quiet (14+ days) | Re-activation | With trigger event or new info |
| Proposal sent (3+ days) | Proposal follow-up | With specific question |
| Task completed for them | Deliverable handoff | Immediately |

## Email Structure

### Subject Line
- Keep under 50 characters
- Reference the specific context (meeting topic, deliverable, deal name)
- If replying to an existing thread, preserve "Re:" prefix
- Generate 2-3 options for the user to choose from

### Email Body (5 sections, 80-150 words total)

1. **Opening (1 sentence)**: Reference the last interaction specifically. Never use "just checking in" or "hope you're well."
2. **Value-add (1-2 sentences)**: Provide something useful -- a resource, insight, answer to their question, or deliverable they requested.
3. **Context bridge (1 sentence)**: Connect the value-add back to their stated goals or pain points.
4. **CTA (1 sentence)**: Single specific ask. Confirmatory ("Does Thursday still work?") or micro-commitment ("Could you share the requirements doc?").
5. **Sign-off**: Brief, warm, professional.

## Suggested Send Time Logic

Calculate the optimal send time based on:
- **Day of week**: Tuesday-Thursday outperform Monday and Friday (HubSpot data)
- **Time of day**: 9-10am and 1-2pm in the recipient's timezone have highest open rates
- **Recency**: If the last interaction was today, suggest sending within 1-2 hours. If 3+ days ago, suggest next optimal morning slot.
- **Follow-up number**: First follow-up can be same day. Second follow-up should wait 3-5 business days. Third follow-up should wait 7+ days with a pattern break.

Return the `suggested_send_time` as an ISO timestamp with a human-readable note (e.g., "Tuesday 9:30 AM EST -- optimal open window").

## Tone Calibration

- **professional**: Clear, direct, respectful. Default for most B2B follow-ups.
- **friendly**: Warm, conversational, uses first names. For established relationships.
- **executive**: Brief, high-level, action-oriented. For C-suite recipients. Under 80 words.

Match the tone to the recipient's communication style from previous emails when possible.

## Anti-patterns (Never Do)

- Never open with "just checking in", "circling back", "touching base", or "hope this finds you well"
- Never re-pitch features or capabilities that were not discussed
- Never send a follow-up without a specific reason or value-add
- Never use guilt ("I haven't heard back from you")
- Never send more than 3 follow-ups without a pattern break (change channel, add new info, or involve a different person)

## Quality Checklist

Before returning:
- [ ] Email references a specific detail from the last interaction (not generic)
- [ ] Subject line is under 50 characters and context-specific
- [ ] Body is under 150 words
- [ ] Contains exactly one CTA (not zero, not two)
- [ ] CTA is a specific ask, not "let me know your thoughts"
- [ ] Tone matches the recipient's communication style
- [ ] No dead language ("synergies", "leverage", "streamline", "circle back")
- [ ] Suggested send time accounts for day/time optimization

## Error Handling

### No recent activity found
If there is no recent activity with this contact, ask: "What was your last interaction with [contact name] about? I need context to write a relevant follow-up."

### Contact not in CRM
If the contact is not found, ask: "Who would you like to follow up with? Please provide a name or email address."

### No deal linked
Generate a relationship-focused follow-up without deal-specific language. This is not an error -- many follow-ups are pre-deal or relationship maintenance.

### Multiple recent activities
If there are several recent interactions, prioritize the most recent one. If the user provided additional context in their message, use that to determine which activity to reference.
