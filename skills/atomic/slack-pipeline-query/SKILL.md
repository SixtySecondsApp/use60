---
name: Slack Pipeline Query
namespace: slack
description: |
  Show pipeline overview, quota tracking, forecast, and quarterly metrics from Slack DM.
  Use when a Slack user asks about their overall pipeline, quota, whether they're on track,
  revenue forecast, Q1/Q2/Q3/Q4 numbers, or pipeline coverage. Returns a structured
  Slack Block Kit summary with stage breakdown, target gap, and coverage ratio.
metadata:
  author: sixty-ai
  version: "1"
  category: slack-copilot
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - slack
    - pipeline
  triggers:
    - pattern: "show my pipeline"
      intent: "pipeline_query"
      confidence: 0.90
      examples:
        - "show me my pipeline"
        - "pipeline overview"
        - "how's my pipeline looking?"
    - pattern: "am I on track"
      intent: "quota_check"
      confidence: 0.88
      examples:
        - "am I on track for the quarter?"
        - "am I hitting my quota?"
        - "will I hit my target?"
    - pattern: "what's my forecast"
      intent: "forecast_query"
      confidence: 0.85
      examples:
        - "what's my revenue forecast?"
        - "show me the forecast"
        - "what's the weighted pipeline?"
    - pattern: "pipeline numbers"
      intent: "pipeline_metrics"
      confidence: 0.82
      examples:
        - "give me the numbers"
        - "what are my Q3 numbers?"
        - "show quarterly metrics"
        - "how's Q2 looking?"
  keywords:
    - "pipeline"
    - "quota"
    - "forecast"
    - "target"
    - "on track"
    - "revenue"
    - "numbers"
    - "am i"
    - "q1"
    - "q2"
    - "q3"
    - "q4"
    - "quarter"
    - "coverage"
    - "weighted"
  required_context:
    - slack_user_id
  inputs:
    - name: raw_query
      type: string
      description: "The original Slack message text"
      required: true
  outputs:
    - name: slack_blocks
      type: array
      description: "Slack Block Kit blocks to render in the DM response"
    - name: text
      type: string
      description: "Fallback plain text if blocks are unavailable"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - slack
    - pipeline
    - quota
    - forecast
    - metrics
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Slack Pipeline Query

## Goal
Give the user a fast, structured pipeline snapshot they can read in Slack in under 10 seconds. Include stage breakdown, quota tracking, and pipeline coverage so they can assess their quarter at a glance.

## Response Structure

### Header
"Pipeline Summary — Q{N} {Year}" (calculate current quarter from current month)

### Top-Level Fields (2x2 grid)
- **Total Pipeline**: sum of all active deal values
- **Weighted Value**: probability-weighted pipeline value
- **Active Deals**: total deal count
- **At Risk**: count of deals with risk score >= 60, or ":white_check_mark: None"

### Stage Breakdown
"By Stage:" followed by bullet list sorted by stage value descending:
`• *Stage Name*: N deal(s) — £Value`

Group deals by their `stage` field and sum values per stage.

### Quota Section (show only if target data is available)
Fields: Target | Gap to Target | Pipeline Coverage | Quarter Phase

- **Gap to Target**: `weighted_value - target`
  - Positive gap (over target): ":white_check_mark: On track"
  - Negative gap (under target): ":warning: £{gap} gap"
- **Pipeline Coverage**: `total_value / target` formatted as `{N}x`
  - Healthy: ≥ 3x
  - Warning: 2-3x
  - At risk: < 2x
- **Quarter Phase**: derive from current month position
  - Month 1 of quarter: "early Q{N}"
  - Month 2: "mid Q{N}"
  - Month 3: "late Q{N}"

### Footer
Context: link to full pipeline view | "Ask me 'which deals are at risk?' for details"

## Data Sources

- **Pipeline snapshot**: `execute_action("get_pipeline_snapshot", { owner: slack_user_id })`
  - Returns: `total_value`, `weighted_value`, `deal_count`, `target` (nullable)
- **Active deals**: `execute_action("list_deals", { status: "active", owner: slack_user_id })`
  - Used for stage breakdown
- **Risk scores**: `execute_action("get_deal_risk_scores", { owner: slack_user_id })`
  - Used for at-risk count

## Quarter Calculation

```
const now = new Date();
const month = now.getMonth(); // 0-11
const quarterNumber = Math.floor(month / 3) + 1;
const quarterMonth = month % 3; // 0=early, 1=mid, 2=late
```

## Response Constraints

- Currency values: format as £/$ with K/M shorthand for readability (e.g., £1.2M, £450K)
- Show stage breakdown even when no quota target is available
- If no deals exist: return plain text "No pipeline data available. Create some deals to get started."
- At-risk count: only count risk score >= 60, not all risk scores
- Pipeline coverage ratio: round to 1 decimal (e.g., 2.4x)

## Error Cases

- **No pipeline data / no deals**: Plain text: "No pipeline data available. Create some deals to get started."
- **No quota target set**: Show pipeline metrics without the quota section — do not show empty target fields
- **Missing risk scores**: Show "—" for at-risk count rather than erroring
