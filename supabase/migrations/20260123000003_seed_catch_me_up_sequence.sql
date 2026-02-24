-- Seed: Catch Me Up Sequence (daily adaptive briefing)
-- Date: 2026-01-23
-- Story: US-004
--
-- Adds:
-- - Skill: daily-brief-planner
-- - Sequence: seq-catch-me-up
--
-- Adaptive briefing based on time of day:
-- - Morning (before 12pm): Today's schedule and priorities
-- - Afternoon (12pm-5pm): Today's progress and remaining items
-- - Evening (after 5pm): Wrap-up summary + tomorrow preview
--
-- Safe to re-run (UPSERT by unique skill_key)

BEGIN;

-- -----------------------------------------------------------------------------
-- Skill: Daily Brief Planner
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'daily-brief-planner',
  'sales-ai',
  '{
    "name": "Daily Brief Planner",
    "description": "Generate a time-aware daily briefing: morning focus, afternoon progress, evening wrap-up.",
    "version": 1,
    "requires_capabilities": ["calendar", "crm", "tasks"],
    "requires_context": ["meetings", "deals", "contacts", "tasks", "time_of_day"],
    "outputs": ["daily_brief"],
    "triggers": ["user_request"],
    "priority": "high"
  }'::jsonb,
  E'# Daily Brief Planner\n\n## Goal\nGenerate a **time-aware daily briefing** that adapts to the time of day.\n\n## Time-Aware Modes\n- **Morning (before 12pm)**: Focus on today''s schedule, key meetings, and top priorities\n- **Afternoon (12pm-5pm)**: Include today''s progress, completed items, and remaining priorities\n- **Evening (after 5pm)**: Wrap-up summary of the day + preview of tomorrow\n\n## Inputs\n- `meetings`: from `execute_action("get_meetings_for_period", { period: "today" })` and optionally tomorrow\n- `deals`: from `execute_action("get_pipeline_deals", { filter: "stale" })` or `{ filter: "closing_soon" }`\n- `contacts`: from `execute_action("get_contacts_needing_attention", { days_since_contact: 7 })`\n- `tasks`: from `execute_action("list_tasks", { filter: "today" })`\n- `time_of_day`: "morning" | "afternoon" | "evening" (from sequence context)\n\n## Output Contract\nReturn a SkillResult with `data.daily_brief`:\n- `greeting`: string (time-appropriate, e.g., "Good morning!" / "Here''s your afternoon update" / "Wrapping up the day")\n- `time_of_day`: "morning" | "afternoon" | "evening"\n- `schedule`: array of today''s meetings with times, attendees, linked deals\n- `priority_deals`: array of 3-5 deals needing attention (stale or closing soon)\n- `contacts_needing_attention`: array of contacts to follow up with\n- `tasks`: array of pending tasks for today\n- `tomorrow_preview`: (evening only) array of tomorrow''s key meetings/priorities\n- `summary`: string (1-2 sentence summary of the day)\n\n## Guidance\n- Keep the briefing scannable (~30 seconds to read)\n- Highlight the most important 3-5 items per section\n- For evening, include what got done today + what''s coming tomorrow\n- Make items clickable where possible (meeting IDs, deal IDs, contact IDs)\n',
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
-- Sequence: Catch Me Up (Daily Brief)
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-catch-me-up',
  'agent-sequence',
  '{
    "name": "Catch Me Up",
    "description": "Generate an adaptive daily briefing based on time of day: morning focus, afternoon progress, evening wrap-up.",
    "version": 1,
    "requires_capabilities": ["calendar", "crm", "tasks"],
    "requires_context": [],
    "outputs": ["daily_brief"],
    "triggers": ["user_request"],
    "priority": "high",
    "structured_response_type": "daily_brief",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_meetings_for_period",
        "input_mapping": {
          "period": "today"
        },
        "output_key": "meetings_today",
        "on_failure": "continue"
      },
      {
        "order": 2,
        "action": "get_meetings_for_period",
        "input_mapping": {
          "period": "tomorrow"
        },
        "output_key": "meetings_tomorrow",
        "on_failure": "continue"
      },
      {
        "order": 3,
        "action": "get_pipeline_deals",
        "input_mapping": {
          "filter": "stale",
          "limit": 5
        },
        "output_key": "stale_deals",
        "on_failure": "continue"
      },
      {
        "order": 4,
        "action": "get_pipeline_deals",
        "input_mapping": {
          "filter": "closing_soon",
          "limit": 5
        },
        "output_key": "closing_soon_deals",
        "on_failure": "continue"
      },
      {
        "order": 5,
        "action": "get_contacts_needing_attention",
        "input_mapping": {
          "days_since_contact": 7,
          "limit": 10
        },
        "output_key": "contacts_needing_attention",
        "on_failure": "continue"
      },
      {
        "order": 6,
        "action": "list_tasks",
        "input_mapping": {
          "filter": "pending",
          "limit": 10
        },
        "output_key": "pending_tasks",
        "on_failure": "continue"
      },
      {
        "order": 7,
        "skill_key": "daily-brief-planner",
        "input_mapping": {
          "meetings_today": "${outputs.meetings_today}",
          "meetings_tomorrow": "${outputs.meetings_tomorrow}",
          "stale_deals": "${outputs.stale_deals}",
          "closing_soon_deals": "${outputs.closing_soon_deals}",
          "contacts_needing_attention": "${outputs.contacts_needing_attention}",
          "pending_tasks": "${outputs.pending_tasks}",
          "time_of_day": "${context.time_of_day}"
        },
        "output_key": "daily_brief",
        "on_failure": "stop"
      }
    ]
  }'::jsonb,
  E'# Catch Me Up\n\nThis sequence generates an adaptive daily briefing:\n1. Fetches today''s meetings\n2. Fetches tomorrow''s meetings (for evening preview)\n3. Gets stale deals needing attention\n4. Gets deals closing soon\n5. Gets contacts needing follow-up\n6. Gets pending tasks\n7. Runs daily-brief-planner skill to generate time-aware summary\n\nAdapts based on time of day:\n- **Morning**: Today''s schedule and priorities\n- **Afternoon**: Today''s progress and remaining items\n- **Evening**: Wrap-up + tomorrow preview\n',
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
