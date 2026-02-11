---
name: Deal Slippage Diagnosis
description: |
  Diagnose at-risk deals by identifying slippage signals, root causes, and generating rescue actions.
  Use when a user asks "which deals are slipping", "show me at-risk deals", "deal slippage report",
  or wants to understand why deals are stalling. Returns risk radar, rescue actions, and task previews.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  agent_affinity:
    - pipeline
  triggers:
    - pattern: "which deals are slipping"
      intent: "deal_slippage_check"
      confidence: 0.90
      examples:
        - "show me slipping deals"
        - "which deals are at risk"
        - "deals that are stalling"
    - pattern: "deal slippage report"
      intent: "slippage_diagnosis"
      confidence: 0.85
      examples:
        - "diagnose deal slippage"
        - "why are my deals slipping"
        - "deal risk analysis"
    - pattern: "at risk deals"
      intent: "at_risk_review"
      confidence: 0.80
      examples:
        - "show me at-risk deals"
        - "deals in trouble"
        - "pipeline risks"
  keywords:
    - "slippage"
    - "slipping"
    - "at risk"
    - "stalling"
    - "risk"
    - "diagnosis"
    - "deals"
    - "pipeline"
    - "trouble"
  required_context:
    - at_risk_deals
    - deal_details
  inputs:
    - name: deal_id
      type: string
      description: "Specific deal identifier to diagnose (optional; omit to scan full pipeline)"
      required: false
    - name: deal_context
      type: object
      description: "Additional context such as health scores or activity history"
      required: false
    - name: limit
      type: number
      description: "Maximum number of at-risk deals to analyze"
      required: false
      default: 10
  outputs:
    - name: risk_radar
      type: array
      description: "At-risk deals with risk signals, root cause, and severity rating"
    - name: rescue_actions
      type: array
      description: "Ranked rescue actions with deal ID, priority, time estimate, and ROI rationale"
    - name: task_previews
      type: array
      description: "Top 3 task previews ready to create from rescue actions"
    - name: slack_update_preview
      type: object
      description: "Slack-formatted summary for manager notification with risks and actions"
  requires_capabilities:
    - crm
    - tasks
  priority: critical
  tags:
    - sales-ai
    - deal-health
    - pipeline-management
    - risk-mitigation
---

# Deal Slippage Diagnosis

## Goal
Diagnose **at-risk deals** across the pipeline, identify the specific slippage signals for each, determine root causes, and generate a prioritized rescue plan with concrete actions. This is a pipeline-level diagnostic -- it looks across ALL deals to find the ones that need attention most, ranks them by severity and save-ability, and produces a focused action plan that a rep or manager can execute immediately.

## Why Pipeline Slippage Diagnosis Matters

Pipeline slippage is the #1 destroyer of sales forecasts and quota attainment. The data is stark:

- **57% of forecasted deals slip to the next quarter** (Clari, 2023 Revenue Operations Report). The average B2B pipeline is 57% fiction -- deals that will not close when the rep says they will.
- **Only 28% of reps hit quota.** The primary reason is not effort or skill -- it is misallocation. Reps spend time on dead deals while winnable deals slip unnoticed (CSO Insights, World-Class Sales Practices).
- **Early detection changes everything.** Deals that receive intervention within 7 days of showing risk signals have a 3.2x higher recovery rate than deals that go 30+ days before someone notices (InsightSquared pipeline analytics).
- **The average rep loses 8 hours per week** on deals that will never close. That is 400+ hours per year -- enough to work 40 additional winnable deals (Salesforce State of Sales, 2023).
- **Forecast accuracy improves by 42%** when slippage signals are systematically monitored and flagged (Gartner, Sales Analytics Study).

The goal is not to be negative about the pipeline -- it is to be honest. Honest pipelines close more deals because rep time is allocated to deals that can actually be won.

## Required Capabilities
- **CRM**: To fetch pipeline deals, deal details, activities, health signals, and contacts
- **Tasks**: To create rescue task previews

