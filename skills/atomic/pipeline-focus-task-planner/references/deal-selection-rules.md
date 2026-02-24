# Deal Selection and Prioritization Methodology

Complete methodology for selecting which deals deserve focused engagement from a pipeline of 10-30 active opportunities. Includes the 4-factor scoring model, selection matrices, velocity benchmarks, and worked examples.

## Table of Contents
1. [The 4-Factor Scoring Model](#the-4-factor-scoring-model)
2. [Selection Matrix — Worked Examples](#selection-matrix--worked-examples)
3. [The "Ignore the Shiny Object" Rule](#the-ignore-the-shiny-object-rule)
4. [Stage-Appropriate Engagement Patterns](#stage-appropriate-engagement-patterns)
5. [Velocity Benchmarks by Deal Size](#velocity-benchmarks-by-deal-size)
6. [Deal Rot Data and Thresholds](#deal-rot-data-and-thresholds)
7. [Tiebreaker Rules](#tiebreaker-rules)
8. [Special Selection Scenarios](#special-selection-scenarios)

---

## The 4-Factor Scoring Model

Every deal in the pipeline is scored on four dimensions. The composite score determines which deals earn a spot in the focused engagement task.

### Formula

```
DEAL_FOCUS_SCORE = (Urgency x 0.30) + (Risk x 0.25) + (Value x 0.25) + (Momentum x 0.20)
```

### Factor 1: Urgency (30% Weight)

Urgency measures whether there is a time-sensitive deadline that requires action this period.

| Signal | Score | Rationale |
|--------|-------|-----------|
| Closes this week | 100 | Immediate revenue at stake. Every hour counts. |
| Close date passed (overdue) | 90 | Needs immediate correction: update date or close-lose. Ambiguity kills forecasts. |
| Proposal/contract pending review | 80 | Decision is imminent. Silence now = lost momentum. |
| Closes this month | 70 | Within active selling window. Weekly engagement needed. |
| Key meeting scheduled this period | 60 | Preparation is required. Under-prepped meetings waste the opportunity. |
| No close date set | 40 | Ambiguity itself is a risk. A deal with no date has no urgency -- and deals without urgency stall. |
| Closes next quarter+ | 20 | Low urgency. Monitor, do not focus. |

**Research backing**: Gartner data shows that deals which slip their close date once lose 30% of their final value on average. Deals that slip twice have a 65% probability of closing-lost. Close date urgency is the strongest single predictor of whether a deal needs action today.

### Factor 2: Risk (25% Weight)

Risk measures whether the deal is in danger of loss without intervention.

| Signal | Score | Rationale |
|--------|-------|-----------|
| Health score < 30 | 100 | Critical condition. Without intervention this week, the deal likely dies. |
| Champion went dark (7+ days) | 90 | Single-threaded deals lose their lifeline when the champion goes silent. Gong data: champion silence is the #1 predictor of deal loss. |
| No activity in 10+ days | 80 | Deal is stalling. The longer the silence, the harder the recovery. |
| Health score 30-50 | 75 | At risk. Needs attention within the current period. |
| Competitor mentioned in last meeting | 70 | Active competitive evaluation. Your differentiation story must be sharp. |
| Stakeholder change (new decision-maker) | 65 | Relationship restart required. New decision-makers re-evaluate from scratch. |
| Health score 51-70 | 40 | Moderate risk. Worth monitoring but not emergency focus. |
| Health score 71+ | 10 | Low risk. Strong health = low urgency for intervention. |

**Research backing**: CSO Insights reports that deals receiving intervention within 7 days of a risk signal recover at 3.5x the rate of deals left unattended for 14+ days. Early intervention is disproportionately effective.

### Factor 3: Value (25% Weight)

Value measures whether the deal justifies focused attention based on its revenue potential.

| Deal Value Relative to Portfolio Average | Score | Rationale |
|-----------------------------------------|-------|-----------|
| 3x+ average | 100 | Outsized deal. Losing it would materially impact the quarter. |
| 2-3x average | 75 | Significant deal. Worth prioritizing over smaller opportunities. |
| 1-2x average | 50 | Standard deal. Normal priority weight. |
| Below average | 25 | Smaller deal. Should not displace focus from larger opportunities unless urgency/risk is extreme. |
| Unknown value | 40 | Ambiguity penalized. Deals without values need qualification. |

**Research backing**: Bain & Company analysis shows that 80% of a rep's revenue typically comes from 30% of their deals. Focusing on the highest-value opportunities first is mathematically optimal, even if lower-value deals have higher close probability. A $100K deal at 40% probability has higher expected value ($40K) than a $20K deal at 90% ($18K).

### Factor 4: Momentum (20% Weight)

Momentum measures whether progress is possible this period. A high-priority deal that is blocked has low momentum.

| Signal | Score | Rationale |
|--------|-------|-----------|
| Meeting on calendar this period | 90 | Natural touchpoint exists. Prepare for it; do not waste it. |
| Next step is clearly defined | 80 | The deal is actionable. You know what to do next. |
| Stakeholder recently replied | 70 | Engagement window is open. Strike while the iron is hot. |
| Stage recently advanced | 60 | Positive trajectory. Maintain the momentum -- do not let it cool. |
| Deal is static but not blocked | 40 | Action possible but not naturally prompted. Requires outbound initiative. |
| Waiting on external dependency | 20 | Low leverage. You are blocked by legal review, internal procurement, third-party evaluation, etc. |
| Waiting on prospect decision with no timeline | 15 | Very low leverage. A check-in is appropriate, but deep focus is premature. |

**Research backing**: Momentum is the least-weighted factor because it is the most dynamic. A deal that is blocked today may unblock tomorrow. However, deals with active momentum deserve attention because open engagement windows close quickly -- Gong data shows that response times beyond 24 hours reduce subsequent engagement rates by 40%.

---

## Selection Matrix -- Worked Examples

### Example Pipeline: 8 Active Deals

| Deal | Value | Stage | Health | Days Stale | Close Date | Momentum Signal |
|------|-------|-------|--------|-----------|-----------|----------------|
| Acme Corp | $95K | Negotiation | 55 | 2 | This week | Contract pending |
| DataBridge | $54K | Proposal | 42 | 11 | This month | Champion dark |
| NovaTech | $38K | Demo | 72 | 1 | Next week | Demo went well |
| FinServe | $28K | Qualified | 28 | 16 | Next month | No response |
| CloudPeak | $120K | Discovery | 80 | 3 | Next quarter | Meeting Thursday |
| MicroEdge | $15K | Proposal | 65 | 5 | This month | Waiting on procurement |
| BrightPath | $42K | Qualified | 70 | 8 | Next month | Recent LinkedIn reply |
| Zenith Corp | $35K | Demo | 48 | 14 | This month | Competitor mentioned |

### Scoring (average deal size = $53K)

| Deal | Urgency (30%) | Risk (25%) | Value (25%) | Momentum (20%) | Total |
|------|--------------|-----------|------------|----------------|-------|
| Acme Corp | 100x0.30=30.0 | 40x0.25=10.0 | 75x0.25=18.75 | 80x0.20=16.0 | **74.75** |
| DataBridge | 70x0.30=21.0 | 90x0.25=22.5 | 50x0.25=12.5 | 20x0.20=4.0 | **60.0** |
| Zenith Corp | 70x0.30=21.0 | 75x0.25=18.75 | 25x0.25=6.25 | 40x0.20=8.0 | **54.0** |
| FinServe | 20x0.30=6.0 | 100x0.25=25.0 | 25x0.25=6.25 | 15x0.20=3.0 | **40.25** |
| CloudPeak | 20x0.30=6.0 | 10x0.25=2.5 | 100x0.25=25.0 | 90x0.20=18.0 | **51.5** |
| NovaTech | 60x0.30=18.0 | 10x0.25=2.5 | 25x0.25=6.25 | 70x0.20=14.0 | **40.75** |
| BrightPath | 20x0.30=6.0 | 40x0.25=10.0 | 25x0.25=6.25 | 70x0.20=14.0 | **36.25** |
| MicroEdge | 70x0.30=21.0 | 40x0.25=10.0 | 25x0.25=6.25 | 20x0.20=4.0 | **41.25** |

### Selection: Top 3

1. **Acme Corp (74.75)** -- Closing this week, contract pending, highest urgency + momentum
2. **DataBridge (60.0)** -- Champion dark 11 days, at-risk health, needs rescue
3. **Zenith Corp (54.0)** -- Competitor mentioned, 14 days stale, closing this month

**Excluded with reasoning**:
- CloudPeak ($120K, score 51.5): High value but Discovery stage with next-quarter close. Meeting Thursday is important but does not need deep engagement this week.
- NovaTech ($38K, score 40.75): Demo went well and deal is healthy. Maintain, do not focus.
- FinServe ($28K, score 40.25): Critical health but low value and no momentum. Include a diagnostic check-in on the checklist, not a full engagement.

---

## The "Ignore the Shiny Object" Rule

New deals entering the pipeline create a psychological pull toward attention. A new inbound lead feels exciting; an existing stale deal feels like work. This is a trap.

### The Data

| Scenario | Close Rate | Revenue Impact |
|----------|-----------|---------------|
| Rep shifts focus to new inbound, neglects near-close deal | New deal: 15% (early stage), Neglected deal: drops from 60% to 35% | Net negative: expected value of neglected deal loss exceeds new deal potential |
| Rep maintains focus on near-close, delegates new inbound triage | Near-close deal: 60% maintained, New deal: 12% (slightly lower from delayed response) | Net positive: 2% new-deal reduction is far less than 25% near-close preservation |

### The Rule

**Near-close deals always outrank new pipeline deals for focus, regardless of the new deal's apparent excitement.** The math is unambiguous:

- A $50K deal at 60% probability = $30K expected value
- A $200K new inbound at 10% probability = $20K expected value

Even a deal 4x larger cannot justify abandoning a near-close opportunity in most scenarios.

### Exceptions (when new deals DO warrant immediate focus)

| Exception | Condition |
|-----------|-----------|
| Strategic account | New deal from a named target account that rarely engages |
| Time-sensitive RFP | RFP with a hard submission deadline this week |
| Referral from existing champion | Warm introduction with implicit urgency |
| Inbound from C-suite | Executive inquiry typically has short decision windows |

---

## Stage-Appropriate Engagement Patterns

Different deal stages require different types of engagement. The engagement task checklist should match the stage.

### Engagement by Stage

| Stage | Primary Engagement | Checklist Pattern | Frequency |
|-------|-------------------|------------------|-----------|
| Discovery | Ask questions, understand pain | Research company, prepare discovery questions, schedule call | 1-2 touches per week |
| Qualification | Validate fit, identify stakeholders | Confirm budget/authority/need/timeline, map decision process | 2-3 touches per week |
| Demo / Evaluation | Demonstrate value, handle objections | Customize demo, send follow-up, address technical questions | 2-3 touches per week |
| Proposal | Present solution, negotiate terms | Send proposal, follow up within 48 hours, handle objections | 3-4 touches per week |
| Negotiation | Close the deal | Address final concerns, send contract, follow up daily | Daily until signed |
| Closed Won (onboarding) | Ensure success, build for expansion | Introduction to CS team, first-value delivery, check-in | Weekly for first month |

### Engagement Intensity Scaling

```
     Discovery     Qualification     Demo     Proposal     Negotiation
     |------------|---------------|---------|------------|-------------|
Touches/week:  1-2            2-3          2-3         3-4           5+
Time/touch:    15 min         20 min       30 min      20 min        10-30 min
Total/week:    30 min         60 min       90 min      80 min        60-150 min
```

---

## Velocity Benchmarks by Deal Size

Expected deal velocity (time from stage entry to close) varies by deal size. Knowing benchmarks helps identify which deals are slow vs. normal vs. fast.

### SMB Deals (< $25K)

| Stage | Expected Duration | Slow Threshold | Fast Threshold |
|-------|------------------|---------------|---------------|
| Discovery -> Qualified | 5-7 days | > 14 days | < 3 days |
| Qualified -> Demo | 3-5 days | > 10 days | < 2 days |
| Demo -> Proposal | 3-7 days | > 14 days | < 2 days |
| Proposal -> Negotiation | 5-10 days | > 21 days | < 3 days |
| Negotiation -> Closed | 3-7 days | > 14 days | < 2 days |
| **Total cycle** | **20-35 days** | **> 60 days** | **< 15 days** |

### Mid-Market Deals ($25K-$100K)

| Stage | Expected Duration | Slow Threshold | Fast Threshold |
|-------|------------------|---------------|---------------|
| Discovery -> Qualified | 7-14 days | > 21 days | < 5 days |
| Qualified -> Demo | 5-10 days | > 21 days | < 3 days |
| Demo -> Proposal | 7-14 days | > 30 days | < 5 days |
| Proposal -> Negotiation | 10-21 days | > 45 days | < 7 days |
| Negotiation -> Closed | 7-14 days | > 30 days | < 5 days |
| **Total cycle** | **35-75 days** | **> 120 days** | **< 25 days** |

### Enterprise Deals ($100K+)

| Stage | Expected Duration | Slow Threshold | Fast Threshold |
|-------|------------------|---------------|---------------|
| Discovery -> Qualified | 14-30 days | > 45 days | < 10 days |
| Qualified -> Demo | 10-21 days | > 35 days | < 7 days |
| Demo -> Proposal | 14-30 days | > 45 days | < 10 days |
| Proposal -> Negotiation | 21-45 days | > 60 days | < 14 days |
| Negotiation -> Closed | 14-30 days | > 45 days | < 10 days |
| **Total cycle** | **75-150 days** | **> 200 days** | **< 50 days** |

### How to Use Velocity Benchmarks

1. **Slow deals** (exceeding the slow threshold at any stage) should receive a diagnostic checklist item: "Assess why [deal] is stalled at [stage]. Contact [stakeholder] to identify the blocker."
2. **Normal deals** receive standard engagement appropriate to their stage.
3. **Fast deals** should not be over-managed. Let momentum carry them. Focus checklist items on removing friction, not adding touches.

---

## Deal Rot Data and Thresholds

"Deal rot" is the gradual death of an opportunity through inactivity. It is the silent killer of pipelines.

### The Research

| Finding | Source |
|---------|--------|
| Deals without activity for 14+ days close at 50% lower rates than active deals | CSO Insights, Pipeline Performance Benchmark |
| 30% of pipeline value is "dead weight" -- deals that will never close but remain open | Gartner, Sales Pipeline Myths |
| The average pipeline has 20-40% zombie deals (no real activity for 30+ days) | Forrester, B2B Sales Benchmark |
| Reps who clean their pipeline monthly have 15% higher forecast accuracy | CSO Insights |
| Deals that re-engage after 21+ days of silence close at less than 8% | Gong.io, Deal Intelligence Report |

### Deal Rot Thresholds

| Days Without Meaningful Activity | Rot Status | Recommended Action |
|---------------------------------|-----------|-------------------|
| 0-7 days | Fresh | Normal engagement cadence |
| 7-14 days | Staling | Priority flag. Include in focus task with re-engagement item. |
| 14-21 days | Rotting | Urgent flag. Lead with a diagnostic check-in before investing more time. |
| 21-30 days | Critical rot | Decision required: re-engage aggressively or disqualify. Do not let it linger. |
| 30+ days | Zombie | Almost certainly dead. Disqualify unless there is a concrete reason to keep it. Clean the pipeline. |

### What Counts as "Meaningful Activity"

Not all activity resets the rot clock. Only meaningful engagement counts:

| Counts as Activity | Does NOT Count |
|-------------------|---------------|
| Two-way email exchange | Automated email sequence touch |
| Live call or meeting held | Voicemail left with no callback |
| Proposal or document sent and acknowledged | Internal CRM update only |
| Reply received from prospect | One-way email sent with no reply |
| Meeting booked for the future | Meeting canceled or no-showed |

---

## Tiebreaker Rules

When two or more deals have identical or near-identical focus scores (within 3 points), apply tiebreakers in order:

| Priority | Tiebreaker | Reasoning |
|----------|-----------|-----------|
| 1 | Nearest close date | Revenue timing takes precedence |
| 2 | Highest deal value | Protect the biggest number |
| 3 | Longest stale period | Most neglected deal gets attention |
| 4 | Highest risk score | Defensive play -- save what you can |
| 5 | Strongest momentum signal | When all else is equal, choose the most actionable deal |

---

## Special Selection Scenarios

### Scenario: All Deals Healthy (No Deal Scores Above 50)

This is a positive signal. The pipeline is well-maintained. Shift from defensive to offensive:

- Select top 2 deals by close date (acceleration focus)
- Replace rescue-oriented checklist items with acceleration items: "Advance stage," "Multi-thread," "Propose timeline compression"
- Add a prospecting item: "Identify 2-3 new prospects to diversify pipeline"

### Scenario: All Deals Critical (5+ Deals Score Above 70)

Triage mode. The rep cannot save everything.

- Select top 3 by value (protect the most revenue)
- Checklist items are diagnostic first: "Assess viability before investing more time"
- Flag for manager review: "Multiple deals at risk. Consider manager intervention or account reassignment."

### Scenario: Single Deal Dominates (1 Deal Scores 30+ Points Above All Others)

Focus entirely on the dominant deal.

- Select 1 deal as primary focus (4-5 checklist items)
- Add 1 secondary deal with lighter engagement (2 items)
- Add a prospecting item at the end to maintain pipeline health

### Scenario: Pipeline Has 20+ Deals

Pre-filter before scoring. Never process more than 10 deals in detail.

Pre-filter rules (eliminate before scoring):
1. Remove all Closed Won/Lost deals
2. Remove all deals with close dates beyond 90 days
3. Remove all deals updated today (already top-of-mind)
4. Remove deals with health score above 85 AND activity in last 3 days (healthy and active)
5. Score the remaining 10 (or fewer)
