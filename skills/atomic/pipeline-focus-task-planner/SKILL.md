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
  context_profile: sales
  agent_affinity:
    - pipeline
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
    - company_name
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
Given a list of pipeline deals, produce a **single actionable engagement task** with a clear, deal-grouped checklist. The core insight is that scattered tasks across many deals lead to shallow engagement with all of them. One focused task with a structured checklist drives deep, intentional engagement with the deals that matter most.

## Pipeline Engagement Philosophy

### Work the Right Deals, Not All Deals

The natural instinct is to touch every deal a little bit. This is exactly wrong. Research on sales performance reveals:

- **Reps who focus on their top 3 deals** close 34% more revenue than those who spread attention evenly (Gartner Sales Effectiveness Study)
- **Deal win rates drop 50%** when a deal goes 10+ days without meaningful engagement (CSO Insights)
- **Multi-deal task lists** with 8+ items have a 23% completion rate vs. 78% for focused lists of 3-5 items (Asana Work Index)
- The average rep has 12-18 open deals but **only 3-5 are likely to close** in any given period

The Pipeline Focus Task Planner embodies this principle: select the 1-3 deals that deserve your energy right now, then build a single, structured engagement task that ensures deep, productive work on each.

### The Single Engagement Task Concept

Instead of creating 10 scattered tasks ("follow up with Acme," "send proposal to TechFlow," "check in with DataBridge"), this skill produces **one task** with a grouped checklist. Why?

1. **Reduced context-switching**: One task to open, one mental model to hold
2. **Visible progress**: Checking off sub-items within a single task feels rewarding and trackable
3. **Prioritized flow**: The checklist is ordered -- the rep works top to bottom, stopping when time runs out
4. **Clear scope**: The task has a due date and a finite checklist. When it's done, it's done.
5. **CRM cleanliness**: One engagement task per planning period keeps the task list from exploding

### The Alternative (and Why It Fails)
Creating separate tasks per deal sounds logical but causes:
- Task list overwhelm (20+ open tasks = decision paralysis)
- Cherry-picking easy tasks instead of important ones
- Lost context (each task is isolated from the bigger picture)
- Incomplete engagement (rep does 1 thing per deal instead of the full engagement motion)

## Deal Selection Methodology

See `references/deal-selection-rules.md` for the complete scoring model with worked examples, velocity benchmarks by deal size, deal rot thresholds, and special selection scenarios.

### Primary Selection Criteria

Select up to 3 deals using a weighted scoring model:

```
DEAL_FOCUS_SCORE = (Urgency x 0.30) + (Risk x 0.25) + (Value x 0.25) + (Momentum x 0.20)
```

#### Urgency (30% weight) -- Is there a time-sensitive deadline?

| Signal | Score | Rationale |
|--------|-------|-----------|
| Closes this week | 100 | Immediate revenue at stake |
| Closes this month | 70 | Within active selling window |
| Close date passed (overdue) | 90 | Needs immediate stage/date correction |
| Key meeting scheduled this period | 60 | Preparation needed |
| Proposal/contract pending review | 80 | Decision imminent |
| No close date set | 40 | Ambiguity itself is a risk |

#### Risk (25% weight) -- Is the deal in danger?

| Signal | Score | Rationale |
|--------|-------|-----------|
| Health score < 30 | 100 | Critical -- intervention required |
| Health score 30-50 | 75 | At risk -- needs this-week attention |
| Champion went dark (7+ days) | 90 | Single-threaded deal losing its thread |
| Competitor mentioned in last meeting | 70 | Evaluation risk |
| Stakeholder change (new decision-maker) | 65 | Relationship restart needed |
| No activity in 10+ days | 80 | Deal is stalling |

#### Value (25% weight) -- Is it worth the focus?

| Deal Value Relative to Average | Score |
|-------------------------------|-------|
| 3x+ portfolio average | 100 |
| 2-3x average | 75 |
| 1-2x average | 50 |
| Below average | 25 |

#### Momentum (20% weight) -- Can we make progress this period?

| Signal | Score | Rationale |
|--------|-------|-----------|
| Next step is clearly defined | 80 | Actionable engagement possible |
| Stakeholder recently replied | 70 | Engagement window is open |
| Meeting on calendar this period | 90 | Natural touchpoint exists |
| Waiting on external dependency | 20 | Low leverage -- action may be blocked |
| Stage recently advanced | 60 | Positive trajectory to maintain |

### Selection Rules

1. **Always 1-3 deals**: Never 0 (even a clean pipeline has optimization opportunities), never more than 3 (the whole point is focus).
2. **At least 1 high-urgency deal** if any exist (closing soon or at risk).
3. **Diversity of stage**: Avoid selecting 3 deals all at the same stage. Mix stages for varied engagement types.
4. **No deals updated today**: If a deal was already meaningfully engaged today, it does not need focus task attention.
5. **Respect capacity**: If user is "busy," select 1 deal. If "normal," select 2-3. If "available," select 3.

