---
name: Deal MAP Builder (Mutual Action Plan)
description: |
  Generate a Mutual Action Plan (MAP) for a deal with milestones, owners, dates, and tasks.
  Use when a user asks "build a mutual action plan", "create a MAP for this deal",
  "what are the milestones for closing this deal", or needs a structured closing plan.
  Returns milestones, exit criteria, and concrete tasks aligned to close date.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - pipeline
  triggers:
    - pattern: "mutual action plan"
      intent: "build_map"
      confidence: 0.90
      examples:
        - "build a mutual action plan"
        - "create a MAP for this deal"
        - "mutual action plan for"
    - pattern: "closing plan"
      intent: "deal_closing_plan"
      confidence: 0.85
      examples:
        - "what's the plan to close this deal"
        - "create a closing plan"
        - "deal closing milestones"
    - pattern: "deal milestones"
      intent: "deal_milestones"
      confidence: 0.80
      examples:
        - "what milestones do we need"
        - "set up milestones for this deal"
        - "map out the deal steps"
  keywords:
    - "MAP"
    - "mutual action plan"
    - "milestones"
    - "closing plan"
    - "deal plan"
    - "action plan"
    - "exit criteria"
    - "stakeholder"
  requires_capabilities:
    - crm
  requires_context:
    - deal
    - open_tasks
    - company_name
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to build a Mutual Action Plan for"
      required: true
    - name: deal_context
      type: object
      description: "Additional deal context such as stage, close date, stakeholders, or health"
      required: false
  outputs:
    - name: map
      type: object
      description: "Mutual Action Plan with deal info, north star, risks, and assumptions"
    - name: milestones
      type: array
      description: "4-7 milestones with owner, due date, and exit criteria"
    - name: tasks_to_create
      type: array
      description: "5-8 task previews with checklist, due date, priority, and owner category"
    - name: summary
      type: array
      description: "3-6 bullet point highlights of the plan"
  priority: critical
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Deal MAP Builder (Mutual Action Plan)

## Goal
Create a **Mutual Action Plan (MAP)** for a deal, aligned to stage + close date. A MAP is not a task list -- it is a shared contract between buyer and seller that makes the invisible buying process visible, assigns mutual accountability, and creates the psychological commitment that turns "we're interested" into a signed deal.

## Why MAPs Matter

Mutual Action Plans are the single highest-leverage tool in complex B2B sales. The data is unambiguous:

- **Deals with MAPs close 49-52% faster** than deals without them (Gartner, 2023 B2B Buying Report). The primary mechanism is reducing "dark time" -- periods where the deal stalls because neither side knows the next step.
- **Win rates increase 18-22%** when a MAP is established before the evaluation stage (MEDDIC Academy benchmarks). The MAP forces early qualification -- weak deals surface faster, saving capacity for winnable ones.
- **Forecast accuracy improves 35%** for deals with active MAPs (Clari pipeline analytics). Milestones with exit criteria create objective progress markers instead of "feeling good about it."
- **Average sales cycle compression**: 11 days for SMB, 23 days for mid-market, 38 days for enterprise (Salesforce State of Sales, 2023).
- **The commitment principle** (Cialdini): When a buyer writes down and agrees to steps, they are 3.5x more likely to follow through than when steps exist only in the seller's CRM.

A MAP without buyer agreement is just a project plan. The "mutual" is what creates the closing power.

## Required Capabilities
- **CRM**: To fetch deal data, stage, close date, stakeholders, activities, and existing tasks

## Inputs
- `deal`: from `execute_action("get_deal", { id })` -- include stage, close date, value, company, health if available
- `open_tasks`: from `execute_action("list_tasks", { deal_id, status: "pending" })`

## Data Gathering (via execute_action)

Before building the MAP, gather all available context:

