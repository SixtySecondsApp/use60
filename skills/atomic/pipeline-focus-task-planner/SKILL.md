---
name: Pipeline Focus Task Planner
description: |
  Turn a list of pipeline deals into a single prioritized engagement task with a checklist (top deals + exact next steps).
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: user_request
    - pattern: pipeline_review
  required_context:
    - pipeline_deals
  outputs:
    - task
    - top_deals
    - rationale
  priority: high
  requires_capabilities:
    - crm
---

# Pipeline Focus Task Planner

## Goal
Given a list of pipeline deals, produce a single actionable engagement plan as a task with a clear checklist.

## Required Capabilities
- **CRM**: The deals list should come from CRM (via execute_action get_pipeline_deals).

## Inputs
- `pipeline_deals`: Output from `execute_action("get_pipeline_deals", ...)` (should include deals + health if available)
- `period` (optional): "this_week" | "this_month" | "this_quarter"
- `user_capacity` (optional): "busy" | "normal" | "available"

## Output Contract
Return a SkillResult with:
- `data.task`:
  - `title`: short, action-oriented
  - `description`: includes checklist grouped by deal
  - `due_date`: ISO date string (default: end of current week)
  - `priority`: low|medium|high
- `data.top_deals`: up to 3 deals chosen, with (id, name, value, stage/status, why_now)
- `data.rationale`: why these deals were chosen

## Rules
- Prefer deals that are closing soon, at risk, or stale (if health signals exist)
- If capacity is busy, produce only the single most important outreach
- Make the checklist specific: "Email X about Y", "Ask for Z", "Propose next meeting"
- Never fabricate CRM fields; if unknown, be explicit
