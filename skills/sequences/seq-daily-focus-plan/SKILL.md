---
name: Daily Focus Plan
description: |
  Full daily planning sequence: loads pipeline deals, contacts needing attention, and open tasks,
  then generates prioritized actions and creates top tasks. Use when a user asks "plan my day",
  "what should I focus on today", "daily action plan", or "set up my priorities for today".
  Creates approval-gated tasks for the top actions.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "plan my day"
      intent: "daily_planning"
      confidence: 0.95
      examples:
        - "help me plan my day"
        - "set up my day"
        - "daily plan"
    - pattern: "what should I focus on today"
      intent: "daily_focus"
      confidence: 0.95
      examples:
        - "what should I focus on"
        - "today's priorities"
        - "what needs my attention today"
    - pattern: "daily action plan"
      intent: "action_planning"
      confidence: 0.90
      examples:
        - "create my action plan"
        - "today's action items"
        - "set my priorities"
    - pattern: "daily standup"
      intent: "standup_prep"
      confidence: 0.85
      examples:
        - "prep for standup"
        - "standup update"
        - "what do I report in standup"
  keywords:
    - "plan"
    - "focus"
    - "today"
    - "priorities"
    - "action plan"
    - "standup"
    - "daily"
    - "attention"
    - "tasks"
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

## Available Context
@_platform-references/org-variables.md

# Daily Focus Plan

This sequence generates today's prioritized action plan:
1. Loads top deals closing soon + contacts needing attention + open tasks
2. Generates priorities + next best actions + top 3 task previews
3. Previews (and on confirm: creates) the #1 task (approval-gated)
