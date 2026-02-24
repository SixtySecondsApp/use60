---
name: Deal Intelligence Summary
description: |
  Generate a narrative intelligence summary for a specific deal combining health score, trend analysis,
  relationship health, risk signals, recent activity highlights, and recommended next actions with reasoning.
  Use when a user asks "summarize this deal", "deal intelligence", "how is this deal doing", or "deal overview".
  Returns a structured narrative (not just metrics) with context and actionable insights.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - pipeline
  triggers:
    - pattern: "summarize this deal"
      intent: "deal_summary"
      confidence: 0.90
      examples:
        - "give me a summary of this deal"
        - "summarize the Acme deal"
        - "deal summary"
    - pattern: "deal intelligence"
      intent: "deal_intelligence_report"
      confidence: 0.85
      examples:
        - "deal intelligence report"
        - "intelligence on this deal"
        - "what's the intelligence on this opportunity"
    - pattern: "how is this deal doing"
      intent: "deal_status_check"
      confidence: 0.85
      examples:
        - "how is the deal going"
        - "deal status"
        - "where do we stand on this deal"
    - pattern: "deal overview"
      intent: "deal_overview"
      confidence: 0.80
      examples:
        - "give me an overview of this deal"
        - "deal snapshot"
        - "what's happening with this deal"
  keywords:
    - "deal"
    - "summary"
    - "intelligence"
    - "overview"
    - "status"
    - "how is"
    - "doing"
    - "snapshot"
    - "report"
  required_context:
    - deal_id
    - company_name
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to generate intelligence summary for"
      required: true
    - name: include_history
      type: boolean
      description: "Include health score trend history in the narrative"
      required: false
      default: true
  outputs:
    - name: narrative_summary
      type: string
      description: "Structured narrative combining all intelligence dimensions"
    - name: health_snapshot
      type: object
      description: "Current health score, status, risk level, and trend direction"
    - name: relationship_snapshot
      type: object
      description: "Primary contact health, ghost risk, and engagement quality"
    - name: risk_signals
      type: array
      description: "Ranked risk signals with severity and description"
    - name: recent_highlights
      type: array
      description: "Key activities and milestones from the last 30 days"
    - name: recommended_actions
      type: array
      description: "Top 3 recommended next actions with reasoning"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales-ai
    - deal-health
    - intelligence
    - pipeline
    - summary
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Deal Intelligence Summary

## Goal
Generate a comprehensive, narrative intelligence summary for a deal that synthesizes health data, relationship status, risk signals, activity patterns, and recommended actions into a coherent story. This is not a dashboard of metrics -- it is a strategic briefing that answers: "What is the current state of this deal, why is it in that state, and what should I do about it?"

## Why Intelligence Summaries Matter

Sales reps are drowning in data but starving for insight. The average CRM deal record has 40+ data points, 20+ related records, and dozens of activities. Converting this into actionable intelligence requires synthesis, context, and interpretation -- exactly what humans are slow at and AI excels at.

Research shows:
- **Reps spend 21% of their time on data entry and review** (Salesforce State of Sales, 2023) -- much of that time is trying to figure out "what does all this mean?"
- **Context switching costs 40% of productive time** (American Psychological Association) -- jumping between CRM tabs, email, calendar, and notes to piece together deal status
- **Teams with AI-driven deal intelligence close 19% faster** (McKinsey Sales Analytics Study) because reps spend less time diagnosing and more time acting

The Deal Intelligence Summary delivers what a rep would take 15 minutes to manually compile in under 3 seconds.

## Required Capabilities
- **CRM**: To fetch deal data, health scores, relationship scores, activities, and contacts

## Inputs
- `deal_id`: The deal identifier (required)
- `include_history`: Whether to include health score trend history (optional, default: true)

## Data Gathering (via execute_action)

Gather comprehensive intelligence data:

