---
name: Next Meeting Command Center
description: |
  Full next-meeting preparation: finds your next upcoming meeting, generates a one-page brief,
  and creates a prep task with checklist. Use when a user says "prep for my next meeting",
  "what's my next meeting", "get me ready for my next call", or "next meeting command center".
  Automatically finds the next meeting -- no meeting ID needed.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "prep for my next meeting"
      intent: "next_meeting_prep"
      confidence: 0.95
      examples:
        - "prepare for my next meeting"
        - "get ready for my next call"
        - "next meeting prep"
    - pattern: "what's my next meeting"
      intent: "next_meeting_info"
      confidence: 0.90
      examples:
        - "when is my next meeting"
        - "next meeting details"
        - "what meeting is next"
    - pattern: "next meeting command center"
      intent: "command_center"
      confidence: 0.95
      examples:
        - "meeting command center"
        - "launch command center"
        - "open command center"
    - pattern: "get me ready for my next call"
      intent: "next_call_prep"
      confidence: 0.85
      examples:
        - "prep for the next call"
        - "ready for my next meeting"
        - "help me prepare for what's next"
  keywords:
    - "next meeting"
    - "command center"
    - "prep"
    - "prepare"
    - "next call"
    - "ready"
    - "upcoming"
    - "meeting"
    - "brief"
  required_context: []
  outputs:
    - next_meeting
    - brief
    - prep_task_preview
  priority: critical
  requires_capabilities:
    - calendar
    - crm
  workflow:
    - order: 1
      action: get_next_meeting
      input_mapping:
        include_context: true
      output_key: next_meeting
      on_failure: stop
    - order: 2
      action: get_meetings
      input_mapping:
        meeting_id: "${outputs.next_meeting.meeting.id}"
      output_key: meeting_data
      on_failure: continue
    - order: 3
      skill_key: meeting-prep-brief
      input_mapping:
        meeting_id: "${outputs.next_meeting.meeting.id}"
        meeting_data: "${outputs.meeting_data}"
        contact_data: "${outputs.next_meeting.context.contacts}"
      output_key: brief
      on_failure: stop
    - order: 4
      skill_key: meeting-command-center-plan
      input_mapping:
        next_meeting: "${outputs.next_meeting}"
        brief: "${outputs.brief}"
      output_key: plan
      on_failure: stop
    - order: 5
      action: create_task
      input_mapping:
        title: "${outputs.plan.prep_task.title}"
        description: "${outputs.plan.prep_task.description}"
        due_date: "${outputs.plan.prep_task.due_date}"
        priority: "${outputs.plan.prep_task.priority}"
      output_key: prep_task_preview
      on_failure: continue
      requires_approval: true
  linked_skills:
    - meeting-prep-brief
    - meeting-command-center-plan
---

## Available Context
@_platform-references/org-variables.md

# Next Meeting Command Center

1) Find next meeting
2) Generate a one-page brief
3) Produce a prep task checklist (preview first; confirm to create)
