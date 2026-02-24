# Rep Capacity Assessment and Planning Guide

Methodology for estimating a sales rep's available capacity, detecting overcommitment, and adjusting the focus plan to fit reality. A plan the rep cannot complete is worse than no plan at all.

## Table of Contents
1. [Available Hours Calculation](#available-hours-calculation)
2. [Task Effort Estimation by Type](#task-effort-estimation-by-type)
3. [Overcommitment Detection](#overcommitment-detection)
4. [Buffer Time Guidelines](#buffer-time-guidelines)
5. [The "Not Today" List Methodology](#the-not-today-list-methodology)
6. [Delegation Framework](#delegation-framework)
7. [Deprioritization Criteria](#deprioritization-criteria)
8. [Impact of Overcommitment on Deal Quality](#impact-of-overcommitment-on-deal-quality)
9. [Capacity Templates by Day Type](#capacity-templates-by-day-type)

---

## Available Hours Calculation

The starting point for any focus plan is knowing how much time the rep actually has. This is never 8 hours.

### The Real Available Hours Formula

```
AVAILABLE_HOURS = WORK_DAY - MEETINGS - ADMIN_OVERHEAD - BREAKS - BUFFER

Where:
  WORK_DAY      = 8.0 hours (typical)
  MEETINGS      = sum of all scheduled meeting durations
  ADMIN_OVERHEAD = 1.0 hour (CRM updates, email triage, Slack)
  BREAKS        = 0.75 hours (lunch 30min + 2x 7.5min breaks)
  BUFFER        = 25% of remaining time (for unexpected items)
```

### Worked Example

**Rep's day**: 8 hours total, 3 meetings (30min + 60min + 45min = 2.25 hours)

```
Work day:        8.00 hours
Meetings:       -2.25 hours
Admin overhead: -1.00 hour
Breaks:         -0.75 hours
                --------
Gross available:  4.00 hours
Buffer (25%):   -1.00 hour
                --------
NET AVAILABLE:    3.00 hours = 180 minutes
```

This rep has 180 minutes for focused work. The focus plan must not recommend actions totaling more than 180 minutes.

### Meeting Duration Adjustments

| Meeting Type | Actual Time Cost | Why |
|-------------|-----------------|-----|
| 30-min meeting | 45 minutes | 5 min prep + 30 min meeting + 10 min post-meeting notes |
| 60-min meeting | 80 minutes | 10 min prep + 60 min meeting + 10 min notes |
| Back-to-back meetings | Add 10 min per transition | Context switching between meetings requires mental reset |
| External customer meeting | 1.5x scheduled duration | Higher stakes = more prep and follow-up |

**Rule**: Always calculate meeting time as 1.3x the scheduled duration to account for prep and follow-up. Customer-facing meetings use 1.5x.

---

## Task Effort Estimation by Type

Standard effort estimates for common sales activities. These are calibrated from aggregated time-tracking data across B2B sales organizations.

### Quick Actions (5-15 minutes)

| Task | Estimated Duration | Notes |
|------|-------------------|-------|
| Send a template email (minimal customization) | 5 min | Pre-written, just personalize salutation and 1-2 lines |
| Update a deal stage in CRM | 5 min | Click-through update, no notes required |
| Schedule a meeting (send invite) | 5-10 min | Check availability, compose invite, confirm |
| Log meeting notes (brief) | 10 min | Summary, key takeaways, next step |
| Send a Slack update to team | 5 min | Quick status update on a deal |
| Review and respond to a single email | 10 min | Read, compose, review, send |

### Medium Actions (15-45 minutes)

| Task | Estimated Duration | Notes |
|------|-------------------|-------|
| Personalized email (custom content) | 15-20 min | Research, write, review, personalize |
| Phone call (with prep and logging) | 25-30 min | 5 min prep + 10-15 min call + 10 min logging |
| Meeting prep (review notes, prepare questions) | 15-30 min | Scales with meeting importance and deal complexity |
| Account research | 30-45 min | Review company news, stakeholder map, deal history |
| CRM pipeline review and cleanup | 30 min | Review 10-15 deals, update stages, notes |
| Post-meeting follow-up email (custom) | 20-25 min | Reference specific meeting discussion, action items |

### Deep Actions (45-120 minutes)

| Task | Estimated Duration | Notes |
|------|-------------------|-------|
| Write a custom proposal | 60-120 min | Template + customization + review. Varies by complexity. |
| Discovery call preparation (new prospect) | 45-60 min | Research company, prepare questions, review CRM history |
| Objection response preparation | 30-45 min | Research, draft response, gather proof points |
| Competitive analysis for a specific deal | 45-60 min | Research competitor, build comparison, prepare positioning |
| Pipeline forecast preparation | 45-60 min | Review all deals, update probabilities, prepare summary |
| Strategic account plan | 60-90 min | Stakeholder map, timeline, milestones, risk assessment |

### Effort Estimation Rules

1. **Always round up** to the nearest 5 minutes. Underestimating is the most common planning error.
2. **First-time tasks take 2x longer**. If the rep has never written a proposal for this product, double the estimate.
3. **Complex deals add 30%**. Multi-stakeholder, enterprise deals require more prep at every step.
4. **End-of-quarter adds 20%**. Everything takes longer when pressure is high and stakes are elevated.
5. **After lunch, add 15%**. Post-lunch cognitive dip slows execution (Monk, 2005).

---

## Overcommitment Detection

The focus plan must detect when the rep is overloaded and adjust accordingly. Overcommitted reps do not do more work -- they do lower-quality work on everything.

### Overcommitment Signals

| Signal | Threshold | Action |
|--------|-----------|--------|
| Total action time exceeds available hours | > 125% of available | Trim actions from the bottom of the priority list |
| Open overdue tasks exceed 10 | > 10 overdue | Flag "busy" capacity. Address task debt before new actions. |
| Meetings exceed 5 per day | > 5 meetings | Flag "busy" capacity. Limit actions to 1-2 quick wins. |
| Action list exceeds 8 items | > 8 actions | Hard cap. Remove lowest-priority items regardless. |
| Rep has not completed a task in 3+ days | Task completion = 0 for 3 days | Systemic overload. Reduce to 2-3 critical actions only. |

### Overcommitment Detection Algorithm

```
overcommitment_score = 0

IF total_action_minutes > (available_minutes * 1.25):
  overcommitment_score += 30

IF overdue_tasks > 10:
  overcommitment_score += 25

IF meetings_today > 5:
  overcommitment_score += 20

IF action_count > 8:
  overcommitment_score += 15

IF tasks_completed_last_3_days == 0:
  overcommitment_score += 10

ASSESSMENT:
  0-20:   Normal capacity, no adjustment needed
  21-40:  Moderate overload, trim 1-2 actions
  41-60:  Significant overload, reduce to 3-4 actions + triage note
  61+:    Critical overload, reduce to 1-2 actions + escalation suggestion
```

### Overcommitment Messages

| Score Range | Message |
|------------|---------|
| 0-20 | No message (normal capacity) |
| 21-40 | "Your day is fairly packed. I've trimmed to the actions that fit your available time." |
| 41-60 | "You have more on your plate than can fit today. Focusing on the top 3-4 actions. The rest can wait." |
| 61+ | "You're significantly overloaded. Focus on only the most critical action today. Consider talking to your manager about workload." |

---

## Buffer Time Guidelines

Buffer time is not slack -- it is insurance. Unexpected items arise every day (urgent email, manager pull-aside, fire drill deal). Without buffer, the plan collapses at the first interruption.

### The 25% Buffer Rule

**Allocate 25% of gross available time as buffer.** This means if you have 4 hours of gross available time (after meetings, admin, breaks), only plan for 3 hours of focused actions.

### Why 25%

| Research Finding | Source |
|-----------------|--------|
| Knowledge workers experience an interruption every 11 minutes | Mark et al., 2008, University of California |
| Recovery time per interruption averages 23 minutes | Same study |
| Unplanned work consumes 20-30% of a typical workday | Atlassian, "You Waste a Lot of Time at Work" |
| Plans with no buffer have a 15% completion rate | Buehler et al., 1994 (Planning Fallacy research) |
| Plans with 25-30% buffer have a 65% completion rate | Same research tradition |

### Buffer Allocation by Day Type

| Day Type | Buffer % | Reasoning |
|----------|---------|-----------|
| Monday | 30% | Week kickoff, more unexpected items from weekend backlog |
| Tuesday-Thursday | 25% | Standard buffer |
| Friday | 20% | Fewer new items typically arrive late in the week |
| End of month/quarter | 35% | Chaos increases near financial deadlines |
| Day after PTO | 40% | Catch-up backlog is significant |

---

## The "Not Today" List Methodology

Every focus plan creates two lists: the "do today" list and the "not today" list. The second is as important as the first.

### Why "Not Today" Matters

The Zeigarnik Effect (Zeigarnik, 1927) demonstrates that the human brain holds unfinished tasks in active memory, consuming cognitive bandwidth. The only ways to free this bandwidth are:
1. Complete the task
2. Write it down in a trusted system with a future date

The "not today" list provides option 2. It tells the rep's brain: "This is captured. It has a future. You do not need to hold it."

### "Not Today" List Structure

```
PARKED (not today)
  {task_title} — {reason for parking} — {when it matters}
  {task_title} — {reason} — {when}
  ...
```

### Parking Criteria

An item goes to "not today" when:

| Criteria | Example |
|----------|---------|
| Priority score is below the day's threshold | FinServe research (score 28) -- not critical until next week |
| Item is blocked by external dependency | Waiting on legal review from customer before proceeding |
| Available time cannot accommodate it | Proposal customization needs 90 min; only 30 min available |
| Item is important but not time-sensitive | Competitive analysis for a deal closing next month |
| Item is a recurring task that can batch | CRM cleanup, pipeline review (batch on Friday) |

### Parking Rules

1. **Never park more than 10 items.** If the list exceeds 10, some items need to be delegated or eliminated entirely.
2. **Every parked item must have a "when it matters" date.** This prevents items from living on the not-today list forever.
3. **Review parked items weekly.** If an item has been parked for 3+ consecutive days, it needs a decision: do it, delegate it, or delete it.
4. **Parked items from yesterday get priority re-evaluation today.** They might have escalated overnight.

---

## Delegation Framework

When the rep is overloaded, delegation is a strategy, not a weakness.

### What Sales Reps Can Delegate

| Task | Delegate To | Condition |
|------|-----------|-----------|
| CRM data entry and cleanup | Sales ops / admin | Always delegatable if available |
| Meeting scheduling | Admin or scheduling tool | Always delegatable |
| Research and data gathering | SDR, intern, or AI tool | Delegatable for initial research; rep reviews |
| Internal reporting | Sales ops | Delegatable if format is standardized |
| Template email sends | Sequences/automation | Delegatable if personalization is minimal |
| Proposal formatting | Marketing or proposal tool | Delegatable; rep handles content, delegate handles formatting |

### What Sales Reps Should NEVER Delegate

| Task | Why |
|------|-----|
| Customer-facing communication on active deals | Trust and relationship are non-transferable |
| Negotiation and pricing discussions | Authority and context are rep-specific |
| Strategic account planning | Only the rep knows the deal dynamics deeply enough |
| Objection handling | Real-time judgment and relationship context required |
| Champion relationship building | Personal connection cannot be outsourced |

### Delegation Decision Framework

For each overflowing task, ask:
1. **Does this require MY relationship?** If no, delegate.
2. **Does this require deal-specific judgment?** If no, delegate.
3. **Would a 5-minute brief enable someone else to do this?** If yes, delegate.
4. **Is this task worth MY hourly rate?** If a rep earns $150K/year ($75/hour), spending 30 minutes on a task that a $25/hour admin could do is a $25 misallocation.

---

## Deprioritization Criteria

When the plan must be trimmed, remove items in this order (first removed, last preserved):

### Deprioritization Hierarchy (Remove First to Last)

| Priority | Category | Remove When | Example |
|----------|----------|------------|---------|
| 1 (remove first) | Administrative tasks | Always first to go | CRM updates, internal reports |
| 2 | Nurture activities | When capacity is tight | Check-in emails on healthy deals |
| 3 | Prospecting | When today is packed | New outreach can always wait 1 day |
| 4 | Deal research | When action is clear without it | Additional competitive analysis |
| 5 | Meeting prep for internal meetings | When external meetings compete | Manager 1:1 prep is lower priority than customer prep |
| 6 (remove last) | Customer-facing deal actions | Only in extreme overload | Follow-ups, proposals, customer calls |

### Hard Floor

**Never trim below 1 customer-facing action per day.** A day with zero customer interaction is a lost selling day. Even on the busiest days, one customer touchpoint must remain.

---

## Impact of Overcommitment on Deal Quality

Overcommitment does not just reduce task completion -- it degrades the quality of every interaction.

### Research on Overcommitment Effects

| Finding | Source | Impact on Sales |
|---------|--------|-----------------|
| Cognitive overload reduces negotiation effectiveness by 30% | Malhotra & Bazerman, 2007, "Negotiation Genius" | Overloaded reps leave money on the table |
| Rushed proposals have 25% lower close rates | Proposify, 2024 (2.6M proposals) | Speed matters, but quality matters more |
| Reps handling 15+ active deals close 20% less than those with 10 | Gartner Sales Effectiveness Study | Pipeline breadth hurts depth of engagement |
| Stressed reps miss buying signals 40% more often | RAIN Group, "Benchmark Report on Sales Performance" | Overcommitment literally makes reps worse at their job |
| Multi-deal context switching costs 23 min per switch | Mark et al., 2008 | 5 deal switches per day = 2 hours lost to transitions |

### The Overcommitment Spiral

```
Too many deals -> shallow engagement on each -> deals stall ->
more deals added to compensate -> even shallower engagement ->
more deals stall -> quota missed

vs.

Focused pipeline -> deep engagement on top deals -> deals advance ->
pipeline velocity increases -> same quota hit with fewer deals ->
time freed for strategic prospecting -> healthier pipeline
```

The focus plan breaks the overcommitment spiral by limiting daily actions to what can actually be done well.

---

## Capacity Templates by Day Type

Pre-built capacity profiles for common day patterns.

### Light Day (0-1 meetings)

```
Available: 5-6 hours of focused time
Capacity: "Available"
Actions: 5-8 (full action set)
Task pack: 3-5 tasks
Best for: Deep work -- proposals, strategic planning, prospecting blocks
```

### Standard Day (2-4 meetings)

```
Available: 2.5-4 hours of focused time
Capacity: "Normal"
Actions: 3-5 (balanced action set)
Task pack: 3 tasks
Best for: Mixed execution -- morning deep work, afternoon meetings
```

### Heavy Day (5+ meetings)

```
Available: 0.5-1.5 hours of focused time
Capacity: "Busy"
Actions: 1-2 (critical only)
Task pack: 1 task
Best for: Meeting execution -- prep, perform, follow up. Defer non-meeting work.
```

### Travel Day

```
Available: 1-2 hours (airport/hotel gaps)
Capacity: "Busy"
Actions: 1-2 (mobile-friendly only)
Task pack: 1 task
Best for: Email, short calls, reading. No deep work -- save it for tomorrow.
```

### Monday After PTO

```
Available: 2-3 hours (after catch-up)
Capacity: "Busy" (even if calendar is light)
Actions: 2-3 (triage + top priority)
Task pack: 2 tasks
Best for: Triage inbox, review pipeline changes, execute most urgent action. Full plan resumes tomorrow.
```