1. **Deal record**: `execute_action("get_deal", { id: deal_id, include_health: true })` -- stage, value, close date, contacts, company
2. **Deal health score**: Query `deal_health_scores` table:
   - `overall_health_score`, `health_status`, `risk_level`, `risk_factors`
   - `sentiment_trend`, `avg_sentiment_last_3_meetings`
   - `days_in_current_stage`, `days_since_last_meeting`, `days_since_last_activity`
   - `meeting_count_last_30_days`, `activity_count_last_30_days`
   - `predicted_close_probability`, `predicted_days_to_close`
   - Component scores: `stage_velocity_score`, `sentiment_score`, `engagement_score`, `activity_score`
3. **Health history** (if include_history = true): Query `deal_health_history` table:
   - Fetch last 5 snapshots ordered by `snapshot_at` descending
   - Calculate trend: improving, stable, or declining
4. **Relationship health**: Query `relationship_health_scores` for all contacts on deal:
   - Focus on primary contact: `overall_health_score`, `is_ghost_risk`, `ghost_probability_percent`
   - `days_since_last_contact`, `response_rate_percent`, `sentiment_score`
5. **Recent activities**: `execute_action("get_deal_activities", { deal_id, limit: 20 })` -- last 30 days
6. **Recent meetings**: Filter activities for type = 'meeting', extract outcomes and sentiment
7. **Open tasks**: `execute_action("list_tasks", { deal_id, status: "open" })` -- planned actions

If any data is missing, note it in the narrative: "Health score not available -- recommend running health recalculation."

## Narrative Structure

The intelligence summary should follow this structure:

### 1. Executive Snapshot (2-3 sentences)
- Current stage, value, and expected close date
- Overall health status in plain language
- Primary risk or opportunity flag

**Example**: "The Acme Corp Enterprise License deal ($185K, Negotiation stage, closes Feb 28) is showing warning signs with a health score of 43/100. The primary contact has gone dark for 12 days and sentiment from the last demo was lukewarm (55%). This deal needs immediate re-engagement to prevent slippage."

### 2. Health Analysis (3-4 sentences)
- Current health score and trend direction (if history available)
- Breakdown of what is driving the score (stage velocity, sentiment, engagement)
- Comparison to healthy deals in the same stage

**Example**: "Health score has declined from 58 to 43 over the past 14 days, driven by a 20-point drop in engagement score and a sentiment decline. Stage velocity is concerning -- the deal has been in Negotiation for 28 days vs. the 14-day average. Sentiment from recent meetings (55% avg) indicates buyer hesitation that has not been addressed."

### 3. Relationship Health (2-3 sentences)
- Primary contact engagement status
- Ghost risk assessment
- Multi-threading status (are other stakeholders engaged?)

**Example**: "Primary contact Sarah Chen (Director of Ops) has not responded to 3 emails over 12 days, flagging a 68% ghost probability. No other stakeholders are actively engaged, making this a single-threaded deal at high risk. If Sarah continues to be unresponsive, the deal will need multi-threading or escalation within 72 hours."

### 4. Risk Signals (bullet list, top 3-5 signals with severity)
- Ranked by severity (critical → high → medium)
- Each signal includes: what it is, why it matters, and when it was detected

**Example**:
- **Critical**: No response from champion in 12 days (detected Feb 15) -- single-threaded deals that go dark for 14+ days close at <8%
- **High**: Stage duration 2x average (28 days vs 14-day avg) -- extended negotiation signals hidden objection or missing stakeholder
- **High**: Sentiment declining trend (from 72% to 55%) -- buyer enthusiasm is waning, likely due to unaddressed concern
- **Medium**: No next meeting scheduled -- momentum requires a committed next step with a date

### 5. Recent Highlights (bullet list, 3-5 key events)
- Significant activities from the last 30 days
- Meeting outcomes, key emails, proposal sent, etc.
- Include dates for context

**Example**:
- **Feb 3**: Demo completed with Sarah Chen and technical team -- positive initial feedback but security questions raised
- **Feb 5**: Follow-up email sent with security documentation -- opened but no reply
- **Feb 10**: Pricing proposal sent ($185K, 3-year contract) -- opened twice, no response
- **Feb 12**: Voicemail left for Sarah -- no callback
- **Feb 15**: LinkedIn message sent -- read but no reply