## Inputs
- `deal_id` (optional): Specific deal to diagnose. If omitted, scan the full pipeline for at-risk deals.
- `deal_context` (optional): Additional context such as health scores or known risk factors.
- `limit` (optional, default 10): Maximum number of at-risk deals to analyze.

## Data Gathering (via execute_action)

### Full Pipeline Scan (when deal_id is not provided)
1. Fetch at-risk deals: `execute_action("get_pipeline_deals", { filter: "at_risk", include_health: true, limit: 10 })`
2. For each deal, fetch details: `execute_action("get_deal", { id, include_health: true })`
3. Fetch recent activities per deal: `execute_action("get_deal_activities", { deal_id, limit: 10 })`
4. Fetch overdue tasks: `execute_action("list_tasks", { status: "overdue" })`
5. Fetch pipeline summary: `execute_action("get_pipeline_summary", {})` -- for context on overall pipeline health

### Single Deal Diagnosis (when deal_id is provided)
1. Fetch the deal: `execute_action("get_deal", { id: deal_id, include_health: true })`
2. Fetch activities: `execute_action("get_deal_activities", { deal_id, limit: 30 })`
3. Fetch tasks: `execute_action("list_tasks", { deal_id })`
4. Fetch contacts on deal: from deal record -- check engagement levels

If data calls fail or return empty, note the gap and work with available data. Missing data is itself a risk signal.

## Slippage Signal Taxonomy

Read `references/slippage-signals.md` for the deep dive on all 15+ signals with CRM detection queries, historical accuracy rates, false positive indicators, and signal interaction effects. See `references/diagnostic-frameworks.md` for the 5 Whys methodology, deal review meeting agendas, and manager escalation templates.

These are the 15 most predictive slippage signals, ranked by severity. When analyzing a deal, check for each signal and note which ones are present. The combination of signals determines the overall risk severity.

### Critical Severity (deal likely to slip or die without immediate intervention)

**Signal 1: No activity in 14+ days**
- What: No emails, calls, meetings, or notes for 14+ calendar days
- Why critical: Gong research shows deals that go dark for 14+ days close at less than 8%. Activity is the oxygen of a deal.
- Detection: Compare current date to last activity date on the deal
- Common cause: Champion went dark, internal priority shift, competitor won

**Signal 2: Close date pushed 2+ times**
- What: The expected close date has been moved back at least twice
- Why critical: Each push reduces close probability by 15-20%. Two pushes means the original forecast was wrong AND the first correction was also wrong. The pattern is predictive of further slippage.
- Detection: Check deal history for close date changes. If no history is available, compare current close date to original/created date.
- Common cause: No compelling event, overconfident initial forecast, buyer process is longer than expected

**Signal 3: Close date is in the past**
- What: The expected close date has already passed and the deal is still open
- Why critical: This is the most obvious slippage signal and the most common. It indicates either the deal was lost and not updated, or the close date was fictional from the start.
- Detection: Compare close date to today's date
- Common cause: Rep forgot to update CRM, buyer delayed without communication, deal is actually dead

**Signal 4: Deal value decreased by 20%+**
- What: The deal amount was reduced significantly
- Why critical: Value reduction signals scope retreat. The buyer is either de-scoping to fit a tighter budget, or the seller is discounting to stay competitive. Either way, the deal dynamics have shifted unfavorably.
- Detection: Compare current deal value to original/maximum value
- Common cause: Budget constraints, competitive pressure, reduced scope

### High Severity (deal will likely slip without action this week)

**Signal 5: Single-threaded engagement**
- What: Only one contact from the buyer's side is engaged
- Why critical: Single-threaded deals close at 5.4% vs. 17% for multi-threaded (Gong). If that one contact goes on vacation, changes roles, gets overruled, or deprioritizes -- the deal dies instantly.
- Detection: Count unique contacts with activity in the last 30 days
- Common cause: Rep did not ask for introductions, champion is gatekeeping, deal is too early-stage for multi-threading

