-- Seed: Deal Rescue Pack (capability-driven)
-- Date: 2026-01-14
--
-- Demo-grade workflow for "This deal is at risk — fix it" using CRM + optional transcript.

BEGIN;

-- Skill: Deal Rescue Plan
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'deal-rescue-plan',
  'sales-ai',
  '{
    "name": "Deal Rescue Plan",
    "description": "Given deal context, produce a diagnosis + ranked rescue plan + Mutual Action Plan tasks.",
    "version": 1,
    "requires_capabilities": ["crm"],
    "requires_context": ["deal"],
    "outputs": ["diagnosis", "rescue_plan", "map_tasks"],
    "triggers": ["user_request", "deal_health_changed"],
    "priority": "critical"
  }'::jsonb,
  E'# Deal Rescue Plan\n\n## Goal\nTurn an at-risk deal into an executable rescue plan.\n\n## Inputs\n- `deal`: from execute_action(get_deal, include_health=true)\n- `recent_activity` (optional)\n\n## Output Contract\nReturn:\n- `data.diagnosis`: { why_at_risk, missing_info, confidence }\n- `data.rescue_plan`: ranked array of actions with roi rationale\n- `data.map_tasks`: array of tasks { title, description, due_date, priority }\n\n## Rules\n- Be specific and stage-aware.\n- If key info is missing, include discovery steps.\n- Keep MAP tasks short and demo-friendly.\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Sequence: Deal Rescue Pack
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-deal-rescue-pack',
  'agent-sequence',
  '{
    "name": "Deal Rescue Pack",
    "description": "Load deal + health, generate a rescue plan, then preview MAP tasks (confirm to create).",
    "version": 1,
    "requires_capabilities": ["crm"],
    "requires_context": ["deal_id"],
    "outputs": ["deal", "plan", "task_previews"],
    "triggers": ["user_request", "deal_health_changed"],
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
        "skill_key": "deal-rescue-plan",
        "input_mapping": {
          "deal": "${outputs.deal}"
        },
        "output_key": "plan",
        "on_failure": "stop"
      },
      {
        "order": 3,
        "action": "create_task",
        "input_mapping": {
          "title": "${outputs.plan.map_tasks[0].title}",
          "description": "${outputs.plan.map_tasks[0].description}",
          "due_date": "${outputs.plan.map_tasks[0].due_date}",
          "priority": "${outputs.plan.map_tasks[0].priority}",
          "deal_id": "${trigger.params.deal_id}"
        },
        "output_key": "task_previews",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Deal Rescue Pack\n\n1) Load deal context\n2) Generate rescue plan + MAP tasks\n3) Preview task creation (confirm to create)\n',
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