### 6. Recommended Next Actions (3 actions with reasoning)
- Ranked by impact and urgency
- Each action includes: what to do, why it matters, estimated time
- Connect actions to the specific risk signals and deal context

**Example**:
1. **Multi-thread into technical buyer** (~20 min): Sarah's silence is critical. Reach out to the VP of Engineering (mentioned in demo) to check project status. If the deal is still active, request an alignment meeting. Single-threaded deals die when the thread breaks.
2. **Send breakup email to Sarah** (~10 min): After 12 days of multi-channel silence, send the honest check-in: "I want to be respectful of your time. It seems like timing may not be right for this initiative. If things change, I'm here." This re-engages 15-20% of stalled deals.
3. **Address security concerns explicitly** (~30 min): The demo surfaced security questions that were answered via email but not discussed. Schedule a technical deep-dive with your security team and their technical evaluator to remove this blocker.

### 7. Bottom-Line Assessment (1-2 sentences)
- Honest evaluation: is the deal salvageable, healthy, or dead?
- Recommended focus level: high priority, monitor, or disqualify

**Example**: "This deal is salvageable but fragile. Without re-engagement within 48 hours, it will likely slip past the Feb 28 close date or die entirely. Recommend making this a high-priority rescue this week."

## Narrative Tone and Style

- **Direct and specific**: Use names, dates, numbers. "Sarah Chen has not responded in 12 days" not "the contact is unresponsive"
- **Contextual**: Explain why things matter. "Stage duration 2x average signals hidden objection" not just "deal has been in stage 28 days"
- **Honest**: If the deal looks dead, say so. False optimism wastes time.
- **Actionable**: Every insight should connect to a recommendation. "Sentiment is declining" → "Address the unresolved concern before proposing next steps"
- **Avoid jargon**: Write for a sales rep, not a data scientist. "Health score of 43" is less useful than "Health score of 43, indicating the deal is at risk of stalling"

## Output Contract

Return a SkillResult with:

- `data.narrative_summary`: The full structured narrative (string, formatted with markdown headers and bullets)

- `data.health_snapshot`: object
  - `overall_health_score`: number (0-100)
  - `health_status`: "healthy" | "warning" | "critical" | "stalled"
  - `risk_level`: "low" | "medium" | "high" | "critical"
  - `trend_direction`: "improving" | "stable" | "declining" | null (if no history)
  - `trend_change`: number (e.g., -15 for 15-point drop) | null

- `data.relationship_snapshot`: object
  - `primary_contact_name`: string
  - `primary_contact_health_score`: number (0-100)
  - `is_ghost_risk`: boolean
  - `ghost_probability_percent`: number | null
  - `days_since_last_contact`: number
  - `response_rate_percent`: number | null
  - `multithreading_status`: "single" | "limited" | "good" (based on number of engaged contacts)

- `data.risk_signals`: array of objects (top 5, ranked by severity)
  - `signal_type`: string (e.g., "no_activity", "sentiment_decline", "stage_stall")
  - `severity`: "critical" | "high" | "medium" | "low"
  - `description`: string (plain language)
  - `detected_date`: string (ISO date)
  - `impact`: string (why this signal matters)

- `data.recent_highlights`: array of objects (last 5 significant events)
  - `date`: string (ISO date)
  - `event_type`: "meeting" | "email" | "call" | "proposal" | "task" | "note"
  - `description`: string
  - `outcome`: string | null (for meetings)

- `data.recommended_actions`: array of objects (top 3)
  - `action`: string (specific, actionable)
  - `reasoning`: string (why this action, tied to deal state)
  - `estimated_time_minutes`: number
  - `priority`: "critical" | "high" | "medium"

- `data.bottom_line_assessment`: object
  - `salvageable`: boolean
  - `recommended_focus`: "high_priority" | "monitor" | "disqualify"
  - `assessment`: string (1-2 sentence honest evaluation)

## Quality Checklist

