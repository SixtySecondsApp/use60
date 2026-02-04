---
name: Deal MAP Builder (Mutual Action Plan)
description: |
  Generate a mutual action plan (MAP) for a deal: milestones, owners, dates, and a prioritized set of tasks.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "user_request"
    - pattern: "deal_at_risk"
    - pattern: "deal_stage_changed"
  requires_capabilities:
    - crm
  requires_context:
    - deal
    - open_tasks
  outputs:
    - map
    - milestones
    - tasks_to_create
    - summary
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
