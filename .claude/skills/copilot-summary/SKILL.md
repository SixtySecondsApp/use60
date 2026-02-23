---
name: Copilot Summary
description: |
  Generate a comprehensive deal summary with status, risks, next steps, and relationship health.
  Use when a user asks "/summary", "deal summary", "deal status", "how is the [deal] going",
  "summarize this deal", "what's happening with [deal]", or "deal health check".
  Pulls deal data, activity history, meeting transcripts, and relationship signals to produce
  a structured summary with actionable insights. Requires a deal entity in context.
  Do NOT use for pipeline-wide summaries -- this skill focuses on a single deal.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/summary"
    description: "Deal summary with status, risks, and health"
    icon: "bar-chart-3"
  context_profile: sales
  agent_affinity:
    - pipeline
  triggers:
    - pattern: "/summary"
      intent: "slash_summary"
      confidence: 0.95
      examples:
        - "/summary"
        - "/summary for this deal"
        - "/summary Acme deal"
    - pattern: "deal summary"
      intent: "deal_summary"
      confidence: 0.90
      examples:
        - "give me a deal summary"
        - "summarize this deal"
        - "deal overview"
    - pattern: "deal status"
      intent: "deal_status"
      confidence: 0.90
      examples:
        - "what's the status of this deal"
        - "how is the deal going"
        - "deal health check"
  keywords:
    - "summary"
    - "status"
    - "deal"
    - "health"
    - "overview"
    - "review"
    - "check"
  requires_context:
    - deal
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to summarize"
      required: true
    - name: include_history
      type: boolean
      description: "Whether to include full activity timeline"
      required: false
      default: false
  outputs:
    - name: status
      type: object
      description: "Deal status: stage, amount, close date, velocity, days in stage, stage progression"
    - name: risks
      type: array
      description: "Identified deal risks with severity, description, and recommended actions"
    - name: next_steps
      type: array
      description: "Recommended next actions with owners, deadlines, and priority"
    - name: relationship_health
      type: object
      description: "Relationship health score with engagement metrics, sentiment signals, and trend"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales
    - deal
    - summary
    - pipeline
    - health
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

## Instructions

You are executing the /summary skill. Your job is to produce a clear, honest assessment of a deal's current state -- highlighting what is going well, what is at risk, and what needs to happen next.

## Data Gathering

Collect complete deal intelligence:

1. **Fetch deal details**: `execute_action("get_deal", { id: deal_id })` -- stage, amount, close date, owner, contacts, custom fields, notes
2. **Fetch contacts on deal**: Get all associated contacts with their roles and last interaction dates
3. **Fetch activity timeline**: All activities (meetings, emails, calls, tasks) in the last 60 days
4. **Fetch meeting transcripts**: Recent meeting digests for sentiment and commitment tracking
5. **Fetch open tasks**: Pending tasks related to this deal -- especially overdue ones
6. **Fetch stage history**: How long the deal has been in each stage, number of stage changes

## Output Structure

### 1. Status

```json
{
  "deal_name": "Deal Name",
  "company": "Company Name",
  "stage": "Current Stage",
  "amount": "$X",
  "close_date": "YYYY-MM-DD",
  "days_in_current_stage": 14,
  "avg_days_in_stage": 10,
  "stage_health": "on_track | slipping | stalled",
  "velocity": "faster_than_avg | on_pace | slower_than_avg",
  "owner": "Rep Name",
  "last_activity": "Date and type of last activity",
  "days_since_last_activity": 3,
  "close_date_changes": 0,
  "win_probability": "high | medium | low"
}
```

**Stage health logic:**
- `on_track`: Days in stage <= average for this stage
- `slipping`: Days in stage is 1.5-2x average
- `stalled`: Days in stage is >2x average or no activity in 14+ days

### 2. Risks

Evaluate every deal against these risk signals:

| Signal | Severity | Trigger |
|--------|----------|---------|
| No activity in 14+ days | High | Deal has gone quiet |
| Close date pushed 2+ times | High | Timeline is unreliable |
| Champion not engaged in 10+ days | High | Champion may have checked out |
| New stakeholder appeared late | Medium | Potential blocker or reset |
| Competitor mentioned in transcripts | Medium | Active competitive evaluation |
| Deal in same stage >2x average | Medium | Progression has stalled |
| Open tasks overdue | Medium | Commitments not being met |
| No economic buyer identified | High | Deal may lack sponsorship |
| Close date in the past | High | Deal is overdue |

Each risk:
```json
{
  "signal": "Description of the risk signal",
  "severity": "high | medium | low",
  "evidence": "Specific data point that triggered this risk",
  "recommended_action": "What to do about it"
}
```

### 3. Next Steps

Generate 3-5 recommended actions prioritized by impact:

```json
{
  "action": "What needs to happen",
  "owner": "Who should do it (rep name or prospect contact)",
  "deadline": "Suggested date",
  "priority": "high | medium",
  "rationale": "Why this action matters right now"
}
```

Priority logic:
- **High**: Directly unblocks deal progression or addresses a high-severity risk
- **Medium**: Strengthens positioning or builds momentum

Always include at least one action owned by the rep and one by the prospect.

### 4. Relationship Health

```json
{
  "score": 72,
  "trend": "improving | stable | declining",
  "engagement_metrics": {
    "meetings_last_30_days": 3,
    "emails_last_30_days": 8,
    "avg_response_time_hours": 4,
    "contacts_engaged": 3,
    "total_contacts": 5
  },
  "sentiment_signals": [
    { "signal": "Positive language in last meeting", "type": "positive" },
    { "signal": "Delayed response to proposal email", "type": "caution" }
  ],
  "champion_status": "active | quiet | unknown",
  "multi_threaded": true,
  "coverage_gap": "No contact with procurement team"
}
```

**Score calculation:**
- Base score: 50
- +10 for meeting in last 7 days
- +10 for email response within 24 hours
- +10 for multi-threaded (3+ contacts engaged)
- +10 for active champion
- +10 for deal progressing on pace
- -10 for no activity in 14+ days
- -10 for champion gone quiet
- -15 for close date pushed
- -10 for competitor mentioned
- Cap at 0-100

## Summary Narrative

After the structured data, provide a 3-4 sentence narrative summary that a manager could read in 10 seconds:

> "[Deal Name] is [on track / at risk / stalled] at the [Stage] stage. [Key positive signal]. [Key risk or concern]. [Recommended immediate action]."

Example:
> "Acme Enterprise is at risk at the Negotiation stage. Strong champion engagement with 3 meetings in the last 2 weeks, but the close date has been pushed twice and no contact with procurement. Recommend scheduling a procurement intro call this week to unblock the contract review."

## Quality Checklist

Before returning:
- [ ] Every risk has specific evidence from CRM data, not speculation
- [ ] Next steps are actionable with owners and deadlines
- [ ] Relationship health score reflects actual engagement data
- [ ] Narrative summary is honest -- does not sugarcoat a struggling deal
- [ ] No fabricated metrics or activity counts
- [ ] Close date and amount are current (not stale)
- [ ] Champion status is based on actual interaction data

## Error Handling

### Deal not found
If the deal_id does not match any deal, search by name or company. If still not found: "I could not find that deal. Can you provide the deal name or company?"

### Minimal activity data
If the deal has very few activities, note: "Limited activity data available for this deal. The summary is based on [X] activities in the last 60 days. Consider logging more interactions for a more accurate health assessment."

### Multiple deals for same company
If the company has multiple active deals, summarize the requested deal but note: "This company has [N] other active deals: [names]. Would you like a summary of any of those?"
