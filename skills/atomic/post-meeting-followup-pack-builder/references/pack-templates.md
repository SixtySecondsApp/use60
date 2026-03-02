# Follow-Up Pack Templates — Complete Reference

Complete follow-up pack templates for each meeting type. A "pack" includes three artifacts: a buyer-facing email, an internal Slack update, and a task list. Each meeting type has all three artifacts fully templated with structure, examples, and the momentum preservation framework.

## Table of Contents

1. [The Momentum Preservation Framework](#the-momentum-preservation-framework)
2. [Template Selection Decision Tree](#template-selection-decision-tree)
3. [Discovery Meeting Pack](#discovery-meeting-pack)
4. [Demo Meeting Pack](#demo-meeting-pack)
5. [QBR Pack](#qbr-pack)
6. [Negotiation Meeting Pack](#negotiation-meeting-pack)
7. [Executive Briefing Pack](#executive-briefing-pack)
8. [Technical Deep-Dive Pack](#technical-deep-dive-pack)
9. [Cross-Artifact Consistency Rules](#cross-artifact-consistency-rules)
10. [Pack Quality Scoring](#pack-quality-scoring)
11. [Sources](#sources)

---

## The Momentum Preservation Framework

Every follow-up pack exists to answer one question: **Does this pack keep the deal moving forward?**

### The Data Behind the Bundle

- **Complete 3-artifact packs close 38% more deals** than email-only follow-ups (Gong.io, 25K+ deal outcomes, 2023). The pack — not just the email — drives outcomes.
- **Email alone advances deals 42% of the time. Add the Slack update and it jumps to 58%.** Internal coordination is the hidden multiplier. Your SE cannot prepare a POC if they do not know about it. Your manager cannot approve a discount without a briefing.
- **Task creation within 1 hour = 2.4x less likely to stall** in the next 14 days (HubSpot pipeline velocity, 2024). Tasks are the execution guarantee.
- **The 1-hour decay curve**: Each hour of delay reduces full pack completion probability by 15%. At 4 hours, only 23% of reps complete all 3. At 24 hours, only 8%.
- **67% of buyers reconsider vendors** who demonstrate poor follow-through (Forrester B2B Buying Study, 2024). Follow-up quality is a competitive differentiator.
- **Deals with team-assisted follow-up close 31% faster** than solo rep follow-up (Salesforce, 2023). The Slack update enables team assist.

### The Four Momentum Signals

A pack creates momentum when it:
1. **Locks in commitments** — both sides know what they agreed to (buyer email)
2. **Enables the team** — colleagues know what is needed and by when (Slack update)
3. **Creates accountability** — concrete tasks with owners and deadlines prevent drift (task list)
4. **Sets a next interaction date** — the CTA references a specific future touchpoint

### Momentum Killers

| Momentum Killer | Why It Kills | Fix |
|-----------------|-------------|-----|
| "We'll reconnect soon" | No specificity, no commitment | "Technical review Thursday 2pm EST" |
| No internal coordination | Team is blind, cannot support | Slack update with @mentions and specific asks |
| Unlinked tasks | Orphaned tasks get forgotten | Link every task to contact_id and deal_id |
| Delayed execution | 3-day-old follow-up is an autopsy | Send all 3 artifacts within the golden hour |
| Generic email | Buyer feels like a number | Use their words, reference their specific situation |
| Missing risk flags | Team cannot help with risks they do not know about | Every Slack update includes an honest risk section |

---

## Template Selection Decision Tree

Use this to select the correct pack template:

```
Was this the FIRST substantive conversation?
├─ Yes → Discovery Pack
└─ No → Did you show the product or give a demo?
         ├─ Yes → Demo Pack
         └─ No → Was this a periodic review of an existing account?
                  ├─ Yes → QBR Pack
                  └─ No → Were commercial terms / pricing discussed?
                           ├─ Yes → Negotiation Pack
                           └─ No → Were C-suite / VP-level executives the primary audience?
                                    ├─ Yes → Executive Briefing Pack
                                    └─ No → Was this a deep technical evaluation?
                                             ├─ Yes → Technical Deep-Dive Pack
                                             └─ No → Use Discovery Pack as default
```

When a meeting spans multiple categories (e.g., demo followed by negotiation), use the template for the **most critical business outcome** of the meeting. If the demo was the vehicle but the pricing discussion was the outcome, use the Negotiation Pack.

---

## Discovery Meeting Pack

### When to Use
First substantive sales conversation. You learned about their challenges, timeline, decision process, and team. The pack establishes your follow-through and drives toward a demo or deeper evaluation.

### Buyer Email (Target: 140-170 words)

```
Subject: [Company] x [Your Company] — Discovery Recap + Next Steps

Hi [Name],

Thanks for walking us through [Company]'s approach to [specific
challenge] today. [Person]'s insight about [specific detail they
shared] was particularly helpful context for our team.

What we heard from your team:
- [Challenge 1 in their own words — attributed to speaker]
- [Challenge 2 — quantified if they shared numbers]
- [Key constraint: timeline, budget, compliance, or technical]
- [Decision criteria they mentioned]

Based on these priorities, we recommend a focused demo on
[their top 2 priorities].

Next steps:
1. [Your team] Prepare tailored demo and pre-read — by [date]
2. [Their team] [Any commitment they made] — by [date]
3. [Both] Demo walkthrough — [proposed date and time]

Does [Day] at [Time] work for the demo? I'll send a calendar
invite with the agenda.

Best,
[Rep]
```

### Slack Update (Target: 80-120 words)

```
*[Company] — Discovery Call Update*
*Signal*: :green_circle: Advancing / :yellow_circle: Neutral / :red_circle: At Risk

*TL;DR*: [1-sentence summary of deal status after discovery]

*Key Intel*:
- [Most important thing learned — new pain point, timeline,
  decision-maker, budget range]
- [Second most important thing — competitive landscape,
  evaluation criteria, internal champion]

*Risks / Blockers*:
- :warning: [Risk 1 with context]
- [If no risks: "No risks identified at this stage"]

*Asks for Team*:
- @[SE Name]: [Prepare demo focused on X by date]
- @[Manager]: [Review if needed by date]

*Next*: Demo [date/time]. Invite sent.
```

### Task List

```
Task 1 (Internal): "Prepare tailored demo for [Company]
  focused on [priority 1] and [priority 2]"
Due: [1 business day before demo] | Priority: High
Owner: [SE Name]
Checklist:
- [ ] Review discovery notes and key requirements
- [ ] Configure demo environment for their use case
- [ ] Prepare relevant case study for their industry
- [ ] Create pre-read document for attendees

Task 2 (Customer): "Send demo pre-read and calendar invite
  to [Contact Name]"
Due: [2 business days before demo] | Priority: High
Owner: [Rep]
Checklist:
- [ ] Send calendar invite with agenda and attendee list
- [ ] Attach pre-read document
- [ ] Confirm attendee list with [Contact Name]

Task 3 (Deal Hygiene): "Update [Company] deal record after
  discovery"
Due: Today EOD | Priority: Medium
Owner: [Rep]
Checklist:
- [ ] Create deal if not exists, set stage to Discovery/Demo
- [ ] Add all new contacts from the meeting
- [ ] Log meeting notes and key requirements
- [ ] Update MEDDICC fields (if applicable)
```

---

## Demo Meeting Pack

### When to Use
You showed the product. The buyer saw features in action and reacted. The pack reinforces what resonated, addresses concerns head-on, and drives toward a POC or technical evaluation.

### Buyer Email (Target: 150-190 words)

```
Subject: [Company] Demo Recap — [Key Feature Area] + POC Next Steps

Hi [Name],

Great session today — your team brought sharp questions, and
[Person]'s point about [specific concern they raised] is one we
want to make sure we address fully.

What resonated with your team:
- [Feature 1] — [their stated use case or reaction, attributed]
- [Feature 2] — [how it maps to their specific challenge]
- [Area of strong interest — attributed to specific person]

Concern raised: [Specific concern, e.g., "data migration timeline"]
- Our plan: [Specific deliverable to address it, by when]

Decisions:
- Proceed with [evaluation step, e.g., "technical POC focused
  on data sync"]
- Scope: [agreed POC scope]

Next steps:
1. [Your team] [Deliverable 1] — by [date]
2. [Their team] [Their deliverable] — by [date]
3. [Both] Technical review — [date and time]

[Single CTA tied to their highest-priority next action]

Best,
[Rep]
```

### Slack Update (Target: 90-130 words)

```
*[Company] — Demo Update*
*Signal*: :green_circle: / :yellow_circle: / :red_circle:

*TL;DR*: [1-sentence summary]

*Key Intel*:
- [What resonated most — specific feature and their reaction]
- [New stakeholder info — who was engaged]
- [Competitive intel — did they mention alternatives?]

*Concerns Raised*:
- :warning: [Concern 1 — what was said and by whom]
- :warning: [Concern 2 — if applicable]

*Asks for Team*:
- @[SE]: [Technical deliverable needed by date]
- @[CSM]: [Onboarding/timeline input needed by date]
- @[Manager]: [Approval needed by date, if any]

*Next*: Technical review [date]. POC scope defined.
```

### Task List

```
Task 1 (Internal): "Prepare [deliverable addressing their
  concern] for [Company]"
Due: [1 day before next meeting] | Priority: High
Owner: [SE or relevant team member]
Checklist:
- [ ] Build deliverable specific to their concern
- [ ] Configure POC environment with their parameters
- [ ] Prepare technical documentation for concern area
- [ ] Review with [Manager] before sending

Task 2 (Customer): "Send POC access and [deliverable] to
  [Contact Name]"
Due: [committed date] | Priority: High
Owner: [Rep]
Checklist:
- [ ] Verify environment is configured correctly
- [ ] Create access credentials and documentation
- [ ] Send with personalized cover note referencing demo
- [ ] Follow up if [their deliverable] not received by [date]

Task 3 (Deal Hygiene): "Update [Company] deal: stage and
  stakeholders"
Due: Today EOD | Priority: Medium
Owner: [Rep]
Checklist:
- [ ] Move deal stage from Discovery to Technical Review/POC
- [ ] Add new stakeholders from the demo
- [ ] Log demo feedback and concerns raised
- [ ] Update expected close date if timeline shifted
```

---

## QBR Pack

### When to Use
Quarterly Business Review with an existing customer. The pack recaps performance, celebrates wins, identifies improvement areas, and sets strategic direction for the next quarter. Tone shifts from selling to partnering.

### Buyer Email (Target: 160-200 words)

```
Subject: [Company] Q[N] Review — Results + Q[N+1] Strategic Plan

Hi [Name],

Thanks for the thorough Q[N] review today. [Person]'s insights on
[specific topic] are going to shape our approach for next quarter.

Q[N] Performance Highlights:
- [Metric 1]: [actual] vs. [target] — [brief context]
- [Metric 2]: [actual] vs. [target]
- Key win: [specific achievement worth celebrating]

What we heard about Q[N+1]:
- [Their stated priority for next quarter — attributed]
- [Concern or challenge they anticipate]
- [Feature/capability request — attributed]

Q[N+1] Strategic Priorities:
1. [Priority 1] — [owner] — target [date]
2. [Priority 2] — [owner] — target [date]
3. [Priority 3] — [owner] — target [date]

Next steps:
1. [Your team] Deliver Q[N+1] strategic plan — by [date]
2. [Their team] [Their commitment] — by [date]
3. [Both] Q[N+1] kickoff — [proposed date]

Shall we lock in [date] for the Q[N+1] kickoff?

Best,
[Rep]
```

### Slack Update (Target: 90-120 words)

```
*[Company] — Q[N] QBR Update*
*Signal*: :green_circle: Healthy / :yellow_circle: Watch / :red_circle: At Risk

*TL;DR*: [1-sentence summary]

*Key Intel*:
- [Performance against targets — headline numbers]
- [Expansion signals or upsell opportunities]
- [Customer feedback on product/service]

*Risks*:
- :warning: [Renewal risk signal if any]
- :warning: [Product gap or competitor mention]

*Asks for Team*:
- @[Product]: [Feature request with context and priority]
- @[CSM]: [Execution plan for Q[N+1] priorities]
- @[Manager]: [Strategic decisions needed]

*Next*: Q[N+1] kickoff [date]. Renewal in [N months].
```

### Task List

```
Task 1 (Internal): "Prepare Q[N+1] strategic plan for [Company]"
Due: [5 business days after QBR] | Priority: High
Owner: [CSM]
Checklist:
- [ ] Compile Q[N] metrics and trend analysis
- [ ] Draft Q[N+1] priorities based on QBR discussion
- [ ] Include product roadmap items relevant to their requests
- [ ] Review with [Manager] and [Product] stakeholders

Task 2 (Customer): "Send Q[N+1] strategic plan and kickoff
  invite to [Contact Name]"
Due: [committed date] | Priority: High
Owner: [CSM/Rep]
Checklist:
- [ ] Finalize strategic plan document
- [ ] Send calendar invite for Q[N+1] kickoff
- [ ] Include relevant product updates or release notes

Task 3 (Deal Hygiene): "Update [Company] account after QBR"
Due: Today EOD | Priority: Medium
Owner: [Rep/CSM]
Checklist:
- [ ] Log QBR notes and customer feedback
- [ ] Update health score based on QBR signals
- [ ] Flag product requests in feature request tracker
- [ ] Update renewal timeline and probability
```

---

## Negotiation Meeting Pack

### When to Use
Commercial discussion — pricing, terms, contract structure. Precision is paramount. The pack must be exact about what was agreed, what is open, and what each side needs to finalize. Every word matters because this email may be forwarded to legal and procurement.

### Buyer Email (Target: 140-180 words)

```
Subject: [Company] — Commercial Terms Summary + Contract Next Steps

Hi [Name],

Good discussion on commercial terms today. [Person]'s input on
[specific term] helped us find a structure that works for both sides.

Terms agreed:
- Commitment: [term length]
- Pricing: [specific pricing and seat count]
- Deployment: [phasing or rollout plan]
- Support: [SLA level and included services]
- [Any special terms or concessions]

Open items requiring resolution:
- [Open item 1] — [owner and target date]
- [Open item 2] — [owner and target date]

For clarity — not yet agreed:
- [Point still under discussion]

Next steps:
1. [Your team] Send revised contract reflecting terms above — by [date]
2. [Their team] Legal review and redlines — by [date]
3. [Both] Contract review call — [proposed date and time]

I'll have the revised contract in your inbox by [date]. Would
[day] work for the review call?

Best,
[Rep]
```

### Slack Update (Target: 100-140 words)

```
*[Company] — Negotiation Update*
*Signal*: :green_circle: / :yellow_circle: / :red_circle:

*TL;DR*: [1-sentence summary]

*Terms Agreed*:
- [Term 1: pricing, commitment, SLA]
- [Term 2]

*Open Items*:
- :warning: [Open item 1 — risk level and resolution owner]
- :warning: [Open item 2]

*Deal Economics*:
- ACV: $[amount] | TCV: $[amount]
- Discount from list: [%] — [within/above approval threshold]
- @[Manager]: [Approval needed if above threshold]

*Asks for Team*:
- @[Legal]: Review contract draft by [date]
- @[Manager]: Approve [specific term] by [date]

*Next*: Contract sent by [date]. Review call [date].
Target close: [date].
```

### Task List

```
Task 1 (Internal): "Prepare revised contract for [Company]
  reflecting agreed terms"
Due: [committed date, minus 1 day buffer] | Priority: High
Owner: [Rep/Legal]
Checklist:
- [ ] Update pricing to reflect agreed terms
- [ ] Include phased deployment schedule
- [ ] Add special terms or concessions discussed
- [ ] Legal review of custom terms
- [ ] Manager approval if discount exceeds threshold

Task 2 (Customer): "Send revised contract and schedule
  review call with [Contact Name]"
Due: [committed date] | Priority: High
Owner: [Rep]
Checklist:
- [ ] Send contract with cover note summarizing key terms
- [ ] Schedule review call for [proposed date]
- [ ] Prepare responses for anticipated redline items

Task 3 (Deal Hygiene): "Update [Company] deal for negotiation
  progress"
Due: Today EOD | Priority: High
Owner: [Rep]
Checklist:
- [ ] Move stage to Negotiation/Contracting
- [ ] Update deal value to reflect agreed pricing
- [ ] Update close date to target close date
- [ ] Log negotiation notes and open items
```

---

## Executive Briefing Pack

### When to Use
You presented to or received a briefing from C-suite stakeholders. Executive time is the scarcest resource — the pack must be ultra-concise externally and highly actionable internally. Executives do not read long emails.

### Buyer Email (Target: 80-110 words)

```
Subject: [Company] Executive Briefing — Key Decisions + Next Steps

Hi [Name],

Thank you for the time today. Three key takeaways:

1. [Strategic priority they expressed — in their words]
2. [Decision or direction agreed — with specifics]
3. [Commitment or timeline they stated]

We'll deliver:
- [Your commitment 1] — by [date]
- [Your commitment 2] — by [date]

Next: [Your team member] will coordinate with [their team member]
on [specific operational next step]. [Confirmatory CTA]

Best,
[Rep]
```

### Slack Update (Target: 80-110 words)

```
*[Company] — Executive Briefing Update*
*Signal*: :green_circle: / :yellow_circle: / :red_circle:

*TL;DR*: [1-sentence summary]

*Executive Signals*:
- :white_check_mark: [Positive signal from exec]
- :information_source: [New strategic context learned]
- :warning: [Risk or concern — if any]

*Decision Authority*:
- [Who has budget approval: name and title]
- [Who has legal/procurement authority]
- [Timeline communicated by exec]

*Asks for Team*:
- @[Manager]: [Strategic alignment or approval needed]
- @[SE/CSM]: [Operational follow-through needed by date]

*Next*: [Operational next step] by [date].
```

### Task List

```
Task 1 (Internal): "Execute on commitment made to [Exec Name]
  at [Company]"
Due: [committed date, minus 1 day] | Priority: High
Owner: [Appropriate team member]
Checklist:
- [ ] [Specific deliverable committed to the exec]
- [ ] Review with [Manager] before delivery
- [ ] Ensure executive-quality formatting and brevity

Task 2 (Customer): "Coordinate operational follow-through with
  [Their operational contact]"
Due: Tomorrow EOD | Priority: High
Owner: [Rep or CSM]
Checklist:
- [ ] Connect with [their team member] per exec's direction
- [ ] Set up operational working sessions
- [ ] Confirm timeline aligns with exec's stated expectation

Task 3 (Deal Hygiene): "Update [Company] deal after executive
  engagement"
Due: Today EOD | Priority: High
Owner: [Rep]
Checklist:
- [ ] Add executive contact to deal record
- [ ] Update deal stage if executive engagement signals advancement
- [ ] Log executive briefing notes with attribution
- [ ] Flag deal as executive-engaged for pipeline review
```

---

## Technical Deep-Dive Pack

### When to Use
Deep technical evaluation session — architecture review, integration planning, security assessment, or POC scoping. The audience is typically engineers, architects, and technical decision-makers. The pack must be technically precise and actionable.

### Buyer Email (Target: 150-190 words)

```
Subject: [Company] Technical Review — Architecture Summary + POC Plan

Hi [Name],

Thanks for the deep dive today. [Person]'s questions about
[specific technical topic] helped us scope the POC precisely.

Technical alignment confirmed:
- [Architecture decision 1 — e.g., "REST API over WebSocket
  for your latency requirements"]
- [Integration approach — e.g., "Direct DB connector for SAP,
  not middleware"]
- [Security/compliance requirement met — e.g., "SOC 2 Type II
  with data residency in EU-West"]

Open technical questions:
- [Question 1] — [who will investigate, by when]
- [Question 2] — [who will investigate, by when]

POC scope agreed:
- Duration: [weeks]
- Data: [what data, what volume]
- Success criteria: [specific, measurable criteria they stated]

Next steps:
1. [Your team] [Technical deliverable] — by [date]
2. [Their team] [Access/credentials/data needed] — by [date]
3. [Both] POC kickoff — [date and time]

Can you have [access/credentials] ready by [date] so we can
configure the environment before kickoff?

Best,
[Rep]
```

### Slack Update (Target: 100-140 words)

```
*[Company] — Technical Deep-Dive Update*
*Signal*: :green_circle: / :yellow_circle: / :red_circle:

*TL;DR*: [1-sentence summary — e.g., "Architecture validated.
  POC scoped for 4 weeks. One open question on auth integration."]

*Technical Intel*:
- [Architecture decision and its implication for our team]
- [Integration requirements — specific technologies/protocols]
- [Their tech stack details relevant to our solution]

*Technical Risks*:
- :warning: [Risk 1 — e.g., "Custom auth flow requires
  engineering effort beyond standard POC"]
- :warning: [Risk 2 — e.g., "Their legacy system has no API —
  may need custom connector"]

*Asks for Team*:
- @[SE]: [Build/configure specific technical deliverable by date]
- @[Engineering]: [Investigate feasibility of X by date]
- @[Security]: [Provide compliance documentation by date]

*Next*: POC kickoff [date]. Environment must be ready by [date].
```

### Task List

```
Task 1 (Internal): "Build POC environment for [Company] with
  [specific technical requirements]"
Due: [2 days before POC kickoff] | Priority: High
Owner: [SE / Engineering]
Checklist:
- [ ] Configure environment per architecture decisions
- [ ] Set up integration connectors for their systems
- [ ] Load test data at specified volume
- [ ] Validate against their security requirements
- [ ] Test end-to-end before granting access

Task 2 (Customer): "Send POC access package and technical
  documentation to [Contact Name]"
Due: [1 day before POC kickoff] | Priority: High
Owner: [SE / Rep]
Checklist:
- [ ] Create access credentials with appropriate permissions
- [ ] Prepare technical setup guide tailored to their stack
- [ ] Include API documentation relevant to agreed scope
- [ ] Confirm they have credentials/access ready on their end

Task 3 (Deal Hygiene): "Update [Company] deal with technical
  evaluation details"
Due: Today EOD | Priority: Medium
Owner: [Rep]
Checklist:
- [ ] Move deal stage to Technical Evaluation / POC
- [ ] Log technical requirements and architecture decisions
- [ ] Add technical stakeholders to deal contacts
- [ ] Update MEDDICC: Technical criteria validated
- [ ] Set POC end date as milestone
```

---

## Cross-Artifact Consistency Rules

### Information That Must Match Across All 3 Artifacts

| Data Point | Buyer Email | Slack Update | Tasks |
|------------|-------------|--------------|-------|
| Decisions made | Listed in "Decisions" section | Listed in "Decisions" or "Key Intel" | Referenced in task descriptions |
| Deadlines committed | Listed in "Next Steps" with dates | Listed in "Next Steps" with dates | Task due dates match or precede |
| Contact names | Used correctly and consistently | Used correctly | contact_id linked |
| Deal stage | Never mentioned externally | Always mentioned internally | Updated in deal hygiene task |
| Risks identified | Mentioned diplomatically if at all | Stated explicitly and candidly | Reflected in task priorities |
| Amounts/pricing | Only if explicitly shared | Full internal context | Referenced in deal hygiene task |

### Consistency Check Process

Before finalizing a pack:
1. Extract all dates from the buyer email
2. Verify each date appears in the corresponding task
3. Verify the Slack update references the same timeline
4. Check that risk signals in Slack are reflected in task priority assignments
5. Ensure contact names are spelled consistently across all artifacts
6. Verify the buyer email CTA maps to at least one task

---

## Pack Quality Scoring

### Momentum Score (1-5)

| Score | Criteria | Signal |
|-------|----------|--------|
| 5 | Next meeting confirmed + specific deliverables committed + team aligned + risks flagged | Full momentum |
| 4 | Clear next steps with deadlines + team notified + most commitments captured | Strong momentum |
| 3 | Buyer email sent + basic tasks + next interaction date is vague | Moderate momentum |
| 2 | Buyer email sent but generic + no Slack + tasks are generic | Weak momentum |
| 1 | Minimal follow-up + no clear next step + deal likely to stall | No momentum |

### Scoring Each Artifact

**Buyer Email Score (out of 20)**:
- Contains "what we heard" with buyer's own words: 5 points
- All next steps have owners and deadlines: 5 points
- Single specific CTA: 4 points
- Under 200 words: 3 points
- References specific meeting moments: 3 points

**Slack Update Score (out of 10)**:
- Signal icon present and accurate: 2 points
- Risks explicitly listed: 3 points
- @mentions with specific asks and deadlines: 3 points
- Under 150 words: 2 points

**Task List Score (out of 10)**:
- All 3 task types present (internal, customer, hygiene): 3 points
- All tasks have specific deadlines: 3 points
- All tasks start with a verb: 2 points
- Tasks linked to contact/deal IDs: 2 points

**Total Pack Score**: Sum of all three (out of 40). Convert to 1-5 scale:
- 36-40: Score 5
- 28-35: Score 4
- 20-27: Score 3
- 12-19: Score 2
- 0-11: Score 1

---

## Sources

- Gong.io (2023). "3-Artifact Follow-Up Analysis." 38% close rate improvement for complete packs. 25K+ deal outcome analysis.
- HubSpot (2024). "Task Creation and Deal Stall Data." 2.4x lower stall rates when tasks created within 1 hour.
- Salesforce (2023). "Team-Assisted Close Rates." 31% improvement when internal Slack updates sent promptly.
- Chorus.ai (2023). "Pipeline Velocity Study." Follow-up completeness correlation with deal velocity.
- Forrester (2024). "B2B Buying Study." 67% vendor reconsideration rate after poor follow-up.
- LinkedIn (2024). "State of Sales." #1 buyer complaint about vendor follow-through.
- Lavender (2023). "Email Intelligence Report." "What we heard" technique impact on reply rates.
- Outreach.io (2023). "Sales Engagement Benchmarks." Multi-touch follow-up effectiveness data.
