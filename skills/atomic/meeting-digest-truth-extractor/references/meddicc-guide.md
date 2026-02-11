# Complete MEDDICC Extraction Guide for Meeting Transcripts

A field-by-field guide for extracting MEDDICC intelligence from meeting transcripts. For each letter: what to listen for, example phrases that indicate strength vs. gaps, questions that uncover each element, and how to update CRM fields from findings.

## Table of Contents

1. [MEDDICC Overview and Extraction Principles](#meddicc-overview-and-extraction-principles)
2. [M -- Metrics](#m----metrics)
3. [E -- Economic Buyer](#e----economic-buyer)
4. [D -- Decision Criteria](#d----decision-criteria)
5. [D -- Decision Process](#d----decision-process)
6. [I -- Identify Pain](#i----identify-pain)
7. [C -- Champion](#c----champion)
8. [C -- Competition](#c----competition)
9. [MEDDICC Scoring Matrix](#meddicc-scoring-matrix)
10. [Transcript-to-CRM Field Mapping](#transcript-to-crm-field-mapping)
11. [Common MEDDICC Extraction Mistakes](#common-meddicc-extraction-mistakes)

---

## MEDDICC Overview and Extraction Principles

MEDDICC is the enterprise sales qualification framework used by the world's highest-performing B2B organizations. It is not a checklist -- it is a diagnostic tool that reveals deal health and predicts outcomes.

### Why MEDDICC Extraction from Transcripts Matters

- **Only 29% of reps update CRM after meetings** (Salesforce State of Sales, 2024). Automated extraction captures what manual processes miss.
- **Deals with 5+ MEDDICC fields completed close at 3.1x the rate** of deals with 2 or fewer fields complete (Challenger Inc., 2023).
- **MEDDICC field accuracy degrades 40% within 48 hours** of a meeting if not captured immediately (Ebsta pipeline analysis). Transcript-based extraction eliminates the recall problem.
- **Forecast accuracy improves by 27%** when MEDDICC fields are derived from transcript evidence rather than rep self-reporting (Clari, 2024).

### Extraction Principles

1. **Extract deltas, not full state.** A meeting changes the MEDDICC picture -- it does not replace it. Extract only what changed.
2. **Attribute to speakers.** Every MEDDICC data point must be attributed to a specific person with their authority level noted.
3. **Distinguish strength vs. gaps.** For each field, categorize findings as "confirmed," "updated," "gap identified," or "contradicted."
4. **Quote the source.** Every MEDDICC change must include the verbatim quote from the transcript that supports it.
5. **Cross-reference CRM.** Compare transcript findings against current CRM values. Flag discrepancies as deltas.

---

## M -- Metrics

**What it means:** The quantifiable measures of success that the prospect has defined. Metrics answer: "How will they measure whether our solution works?"

### What to Listen For

| Signal Type | Example Phrases | Confidence |
|------------|----------------|------------|
| **Explicit metrics** | "We need to reduce churn by 15%." | High |
| **Explicit metrics** | "Our target is $2M in pipeline by Q3." | High |
| **Explicit metrics** | "If we can cut onboarding from 6 weeks to 2, that's a win." | High |
| **Implied metrics** | "We're losing too many customers." | Medium -- needs quantification |
| **Implied metrics** | "Our process is too slow." | Low -- too vague |
| **Metric comparison** | "Right now it takes 14 days; we want it under 5." | High -- current vs. target |
| **Metric retraction** | "Actually, the churn number isn't the priority anymore." | High -- field update required |
| **New metric introduced** | "What we really care about is time-to-value." | High -- new field, previously unknown |

### Strength vs. Gap Assessment

| Strength Level | Criteria | Example |
|---------------|----------|---------|
| **Strong** | Specific number, specific timeframe, linked to business outcome | "Reduce support ticket volume by 30% within 6 months, saving $400K annually" |
| **Moderate** | Directional with some specificity | "We want to improve retention -- maybe 10-15% improvement" |
| **Weak** | Vague or undefined | "We want things to get better" |
| **Gap** | No metrics discussed at all | Metrics never mentioned in any meeting |

### Questions That Uncover Metrics

| Question | What It Reveals | When to Ask |
|----------|----------------|-------------|
| "What would success look like in numbers?" | Primary success metric | Discovery |
| "How are you measuring this today?" | Current measurement and baseline | Discovery |
| "What happens if this metric doesn't improve?" | Consequence of inaction (urgency) | Discovery / Demo |
| "Who reviews these numbers and how often?" | Accountability and visibility of the metric | Mid-stage |
| "What's the current baseline for [metric]?" | Enables ROI calculation | Demo |
| "Is there an internal target you've committed to?" | Whether metric is aspirational or mandated | Qualification |

### CRM Update Guide

| Transcript Finding | CRM Action |
|-------------------|------------|
| New specific metric mentioned | Add to Metrics field with quote, date, and speaker |
| Existing metric updated (new number) | Update Metrics field, note "updated from [old] to [new]" |
| Metric confirmed (same as CRM) | Mark as "Confirmed [date]" -- no change needed |
| Metric retracted or deprioritized | Update Metrics, flag: "Prospect deprioritized [metric] as of [date]" |
| Vague metric mentioned | Add to Metrics with flag: "Needs quantification in next meeting" |

---

## E -- Economic Buyer

**What it means:** The person with the authority to allocate budget and make the final purchasing decision. They can say "yes" when everyone else says "no."

### What to Listen For

| Signal Type | Example Phrases | Confidence |
|------------|----------------|------------|
| **Direct identification** | "Janet in Finance signs off on purchases over $50K." | High |
| **Self-identification** | "I can approve up to $100K without board approval." | High |
| **Indirect identification** | "That would need to go through our CFO." | High |
| **Budget authority signal** | "I have budget for this in Q2." | High -- speaker is likely EB |
| **Delegation signal** | "The VP gave me authority to evaluate and recommend." | Medium -- recommender, not EB |
| **Process reveal** | "Anything over $75K goes to our procurement committee." | High -- reveals threshold |
| **EB change** | "Actually, since the reorg, Maria handles all vendor decisions." | High -- critical update |

### Strength vs. Gap Assessment

| Strength Level | Criteria | Example |
|---------------|----------|---------|
| **Strong** | EB identified by name, title confirmed, engaged in the process | "Sarah Kim, CFO, attended the last meeting and expressed interest" |
| **Moderate** | EB identified by role but not by name, or identified but not engaged | "The VP of Ops would need to approve, but we haven't met them yet" |
| **Weak** | EB role known but person unknown | "Someone in finance handles this" |
| **Gap** | No EB discussion at all | No one has mentioned who approves budget |

### Questions That Uncover Economic Buyer

| Question | What It Reveals | When to Ask |
|----------|----------------|-------------|
| "Who has final budget authority for this purchase?" | Direct EB identification | Discovery / Qualification |
| "What's the approval process for a purchase of this size?" | Process and threshold | Mid-stage |
| "If your team recommends this, who signs off?" | Chain of command | After demo |
| "Has your team made a purchase like this before? Who approved it?" | Historical pattern | Discovery |
| "Would it make sense to include [EB] in our next conversation?" | Test access and willingness | Pre-negotiation |

### CRM Update Guide

| Transcript Finding | CRM Action |
|-------------------|------------|
| EB identified by name + title | Set Economic Buyer field: "[Name], [Title]" |
| EB changed (different person than CRM) | Update EB field, add note: "EB changed from [old] to [new] as of [date]" |
| Budget range revealed | Add to Economic Buyer notes: "Budget range: $[X]-$[Y]" |
| Approval process clarified | Add to Decision Process: "Approval requires [steps]" |
| Speaker claims authority | Update EB if evidence supports, flag if uncertain |

---

## D -- Decision Criteria

**What it means:** The requirements, standards, and evaluation factors the prospect uses to compare solutions. These are the "must-haves" and "nice-to-haves."

### What to Listen For

| Signal Type | Example Phrases | Confidence |
|------------|----------------|------------|
| **Explicit criterion** | "Security certification is non-negotiable." | High |
| **Explicit criterion** | "We need native Salesforce integration." | High |
| **Ranked criterion** | "Speed of implementation is our #1 priority." | High -- priority ranking |
| **Weighted criterion** | "Total cost of ownership over 3 years is the deciding factor." | High -- evaluation weight |
| **Criterion met** | "Your SOC2 cert checks that box." | High -- positive validation |
| **Criterion unmet** | "We need HIPAA and you don't have that yet." | High -- gap identified |
| **Criterion changed** | "Actually, security is now more important than integration." | High -- priority shift |
| **Hidden criterion** | "My boss really cares about mobile access." | Medium -- not official but influential |

### Strength vs. Gap Assessment

| Strength Level | Criteria | Example |
|---------------|----------|---------|
| **Strong** | Written evaluation criteria shared, weighted, your solution scores well | "Here's our evaluation matrix. You score 4.2/5 overall." |
| **Moderate** | Verbal criteria stated, partially validated | "We need integration, security, and ease of use. You seem good on 2 of 3." |
| **Weak** | Criteria implied but not stated explicitly | "We need something that just works" |
| **Gap** | No criteria discussed | Prospect has not shared how they will evaluate |

### Questions That Uncover Decision Criteria

| Question | What It Reveals | When to Ask |
|----------|----------------|-------------|
| "What are the must-haves for your evaluation?" | Non-negotiable requirements | Discovery / Demo |
| "How will you compare the options you're evaluating?" | Evaluation methodology | Demo |
| "If you had to rank your top 3 criteria, what would they be?" | Priority order | Mid-evaluation |
| "Are there any deal-breakers we should know about?" | Elimination criteria | Early stage |
| "Has the criteria changed since we last spoke?" | Detect shifts | Any follow-up meeting |

### CRM Update Guide

| Transcript Finding | CRM Action |
|-------------------|------------|
| New criterion stated | Add to Decision Criteria field with priority rank |
| Criterion met | Mark as "Met" in criteria list with evidence |
| Criterion unmet | Mark as "Gap" with mitigation plan |
| Criterion weight changed | Update priority ranking, note date of change |
| Hidden criterion from stakeholder | Add with note: "Informal -- raised by [name], not official criteria" |

---

## D -- Decision Process

**What it means:** The steps, timeline, and approvals required to go from "evaluation" to "signed contract." This is the prospect's internal buying process.

### What to Listen For

| Signal Type | Example Phrases | Confidence |
|------------|----------------|------------|
| **Timeline explicit** | "We need to make a decision by end of Q1." | High |
| **Step identification** | "Next step is a technical review with engineering." | High |
| **Process reveal** | "Board meets monthly -- we'd need the March meeting." | High |
| **Timeline acceleration** | "We're fast-tracking this -- can you move quicker?" | High -- positive |
| **Timeline delay** | "We're pushing the evaluation to next quarter." | High -- negative |
| **New step added** | "We also need a security review now." | High -- scope change |
| **Step completed** | "The technical eval went well. We're past that." | High -- advancement |
| **Process uncertainty** | "I'm not sure what happens after this stage." | Medium -- gap |

### Strength vs. Gap Assessment

| Strength Level | Criteria | Example |
|---------------|----------|---------|
| **Strong** | Full process mapped with dates, steps, stakeholders, and milestones | "Tech review (done) -> Procurement (2 weeks) -> Legal (1 week) -> Sign by March 15" |
| **Moderate** | Partial process known, some dates | "We need legal and procurement, probably 4-6 weeks" |
| **Weak** | Vague timeline, undefined steps | "We'll figure it out when we get there" |
| **Gap** | No process discussed | No one has described how they buy |

### CRM Update Guide

| Transcript Finding | CRM Action |
|-------------------|------------|
| New timeline stated or updated | Update Close Date and Decision Process notes |
| New step introduced | Add to Decision Process with estimated duration |
| Step completed | Mark step complete, update process progression |
| Process accelerated | Update close date (earlier), note reason |
| Process delayed | Update close date (later), note reason and next check-in |

---

## I -- Identify Pain

**What it means:** The specific business problems the prospect is trying to solve. Pain drives urgency and justifies investment.

### What to Listen For

| Signal Type | Example Phrases | Confidence |
|------------|----------------|------------|
| **Quantified pain** | "We waste 10 hours a week on manual data entry." | High |
| **Impact pain** | "We lost a major customer because our response time was too slow." | High |
| **Emotional pain** | "It's incredibly frustrating for the team." | Medium -- real but subjective |
| **Process pain** | "The current tool crashes every time we run a report over 10K rows." | High |
| **Opportunity pain** | "We're missing deals because we can't respond fast enough." | High |
| **Pain confirmed** | "Yes, that's exactly our problem." | High -- validation |
| **Pain deprioritized** | "We've learned to live with it." | Medium -- danger of status quo |
| **New pain revealed** | "Actually, the bigger issue is [new problem]." | High -- pivot |

### Pain Depth Assessment (3 Levels)

| Level | Characteristic | Example | Deal Impact |
|-------|---------------|---------|-------------|
| **Level 1: Surface** | Prospect acknowledges a problem exists | "Yeah, reporting could be better." | Low urgency. No action trigger. |
| **Level 2: Business** | Prospect connects pain to business impact | "Slow reporting means we miss pipeline issues." | Moderate urgency. Building case. |
| **Level 3: Personal** | Prospect connects pain to personal consequences | "My VP has called me out twice in QBRs for bad data." | High urgency. Emotional driver. |

### Questions That Deepen Pain

| Question | Purpose | Depth Level |
|----------|---------|-------------|
| "What's not working in your current process?" | Surface pain | Level 1 |
| "How does that affect your team's [KPI]?" | Connect to business impact | Level 2 |
| "What happens to you personally if this doesn't get solved?" | Connect to personal stakes | Level 3 |
| "What has the cost been so far?" | Quantify the pain | Level 2-3 |
| "How long has this been a problem?" | Assess urgency and tolerance | All levels |

### CRM Update Guide

| Transcript Finding | CRM Action |
|-------------------|------------|
| New pain point identified | Add to Pain field with depth level and quote |
| Existing pain quantified | Update Pain field with numbers |
| Pain confirmed as top priority | Mark as primary pain, note date |
| Pain deprioritized or resolved | Update status, note reason |

---

## C -- Champion

**What it means:** An internal advocate who has access, influence, and personal motivation to drive your deal forward. The champion sells for you when you are not in the room.

### What to Listen For

| Signal Type | Example Phrases | Confidence |
|------------|----------------|------------|
| **Active advocacy** | "I've already mentioned your solution to our CTO." | High |
| **Internal selling** | "I'll bring this to the leadership team next week." | High |
| **Personal stake** | "This would make my team's life so much easier." | High |
| **Sharing internal intel** | "Between you and me, the budget cycle opens in March." | High |
| **Offering access** | "I can set up a meeting with our VP." | High |
| **Equipping themselves** | "Can you send me a one-pager I can share internally?" | High |
| **Weakening signals** | "I like it, but I'm not sure I can sell it internally." | Medium -- weakening |
| **Departure signal** | "I might be moving to a different team next month." | Critical -- risk |

### Champion Strength Test

Every champion must pass three tests. Extract evidence for each from the transcript.

| Test | What to Look For | Strong Signal | Weak Signal |
|------|-----------------|---------------|-------------|
| **Access** | Can they get you meetings with decision-makers? | "I'll set up time with the CFO" | "I don't really interact with the exec team" |
| **Influence** | Do others listen to their recommendations? | Others reference their opinion | They are routinely overruled |
| **Motivation** | Do they have a personal reason to advocate? | "This would be a huge win for my annual review" | "It's nice but not critical for me" |

### CRM Update Guide

| Transcript Finding | CRM Action |
|-------------------|------------|
| Champion identified or confirmed | Set/update Champion field with name and strength rating |
| Champion demonstrated active advocacy | Add to notes: "Champion actively selling internally as of [date]" |
| Champion strength weakened | Update strength rating, flag risk, note evidence |
| New potential champion emerged | Add as secondary champion with assessment notes |
| Champion departing | CRITICAL: Flag deal risk, begin backup champion identification |

---

## C -- Competition

**What it means:** Alternative solutions the prospect is considering, including direct competitors, build-in-house, and status quo (doing nothing).

### What to Listen For

| Signal Type | Example Phrases | Confidence |
|------------|----------------|------------|
| **Named competitor** | "We're also looking at [Competitor]." | High |
| **Feature comparison** | "With [Competitor], we get [capability]." | High |
| **Build-vs-buy** | "Our engineering team thinks they can build this." | High |
| **Status quo preference** | "Honestly, we might just stick with what we have." | High |
| **Competitor eliminated** | "We dropped [Competitor] from consideration." | High -- positive |
| **Competitive pricing** | "[Competitor] offered us 40% off." | High -- pricing pressure |
| **Competitive preference shift** | "After the demo, we're leaning toward [Competitor]." | Critical |
| **Internal competition** | "Another team already bought [different tool]." | Medium -- internal politics |

### Competitive Position Assessment

| Position | Indicators | Action |
|----------|-----------|--------|
| **Leading** | Prospect references you favorably, competitors not mentioned, invited to present to exec | Maintain momentum. Don't get complacent. |
| **Competitive** | Multiple vendors being evaluated, no clear leader | Differentiate on THEIR criteria. Focus on unique value. |
| **Behind** | Prospect mentions competitor favorably, asks you to match features/pricing | Reframe evaluation criteria. Attack competitor weakness. |
| **Status quo risk** | Prospect increasingly comfortable with current state | Quantify cost of inaction. Create urgency. |

### CRM Update Guide

| Transcript Finding | CRM Action |
|-------------------|------------|
| New competitor mentioned | Add to Competition field: "[Name] -- mentioned [date]" |
| Competitor eliminated | Update: "[Name] -- eliminated as of [date]" |
| Competitive preference shift | ALERT: Update competitive position, flag deal risk |
| Build-vs-buy raised | Add: "Internal build option under consideration" |
| Status quo strengthened | Flag: "Status quo risk increasing" |

---

## MEDDICC Scoring Matrix

Use this matrix to score each field after transcript extraction.

| Score | Label | Criteria |
|-------|-------|----------|
| **0** | Unknown | No information gathered on this field |
| **1** | Identified | Field is acknowledged but vague or unverified |
| **2** | Developing | Some evidence, partially validated, gaps remain |
| **3** | Confirmed | Strong evidence from multiple sources, validated |
| **4** | Locked | Formally confirmed, documented, and stable |

### Overall Deal Health Assessment

| Total Score (0-28) | Health | Forecast Category |
|--------------------|--------|------------------|
| 0-7 | Critical | Pipe dream -- not qualified |
| 8-14 | At Risk | Early stage -- needs significant work |
| 15-21 | Healthy | On track -- continue executing |
| 22-28 | Strong | Commit -- high probability of close |

---

## Transcript-to-CRM Field Mapping

| MEDDICC Field | CRM Field Name | Data Type | Update Trigger |
|--------------|----------------|-----------|---------------|
| Metrics | `meddicc_metrics` | Text + Score | New metric, metric change, quantification |
| Economic Buyer | `meddicc_economic_buyer` | Contact ref + Score | EB identified, EB changed, budget revealed |
| Decision Criteria | `meddicc_decision_criteria` | Text + Score | New criterion, criterion met/unmet, priority shift |
| Decision Process | `meddicc_decision_process` | Text + Score | Timeline change, new step, step completion |
| Identify Pain | `meddicc_pain` | Text + Score | New pain, pain quantified, pain deprioritized |
| Champion | `meddicc_champion` | Contact ref + Score | Champion confirmed, strength change, departure |
| Competition | `meddicc_competition` | Text + Score | New competitor, competitor eliminated, position shift |

### Delta Object Format

For each MEDDICC field that changed in the meeting, output:

```
{
  field: "metrics",
  changed: true,
  previous_value: "Reduce churn by 10%",
  new_value: "Reduce churn by 15% within 6 months",
  change_type: "updated",  // "new" | "updated" | "confirmed" | "retracted"
  source_quote: "Actually, our new target is 15% churn reduction -- the board set that at our last offsite.",
  speaker: "Sarah Chen, VP Operations",
  speaker_authority: "high",
  confidence: "high",
  timestamp: "00:23:45",
  crm_action: "Update meddicc_metrics to: 'Reduce churn by 15% within 6 months (board-mandated target)'"
}
```

---

## Common MEDDICC Extraction Mistakes

| Mistake | Example | Correction |
|---------|---------|-----------|
| Accepting surface-level pain as Metrics | "We want to improve" -> marking Metrics as confirmed | Metrics requires specific numbers. Flag for quantification. |
| Confusing Champion with Contact | Main contact ≠ Champion. They may be friendly but lack access or influence. | Validate the 3-test framework (Access, Influence, Motivation). |
| Treating any mention of a name as Economic Buyer | "I'll mention it to my VP" does not mean VP is the EB | EB requires confirmed budget authority, not just seniority. |
| Assuming Decision Criteria are static | Criteria can and do change throughout the evaluation | Re-validate criteria in every meeting. |
| Ignoring the status quo as Competition | "We'll just keep using spreadsheets" is a competitive threat | Status quo is the strongest competitor. Always track it. |
| Overfilling MEDDICC from a single meeting | Trying to populate all 7 fields from one transcript | A single meeting typically yields 2-4 field updates. That is normal. |
| Not cross-referencing CRM baseline | Extracting "new" information that was already in CRM | Always compare transcript findings against current CRM state. |

---

## Sources and References

- MEDDICC Group: Official MEDDICC framework documentation and certification materials
- Challenger Inc. (2023): MEDDICC field completion and win rate correlation study
- Salesforce State of Sales (2024): CRM update rates and data accuracy research
- Ebsta (2024): Pipeline data decay analysis -- MEDDICC field accuracy over time
- Clari (2024): Forecast accuracy improvement through evidence-based MEDDICC vs. self-reported
- Gong Labs (2023): Conversation patterns that reveal MEDDICC intelligence
- Forrester (2024): B2B buying process complexity and qualification framework effectiveness
- Andy Whyte, "MEDDICC: The Ultimate Guide" (2020): Foundational reference for the framework
