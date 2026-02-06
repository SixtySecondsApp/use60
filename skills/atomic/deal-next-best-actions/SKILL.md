---
name: Deal Next Best Actions
description: |
  Generate stage-aware, capacity-aware ranked action plan for a deal. Considers deal stage, recent activity, and user capacity.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: deal_updated
    - pattern: deal_stage_changed
    - pattern: user_request
  required_context:
    - deal_id
  outputs:
    - actions
    - priorities
    - roi_rationale
    - minimum_viable_action
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales-ai
    - deals
    - actions
    - pipeline
    - prioritization
---

# Deal Next Best Actions

## Goal
Generate a ranked, prioritized action plan for advancing a deal based on stage, activity patterns, and capacity.

## Required Capabilities
- **CRM**: To fetch deal data, stage, recent activity, and related records

## Inputs
- `deal_id`: The deal identifier
- `user_capacity` (optional): "busy" | "normal" | "available"
- `organization_id`: Current organization context

## Data Gathering (via execute_action)
1. Fetch deal: `execute_action("get_deal", { id: deal_id })`
2. Fetch pipeline summary: `execute_action("get_pipeline_summary", {})`
3. Fetch recent activity signals: `execute_action("get_contacts_needing_attention", { days_since_contact: 7, filter: "at_risk" })`
4. Fetch tasks: `execute_action("list_tasks", { deal_id })`

## Output Contract
Return a SkillResult with:
- `data.actions`: Array of action objects (ranked by priority):
  - `action_type`: "email" | "call" | "meeting" | "task" | "crm_update" | "research"
  - `title`: Action title
  - `description`: What to do
  - `priority`: "urgent" | "high" | "medium" | "low"
  - `roi_rationale`: Why this action matters
  - `estimated_time`: Time estimate (minutes)
  - `deadline`: Recommended deadline
  - `owner`: Suggested owner
  - `dependencies`: Other actions this depends on
- `data.priorities`: Summary of priority distribution
- `data.roi_rationale`: Overall rationale for the action plan
- `data.minimum_viable_action`: If user is busy, the single most important action
- `data.stage_insights`: Insights about deal stage and what typically works

## Guidelines
- Consider deal stage: different stages need different actions
- Factor in activity recency: if no activity in 7 days, prioritize re-engagement
- Respect user capacity: if "busy", return only minimum_viable_action
- Rank by ROI: actions that move deal forward fastest get highest priority
- Include time estimates so user can plan
- Reference organization sales methodology if available
