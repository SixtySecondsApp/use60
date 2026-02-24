---
name: Deal MAP Builder
description: |
  End-to-end Mutual Action Plan (MAP) builder: loads deal context and existing tasks,
  generates milestones and new tasks, then creates top tasks with approval. Use when a user
  asks "build a MAP for this deal", "create a mutual action plan", "closing plan for the deal",
  or needs a structured approach to get a deal across the finish line.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "build a MAP for this deal"
      intent: "build_map"
      confidence: 0.95
      examples:
        - "create a MAP for this deal"
        - "mutual action plan for the deal"
        - "build a mutual action plan"
    - pattern: "create a closing plan"
      intent: "closing_plan"
      confidence: 0.90
      examples:
        - "closing plan for this deal"
        - "plan to close this deal"
        - "deal closing strategy"
    - pattern: "map out the deal"
      intent: "deal_mapping"
      confidence: 0.85
      examples:
        - "map the steps to close"
        - "milestones for this deal"
        - "what's the path to close"
  keywords:
    - "MAP"
    - "mutual action plan"
    - "closing plan"
    - "milestones"
    - "deal"
    - "close"
    - "action plan"
    - "strategy"
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

## Available Context
@_platform-references/org-variables.md

# Deal MAP Builder

This sequence generates a Mutual Action Plan for a deal:
1. Loads the deal + health context
2. Loads existing open tasks to avoid duplicates
3. Generates milestones + task previews
4. Previews (and on confirm: creates) the #1 MAP task (approval-gated)
