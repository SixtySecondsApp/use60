---
name: Event Follow-Up Analyzer
description: |
  Analyze event attendees to identify warm leads and generate personalized follow-up recommendations.
  Use when a user asks "who should I follow up with from the event", "event follow-up plan",
  "analyze attendees from the conference", or needs post-event lead prioritization.
  Returns priority leads, follow-up actions, and draft emails.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  agent_affinity:
    - outreach
    - meetings
  triggers:
    - pattern: "follow up from the event"
      intent: "event_followup"
      confidence: 0.85
      examples:
        - "who should I follow up with from the event"
        - "event follow-up plan"
        - "follow up on event attendees"
    - pattern: "analyze event attendees"
      intent: "event_analysis"
      confidence: 0.85
      examples:
        - "analyze attendees from the conference"
        - "review event contacts"
        - "who were the best leads from the event"
    - pattern: "post-event leads"
      intent: "event_leads"
      confidence: 0.80
      examples:
        - "warm leads from the webinar"
        - "priority leads from the trade show"
        - "who should I contact from the event"
  keywords:
    - "event"
    - "attendees"
    - "conference"
    - "webinar"
    - "trade show"
    - "follow up"
    - "leads"
    - "post-event"
  required_context:
    - contacts
    - event_context
  inputs:
    - name: event_name
      type: string
      description: "Name of the event or conference to analyze follow-ups for"
      required: true
    - name: event_date
      type: string
      description: "Date of the event in ISO format"
      required: false
    - name: attendee_list
      type: array
      description: "List of attendee contacts or contact IDs from the event"
      required: false
    - name: event_topic
      type: string
      description: "Primary topic or theme of the event for personalizing follow-ups"
      required: false
  outputs:
    - name: priority_leads
      type: array
      description: "Top leads ranked by priority (hot/warm/nurture) with engagement signals"
    - name: followup_recommendations
      type: array
      description: "Recommended follow-up actions per contact with type, timing, and message"
    - name: email_drafts
      type: array
      description: "Draft follow-up emails for top leads with subject, body, and personalization"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales-ai
    - events
    - lead-nurturing
    - follow-up
---

# Event Follow-Up Analyzer

## Goal
Analyze event attendees to identify warm leads and generate personalized follow-up recommendations.

## Inputs
- `contacts`: List of contacts who attended the event
- `event_context`: Details about the event (name, date, topic)

## Output Contract
Return a SkillResult with:
- `data.priority_leads`: array of top leads to follow up with
  - `contact_id`: string
  - `name`: string
  - `company`: string | null
  - `priority`: "hot" | "warm" | "nurture"
  - `reason`: string (why they're a priority)
  - `engagement_signals`: string[] (questions asked, booth visited, etc.)
- `data.followup_recommendations`: array of recommended actions
  - `contact_id`: string
  - `action_type`: "email" | "call" | "linkedin" | "meeting"
  - `timing`: "today" | "this_week" | "next_week"
  - `suggested_message`: string
- `data.email_drafts`: array of draft emails for top leads
  - `to`: string (contact email)
  - `subject`: string
  - `body`: string
  - `contact_id`: string

## Guidance
- Prioritize leads who asked questions or showed strong engagement
- Personalize follow-ups based on their role and event participation
- Suggest timely actions (strike while iron is hot)
- Include specific references to the event in email drafts
