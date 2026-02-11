# Slippage Signals Deep Dive

Comprehensive analysis of all 15+ slippage signals: what they look like in CRM data, what they mean, historical accuracy rates, and how to distinguish real slippage from noise. This is the definitive reference for pipeline risk detection.

## Table of Contents
1. [Signal Detection Methodology](#signal-detection-methodology)
2. [Critical Signals (Immediate Intervention)](#critical-signals-immediate-intervention)
3. [High Signals (Action This Week)](#high-signals-action-this-week)
4. [Medium Signals (Action Within 2 Weeks)](#medium-signals-action-within-2-weeks)
5. [Low Signals (Monitor Proactively)](#low-signals-monitor-proactively)
6. [Signal Accuracy Data](#signal-accuracy-data)
7. [Noise vs. Signal: The Discrimination Guide](#noise-vs-signal-the-discrimination-guide)
8. [CRM Data Patterns for Each Signal](#crm-data-patterns-for-each-signal)
9. [Signal Interaction Effects](#signal-interaction-effects)
10. [Pipeline-Level Signal Aggregation](#pipeline-level-signal-aggregation)

---

## Signal Detection Methodology

### Automated vs. Manual Detection

| Detection Type | Signals Detected | Data Source | Refresh Rate |
|---|---|---|---|
| **Fully Automated** | Activity gaps, close date changes, stage duration, overdue tasks, health score | CRM fields, activity log, task records | Real-time |
| **Semi-Automated** | Single-threaded, no economic buyer, declining activity, no next meeting | Contact records, calendar, activity trends | Daily |
| **Manual (Rep Input)** | Buyer verbal signals, organizational change, competitor mentions, engagement quality | Rep notes, meeting transcripts, external research | Weekly |

**Key principle**: Automated signals are the baseline. They catch the obvious risks. Semi-automated signals catch structural risks. Manual signals catch the nuanced, qualitative risks that data alone cannot detect. A complete diagnosis uses all three layers.

### Signal Weighting Formula

```
Deal Risk Score = SUM(Signal Severity Points) x Value Weight x Proximity Weight
```

Where:
- Critical signal = 10 points
- High signal = 5 points
- Medium signal = 2 points
- Low signal = 1 point
- Value Weight: Top 25% of pipeline = 3x, Middle 50% = 2x, Bottom 25% = 1x
- Proximity Weight: Close date in 2 weeks = 3x, 1 month = 2x, 1+ months = 1x, Past = 3x

---

## Critical Signals (Immediate Intervention)

### Signal 1: No Activity in 14+ Days

**What it looks like in CRM data**:
- Last activity date is 14+ calendar days before today
- Activity types checked: emails sent/received, calls logged, meetings held, notes added
- No distinction between inbound and outbound -- ANY activity resets the clock

**What it means**:
The deal has lost momentum. Activity is the oxygen of a deal. Without it, the buyer's attention shifts to other priorities, competitors, or inertia. Gong Labs research on 70,000+ deals shows that deals going dark for 14+ days close at less than 8% -- making this the single most predictive automated signal.

**Historical accuracy**:

| Days Dark | Predicted Outcome | Accuracy Rate |
|---|---|---|
| 7-13 days | At risk, intervention needed | 62% accuracy (38% resume naturally) |
| 14-20 days | Likely to slip or die | 79% accuracy |
| 21-30 days | Very likely dead | 88% accuracy |
| 30+ days | Almost certainly dead | 94% accuracy |

**CRM detection query**: `WHERE last_activity_date < (TODAY - 14 days) AND status = 'open'`

**Common false positives**:
- Legal review or procurement process is in progress (buyer confirmed)
- Buyer is on a planned vacation
- Deal is awaiting a board meeting on a known schedule
- Holiday period (Q4 shutdowns, August in Europe)

**Distinguishing real from noise**: Check for an explicit "waiting for" note or task on the deal. If the silence was anticipated and documented, it is a planned pause, not a risk signal. If there is no documentation, the silence is a genuine risk.

---

### Signal 2: Close Date Pushed 2+ Times

**What it looks like in CRM data**:
- Close date field value differs from the original close date or has been modified 2+ times
- Audit trail shows multiple backward adjustments (date moved later, not earlier)

**What it means**:
Each close date push signals that the original forecast was wrong. Two pushes means the first correction was also wrong. This is a pattern, not an accident. The deal's timeline is fundamentally misunderstood -- either by the rep (wishful thinking) or by the buyer (no real urgency).

**Historical accuracy**:

| Push Count | Close Probability (relative to baseline) | Accuracy of "will slip again" |
|---|---|---|
| 0 pushes | 100% (baseline) | N/A |
| 1 push | 80-85% | 45% (will push again) |
| 2 pushes | 60-68% | 67% (will push again) |
| 3 pushes | 40-48% | 82% (will push again or die) |
| 4+ pushes | <30% | 91% (will push again or die) |

**Data source**: Clari, 2023 Revenue Operations Report; InsightSquared pipeline analytics.

**CRM detection query**: Count close date changes in audit trail. Alternatively, compare `close_date` to `created_date` original close date if audit trail is unavailable.

**Common false positives**:
- Close date was set at deal creation as a placeholder (not buyer-validated)
- Push was small (1-2 weeks) and communicated proactively by the buyer
- Push was caused by a known, time-bound event (board meeting cycle)
- Push was buyer-initiated for a legitimate reason (fiscal year boundary)

---

### Signal 3: Close Date in the Past

**What it looks like in CRM data**:
- `close_date < TODAY()` AND `status = 'open'`

**What it means**:
This is the most obvious slippage signal and the most commonly ignored. Either:
1. The deal was lost and the rep has not updated the CRM (50% of cases)
2. The close date was aspirational and the rep has not adjusted it (30%)
3. The deal is still active but behind schedule (20%)

**Historical accuracy**: 92% of deals with past close dates that are not updated within 5 business days end up being closed as lost (CSO Insights).

**Action**: Immediate. Update the close date with a realistic new date, or close the deal as lost. Past close dates that linger destroy forecast credibility.

---

### Signal 4: Deal Value Decreased by 20%+

**What it looks like in CRM data**:
- Current `deal_value < 0.8 x max(historical_deal_value)`
- Value reduction of 20% or more from the peak value

**What it means**:
Value reduction signals one of three things:
1. **Scope retreat**: The buyer is de-scoping to fit a tighter budget. The initiative is still alive but smaller.
2. **Competitive pressure**: The seller is discounting to stay competitive. Price pressure usually means a competitor is offering better terms.
3. **Staged approach**: The deal was restructured into phases. This can be positive (deal is still alive) or negative (buyer is hedging).

**Historical accuracy**: 68% of deals with 20%+ value reduction eventually close for less than the reduced amount or are lost entirely. Only 14% recover to the original value.

**Distinguishing real from noise**: Ask "Was this a seller-initiated restructuring or a buyer-demanded reduction?" Seller-initiated phasing is neutral. Buyer-demanded reduction is a risk signal.

---

## High Signals (Action This Week)

### Signal 5: Single-Threaded Engagement

**What it looks like in CRM data**:
- Count of unique contacts with activity in the last 30 days = 1
- Only one buyer-side contact has been emailed, met with, or called

**What it means**:
The deal depends entirely on one person. If that person goes on vacation, changes roles, gets overruled, or simply deprioritizes the initiative, the deal dies instantly. There is no backup path.

**Historical accuracy**:

| Contacts Engaged | Win Rate | Risk Level |
|---|---|---|
| 1 contact | 5.4% | Critical |
| 2 contacts | 11.2% | High |
| 3 contacts | 17.0% | Medium |
| 4+ contacts | 22.4% | Low |

**Data source**: Gong Labs, analysis of 70,000+ B2B deals.

**Adjustment by deal size**: Single-threading is acceptable for SMB deals under $25K where the contact IS the decision maker. For mid-market ($50K+) and enterprise ($250K+), single-threading is always a risk signal.

---

### Signal 6: No Executive / Economic Buyer Engagement

**What it looks like in CRM data**:
- No contact on the deal with a title containing VP, Director, Head of, C-level, Owner, President, or similar seniority indicators has any logged activity
- All interactions are with individual contributors or managers

**What it means**:
The deal is being evaluated by people who cannot approve the budget. Even if they love the solution, they need someone else to say "yes" to the money. That someone has never been part of the conversation and may have entirely different priorities.

**Historical accuracy**:

| EB Engagement | Win Rate | When EB Engaged |
|---|---|---|
| Never engaged | 11% | N/A |
| Engaged in first 40% of cycle | 34% | Early engagement is 3x more effective |
| Engaged in last 20% of cycle | 19% | Late engagement is better than none, but much less effective |

**Data source**: MEDDIC Academy benchmarks, 2023.

**CRM detection**: Requires contact role classification. Match contact titles against seniority patterns. If no match exists and the deal is past discovery stage, flag this signal.

---

### Signal 7: Stage Duration Exceeds 2x Average

**What it looks like in CRM data**:
- `days_in_current_stage > 2 x average_stage_duration`
- Use organization averages if available; otherwise use these defaults:

| Stage | Average Duration | 2x Threshold | 3x Threshold (terminal) |
|---|---|---|---|
| Discovery | 10 days | 20 days | 30 days |
| Qualification | 10 days | 20 days | 30 days |
| Evaluation | 18 days | 36 days | 54 days |
| Proposal | 10 days | 20 days | 30 days |
| Negotiation | 8 days | 16 days | 24 days |
| Closing | 5 days | 10 days | 15 days |

**What it means**:
Something is blocking the deal from progressing to the next stage, and it has not been identified or addressed. Extended stage duration is the most reliable leading indicator of eventual loss because it captures the cumulative effect of multiple smaller problems.

**Historical accuracy**: Deals at 2x stage duration close at 15% or less. Deals at 3x stage duration close at 5% or less (InsightSquared, analysis of 100,000+ deals).

---

### Signal 8: Overdue Tasks on the Deal

**What it looks like in CRM data**:
- Tasks where `deal_id = [this deal]` AND `due_date < TODAY()` AND `status != 'complete'`

**What it means**:
Commitments were made but not kept. This could be seller-side (rep dropped the ball) or buyer-side (buyer did not follow through). Either way, it erodes trust and breaks momentum.

**Severity by count**:

| Overdue Tasks | Severity | Interpretation |
|---|---|---|
| 1 task | Medium | Execution slip, likely recoverable |
| 2-3 tasks | High | Pattern of neglect or buyer disengagement |
| 4+ tasks | Critical | Systemic execution failure or dead deal |

---

## Medium Signals (Action Within 2 Weeks)

### Signal 9: Activity Frequency Declining

**What it looks like in CRM data**:
- Count of activities in the last 14 days < count of activities in the 14 days before that
- Declining trend over 3+ measurement periods

**What it means**:
The deal is losing momentum. The buyer (and possibly the rep) are investing less time in the deal. This is a leading indicator -- it predicts future silence before silence actually occurs.

**Detection method**: Compare activity counts in rolling 14-day windows. A decline of 50%+ from one period to the next is significant.

**Accuracy**: 61% of deals with declining activity trend for 3+ periods eventually stall or are lost.

---

### Signal 10: No Next Meeting Scheduled

**What it looks like in CRM data**:
- No calendar event or meeting-type task with a future date associated with this deal
- No "next step" documented in the most recent activity note

**What it means**:
A deal without a next meeting is a deal without momentum. The next interaction is uncertain, which means neither side has committed to continuing the process.

**Important nuance**: This signal is most critical immediately after a meeting or demo. The best practice is to book the next meeting before the current one ends. If that did not happen, the signal activates.

**Accuracy**: 58% of deals without a scheduled next meeting within 5 business days of the last meeting eventually stall.

---

### Signal 11: Health Score Below 50

**What it looks like in CRM data**:
- `health_score < 50` (on a 0-100 scale)

**What it means**:
Health scores are composite signals. A score below 50 means multiple underlying factors are combining to create risk. The specific components of the score matter more than the score itself.

**Action**: When this signal fires, decompose the health score into its components and identify which specific factors are dragging it down.

---

### Signal 12: No Mutual Action Plan or Defined Next Steps

**What it looks like in CRM data**:
- No MAP-related tasks or milestones on the deal
- No structured close plan documented
- Deal is past discovery stage without documented milestones

**What it means**:
The deal lacks structure. Without a MAP, both sides are drifting. Neither the buyer nor the seller has a clear, shared plan for getting to close.

**Data**: Deals with MAPs close 49% faster and at 18-22% higher win rates (Gartner, 2023 B2B Buying Report).

---

## Low Signals (Monitor Proactively)

### Signal 13: Buyer Company Shows Organizational Change

**What it looks like in CRM data**:
- Deal notes mention restructuring, M&A, layoffs, or leadership change
- News monitoring triggers (if integrated)

**What it means**:
Organizational change reshuffles priorities, budgets, and authority. Your deal may survive or may be cancelled -- it depends on whether the new leadership sees it as aligned with their priorities.

**Accuracy**: 76% of deals are delayed when the buyer's company announces layoffs (Clari). M&A freezes virtually all purchasing decisions.

---

### Signal 14: Competitor Mentioned in Recent Interactions

**What it looks like in CRM data**:
- Activity notes or meeting transcripts reference a competitor by name
- Buyer introduced new evaluation criteria that align with a competitor's strengths

**What it means**:
The buyer is comparison shopping. This is not inherently bad -- it is normal in complex B2B purchases. The risk is if you cannot differentiate on the buyer's specific criteria.

**Accuracy**: Only 35% of deals where a competitor is mentioned are eventually lost to that competitor. The other 65% are won or lost for unrelated reasons. Competitor mentions are informational, not predictive by themselves.

---

### Signal 15: Contract / Legal Review Taking Longer Than Expected

**What it looks like in CRM data**:
- Legal/procurement tasks or milestones are overdue
- Deal is in negotiation/closing stage for longer than average

**What it means**:
Legal delays are common and usually resolvable. They become high-severity only if they indicate a fundamental terms disagreement or if the buyer's legal team is deliberately stalling.

**Duration benchmarks**:

| Company Size | Typical Legal Review | Warning Threshold |
|---|---|---|
| SMB (<100 employees) | 1-3 days | 1 week |
| Mid-Market (100-1000) | 1-2 weeks | 3 weeks |
| Enterprise (1000+) | 2-4 weeks | 6 weeks |
| Regulated industry | 4-8 weeks | 10 weeks |

---

## Signal Accuracy Data

### Individual Signal Predictive Power

| Signal | Accuracy (predicts loss) | False Positive Rate | Confidence When Combined |
|---|---|---|---|
| No activity 14+ days | 79% | 21% | Increases to 92% with 2+ additional signals |
| Close date pushed 2+ | 67% | 33% | Increases to 85% with activity gap |
| Close date in past | 92% | 8% | Very high standalone accuracy |
| Value decreased 20%+ | 68% | 32% | Higher if buyer-demanded, lower if seller-initiated |
| Single-threaded | 83% (for $50K+ deals) | 17% | Lower accuracy for SMB |
| No EB engagement | 66% | 34% | Accuracy increases with stage (higher in late stages) |
| Stage duration 2x | 85% | 15% | One of the most reliable signals |
| Overdue tasks | 55% | 45% | High false positive rate -- context matters |
| Activity declining | 61% | 39% | Leading indicator, not conclusive alone |
| No next meeting | 58% | 42% | Context-dependent -- worse if post-demo |
| Health score <50 | 72% | 28% | Depends on score methodology |
| No MAP | 52% | 48% | Marginal standalone, strong in combination |
| Org change | 76% | 24% | High impact but infrequent |
| Competitor mentioned | 35% | 65% | Very high false positive -- informational only |
| Legal delay | 42% | 58% | High false positive -- delays are normal |

### Signal Combination Accuracy

| Signal Combination | Predicted Outcome | Accuracy |
|---|---|---|
| No activity 14+ days + close date pushed 2+ | Deal will slip or die | 92% |
| Single-threaded + no EB + past discovery | Deal will stall at proposal | 87% |
| Value decreased + competitor mentioned | Competitive loss likely | 78% |
| Stage duration 2x + no next meeting | Deal is dying silently | 89% |
| 3+ critical/high signals simultaneously | Deal is almost certainly dead | 94% |

---

## Noise vs. Signal: The Discrimination Guide

### Questions to Ask Before Flagging a Risk

For every signal detected, run through this checklist before raising the alarm:

1. **Is there a documented explanation?** If the rep noted "waiting for board approval on March 15," the silence is planned, not a risk.
2. **Is this typical for the deal type?** Enterprise legal reviews taking 4 weeks is normal. SMB legal taking 4 weeks is a red flag.
3. **Is the buyer's behavior consistent with their past pattern?** If this buyer always takes 5 days to respond, a 5-day gap is not a risk.
4. **Has the rep verified the signal?** CRM data can be incomplete. Ask: "Is there activity that was not logged?"
5. **Are multiple signals present?** A single medium signal is rarely actionable. Three medium signals together are a pattern.

### The "Is It Really Dead?" Checklist

Before declaring a deal dead or unsalvageable, verify:
- [ ] The buyer explicitly said "no" (not just silence)
- [ ] You have attempted 3+ outreach methods (email, phone, LinkedIn, different contact)
- [ ] The silence has lasted 21+ days (not just a busy week)
- [ ] You have checked for a legitimate explanation (vacation, company event, legal review)
- [ ] The breakup email has been sent and received no response within 5 business days

---

## CRM Data Patterns for Each Signal

### Quick Reference: What to Query

| Signal | CRM Field(s) | Query Logic |
|---|---|---|
| No activity 14+ days | `last_activity_date` | `TODAY() - last_activity_date > 14` |
| Close date pushed | `close_date`, audit trail | Close date modified backward 2+ times |
| Close date past | `close_date`, `status` | `close_date < TODAY() AND status = 'open'` |
| Value decreased | `deal_value`, audit trail | `current_value < 0.8 * max_value` |
| Single-threaded | Contact activity records | `COUNT(DISTINCT contact_id WHERE activity_date > TODAY()-30) = 1` |
| No EB engagement | Contact roles, activity | No VP+ contact with activity |
| Stage duration 2x | `stage_entered_date` | `TODAY() - stage_entered_date > 2 * avg_duration` |
| Overdue tasks | Task records | `due_date < TODAY() AND status != 'complete'` |
| Activity declining | Activity count by period | `last_14d_count < prev_14d_count * 0.5` |
| No next meeting | Calendar/task records | No future meeting/call associated with deal |
| Health score | `health_score` | `health_score < 50` |
| No MAP | Task/milestone records | No MAP-related records on deal |

---

## Signal Interaction Effects

Some signals amplify each other. Some signals cancel each other out.

### Amplifying Combinations

| Signal A | Signal B | Combined Effect |
|---|---|---|
| No activity 14+ days | Single-threaded | 2.5x risk (no activity AND no backup contact) |
| Close date pushed | No compelling event | 2x risk (slipping with no urgency to stop it) |
| No EB engagement | Stage 4+ (Proposal) | 3x risk (too late to engage EB; deal will stall) |
| Overdue tasks | Activity declining | 2x risk (both sides are disengaging) |
| Competitor mentioned | New eval criteria | 2x risk (competitor is actively influencing the process) |

### Cancelling Combinations

| Signal A | Cancellation Condition | Reduced Severity |
|---|---|---|
| No activity 14+ days | Legal review confirmed in progress | Reduce from Critical to Medium |
| Close date pushed | Buyer proactively communicated with new date + reason | Reduce from Critical to Medium |
| Single-threaded | Deal is SMB under $25K and contact is the decision maker | Reduce from High to Low |
| Stage duration 2x | Enterprise deal with known procurement process timeline | Reduce from High to Medium |
| No next meeting | Buyer confirmed next step in writing (just not scheduled) | Reduce from Medium to Low |

---

## Pipeline-Level Signal Aggregation

When analyzing the full pipeline (not just one deal), aggregate signals to detect systemic issues.

### Healthy Pipeline Indicators

| Metric | Healthy Range | Warning | Critical |
|---|---|---|---|
| % of deals with 0 risk signals | >40% | 25-40% | <25% |
| % of deals at critical severity | <10% | 10-20% | >20% |
| Average risk score across pipeline | <15 | 15-30 | >30 |
| % of deals with past close dates | <5% | 5-15% | >15% |
| % of deals single-threaded ($50K+) | <20% | 20-40% | >40% |
| Average days since last activity | <7 days | 7-14 days | >14 days |

### Systemic Issue Detection

| Pipeline Pattern | Likely Root Cause | Recommended Action |
|---|---|---|
| >50% of deals have no EB engagement | Reps are not multi-threading or asking for executive access | Training on stakeholder mapping and EB engagement |
| >30% of deals have past close dates | Forecast discipline is poor; dates are aspirational | Implement close date validation with buyer confirmation |
| Average activity gap >10 days across pipeline | Reps are spreading too thin or not following up | Reduce pipeline to manageable size; implement cadence rules |
| >40% of deals at 2x stage duration | Deals are entering pipeline too early (premature qualification) | Tighten stage entry criteria |
| All deals single-threaded | Cultural issue -- reps are not comfortable multi-threading | Manager coaching and role-play on multi-threading |
