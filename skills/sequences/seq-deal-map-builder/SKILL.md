---
name: Deal MAP Builder
description: |
  Build a Mutual Action Plan (MAP) for a deal: load deal + open tasks, generate milestones + tasks, then preview/create the top tasks (approval-gated).
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "user_request"
    - pattern: "deal_at_risk"
  requires_capabilities:
    - crm
  requires_context:
    - deal_id
  outputs:
    - deal
    - open_tasks
    - plan
    - task_previews
  priority: critical
  workflow:
    - order: 1
      action: get_deal
      input_mapping:
        id: "${trigger.params.deal_id}"
        include_health: true
      output_key: deal
      on_failure: stop
    - order: 2
      action: list_tasks
      input_mapping:
        deal_id: "${trigger.params.deal_id}"
        status: pending
        limit: 30
      output_key: open_tasks
      on_failure: continue
    - order: 3
      skill_key: deal-map-builder
      input_mapping:
        deal: "${outputs.deal}"
        open_tasks: "${outputs.open_tasks}"
      output_key: plan
      on_failure: stop
    - order: 4
      action: create_task
      input_mapping:
        title: "${outputs.plan.tasks_to_create[0].title}"
        description: "${outputs.plan.tasks_to_create[0].description}"
        due_date: "${outputs.plan.tasks_to_create[0].due_date}"
        priority: "${outputs.plan.tasks_to_create[0].priority}"
        deal_id: "${trigger.params.deal_id}"
      output_key: task_previews
      on_failure: continue
      requires_approval: true
  linked_skills:
    - deal-map-builder
---

# Deal MAP Builder

This sequence generates a Mutual Action Plan for a deal:
1. Loads the deal + health context
2. Loads existing open tasks to avoid duplicates
3. Generates milestones + task previews
4. Previews (and on confirm: creates) the #1 MAP task (approval-gated)
