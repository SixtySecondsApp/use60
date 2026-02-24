-- Seed: Deal MAP Builder (Mutual Action Plan) - demo-grade workflow
-- Date: 2026-01-14
--
-- Adds:
-- - Skill: deal-map-builder
-- - Sequence: seq-deal-map-builder
--
-- Safe to re-run (UPSERT by unique skill_key)

BEGIN;

-- -----------------------------------------------------------------------------
-- Skill: Deal MAP Builder
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'deal-map-builder',
  'sales-ai',
  '{
    "name": "Deal MAP Builder (Mutual Action Plan)",
    "description": "Generate a mutual action plan (MAP) for a deal: milestones, owners, dates, and a prioritized set of tasks.",
    "version": 1,
    "requires_capabilities": ["crm"],
    "requires_context": ["deal", "open_tasks"],
    "outputs": ["map", "milestones", "tasks_to_create", "summary"],
    "triggers": ["user_request", "deal_at_risk", "deal_stage_changed"],
    "priority": "critical"
  }'::jsonb,
  E'# Deal MAP Builder (Mutual Action Plan)\n\n## Goal\nCreate a **Mutual Action Plan (MAP)** for a deal, aligned to stage + close date.\n\n## Inputs\n- `deal`: from `execute_action(\"get_deal\", { id })` (include stage, close date, value, company, health if available)\n- `open_tasks`: from `execute_action(\"list_tasks\", { deal_id, status: \"pending\" })`\n\n## Output Contract\nReturn a SkillResult with:\n- `data.map`: object\n  - `deal_id`: string\n  - `deal_name`: string\n  - `target_close_date`: string | null\n  - `north_star`: string (what success looks like)\n  - `risks`: string[]\n  - `assumptions`: string[]\n- `data.milestones`: array of 4-7 milestones\n  - `title`: string\n  - `owner`: \"us\" | \"customer\" | \"shared\"\n  - `due_date`: string (ISO date preferred)\n  - `exit_criteria`: string[]\n- `data.tasks_to_create`: array of 5-8 task previews\n  - `title`: string\n  - `description`: string (include checklist)\n  - `due_date`: string | null\n  - `priority`: \"high\" | \"medium\" | \"low\"\n  - `owner`: \"us\" | \"customer\" | \"shared\"\n  - `category`: \"customer\" | \"internal\" | \"mutual\"\n- `data.summary`: 3-6 bullet points with the plan highlights\n\n## Guidance\n- Do not duplicate tasks already present in `open_tasks`.\n- Prefer concrete, time-bound steps.\n- Always include:\n  - stakeholder alignment\n  - success criteria / metrics\n  - procurement/security steps if late-stage\n  - next meeting + decision date\n',
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
-- Sequence: Deal MAP Builder
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-deal-map-builder',
  'agent-sequence',
  '{
    "name": "Deal MAP Builder",
    "description": "Build a Mutual Action Plan (MAP) for a deal: load deal + open tasks, generate milestones + tasks, then preview/create the top tasks (approval-gated).",
    "version": 1,
    "requires_capabilities": ["crm"],
    "requires_context": ["deal_id"],
    "outputs": ["deal", "open_tasks", "plan", "task_previews"],
    "triggers": ["user_request", "deal_at_risk"],
    "priority": "critical",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_deal",
        "input_mapping": {
          "id": "${trigger.params.deal_id}",
          "include_health": true
        },
        "output_key": "deal",
        "on_failure": "stop"
      },
      {
        "order": 2,
        "action": "list_tasks",
        "input_mapping": {
          "deal_id": "${trigger.params.deal_id}",
          "status": "pending",
          "limit": 30
        },
        "output_key": "open_tasks",
        "on_failure": "continue"
      },
      {
        "order": 3,
        "skill_key": "deal-map-builder",
        "input_mapping": {
          "deal": "${outputs.deal}",
          "open_tasks": "${outputs.open_tasks}"
        },
        "output_key": "plan",
        "on_failure": "stop"
      },
      {
        "order": 4,
        "action": "create_task",
        "input_mapping": {
          "title": "${outputs.plan.tasks_to_create[0].title}",
          "description": "${outputs.plan.tasks_to_create[0].description}",
          "due_date": "${outputs.plan.tasks_to_create[0].due_date}",
          "priority": "${outputs.plan.tasks_to_create[0].priority}",
          "deal_id": "${trigger.params.deal_id}"
        },
        "output_key": "task_previews",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Deal MAP Builder\n\nThis sequence generates a Mutual Action Plan for a deal:\n1. Loads the deal + health context\n2. Loads existing open tasks to avoid duplicates\n3. Generates milestones + task previews\n4. Previews (and on confirm: creates) the #1 MAP task (approval-gated)\n',
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

