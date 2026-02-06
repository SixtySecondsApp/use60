# deal-slippage-diagnosis

> This reference is auto-populated from `skills/atomic/deal-slippage-diagnosis/SKILL.md`.
> Do not edit directly — edit the source skill and re-sync.


# Deal Slippage Diagnosis

## Goal
Diagnose **at-risk deals** and generate actionable rescue plans.

## Inputs
- `at_risk_deals`: from `execute_action("get_pipeline_deals", { filter: "at_risk", include_health: true, limit: 10 })`
- `deal_details`: from `execute_action("get_deal", { id, include_health: true })` for each deal

## Output Contract
Return a SkillResult with:
- `data.risk_radar`: array of 5-8 at-risk deals
  - `deal_id`: string
  - `deal_name`: string
  - `company`: string | null
  - `value`: number | null
  - `close_date`: string | null
  - `risk_signals`: string[] (e.g., "no_activity_14_days", "close_date_pushed", "missing_stakeholder", "low_health_score")
  - `root_cause`: string (why it's at risk)
  - `severity`: "critical" | "high" | "medium"
- `data.rescue_actions`: array of 5-8 rescue actions (ranked)
  - `title`: string
  - `description`: string (what to do)
  - `deal_id`: string
  - `priority`: "urgent" | "high" | "medium"
  - `estimated_time`: number (minutes)
  - `roi_rationale`: string (why this helps)
- `data.task_previews`: array of 3 task previews (top rescue actions)
  - `title`: string
  - `description`: string (include checklist)
  - `due_date`: string (ISO date, prefer "today" or "tomorrow")
  - `priority`: "high" | "medium" | "low"
  - `deal_id`: string
- `data.slack_update_preview`: object (for manager notification)
  - `channel`: "slack"
  - `message`: string (Slack-formatted summary of risks + actions)
  - `blocks`: optional Slack Block Kit payload

## Guidance
- Risk signals: no activity > 7 days, close date pushed > 14 days, missing key stakeholder, health score < 50.
- Root causes: "stale_engagement", "missing_decision_maker", "budget_uncertainty", "competitor_risk", "procurement_blocker".
- Rescue actions should be **concrete** and **time-bound** (not "follow up" but "schedule exec alignment call by Friday").
- Slack update should include: deal name, risk signals, top 2 rescue actions, ask for help if needed.
