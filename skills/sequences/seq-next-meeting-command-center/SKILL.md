---
name: Next Meeting Command Center
description: |
  Find your next meeting, generate a one-page brief, then prepare a single prep task checklist (approval-gated).
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: user_request
    - pattern: before_meeting
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

# Next Meeting Command Center

1) Find next meeting
2) Generate a one-page brief
3) Produce a prep task checklist (preview first; confirm to create)