**Signal 6: No executive/economic buyer engagement**
- What: No meeting, email, or call involving the person who controls the budget
- Why critical: Deals without economic buyer engagement in the first 60% of the sales cycle close at 11% vs. 34% when the buyer is engaged early (MEDDIC benchmark data).
- Detection: Check contact roles on the deal. If no one has a title suggesting budget authority (VP+, Director, Owner, C-level), flag it.
- Common cause: Champion is shielding the process, rep is afraid to ask for access, economic buyer does not know the initiative exists

**Signal 7: Stage duration exceeds 2x average**
- What: The deal has been in its current stage for more than twice the average duration for that stage
- Why critical: Extended stage duration is the most reliable leading indicator of eventual loss. It means something is blocking progress and it has not been identified or addressed.
- Detection: Compare days in current stage to the average stage duration (if available from pipeline data) or use these defaults: Discovery 14 days, Evaluation 21 days, Proposal 14 days, Negotiation 10 days, Closing 7 days
- Common cause: Hidden objection, missing stakeholder, technical blocker, buyer indecision

**Signal 8: Overdue tasks on the deal**
- What: Tasks associated with the deal are past their due date
- Why critical: Overdue tasks mean commitments were made but not kept -- either by the rep or the buyer. This erodes trust and slows momentum.
- Detection: Check task list for tasks with due_date < today and status != complete
- Common cause: Rep overcommitted, buyer did not follow through on agreed actions, tasks were not properly tracked

### Medium Severity (deal needs attention within 2 weeks)

**Signal 9: Activity frequency declining**
- What: The rate of activity (meetings, emails, calls) is decreasing compared to the previous period
- Why medium: Declining activity is a leading indicator of future silence. It is not yet critical, but the trend is moving in the wrong direction.
- Detection: Compare activity count in the last 14 days to the 14 days before that
- Common cause: Buyer losing interest, competing priorities, evaluation fatigue

**Signal 10: No next meeting scheduled**
- What: There is no upcoming meeting or call on the calendar for this deal
- Why medium: A deal without a next meeting is a deal without momentum. The next interaction is uncertain, which means the buyer is not committed to continuing the process.
- Detection: Check for future calendar events or tasks with type "meeting" or "call"
- Common cause: Rep forgot to book the next meeting at the end of the last one, buyer avoided committing to a next step

**Signal 11: Health score below 50 (if available)**
- What: The deal's computed health score is below the 50% threshold
- Why medium: Health scores aggregate multiple signals. Below 50 means multiple factors are combining to create risk.
- Detection: Check health_score field on the deal record
- Common cause: Multiple contributing factors -- the health score is a composite signal

**Signal 12: No mutual action plan or defined next steps**
- What: There is no documented MAP, and the deal has no structured plan for progressing to close
- Why medium: Deals without a MAP close 49% slower and at a 18-22% lower rate. Without structure, both sides drift.
- Detection: Check for MAP-related tasks or notes. If none, flag this signal.
- Common cause: Rep did not create a MAP, buyer did not agree to structured process

### Low Severity (monitor and address proactively)

**Signal 13: Buyer company shows organizational change**
- What: News of layoffs, M&A, leadership change, or restructuring at the buyer's company
- Why low (but important): Organizational change does not always kill deals, but it reshuffles priorities and decision-making. It is a risk to monitor, not necessarily to panic about.
- Detection: Check deal notes or known intel about the buyer's company
- Common cause: External factors unrelated to your deal

**Signal 14: Competitor mentioned in recent interactions**
- What: The buyer has referenced evaluating or considering an alternative solution
- Why low (but important): Knowing about a competitor is actually better than not knowing. It gives you a chance to differentiate. The risk is only high if you cannot differentiate.
- Detection: Check activity notes and meeting transcripts for competitor mentions
- Common cause: Buyer is running a standard evaluation process

**Signal 15: Contract/legal review taking longer than expected**
- What: Legal, security, or procurement review has exceeded the expected timeline
- Why low (but escalatable): Legal review delays are common and usually resolvable. They become high-severity if they indicate a fundamental disagreement on terms.
- Detection: Check for legal/procurement tasks or milestones that are overdue
- Common cause: Legal team is backlogged, terms need negotiation, security review raised questions

## Root Cause Analysis Methodology

After identifying the signals present on each deal, determine the root cause using this hierarchy:

