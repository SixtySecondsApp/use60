---
name: Meeting Prep Sequence
description: |
  End-to-end meeting preparation: loads meeting, fetches primary contact, generates comprehensive brief with agenda and talking points. No follow-up email.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: meeting_scheduled
    - pattern: before_meeting
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