### When You Cannot Select 3

| Scenario | Response |
|----------|----------|
| Fewer than 3 deals in pipeline | Select all. Note: "Small pipeline -- consider prospecting." |
| All deals are healthy and active | Select the 1-2 with the nearest close dates. Focus on acceleration, not rescue. |
| All deals are stale / at risk | Select the top 3 by value. Triage mode -- focus on saving the most revenue. |

## Checklist Design Principles

The checklist is the core deliverable. Each item must be. Consult `references/task-templates.md` for complete task templates by deal stage and activity type, including description templates, duration estimates, success criteria, and checklists.

### Specific
Not: "Follow up with Sarah"
Yes: "Email Sarah Chen the updated pricing sheet with the volume discount she requested on Tuesday's call"

### Actionable
Not: "Think about next steps for TechFlow"
Yes: "Draft 3 discovery questions for Mike Ross focused on their Q2 budget timeline"

### Time-Estimated
Every checklist item includes a time estimate in parentheses. This helps the rep plan their day and know when to stop.

Format: `- [ ] [Action description] (~X min)`

### Ordered by Impact
Within each deal group, checklist items are ordered:
1. The action most likely to advance the deal stage
2. The action that addresses the biggest risk
3. Supportive actions (logging, updating, preparing)

### Outcome-Oriented
Each item should have an implicit "done when" condition. The rep should know exactly when to check the box.

Not: "Work on the Acme proposal"
Yes: "Send the customized Acme proposal PDF to Sarah Chen via email (~15 min)"

## Checklist Structure by Deal

The task description groups checklist items under deal headings:

```
## Deal 1: [Deal Name] ($[Value] - [Stage])
Why now: [One-line rationale]

- [ ] [Primary action -- highest impact] (~X min)
- [ ] [Secondary action -- risk mitigation] (~X min)
- [ ] [Support action -- log/update/prepare] (~X min)

## Deal 2: [Deal Name] ($[Value] - [Stage])
Why now: [One-line rationale]

- [ ] [Primary action] (~X min)
- [ ] [Secondary action] (~X min)
- [ ] [Support action] (~X min)

## Deal 3: [Deal Name] ($[Value] - [Stage])
Why now: [One-line rationale]

- [ ] [Primary action] (~X min)
- [ ] [Secondary action] (~X min)

---
Total estimated time: ~X min
```

### Items Per Deal
- **Critical deal (health < 50 or closing this week)**: 3-4 items
- **High-priority deal**: 2-3 items
- **Monitoring deal**: 1-2 items
- **Never exceed 4 items per deal** -- if more is needed, the deal needs a dedicated session, not a checklist item

### Total Checklist Size
- **Busy capacity**: 3-5 items total across 1 deal
- **Normal capacity**: 6-9 items total across 2-3 deals
- **Available capacity**: 9-12 items total across 3 deals

## Period-Based Planning

The planning period affects deal selection and checklist depth:

### This Week
- Focus on deals closing this week or next
- Checklist items are immediate actions (today/tomorrow)
- Task due date: End of current week (Friday)
- Emphasis: Close, advance, or save deals in the near-term window

### This Month
- Include deals closing this month and next
- Checklist items include multi-step sequences (first contact, follow-up, close)
- Task due date: End of current month or 2 weeks from now (whichever is sooner)
- Emphasis: Stage advancement and pipeline progression

### This Quarter
- Strategic view across the full pipeline
- Checklist items are milestone-oriented (get to Proposal stage, schedule exec meeting)
- Task due date: End of current month (review monthly, not quarterly)
- Emphasis: Pipeline building and long-term positioning

## Capacity Adjustment Rules

| Capacity | Deals Selected | Items Per Deal | Total Items | Task Complexity |
|----------|---------------|---------------|-------------|-----------------|
| **Busy** | 1 | 3-4 | 3-5 | Simple, quick-win actions only |
| **Normal** | 2-3 | 2-3 | 6-9 | Balanced mix of quick and deep actions |
| **Available** | 3 | 3-4 | 9-12 | Include prep work and strategic actions |

**Auto-detection** (when capacity is not specified):
- Check today's meeting count: 5+ = busy, 2-4 = normal, 0-1 = available
- Check open task count: 15+ open = busy, 5-14 = normal, 0-4 = available
- When signals conflict, default to "normal"

## Required Capabilities
- **CRM**: To fetch deal pipeline status, health scores, and activity history

## Inputs
- `pipeline_deals`: Output from `execute_action("get_pipeline_deals", { filter: "closing_soon", period: "this_week", include_health: true, limit: 10 })` -- should include deals and health if available
- `period` (optional): "this_week" | "this_month" | "this_quarter" -- defaults to "this_week"
- `user_capacity` (optional): "busy" | "normal" | "available" -- defaults to "normal"

## Output Contract

