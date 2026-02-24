# Milestone Library

Standard milestones by deal stage with duration estimates, success criteria, common blockers, and recovery actions. Use this library to select and customize milestones when building a MAP.

## Table of Contents
1. [How to Use This Library](#how-to-use-this-library)
2. [Discovery Stage Milestones](#discovery-stage-milestones)
3. [Evaluation Stage Milestones](#evaluation-stage-milestones)
4. [Proposal Stage Milestones](#proposal-stage-milestones)
5. [Negotiation Stage Milestones](#negotiation-stage-milestones)
6. [Closing Stage Milestones](#closing-stage-milestones)
7. [Cross-Stage Milestones](#cross-stage-milestones)
8. [Duration Estimation Guide](#duration-estimation-guide)
9. [Blocker Recovery Playbook](#blocker-recovery-playbook)

---

## How to Use This Library

1. Identify the deal's current stage
2. Select milestones from that stage forward (do not include milestones for stages already completed)
3. Customize exit criteria with deal-specific names, dates, and deliverables
4. Check the "Common Blockers" for each milestone and add mitigation to the MAP risks section
5. Adjust durations based on the Duration Estimation Guide at the bottom

**Milestone count targets**: SMB 4-5, Mid-Market 5-6, Enterprise 6-7. More is not better -- each milestone must represent a meaningful gate.

---

## Discovery Stage Milestones

### M-D1: Initial Discovery Complete

**Purpose**: Validate that the problem is real, funded, and urgent enough to pursue.

| Attribute | Value |
|---|---|
| Default Owner | Shared |
| SMB Duration | 3-5 days |
| Mid-Market Duration | 5-7 days |
| Enterprise Duration | 1-2 weeks |

**Exit Criteria**:
- Pain articulated in the buyer's own words (documented in notes)
- Financial impact quantified ($X/month or Y hours/week lost)
- Current solution or workaround identified
- Buyer confirms this is a funded initiative, not an exploration

**Common Blockers**:
- Buyer is "just looking" with no budget or timeline
- Discovery call is surface-level (buyer is polite but not candid)
- Champion cannot articulate the pain in financial terms

**Recovery Actions**:
- Ask the "cost of inaction" question: "What happens if you do nothing for 6 months?"
- Request access to a second stakeholder who experiences the pain daily
- Share a case study from their industry to prompt deeper conversation

---

### M-D2: Stakeholder Map Confirmed

**Purpose**: Identify every person who influences the buying decision and understand the internal politics.

| Attribute | Value |
|---|---|
| Default Owner | Shared |
| SMB Duration | 1-3 days (often same call as discovery) |
| Mid-Market Duration | 5-7 days |
| Enterprise Duration | 1-2 weeks |

**Exit Criteria**:
- Economic buyer identified by name and title
- Technical evaluator identified by name
- Champion confirmed (the person who wants you to win)
- Potential blockers identified
- Decision-making process documented: who approves, in what order, with what criteria

**Common Blockers**:
- Champion is protective and resists introducing other stakeholders
- Economic buyer is unknown or inaccessible
- Organizational chart is unclear or in flux

**Recovery Actions**:
- Ask directly: "Who else needs to be comfortable with this decision?"
- Offer to present to the wider team so the champion does not have to "sell" internally
- Research LinkedIn for likely stakeholders and ask the champion to confirm

---

### M-D3: Buying Process Mapped

**Purpose**: Understand exactly how this company purchases solutions like yours.

| Attribute | Value |
|---|---|
| Default Owner | Customer |
| SMB Duration | 1-2 days |
| Mid-Market Duration | 3-5 days |
| Enterprise Duration | 1-2 weeks |

**Exit Criteria**:
- Steps from "we want to buy" to signed contract documented
- Procurement requirements identified (vendor registration, security review, legal)
- Typical timeline for each step confirmed by the buyer
- Any approval committees or board reviews identified
- Fiscal year boundaries and budget cycle timing confirmed

**Common Blockers**:
- Buyer does not know their own procurement process
- Process has changed recently (new leadership, new procurement system)
- Buyer underestimates the time each step takes

**Recovery Actions**:
- Ask: "When you bought [similar product] last time, what was the process?"
- Offer to speak directly with procurement early to understand requirements
- Build extra buffer into any milestone that depends on procurement

---

## Evaluation Stage Milestones

### M-E1: Solution Demonstration Delivered

**Purpose**: Prove that your solution addresses the buyer's specific problem, not a generic use case.

| Attribute | Value |
|---|---|
| Default Owner | Us |
| SMB Duration | 3-5 days |
| Mid-Market Duration | 5-10 days |
| Enterprise Duration | 1-2 weeks |

**Exit Criteria**:
- Demo uses the buyer's actual data, workflow, or scenarios
- At least 2 stakeholders attend (technical evaluator + champion minimum)
- Buyer provides specific feedback (written preferred)
- No deal-breaking objections raised
- Next step agreed before the demo ends

**Common Blockers**:
- Demo keeps getting rescheduled
- Only one person attends
- Buyer requests features outside the product scope
- Technical environment setup delays the demo

**Recovery Actions**:
- If rescheduled twice, ask directly: "Is the timing still right for this evaluation?"
- If only one person attends, schedule a second demo for the missing stakeholders
- If feature gaps appear, assess honestly: is it a dealbreaker or a nice-to-have?

---

### M-E2: Technical Validation Complete

**Purpose**: Confirm that your solution works in the buyer's technical environment.

| Attribute | Value |
|---|---|
| Default Owner | Shared |
| SMB Duration | 3-5 days |
| Mid-Market Duration | 5-10 days |
| Enterprise Duration | 2-4 weeks |

**Exit Criteria**:
- Integration requirements documented and feasibility confirmed
- Security review initiated or completed (SOC 2, pen test, DPA as needed)
- Performance requirements validated (latency, throughput, uptime)
- IT/engineering team signs off on technical fit (written)
- SSO/SAML compatibility confirmed (if applicable)

**Common Blockers**:
- IT team was not engaged early and now raises new requirements
- Security review takes longer than expected
- Integration with legacy systems is more complex than anticipated
- Technical evaluator favors a different architecture

**Recovery Actions**:
- Schedule a dedicated technical deep-dive between your engineer and theirs
- Offer a focused POC on the specific integration concern
- Provide direct access to your security team for questionnaire support
- Escalate through the champion if the technical team is unresponsive

---

### M-E3: Reference Call Completed

**Purpose**: Provide peer validation from a customer with a similar use case and industry.

| Attribute | Value |
|---|---|
| Default Owner | Us (arrange) / Customer (attend) |
| SMB Duration | 3-5 days |
| Mid-Market Duration | 5-7 days |
| Enterprise Duration | 1-2 weeks |

**Exit Criteria**:
- Reference customer matched on industry, size, or use case
- Buyer's key stakeholders attend the reference call
- Reference shares specific results (metrics, timeline, challenges overcome)
- Buyer confirms the reference addressed their top concern

**Common Blockers**:
- No reference customer available for the buyer's industry
- Reference customer is unavailable or slow to schedule
- Buyer does not prioritize the reference call

**Recovery Actions**:
- If no industry match, use a use-case match with a different industry
- Provide a written case study as a bridge until the live call happens
- Frame the reference call as a risk-reduction step: "This is the fastest way to validate the decision"

---

### M-E4: Business Case / ROI Model Delivered

**Purpose**: Shift the conversation from "does it work?" to "how much is it worth?" and arm the champion to sell internally.

| Attribute | Value |
|---|---|
| Default Owner | Us (build) / Customer (validate numbers) |
| SMB Duration | 2-3 days |
| Mid-Market Duration | 5-7 days |
| Enterprise Duration | 1-2 weeks |

**Exit Criteria**:
- ROI model uses the buyer's actual numbers (not industry averages)
- Cost of inaction quantified (what they lose each month by not acting)
- 3-year TCO and payback period calculated
- Economic buyer has reviewed and accepted the model
- Business case document is ready for internal circulation

**Common Blockers**:
- Buyer will not share actual numbers for the model
- ROI is unclear or incremental rather than dramatic
- Champion does not know how to present the business case internally

**Recovery Actions**:
- Use ranges if exact numbers are unavailable: "Based on companies your size, the range is $X-$Y"
- Focus on risk/cost reduction if ROI is not dramatic: "The cost of the current approach is $X/year"
- Offer to build the presentation slides the champion can use with their executive

---

## Proposal Stage Milestones

### M-P1: Proposal Delivered

| Attribute | Value |
|---|---|
| Default Owner | Us |
| Duration | 1-3 days after business case approval |

**Exit Criteria**:
- Proposal sent within 48 hours of business case approval
- Three pricing tiers presented with clear differentiation
- Proposal reflects the buyer's language and specific requirements
- Buyer confirms receipt and review timeline

**Common Blockers**: Proposal languishes unread. Recovery: Follow up within 48 hours with a specific question about the proposal.

---

### M-P2: Commercial Terms Agreed

| Attribute | Value |
|---|---|
| Default Owner | Shared |
| SMB Duration | 1-3 days |
| Mid-Market Duration | 3-7 days |
| Enterprise Duration | 1-2 weeks |

**Exit Criteria**:
- Pricing tier selected
- Contract length agreed
- Payment terms agreed
- SLA requirements defined (enterprise)
- No outstanding commercial objections

**Common Blockers**: New decision maker surfaces during pricing discussion. Budget is less than expected. Competitor pricing used as leverage.

---

## Negotiation Stage Milestones

### M-N1: Legal / Security Review Complete

| Attribute | Value |
|---|---|
| Default Owner | Customer (drive) / Us (respond) |
| SMB Duration | 1-5 days (often skipped) |
| Mid-Market Duration | 1-2 weeks |
| Enterprise Duration | 3-6 weeks |

**Exit Criteria**:
- MSA reviewed and all redlines resolved
- DPA executed (if processing personal data)
- Security questionnaire completed and accepted
- Compliance documentation provided (SOC 2, ISO 27001, etc.)

**Common Blockers**:
- Legal team is backlogged (2-4 week queue is common at enterprise)
- Indemnification or liability cap disagreements
- Data residency or sovereignty requirements
- Security review reveals issues (encryption standards, access controls)

**Recovery Actions**:
- Get direct contact with the buyer's legal team (not routed through the champion)
- Pre-fill security questionnaires to reduce the buyer's effort
- Escalate to your own legal team for quick-turn redline responses
- Offer a call between legal teams to resolve issues faster than email

---

### M-N2: Procurement Process Complete

| Attribute | Value |
|---|---|
| Default Owner | Customer |
| SMB Duration | 0-3 days (often none) |
| Mid-Market Duration | 1-3 weeks |
| Enterprise Duration | 3-8 weeks |

**Exit Criteria**:
- Vendor registration completed in buyer's procurement system
- Insurance documentation provided (if required)
- Compliance certifications submitted
- PO number issued or payment authorization obtained

**Common Blockers**:
- Buyer's procurement system requires information the seller does not have ready
- New vendor onboarding process takes longer than expected
- Procurement introduces requirements not discussed during evaluation
- Budget approval takes longer than the champion expected

**Recovery Actions**:
- Ask for the full procurement checklist upfront (do not discover requirements one at a time)
- Complete vendor registration proactively before the deal reaches procurement
- Have your operations team handle procurement paperwork to free up the rep

---

## Closing Stage Milestones

### M-C1: Final Executive Approval

| Attribute | Value |
|---|---|
| Default Owner | Customer |
| SMB Duration | 0-1 days |
| Mid-Market Duration | 1-5 days |
| Enterprise Duration | 1-3 weeks (may depend on board cycle) |

**Exit Criteria**:
- Executive with signing authority approves the deal
- Board approval obtained (if required for deals above certain thresholds)
- All internal approvals documented

---

### M-C2: Contract Execution

| Attribute | Value |
|---|---|
| Default Owner | Shared |
| Duration | 1-3 days after all approvals |

**Exit Criteria**:
- Contract signed by authorized signatories on both sides
- E-signature preferred for speed (DocuSign, HelloSign, etc.)
- Fully executed copy distributed to both parties

---

### M-C3: Implementation Kickoff Scheduled

| Attribute | Value |
|---|---|
| Default Owner | Us |
| Duration | 1-5 days post-signature |

**Exit Criteria**:
- Implementation kickoff date confirmed
- Customer success / implementation team introduced
- 90-day success metrics agreed and baselined
- First check-in meeting scheduled

---

## Cross-Stage Milestones

These milestones can appear at any stage depending on the deal situation.

### M-X1: Competitive Differentiation

**When**: Buyer is evaluating alternatives. Can appear at any stage from evaluation onward.

**Exit Criteria**:
- Competitor(s) identified by name
- Buyer's evaluation criteria documented
- Differentiation positioned on buyer's criteria (not generic features)
- Reference call from a customer who evaluated the same competitor

---

### M-X2: Champion Enablement

**When**: Champion needs to sell internally but lacks the tools or confidence.

**Exit Criteria**:
- Internal presentation deck provided to champion
- Business case document ready for internal circulation
- Champion has been coached on likely internal objections and responses
- Executive summary is written in the buyer's language, not yours

---

### M-X3: Stakeholder Objection Resolution

**When**: A specific stakeholder has raised a concern that blocks progress.

**Exit Criteria**:
- Objection clearly documented (what, who, why)
- Resolution plan created and communicated to the objector
- Objector confirms resolution (written preferred)
- No lingering concerns from this stakeholder

---

## Duration Estimation Guide

### Duration Multipliers

Apply these multipliers to the base durations listed in each milestone:

| Factor | Multiplier | Applies When |
|---|---|---|
| First-time vendor | 1.3x | Buyer has never purchased from you before |
| Regulated industry | 1.5x | Healthcare, financial services, government |
| International deal | 1.3x | Cross-border contract, multiple jurisdictions |
| Holiday/freeze period | +2-4 weeks | Q4 purchasing freeze, summer slowdown |
| Multiple product lines | 1.4x | Buyer is evaluating more than one of your products |
| New budget cycle | +4-8 weeks | Deal crosses a fiscal year boundary |
| Champion recently hired | 1.2x | Champion is new and still building internal credibility |

### Common Duration Mistakes

| Mistake | Reality |
|---|---|
| "Legal will take a few days" | Mid-market: 1-2 weeks. Enterprise: 3-6 weeks. |
| "The VP just needs to sign off" | VPs are busy. Allow 1-2 weeks per approval layer. |
| "Procurement is just paperwork" | Enterprise procurement: 3-8 weeks, not 3-8 days. |
| "They said they want to move fast" | Buyer intent does not control internal process speed. Still add buffers. |
| "Same timeline as the last deal" | Every buyer's internal process is different. Validate, do not assume. |

---

## Blocker Recovery Playbook

When a milestone is blocked, use this decision tree:

### Step 1: Identify the Blocker Type

| Blocker Type | Example | Urgency |
|---|---|---|
| **Person blocker** | Stakeholder is unavailable, unresponsive, or opposed | High |
| **Process blocker** | Procurement, legal, or approval process is slow | Medium |
| **Information blocker** | Missing data, requirements, or technical specifications | Medium |
| **Decision blocker** | Buyer is undecided, evaluating alternatives, or deprioritizing | Critical |

### Step 2: Apply the Right Recovery

**Person blocker**: Go around (find another path), go above (escalate), or go lateral (use a mutual connection). Never wait more than 5 business days for a person blocker without taking action.

**Process blocker**: Ask for the complete checklist of requirements upfront. Offer to do the work for them (pre-fill forms, provide documentation proactively). Introduce your operations team directly to their procurement team.

**Information blocker**: Provide ranges or estimates to unblock progress. Offer a technical call to gather the missing information. Frame the information request as a milestone exit criterion so it gets tracked.

**Decision blocker**: This is the most dangerous type. The buyer cannot decide because: (a) the business case is not strong enough, (b) there is an unspoken objection, or (c) this is not a real priority. Address each: (a) rebuild the ROI model, (b) ask directly "what is holding this back?", (c) qualify whether this deal deserves your time.

### Step 3: Set a Deadline

Every blocked milestone gets a recovery deadline. If the blocker is not resolved by the deadline:
- SMB: 5 business days maximum
- Mid-Market: 10 business days maximum
- Enterprise: 15 business days maximum (process blockers may be longer)

After the deadline, escalate or reassess whether the deal is worth pursuing.
