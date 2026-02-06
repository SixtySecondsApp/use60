-- Update: Pipeline Focus Tasks sequence to link created task to top deal
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
    "version": 2,
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
          "priority": "${outputs.plan.task.priority}",
          "deal_id": "${outputs.pipeline_deals.deals[0].id}"
        },
        "output_key": "task_preview",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Pipeline Focus Tasks\n\nUpdate: Task creation is now linked to the top deal (deal_id) so tasks are properly contextualized.\n',
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

