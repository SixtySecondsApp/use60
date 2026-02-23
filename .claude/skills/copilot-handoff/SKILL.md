---
name: Handoff Brief
description: |
  Full context brief for deal transfer to another rep or customer success.
  Use when a user says "/handoff", "hand off this deal", "transfer deal",
  "deal handover", or needs comprehensive documentation for a deal ownership change.
  Produces a standalone brief with deal overview, relationship map, risk flags,
  open items, and a handoff checklist so the new owner can take over with zero
  disruption to the buyer.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - pipeline
  triggers:
    - pattern: "/handoff"
      intent: "handoff_slash_command"
      confidence: 0.95
      examples:
        - "/handoff"
        - "/handoff to Alex"
    - pattern: "deal handoff"
      intent: "deal_handoff"
      confidence: 0.90
      examples:
        - "hand off this deal"
        - "create a handoff brief"
        - "handoff brief for this deal"
    - pattern: "transfer deal"
      intent: "deal_transfer"
      confidence: 0.85
      examples:
        - "transfer this deal to Sarah"
        - "reassign this deal"
        - "move this deal to new rep"
  keywords:
    - "handoff"
    - "hand off"
    - "transfer"
    - "handover"
    - "transition"
    - "reassign"
    - "brief"
    - "deal transfer"
  requires_context:
    - deal
  inputs:
    - name: deal_id
      type: string
      description: "Deal identifier to create handoff brief for"
      required: true
    - name: new_owner
      type: string
      description: "Name or ID of the person receiving the deal"
      required: false
    - name: handoff_type
      type: string
      description: "Type of handoff: rep_to_rep, sales_to_cs, expansion, coverage"
      required: false
      default: "rep_to_rep"
  outputs:
    - name: deal_overview
      type: object
      description: "Executive summary and deal snapshot with stage, value, health, and key dates"
    - name: relationship_map
      type: array
      description: "Stakeholder map with roles, engagement levels, sentiment, and relationship notes for each contact"
    - name: risk_flags
      type: array
      description: "Active risks and concerns with severity, evidence, and recommended mitigation"
    - name: open_items
      type: array
      description: "Open tasks, pending actions, and unresolved questions that need attention"
    - name: handoff_checklist
      type: array
      description: "Prioritized action list for the new owner's first 48 hours, first week, and first month"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales-ai
    - pipeline
    - handoff
    - transition
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Handoff Brief

## Instructions

You are executing the /handoff skill. Your job is to produce a comprehensive, standalone handoff document that enables a new deal owner to take over with full context and zero disruption to the buyer. The brief should be readable in 10-15 minutes and referenceable indefinitely.

## Goal

Create a deal handoff brief that preserves momentum and prevents the buyer from having to "start over" with a new rep. The #1 complaint from buyers about vendor relationships is "we keep having to repeat ourselves to new people." This skill exists to eliminate that problem.

## Required Capabilities
- **CRM**: Fetch deal history, contacts, activities, MEDDICC data, and pipeline context

## Data Gathering (via execute_action)

Gather comprehensive deal context:

1. **Deal record**: `execute_action("get_deal", { id: deal_id })` -- stage, value, close date, health, MEDDICC fields
2. **All contacts**: `execute_action("get_deal_contacts", { deal_id })` -- stakeholder map with roles and engagement
3. **Full activity history**: `execute_action("get_deal_activities", { deal_id, limit: 100 })` -- meetings, emails, calls, notes
4. **Open tasks**: `execute_action("list_tasks", { deal_id })` -- what is in flight
5. **All meetings**: `execute_action("get_meetings", { deal_id })` -- meeting history with summaries
6. **Company data**: `execute_action("get_company", { id: company_id })` -- firmographics, industry

## Handoff Brief Structure

### 1. Deal Overview (Executive Summary)
3-5 sentences covering:
- Deal stage, value, and close date
- Customer's core need or pain point
- Current momentum (positive, neutral, stalled)
- Immediate next steps
- Biggest risk or opportunity

Plus a structured deal snapshot table: company, industry, size, deal value, stage, close date, days in stage, health score, probability, competitor, source, original owner, handoff date.

