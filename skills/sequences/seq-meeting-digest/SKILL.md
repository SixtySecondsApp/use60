---
name: Meeting Digest with Follow-up
description: |
  Complete post-meeting workflow: extracts truth from transcript, creates commitment tasks,
  drafts follow-up email, and posts Slack update. Use when a user says "digest my last meeting",
  "process the meeting transcript", "meeting summary and follow-up", or "what happened in
  the call and what do I need to do". All write actions require approval.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "digest my last meeting"
      intent: "meeting_digest"
      confidence: 0.95
      examples:
        - "digest the meeting"
        - "process my last meeting"
        - "meeting digest"
    - pattern: "meeting summary and follow-up"
      intent: "meeting_summary_followup"
      confidence: 0.90
      examples:
        - "summarize the meeting and create follow-ups"
        - "meeting recap with tasks"
        - "process the call"
    - pattern: "process the meeting transcript"
      intent: "transcript_processing"
      confidence: 0.90
      examples:
        - "analyze the transcript"
        - "what happened in the meeting"
        - "extract from transcript"
    - pattern: "what do I need to do after the meeting"
      intent: "post_meeting_actions"
      confidence: 0.85
      examples:
        - "post-meeting action items"
        - "what came out of the meeting"
        - "meeting commitments and tasks"
  keywords:
    - "digest"
    - "meeting"
    - "transcript"
    - "summary"
    - "follow-up"
    - "commitments"
    - "decisions"
    - "action items"
    - "post-meeting"
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
