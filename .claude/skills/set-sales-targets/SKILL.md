---
name: Set Sales Targets
description: |
  Set or update monthly sales goal targets for New Business revenue, Outbound activities,
  Meetings, or Proposals. Use when a user asks to set their goal, update their target,
  change a monthly target, or specify how many meetings/calls/proposals they want to achieve.
  Also handles reading back current goals when the user asks what their targets are.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: minimal
  triggers:
    - pattern: "set my sales goal"
      intent: "set_target"
      confidence: 0.95
      examples:
        - "set my revenue target to 10000"
        - "set my new business goal to 15k"
        - "update my revenue goal"
        - "change my sales target"
    - pattern: "set my outbound target"
      intent: "set_outbound_target"
      confidence: 0.95
      examples:
        - "set my outbound goal to 50"
        - "update my call target"
        - "I want to do 100 outbound activities this month"
        - "change my outbound target"
    - pattern: "set my meetings goal"
      intent: "set_meetings_target"
      confidence: 0.95
      examples:
        - "set my meetings target to 20"
        - "I want to book 15 meetings this month"
        - "update my meeting goal"
        - "change my meetings target"
    - pattern: "set my proposals goal"
      intent: "set_proposals_target"
      confidence: 0.90
      examples:
        - "set my proposals target to 5"
        - "I want to send 10 proposals this month"
        - "update my proposal goal"
    - pattern: "what are my targets"
      intent: "get_targets"
      confidence: 0.90
      examples:
        - "what are my goals"
        - "show me my sales targets"
        - "what's my monthly target"
        - "what goals have I set"
  keywords:
    - "target"
    - "goal"
    - "monthly goal"
    - "revenue target"
    - "outbound target"
    - "meetings target"
    - "proposals target"
    - "new business"
    - "sales goal"
    - "KPI"
inputs:
  - name: field
    type: string
    description: "Which target to update: revenue_target, outbound_target, meetings_target, or proposal_target"
    required: false
    example: "revenue_target"
  - name: value
    type: number
    description: "The new goal value"
    required: false
    example: 10000
outputs:
  - name: message
    type: string
    description: "Confirmation message of what was set"
  - name: field
    type: string
    description: "The target field that was updated"
  - name: value
    type: number
    description: "The value that was set"
priority: high
---

# Set Sales Targets

## Goal
Help the user set or review their monthly KPI goals. These goals appear on the Dashboard as
progress bars on the New Business, Outbound, Meetings, and Proposals cards.

## The Four Targets

| Target | DB Field | Metric tracked | Unit |
|--------|----------|----------------|------|
| New Business | `revenue_target` | Total value of deals won this month | £ amount |
| Outbound | `outbound_target` | Calls, emails, LinkedIn messages logged | count |
| Meetings | `meetings_target` | Meetings held with external attendees | count |
| Proposals | `proposal_target` | Proposals generated or logged | count |

## Execution Flow

### Reading current targets
Use `execute_action("get_targets", {})` — returns current month's targets or a message that
none have been set yet.

### Setting a target
Use `execute_action("upsert_target", { field: "<field>", value: <number>, confirm: true })`.
Always ask for confirmation before writing unless the user has already confirmed.

### Parsing user intent

| User says | Field | Example value |
|-----------|-------|---------------|
| "revenue", "new business", "pipeline", "won deals" | `revenue_target` | 10000 |
| "outbound", "calls", "activities", "outreach" | `outbound_target` | 50 |
| "meetings", "calls booked", "demos" | `meetings_target` | 20 |
| "proposals", "quotes", "sent proposals" | `proposal_target` | 10 |

### Handling ambiguous values
- "15k" → 15000, "£10k" → 10000, "100" → 100
- If the user says "revenue goal to 10k" this is £10,000 (revenue_target = 10000)
- If no unit is provided for revenue, assume the currency used by the organisation

## Output Format

After a successful update, confirm clearly:
> "Done! Your **Meetings** goal is now set to **20 meetings** for this month. You can track
> your progress on the Dashboard."

After reading targets, summarise clearly:
> "Here are your current monthly goals:
> - New Business: £15,000
> - Outbound: 50 activities
> - Meetings: 20 meetings
> - Proposals: 5 proposals"

If no targets have been set, offer to help:
> "You haven't set any targets for this month yet. Would you like me to set them now?"

## Error Handling
- If value is missing or not a number, ask the user: "What value would you like to set for your [field] goal?"
- If field is ambiguous (user says "my goal"), ask which KPI they mean
- If value is 0 or very low, confirm: "Just to confirm — you'd like to set your [label] goal to [value]?"
