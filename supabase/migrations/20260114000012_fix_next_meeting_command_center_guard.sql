-- Fix: Next Meeting Command Center should fail fast if no upcoming meeting exists
-- Date: 2026-01-14
--
-- Adds a small guard skill and updates the sequence to use it.

BEGIN;

-- Guard Skill: fails (stop) if next_meeting.found is false, otherwise outputs meeting_id.
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'next-meeting-guard',
  'data-access',
  '{
    "name": "Next Meeting Guard",
    "description": "Validate next meeting exists; outputs meeting_id and meeting payload, or fails with a clear message.",
    "version": 1,
    "requires_capabilities": ["calendar"],
    "requires_context": ["next_meeting"],
    "outputs": ["meeting_id", "meeting"],
    "triggers": ["user_request"],
    "priority": "high"
  }'::jsonb,
  E'# Next Meeting Guard\n\nIf `next_meeting.found` is false, return a FAILED SkillResult with error \"No upcoming meetings found\".\n\nIf found, return:\n- `data.meeting_id` = next_meeting.meeting.id\n- `data.meeting` = next_meeting.meeting\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Update the sequence to use the guard output for meeting_id mappings
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-next-meeting-command-center',
  'agent-sequence',
  '{
    "name": "Next Meeting Command Center",
    "description": "Find your next meeting, generate a one-page brief, then prepare a single prep task checklist (approval-gated).",
    "version": 2,
    "requires_capabilities": ["calendar", "crm"],
    "requires_context": [],
    "outputs": ["next_meeting", "brief", "prep_task_preview"],
    "triggers": ["user_request", "before_meeting"],
    "priority": "critical",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_next_meeting",
        "input_mapping": {
          "include_context": true
        },
        "output_key": "next_meeting",
        "on_failure": "stop"
      },
      {
        "order": 2,
        "skill_key": "next-meeting-guard",
        "input_mapping": {
          "next_meeting": "${outputs.next_meeting}"
        },
        "output_key": "guard",
        "on_failure": "stop"
      },
      {
        "order": 3,
        "action": "get_meetings",
        "input_mapping": {
          "meeting_id": "${outputs.guard.meeting_id}"
        },
        "output_key": "meeting_data",
        "on_failure": "continue"
      },
      {
        "order": 4,
        "skill_key": "meeting-prep-brief",
        "input_mapping": {
          "meeting_id": "${outputs.guard.meeting_id}",
          "meeting_data": "${outputs.meeting_data}",
          "contact_data": "${outputs.next_meeting.context.contacts}"
        },
        "output_key": "brief",
        "on_failure": "stop"
      },
      {
        "order": 5,
        "skill_key": "meeting-command-center-plan",
        "input_mapping": {
          "next_meeting": "${outputs.next_meeting}",
          "brief": "${outputs.brief}"
        },
        "output_key": "plan",
        "on_failure": "stop"
      },
      {
        "order": 6,
        "action": "create_task",
        "input_mapping": {
          "title": "${outputs.plan.prep_task.title}",
          "description": "${outputs.plan.prep_task.description}",
          "due_date": "${outputs.plan.prep_task.due_date}",
          "priority": "${outputs.plan.prep_task.priority}"
        },
        "output_key": "prep_task_preview",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Next Meeting Command Center\n\nUpdate: Added a guard step that fails fast when there is no upcoming meeting.\n',
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