1. **If the buyer is not responding** (Signals 1, 5, 9): Root cause is likely "stale_engagement" or "champion_dark"
2. **If timeline keeps moving** (Signals 2, 3, 7): Root cause is likely "no_compelling_event" or "missing_decision_maker"
3. **If value is decreasing** (Signal 4): Root cause is likely "budget_uncertainty" or "competitor_risk"
4. **If execution is failing** (Signal 8): Root cause is likely "poor_execution" (internal issue, not buyer issue)
5. **If structure is missing** (Signals 10, 12): Root cause is likely "no_process" -- the deal lacks a framework for progressing
6. **If external factors are present** (Signals 13, 14, 15): Root cause is likely "external_blocker" -- outside the rep's direct control

Root causes to use in the output:
- `stale_engagement`: Buyer interest has cooled, activity has dropped
- `champion_dark`: Primary contact has stopped responding
- `missing_decision_maker`: Economic buyer not engaged, deal cannot progress
- `budget_uncertainty`: Budget not confirmed, reduced, or reallocated
- `competitor_risk`: Alternative solution gaining traction
- `procurement_blocker`: Legal, security, or procurement process stalling the deal
- `no_compelling_event`: No urgency or deadline driving the buyer to act
- `poor_execution`: Internal failure (overdue tasks, missed follow-ups, no MAP)
- `organizational_change`: Buyer's company undergoing restructuring, M&A, or leadership change

## Pipeline Risk Scoring Framework

For pipeline-level analysis, score each deal to determine which ones to focus on first. The goal is to answer: "If I only have time for 3 deals this week, which 3 should I focus on?"

### Deal Risk Score Calculation

```
Risk Score = (Signal Severity Sum) x (Deal Value Weight) x (Close Date Proximity)
```

**Signal Severity Sum**: Critical = 10 points, High = 5 points, Medium = 2 points, Low = 1 point. Sum all detected signals.

**Deal Value Weight**: Normalize deal value to a 1-3 multiplier:
- Top 25% of pipeline by value: 3x
- Middle 50%: 2x
- Bottom 25%: 1x

**Close Date Proximity**: Deals closer to close date are more urgent:
- Close date in next 2 weeks: 3x
- Close date in next month: 2x
- Close date 1+ months out: 1x
- Close date in the past: 3x (already slipped)

### Rescue Prioritization

After scoring, rank deals by risk score (highest first). Then apply these triage rules:

| Risk Score | Severity | Action | Timeline |
|-----------|----------|--------|----------|
| 50+ | Critical | Immediate rescue plan, manager notification | Today |
| 25-49 | High | Rescue plan, rep executes this week | This week |
| 10-24 | Medium | Proactive intervention, schedule actions | Next 2 weeks |
| 1-9 | Low | Monitor, no immediate action needed | Ongoing |

**The "Save or Kill" Decision**: For deals with Risk Score 50+, the first question is not "how do we save this?" but "SHOULD we save this?" A high-risk, low-value deal may not be worth the rescue effort. A high-risk, high-value deal with a salvageable root cause deserves immediate attention.

## Rescue Action Prioritization

For each at-risk deal, generate rescue actions ranked by this framework:

### Action Priority Rules

1. **Respond to buyer silence first.** If the buyer is not responding, nothing else matters. Re-engagement is always the #1 priority for stale deals.
2. **Address the root cause, not the symptoms.** If the root cause is "missing decision-maker," do not prescribe "send another email to the champion." Prescribe "request an executive alignment meeting."
3. **Prefer low-effort, high-impact actions.** A 10-minute phone call to a champion is almost always higher-ROI than a 2-hour proposal revision.
4. **Switch channels for stale deals.** If email has failed, prescribe a call or LinkedIn message. If calls have failed, go through a different contact.
5. **One deal, one primary action.** Each deal should have one "do this first" action. A list of 10 actions per deal causes paralysis, not progress.

### Action Templates by Root Cause

**stale_engagement:**
1. Send a value-add email with a relevant insight or case study (not "just checking in")
2. Call the champion with a specific question that requires a response
3. Reach out to a secondary contact for a project status update