### 2. Relationship Map
For each stakeholder:
- **Name and title**
- **Role in deal**: Champion, Economic Buyer, Evaluator, Blocker, Coach, Unknown
- **Engagement level**: High, Medium, Low (with evidence -- meeting count, response time)
- **Last contact**: Date and context
- **Relationship notes**: Communication style, priorities, personal rapport details
- **Influence**: High, Medium, Low
- **Sentiment**: Positive, Neutral, Negative, Unknown

Include stakeholders who have been mentioned but not yet met (mark as Unknown). Missing stakeholders cause blind spots.

### 3. Risk Flags
For each active risk:
- **Risk**: Clear description
- **Severity**: Critical, High, Medium
- **Evidence**: What signals this risk
- **Mitigation**: Recommended action for the new owner
- **Deadline**: When this becomes critical

Common risk categories: competitor threat, budget uncertainty, champion weakness, technical blocker, timeline slippage, stakeholder gap, stalled momentum.

### 4. Open Items
Compile from tasks, recent activities, and meeting notes:
- **Open tasks**: What is assigned, to whom, with deadlines
- **Pending actions**: Promised deliverables (proposals, demos, follow-ups) not yet completed
- **Unresolved questions**: Things the buyer asked that have not been answered
- **Scheduled events**: Upcoming meetings, calls, deadlines

For each item: description, owner, deadline, priority, and current status.

### 5. Handoff Checklist
Prioritized action list organized by timeframe:

**Immediate (Next 48 Hours)**:
- Read the full brief
- Send transition email to primary contact (reference recent context to show continuity)
- Review most recent meeting recordings
- Confirm all upcoming meetings are on the new owner's calendar

**First Week**:
- Have a live conversation with the primary contact
- Review all open tasks and confirm deadlines
- Assess deal health independently
- Conduct competitive research if a competitor is in play

**First Month**:
- Meet every stakeholder in the relationship map at least once
- Re-validate MEDDICC (especially Economic Buyer and Decision Criteria)
- Update CRM with fresh notes and observations

### 6. Internal Notes (Private Context)
Things the new owner needs to know but should NEVER share with the customer:
- Pricing flexibility and discount authority
- Internal politics or sensitivities
- Off-the-record stakeholder comments
- Competitor intelligence gathered from backchannel

### 7. Transition Email Draft
If new_owner is provided, generate a warm handoff email:
- Acknowledge the transition briefly
- Introduce the new owner with relevant credentials
- Reference recent context to prove continuity
- Confirm next steps and timeline

## Quality Checklist

Before returning results, verify:
- [ ] Executive summary is 3-5 sentences with complete deal context
- [ ] Stakeholder map includes at least 2 contacts (champion + 1 other)
- [ ] Each stakeholder has role, engagement level, sentiment, and relationship notes
- [ ] At least 1 risk flag identified (no deal is risk-free)
- [ ] Next steps include at least 3 immediate actions with deadlines
- [ ] Internal notes include pricing context and sensitivities
- [ ] Transition email references specific recent context (not generic)

## Error Handling

### Minimal deal data
Generate brief with available data. Set a completeness indicator to low. Add warning: "Limited data available. Schedule a live handoff call with previous owner to fill gaps."

### No stakeholder data
Return error: "No stakeholders found for this deal. Cannot generate handoff brief without contact information."

### Early-stage deal
Generate simplified brief focused on "what we know so far" rather than comprehensive handoff.

### New owner not specified
Generate full brief but omit transition email. Note: "Add new_owner parameter to generate customer-facing transition email."

## Output Contract

Return a SkillResult with:
- `data.deal_overview`: object with executive_summary (string), deal_snapshot (object with all key fields)
- `data.relationship_map`: array of { name, title, role, engagement_level, last_contact, relationship_notes, influence, sentiment }
- `data.risk_flags`: array of { risk, severity, evidence, mitigation, deadline }
- `data.open_items`: array of { description, owner, deadline, priority, status, type }
- `data.handoff_checklist`: array of { action, timeframe, priority, success_criteria }
- `data.internal_notes`: string (private context)
- `data.transition_email`: object with { subject, body, to, cc } (if new_owner provided)
