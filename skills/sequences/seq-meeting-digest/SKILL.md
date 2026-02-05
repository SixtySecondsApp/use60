---
name: Meeting Digest with Follow-up
description: |
  Complete post-meeting workflow: extracts truth from transcript, creates tasks, drafts follow-up email and Slack update. All write actions are approval-gated.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: meeting_ended
    - pattern: transcript_ready
  required_context:
    - meeting_id
    - transcript_id
  outputs:
    - digest
    - tasks
    - email_draft
    - slack_update
  requires_capabilities:
    - meetings
    - crm
    - email
    - messaging
  priority: critical
  linked_skills:
    - meeting-digest-truth-extractor
    - post-meeting-followup-drafter
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
      skill_key: meeting-digest-truth-extractor
      input_mapping:
        meeting_id: "${trigger.params.meeting_id}"
        transcript_id: "${trigger.params.transcript_id}"
        transcript: "${trigger.params.transcript}"
        meeting_data: "${outputs.meeting_data}"
        contact_data: "${outputs.contact_data}"
      output_key: digest
      on_failure: stop
    - order: 4
      action: create_task
      input_mapping:
        title: "${outputs.digest.commitments[0].commitment}"
        description: "From meeting: ${outputs.digest.decisions[0].decision}"
        due_date: "${outputs.digest.commitments[0].deadline}"
        confirm: true
      output_key: tasks_created
      on_failure: continue
      requires_approval: true
    - order: 5
      skill_key: post-meeting-followup-drafter
      input_mapping:
        meeting_digest: "${outputs.digest}"
        meeting_id: "${trigger.params.meeting_id}"
        meeting_data: "${outputs.meeting_data}"
        contact_data: "${outputs.contact_data}"
      output_key: followup
      on_failure: continue
    - order: 6
      action: draft_email
      input_mapping:
        to: "${outputs.contact_data.contacts[0].email}"
        subject: "${outputs.followup.email_draft.subject}"
        context: "${outputs.followup.email_draft.body}"
        confirm: true
      output_key: email_draft
      on_failure: continue
      requires_approval: true
    - order: 7
      action: send_notification
      input_mapping:
        channel: "${outputs.followup.slack_update.channel}"
        message: "${outputs.followup.slack_update.message}"
        confirm: true
      output_key: slack_sent
      on_failure: continue
      requires_approval: true
  tags:
    - agent-sequence
    - meetings
    - post-meeting
    - follow-up
    - transcript
---

# Meeting Digest Sequence

This sequence orchestrates post-meeting follow-up:
1. Loads meeting context
2. Extracts truth from transcript (decisions, commitments, MEDDICC deltas)
3. Creates tasks from commitments (approval-gated)
4. Drafts follow-up email
5. Drafts an email artifact via email capability (approval-gated)
6. Posts internal Slack update (approval-gated)

**All write actions require approval** before execution.