**champion_dark:**
1. Go around: contact a different stakeholder
2. Go above: executive-to-executive outreach
3. Send the breakup email after 72 hours of multi-channel silence

**missing_decision_maker:**
1. Ask champion directly: "Who else needs to be involved to move this forward?"
2. Offer an executive briefing for the economic buyer
3. Create and share a business case document the champion can use internally

**budget_uncertainty:**
1. Build/share the ROI model quantifying cost of inaction
2. Propose a phased approach or smaller initial scope
3. Identify alternative budget holders or fiscal year timing

**competitor_risk:**
1. Ask directly about the competitive landscape
2. Share a reference from a customer who evaluated the same competitor
3. Differentiate on the buyer's specific evaluation criteria (not generic features)

**procurement_blocker:**
1. Ask for a specific list of procurement requirements
2. Offer to complete security questionnaires, vendor registration proactively
3. Introduce your legal/security team directly to their procurement team

**no_compelling_event:**
1. Quantify the cost of delay (monthly cost of the problem)
2. Introduce a real constraint (capacity, pricing, or market timing)
3. Find or create an internal deadline (budget cycle, board meeting, audit)

**poor_execution:**
1. Clear the overdue task backlog (complete or close each one)
2. Create a MAP with milestones and exit criteria
3. Book the next meeting before doing anything else

**organizational_change:**
1. Research the new landscape (who is in charge now?)
2. Reach out to the new decision-maker with a fresh executive summary
3. Set a reminder to re-engage after the transition stabilizes (30-90 days)

## Slack Notification Best Practices

The `slack_update_preview` should be formatted for quick consumption by a sales manager. Follow these rules:

### Format Rules
- Lead with the headline: "Pipeline Risk Report: [X] deals need attention"
- Use emoji-free, professional formatting (the dashboard does not use emojis)
- Bold the deal names and risk levels
- Include deal values to help the manager prioritize
- Limit to top 3-5 deals (do not overwhelm)
- End with a clear ask or recommendation

### Content Structure
```
*Pipeline Risk Report: [X] deals flagged*

*[Deal Name]* ($[Value]) - [Severity]
  Risk: [Primary signal in plain language]
  Action: [Top rescue action in one sentence]

*[Deal Name]* ($[Value]) - [Severity]
  Risk: [Primary signal]
  Action: [Top rescue action]

*Recommended*: [1-2 sentence summary of what the manager should know or do]
```

### When to Include Slack Notification
- Always include when 2+ deals are at Critical or High severity
- Include when total at-risk pipeline value exceeds 20% of the rep's quota
- Include when a single deal above $100K is at Critical severity
- Skip for Low severity only situations -- do not cry wolf

## Manager Escalation Criteria

Flag for manager attention when any of these conditions are met:

| Condition | Escalation Level | Rationale |
|-----------|-----------------|-----------|
| Deal $200K+ at Critical severity | Immediate | High-value deal at high risk requires executive attention |
| 3+ deals at High severity for same rep | This week | Pattern suggests rep capacity or skill issue |
| Close date pushed 3+ times | Immediate | Forecast is unreliable, need honest assessment |
| Single-threaded $100K+ deal | This week | Structural risk that the rep may need help addressing |
| Competitor winning and deal $150K+ | Immediate | May need executive intervention or strategic response |
| Rep has 50%+ pipeline at risk | This week | Quota is in jeopardy, may need pipeline generation support |

Manager escalation should be supportive, not punitive. The Slack message should frame risks as "opportunities to help" not "problems to investigate."

## Output Contract

Return a SkillResult with:
- `data.risk_radar`: array of 5-8 at-risk deals (sorted by risk score, highest first)
  - `deal_id`: string
  - `deal_name`: string
  - `company`: string | null
  - `value`: number | null
  - `close_date`: string | null
  - `days_since_last_activity`: number | null
  - `risk_score`: number (calculated from the risk scoring framework)
  - `risk_signals`: string[] (specific signals detected, using taxonomy names)
  - `root_cause`: string (from the root cause categories)
  - `severity`: "critical" | "high" | "medium"
  - `salvageable`: boolean (honest assessment)
  - `one_line_diagnosis`: string (plain-language summary of why this deal is at risk)
