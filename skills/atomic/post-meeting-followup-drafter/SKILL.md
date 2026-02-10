---
name: Post-Meeting Follow-up Drafter
description: |
  Generate a follow-up email and internal Slack update from a meeting digest.
  Use when a user asks "draft a follow-up email for the meeting", "write a post-meeting email",
  "send meeting recap to the client", or needs professional follow-up communications.
  Returns email draft with recap, decisions, next steps, and CTA plus a Slack update.
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
    - pattern: "draft a follow-up email for the meeting"
      intent: "post_meeting_email"
      confidence: 0.85
      examples:
        - "write a follow-up email from the meeting"
        - "post-meeting follow-up email"
        - "draft meeting follow-up"
    - pattern: "send meeting recap"
      intent: "meeting_recap_email"
      confidence: 0.85
      examples:
        - "send a recap to the client"
        - "email the meeting summary"
        - "share meeting recap"
    - pattern: "meeting follow-up communications"
      intent: "followup_comms"
      confidence: 0.80
      examples:
        - "create meeting follow-up"
        - "post-meeting email and slack"
        - "follow-up from the call"
  keywords:
    - "follow-up"
    - "email"
    - "meeting"
    - "recap"
    - "post-meeting"
    - "draft"
    - "slack"
    - "send"
    - "summary"
  required_context:
    - meeting_digest
    - meeting_id
  inputs:
    - name: context
      type: string
      description: "Meeting digest or summary to generate follow-up communications from"
      required: true
    - name: tone
      type: string
      description: "Desired tone for the follow-up email"
      required: false
      default: "professional"
      example: "executive"
    - name: recipient_name
      type: string
      description: "Name of the primary recipient for the follow-up email"
      required: false
    - name: meeting_id
      type: string
      description: "Meeting identifier for fetching additional context"
      required: false
  outputs:
    - name: email_draft
      type: object
      description: "Follow-up email with subject, body sections, recipients, and quotes"
    - name: slack_update
      type: object
      description: "Internal Slack update with channel, message, and optional Block Kit payload"
    - name: subject_lines
      type: array
      description: "Array of subject line options for the follow-up email"
    - name: cta
      type: string
      description: "Clear call-to-action for the email"
  requires_capabilities:
    - email
    - messaging
  priority: high
  tags:
    - writing
    - meetings
    - follow-up
    - email
    - slack
---

# Post-Meeting Follow-up Drafter

## Goal
Generate professional follow-up communications (email + Slack) that recap meeting value and drive next steps.

## Required Capabilities
- **Email**: To draft and send follow-up emails
- **Messaging**: To post internal Slack updates

## Inputs
- `meeting_digest`: Output from meeting-digest-truth-extractor
- `meeting_id`: Meeting identifier
- `organization_id`: Current organization context

## Data Gathering (via execute_action)
1. Fetch meeting details: `execute_action("get_meetings", { meeting_id })`
2. Fetch contact details: `execute_action("get_contact", { id: contact_id })`
3. Fetch deal context: `execute_action("get_deal", { id: deal_id })`

## Output Contract
Return a SkillResult with:
- `data.email_draft`: Email draft object:
  - `subject`: Subject line (with variants)
  - `body`: Email body (structured sections)
  - `to`: Recipient email(s)
  - `cc`: CC recipients (if any)
  - `sections`: Array of sections:
    - `type`: "recap" | "value" | "decisions" | "next_steps" | "cta"
    - `content`: Section content
    - `quotes`: Relevant quotes from meeting
- `data.slack_update`: Internal Slack update object:
  - `channel`: Suggested channel
  - `message`: Slack-formatted message
  - `thread_ts`: Optional thread timestamp
- `data.subject_lines`: Array of subject line options
- `data.cta`: Clear call-to-action for the email
- `data.approval_required`: true (always require approval for sending)

## Structure Requirements
1. **Recap**: Brief summary of what was discussed
2. **Value**: What value was delivered/created in the meeting
3. **Decisions**: Key decisions made (with quotes if available)
4. **Next Steps**: Clear action items with owners and deadlines
5. **CTA**: Specific next action requested

## Guidelines
- Use organization brand_tone and writing_style
- Include "what we heard" quotes from transcript
- Avoid risky claims (use organization words_to_avoid list)
- Make CTAs specific and time-bound
- Generate both short and long email variants
- Always require approval before sending (approval-gated)