Before returning the intelligence summary, verify:

- [ ] Narrative uses specific names, dates, and numbers (not vague generalities)
- [ ] Health trend is explained with context (what changed and why)
- [ ] Relationship health addresses ghost risk explicitly if present
- [ ] Risk signals are ranked by severity, not listed randomly
- [ ] Each risk signal includes "why it matters" context
- [ ] Recent highlights are significant events, not every CRM log entry
- [ ] Recommended actions are root-cause-specific (tied to detected risks)
- [ ] Bottom-line assessment is honest (not sugar-coated)
- [ ] Narrative flows as a coherent story, not a list of disconnected facts
- [ ] If data is missing, it is noted explicitly (not silently omitted)
- [ ] Time estimates for actions are realistic

## Examples

### Good Narrative Summary (Opening)
```
The GlobalTech Analytics Suite deal ($92K, Evaluation stage, closes Mar 15) is healthy with a score of 74/100, up from 68 two weeks ago. Momentum is building -- we completed a successful demo last week with positive sentiment (78%) and the champion is actively driving internal alignment. However, the deal is single-threaded through a mid-level PM, which is a structural risk worth addressing.
```
Why this works: Specific deal name, value, stage, date. Health score with context (trend). Sentiment data. Risk is flagged with context.

### Bad Narrative Summary (Opening)
```
This deal is doing well. Health score is good. The demo went fine. We should keep working on it.
```
Why this fails: Vague. No specifics. No actionable insight. No risk assessment.

### Good Risk Signal
```
{
  "signal_type": "sentiment_decline",
  "severity": "high",
  "description": "Sentiment dropped from 78% (Feb 10 demo) to 55% (Feb 15 follow-up)",
  "detected_date": "2026-02-15",
  "impact": "Declining sentiment signals an unresolved concern or objection. If not addressed, buyer enthusiasm will continue to erode and the deal will stall in evaluation."
}
```
Why this works: Specific trend with dates. Clear severity. Impact explains why the rep should care.

### Bad Risk Signal
```
{
  "signal_type": "risk",
  "severity": "medium",
  "description": "There is some risk",
  "detected_date": null,
  "impact": "Could be a problem"
}
```
Why this fails: No specifics. Vague severity. No context. Not actionable.

## Error Handling

### Health score not available
Note it in the narrative: "Health score not available for this deal. Recommend running health recalculation to enable intelligence-driven insights. Based on available activity data, [manual assessment]."

### No recent activity
Frame it as a finding: "No activity recorded in the last 30 days. This deal is either inactive or activity logging is incomplete. Recommend confirming deal status with the champion and updating the CRM before investing more time."

### Single activity data point
Work with what you have but flag the limitation: "Only 1 meeting recorded in the last 30 days. Limited activity data makes trend analysis unreliable. Sentiment from that meeting (Feb 10 demo) was positive (78%), but without follow-up interactions, we cannot assess whether momentum is maintained."

### Deal has no close date
Include as a risk signal: "No expected close date set. This ambiguity itself is a risk -- deals without a target date are 3x more likely to slip indefinitely. First action: confirm a realistic close date with the buyer."

### Missing contact health data
Note it: "Relationship health data unavailable for primary contact. Based on activity logs, last contact was [X] days ago. Recommend confirming engagement status and response patterns."

### Deal is clearly dead
Be direct: "This deal shows all the hallmarks of a lost opportunity: 45+ days with no response, close date 3 months overdue, and health score of 12/100. Recommend marking as closed-lost and reallocating time to active opportunities. If there is reason to believe the deal is still viable, document that reasoning in the CRM."

## Tone and Presentation

- Write as if briefing a sales manager who has 60 seconds to understand the deal
- Lead with the most important information (health status, primary risk)
- Use plain language, not CRM jargon
- Be honest about bad news (managers respect candor over optimism)
- Connect data to actions (every insight should lead to a recommendation)
- Include numbers and dates for credibility and specificity
- Acknowledge uncertainty when data is incomplete (do not fill gaps with assumptions)
