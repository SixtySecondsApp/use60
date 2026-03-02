# Proposal Templates by Deal Stage

A comprehensive reference with stage-specific templates, annotated examples, and length guidelines. Each template adapts the proposal structure to what the prospect needs to see at their current point in the buying journey.

## Table of Contents

1. [Template Selection Logic](#template-selection-logic)
2. [Discovery-Stage Proposal](#discovery-stage-proposal)
3. [Evaluation-Stage Proposal](#evaluation-stage-proposal)
4. [Negotiation-Stage Proposal](#negotiation-stage-proposal)
5. [Renewal / Expansion Proposal](#renewal--expansion-proposal)
6. [Annotated Examples: Strong Proposals](#annotated-examples-strong-proposals)
7. [Annotated Examples: Weak Proposals](#annotated-examples-weak-proposals)
8. [Proposal Length Guidelines](#proposal-length-guidelines)

---

## Template Selection Logic

The wrong template at the wrong stage kills deals. A heavyweight proposal after a single discovery call signals desperation. A lightweight one-pager during negotiation signals you are not serious.

| Deal Stage | Template | Why |
|-----------|----------|-----|
| Discovery / Qualification | Lightweight | They have not decided they have a problem yet. Heavy proposals scare them off. |
| Evaluation / Demo | Feature-rich | They are comparing options. Give them the data to choose you. |
| Negotiation / Pricing | Final terms | They want to buy. Remove friction. Make it signable. |
| Renewal / Expansion | Account health | They already know you. Show value delivered, then expand. |

If `proposal_stage` is not specified, infer from the deal stage in CRM:
- Lead / Qualified / Discovery -> Discovery template
- Demo / Evaluation / Proposal -> Evaluation template
- Negotiation / Contract -> Negotiation template
- Customer / Renewal -> Renewal template

---

## Discovery-Stage Proposal

**Purpose:** Confirm understanding of their problem, propose a path forward, and earn the next meeting. This is NOT a full proposal -- it is a structured summary of what you heard with a light recommendation.

**Length:** 1-2 pages. Under 800 words.

### Template

```markdown
# {Company Name}: Initial Assessment

## What We Heard

In our conversation on {date}, {contact_name} described the following challenges:

1. **{Pain Point 1}**: "{Direct quote from meeting}" — This is costing your team approximately {impact metric}.
2. **{Pain Point 2}**: "{Direct quote}" — Currently handled by {current workaround}.
3. **{Pain Point 3}**: "{Direct quote}" — Affecting {business area}.

## Our Initial Thinking

Based on what we understand, here is how {your_company} could help:

| Challenge | Approach | Expected Outcome |
|-----------|----------|-----------------|
| {Pain 1} | {High-level solution} | {Projected improvement} |
| {Pain 2} | {High-level solution} | {Projected improvement} |
| {Pain 3} | {High-level solution} | {Projected improvement} |

## What We'd Like to Explore Next

Before putting together a formal proposal, we'd recommend:

1. **{Next step 1}** — e.g., a deeper discovery session with your {team/role}
2. **{Next step 2}** — e.g., a technical review of your current setup
3. **{Next step 3}** — e.g., a quick chat with {stakeholder} to understand their priorities

## Investment Range

Based on similar engagements with companies of your size and scope, investment typically falls between **{low range}** and **{high range}**. We will refine this after the next conversation.

---

*Prepared by {rep_name} | {date} | {your_company}*
```

### Key Principles
- Mirror their language back to them. If they said "our pipeline is a mess," write "pipeline visibility challenges," not "CRM optimization opportunities."
- Do NOT include a full pricing table. Give a range only.
- The goal is the next meeting, not the close.
- Keep it conversational -- this should feel like a summary email, not a legal document.

---

## Evaluation-Stage Proposal

**Purpose:** Provide everything the prospect needs to evaluate your solution against alternatives. This is the workhorse proposal -- feature comparisons, ROI analysis, case studies, and a clear pricing structure.

**Length:** 4-7 pages. 1,500-3,000 words.

### Template

```markdown
# Proposal: {Solution Name} for {Company Name}

Prepared for: {Contact Name}, {Title}
Prepared by: {Rep Name}, {Your Company}
Date: {date}
Valid until: {date + 30 days}

---

## Executive Summary

{Contact_name}, in our conversations on {dates}, you described {core challenge in their words}. This is costing your team {quantified impact -- hours, revenue, churn rate}.

{Your_company} proposes {one-sentence solution} that will deliver {primary outcome} within {timeline}. Companies similar to yours have achieved {proof metric -- e.g., "3.2x ROI within 6 months"}.

## The Challenge

### What You Told Us
- "{Direct quote 1 from meeting}" — {date}
- "{Direct quote 2}" — {date}
- {Summarized pain point with quantified impact}

### The Cost of Inaction
| Metric | Current State | Impact |
|--------|--------------|--------|
| {KPI 1} | {Current value} | {Annual cost or lost opportunity} |
| {KPI 2} | {Current value} | {Annual cost or lost opportunity} |
| **Total annual impact** | | **{Total}** |

## Proposed Solution

### Phase 1: {Phase Name} ({Timeline})
- {Deliverable 1}
- {Deliverable 2}
- **Milestone:** {What success looks like at end of Phase 1}

### Phase 2: {Phase Name} ({Timeline})
- {Deliverable 1}
- {Deliverable 2}
- **Milestone:** {What success looks like at end of Phase 2}

### Phase 3: {Phase Name} ({Timeline})
- {Deliverable 1}
- {Deliverable 2}
- **Milestone:** {What success looks like at end of Phase 3}

## Why {Your Company}

### Relevant Experience
{Case study 1: Company similar to theirs, problem similar to theirs, quantified result}

{Case study 2: Different angle -- speed, scale, industry match}

### How We Compare
| Criteria | {Your Company} | Alternative A | Alternative B |
|----------|---------------|---------------|---------------|
| {Criterion they care about} | {Your strength} | {Competitor gap} | {Competitor gap} |
| {Criterion 2} | {Your strength} | {Competitor position} | {Competitor position} |
| {Criterion 3} | {Your strength} | {Competitor position} | {Competitor position} |

*Note: Only include this comparison if competitors were mentioned in meetings. Do not introduce competitive framing unprompted.*

## Return on Investment

| Metric | Before | After (Projected) | Improvement |
|--------|--------|-------------------|-------------|
| {Their KPI 1} | {Current} | {Projected} | {Delta} |
| {Their KPI 2} | {Current} | {Projected} | {Delta} |
| **Annual value** | | | **{Total annual value}** |
| **Payback period** | | | **{Months}** |

## Investment

{See pricing table structure in SKILL.md. Present 3 tiers, highest first.}

### What's Included
{Itemized list of what each tier covers}

### Payment Terms
{Payment structure -- see references/pricing-strategy.md for guidelines}

## Next Steps

| Step | Owner | Deadline |
|------|-------|----------|
| {Action 1 -- e.g., Review proposal internally} | {Prospect contact} | {Date} |
| {Action 2 -- e.g., Technical evaluation session} | {Both parties} | {Date} |
| {Action 3 -- e.g., Final pricing discussion} | {Rep name} | {Date} |

**To move forward, {single CTA -- e.g., "reply to this email with your preferred tier" or "schedule a review call using [link]"}.**

---

*This proposal is valid for 30 days. Pricing and availability subject to change after {expiry date}.*
```

### Key Principles
- Every claim must trace to a source: CRM, meeting transcript, web research, or case study.
- The comparison table should only appear if the prospect mentioned competitors. Introducing it unprompted signals insecurity.
- ROI projections should use THEIR numbers from discovery, not generic benchmarks.
- The executive summary should be readable in 30 seconds and convey the full value proposition.

---

## Negotiation-Stage Proposal

**Purpose:** Final commercial document. Everything has been discussed. This is the proposal they send to procurement, legal, or the CFO. It must be precise, signable, and professional.

**Length:** 3-5 pages. 1,200-2,000 words. Tight and precise.

### Template

```markdown
# Commercial Proposal: {Your Company} for {Company Name}

Version: {version number}
Date: {date}
Prepared for: {Contact Name}, {Title}
Valid until: {date + 14 days — shorter validity at negotiation stage}

---

## Agreed Scope

Based on our discussions through {date range}, here is the confirmed scope:

| Item | Description | Included |
|------|-------------|----------|
| {Deliverable 1} | {Brief description} | Yes |
| {Deliverable 2} | {Brief description} | Yes |
| {Item discussed but excluded} | {Why excluded} | No |

## Pricing

{Selected tier with full line-item breakdown}

| Line Item | Quantity | Unit Price | Total |
|-----------|----------|-----------|-------|
| {Item 1} | {qty} | {price} | {total} |
| {Item 2} | {qty} | {price} | {total} |
| {Item 3} | {qty} | {price} | {total} |
| **Total** | | | **{Grand total}** |

### Payment Schedule
| Milestone | Amount | Due |
|-----------|--------|-----|
| {Milestone 1 — e.g., Signing} | {Amount or %} | {Date} |
| {Milestone 2 — e.g., Go-live} | {Amount or %} | {Date} |
| {Milestone 3 — e.g., 90-day review} | {Amount or %} | {Date} |

### Terms
- Contract duration: {length}
- Renewal: {auto-renew / manual / opt-in}
- Cancellation: {notice period}
- Price guarantee: {duration}

## Implementation Timeline

| Week | Activity | Owner |
|------|----------|-------|
| 1-2 | {Onboarding / kickoff} | {Owner} |
| 3-4 | {Configuration / setup} | {Owner} |
| 5-6 | {Training / go-live} | {Owner} |
| 7-8 | {Optimization / review} | {Owner} |

## Service Level Commitments
- Uptime: {SLA}
- Support response: {SLA by severity}
- Dedicated point of contact: {Yes/No}

## Next Steps

1. **{Contact name}** reviews and confirms scope — by {date}
2. **{Rep name}** sends final contract — by {date}
3. **Signatures** — target {date}
4. **Kickoff** — {date}

---

*To proceed, {single CTA}.*
```

### Key Principles
- No selling language. This is a business document, not a pitch.
- Every line item must be defensible. If they ask "why does this cost $X?" you must have an answer.
- Include only what has been agreed. Do not sneak in new scope hoping they will not notice.
- Shorter validity period creates natural urgency without being pushy.

---

## Renewal / Expansion Proposal

**Purpose:** Demonstrate value delivered, justify continued or expanded investment, and deepen the relationship.

**Length:** 2-4 pages. 1,000-1,800 words.

### Template

```markdown
# Partnership Review & Renewal: {Company Name}

Prepared for: {Contact Name}, {Title}
Period covered: {start date} to {end date}
Renewal date: {date}

---

## What We've Accomplished Together

### By the Numbers
| Metric | At Start | Current | Change |
|--------|----------|---------|--------|
| {KPI 1 — their success metric} | {Baseline} | {Current} | {Improvement} |
| {KPI 2} | {Baseline} | {Current} | {Improvement} |
| {KPI 3} | {Baseline} | {Current} | {Improvement} |

### Key Wins
1. **{Win 1}**: {Description with specific impact — e.g., "Reduced proposal turnaround from 5 days to 4 hours"}
2. **{Win 2}**: {Description}
3. **{Win 3}**: {Description}

### What Your Team Says
- "{Quote from internal champion or end user}" — {Name, Title}

## Areas for Growth

We see opportunity to expand your results in:

1. **{Opportunity 1}**: {How expanding to new team/use case delivers additional value}
   - Projected impact: {quantified}
2. **{Opportunity 2}**: {Underutilized feature or capability}
   - Projected impact: {quantified}

## Renewal Options

| Option | What Changes | Investment | Savings vs. New |
|--------|-------------|-----------|-----------------|
| **Renew as-is** | Same scope, same terms | {Price} | Locked rate |
| **Expand** | Add {new scope} | {Price} | {Discount %} on expansion |
| **Multi-year** | 2-year commitment | {Price/year} | {Discount %} annual savings |

## Next Steps

| Step | Owner | Date |
|------|-------|------|
| Review renewal options | {Contact} | {Date} |
| Confirm selected option | {Contact} | {Date} |
| Process renewal | {Rep} | {Date} |

---

*Your current agreement expires on {date}. To ensure uninterrupted service, please confirm your preferred option by {date - 14 days}.*
```

### Key Principles
- Lead with their wins, not your features. The proposal should feel like a report card that makes them look good.
- Expansion opportunities should connect to problems they have mentioned, not features you want to sell.
- Multi-year discounts are powerful anchors -- always include the option.
- The urgency is natural (expiration date), not manufactured.

---

## Annotated Examples: Strong Proposals

### Example 1: Opening That Works

> "Sarah, when we spoke on January 12th, you mentioned your team spends roughly 15 hours per week manually building sales reports -- time your reps could spend actually selling. You estimated that translates to about $180K in lost productivity annually. We think we can cut that to under 2 hours."

**Why this works:**
- Names the person (personal)
- Cites a specific date (credible, shows you were listening)
- Uses her exact framing ("manually building sales reports")
- Quantifies the problem in her terms ($180K)
- Proposes a specific outcome (15 hours -> 2 hours)

### Example 2: ROI Section That Works

> | Metric | Today | With {Product} | Annual Impact |
> |--------|-------|---------------|---------------|
> | Reports per week | 5 (manual) | 5 (automated) | 750 hours saved |
> | Rep selling time | 28 hrs/week | 31 hrs/week | +$420K pipeline |
> | Forecast accuracy | 62% | 85% (benchmark) | Fewer surprises |
> | **Total annual value** | | | **$600K+** |
> | **Investment** | | | **$48K/year** |
> | **ROI** | | | **12.5x** |

**Why this works:**
- Uses metrics THEY mentioned (reports per week, rep selling time)
- Shows before/after with specific numbers
- Includes the investment on the same table so ROI is immediate
- Conservative estimates build trust ("+$420K pipeline" not "+$2M revenue")

### Example 3: Next Steps That Work

> | Step | Owner | By When |
> |------|-------|---------|
> | Share this proposal with your CFO | Sarah (we can prep a 1-page exec summary) | Friday Jan 19 |
> | 30-minute technical review with your IT team | Both teams | Week of Jan 22 |
> | Final pricing confirmation | {Rep} | Jan 26 |
> | **Target go-live** | **Both** | **Feb 15** |
>
> **To get started, reply "yes" to this email or [schedule a 15-minute review call](link).**

**Why this works:**
- Every step has an owner AND a date
- Offers to help (exec summary prep) rather than just assigning homework
- Single, clear CTA at the bottom
- Timeline creates momentum without pressure

---

## Annotated Examples: Weak Proposals

### Example 1: Generic Opening

> "Dear Valued Client, thank you for your time. We are excited to present our comprehensive solution that leverages cutting-edge technology to streamline your operations and drive synergies across your organization."

**Why this fails:**
- "Valued Client" -- you do not even know their name?
- "Excited to present" -- this is about you, not them
- "Leverages cutting-edge technology" -- meaningless buzzword
- "Streamline your operations and drive synergies" -- two banned phrases in one sentence
- Zero personalization. Zero specificity. Could be sent to anyone.

### Example 2: ROI Section That Fails

> "Our solution typically delivers 3-5x ROI for companies in your industry. With our proven methodology, you can expect significant improvements in efficiency, productivity, and team satisfaction."

**Why this fails:**
- "Typically delivers 3-5x ROI" -- for whom? Based on what?
- "Companies in your industry" -- which companies? What did they measure?
- "Significant improvements" -- how significant? 5%? 500%?
- "Efficiency, productivity, and team satisfaction" -- three vague promises
- No numbers from THEIR situation. No connection to THEIR metrics.

### Example 3: Weak Next Steps

> "We look forward to hearing from you. Please don't hesitate to reach out if you have any questions. We're confident this solution is the right fit for your team."

**Why this fails:**
- No specific action requested
- No owner, no deadline, no timeline
- "Don't hesitate to reach out" puts all the work on the prospect
- "Confident this solution is the right fit" -- then prove it with specifics
- The deal stalls here because nobody knows what happens next

---

## Proposal Length Guidelines

The right length depends on deal size, complexity, and stage. Longer is not better -- right-sized is better.

| Deal Size | Discovery | Evaluation | Negotiation | Renewal |
|-----------|-----------|-----------|-------------|---------|
| < $10K | 1 page | 2-3 pages | 1-2 pages | 1 page |
| $10K - $50K | 1-2 pages | 3-5 pages | 2-3 pages | 2 pages |
| $50K - $250K | 2 pages | 5-7 pages | 3-5 pages | 2-3 pages |
| $250K+ | 2-3 pages | 7-10 pages | 5-7 pages | 3-4 pages |

### Override Rules

**Go shorter when:**
- The buyer is a founder or solo decision-maker (they do not need internal sell materials)
- You are one of 5+ vendors and need to stand out with clarity
- The prospect explicitly asked for "just the pricing"

**Go longer when:**
- Multiple stakeholders need to review (include an executive summary they can forward)
- The procurement process requires detailed scope documentation
- The engagement is technically complex and requires phased implementation detail
- The prospect asked for "everything in writing"

### The "1-Page Test"

Every proposal, regardless of length, should pass this test: could you extract a single page that contains the problem, the solution, the price, and the next step? If not, the proposal is too scattered. That single page is also what gets forwarded to the CFO.
