---
name: Pipeline Focus Tasks
description: |
  Pipeline engagement sequence: pulls priority deals, generates an engagement checklist,
  and creates a task. Use when a user asks "which deals should I work on this week",
  "pipeline focus tasks", "review my pipeline", "what deals need attention",
  or wants a clear engagement plan for their top opportunities.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "which deals should I work on"
      intent: "pipeline_focus"
      confidence: 0.95
      examples:
        - "which deals need attention"
        - "what deals need attention"
        - "what deals should I focus on"
        - "which deals should I focus on"
        - "top deals to work on"
    - pattern: "pipeline focus tasks"
      intent: "pipeline_tasks"
      confidence: 0.95
      examples:
        - "pipeline tasks"
        - "pipeline focus"
        - "deal focus tasks"
    - pattern: "review my pipeline"
      intent: "pipeline_review"
      confidence: 0.90
      examples:
        - "pipeline review"
        - "check my pipeline"
        - "pipeline health"
    - pattern: "deals needing attention this week"
      intent: "weekly_deal_focus"
      confidence: 0.85
      examples:
        - "what deals need me this week"
        - "priority deals this week"
        - "weekly deal priorities"
  keywords:
    - "pipeline"
    - "deals"
    - "focus"
    - "attention"
    - "work on"
    - "review"
    - "tasks"
    - "priorities"
    - "this week"
  required_context: []
  outputs:
    - task_preview
    - top_deals
  priority: high
  requires_capabilities:
    - crm
  workflow:
    - order: 1
      action: get_pipeline_deals
      input_mapping:
        filter: closing_soon
        period: this_week
        include_health: true
        limit: 10
      output_key: pipeline_deals
      on_failure: stop
    - order: 2
      skill_key: pipeline-focus-task-planner
      input_mapping:
        pipeline_deals: "${outputs.pipeline_deals}"
        period: "${trigger.params.period}"
        user_capacity: "${trigger.params.user_capacity}"
      output_key: plan
      on_failure: stop
    - order: 3
      action: create_task
      input_mapping:
        title: "${outputs.plan.task.title}"
        description: "${outputs.plan.task.description}"
        due_date: "${outputs.plan.task.due_date}"
        priority: "${outputs.plan.task.priority}"
      output_key: task_preview
      on_failure: continue
      requires_approval: true
  linked_skills:
    - pipeline-focus-task-planner
---

# Pipeline Focus Tasks

This sequence is designed to be triggered from natural language in Copilot.

1) Pull priority pipeline deals (closing soon / at risk)
2) Generate an engagement checklist as a single task
3) Create the task (approval-gated; in simulation returns a preview)
