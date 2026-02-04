---
name: Deal Rescue Plan
description: |
  Given deal context, produce a diagnosis + ranked rescue plan + Mutual Action Plan tasks.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: user_request
    - pattern: deal_health_changed
  required_context:
    - deal
  outputs:
    - diagnosis
    - rescue_plan
    - map_tasks
  priority: critical
  requires_capabilities:
    - crm
---

# Deal Rescue Plan

## Goal
Turn an at-risk deal into an executable rescue plan.

## Inputs
- `deal`: from execute_action(get_deal, include_health=true)
- `recent_activity` (optional)

## Output Contract
Return:
- `data.diagnosis`: { why_at_risk, missing_info, confidence }
- `data.rescue_plan`: ranked array of actions with roi rationale
- `data.map_tasks`: array of tasks { title, description, due_date, priority }

## Rules
- Be specific and stage-aware.
- If key info is missing, include discovery steps.
- Keep MAP tasks short and demo-friendly.
