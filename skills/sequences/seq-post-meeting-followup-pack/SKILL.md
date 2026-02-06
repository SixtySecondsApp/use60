---
name: Post-Meeting Follow-Up Pack
description: |
  From your most recent recorded meeting (or a provided meeting_id): extract truth, build a follow-up pack (email + Slack + tasks), and preview actions (approval-gated).
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "user_request"
    - pattern: "meeting_ended"
    - pattern: "transcript_ready"
  requires_capabilities:
    - crm
    - email
    - messaging
  requires_context: []
  outputs:
    - meeting_data
    - contact_data
    - digest
    - pack
    - email_preview
    - slack_preview
    - task_preview
  priority: critical
  workflow:
    - order: 1
      action: get_meetings
      input_mapping:
        meeting_id: "${trigger.params.meeting_id}"
        limit: 1
      output_key: meeting_data
      on_failure: stop
    - order: 2
      action: get_contact
      input_mapping:
        id: "${outputs.meeting_data.meetings[0].primary_contact_id}"
      output_key: contact_data
      on_failure: continue
    - order: 3
      skill_key: meeting-digest-truth-extractor
      input_mapping:
        meeting_id: "${outputs.meeting_data.meetings[0].id}"
        transcript_id: "${outputs.meeting_data.meetings[0].id}"
        transcript: "${outputs.meeting_data.meetings[0].transcript_text}"
      output_key: digest
      on_failure: stop
    - order: 4
      skill_key: post-meeting-followup-pack-builder
      input_mapping:
        meeting_data: "${outputs.meeting_data}"
        contact_data: "${outputs.contact_data}"
        meeting_digest: "${outputs.digest}"
      output_key: pack
      on_failure: stop
    - order: 5
      action: draft_email
      input_mapping:
        to: "${outputs.pack.buyer_email.to}"
        subject: "${outputs.pack.buyer_email.subject}"
        context: "${outputs.pack.buyer_email.context}"
        tone: "${outputs.pack.buyer_email.tone}"
      output_key: email_preview
      on_failure: continue
    - order: 6
      action: send_notification
      input_mapping:
        channel: slack
        message: "${outputs.pack.slack_update.message}"
        blocks: "${outputs.pack.slack_update.blocks}"
      output_key: slack_preview
      on_failure: continue
      requires_approval: true
    - order: 7
      action: create_task
      input_mapping:
        title: "${outputs.pack.tasks[0].title}"
        description: "${outputs.pack.tasks[0].description}"
        due_date: "${outputs.pack.tasks[0].due_date}"
        priority: "${outputs.pack.tasks[0].priority}"
        contact_id: "${outputs.meeting_data.meetings[0].primary_contact_id}"
      output_key: task_preview
      on_failure: continue
      requires_approval: true
  linked_skills:
    - meeting-digest-truth-extractor
    - post-meeting-followup-pack-builder
---

# Post-Meeting Follow-Up Pack

This sequence produces a complete follow-up package for your most recent recorded meeting:
1. Load the latest meeting (or a provided meeting_id)
2. Extract decisions/commitments/risks from transcript + CRM context
3. Build a buyer email + internal Slack update + 3 tasks
4. Preview email drafting, Slack posting, and task creation (approval-gated)
