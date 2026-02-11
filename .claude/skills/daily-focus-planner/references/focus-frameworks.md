# Focus Planning Frameworks

Frameworks, scoring models, and cognitive science research that power the Daily Focus Planner. This document is the knowledge base for prioritization methodology, time blocking, and the science of focus in sales.

## Table of Contents
1. [CVHS Scoring Model — Deep Dive](#cvhs-scoring-model--deep-dive)
2. [The "One Thing" Principle for Sales](#the-one-thing-principle-for-sales)
3. [Deep Work vs. Shallow Work in Sales](#deep-work-vs-shallow-work-in-sales)
4. [Time Blocking Templates](#time-blocking-templates)
5. [Cognitive Load Research](#cognitive-load-research)
6. [The Pareto Principle in Sales](#the-pareto-principle-in-sales)
7. [Decision Fatigue and Switching Costs](#decision-fatigue-and-switching-costs)
8. [Capacity Estimation Methodology](#capacity-estimation-methodology)

---

## CVHS Scoring Model -- Deep Dive

The CVHS score (Close date, Value, Health, Staleness) is a composite priority score from 0 to 100. It determines which deals and actions deserve the rep's time today.

### Formula

```
PRIORITY_SCORE = (Close_Urgency x 0.35) + (Value_Weight x 0.25) + (Health_Risk x 0.25) + (Staleness x 0.15)
```

### Why These Weights

| Factor | Weight | Research Backing |
|--------|--------|-----------------|
| Close Urgency | 35% | Nearest-revenue actions have highest expected value. Slipping a close date costs 30% deal value on average (Gartner). |
| Value Weight | 25% | Not all deals are equal. A $100K deal at 50% probability is worth more attention than a $10K deal at 90%. |
| Health Risk | 25% | At-risk deals respond to intervention -- but only if caught early. Deals below health score 30 that receive intervention within 7 days recover 45% of the time vs. 12% without (CSO Insights). |
| Staleness | 15% | Lower weight because staleness is a lagging indicator -- the damage is already happening. But it catches deals that slip through the other signals. |

### Worked Example: Scoring 4 Deals

**Context**: Average deal size for this rep is $40K.

**Deal A: Acme Corp ($95K, Negotiation, Health: 55, Last activity: 2 days, Closes: this week)**
```
Close Urgency: 85/100 x 0.35 = 29.75
Value Weight:  80/100 x 0.25 = 20.00  (2.4x average)
Health Risk:   50/100 x 0.25 = 12.50  (score 55 = moderate)
Staleness:      5/100 x 0.15 =  0.75  (2 days = fresh)
TOTAL = 63.0
```

**Deal B: DataBridge ($54K, Proposal, Health: 42, Last activity: 11 days, Closes: this month)**
```
Close Urgency: 40/100 x 0.35 = 14.00
Value Weight:  50/100 x 0.25 = 12.50  (1.35x average)
Health Risk:   80/100 x 0.25 = 20.00  (score 42 = at risk)
Staleness:     80/100 x 0.15 = 12.00  (11 days)
TOTAL = 58.5
```

**Deal C: FinServe ($28K, Qualified, Health: 28, Last activity: 16 days, Closes: next month)**
```
Close Urgency: 15/100 x 0.35 =  5.25
Value Weight:  25/100 x 0.25 =  6.25  (below average)
Health Risk:  100/100 x 0.25 = 25.00  (score 28 = critical)
Staleness:    100/100 x 0.15 = 15.00  (16 days)
TOTAL = 51.5
```

**Deal D: NovaTech ($38K, Demo, Health: 72, Last activity: 1 day, Closes: next week)**
```
Close Urgency: 60/100 x 0.35 = 21.00
Value Weight:  50/100 x 0.25 = 12.50  (roughly average)
Health Risk:   20/100 x 0.25 =  5.00  (score 72 = healthy)
Staleness:      5/100 x 0.15 =  0.75  (1 day = fresh)
TOTAL = 39.25
```

**Ranking**: Acme (63.0) > DataBridge (58.5) > FinServe (51.5) > NovaTech (39.25)

**Insight**: Even though NovaTech closes sooner than FinServe, FinServe ranks higher because its critical health score and extreme staleness signal imminent loss. The focus plan would recommend saving FinServe before polishing NovaTech.

### When to Override CVHS

The score is a guide, not a law. Override when:

| Scenario | Override |
|----------|---------|
| Rep has a meeting with a lower-scored deal today | Elevate that deal (meeting prep is always high priority) |
| A deal just received a negative signal (champion left) | Manually set to critical regardless of score |
| The "one thing" is not the highest scorer | Acceptable if the top scorer is blocked (waiting on external dependency) |
| All deals score below 30 | Pipeline is healthy; shift to acceleration and prospecting |

---

## The "One Thing" Principle for Sales

Adapted from Gary Keller's "The ONE Thing" (2013): "What's the ONE thing I can do such that by doing it, everything else will be easier or unnecessary?"

### Application to Sales

The focus plan always identifies one headline action. This is not the most urgent task -- it is the highest-leverage task.

### "One Thing" Selection Criteria

The "one thing" must pass ALL four gates:

| Gate | Requirement | Why |
|------|------------|-----|
| 1. Completable today | Can be finished in a single sitting, under 30 minutes | An unfinished "one thing" creates anxiety, not progress |
| 2. Highest CVHS score | Among completable-today actions, has the highest priority score | Ensures focus is on highest-impact work |
| 3. Concrete next step | Verb + target + content + context. Not "research" or "think about" | Vague actions do not get done |
| 4. Moves a deal forward | Directly advances a deal stage, unblocks a decision, or re-engages a champion | Administrative tasks are never the "one thing" |

### "One Thing" by Scenario

| Pipeline State | "One Thing" Pattern |
|---------------|-------------------|
| Deal closing this week | "Send the contract / follow up on the unsigned contract" |
| Champion went dark | "Call/email the champion with a specific, value-driven re-engagement" |
| Demo went well yesterday | "Send proposal while momentum is hot" |
| Pipeline is healthy | "Book 2 new discovery calls to build next quarter's pipeline" |
| All deals blocked | "Identify and contact a new stakeholder to unblock the top deal" |
| Pipeline is empty | "Execute 1 hour of structured prospecting" |

### The Focusing Question Framework

For each deal in the pipeline, ask: "What is the ONE thing I can do for this deal today such that by doing it, this deal becomes easier to close?"

This reframes action selection from "what's overdue" to "what's highest leverage." Often these are different things.

---

## Deep Work vs. Shallow Work in Sales

Adapted from Cal Newport's "Deep Work" (2016). In sales, deep work is revenue-generating; shallow work is maintenance.

### Classification Framework

| Category | Deep Work (Revenue-Generating) | Shallow Work (Maintenance) |
|----------|-------------------------------|---------------------------|
| Definition | Activities that require concentration and directly create value | Logistical or administrative tasks that are necessary but not differentiating |
| Sales examples | Discovery calls, proposal writing, negotiation prep, strategic account planning, personalized outreach | CRM updates, internal reporting, meeting scheduling, template emails, pipeline data entry |
| Time requirement | 60-120 minute uninterrupted blocks | 5-15 minute blocks, interruptible |
| Cognitive cost | High (creative, strategic thinking) | Low (procedural, repetitive) |
| Revenue impact | Direct (moves deals forward) | Indirect (enables future work) |

### The Deep Work Ratio for Sales Reps

Research from Salesforce State of Sales (2024) shows that reps spend only 28% of their time on actual selling activities. Top performers invert this ratio:

| Performance Tier | Deep Work % | Shallow Work % | Revenue Index |
|-----------------|-------------|----------------|--------------|
| Bottom 25% | 20% | 80% | 0.6x |
| Average | 28% | 72% | 1.0x |
| Top 25% | 45% | 55% | 1.8x |
| Top 5% | 55%+ | 45% | 2.5x+ |

**The focus plan's job**: Ensure the rep's day is structured to maximize deep work time. Every shallow task that can be batched, delegated, or eliminated should be.

### Deep Work Activity Prioritization

| Activity | Deep Work Score | Revenue Distance | Priority |
|----------|---------------|------------------|----------|
| Live customer call (discovery, demo, negotiation) | 100 | Direct | Always first |
| Personalized proposal or email drafting | 90 | 1 step removed | High |
| Account research and strategic planning | 80 | 2 steps removed | High (but schedule, don't improvise) |
| Prospecting outreach (personalized) | 75 | 2 steps removed | Medium-High |
| Internal deal strategy session | 60 | 2 steps removed | Medium (if linked to specific deal) |
| CRM updates | 20 | 3+ steps removed | Low (batch at end of day) |
| Internal reporting | 15 | 3+ steps removed | Low (batch weekly) |
| Template email sends | 10 | 3+ steps removed | Low (automate if possible) |

---

## Time Blocking Templates

Structured time blocks that protect deep work and batch shallow work.

### The 2-Hour Morning Block

The most productive block of the day. Protect it from meetings when possible.

```
MORNING POWER BLOCK (8:00 - 10:00)

08:00 - 08:15  Review focus plan, set intention for the "one thing"
08:15 - 09:00  Execute the "one thing" (highest-leverage action)
09:00 - 09:45  Execute action #2 (proposal, email, or prep)
09:45 - 10:00  Quick CRM updates from morning actions
```

**Why 2 hours**: Research on ultradian rhythms (Peretz Lavie, 1985) shows that peak cognitive performance runs in 90-120 minute cycles. The morning block captures the first and strongest cycle.

### The 90-Minute Focus Sprint

For reps with mid-morning or afternoon availability between meetings.

```
FOCUS SPRINT (90 min)

00:00 - 00:05  Set sprint goal (1-2 specific outcomes)
00:05 - 00:50  Deep work session 1 (proposal, research, personalized outreach)
00:50 - 01:00  Break (stand up, water, reset)
01:00 - 01:25  Deep work session 2 (second action or continuation)
01:25 - 01:30  Log outcomes, update CRM, set next action
```

**Based on**: The Pomodoro Technique (Francesco Cirillo, 1987), adapted for sales activity length. Standard 25-minute Pomodoros are too short for proposal writing or account research.

### The End-of-Day Batch

All shallow work batched into one block at the end of the day, when cognitive energy is lowest.

```
EOD BATCH (4:30 - 5:30)

4:30 - 4:45  CRM updates for all deals touched today
4:45 - 5:00  Send any template/batch emails
5:00 - 5:15  Review tomorrow's calendar, set tomorrow's "one thing"
5:15 - 5:30  Internal updates (Slack, reports, admin)
```

**Why end of day**: Shallow work does not require peak cognitive performance. Batching it prevents it from fragmenting the high-energy hours.

### Meeting Day Template

When the day is meeting-heavy (5+ meetings), time blocks shrink to fit the gaps.

```
MEETING-HEAVY DAY

Between meetings:  15-min micro-actions only (quick email, CRM update, Slack reply)
Largest gap:       Use for the "one thing" if gap > 30 min
Pre-meeting:       5 min prep (review notes, set goal for the meeting)
Post-meeting:      5 min capture (log notes, set follow-up action)
EOD:               30 min batch (CRM, admin, tomorrow prep)
```

---

## Cognitive Load Research

The science behind why fewer priorities lead to better outcomes.

### Decision Fatigue Data

| Finding | Source | Application |
|---------|--------|------------|
| Judges grant parole 65% of the time in morning, 10% by afternoon | Danziger et al., 2011, PNAS | Schedule important deal decisions in the morning |
| Average knowledge worker makes 35,000 decisions per day | Sahakian & Labuzetta, 2013, "Bad Moves" | Every decision the focus plan eliminates saves cognitive energy |
| Decision quality drops 40% after 3+ hours of continuous decisions | Baumeister et al., 2008, Journal of Personality and Social Psychology | Limit focus plan to 5-8 actions; more = decision paralysis |
| Willpower is a depletable resource with a biological basis (glucose) | Gailliot et al., 2007, Journal of Personality and Social Psychology | Front-load high-stakes actions in the morning |

### Context-Switching Costs

| Finding | Source | Application |
|---------|--------|------------|
| Average switching cost: 23 minutes to regain focus | Mark et al., 2008, Proceedings of CHI | Group related actions together; don't intersperse |
| Interruptions increase error rate by 50% | Altmann et al., 2014, Journal of Experimental Psychology | Protect deep work blocks from notifications |
| Multitasking reduces productivity by 40% | American Psychological Association, 2006 | One action at a time, completed before moving to next |
| The average rep switches tools 10x per hour | Salesforce State of Sales, 2024 | The focus plan is one view, not 10 tools |

### Working Memory Limits

| Finding | Source | Application |
|---------|--------|------------|
| Working memory holds 7 plus or minus 2 items | Miller, 1956, Psychological Review | Never exceed 8 actions in the focus plan |
| Chunking improves recall by 3-4x | Gobet et al., 2001, Trends in Cognitive Sciences | Group actions by deal, not by type |
| Written lists free working memory for execution | Masicampo & Baumeister, 2011, Journal of Personality and Social Psychology | The focus plan is a written list; the rep stops holding it in their head |

---

## The Pareto Principle in Sales

The 80/20 rule, applied to sales activity selection.

### Core Data

| Finding | Implication |
|---------|------------|
| 20% of deals generate 80% of revenue (Pareto) | Focus disproportionately on top-value deals |
| 20% of activities drive 80% of pipeline movement | Identify and prioritize high-leverage activities |
| 80% of a rep's revenue comes from 30% of their accounts (Bain & Company) | Allocate time by account revenue potential, not equally |
| Top reps spend 50% of their time on just 3-5 deals (Gartner) | The focus plan's 3-5 deal limit is Pareto-aligned |

### Activity Pareto Analysis

| Activity | Time Spent | Revenue Contribution | Pareto Status |
|----------|-----------|---------------------|--------------|
| Personalized customer calls | 15% | 35% | HIGH LEVERAGE -- increase |
| Proposal writing and customization | 10% | 25% | HIGH LEVERAGE -- protect |
| CRM data entry | 20% | 2% | LOW LEVERAGE -- batch/automate |
| Internal meetings | 15% | 5% | LOW LEVERAGE -- minimize |
| Email (non-customer) | 12% | 3% | LOW LEVERAGE -- batch |
| Prospecting outreach | 12% | 20% | MODERATE LEVERAGE -- maintain |
| Meeting prep | 8% | 8% | MODERATE LEVERAGE -- maintain |
| Administrative tasks | 8% | 2% | LOW LEVERAGE -- batch/eliminate |

**Focus plan rule**: At least 60% of recommended actions should be in the "HIGH LEVERAGE" or "MODERATE LEVERAGE" categories. If the plan is dominated by CRM updates and admin, it is not a focus plan -- it is a to-do list.

---

## Decision Fatigue and Switching Costs

### The Decision Elimination Model

The focus plan's primary value is not telling the rep what to do -- it is telling them what NOT to decide. Every decision the plan makes for the rep is cognitive energy preserved for selling.

| Decision Eliminated | Saved Cognitive Cost | How the Plan Eliminates It |
|--------------------|---------------------|---------------------------|
| "Which deal should I work on?" | 10-15 min of deliberation | CVHS score ranks deals automatically |
| "What should I do for this deal?" | 5-10 min per deal | Concrete actions with verb + target + context |
| "How long will this take?" | 5 min of estimation | Time estimates on every action |
| "Am I doing enough?" | Ongoing anxiety | Capacity assessment validates the plan fits the day |
| "What about all the other stuff?" | Background cognitive load | The "not today" list explicitly parks low-priority items |

### The "Not Today" Methodology

Items that do not make the focus plan are not forgotten -- they are explicitly parked. This is critical for the Zeigarnik Effect: unfinished tasks occupy mental bandwidth until they are either completed or explicitly captured in a system.

The focus plan should include a brief "parked for later" section:
```
PARKED (not today)
  - FinServe pilot follow-up (not urgent until next week)
  - Update Q2 forecast (due Friday, not today)
  - Research BrightPath competitors (nice-to-have, not critical path)
```

This gives the brain permission to stop worrying about those items.
