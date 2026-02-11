# Priority Scoring Rules for Daily Briefings

Data-backed priority scoring methodology for selecting which deals, contacts, meetings, and tasks appear in the daily briefing. Every scoring rule is grounded in sales performance research.

## Table of Contents
1. [Deal Priority Scoring](#deal-priority-scoring)
2. [Meeting Priority Hierarchy](#meeting-priority-hierarchy)
3. [Task Priority — Eisenhower for Sales](#task-priority--eisenhower-for-sales)
4. [Contact Attention Scoring](#contact-attention-scoring)
5. [Time-of-Day Psychology](#time-of-day-psychology)
6. [Data-Backed Priority Research](#data-backed-priority-research)
7. [Edge Cases and Tiebreakers](#edge-cases-and-tiebreakers)

---

## Deal Priority Scoring

Deals are scored on a 0-100 scale using six weighted signals. Only the top 3-5 deals appear in the briefing.

### Scoring Model

| Signal | Weight | Score Range | Rationale |
|--------|--------|-------------|-----------|
| Closes this week | +40 | 0 or 40 | Urgency drives action. Nearest-close deals have highest revenue risk. |
| Health score < 60 | +30 | 0-30 (scaled) | At-risk deals need intervention before they die silently. |
| No activity in 7+ days | +25 | 0-25 (scaled) | Stale deals are the #2 reason for missed quota (CSO Insights). |
| Value > 2x average deal | +20 | 0-20 (scaled) | High-value deals justify disproportionate attention. |
| Stage = Negotiation/Proposal | +15 | 0 or 15 | Late-stage deals are closest to revenue. Every day matters. |
| Champion went dark | +35 | 0 or 35 | Losing your champion is the #1 deal killer (Gong). |

### Scoring Details

**Close Date Urgency (max +40)**
```
Closes today or overdue:  +40
Closes this week:         +35
Closes next week:         +25
Closes this month:        +15
Closes next month+:       +5
No close date set:        +10 (penalized for missing data)
```

**Health Score Risk (max +30)**
```
Health 0-30:    +30  (critical)
Health 31-50:   +25  (at risk)
Health 51-60:   +15  (warning)
Health 61-80:   +5   (healthy)
Health 81-100:  +0   (strong)
No health data: +15  (assume moderate risk)
```

**Staleness (max +25)**
```
14+ days no activity:  +25
10-13 days:            +20
7-9 days:              +15
4-6 days:              +5
0-3 days:              +0
```

**Value Weight (max +20)**
```
3x+ average deal:      +20
2-3x average:          +15
1-2x average:          +10
Below average:          +5
Unknown value:          +8
```

**Stage Proximity (max +15)**
```
Negotiation/Contract:   +15
Proposal sent:          +12
Demo/Evaluation:        +8
Qualified:              +5
Discovery:              +2
```

**Champion Status (max +35)**
```
Champion dark 10+ days: +35
Champion dark 7-9 days: +25
Champion dark 4-6 days: +10
Champion active:        +0
No champion identified: +15 (ambiguity is risk)
```

### Selection Rules

1. **Show 3-5 deals maximum.** More than 5 creates decision paralysis. Research on cognitive load (Miller, 1956) shows working memory holds 7 plus or minus 2 items; for a briefing that competes with other sections, 5 is the safe ceiling.
2. **Always include at least 1 closing-soon deal** if any exist. The rep must be aware of near-term revenue on the line.
3. **If fewer than 3 deals qualify, do not pad.** Padding with low-priority deals dilutes the signal. Show what matters.
4. **Skip deals updated in the last 24 hours** unless they have a meeting today. Recently-touched deals do not need re-surfacing; they are already top-of-mind.
5. **Cap any single signal at its maximum.** No signal can exceed its weight even if multiple sub-conditions apply.

### Worked Scoring Example

| Deal | Close Week | Health | Stale Days | Value vs Avg | Stage | Champion | Total |
|------|-----------|--------|-----------|-------------|-------|----------|-------|
| Acme Corp $95K | +40 (this week) | +15 (score 55) | +0 (2 days) | +15 (2.5x) | +15 (Negotiation) | +0 (active) | **85** |
| DataBridge $54K | +15 (this month) | +25 (score 42) | +20 (11 days) | +10 (1.4x) | +12 (Proposal) | +25 (dark 8d) | **107 -> cap 100** |
| NovaTech $38K | +25 (next week) | +5 (score 72) | +0 (1 day) | +5 (below avg) | +8 (Demo) | +0 (active) | **43** |
| FinServe $28K | +5 (next month) | +30 (score 28) | +25 (16 days) | +5 (below avg) | +5 (Qualified) | +35 (dark 16d) | **105 -> cap 100** |

**Selection**: DataBridge (100), FinServe (100), Acme (85), NovaTech (43). Show top 4 since all are meaningful.

---

## Meeting Priority Hierarchy

Not all meetings are equal. When the schedule is overwhelming (10+ meetings), the briefing must prioritize which meetings get the most context.

### Meeting Priority Tiers

| Tier | Meeting Type | Priority Score | Briefing Treatment |
|------|-------------|---------------|-------------------|
| 1 - Critical | Customer meeting (linked to closing deal) | 100 | Full detail: time, attendee, deal, value, stage, prep note |
| 2 - High | Prospect meeting (discovery, demo, evaluation) | 80 | Full detail with prep note |
| 3 - Medium | Internal deal review / pipeline review | 50 | Time and title only |
| 4 - Standard | Team standup, 1:1 with manager | 30 | Time and title only |
| 5 - Low | All-hands, training, social | 10 | Time and title only; omit if schedule is packed |

### Meeting Priority Scoring Factors

| Factor | Score Impact |
|--------|-------------|
| Meeting linked to a deal | +30 |
| Deal closing this week | +25 |
| External attendees present | +20 |
| Meeting is a demo or presentation | +15 |
| Meeting has 3+ attendees | +10 |
| Meeting is recurring (standup, etc.) | -10 |
| Meeting is internal only | -15 |

### Overflow Handling (10+ Meetings)

When a rep has more than 10 meetings, the briefing becomes unwieldy. Apply these rules:

1. **Show all Tier 1 and Tier 2 meetings individually** (always, regardless of count).
2. **Group Tier 3-5 meetings** as a summary: "Plus 6 internal meetings" with a link to the full calendar.
3. **Never hide a customer-facing meeting.** The rep must know about every external interaction.
4. **If 10+ meetings are all customer-facing**, show the top 5 by deal value and summarize the rest: "Plus 5 more customer meetings -- see full schedule."

---

## Task Priority -- Eisenhower for Sales

The Eisenhower Matrix, adapted for sales reps. Every task maps to one of four quadrants, and the briefing shows them in strict order.

### Sales Eisenhower Matrix

| | Urgent | Not Urgent |
|---|--------|-----------|
| **Important** | Q1: DO FIRST -- Closing activities, customer escalations, overdue follow-ups on active deals | Q2: SCHEDULE -- Prospecting, relationship nurturing, pipeline building, proposal preparation |
| **Not Important** | Q3: DELEGATE -- CRM updates, internal reporting, non-deal admin | Q4: ELIMINATE -- Low-value busywork, premature optimization, meetings without purpose |

### Task Priority Assignment

| Task Type | Quadrant | Priority Label | Briefing Treatment |
|-----------|----------|---------------|-------------------|
| Overdue follow-up on closing deal | Q1 | Critical | `[!]` prefix, shown first |
| Contract or proposal due today | Q1 | Critical | `[!]` prefix |
| Meeting prep for today's meeting | Q1 | High | `[ ]` prefix, shown second |
| Follow-up email from yesterday's meeting | Q1 | High | `[ ]` prefix |
| Discovery call prep for this week | Q2 | Medium | `[ ]` prefix, shown third |
| Update CRM records | Q3 | Low | `[ ]` prefix, shown last |
| Prospecting outreach | Q2 | Medium | `[ ]` prefix |
| Internal reporting | Q3 | Low | Omit from briefing if section is full |

### Urgency Escalation Rules

Tasks escalate in urgency based on time pressure:

| Condition | Escalation |
|-----------|-----------|
| Task overdue by 1+ days | Automatically Q1 (Critical) regardless of original priority |
| Task due today AND linked to a meeting today | Automatically Q1 (High minimum) |
| Task due today, no deal linkage | Stays at assigned priority |
| Task due tomorrow | Lower by 1 tier vs. if due today |

---

## Contact Attention Scoring

Contacts surface in the briefing when they need follow-up. The threshold varies by deal stage because silence means different things at different stages.

### Stage-Adjusted Silence Thresholds

| Deal Stage | Days Without Contact Before Alert | Risk Level | Reasoning |
|------------|----------------------------------|------------|-----------|
| Discovery / Qualification | 10 days | Medium | Early stages have natural gaps between touches |
| Demo / Evaluation | 7 days | High | Active evaluation requires regular engagement |
| Proposal / Negotiation | 5 days | Critical | Late-stage silence often means competitive evaluation |
| Closed Won (post-sale) | 14 days | Low | Relationship maintenance, not deal progression |
| No active deal | 21 days | Low | Nurture cadence, not urgency |

### Special Escalation Rules

| Condition | Threshold Override |
|-----------|--------------------|
| Contact is identified champion on a deal closing this month | 3 days |
| Contact is economic buyer on a deal closing this week | 2 days |
| Contact recently changed roles or companies | 5 days (re-engagement window) |
| Contact was in a meeting this week | Suppress alert (recently engaged) |

### Contact Priority Score

```
CONTACT_PRIORITY = (Days_Over_Threshold x 10) + (Deal_Value_Weight x 0.3) + (Role_Weight x 0.2)
```

| Role | Role Weight |
|------|------------|
| Economic Buyer / Decision Maker | 100 |
| Champion / Internal Sponsor | 90 |
| Technical Evaluator | 60 |
| End User / Influencer | 40 |
| Unknown role | 50 |

---

## Time-of-Day Psychology

The briefing is not just content -- it is timing. Research on circadian rhythms and cognitive performance explains why each mode has a different focus.

### Why Morning Briefs Focus on Energy and Structure

- **Peak cognitive performance occurs in the first 2-4 hours after waking** (Valdez, 2019, Chronobiology International). Morning is when the brain is best at planning, organizing, and making decisions.
- **Willpower is a depletable resource** (Baumeister, "Ego Depletion" research). Decisions made in the morning are higher quality than those made in the afternoon.
- **Reps who plan their day before their first meeting are 21% more productive** (Harvard Business Review, "Planning Your Day" study). The morning brief exists to replace 30 minutes of tool-hopping with a 30-second scan.
- **The "fresh start effect"** (Milkman et al., 2014, Management Science): People are more motivated to pursue goals at temporal landmarks -- Monday mornings, the start of a new month, the morning of a new day. The morning brief capitalizes on this natural motivation spike.

### Why Afternoon Briefs Focus on Momentum

- **Post-lunch cognitive dip** is real and measurable (Monk, 2005, Journal of Sleep Research). Alertness drops 10-20% between 1-3pm.
- **The Progress Principle** (Amabile & Kramer, 2011): The single most important factor in sustaining motivation is a sense of progress. The afternoon brief opens with "what you've accomplished" specifically to trigger this effect.
- **Context-switching costs the average knowledge worker 23 minutes per switch** (Mark et al., 2008, Proceedings of CHI). The afternoon brief reduces switching by consolidating all remaining priorities into one view.
- **Afternoon is the best time for re-prioritization** because new information has arrived (emails, meeting outcomes, deal updates). The brief should reflect this updated reality.

### Why Evening Briefs Focus on Preparation

- **Reps who plan their next day the evening before are 21% more productive** (Harvard Business Review). Evening planning enables the morning to be execution-focused rather than planning-focused.
- **The Zeigarnik Effect** (Zeigarnik, 1927): Unfinished tasks occupy mental bandwidth. By explicitly labeling items as "not tonight -- tomorrow," the evening brief gives the brain permission to detach.
- **Sleep consolidates learning and planning** (Walker, 2017, "Why We Sleep"). A quick tomorrow preview before bed primes the subconscious to process and prepare.
- **Ending on wins protects motivation**. The evening brief always leads with positive signals because the last information processed before sleep disproportionately affects next-day mindset (Bono et al., 2013, Journal of Applied Psychology).

---

## Data-Backed Priority Research

### Why These Weights Matter

| Research Finding | Source | Application |
|-----------------|--------|------------|
| Deals without activity for 14+ days close at 50% lower rates | CSO Insights, 2023 | High staleness weight (+25) |
| 41% of selling time is spent on non-revenue activities | Salesforce State of Sales, 2024 | Task priority filtering eliminates low-value items |
| Reps check 4-6 tools each morning, wasting 30-45 minutes | Salesforce State of Sales, 2024 | The briefing replaces multi-tool scanning |
| Champions going dark is the #1 predictor of deal loss | Gong.io analysis of 1M+ calls | Champion dark signal carries +35 weight |
| Deals with 3+ stakeholder contacts win 25% more often | Gong.io | Multi-threaded deals are healthier |
| Reps who plan their day are 27% more productive | Harvard Business Review | Morning brief = structured daily plan |
| Top reps spend 33% less time on low-value activities | Gartner Sales Effectiveness | Priority scoring eliminates noise |
| Decision fatigue costs 2.5 hours per day in overhead | McKinsey, "The Future of Sales" | The briefing makes decisions for the rep |

### The Cost of Getting Priority Wrong

Showing the wrong deals in a briefing has a measurable cost:

| Error | Cost |
|-------|------|
| Showing a healthy deal instead of an at-risk one | At-risk deal gets another day of neglect; 50% close rate drop per week of inaction |
| Showing 8+ deals instead of 3-5 | Decision paralysis; rep either works nothing or picks randomly |
| Omitting a closing-soon deal | Missed close date; deal slips to next month (avg 30% value erosion) |
| Showing a deal updated yesterday | Wasted attention; the rep already knows about it |

---

## Edge Cases and Tiebreakers

### When Scores Are Equal

When two or more deals have the same priority score, apply tiebreakers in order:

1. **Nearest close date wins.** Revenue at risk takes precedence.
2. **Highest deal value wins.** If close dates are equal, protect the bigger number.
3. **Longest stale period wins.** If value is also equal, the most neglected deal gets attention.
4. **Most recent negative signal wins.** A deal where the champion just went dark outranks one that has been stale for weeks (the fresh problem is more actionable).

### When All Deals Are Healthy

If no deal scores above 40, the pipeline is in good shape. The briefing should:
- Show the 2-3 deals with nearest close dates (acceleration focus)
- Replace the "alert" column with an "opportunity" note: "On track -- accelerate close" or "Strong -- consider upsell"
- Add a prospecting nudge: "Pipeline is healthy. Good day for building new pipeline."

### When All Deals Are Critical

If more than 5 deals score above 80, the rep is in triage mode. The briefing should:
- Show top 5 by score (hard cap, no exceptions)
- Add a triage note: "Multiple deals need attention. Focus on the top 3 today."
- Suggest an internal escalation: "Consider looping in your manager for deal support."

### Seasonal Adjustments

| Period | Adjustment |
|--------|-----------|
| End of quarter (last 2 weeks) | Close-date urgency weight increases from 0.35 to 0.50 |
| January / post-holiday | Staleness thresholds increase by 3 days (holiday lag is normal) |
| Summer months | Staleness thresholds increase by 2 days (vacation lag is normal) |
| End of fiscal year | All closing deals get +10 bonus regardless of timeline |
