-- Seed: Deal Slippage Guardrails (everyday workflow #3)
-- Date: 2026-01-14
--
-- Adds:
-- - Skill: deal-slippage-diagnosis
-- - Sequence: seq-deal-slippage-guardrails
--
-- Safe to re-run (UPSERT by unique skill_key)

BEGIN;

-- -----------------------------------------------------------------------------
-- Skill: Deal Slippage Diagnosis
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'deal-slippage-diagnosis',
  'sales-ai',
  '{
    "name": "Deal Slippage Diagnosis",
    "description": "Diagnose at-risk deals: identify slippage signals, root causes, and generate rescue actions + MAP snippets.",
    "version": 1,
    "requires_capabilities": ["crm", "tasks"],
    "requires_context": ["at_risk_deals", "deal_details"],
    "outputs": ["risk_radar", "rescue_actions", "task_previews", "slack_update_preview"],
    "triggers": ["user_request", "deal_at_risk", "pipeline_review"],
    "priority": "critical"
  }'::jsonb,
  E'# Deal Slippage Diagnosis\n\n## Goal\nDiagnose **at-risk deals** and generate actionable rescue plans.\n\n## Inputs\n- `at_risk_deals`: from `execute_action("get_pipeline_deals", { filter: "at_risk", include_health: true, limit: 10 })`\n- `deal_details`: from `execute_action("get_deal", { id, include_health: true })` for each deal\n\n## Output Contract\nReturn a SkillResult with:\n- `data.risk_radar`: array of 5-8 at-risk deals\n  - `deal_id`: string\n  - `deal_name`: string\n  - `company`: string | null\n  - `value`: number | null\n  - `close_date`: string | null\n  - `risk_signals`: string[] (e.g., "no_activity_14_days", "close_date_pushed", "missing_stakeholder", "low_health_score")\n  - `root_cause`: string (why it''s at risk)\n  - `severity`: "critical" | "high" | "medium"\n- `data.rescue_actions`: array of 5-8 rescue actions (ranked)\n  - `title`: string\n  - `description`: string (what to do)\n  - `deal_id`: string\n  - `priority`: "urgent" | "high" | "medium"\n  - `estimated_time`: number (minutes)\n  - `roi_rationale`: string (why this helps)\n- `data.task_previews`: array of 3 task previews (top rescue actions)\n  - `title`: string\n  - `description`: string (include checklist)\n  - `due_date`: string (ISO date, prefer "today" or "tomorrow")\n  - `priority`: "high" | "medium" | "low"\n  - `deal_id`: string\n- `data.slack_update_preview`: object (for manager notification)\n  - `channel`: "slack"\n  - `message`: string (Slack-formatted summary of risks + actions)\n  - `blocks`: optional Slack Block Kit payload\n\n## Guidance\n- Risk signals: no activity > 7 days, close date pushed > 14 days, missing key stakeholder, health score < 50.\n- Root causes: "stale_engagement", "missing_decision_maker", "budget_uncertainty", "competitor_risk", "procurement_blocker".\n- Rescue actions should be **concrete** and **time-bound** (not "follow up" but "schedule exec alignment call by Friday").\n- Slack update should include: deal name, risk signals, top 2 rescue actions, ask for help if needed.\n',
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
-- Sequence: Deal Slippage Guardrails
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-deal-slippage-guardrails',
  'agent-sequence',
  '{
    "name": "Deal Slippage Guardrails",
    "description": "Diagnose at-risk deals, generate rescue actions, and create top rescue task + optional Slack update (approval-gated).",
    "version": 1,
    "requires_capabilities": ["crm", "tasks", "messaging"],
    "requires_context": [],
    "outputs": ["at_risk_deals", "diagnosis", "rescue_actions", "task_preview", "slack_preview"],
    "triggers": ["user_request", "deal_at_risk", "pipeline_review"],
    "priority": "critical",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_pipeline_deals",
        "input_mapping": {
          "filter": "at_risk",
          "include_health": true,
          "limit": 10
        },
        "output_key": "at_risk_deals",
        "on_failure": "continue"
      },
      {
        "order": 2,
        "action": "get_deal",
        "input_mapping": {
          "id": "${outputs.at_risk_deals.deals[0].id}",
          "include_health": true
        },
        "output_key": "deal_details",
        "on_failure": "continue"
      },
      {
        "order": 3,
        "skill_key": "deal-slippage-diagnosis",
        "input_mapping": {
          "at_risk_deals": "${outputs.at_risk_deals}",
          "deal_details": "${outputs.deal_details}"
        },
        "output_key": "diagnosis",
        "on_failure": "stop"
      },
      {
        "order": 4,
        "action": "create_task",
        "input_mapping": {
          "title": "${outputs.diagnosis.task_previews[0].title}",
          "description": "${outputs.diagnosis.task_previews[0].description}",
          "due_date": "${outputs.diagnosis.task_previews[0].due_date}",
          "priority": "${outputs.diagnosis.task_previews[0].priority}",
          "deal_id": "${outputs.diagnosis.task_previews[0].deal_id}"
        },
        "output_key": "task_preview",
        "on_failure": "continue",
        "requires_approval": true
      },
      {
        "order": 5,
        "action": "send_notification",
        "input_mapping": {
          "channel": "slack",
          "message": "${outputs.diagnosis.slack_update_preview.message}",
          "blocks": "${outputs.diagnosis.slack_update_preview.blocks}"
        },
        "output_key": "slack_preview",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Deal Slippage Guardrails\n\nThis sequence helps reps catch and rescue at-risk deals:\n1. Loads at-risk deals + health context\n2. Diagnoses risk signals + root causes\n3. Generates rescue actions + task previews + Slack update\n4. Previews (and on confirm: creates) top rescue task + posts Slack update (approval-gated)\n',
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
