# Diagnostic Frameworks for Deal Slippage

Diagnostic questioning frameworks for deal reviews, manager escalation templates, deal review meeting agendas, and the "5 Whys" adapted for deal slippage. This is the operational guide for investigating and addressing pipeline risk.

## Table of Contents
1. [The 5 Whys for Deal Slippage](#the-5-whys-for-deal-slippage)
2. [Deal Review Meeting Framework](#deal-review-meeting-framework)
3. [Manager Escalation Templates](#manager-escalation-templates)
4. [Diagnostic Questioning Sequences](#diagnostic-questioning-sequences)
5. [Root Cause Decision Tree](#root-cause-decision-tree)
6. [The Pipeline Triage Framework](#the-pipeline-triage-framework)
7. [Deal Forensics: Post-Mortem Analysis](#deal-forensics-post-mortem-analysis)
8. [Weekly Pipeline Review Agenda](#weekly-pipeline-review-agenda)

---

## The 5 Whys for Deal Slippage

Adapted from Toyota's manufacturing methodology for sales pipeline analysis. The purpose is to get past symptoms ("the deal is stalling") to root causes ("the economic buyer was never engaged because the champion is afraid of being overruled").

### How to Apply

Start with the symptom. Ask "Why?" five times. Each answer becomes the subject of the next "Why?"

### Example 1: The Silent Champion

```
SYMPTOM: The Acme Corp deal has had no activity in 18 days.

WHY #1: Why has there been no activity?
-> Sarah Chen (champion) has not responded to 3 emails and 1 call.

WHY #2: Why has Sarah not responded?
-> Sarah's LinkedIn shows she was promoted to VP of Ops last week.
   She may be overwhelmed with new responsibilities.

WHY #3: Why does her promotion create a risk for this deal?
-> As Director, she was the project champion. As VP, she has
   broader responsibilities and may delegate this initiative to
   someone who does not have the same conviction.

WHY #4: Why is this a problem?
-> We are single-threaded through Sarah. No one else at Acme
   knows about the evaluation. If Sarah deprioritizes, the deal
   dies because there is no backup advocate.

WHY #5: Why are we single-threaded?
-> We never asked Sarah to introduce us to other stakeholders.
   We relied on her enthusiasm as sufficient for the deal to
   progress.

ROOT CAUSE: Single-threaded engagement due to over-reliance
on one champion. The promotion is the trigger, but the
structural weakness (no multi-threading) is the real cause.

FIX: Go around Sarah to Mike Torres (VP Eng, was CC'd on
intro email). Simultaneously reach out to Sarah to congratulate
her on the promotion and gently ask about the project.
```

### Example 2: The Endless Evaluation

```
SYMPTOM: The GlobalTech deal has been in Evaluation stage for
47 days (2.6x the average of 18 days).

WHY #1: Why has evaluation taken so long?
-> The buyer keeps requesting additional demos and feature
   comparisons. Three demos completed with no clear next step.

WHY #2: Why are they requesting more demos instead of deciding?
-> The evaluation criteria keep changing. New requirements
   were added after the second demo.

WHY #3: Why are the criteria changing?
-> A new VP of Engineering was hired 3 weeks ago and has
   different priorities than the original team.

WHY #4: Why has the new VP changed the direction?
-> The new VP is bringing architecture preferences from their
   previous company and is evaluating from a different lens
   than the original team.

WHY #5: Why did we not adapt to the new stakeholder?
-> We were not aware of the hire until the third demo when
   new requirements appeared. We have not had a direct
   conversation with the new VP.

ROOT CAUSE: New stakeholder with different priorities entered
the evaluation late. We failed to detect the organizational
change and adapt our approach.

FIX: Request a meeting specifically with the new VP to
understand their priorities. Reset the evaluation criteria
based on the new stakeholder's requirements.
```

### Example 3: The Budget Squeeze

```
SYMPTOM: Deal value decreased from $180K to $95K and close
date was pushed from March to June.

WHY #1: Why was the deal restructured?
-> The buyer said "budget constraints" and asked for a
   smaller scope.

WHY #2: Why are there budget constraints?
-> The company missed Q4 earnings and implemented a
   cost-reduction initiative.

WHY #3: Why does the cost reduction affect this deal?
-> The initiative was classified as "growth investment" not
   "operational necessity." Growth budgets were cut 40%.

WHY #4: Why was this classified as growth, not necessity?
-> Our business case focused on revenue growth potential
   rather than cost savings or risk reduction.

WHY #5: Why did we position it as growth?
-> Discovery conversations were with the sales team who
   cared about growth. We never engaged finance or ops
   who would have valued cost reduction.

ROOT CAUSE: Business case was misaligned with the buyer's
economic reality. By positioning as "growth," we made the
deal vulnerable to budget cuts. A cost-savings narrative
would have survived the cut.

FIX: Rebuild the business case around cost reduction and
risk mitigation. Engage the CFO or VP of Finance with the
revised narrative.
```

### The 5 Whys Rules

1. **Never stop at the first answer.** "The buyer is busy" is a symptom, not a root cause.
2. **Follow the evidence, not assumptions.** Each "why" should be grounded in specific data.
3. **The root cause is usually structural or strategic, not situational.** "Champion went dark" is situational. "We were single-threaded" is structural.
4. **The root cause should suggest a specific action.** If the root cause does not point to a fix, you have not dug deep enough.
5. **Five is a guideline, not a rule.** Sometimes three Whys reach the root cause. Sometimes seven are needed.

---

## Deal Review Meeting Framework

### 1-on-1 Deal Review (Rep + Manager)

**Duration**: 15-20 minutes per deal. Review 3-5 deals per session.

**Frequency**: Weekly for deals in negotiation/closing. Bi-weekly for evaluation-stage deals.

**Agenda per deal**:

```
DEAL: [Name] | VALUE: $[X] | STAGE: [Y] | CLOSE DATE: [Z]

1. WHAT HAPPENED SINCE LAST REVIEW? (2 min)
   - Key activities, meetings, communications
   - Any changes in buyer behavior or engagement

2. WHAT IS THE CURRENT RISK LEVEL? (3 min)
   - Active risk signals (from signal taxonomy)
   - New risks identified since last review
   - Risk score: [number]

3. WHAT IS THE ROOT CAUSE OF ANY RISK? (3 min)
   - Apply 5 Whys if risk is new
   - Assess whether previous risks were resolved

4. WHAT IS THE PLAN FOR THIS WEEK? (3 min)
   - Top 1-2 actions, ranked by impact
   - Who owns each action
   - What "success" looks like for each action

5. DO WE NEED HELP? (2 min)
   - Executive support needed?
   - SE or technical resource needed?
   - Pricing flexibility needed?
   - Other resource or strategy question?

6. HONEST ASSESSMENT (2 min)
   - Probability of close this quarter: [%]
   - Should we continue investing time in this deal?
   - Commit/Upside/At-Risk classification
```

### The "Prove It" Questions

Managers should ask these questions to pressure-test rep confidence:

| Rep Says | Manager Asks |
|---|---|
| "They love our product" | "What action have they taken that demonstrates commitment?" |
| "We're the frontrunner" | "How do you know? Have they told you who else they're evaluating?" |
| "Close date is March 15" | "Has the buyer confirmed that date? What milestones need to happen before then?" |
| "The champion is strong" | "Who else have you met? What happens if the champion leaves?" |
| "Budget is approved" | "Who approved it? Have you confirmed this with the economic buyer directly?" |
| "Just waiting on legal" | "What specifically is legal reviewing? When did you last check on the status?" |
| "No competition" | "Every deal has competition -- even if it's 'do nothing.' What's their alternative?" |
| "This will close this quarter" | "Walk me through every step between now and signature. Do the dates add up?" |

---

## Manager Escalation Templates

### Template 1: Urgent Deal Risk Notification

Use when: A high-value deal ($100K+) hits critical risk severity.

```
SUBJECT: [URGENT] $[Value] deal at risk - [Deal Name]

DEAL: [Name] ($[Value])
STAGE: [Current Stage]
CLOSE DATE: [Date] (pushed [X] times)
REP: [Name]

RISK SUMMARY:
[1-2 sentences describing the risk in plain language]

SIGNALS:
- [Signal 1]: [specific data point]
- [Signal 2]: [specific data point]
- [Signal 3]: [specific data point]

ROOT CAUSE: [diagnosis in one sentence]

WHAT WE'VE TRIED:
- [Action 1] on [date] - [result]
- [Action 2] on [date] - [result]

WHAT WE NEED:
- [Specific ask: executive outreach, pricing flexibility,
  SE resource, strategic guidance]

TIMELINE: Action needed by [date] to stay within the rescue
window.
```

### Template 2: Pipeline Health Summary

Use when: Weekly or bi-weekly pipeline review with leadership.

```
PIPELINE HEALTH REPORT - Week of [Date]

SUMMARY:
- Total pipeline: $[X] across [Y] deals
- At-risk pipeline: $[Z] ([%] of total)
- Deals at critical severity: [count] ($[value])
- Deals at high severity: [count] ($[value])

TOP 3 RISKS:

1. [Deal Name] ($[Value]) - CRITICAL
   Root cause: [one sentence]
   Action: [what we're doing]
   Need: [what we need from leadership]

2. [Deal Name] ($[Value]) - CRITICAL
   Root cause: [one sentence]
   Action: [what we're doing]
   Need: [what we need from leadership]

3. [Deal Name] ($[Value]) - HIGH
   Root cause: [one sentence]
   Action: [what we're doing]
   Need: [what we need from leadership]

WINS SINCE LAST REPORT:
- [Deal rescued]: [what we did and what worked]

DISQUALIFIED:
- [Deal name] ($[value]): [reason - this is healthy pipeline
  management, not failure]

FORECAST IMPACT:
- Committed: $[X] (unchanged / up / down from last week)
- Upside: $[X]
- At-risk: $[X] (potential downside if risks are not addressed)
```

### Template 3: Executive Intervention Request

Use when: The deal needs executive-to-executive outreach.

```
[Executive],

I need your help on the [Deal Name] ($[Value]) deal.

CONTEXT: We've been working with [Champion Name] at [Company]
on [brief description]. The deal was progressing well until
[what changed].

THE ASK: A 15-minute call or email from you to [Their Executive
Name + Title] to discuss strategic alignment. The goal is to
[specific outcome: re-establish priority, confirm budget,
introduce yourself as the executive sponsor].

TALKING POINTS:
1. [Point relevant to their executive's priorities]
2. [Proof point: customer result or industry data]
3. [Specific next step to propose]

TIMING: Before [date] -- the rescue window closes [date].

I'll prepare a one-page briefing document for your review.
```

---

## Diagnostic Questioning Sequences

### Sequence 1: Staleness Diagnosis

Use when: Deal has been inactive for 7+ days.

```
Step 1: CHECK CRM
- When was the last activity? What type?
- Who was the last person to engage?
- Are there overdue tasks?

Step 2: CHECK CONTACTS
- Is the champion still at the company? (LinkedIn)
- Have any stakeholders changed roles?
- Are there other contacts we could reach?

Step 3: CHECK HISTORY
- Was the last interaction positive, neutral, or negative?
- Were there any unanswered questions or pending deliverables?
- Did we promise something we didn't deliver?

Step 4: CHECK CONTEXT
- Is the buyer's company in a known busy period?
- Is there any market/industry event affecting them?
- Did anything change on our side (pricing, product, team)?

Step 5: DETERMINE ROOT CAUSE
- If champion is unresponsive: "champion_dark"
- If everyone is unresponsive: "organizational_change" or "lost_deal"
- If we dropped the ball: "poor_execution"
- If buyer is in a planned pause: "not a risk" (document and monitor)
```

### Sequence 2: Stalled Stage Diagnosis

Use when: Deal has been in the same stage for 2x the average duration.

```
Step 1: WHAT IS THE EXIT CRITERIA?
- What must be true for this deal to advance?
- Which criteria are met? Which are not?

Step 2: WHAT IS BLOCKING?
- Is it a person? (Who, and why are they blocking?)
- Is it a process? (What process, and what is the bottleneck?)
- Is it information? (What data is missing?)
- Is it a decision? (Who needs to decide, and what are they weighing?)

Step 3: IS THE BLOCK FIXABLE?
- Can we address it directly? (Provide information, schedule a meeting)
- Do we need help? (Executive support, technical resource, pricing)
- Is it outside our control? (Budget cycle, regulatory, M&A)

Step 4: WHAT HAS BEEN TRIED?
- What actions has the rep taken to unblock?
- Have they tried multiple approaches?
- Is there a pattern to what is not working?

Step 5: PRESCRIBE THE INTERVENTION
- If person-blocked: go around, go above, or go lateral
- If process-blocked: proactively complete requirements
- If information-blocked: provide or gather the missing data
- If decision-blocked: build the business case and engage the decision maker
```

### Sequence 3: Forecast Accuracy Diagnosis

Use when: Validating whether a committed deal will actually close on time.

```
Step 1: CLOSE DATE VALIDATION
- Has the buyer confirmed this date? (Not just the rep's estimate)
- What milestones need to happen before this date?
- Is there enough calendar time for all remaining steps?

Step 2: MILESTONE AUDIT
- List every step between now and signature
- Assign realistic duration to each step
- Add 20% buffer
- Does the math work?

Step 3: STAKEHOLDER VERIFICATION
- Has everyone who needs to approve been engaged?
- Is the signatory identified and available?
- Are there any stakeholders who have not been consulted?

Step 4: RISK SCAN
- Run the deal through the 15-signal taxonomy
- Are there any unaddressed risk signals?
- What is the honest probability of closing on time?

Step 5: COMMIT CLASSIFICATION
- COMMIT: >80% probability, all milestones achievable, buyer confirmed
- UPSIDE: 50-80% probability, most milestones achievable, some risk
- AT-RISK: <50% probability, significant blockers, unconfirmed timeline
```

---

## Root Cause Decision Tree

Follow this tree to determine the primary root cause of deal slippage.

```
START: The deal is slipping. What is the primary evidence?

[A] Buyer is not responding
    |
    +--> How many contacts have you tried?
         |
         +--> Only 1 contact -> ROOT CAUSE: Single-threaded / Champion Dark
         |    PRIORITY FIX: Multi-thread into other contacts
         |
         +--> 2+ contacts, all silent -> Is there a known org change?
              |
              +--> YES -> ROOT CAUSE: Organizational Change
              |    PRIORITY FIX: Research new landscape, fresh outreach
              |
              +--> NO -> ROOT CAUSE: Lost deal or deprioritized
                   PRIORITY FIX: Breakup email, then reassess

[B] Timeline keeps moving
    |
    +--> Is there a compelling event or deadline?
         |
         +--> NO -> ROOT CAUSE: No Compelling Event
         |    PRIORITY FIX: Create urgency with cost of delay
         |
         +--> YES, but deal still slips -> Is the economic buyer engaged?
              |
              +--> NO -> ROOT CAUSE: Missing Decision Maker
              |    PRIORITY FIX: Build business case, request EB meeting
              |
              +--> YES -> ROOT CAUSE: Process/Procurement Blocker
                   PRIORITY FIX: Map procurement, proactively complete reqs

[C] Deal value is decreasing
    |
    +--> Was the reduction buyer-demanded or seller-initiated?
         |
         +--> Buyer-demanded -> ROOT CAUSE: Budget Issue
         |    PRIORITY FIX: Restructure deal, alternative funding
         |
         +--> Seller-initiated (discounting) -> ROOT CAUSE: Competitor Risk
              PRIORITY FIX: Differentiate on buyer criteria, not price

[D] Technical/product concerns raised
    |
    +--> ROOT CAUSE: Technical Blocker
         PRIORITY FIX: Engineer-to-engineer deep-dive, focused POC

[E] Buyer says they like it but nothing moves
    |
    +--> Are they taking actions (not just words)?
         |
         +--> YES (actions + words positive) -> Patience, deal is healthy
         |
         +--> NO (words positive, actions absent) -> Is the EB engaged?
              |
              +--> NO -> ROOT CAUSE: Missing Decision Maker
              |
              +--> YES -> ROOT CAUSE: Hidden objection or competitor
                   PRIORITY FIX: Direct conversation: "What would need
                   to be true for you to move forward this month?"
```

---

## The Pipeline Triage Framework

When multiple deals need attention simultaneously, use this triage framework to determine priority order.

### Step 1: Score Each Deal

Use the risk score formula:
```
Risk Score = Signal Severity Sum x Value Weight x Proximity Weight
```

### Step 2: Plot on the Save-or-Kill Matrix

| | High Value ($100K+) | Medium Value ($50K-$100K) | Low Value (<$50K) |
|---|---|---|---|
| **Salvageable** (clear fix, engaged contacts) | SAVE FIRST | Save | Save if time permits |
| **Uncertain** (mixed signals, unclear diagnosis) | Diagnose then decide | Diagnose, lean toward save | Deprioritize |
| **Unsalvageable** (dead signals, no response) | Executive intervention or kill | Kill | Kill immediately |

### Step 3: Allocate Time

| Priority | Time Allocation | Deals |
|---|---|---|
| Tier 1 (Save First) | 50% of weekly rescue time | 1-2 deals maximum |
| Tier 2 (Save) | 30% of weekly rescue time | 2-3 deals |
| Tier 3 (Diagnose/Monitor) | 15% of weekly rescue time | 3-5 deals |
| Tier 4 (Kill) | 5% (just the admin of closing) | As needed |

### The Time Budget Rule

A rep should spend no more than 20% of their selling time on rescue activities. If more than 20% of the pipeline is at critical risk, the problem is pipeline quality, not rescue execution. The fix is upstream: better qualification, earlier multi-threading, more disciplined stage advancement.

---

## Deal Forensics: Post-Mortem Analysis

After a deal is lost, conduct a post-mortem to improve future performance.

### Post-Mortem Questions

| Question | What It Reveals |
|---|---|
| When did the first risk signal appear? | Detection speed -- are we catching problems early enough? |
| What was the root cause? | Pattern identification -- do we keep losing for the same reason? |
| At what stage did the deal actually die? | Pipeline quality -- are we advancing deals prematurely? |
| Did we attempt rescue? If so, what worked and what did not? | Rescue effectiveness -- are our interventions effective? |
| Was the deal worth pursuing in the first place? | Qualification quality -- are we spending time on the right deals? |
| What would we do differently? | Learning extraction -- continuous improvement |

### Loss Pattern Analysis

Track these categories over time. Patterns reveal systemic issues:

| Loss Reason | If Frequency > 20% | Systemic Fix |
|---|---|---|
| Champion went dark | Multi-threading training | Require 3+ contacts before stage 3 |
| No compelling event | Urgency creation techniques | Require compelling event documentation at qualification |
| Missing economic buyer | Executive engagement coaching | Require EB identification before stage 4 |
| Competitor won | Competitive intelligence program | Update battlecards, arrange reference customers |
| Budget issue | Business case methodology | Require ROI model before proposal stage |
| Technical blocker | Earlier technical validation | Require technical review before evaluation stage |
| Poor qualification | Tighter ICP criteria | Implement scoring at deal creation |

---

## Weekly Pipeline Review Agenda

### 30-Minute Team Pipeline Review

**Cadence**: Weekly, same day and time.

**Attendees**: Sales manager + all reps.

**Agenda**:

```
1. PIPELINE SNAPSHOT (5 min)
   - Total pipeline value and deal count
   - New deals added this week
   - Deals closed (won and lost) this week
   - Deals advanced to next stage this week

2. CRITICAL RISK DEALS (10 min)
   - Review top 3 deals at critical severity
   - For each: what is the root cause, what is the plan,
     what help is needed?
   - Decision: save, escalate, or kill

3. FORECAST ACCURACY CHECK (5 min)
   - Committed deals: are they still on track?
   - Any commits that should be downgraded?
   - Any upside deals that should be upgraded?

4. WINS AND LOSSES (5 min)
   - What worked on deals we won?
   - What can we learn from deals we lost?
   - Any patterns across the team?

5. THIS WEEK'S PRIORITIES (5 min)
   - Each rep states their #1 deal priority and the specific
     action they will take
   - Manager confirms or redirects
```

**Rules**:
- No deal gets more than 3 minutes of discussion
- If a deal needs deeper analysis, schedule a separate 1-on-1
- Reps update CRM BEFORE the meeting, not during
- Focus on actions, not storytelling
- "I feel good about it" is not an acceptable status update. Data or actions only.
