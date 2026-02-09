---
name: Deal Rescue Pack
description: |
  Complete deal rescue workflow: loads deal health, diagnoses why it's at risk,
  generates a rescue plan, and creates recovery tasks. Use when a user says "rescue this deal",
  "this deal is dying", "save the Acme deal", "help me turn this deal around",
  or needs an urgent intervention plan for a struggling opportunity.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "rescue this deal"
      intent: "deal_rescue"
      confidence: 0.95
      examples:
        - "help me rescue this deal"
        - "save this deal"
        - "deal rescue plan"
    - pattern: "this deal is dying"
      intent: "deal_emergency"
      confidence: 0.90
      examples:
        - "this deal is in trouble"
        - "the deal is falling apart"
        - "deal going south"
    - pattern: "turn this deal around"
      intent: "deal_turnaround"
      confidence: 0.90
      examples:
        - "help me turn this around"
        - "recovery plan for this deal"
        - "what can we do to save this"
  keywords:
    - "rescue"
    - "save"
    - "dying"
    - "trouble"
    - "at risk"
    - "turn around"
    - "recovery"
    - "deal"
    - "help"
  required_context:
    - deal_id
  outputs:
    - deal
    - plan
    - task_previews
  priority: critical
  requires_capabilities:
    - crm
  workflow:
    - order: 1
      action: get_deal
      input_mapping:
        id: "${trigger.params.deal_id}"
        include_health: true
      output_key: deal
      on_failure: stop
    - order: 2
      skill_key: deal-rescue-plan
      input_mapping:
        deal: "${outputs.deal}"
      output_key: plan
      on_failure: stop
    - order: 3
      action: create_task
      input_mapping:
        title: "${outputs.plan.map_tasks[0].title}"
        description: "${outputs.plan.map_tasks[0].description}"
        due_date: "${outputs.plan.map_tasks[0].due_date}"
        priority: "${outputs.plan.map_tasks[0].priority}"
        deal_id: "${trigger.params.deal_id}"
      output_key: task_previews
      on_failure: continue
      requires_approval: true
  linked_skills:
    - deal-rescue-plan
---

# Deal Rescue Pack

1) Load deal context
2) Generate rescue plan + MAP tasks
3) Preview task creation (confirm to create)
