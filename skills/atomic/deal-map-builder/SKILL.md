---
name: Deal MAP Builder (Mutual Action Plan)
description: |
  Generate a Mutual Action Plan (MAP) for a deal with milestones, owners, dates, and tasks.
  Use when a user asks "build a mutual action plan", "create a MAP for this deal",
  "what are the milestones for closing this deal", or needs a structured closing plan.
  Returns milestones, exit criteria, and concrete tasks aligned to close date.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "mutual action plan"
      intent: "build_map"
      confidence: 0.90
      examples:
        - "build a mutual action plan"
        - "create a MAP for this deal"
        - "mutual action plan for"
    - pattern: "closing plan"
      intent: "deal_closing_plan"
      confidence: 0.85
      examples:
        - "what's the plan to close this deal"
        - "create a closing plan"
        - "deal closing milestones"
    - pattern: "deal milestones"
      intent: "deal_milestones"
      confidence: 0.80
      examples:
        - "what milestones do we need"
        - "set up milestones for this deal"
        - "map out the deal steps"
  keywords:
    - "MAP"
    - "mutual action plan"
    - "milestones"
    - "closing plan"
    - "deal plan"
    - "action plan"
    - "exit criteria"
    - "stakeholder"
  requires_capabilities:
    - crm
  requires_context:
    - deal
    - open_tasks
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to build a Mutual Action Plan for"
      required: true
    - name: deal_context
      type: object
      description: "Additional deal context such as stage, close date, stakeholders, or health"
      required: false
  outputs:
    - name: map
      type: object
      description: "Mutual Action Plan with deal info, north star, risks, and assumptions"
    - name: milestones
      type: array
      description: "4-7 milestones with owner, due date, and exit criteria"
    - name: tasks_to_create
      type: array
      description: "5-8 task previews with checklist, due date, priority, and owner category"
    - name: summary
      type: array
      description: "3-6 bullet point highlights of the plan"
  priority: critical
---

# Deal MAP Builder (Mutual Action Plan)

## Goal
Create a **Mutual Action Plan (MAP)** for a deal, aligned to stage + close date.

## Inputs
- `deal`: from `execute_action("get_deal", { id })` (include stage, close date, value, company, health if available)
- `open_tasks`: from `execute_action("list_tasks", { deal_id, status: "pending" })`

## Output Contract
Return a SkillResult with:
- `data.map`: object
  - `deal_id`: string
  - `deal_name`: string
  - `target_close_date`: string | null
  - `north_star`: string (what success looks like)
  - `risks`: string[]
  - `assumptions`: string[]
- `data.milestones`: array of 4-7 milestones
  - `title`: string
  - `owner`: "us" | "customer" | "shared"
  - `due_date`: string (ISO date preferred)
  - `exit_criteria`: string[]
- `data.tasks_to_create`: array of 5-8 task previews
  - `title`: string
  - `description`: string (include checklist)
  - `due_date`: string | null
  - `priority`: "high" | "medium" | "low"
  - `owner`: "us" | "customer" | "shared"
  - `category`: "customer" | "internal" | "mutual"
- `data.summary`: 3-6 bullet points with the plan highlights

## Guidance
- Do not duplicate tasks already present in `open_tasks`.
- Prefer concrete, time-bound steps.
- Always include:
  - stakeholder alignment
  - success criteria / metrics
  - procurement/security steps if late-stage
  - next meeting + decision date
