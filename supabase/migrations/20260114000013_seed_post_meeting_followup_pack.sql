-- Seed: Post-Meeting Follow-Up Pack (multi-thread demo workflow)
-- Date: 2026-01-14
--
-- Adds:
-- - Skill: post-meeting-followup-pack-builder
-- - Sequence: seq-post-meeting-followup-pack
--
-- Safe to re-run (UPSERT by unique skill_key)

BEGIN;

-- -----------------------------------------------------------------------------
-- Skill: Post-Meeting Follow-Up Pack Builder
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'post-meeting-followup-pack-builder',
  'writing',
  '{
    "name": "Post-Meeting Follow-Up Pack Builder",
    "description": "Build a multi-thread follow-up pack: buyer email context, internal Slack update, and 3 task previews from meeting context + digest.",
    "version": 1,
    "requires_capabilities": ["crm", "email", "messaging"],
    "requires_context": ["meeting_data", "meeting_digest"],
    "outputs": ["buyer_email", "slack_update", "tasks"],
    "triggers": ["meeting_ended", "transcript_ready", "user_request"],
    "priority": "critical"
  }'::jsonb,
  E'# Post-Meeting Follow-Up Pack Builder\n\n## Goal\nCreate a complete follow-up pack that a rep can use immediately:\n- A **buyer-facing email** (context + subject suggestions)\n- An **internal Slack update** (what happened + risks + asks)\n- **3 task previews** (actionable, time-bound)\n\n## Inputs\n- `meeting_data`: output from `execute_action(\"get_meetings\", {...})` (should include `meetings[0].summary` and optionally `meetings[0].transcript_text`)\n- `meeting_digest`: output from `meeting-digest-truth-extractor`\n- (Optional) `contact_data`: output from `execute_action(\"get_contact\", { id })`\n\n## Output Contract\nReturn a SkillResult with:\n- `data.buyer_email`:\n  - `to`: string | null\n  - `subject`: string\n  - `context`: string (structured bullets the email writer can use)\n  - `tone`: \"professional\" | \"friendly\" | \"executive\"\n- `data.slack_update`:\n  - `channel`: \"slack\"\n  - `message`: string (Slack-formatted)\n  - `blocks`: optional Slack Block Kit payload (best-effort)\n- `data.tasks`: array (3 items), each:\n  - `title`: string\n  - `description`: string (include checklist)\n  - `due_date`: string (ISO date or relative like \"tomorrow\" if unsure)\n  - `priority`: \"high\" | \"medium\" | \"low\"\n\n## Guidance\n- Use truth hierarchy from `meeting_digest` for decisions/commitments/risks.\n- If you have a contact email (from `contact_data.contacts[0].email`), set `buyer_email.to`.\n- Keep the buyer email **short** (<= 180 words) with a single clear CTA.\n- Slack update should include: Summary, Risks, Next steps, Ask.\n- Tasks should be: 1 internal follow-up, 1 customer follow-up, 1 deal hygiene/CRM.\n',
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
-- Sequence: Post-Meeting Follow-Up Pack (multi-thread)
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-post-meeting-followup-pack',
  'agent-sequence',
  '{
    "name": "Post-Meeting Follow-Up Pack",
    "description": "From your most recent recorded meeting (or a provided meeting_id): extract truth, build a follow-up pack (email + Slack + tasks), and preview actions (approval-gated).",
    "version": 1,
    "requires_capabilities": ["crm", "email", "messaging"],
    "requires_context": [],
    "outputs": ["meeting_data", "contact_data", "digest", "pack", "email_preview", "slack_preview", "task_preview"],
    "triggers": ["user_request", "meeting_ended", "transcript_ready"],
    "priority": "critical",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_meetings",
        "input_mapping": {
          "meeting_id": "${trigger.params.meeting_id}",
          "limit": 1
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
          "meeting_id": "${outputs.meeting_data.meetings[0].id}",
          "transcript_id": "${outputs.meeting_data.meetings[0].id}",
          "transcript": "${outputs.meeting_data.meetings[0].transcript_text}"
        },
        "output_key": "digest",
        "on_failure": "stop"
      },
      {
        "order": 4,
        "skill_key": "post-meeting-followup-pack-builder",
        "input_mapping": {
          "meeting_data": "${outputs.meeting_data}",
          "contact_data": "${outputs.contact_data}",
          "meeting_digest": "${outputs.digest}"
        },
        "output_key": "pack",
        "on_failure": "stop"
      },
      {
        "order": 5,
        "action": "draft_email",
        "input_mapping": {
          "to": "${outputs.pack.buyer_email.to}",
          "subject": "${outputs.pack.buyer_email.subject}",
          "context": "${outputs.pack.buyer_email.context}",
          "tone": "${outputs.pack.buyer_email.tone}"
        },
        "output_key": "email_preview",
        "on_failure": "continue"
      },
      {
        "order": 6,
        "action": "send_notification",
        "input_mapping": {
          "channel": "slack",
          "message": "${outputs.pack.slack_update.message}",
          "blocks": "${outputs.pack.slack_update.blocks}"
        },
        "output_key": "slack_preview",
        "on_failure": "continue",
        "requires_approval": true
      },
      {
        "order": 7,
        "action": "create_task",
        "input_mapping": {
          "title": "${outputs.pack.tasks[0].title}",
          "description": "${outputs.pack.tasks[0].description}",
          "due_date": "${outputs.pack.tasks[0].due_date}",
          "priority": "${outputs.pack.tasks[0].priority}",
          "contact_id": "${outputs.meeting_data.meetings[0].primary_contact_id}"
        },
        "output_key": "task_preview",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Post-Meeting Follow-Up Pack\n\nThis sequence produces a complete follow-up package for your most recent recorded meeting:\n1. Load the latest meeting (or a provided meeting_id)\n2. Extract decisions/commitments/risks from transcript + CRM context\n3. Build a buyer email + internal Slack update + 3 tasks\n4. Preview email drafting, Slack posting, and task creation (approval-gated)\n',
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

