-- Seed: Production Sequences (capability-driven)
-- Date: 2026-01-14
--
-- Purpose:
-- - Create 2 production sequences that chain skills and actions
-- - Sequences specify required capabilities and degrade gracefully
-- - Safe to re-run (UPSERT by unique skill_key)

BEGIN;

-- -----------------------------------------------------------------------------
-- Sequence 1: Meeting Prep (no follow-up)
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-meeting-prep',
  'agent-sequence',
  '{
    "name": "Meeting Prep Sequence",
    "description": "End-to-end meeting preparation: loads calendar event, fetches CRM context, generates comprehensive brief with agenda and talking points. No follow-up email.",
    "version": 1,
    "requires_capabilities": ["calendar", "crm"],
    "requires_context": ["meeting_id", "event_id"],
    "outputs": ["brief", "agenda", "talking_points"],
    "triggers": ["meeting_scheduled", "before_meeting"],
    "priority": "high",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_meetings",
        "input_mapping": {
          "meeting_id": "${trigger.params.meeting_id}"
        },
        "output_key": "meeting_data",
        "on_failure": "stop"
      },
      {
        "order": 2,
        "action": "get_contact",
        "input_mapping": {
          "id": "${outputs.meeting_data.meetings[0].primary_contact_id}"
        },
        "output_key": "contact_data",
        "on_failure": "continue"
      },
      {
        "order": 3,
        "skill_key": "meeting-prep-brief",
        "input_mapping": {
          "meeting_id": "${trigger.params.meeting_id}",
          "meeting_data": "${outputs.meeting_data}",
          "contact_data": "${outputs.contact_data}"
        },
        "output_key": "brief",
        "on_failure": "stop"
      }
    ]
  }'::jsonb,
  E'# Meeting Prep Sequence\n\nThis sequence orchestrates meeting preparation:\n1. Loads calendar event and attendees\n2. Fetches related CRM context (contacts, deals, company)\n3. Generates comprehensive brief with agenda and talking points\n\n**No follow-up email** - this is prep-only.\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Sequence 2: Meeting Digest with Follow-up Package
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-meeting-digest',
  'agent-sequence',
  '{
    "name": "Meeting Digest with Follow-up",
    "description": "Complete post-meeting workflow: extracts truth from transcript, creates tasks/activities, drafts follow-up email and Slack update. All write actions are approval-gated.",
    "version": 1,
    "requires_capabilities": ["meetings", "crm", "email", "messaging"],
    "requires_context": ["meeting_id", "transcript_id"],
    "outputs": ["digest", "tasks", "email_draft", "slack_update"],
    "triggers": ["meeting_ended", "transcript_ready"],
    "priority": "critical",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_meetings",
        "input_mapping": {
          "meeting_id": "${trigger.params.meeting_id}"
        },
        "output_key": "meeting_data",
        "on_failure": "stop"
      },
      {
        "order": 2,
        "action": "get_contact",
        "input_mapping": {
          "id": "${outputs.meeting_data.meetings[0].primary_contact_id}"
        },
        "output_key": "contact_data",
        "on_failure": "continue"
      },
      {
        "order": 3,
        "skill_key": "meeting-digest-truth-extractor",
        "input_mapping": {
          "meeting_id": "${trigger.params.meeting_id}",
          "transcript_id": "${trigger.params.transcript_id}",
          "transcript": "${trigger.params.transcript}",
          "meeting_data": "${outputs.meeting_data}",
          "contact_data": "${outputs.contact_data}"
        },
        "output_key": "digest",
        "on_failure": "stop"
      },
      {
        "order": 4,
        "action": "create_task",
        "input_mapping": {
          "title": "${outputs.digest.commitments[0].commitment}",
          "description": "From meeting: ${outputs.digest.decisions[0].decision}",
          "due_date": "${outputs.digest.commitments[0].deadline}",
          "confirm": true
        },
        "output_key": "tasks_created",
        "on_failure": "continue",
        "requires_approval": true
      },
      {
        "order": 5,
        "skill_key": "post-meeting-followup-drafter",
        "input_mapping": {
          "meeting_digest": "${outputs.digest}",
          "meeting_id": "${trigger.params.meeting_id}",
          "meeting_data": "${outputs.meeting_data}",
          "contact_data": "${outputs.contact_data}"
        },
        "output_key": "followup",
        "on_failure": "continue"
      },
      {
        "order": 6,
        "action": "draft_email",
        "input_mapping": {
          "to": "${outputs.contact_data.contacts[0].email}",
          "subject": "${outputs.followup.email_draft.subject}",
          "context": "${outputs.followup.email_draft.body}",
          "confirm": true
        },
        "output_key": "email_draft",
        "on_failure": "continue",
        "requires_approval": true
      },
      {
        "order": 7,
        "action": "send_notification",
        "input_mapping": {
          "channel": "${outputs.followup.slack_update.channel}",
          "message": "${outputs.followup.slack_update.message}",
          "confirm": true
        },
        "output_key": "slack_sent",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Meeting Digest Sequence\n\nThis sequence orchestrates post-meeting follow-up:\n1. Extracts truth from transcript (decisions, commitments, MEDDICC deltas)\n2. Creates tasks/activities from commitments (approval-gated)\n3. Drafts follow-up email (approval-gated)\n4. Posts internal Slack update (approval-gated)\n\n**All write actions require approval** before execution.\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;
