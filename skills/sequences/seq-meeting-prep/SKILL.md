---
name: Meeting Prep Sequence
description: |
  End-to-end meeting preparation: loads meeting details, fetches contact context,
  and generates a comprehensive brief with agenda and talking points. Use when a user says
  "prep for my meeting with", "prepare me for the call", "meeting brief for",
  or needs to get ready for a specific upcoming meeting. Prep-only, no follow-up email.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "prep for my meeting"
      intent: "meeting_prep"
      confidence: 0.95
      examples:
        - "prep for the meeting with Acme"
        - "prepare me for my meeting"
        - "meeting prep"
    - pattern: "prepare me for the call"
      intent: "call_prep"
      confidence: 0.90
      examples:
        - "get me ready for the call"
        - "prepare for the call with"
        - "brief me before the call"
    - pattern: "meeting brief for"
      intent: "meeting_brief"
      confidence: 0.90
      examples:
        - "give me a brief for the meeting"
        - "meeting brief"
        - "brief for tomorrow's meeting"
  keywords:
    - "prep"
    - "prepare"
    - "meeting"
    - "brief"
    - "call"
    - "ready"
    - "agenda"
    - "talking points"
    - "before meeting"
  required_context:
    - meeting_id
    - event_id
  outputs:
    - brief
    - agenda
    - talking_points
  requires_capabilities:
    - calendar
    - crm
  priority: high
  linked_skills:
    - meeting-prep-brief
  workflow:
    - order: 1
      action: get_meetings
      input_mapping:
        meeting_id: "${trigger.params.meeting_id}"
      output_key: meeting_data
      on_failure: stop
    - order: 2
      action: get_contact
      input_mapping:
        id: "${outputs.meeting_data.meetings[0].primary_contact_id}"
      output_key: contact_data
      on_failure: continue
    - order: 3
      skill_key: meeting-prep-brief
      input_mapping:
        meeting_id: "${trigger.params.meeting_id}"
        meeting_data: "${outputs.meeting_data}"
        contact_data: "${outputs.contact_data}"
      output_key: brief
      on_failure: stop
  tags:
    - agent-sequence
    - meetings
    - preparation
    - pre-meeting
---

# Meeting Prep Sequence

This sequence orchestrates meeting preparation:
1. Loads meeting details (and attendees when available)
2. Fetches primary contact context
3. Generates comprehensive brief with agenda and talking points

**No follow-up email** - this is prep-only.
