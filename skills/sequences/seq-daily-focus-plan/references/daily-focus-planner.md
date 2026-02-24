# daily-focus-planner

> This reference is auto-populated from `skills/atomic/daily-focus-planner/SKILL.md`.
> Do not edit directly — edit the source skill and re-sync.


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
