---
name: Meeting Prep Brief
description: |
  Generate a comprehensive pre-meeting brief with agenda, talking points, and risk assessment.
  Use when a user asks "brief me for my meeting", "prep for the call with Acme",
  "meeting brief", or needs context before a sales call. Uses calendar, CRM, and transcript data.
  Returns a structured brief with attendees, goals, talking points, and risks.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  agent_affinity:
    - meetings
  triggers:
    - pattern: "brief me for my meeting"
      intent: "meeting_brief"
      confidence: 0.85
      examples:
        - "meeting brief for tomorrow"
        - "brief me before the call"
        - "pre-meeting brief"
    - pattern: "prep for my meeting"
      intent: "meeting_prep"
      confidence: 0.85
      examples:
        - "prep for the call with"
        - "help me prepare for my meeting"
        - "meeting preparation"
    - pattern: "what should I know before the meeting"
      intent: "meeting_context"
      confidence: 0.80
      examples:
        - "context for my next call"
        - "background for the meeting"
        - "who am I meeting with"
  keywords:
    - "brief"
    - "meeting"
    - "prep"
    - "preparation"
    - "agenda"
    - "talking points"
    - "call"
    - "before meeting"
  required_context:
    - meeting_id
    - event_id
  inputs:
    - name: meeting_id
      type: string
      description: "The meeting or calendar event identifier to prepare a brief for"
      required: true
    - name: contact_id
      type: string
      description: "Primary contact associated with the meeting"
      required: false
    - name: include_transcript
      type: boolean
      description: "Whether to include previous meeting transcript context"
      required: false
      default: false
  outputs:
    - name: brief
      type: object
      description: "Structured pre-meeting brief with attendees, goals, context, and success criteria"
    - name: agenda
      type: array
      description: "Suggested agenda items for the meeting"
    - name: talking_points
      type: array
      description: "Key talking points aligned to deal stage and company needs"
    - name: risks
      type: array
      description: "Potential risks or objections to prepare for"
    - name: questions
      type: array
      description: "Strategic questions to ask during the meeting"
    - name: context_summary
      type: string
      description: "High-level summary of relationship and deal context"
  requires_capabilities:
    - calendar
    - crm
  priority: high
  tags:
    - sales-ai
    - meetings
    - preparation
    - pre-meeting
---

# Meeting Prep Brief

## Goal
Generate a comprehensive pre-meeting brief that helps sales reps prepare effectively.

## Required Capabilities
- **Calendar**: To fetch meeting details, attendees, and context
- **CRM**: To pull related deals, contacts, and company information
- **Transcript** (optional): To reference previous meeting notes

## Inputs
- `meeting_id` or `event_id`: The calendar event identifier
- `organization_id`: Current organization context

## Data Gathering (via execute_action)
1. Fetch meeting details: `execute_action("get_meetings", { meeting_id })`
2. Fetch primary contact (preferred): `execute_action("get_contact", { id: primary_contact_id })`
3. Fetch related deals (best-effort): `execute_action("get_deal", { name: company_or_deal_name })`
4. Fetch company status: `execute_action("get_company_status", { company_name })`
5. (Optional) Search for previous meeting transcripts if transcript capability available

## Output Contract
Return a SkillResult with:
- `data.brief`: Structured brief object with:
  - `meeting_title`: Meeting subject/title
  - `attendees`: Array of attendee objects (name, email, role, company)
  - `meeting_goals`: Primary objectives for this meeting
  - `context_summary`: Key context from CRM (deal stage, recent activity, relationship health)
  - `agenda`: Suggested agenda items
  - `talking_points`: Key points to cover (aligned to deal stage and company needs)
  - `questions`: Strategic questions to ask
  - `risks`: Potential risks or objections to prepare for
  - `success_criteria`: What "good" looks like for this meeting
- `data.context_summary`: High-level summary of relationship/deal context
- `references`: Links to related CRM records, previous meetings, etc.

## Guidelines
- Use organization context (company_name, brand_tone, products) to personalize talking points
- Reference deal stage to suggest appropriate next steps
- Flag any red flags or risks from CRM data
- Keep brief concise but actionable (aim for 1-page summary)
