---
name: Deal Slippage Guardrails
description: |
  Diagnose at-risk deals, generate rescue actions, and create top rescue task + optional Slack update (approval-gated).
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "user_request"
    - pattern: "deal_at_risk"
    - pattern: "pipeline_review"
  requires_capabilities:
    - crm
    - tasks
    - messaging
  requires_context: []
  outputs:
    - at_risk_deals
    - diagnosis
    - rescue_actions
    - task_preview
    - slack_preview
  priority: critical
  workflow:
    - order: 1
      action: get_pipeline_deals
      input_mapping:
        filter: at_risk
        include_health: true
        limit: 10
      output_key: at_risk_deals
      on_failure: continue
    - order: 2
      action: get_deal
      input_mapping:
        id: "${outputs.at_risk_deals.deals[0].id}"
        include_health: true
      output_key: deal_details
      on_failure: continue
    - order: 3
      skill_key: deal-slippage-diagnosis
      input_mapping:
        at_risk_deals: "${outputs.at_risk_deals}"
        deal_details: "${outputs.deal_details}"
      output_key: diagnosis
      on_failure: stop
    - order: 4
      action: create_task
      input_mapping:
        title: "${outputs.diagnosis.task_previews[0].title}"
        description: "${outputs.diagnosis.task_previews[0].description}"
        due_date: "${outputs.diagnosis.task_previews[0].due_date}"
        priority: "${outputs.diagnosis.task_previews[0].priority}"
        deal_id: "${outputs.diagnosis.task_previews[0].deal_id}"
      output_key: task_preview
      on_failure: continue
      requires_approval: true
    - order: 5
      action: send_notification
      input_mapping:
        channel: slack
        message: "${outputs.diagnosis.slack_update_preview.message}"
        blocks: "${outputs.diagnosis.slack_update_preview.blocks}"
      output_key: slack_preview
      on_failure: continue
      requires_approval: true
  linked_skills:
    - deal-slippage-diagnosis
---

# Deal Slippage Guardrails

This sequence helps reps catch and rescue at-risk deals:
1. Loads at-risk deals + health context
2. Diagnoses risk signals + root causes
3. Generates rescue actions + task previews + Slack update
4. Previews (and on confirm: creates) top rescue task + posts Slack update (approval-gated)