Return a SkillResult with:

- `data.task`: The single engagement task
  - `title`: string -- short, action-oriented (e.g., "Pipeline Focus: Engage Top 3 Deals This Week")
  - `description`: string -- includes the full grouped checklist (see Checklist Structure above)
  - `due_date`: ISO date string (default: end of current week / Friday)
  - `priority`: "low" | "medium" | "high" (high if any selected deal is critical)
  - `estimated_minutes`: number -- sum of all checklist item estimates
  - `deal_count`: number -- how many deals are covered

- `data.top_deals`: array of up to 3 selected deals
  - `id`: string
  - `name`: string
  - `value`: number
  - `stage`: string (current deal stage)
  - `health_score`: number | null
  - `days_stale`: number
  - `close_date`: string | null
  - `why_now`: string (one-sentence rationale for selection)
  - `focus_score`: number (0-100, transparency into selection)

- `data.rationale`: string -- 2-3 sentence explanation of why these deals were chosen over others. Include the selection methodology and key signals.

- `data.excluded_deals`: array (optional, for transparency)
  - `name`: string
  - `reason`: string (why not selected, e.g., "healthy and recently engaged" or "blocked by external dependency")

## Rationale Communication

The rationale must explain **why these deals, not those**. Users should understand and trust the selection.

### Good Rationale Example
"Selected Acme Corp ($45K, closing Friday), TechFlow ($28K, champion dark 9 days), and DataBridge ($62K, contract pending). Acme is your nearest close and needs a pricing follow-up before the weekend. TechFlow's champion silence is becoming critical -- re-engagement this week could save a $28K deal. DataBridge has the highest value and a contract review that's been waiting 3 days. Together, these 3 deals represent $135K in pipeline at risk of stalling without this week's engagement."

### Bad Rationale Example
"These are your top 3 deals that need attention." -- This tells the user nothing they did not already know.

### Rationale Structure
1. **Name the deals** with values and key signals
2. **Explain each selection** in one clause
3. **Quantify the aggregate** (total pipeline value at stake)
4. **Connect to the period** (why this week specifically)

## Quality Checklist

Before returning the engagement task, verify:

- [ ] Exactly 1-3 deals selected (never 0, never more than 3)
- [ ] Each deal has a clear `why_now` rationale
- [ ] Checklist items are specific and actionable (pass the colleague test)
- [ ] Every checklist item has a time estimate in parentheses
- [ ] Checklist items are ordered by impact within each deal group
- [ ] Total checklist size matches capacity (busy: 3-5, normal: 6-9, available: 9-12)
- [ ] Task title is action-oriented and mentions the period
- [ ] Task due date aligns with the planning period
- [ ] Rationale explains selection AND exclusion logic
- [ ] No fabricated CRM data -- if a field is unknown, state "unknown"
- [ ] Deal IDs are included for all selected deals
- [ ] The task description is formatted with clear deal group headers
- [ ] Time estimates sum to a realistic total (not exceeding 2-3 hours for normal capacity)

## Error Handling

### Empty pipeline
Return a task focused on pipeline building:
- Title: "Pipeline Building: Prospecting and Outreach"
- Checklist: prospecting actions, old lead re-engagement, network outreach
- Rationale: "No active deals in pipeline. Focus shifts to pipeline generation."
- Do NOT return an empty result -- always provide actionable guidance.

### All deals are healthy and recently engaged
This is a positive signal. Return an acceleration-focused task:
- Select the top 1-2 deals by close date
- Checklist items focus on advancing stage, not rescuing
- Rationale: "Pipeline is healthy. Focus on accelerating your nearest close opportunities."

### No health scores available
Calculate selection using urgency, value, and staleness only (drop the health component and redistribute its 25% weight to urgency and staleness). Note: "Deal health scores unavailable -- selection based on close date, value, and activity recency."

### Single deal in pipeline
Select it. Build a thorough checklist (4-5 items) since all focus goes to one deal. Add a prospecting item at the end: "Identify 2-3 new prospects to diversify pipeline."

### Deals with missing close dates
Penalize in urgency scoring (score 40 instead of higher values) but do not exclude. Add a checklist item: "Confirm close date with [contact] and update CRM."

### Period mismatch (no deals closing in the selected period)
Expand the window. If "this_week" returns no closing deals, look at "this_month." If "this_month" returns none, look at the full pipeline. Note the expansion: "No deals closing this week. Expanded to this month's pipeline."

### Very large pipeline (20+ deals)
Pre-filter to the top 10 by the scoring model before applying the 1-3 selection. Never process more than 10 deals in detail -- it adds latency without improving selection quality.

### Conflicting signals (high value but very stale)
When a deal scores high on value but also very high on staleness (14+ days), it may be dead. Add a diagnostic checklist item first: "Assess deal viability -- send a 'still interested?' check-in before investing more time." If the deal is truly dead, the rep should disqualify it, not work it.