1. **Deal record**: `execute_action("get_deal", { id: deal_id })` -- stage, close date, value, company, contacts, health score
2. **Open tasks**: `execute_action("list_tasks", { deal_id, status: "pending" })` -- what is already planned
3. **Recent activities**: `execute_action("get_deal_activities", { deal_id, limit: 20 })` -- meeting history, emails, calls
4. **Contacts on deal**: from deal record -- identify stakeholders, their roles, last interaction dates

If any of these calls fail or return empty, note the gap and build the MAP with available data. Missing data becomes a discovery milestone.

## MAP Construction Methodology

### Step 1: Determine the North Star

Every MAP needs a single "North Star" statement -- the measurable outcome both parties are working toward. This is NOT "close the deal" (that is your goal, not theirs). The North Star is the business outcome the buyer wants:

**Good North Stars:**
- "Reduce average ticket resolution time from 4.2 hours to under 1 hour by Q3"
- "Launch new customer portal serving 50,000 users by September 1"
- "Achieve SOC 2 compliance before the Series B audit in October"

**Bad North Stars:**
- "Implement the platform" (feature, not outcome)
- "Close this deal by March 15" (your goal, not theirs)
- "Improve efficiency" (vague, unmeasurable)

The North Star comes from discovery conversations. If no discovery data is available, the first milestone in the MAP should be a discovery call to establish it.

### Step 2: Map Current Stage to Milestone Framework

Consult `references/map-templates.md` for complete MAP structures by deal type (SMB, mid-market, enterprise, expansion, renewal). Use `references/milestone-library.md` for the full milestone catalog with duration estimates, exit criteria, common blockers, and recovery actions.

Different deal stages require different milestone patterns. The MAP must start from WHERE THE DEAL ACTUALLY IS, not from the beginning.

**Stage: Discovery / Qualification (Stages 1-2)**
Milestones focus on validating fit and building the business case:
1. Discovery deep-dive: understand pain, quantify impact, identify stakeholders
2. Technical/solution fit validation
3. Business case construction (ROI model, cost of inaction)
4. Stakeholder alignment on problem and approach
5. Evaluation criteria agreement
6. Formal evaluation kickoff

**Stage: Evaluation / Demo (Stages 3-4)**
Milestones focus on proving value and building consensus:
1. Solution demonstration / proof of concept
2. Technical validation (security, integration, performance)
3. Reference calls / case study review
4. Success criteria and metrics agreement
5. Procurement process mapping
6. Executive sponsor alignment
7. Go/no-go decision

**Stage: Negotiation / Procurement (Stages 5-6)**
Milestones focus on removing blockers and getting to signature:
1. Commercial terms alignment (pricing, contract length, SLA)
2. Legal/security review (MSA, DPA, security questionnaire)
3. Procurement process completion (vendor registration, PO)
4. Final executive approval / board approval
5. Contract execution
6. Implementation kickoff scheduling

**Stage: Closing (Stage 7+)**
Milestones focus on the last mile:
1. Final contract redlines resolved
2. Signature obtained
3. Implementation team introductions
4. Kickoff meeting scheduled
5. Success metrics baseline established

### Step 3: Set Exit Criteria for Every Milestone

Exit criteria are what make a MAP enforceable. Without them, milestones are wishes, not commitments. Every milestone must have 1-3 concrete, verifiable exit criteria.

**Good Exit Criteria:**
- "Technical team confirms API integration is feasible (written confirmation in email)"
- "CFO approves budget allocation of $X (verbal or email confirmation)"
- "Security questionnaire completed and returned (document received)"
- "Three stakeholders attend demo and provide written feedback"

**Bad Exit Criteria:**
- "Team is happy with the demo" (subjective, unverifiable)
- "Good progress made" (meaningless)
- "Stakeholders aligned" (how do you know?)

**The Test**: Can you objectively determine whether this criterion has been met without asking for an opinion? If yes, it is a good exit criterion.

### Step 4: Assign Ownership

Every milestone has exactly one owner type: "us" (seller), "customer" (buyer), or "shared" (both). The ownership distribution reveals deal health:

