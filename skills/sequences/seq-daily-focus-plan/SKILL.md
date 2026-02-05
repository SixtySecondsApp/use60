---
name: Daily Focus Plan
description: |
  Generate today's prioritized action plan: top deals/contacts + next best actions + create top 3 tasks (approval-gated).
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "user_request"
    - pattern: "daily_standup"
  requires_capabilities:
    - crm
    - tasks
  requires_context: []
  outputs:
    - pipeline_deals
    - contacts_needing_attention
    - open_tasks
    - plan
    - task_previews
  priority: critical
  workflow:
    - order: 1
      action: get_pipeline_deals
      input_mapping:
        filter: closing_soon
        period: this_week
        include_health: true
        limit: 10
      output_key: pipeline_deals
      on_failure: continue
    - order: 2
      action: get_contacts_needing_attention
      input_mapping:
        days_since_contact: 7
        filter: at_risk
        limit: 10
      output_key: contacts_needing_attention
      on_failure: continue
    - order: 3
      action: list_tasks
      input_mapping:
        status: pending
        limit: 20
      output_key: open_tasks
      on_failure: continue
    - order: 4
      skill_key: daily-focus-planner
      input_mapping:
        pipeline_deals: "${outputs.pipeline_deals}"
        contacts_needing_attention: "${outputs.contacts_needing_attention}"
        open_tasks: "${outputs.open_tasks}"
      output_key: plan
      on_failure: stop
    - order: 5
      action: create_task
      input_mapping:
        title: "${outputs.plan.task_pack[0].title}"
        description: "${outputs.plan.task_pack[0].description}"
        due_date: "${outputs.plan.task_pack[0].due_date}"
        priority: "${outputs.plan.task_pack[0].priority}"
        deal_id: "${outputs.plan.task_pack[0].deal_id}"
        contact_id: "${outputs.plan.task_pack[0].contact_id}"
      output_key: task_previews
      on_failure: continue
      requires_approval: true
  linked_skills:
    - daily-focus-planner
---

# Daily Focus Plan

This sequence generates today's prioritized action plan:
1. Loads top deals closing soon + contacts needing attention + open tasks
2. Generates priorities + next best actions + top 3 task previews
3. Previews (and on confirm: creates) the #1 task (approval-gated)
