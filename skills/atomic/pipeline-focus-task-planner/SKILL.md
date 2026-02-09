---
name: Pipeline Focus Task Planner
description: |
  Turn pipeline deals into a single prioritized engagement task with a checklist.
  Use when a user asks "which deals should I work on", "pipeline focus", "what deals
  need attention this week", or wants a clear engagement plan for top deals.
  Returns a task with grouped checklist, top deals rationale, and next steps.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "which deals should I work on"
      intent: "pipeline_focus"
      confidence: 0.85
      examples:
        - "which deals need my attention"
        - "what deals should I focus on"
        - "top deals to work on"
    - pattern: "pipeline focus"
      intent: "pipeline_engagement"
      confidence: 0.85
      examples:
        - "pipeline focus this week"
        - "deals needing attention"
        - "pipeline priorities"
    - pattern: "deal engagement plan"
      intent: "deal_engagement"
      confidence: 0.80
      examples:
        - "create an engagement plan for my deals"
        - "what should I do with my pipeline"
        - "pipeline action items"
  keywords:
    - "pipeline"
    - "deals"
    - "focus"
    - "attention"
    - "engagement"
    - "work on"
    - "priorities"
    - "this week"
  required_context:
    - pipeline_deals
  inputs:
    - name: date
      type: string
      description: "Reference date for the engagement plan in ISO format"
      required: false
      default: "today"
      example: "2025-01-15"
    - name: time_of_day
      type: string
      description: "Current time context for deadline calculations"
      required: false
    - name: period
      type: string
      description: "Planning period scope"
      required: false
      default: "this_week"
      example: "this_month"
    - name: user_capacity
      type: string
      description: "User's current workload level affecting engagement depth"
      required: false
      default: "normal"
      example: "busy"
  outputs:
    - name: task
      type: object
      description: "Single engagement task with title, checklist grouped by deal, due date, and priority"
    - name: top_deals
      type: array
      description: "Up to 3 selected deals with ID, name, value, stage, and why_now rationale"
    - name: rationale
      type: string
      description: "Explanation of why these deals were chosen for focus"
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