- **Healthy deal**: 40-50% customer-owned milestones. The buyer is investing their own time and political capital.
- **Weak deal**: 80%+ seller-owned milestones. You are doing all the work. The buyer is passive. This deal is at risk.
- **Red flag**: Zero customer-owned milestones. The buyer has not committed to anything. Requalify before building a MAP.

Shared milestones (e.g., "Joint solution design workshop") must specify who is responsible for scheduling and who provides the deliverable.

### Step 5: Calculate the Timeline

See `references/map-templates.md` for the Timeline Calculation Framework with base durations, process buffers, and the 20% buffer rule.

Work backward from the target close date using these planning heuristics:

**Buffer Rules:**
- Add 20% buffer to every milestone duration (optimism bias is real)
- Legal/security review: always allow 2-4 weeks minimum (enterprise: 4-8 weeks)
- Procurement/PO process: 2-6 weeks depending on deal size and company size
- Executive approvals: assume 1-2 week delay per approval layer
- Holiday/vacation periods: check for Q4 freezes, summer slowdowns, fiscal year boundaries

**SMB Timeline (deals under $50K):**
- Total cycle: 2-6 weeks from evaluation to close
- Milestone spacing: 3-5 business days apart
- Decision makers: 1-2, usually accessible
- Legal review: 1-3 days (often skipped)
- Procurement: minimal or none

**Mid-Market Timeline (deals $50K-$250K):**
- Total cycle: 4-12 weeks from evaluation to close
- Milestone spacing: 5-10 business days apart
- Decision makers: 2-4, may require scheduling coordination
- Legal review: 1-2 weeks
- Procurement: 1-3 weeks

**Enterprise Timeline (deals $250K+):**
- Total cycle: 3-9 months from evaluation to close
- Milestone spacing: 1-3 weeks apart
- Decision makers: 4-8+, committee dynamics
- Legal review: 2-6 weeks (MSA, DPA, security audit)
- Procurement: 3-8 weeks (vendor registration, compliance, PO)

**The "Close Date Honesty" Check:** If the calculated milestone timeline extends past the target close date, the close date is wrong. Do NOT compress milestones to fit an unrealistic date. Instead, flag the discrepancy in `risks` and propose a realistic date.

### Step 6: Identify Risks and Assumptions

Every MAP must surface risks early. These are the most common deal risks by stage:

**Universal Risks:**
- Champion leaves the company or changes roles
- Budget gets reallocated or frozen
- Competitor enters the evaluation late
- Requirements change mid-evaluation
- Key stakeholder has not been engaged

**Stage-Specific Risks:**
- Discovery: Pain is real but not funded (nice-to-have, not must-have)
- Evaluation: Technical blocker discovered late
- Negotiation: Procurement introduces new requirements
- Closing: Legal redlines on indemnification, liability caps, or data terms

**Assumptions to Document:**
- Decision-making authority rests with [specific person]
- Budget has been approved or will be approved by [date]
- No competing initiative will take priority
- Technical requirements are as discussed (no hidden integration needs)
- Timeline assumes [X days] for customer responses to requests

### Step 7: Generate Concrete Tasks

Transform milestones into executable tasks. Each task should be:

- **Specific**: "Send security questionnaire to CISO Jane Smith" not "handle security"
- **Time-bound**: Due date within 1-2 business days of when it should happen
- **Actionable**: The person reading it knows exactly what to do
- **Small**: 30-60 minutes of work maximum per task (break larger work into subtasks via the description checklist)

**Task Categories:**
- `customer`: Tasks the buyer must complete (send requirements doc, schedule stakeholder meeting, complete security review)
- `internal`: Tasks the ${company_name} team must complete (prepare demo, build ROI model, draft proposal)
- `mutual`: Tasks requiring coordination (joint workshop, reference call, executive alignment meeting)

## Output Contract

