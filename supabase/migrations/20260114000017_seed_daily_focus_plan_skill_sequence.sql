-- Seed: Daily Focus Plan (everyday workflow #1)
-- Date: 2026-01-14
--
-- Adds:
-- - Skill: daily-focus-planner
-- - Sequence: seq-daily-focus-plan
--
-- Safe to re-run (UPSERT by unique skill_key)

BEGIN;

-- -----------------------------------------------------------------------------
-- Skill: Daily Focus Planner
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'daily-focus-planner',
  'sales-ai',
  '{
    "name": "Daily Focus Planner",
    "description": "Generate a prioritized daily action plan: top deals/contacts needing attention + next best actions + task pack.",
    "version": 1,
    "requires_capabilities": ["crm", "tasks"],
    "requires_context": ["pipeline_deals", "contacts_needing_attention", "open_tasks"],
    "outputs": ["priorities", "actions", "task_pack"],
    "triggers": ["user_request", "daily_standup"],
    "priority": "critical"
  }'::jsonb,
  E'# Daily Focus Planner\n\n## Goal\nCreate a **prioritized daily action plan** that tells the rep exactly what to do today.\n\n## Inputs\n- `pipeline_deals`: from `execute_action("get_pipeline_deals", { filter: "closing_soon", period: "this_week", include_health: true, limit: 10 })`\n- `contacts_needing_attention`: from `execute_action("get_contacts_needing_attention", { days_since_contact: 7, filter: "at_risk", limit: 10 })`\n- `open_tasks`: from `execute_action("list_tasks", { status: "pending", limit: 20 })`\n\n## Output Contract\nReturn a SkillResult with:\n- `data.priorities`: array of 5-8 priority items\n  - `type`: "deal" | "contact" | "task"\n  - `id`: string\n  - `name`: string\n  - `reason`: string (why it needs attention now)\n  - `urgency`: "critical" | "high" | "medium"\n  - `context`: string (deal stage, days stale, etc.)\n- `data.actions`: array of 5-8 next best actions\n  - `title`: string\n  - `description`: string (what to do)\n  - `priority`: "urgent" | "high" | "medium" | "low"\n  - `entity_type`: "deal" | "contact" | "task"\n  - `entity_id`: string | null\n  - `estimated_time`: number (minutes)\n  - `roi_rationale`: string (why this matters)\n- `data.task_pack`: array of 3 task previews (top actions)\n  - `title`: string\n  - `description`: string (include checklist)\n  - `due_date`: string (ISO date, prefer "today" or "tomorrow")\n  - `priority`: "high" | "medium" | "low"\n  - `deal_id`: string | null\n  - `contact_id`: string | null\n\n## Guidance\n- Prioritize by: close date proximity, deal value, days stale, health risk.\n- Actions should be **concrete** (not "follow up" but "send pricing email to decision maker").\n- Task pack should be the **top 3** actions that move pipeline fastest.\n- Consider user capacity: if they have 10+ open tasks, suggest fewer new tasks.\n',
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
-- Sequence: Daily Focus Plan
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-daily-focus-plan',
  'agent-sequence',
  '{
    "name": "Daily Focus Plan",
    "description": "Generate today''s prioritized action plan: top deals/contacts + next best actions + create top 3 tasks (approval-gated).",
    "version": 1,
    "requires_capabilities": ["crm", "tasks"],
    "requires_context": [],
    "outputs": ["pipeline_deals", "contacts_needing_attention", "open_tasks", "plan", "task_previews"],
    "triggers": ["user_request", "daily_standup"],
    "priority": "critical",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_pipeline_deals",
        "input_mapping": {
          "filter": "closing_soon",
          "period": "this_week",
          "include_health": true,
          "limit": 10
        },
        "output_key": "pipeline_deals",
        "on_failure": "continue"
      },
      {
        "order": 2,
        "action": "get_contacts_needing_attention",
        "input_mapping": {
          "days_since_contact": 7,
          "filter": "at_risk",
          "limit": 10
        },
        "output_key": "contacts_needing_attention",
        "on_failure": "continue"
      },
      {
        "order": 3,
        "action": "list_tasks",
        "input_mapping": {
          "status": "pending",
          "limit": 20
        },
        "output_key": "open_tasks",
        "on_failure": "continue"
      },
      {
        "order": 4,
        "skill_key": "daily-focus-planner",
        "input_mapping": {
          "pipeline_deals": "${outputs.pipeline_deals}",
          "contacts_needing_attention": "${outputs.contacts_needing_attention}",
          "open_tasks": "${outputs.open_tasks}"
        },
        "output_key": "plan",
        "on_failure": "stop"
      },
      {
        "order": 5,
        "action": "create_task",
        "input_mapping": {
          "title": "${outputs.plan.task_pack[0].title}",
          "description": "${outputs.plan.task_pack[0].description}",
          "due_date": "${outputs.plan.task_pack[0].due_date}",
          "priority": "${outputs.plan.task_pack[0].priority}",
          "deal_id": "${outputs.plan.task_pack[0].deal_id}",
          "contact_id": "${outputs.plan.task_pack[0].contact_id}"
        },
        "output_key": "task_previews",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Daily Focus Plan\n\nThis sequence generates today''s prioritized action plan:\n1. Loads top deals closing soon + contacts needing attention + open tasks\n2. Generates priorities + next best actions + top 3 task previews\n3. Previews (and on confirm: creates) the #1 task (approval-gated)\n',
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
