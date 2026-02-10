---
name: Deal Next Best Actions
description: |
  Generate a ranked action plan for advancing a specific deal based on its stage,
  recent activity, and your capacity. Use when a user asks "what should I do next
  on this deal", "next steps for the Acme deal", or "how do I move this deal forward".
  Returns prioritized actions with ROI rationale and time estimates.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  agent_affinity:
    - pipeline
  triggers:
    - pattern: "next steps for this deal"
      intent: "deal_next_actions"
      confidence: 0.90
      examples:
        - "what should I do next on this deal"
        - "next best actions for this deal"
        - "what are the next steps"
    - pattern: "how do I move this deal forward"
      intent: "deal_advancement"
      confidence: 0.85
      examples:
        - "how to advance this deal"
        - "move this deal forward"
        - "push this deal to the next stage"
    - pattern: "deal action plan"
      intent: "deal_actions"
      confidence: 0.80
      examples:
        - "action plan for this deal"
        - "what actions should I take on this deal"
        - "recommend actions for this deal"
  keywords:
    - "next steps"
    - "actions"
    - "deal"
    - "advance"
    - "move forward"
    - "priorities"
    - "what to do"
    - "recommendations"
  required_context:
    - deal_id
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to generate next best actions for"
      required: true
    - name: deal_context
      type: object
      description: "Additional deal context such as recent activity or health signals"
      required: false
    - name: user_capacity
      type: string
      description: "User's current workload level affecting action volume"
      required: false
      default: "normal"
      example: "busy"
  outputs:
    - name: actions
      type: array
      description: "Ranked action items with type, priority, ROI rationale, and time estimates"
    - name: priorities
      type: object
      description: "Summary of priority distribution across actions"
    - name: roi_rationale
      type: string
      description: "Overall rationale for the recommended action plan"
    - name: minimum_viable_action
      type: object
      description: "Single most important action if user is busy"
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
