---
name: Daily Focus Planner
description: |
  Generate a prioritized daily action plan with top deals, contacts needing attention,
  next best actions, and a task pack. Use when a user asks "what should I focus on today",
  "plan my day", "prioritize my tasks", or wants to know what needs their attention most.
  Returns ranked priorities, concrete actions, and ready-to-create tasks.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "what should I focus on today"
      intent: "daily_focus"
      confidence: 0.90
      examples:
        - "what should I focus on"
        - "what are my priorities today"
        - "plan my day"
        - "daily focus"
    - pattern: "prioritize my tasks"
      intent: "task_prioritization"
      confidence: 0.85
      examples:
        - "help me prioritize"
        - "what needs my attention"
        - "what's most important today"
    - pattern: "create a plan for today"
      intent: "daily_planning"
      confidence: 0.80
      examples:
        - "make a plan"
        - "daily plan"
        - "organize my day"
  keywords:
    - "focus"
    - "priorities"
    - "plan"
    - "today"
    - "attention"
    - "important"
    - "organize"
    - "tasks"
    - "action plan"
  requires_capabilities:
    - crm
    - tasks
  requires_context:
    - pipeline_deals
    - contacts_needing_attention
    - open_tasks
  inputs:
    - name: date
      type: string
      description: "The date to generate the focus plan for in ISO format"
      required: false
      default: "today"
      example: "2025-01-15"
    - name: time_of_day
      type: string
      description: "Current time context for prioritization weighting"
      required: false
      example: "morning"
    - name: user_capacity
      type: string
      description: "User's current workload level affecting task volume"
      required: false
      default: "normal"
      example: "busy"
  outputs:
    - name: priorities
      type: array
      description: "5-8 priority items ranked by urgency with type, reason, and context"
    - name: actions
      type: array
      description: "5-8 concrete next best actions with priority, time estimate, and ROI rationale"
    - name: task_pack
      type: array
      description: "Top 3 task previews ready to create, targeting fastest pipeline movement"
  priority: critical
---

# Daily Focus Planner

## Goal
Create a **prioritized daily action plan** that tells the rep exactly what to do today.

## Inputs
- `pipeline_deals`: from `execute_action("get_pipeline_deals", { filter: "closing_soon", period: "this_week", include_health: true, limit: 10 })`
- `contacts_needing_attention`: from `execute_action("get_contacts_needing_attention", { days_since_contact: 7, filter: "at_risk", limit: 10 })`
- `open_tasks`: from `execute_action("list_tasks", { status: "pending", limit: 20 })`

## Output Contract
Return a SkillResult with:
- `data.priorities`: array of 5-8 priority items
  - `type`: "deal" | "contact" | "task"
  - `id`: string
  - `name`: string
  - `reason`: string (why it needs attention now)
  - `urgency`: "critical" | "high" | "medium"
  - `context`: string (deal stage, days stale, etc.)
- `data.actions`: array of 5-8 next best actions
  - `title`: string
  - `description`: string (what to do)
  - `priority`: "urgent" | "high" | "medium" | "low"
  - `entity_type`: "deal" | "contact" | "task"
  - `entity_id`: string | null
  - `estimated_time`: number (minutes)
  - `roi_rationale`: string (why this matters)
- `data.task_pack`: array of 3 task previews (top actions)
  - `title`: string
  - `description`: string (include checklist)
  - `due_date`: string (ISO date, prefer "today" or "tomorrow")
  - `priority`: "high" | "medium" | "low"
  - `deal_id`: string | null
  - `contact_id`: string | null

## Guidance
- Prioritize by: close date proximity, deal value, days stale, health risk.
- Actions should be **concrete** (not "follow up" but "send pricing email to decision maker").
- Task pack should be the **top 3** actions that move pipeline fastest.
- Consider user capacity: if they have 10+ open tasks, suggest fewer new tasks.
