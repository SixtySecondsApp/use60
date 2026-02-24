# Risk Signal Taxonomy

Comprehensive catalog of deal risk signals with detection methods, severity ratings, data sources, false positive indicators, and correlation data. Use this reference to accurately diagnose at-risk deals and avoid false alarms.

## Table of Contents
1. [Signal Classification Framework](#signal-classification-framework)
2. [Behavioral Signals (Buyer Actions)](#behavioral-signals-buyer-actions)
3. [Temporal Signals (Time-Based)](#temporal-signals-time-based)
4. [Structural Signals (Deal Composition)](#structural-signals-deal-composition)
5. [Verbal Signals (What the Buyer Says)](#verbal-signals-what-the-buyer-says)
6. [External Signals (Market and Company)](#external-signals-market-and-company)
7. [False Positive Guide](#false-positive-guide)
8. [Signal Combinations and Compound Risk](#signal-combinations-and-compound-risk)
9. [Data Source Reliability Ranking](#data-source-reliability-ranking)

---

## Signal Classification Framework

Each signal is classified on three axes:

| Axis | Levels | Meaning |
|---|---|---|
| **Severity** | Critical / High / Medium / Low | How likely this signal is to result in deal loss if unaddressed |
| **Reliability** | High / Medium / Low | How often this signal accurately predicts risk (vs. false positive) |
| **Detectability** | Automatic / Semi-Automatic / Manual | Can CRM data detect it, or does the rep need to assess? |

**Key insight**: The most reliable signals are behavioral (what people do), not verbal (what people say). A buyer who says "we're excited" but cancels meetings is at risk. A buyer who says "I have concerns" but keeps scheduling next steps is engaged.

---

## Behavioral Signals (Buyer Actions)

### BS-1: No Response to 2+ Outreach Attempts

| Attribute | Value |
|---|---|
| Severity | Critical |
| Reliability | High (82% correlation with deal loss if sustained 14+ days, Gong Labs) |
| Detectability | Semi-Automatic (activity gap detectable, response tracking varies) |
| Root Cause Correlation | Champion gone dark (60%), Organizational change (20%), Competitor (15%), Lost interest (5%) |

**Detection method**: Compare last outbound activity date to last inbound response date. If 2+ outbound messages have been sent since the last inbound response, this signal is active.

**False positive indicators**:
- Buyer is on vacation (check for out-of-office replies)
- Buyer's company is in a known busy period (earnings, year-end close)
- Outreach was sent during a holiday week
- Buyer is in a different time zone and turnaround is slower

**Severity escalation**: 2 unanswered messages = Medium. 3+ unanswered across 14+ days = Critical.

---

### BS-2: Meeting Cancellations or Rescheduling

| Attribute | Value |
|---|---|
| Severity | High |
| Reliability | High (73% correlation with eventual loss if 2+ cancellations) |
| Detectability | Semi-Automatic (calendar events can be tracked) |
| Root Cause Correlation | Deprioritization (45%), Competing priorities (30%), Champion politics (15%), Lost interest (10%) |

**Detection method**: Track cancelled or rescheduled meetings on the deal. One reschedule is normal. Two or more in sequence is a signal.

**False positive indicators**:
- Genuine scheduling conflict (rescheduled to a specific new date within 3 days)
- Company-wide event or all-hands that conflicts
- Buyer proactively rescheduled with an explanation

**Key distinction**: "Rescheduled to next Tuesday" (low risk) vs. "Something came up, I'll get back to you" with no new date (high risk).

---

### BS-3: Decreasing Engagement Quality

| Attribute | Value |
|---|---|
| Severity | Medium |
| Reliability | Medium (61% correlation, harder to measure objectively) |
| Detectability | Manual (requires rep judgment) |
| Root Cause Correlation | Losing interest (40%), Competitor gaining (25%), Internal politics (20%), Budget concerns (15%) |

**Detection indicators**:
- Email responses getting shorter (full paragraphs -> one-liners -> one-word replies)
- Fewer questions from the buyer (engaged buyers ask more questions over time, not fewer)
- Meeting duration decreasing
- Buyer delegates to a more junior person
- Buyer stops sharing internal information

**False positive indicators**:
- Buyer is naturally terse in email communication
- Shorter responses indicate agreement, not disengagement
- Delegation to someone with execution authority (not a demotion of your deal)

---

### BS-4: Buyer Stopped Sharing Information

| Attribute | Value |
|---|---|
| Severity | High |
| Reliability | Medium (65% correlation with deal risk) |
| Detectability | Manual (requires rep assessment) |
| Root Cause Correlation | Competitor gained advantage (35%), Champion lost influence (30%), Budget issue (20%), Decision change (15%) |

**Detection indicators**:
- Buyer previously shared org charts, requirements docs, or internal plans -- now stops
- Buyer deflects specific questions about budget, timeline, or decision makers
- Buyer avoids answering "who else is evaluating this?"
- Buyer declines to share evaluation criteria or changes them without explanation

**False positive indicators**:
- Buyer is compartmentalizing for legitimate security/compliance reasons
- Buyer is new to the process and does not know what to share
- Information sharing was never established in this relationship

---

## Temporal Signals (Time-Based)

### TS-1: No Activity in 14+ Days

| Attribute | Value |
|---|---|
| Severity | Critical |
| Reliability | Very High (deals that go dark 14+ days close at <8%, Gong Labs) |
| Detectability | Automatic (CRM activity tracking) |
| Root Cause Correlation | Champion dark (40%), No compelling event (30%), Organizational change (15%), Competitor (15%) |

**Detection method**: Current date minus last activity date on the deal. Activities include: emails, calls, meetings, notes, tasks completed.

**Severity by duration**:

| Days Since Activity | Severity | Close Probability | Action Urgency |
|---|---|---|---|
| 7-13 days | Medium | ~25% (declining) | Re-engage this week |
| 14-20 days | Critical | <8% | Rescue within 48 hours |
| 21-30 days | Critical | <4% | Breakup email or disqualify |
| 30+ days | Terminal | <2% | Likely dead, assess before investing |

**False positive indicators**:
- Deal is in a natural waiting period (legal review, board approval cycle)
- Activity happened but was not logged in CRM
- Buyer is on a planned extended absence
- Holiday or company-wide shutdown period

---

### TS-2: Close Date Pushed 2+ Times

| Attribute | Value |
|---|---|
| Severity | Critical |
| Reliability | High (each push reduces close probability by 15-20%, Clari) |
| Detectability | Automatic (CRM close date history) |
| Root Cause Correlation | No compelling event (50%), Forecast inflation (25%), Missing decision maker (15%), Budget (10%) |

**Detection method**: Compare current close date to original close date. If the close date has been moved backward 2+ times, this signal is active.

**Probability decay per push**:

| Push Count | Close Probability (relative to original) |
|---|---|
| 0 (original date) | Baseline |
| 1 push | 80-85% of baseline |
| 2 pushes | 60-68% of baseline |
| 3 pushes | 40-48% of baseline |
| 4+ pushes | <30% of baseline |

**False positive indicators**:
- Close date was set arbitrarily at deal creation (no buyer input)
- Push was driven by a known, time-bound event (board meeting cycle, fiscal year)
- Push was small (1-2 weeks) and buyer communicated proactively

---

### TS-3: Stage Duration Exceeds 2x Average

| Attribute | Value |
|---|---|
| Severity | High |
| Reliability | High (most reliable leading indicator of eventual loss, InsightSquared) |
| Detectability | Automatic (CRM stage entry date vs. average stage duration) |
| Root Cause Correlation | Hidden objection (30%), Missing stakeholder (25%), No compelling event (25%), Technical blocker (20%) |

**Default stage duration benchmarks** (if organization averages are not available):

| Stage | Average Duration | 2x Warning Threshold |
|---|---|---|
| Discovery | 10 days | 20 days |
| Qualification | 10 days | 20 days |
| Evaluation / Demo | 18 days | 36 days |
| Proposal | 10 days | 20 days |
| Negotiation | 8 days | 16 days |
| Closing | 5 days | 10 days |

---

### TS-4: Close Date in the Past

| Attribute | Value |
|---|---|
| Severity | Critical |
| Reliability | Very High (the most obvious signal, yet commonly ignored) |
| Detectability | Automatic |
| Root Cause Correlation | Deal is dead and not updated (50%), Forecast inflation (30%), Rep neglect (20%) |

**Detection method**: Close date < today's date AND deal status is still open.

**Action required**: Immediate. Either update the close date with a realistic new date and clear rationale, or close the deal as lost.

---

## Structural Signals (Deal Composition)

### SS-1: Single-Threaded Engagement

| Attribute | Value |
|---|---|
| Severity | High |
| Reliability | High (5.4% close rate for single-threaded vs. 17% for multi-threaded, Gong) |
| Detectability | Automatic (count unique contacts with activity in last 30 days) |
| Root Cause Correlation | Deal fragility (if champion leaves, deal dies instantly) |

**Thresholds by deal size**:

| Deal Size | Minimum Contacts Engaged | Warning Threshold |
|---|---|---|
| SMB (<$50K) | 1 | 1 (acceptable for SMB) |
| Mid-Market ($50K-$250K) | 2-3 | 1 (critical risk) |
| Enterprise ($250K+) | 4+ | 2 or fewer (critical risk) |

---

### SS-2: No Economic Buyer Engagement

| Attribute | Value |
|---|---|
| Severity | High |
| Reliability | High (11% close rate without EB vs. 34% with EB engaged early, MEDDIC benchmarks) |
| Detectability | Semi-Automatic (requires contact role classification) |
| Root Cause Correlation | Missing decision maker (primary), Budget uncertainty (secondary) |

**Detection method**: Check contact roles on the deal. If no contact has a title suggesting budget authority (VP+, Director, Owner, C-level, Head of), and the deal is past the discovery stage, this signal is active.

---

### SS-3: No Mutual Action Plan

| Attribute | Value |
|---|---|
| Severity | Medium |
| Reliability | Medium (deals with MAPs close 49% faster and 18-22% more often, Gartner) |
| Detectability | Semi-Automatic (check for MAP-related tasks or notes) |
| Root Cause Correlation | No process (the deal is drifting without structure) |

---

### SS-4: Overdue Tasks on the Deal

| Attribute | Value |
|---|---|
| Severity | Medium-High |
| Reliability | Medium (overdue tasks indicate execution failure, but severity depends on which tasks) |
| Detectability | Automatic (CRM task status and due dates) |
| Root Cause Correlation | Poor execution (60%), Buyer non-compliance (25%), Deprioritization (15%) |

---

## Verbal Signals (What the Buyer Says)

**Important caveat**: Verbal signals are the least reliable category. What buyers say and what buyers do often diverge. Always cross-reference verbal signals with behavioral signals.

### VS-1: "We're still interested, just busy right now"

| Attribute | Value |
|---|---|
| Severity | Medium |
| Reliability | Low (this statement is true ~40% of the time, Gong analysis) |
| True Meaning | Often: "This is not a priority" or "I'm avoiding a direct 'no'" |

**Cross-reference with**: Activity levels. If the buyer says "just busy" but their activity is declining, the statement is likely deflection. If they say "just busy" and reschedule to a specific date, it is likely genuine.

---

### VS-2: "Let me think about it"

| Attribute | Value |
|---|---|
| Severity | High |
| Reliability | Medium (70% of deals that receive "let me think about it" do not close without intervention) |
| True Meaning | Unresolved objection, lack of urgency, or risk aversion |

**Diagnostic follow-up**: "Absolutely. To help me prepare for our next conversation -- what specifically are you weighing? I might be able to provide some data or a reference that would help."

---

### VS-3: "We love your product" (without forward movement)

| Attribute | Value |
|---|---|
| Severity | Medium-High |
| Reliability | Medium (positive words without positive actions is a warning signal) |
| True Meaning | Enthusiasm without commitment. The buyer likes the product but cannot or will not buy it. |

**Cross-reference with**: Has the buyer taken any ACTION that demonstrates commitment? (Introduced you to the economic buyer, shared requirements, scheduled a demo for the team, provided budget information.) Words without actions are noise.

---

### VS-4: "We need to see more features / capabilities"

| Attribute | Value |
|---|---|
| Severity | Medium |
| Reliability | Medium |
| True Meaning | Could be genuine (they need proof). Could be stalling (they are not saying no, just not saying yes). Could be competitive (the competitor showed something you did not). |

**Diagnostic follow-up**: "Specifically, what would you need to see to feel confident in moving forward?" If they cannot answer specifically, they are stalling.

---

## External Signals (Market and Company)

### ES-1: Layoffs or Hiring Freeze at Buyer Company

| Attribute | Value |
|---|---|
| Severity | High |
| Reliability | High (76% of deals are delayed or lost when the buyer's company announces layoffs, Clari) |
| Detectability | Manual (news monitoring, LinkedIn alerts) |

---

### ES-2: M&A Activity at Buyer Company

| Attribute | Value |
|---|---|
| Severity | High |
| Reliability | High (virtually all purchasing decisions freeze during active M&A) |
| Detectability | Manual (news monitoring) |
| Recommended Action | Pause outreach. Set 90-day post-close reminder. |

---

### ES-3: Leadership Change at Buyer Company

| Attribute | Value |
|---|---|
| Severity | Medium-High |
| Reliability | Medium (new leaders often cancel predecessor initiatives, but sometimes they accelerate them) |
| Detectability | Manual (LinkedIn, news) |

---

### ES-4: Competitor Announced Major Update or Price Change

| Attribute | Value |
|---|---|
| Severity | Medium |
| Reliability | Low-Medium (may or may not affect your specific deal) |
| Detectability | Manual (market monitoring) |

---

## False Positive Guide

Avoid treating normal deal behavior as risk signals. These common situations look like risk but often are not.

### Legitimate Silence (Not a Risk Signal)

| Situation | How to Confirm | Duration Tolerance |
|---|---|---|
| Buyer is on vacation | Out-of-office reply, LinkedIn post about vacation | Up to 2 weeks |
| Company-wide busy period (year-end close, earnings) | Confirm with buyer before the busy period | 1-3 weeks |
| Legal review in progress | Confirmed by buyer that legal is reviewing | 2-6 weeks (enterprise) |
| Budget approval cycle | Buyer confirmed the process and expected timeline | Varies by company |
| Board approval on a known cycle | Buyer confirmed the board meeting date | Up to the board date |

### The "Active But Slow" Deal

Some deals are genuinely slow but healthy. Indicators of healthy slow:
- Buyer responds to every message, just takes 3-5 days
- Each response is substantive (not one-word)
- Buyer shares new information with each interaction
- Buyer introduces you to new stakeholders over time
- Forward progress is measurable, even if incremental

Compare with unhealthy slow:
- Response times increasing (3 days -> 5 days -> 10 days)
- Responses getting shorter and less substantive
- No new information shared in the last 3 interactions
- No new stakeholders introduced
- Forward progress has stalled at the same question or step

---

## Signal Combinations and Compound Risk

Individual signals are informative. Signal combinations are diagnostic. These common combinations indicate specific root causes.

### Combination 1: "The Dead Deal Walking"
- No activity 14+ days
- Close date pushed 2+ times
- Single-threaded engagement

**Diagnosis**: This deal is almost certainly dead. The champion lost interest, lost influence, or left. Recovery rate: <5%.

**Action**: Breakup email. If no response in 5 days, close as lost.

### Combination 2: "The Silent Champion"
- No response to 2+ outreaches
- Meetings cancelled without rebooking
- Activity still shows email opens (but no replies)

**Diagnosis**: Champion is avoiding a difficult conversation. They may have chosen a competitor, lost budget, or been overruled internally. Recovery rate: 15-20% with channel switch.

**Action**: Go around. Contact a different stakeholder. If that fails, executive-to-executive outreach.

### Combination 3: "The Stalled Evaluation"
- Stage duration 2x average
- No economic buyer engagement
- Buyer requesting more demos / features without clear criteria

**Diagnosis**: The evaluators like you, but no one with authority is driving a decision. The deal will drift indefinitely without intervention. Recovery rate: 30-40% with EB engagement.

**Action**: Build the business case. Request executive alignment meeting.

### Combination 4: "The Budget Squeeze"
- Deal value decreased
- Buyer requesting pricing concessions
- Close date pushed
- Budget-related language in recent communications

**Diagnosis**: Budget was cut, reallocated, or never confirmed. Recovery rate: 25-35% with deal restructuring.

**Action**: Propose phased approach. Build stronger ROI case. Identify alternative budget sources.

### Combination 5: "The Competitive Ambush"
- New evaluation criteria introduced late
- Buyer asking about features you do not have
- Request for "best and final offer"
- Buyer going quiet after previously being engaged

**Diagnosis**: A competitor entered the evaluation and is gaining traction. Recovery rate: 20-30% with differentiation strategy.

**Action**: Ask directly about the competitive landscape. Differentiate on buyer's criteria. Arrange competitive reference call.

---

## Data Source Reliability Ranking

When multiple data sources conflict, prioritize in this order:

| Rank | Data Source | Reliability | Why |
|---|---|---|---|
| 1 | Activity patterns (meetings, emails, calls) | Highest | Behavioral data is the most honest -- actions do not lie |
| 2 | CRM timeline data (days in stage, close date changes) | High | Objective timestamps are hard to dispute |
| 3 | Task completion patterns | Medium-High | Shows execution quality for both sides |
| 4 | Contact engagement breadth | Medium-High | Multi-threading is a structural indicator |
| 5 | Deal health score (composite) | Medium | Only as good as its component signals |
| 6 | Rep self-assessment | Medium-Low | Optimism bias is real and persistent |
| 7 | Buyer verbal statements | Low | People say what is socially expected, not always what is true |

**The golden rule of deal diagnosis**: When behavior and words conflict, believe the behavior. A buyer who says "we're excited" but cancels the next meeting is not excited. A buyer who says "I have some concerns" but keeps scheduling next steps is actually engaged.
