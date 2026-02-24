-- Seed: Deal Rescue Pack Sequence (CRM-driven)
-- Date: 2026-01-14
--
-- NOTE: Default inactive until tested end-to-end.
-- Safe to re-run (UPSERT by unique skill_key)

BEGIN;

INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-deal-rescue-pack',
  'agent-sequence',
  '{
    "name": "Deal Rescue Pack (At-Risk Deal)",
    "description": "For an at-risk deal: load CRM context, generate next best actions, and create the #1 follow-up task (approval-gated).",
    "version": 1,
    "requires_capabilities": ["crm"],
    "requires_context": ["deal_id"],
    "outputs": ["nba", "task_created"],
    "triggers": ["deal_health_changed", "user_request"],
    "priority": "high",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_deal",
        "input_mapping": {
          "id": "${trigger.params.deal_id}",
          "include_health": true
        },
        "output_key": "deal_data",
        "on_failure": "stop"
      },
      {
        "order": 2,
        "skill_key": "deal-next-best-actions",
        "input_mapping": {
          "deal_id": "${trigger.params.deal_id}"
        },
        "output_key": "nba",
        "on_failure": "stop"
      },
      {
        "order": 3,
        "action": "create_task",
        "input_mapping": {
          "title": "${outputs.nba.minimum_viable_action.title}",
          "description": "${outputs.nba.minimum_viable_action.description}",
          "confirm": true
        },
        "output_key": "task_created",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Deal Rescue Pack (At-Risk Deal)\n\nThis sequence is a 3-step CRM workflow:\n1. Load deal context (including health)\n2. Generate next best actions for the deal\n3. Create the top follow-up task (approval-gated)\n\nDefault inactive until tested.\n',
  false
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;