Return a SkillResult with:
- `data.map`: object
  - `deal_id`: string
  - `deal_name`: string
  - `target_close_date`: string | null
  - `north_star`: string (what success looks like -- measurable business outcome)
  - `risks`: string[] (3-5 specific risks with mitigation notes)
  - `assumptions`: string[] (3-5 explicit assumptions the plan depends on)
- `data.milestones`: array of 4-7 milestones
  - `title`: string (concise, action-oriented)
  - `owner`: "us" | "customer" | "shared"
  - `due_date`: string (ISO date preferred)
  - `exit_criteria`: string[] (1-3 concrete, verifiable criteria)
- `data.tasks_to_create`: array of 5-8 task previews
  - `title`: string (specific, includes the person/deliverable)
  - `description`: string (include checklist of subtasks)
  - `due_date`: string | null
  - `priority`: "high" | "medium" | "low"
  - `owner`: "us" | "customer" | "shared"
  - `category`: "customer" | "internal" | "mutual"
- `data.summary`: 3-6 bullet points with the plan highlights

## Quality Checklist

Before returning the MAP, verify every item:

- [ ] North Star is a measurable business outcome, NOT "close the deal" or "implement X"
- [ ] Milestones start from the deal's CURRENT stage, not from the beginning
- [ ] Every milestone has 1-3 verifiable exit criteria (not subjective opinions)
- [ ] At least 30% of milestones are customer-owned (buyer has skin in the game)
- [ ] Timeline is realistic given deal size (SMB: weeks, Enterprise: months)
- [ ] 20% buffer is included in milestone spacing
- [ ] Legal/procurement milestones are included for deals over $50K
- [ ] No tasks duplicate items already in `open_tasks`
- [ ] Every task is specific enough that someone could execute it without asking "what do you mean?"
- [ ] Risks are specific to THIS deal, not generic platitudes
- [ ] Assumptions are explicit about who decides, what budget exists, and what timeline dependencies exist
- [ ] Close date is honest -- if the math does not work, the close date is flagged as at risk

## Examples

### Good Milestone
```
{
  "title": "Technical Validation Complete",
  "owner": "shared",
  "due_date": "2026-03-15",
  "exit_criteria": [
    "API integration test passes with <200ms latency on 3 endpoints",
    "Security team confirms SOC 2 Type II compliance via questionnaire",
    "IT lead signs off on SSO/SAML integration feasibility"
  ]
}
```
Why this works: Specific, measurable exit criteria. Shared ownership means both sides have work to do. Due date gives a concrete target.

### Bad Milestone
```
{
  "title": "Technical Review",
  "owner": "us",
  "due_date": "sometime in March",
  "exit_criteria": ["team feels good about the tech"]
}
```
Why this fails: Vague title, no specific deliverable. Only seller-owned (buyer not invested). Non-specific date. Subjective exit criteria.

### Good Task
```
{
  "title": "Send security questionnaire to CISO Jane Smith",
  "description": "- [ ] Download SOC 2 questionnaire template from legal folder\n- [ ] Pre-fill sections 1-3 with ${company_name}'s compliance data\n- [ ] Email to jane.smith@acme.com with 5-day turnaround request\n- [ ] CC the security lead for follow-up questions",
  "due_date": "2026-03-01",
  "priority": "high",
  "owner": "us",
  "category": "internal"
}
```
Why this works: Names the specific person. Checklist breaks the work into atomic steps. Due date is concrete. Priority reflects that security review is on the critical path.

### Bad Task
```
{
  "title": "Handle security stuff",
  "description": "Make sure security is covered",
  "due_date": null,
  "priority": "medium",
  "owner": "us",
  "category": "internal"
}
```
Why this fails: Vague title, no person named, no checklist, no deadline, deprioritized when security is often on the critical path.

## Error Handling

### Deal has no close date
Calculate a realistic close date based on stage and deal size using the timeline heuristics above. Include it as an assumption and flag it: "No close date was set. Based on stage [X] and deal value [$Y], a realistic target is [date]. This should be confirmed with the buyer."