- `data.rescue_actions`: array of 5-8 rescue actions (ranked by priority across all deals)
  - `title`: string (specific, includes deal name and action)
  - `description`: string (detailed enough to execute without follow-up questions)
  - `deal_id`: string
  - `deal_name`: string
  - `priority`: "urgent" | "high" | "medium"
  - `estimated_time`: number (minutes)
  - `roi_rationale`: string (why this action matters for THIS deal)
  - `root_cause_addressed`: string (which root cause this action targets)
- `data.task_previews`: array of 3 task previews (the most important rescue actions, ready to create as tasks)
  - `title`: string (specific, includes person/deliverable)
  - `description`: string (include checklist of subtasks)
  - `due_date`: string (ISO date, prefer "today" or "tomorrow" for urgent items)
  - `priority`: "high" | "medium" | "low"
  - `deal_id`: string
- `data.slack_update_preview`: object (for manager notification)
  - `channel`: "slack"
  - `message`: string (Slack-formatted summary -- see Slack Notification Best Practices)
  - `blocks`: optional Slack Block Kit payload (for richer formatting)
  - `should_send`: boolean (based on escalation criteria -- do not send for low-risk-only situations)
  - `escalation_reason`: string | null (why this warrants manager attention)

## Quality Checklist

Before returning the diagnosis, verify:

- [ ] Risk radar deals are sorted by risk score (highest risk first), NOT alphabetically
- [ ] Every deal has at least one specific risk signal from the taxonomy, not generic "at risk"
- [ ] Root causes are specific and drawn from the defined categories, not made up
- [ ] Severity ratings are consistent with the signal severity rules (Critical signals = Critical severity)
- [ ] One-line diagnoses are in plain language a manager can understand in 5 seconds
- [ ] Rescue actions are root-cause-specific (different root causes get different actions)
- [ ] Rescue actions include the deal name (so the rep knows which deal each action is for)
- [ ] Task previews are for the TOP 3 most impactful actions, not just the first 3 in the list
- [ ] Task due dates reflect urgency (Critical = today/tomorrow, High = this week)
- [ ] Slack notification follows the format rules and includes deal values
- [ ] `should_send` is true only when escalation criteria are met (do not send noise)
- [ ] Salvageability assessment is honest -- some deals should be killed, not rescued
- [ ] The total number of rescue actions is manageable (5-8, not 20) -- reps need focus, not volume

## Examples

### Good Risk Radar Entry
```json
{
  "deal_id": "deal_abc123",
  "deal_name": "Acme Corp - Platform License",
  "company": "Acme Corp",
  "value": 185000,
  "close_date": "2026-02-28",
  "days_since_last_activity": 19,
  "risk_score": 72,
  "risk_signals": [
    "no_activity_14_days",
    "single_threaded",
    "close_date_pushed_twice",
    "no_economic_buyer_engagement"
  ],
  "root_cause": "missing_decision_maker",
  "severity": "critical",
  "salvageable": true,
  "one_line_diagnosis": "Only contact (Sarah Chen, Director) went dark 19 days ago. VP-level buyer never engaged. Close date pushed twice from Jan 15 to Feb 28. Without executive involvement, this $185K deal will not close."
}
```
Why this works: Specific signals cited with data. Root cause is precise. One-line diagnosis tells the full story in one sentence with names, dates, and amounts.

### Bad Risk Radar Entry
```json
{
  "deal_id": "deal_abc123",
  "deal_name": "Acme Corp",
  "company": "Acme Corp",
  "value": 185000,
  "close_date": "2026-02-28",
  "days_since_last_activity": null,
  "risk_score": null,
  "risk_signals": ["at_risk"],
  "root_cause": "general_risk",
  "severity": "high",
  "salvageable": true,
  "one_line_diagnosis": "This deal is at risk and needs attention."
}
```
Why this fails: No specific signals. No risk score. Root cause is meaningless. Diagnosis says nothing actionable.

