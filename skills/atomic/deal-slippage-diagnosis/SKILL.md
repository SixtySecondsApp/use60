---
name: Deal Slippage Diagnosis
description: |
  Diagnose at-risk deals by identifying slippage signals, root causes, and generating rescue actions.
  Use when a user asks "which deals are slipping", "show me at-risk deals", "deal slippage report",
  or wants to understand why deals are stalling. Returns risk radar, rescue actions, and task previews.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  agent_affinity:
    - pipeline
  triggers:
    - pattern: "which deals are slipping"
      intent: "deal_slippage_check"
      confidence: 0.90
      examples:
        - "show me slipping deals"
        - "which deals are at risk"
        - "deals that are stalling"
    - pattern: "deal slippage report"
      intent: "slippage_diagnosis"
      confidence: 0.85
      examples:
        - "diagnose deal slippage"
        - "why are my deals slipping"
        - "deal risk analysis"
    - pattern: "at risk deals"
      intent: "at_risk_review"
      confidence: 0.80
      examples:
        - "show me at-risk deals"
        - "deals in trouble"
        - "pipeline risks"
  keywords:
    - "slippage"
    - "slipping"
    - "at risk"
    - "stalling"
    - "risk"
    - "diagnosis"
    - "deals"
    - "pipeline"
    - "trouble"
  required_context:
    - at_risk_deals
    - deal_details
  inputs:
    - name: deal_id
      type: string
      description: "Specific deal identifier to diagnose (optional; omit to scan full pipeline)"
      required: false
    - name: deal_context
      type: object
      description: "Additional context such as health scores or activity history"
      required: false
    - name: limit
      type: number
      description: "Maximum number of at-risk deals to analyze"
      required: false
      default: 10
  outputs:
    - name: risk_radar
      type: array
      description: "At-risk deals with risk signals, root cause, and severity rating"
    - name: rescue_actions
      type: array
      description: "Ranked rescue actions with deal ID, priority, time estimate, and ROI rationale"
    - name: task_previews
      type: array
      description: "Top 3 task previews ready to create from rescue actions"
    - name: slack_update_preview
      type: object
      description: "Slack-formatted summary for manager notification with risks and actions"
  requires_capabilities:
    - crm
    - tasks
  priority: critical
  tags:
    - sales-ai
    - deal-health
    - pipeline-management
    - risk-mitigation
---

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