### Deal has no stage or is in an early stage
Start the MAP from discovery. The first milestone should be a discovery call to establish the North Star, identify stakeholders, and validate budget. Do not build an evaluation or procurement plan without discovery data.

### No contacts or stakeholders identified
Include a "Stakeholder Mapping" milestone as the first item. The exit criteria should be: "Identify economic buyer, technical evaluator, champion, and any blockers. Confirm decision-making process and timeline."

### Close date is in the past
Flag immediately in risks: "Close date [date] has passed. This deal needs a reset conversation with the buyer to establish a new timeline and confirm continued interest." Propose a realistic new date.

### Close date is unrealistically soon
If the milestone math shows the plan cannot be completed before the close date (accounting for legal, procurement, approvals), do NOT compress milestones. Instead: flag the close date as at risk, show the realistic timeline, and let the rep decide whether to renegotiate the date or fast-track specific milestones.

### Very large deal ($500K+) with complex procurement
Add explicit milestones for: vendor registration, compliance documentation, board/committee approval, PO generation, and contract execution. Enterprise procurement often takes 4-8 weeks alone. Reference any known procurement patterns for the buyer's industry.

### Open tasks overlap with planned milestones
Cross-reference `open_tasks` with generated tasks. For any overlap: reference the existing task by title and do NOT create a duplicate. Note in the summary which milestones are partially addressed by existing tasks.

## Stakeholder Mapping Framework

When contacts are available on the deal, classify each stakeholder into one of these roles (a person can hold multiple roles):

| Role | Definition | MAP Implication |
|------|-----------|-----------------|
| **Economic Buyer** | Controls budget, signs the contract | Must approve commercial terms milestone |
| **Technical Evaluator** | Assesses technical fit | Owns technical validation milestone |
| **Champion** | Internal advocate who wants you to win | Guides you through internal politics, co-owns shared milestones |
| **Coach** | Provides intel but may not have influence | Source of information, not a milestone owner |
| **Blocker** | Opposes the purchase or favors a competitor | Must be addressed -- create a specific milestone to neutralize (e.g., "Address VP Eng concerns via technical deep-dive") |
| **End User** | Will use the product daily | Include in demo/pilot milestones for feedback |

**Red Flag**: If you cannot identify at least an Economic Buyer and a Champion, the deal is at risk. Add a "Stakeholder Discovery" milestone before any evaluation milestones.

## Common Patterns by Deal Type

### New Logo (First-time customer)
- Longer discovery and validation phases
- More proof milestones (references, case studies, POC)
- Legal and procurement are full processes (no existing MSA)
- Budget justification is critical -- include ROI/business case milestone

### Expansion (Existing customer)
- Shorter discovery (you already know the business)
- Skip basic technical validation (they are already on the ${company_name} platform)
- Legal may be covered by existing MSA (check for amendment needs)
- Focus milestones on: new use case validation, additional user onboarding, incremental commercial terms

### Renewal with Upsell
- Shortest timeline
- Milestones focus on: value realization review, new capability demo, updated commercial terms
- Risk is complacency -- do not skip milestones just because they are a current customer
- Include a "competitive landscape check" milestone if contract is coming up for renewal

### Multi-Product / Platform Deal
- Longer evaluation with multiple workstreams
- May need parallel milestone tracks (one per product line)
- More stakeholders involved -- stakeholder mapping is critical
- Integration milestones become the critical path

## Tone and Presentation

- Write milestones as if the buyer will read them. They should feel collaborative, not like a sales tracking sheet.
- Use plain language. "Schedule executive alignment call" not "Facilitate C-level synergy engagement."
- Be specific about people when known: "Demo for Sarah Chen's team" not "Demo for customer."
- Risks should be honest but not alarming. Frame as "areas to monitor" rather than "things that will kill this deal."
- The summary should give a rep everything they need to brief their manager in 30 seconds.
