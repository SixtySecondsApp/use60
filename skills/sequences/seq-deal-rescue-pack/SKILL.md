---
name: Deal Rescue Pack
description: |
  Load deal + health, generate a rescue plan, then preview MAP tasks (confirm to create).
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: user_request
    - pattern: deal_health_changed
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
