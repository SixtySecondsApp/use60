-- Seed: Pipeline Focus Task Planner (capability-driven)
-- Date: 2026-01-14
--
-- Safe to re-run (UPSERT by unique skill_key)

BEGIN;

INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'pipeline-focus-task-planner',
  'sales-ai',
  '{
    "name": "Pipeline Focus Task Planner",
    "description": "Turn a list of pipeline deals into a single prioritized engagement task with a checklist (top deals + exact next steps).",
    "version": 1,
    "requires_capabilities": ["crm"],
    "requires_context": ["pipeline_deals"],
    "outputs": ["task", "top_deals", "rationale"],
    "triggers": ["user_request", "pipeline_review"],
    "priority": "high"
  }'::jsonb,
  E'# Pipeline Focus Task Planner\n\n## Goal\nGiven a list of pipeline deals, produce a single actionable engagement plan as a task with a clear checklist.\n\n## Required Capabilities\n- **CRM**: The deals list should come from CRM (via execute_action get_pipeline_deals).\n\n## Inputs\n- `pipeline_deals`: Output from `execute_action(\"get_pipeline_deals\", ...)` (should include deals + health if available)\n- `period` (optional): \"this_week\" | \"this_month\" | \"this_quarter\"\n- `user_capacity` (optional): \"busy\" | \"normal\" | \"available\"\n\n## Output Contract\nReturn a SkillResult with:\n- `data.task`:\n  - `title`: short, action-oriented\n  - `description`: includes checklist grouped by deal\n  - `due_date`: ISO date string (default: end of current week)\n  - `priority`: low|medium|high\n- `data.top_deals`: up to 3 deals chosen, with (id, name, value, stage/status, why_now)\n- `data.rationale`: why these deals were chosen\n\n## Rules\n- Prefer deals that are closing soon, at risk, or stale (if health signals exist)\n- If capacity is busy, produce only the single most important outreach\n- Make the checklist specific: \"Email X about Y\", \"Ask for Z\", \"Propose next meeting\"\n- Never fabricate CRM fields; if unknown, be explicit\n',
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

