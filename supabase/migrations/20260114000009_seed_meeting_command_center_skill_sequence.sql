-- Seed: Next Meeting Command Center (capability-driven)
-- Date: 2026-01-14
--
-- Adds a demo-grade sequence for "Prep me for my next meeting" with a concrete prep task preview.

BEGIN;

-- Skill: Meeting Command Center Plan (turn brief into a prep task)
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'meeting-command-center-plan',
  'sales-ai',
  '{
    "name": "Meeting Command Center Plan",
    "description": "Turn next-meeting context + brief into a concrete prep plan and a single prep task with checklist.",
    "version": 1,
    "requires_capabilities": ["calendar", "crm"],
    "requires_context": ["next_meeting", "brief"],
    "outputs": ["prep_task", "key_risks", "talking_points", "questions"],
    "triggers": ["before_meeting", "user_request"],
    "priority": "high"
  }'::jsonb,
  E'# Meeting Command Center Plan\n\n## Goal\nGiven a next meeting object and a brief, create a concrete prep plan and a single task with a checklist.\n\n## Inputs\n- `next_meeting`: from execute_action(get_next_meeting)\n- `brief`: from meeting-prep-brief\n\n## Output Contract\nReturn:\n- `data.prep_task`: { title, description, due_date, priority }\n- `data.key_risks`: array\n- `data.talking_points`: array\n- `data.questions`: array\n\n## Checklist Rules\n- Checklist must be time-bound (what to do now vs 10 mins before)\n- Include links when available (meetingUrl, CRM deal/contact URLs)\n- Keep it short and demo-friendly\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Sequence: Next Meeting Command Center
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-next-meeting-command-center',
  'agent-sequence',
  '{
    "name": "Next Meeting Command Center",
    "description": "Find your next meeting, generate a one-page brief, then prepare a single prep task checklist (approval-gated).",
    "version": 1,
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
        "action": "get_meetings",
        "input_mapping": {
          "meeting_id": "${outputs.next_meeting.meeting.id}"
        },
        "output_key": "meeting_data",
        "on_failure": "continue"
      },
      {
        "order": 3,
        "skill_key": "meeting-prep-brief",
        "input_mapping": {
          "meeting_id": "${outputs.next_meeting.meeting.id}",
          "meeting_data": "${outputs.meeting_data}",
          "contact_data": "${outputs.next_meeting.context.contacts}"
        },
        "output_key": "brief",
        "on_failure": "stop"
      },
      {
        "order": 4,
        "skill_key": "meeting-command-center-plan",
        "input_mapping": {
          "next_meeting": "${outputs.next_meeting}",
          "brief": "${outputs.brief}"
        },
        "output_key": "plan",
        "on_failure": "stop"
      },
      {
        "order": 5,
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
  E'# Next Meeting Command Center\n\n1) Find next meeting\n2) Generate a one-page brief\n3) Produce a prep task checklist (preview first; confirm to create)\n',
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

