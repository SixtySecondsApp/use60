-- Seed: Pipeline Focus Tasks (CRM-driven)
-- Date: 2026-01-14
--
-- Safe to re-run (UPSERT by unique skill_key)

BEGIN;

INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-pipeline-focus-tasks',
  'agent-sequence',
  '{
    "name": "Pipeline Focus Tasks",
    "description": "From a natural-language request: select the deals you should focus on, generate an engagement checklist, and prepare a task (approval-gated).",
    "version": 1,
    "requires_capabilities": ["crm"],
    "requires_context": [],
    "outputs": ["task_preview", "top_deals"],
    "triggers": ["user_request", "pipeline_review"],
    "priority": "high",
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
        "on_failure": "stop"
      },
      {
        "order": 2,
        "skill_key": "pipeline-focus-task-planner",
        "input_mapping": {
          "pipeline_deals": "${outputs.pipeline_deals}",
          "period": "${trigger.params.period}",
          "user_capacity": "${trigger.params.user_capacity}"
        },
        "output_key": "plan",
        "on_failure": "stop"
      },
      {
        "order": 3,
        "action": "create_task",
        "input_mapping": {
          "title": "${outputs.plan.task.title}",
          "description": "${outputs.plan.task.description}",
          "due_date": "${outputs.plan.task.due_date}",
          "priority": "${outputs.plan.task.priority}"
        },
        "output_key": "task_preview",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Pipeline Focus Tasks\n\nThis sequence is designed to be triggered from natural language in Copilot.\n\n1) Pull priority pipeline deals (closing soon / at risk)\n2) Generate an engagement checklist as a single task\n3) Create the task (approval-gated; in simulation returns a preview)\n',
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

