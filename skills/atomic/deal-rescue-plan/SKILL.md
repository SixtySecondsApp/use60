---
name: Deal Rescue Plan
description: |
  Diagnose an at-risk deal and produce a rescue plan with concrete tasks.
  Use when a user asks "rescue this deal", "this deal is at risk what should I do",
  "save this deal", or needs a turnaround strategy for a struggling opportunity.
  Returns diagnosis, ranked rescue actions, and MAP tasks.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "rescue this deal"
      intent: "deal_rescue"
      confidence: 0.90
      examples:
        - "help me rescue this deal"
        - "save this deal"
        - "this deal needs rescuing"
    - pattern: "deal is at risk"
      intent: "deal_risk_response"
      confidence: 0.85
      examples:
        - "this deal is at risk what should I do"
        - "my deal is slipping"
        - "deal in trouble"
    - pattern: "turnaround plan for deal"
      intent: "deal_turnaround"
      confidence: 0.80
      examples:
        - "turn this deal around"
        - "recovery plan for this deal"
        - "what can I do to save this opportunity"
  keywords:
    - "rescue"
    - "save"
    - "at risk"
    - "slipping"
    - "trouble"
    - "turnaround"
    - "recovery"
    - "deal"
  required_context:
    - deal
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to diagnose and create a rescue plan for"
      required: true
    - name: deal_context
      type: object
      description: "Additional deal context such as recent activity, health data, or notes"
      required: false
  outputs:
    - name: diagnosis
      type: object
      description: "Root cause diagnosis with why_at_risk, missing_info, and confidence level"
    - name: rescue_plan
      type: array
      description: "Ranked rescue actions with ROI rationale and time estimates"
    - name: map_tasks
      type: array
      description: "Concrete MAP tasks with title, description, due date, and priority"
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