### Good Slack Notification
```
*Pipeline Risk Report: 3 deals flagged this week*

*Acme Corp - Platform License* ($185K) - CRITICAL
  Risk: No activity in 19 days, VP buyer never engaged, close date pushed twice
  Action: Request executive alignment meeting through Sarah Chen's VP of Engineering

*GlobalTech - Analytics Suite* ($92K) - HIGH
  Risk: Single-threaded through a mid-level PM, close date is Feb 21
  Action: Ask PM to introduce you to the Director of Data before the close date

*StartupCo - Starter Plan* ($28K) - MEDIUM
  Risk: Demo completed 3 weeks ago with no follow-up, no next meeting scheduled
  Action: Send ROI model with cost-of-delay analysis, propose decision meeting

*At-risk pipeline total: $305K (32% of Q1 target)*
Recommendation: Acme Corp needs executive-to-executive outreach this week -- it is the highest-value deal at critical risk.
```

## Error Handling

### No at-risk deals found
If the pipeline scan returns no at-risk deals, this is GOOD news. Report it clearly: "No deals currently show slippage signals. Pipeline health is strong." Then provide proactive recommendations: "To maintain this, ensure every deal has: a next meeting scheduled, multi-threaded engagement, and a defined MAP."

### Pipeline data is incomplete or unavailable
If `get_pipeline_deals` fails or returns minimal data, fall back to available information. If only a single deal_id was provided, diagnose that deal thoroughly. If no deal data is available at all, explain what data is needed and how to ensure CRM records are complete.

### Too many at-risk deals (15+)
If the pipeline has 15+ at-risk deals, do not analyze all of them. Apply the risk scoring framework to rank them, then focus on the top 5-8. Note: "Your pipeline has [X] deals showing risk signals. Analyzing the top [Y] by risk score. Consider reviewing the remaining [Z] deals for potential disqualification -- a smaller, healthier pipeline outperforms a large, leaky one."

### All deals are at-risk
If every deal in the pipeline is flagged, the problem is systemic, not deal-specific. Shift the diagnosis from individual deal rescue to pipeline health: "All [X] deals show risk signals. This suggests a systemic issue rather than individual deal problems. Common causes: (1) Over-qualification at the top of funnel (deals entering pipeline too early), (2) Inconsistent follow-up cadence, (3) Lack of multi-threading, (4) Missing MAPs. Recommend a pipeline review meeting with your manager."

### Deal has no close date
Assign the signal "missing_close_date" (Medium severity) and estimate a close date based on stage and deal size. Note: "No close date set. Estimated [date] based on stage and deal value. The first rescue action should be confirming a realistic close date with the buyer."

### Mixed signals (positive and negative)
When a deal has both positive signals (recent meeting, increasing engagement) and negative signals (close date pushed, missing economic buyer), report both honestly. Do not let positive signals mask structural risks. "This deal has recent momentum (meeting last week, positive feedback) but structural risk remains: no economic buyer engaged and close date has been pushed twice. The momentum is real but fragile."

### Health score is unavailable
If the deal does not have a computed health score, calculate an approximate one from available signals: count the number and severity of detected signals and use that as a proxy. Note: "Health score is not available for this deal. Based on detected signals, estimated risk level is [severity]."

## Tone and Presentation

- Be diagnostic, not alarmist. "This deal has 3 critical risk signals" not "THIS DEAL IS IN TROUBLE."
- Use data and specifics. "No activity in 19 days, close date pushed from Jan 15 to Feb 28" not "the deal is stalling."
- Be honest about probability. If a deal is likely dead, say so. False optimism wastes the rep's most scarce resource: time.
- Frame rescue actions as the next 72 hours, not a multi-week project. Urgency matters.
- The Slack notification should be written for a sales manager who has 30 seconds to read it. Lead with the most important information.
- When recommending disqualification, frame it positively: "Closing this deal as lost frees up capacity for [X other winnable deals]. The best pipeline management is knowing which deals to remove, not just which ones to add."
- Never use "just" in rescue actions. "Just follow up" minimizes the craft of sales. Every action should have a specific rationale.
