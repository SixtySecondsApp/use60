# Next Best Actions Library

Complete catalog of deal-advancing actions organized by type, with impact ratings, effort levels, templates, prerequisites, and trigger-to-action mapping. This is the reference knowledge base for prescribing the right action at the right time.

## Table of Contents
1. [Action Scoring Reference](#action-scoring-reference)
2. [Actions by Type](#actions-by-type)
3. [Re-Engagement Actions by Silence Duration](#re-engagement-actions-by-silence-duration)
4. [Multi-Threading Action Templates](#multi-threading-action-templates)
5. [Escalation Action Templates](#escalation-action-templates)
6. [Quick Wins Catalog](#quick-wins-catalog)
7. [Trigger Event to Action Mapping](#trigger-event-to-action-mapping)
8. [Action Selection Decision Tree](#action-selection-decision-tree)

---

## Action Scoring Reference

Every action is scored on three dimensions. These scores determine priority ranking.

| Dimension | Score | Definition |
|---|---|---|
| **Impact** | 5 | Directly creates commitment or removes a blocker |
| | 4 | Builds significant momentum toward close |
| | 3 | Maintains engagement and advances understanding |
| | 2 | Administrative or preparatory |
| | 1 | Low-value, maintenance activity |
| **Urgency** | 5 | Window closing within 48 hours |
| | 4 | Overdue or time-sensitive (14+ day gap, approaching deadline) |
| | 3 | Should happen this week |
| | 2 | Important but not time-critical |
| | 1 | Can wait without consequence |
| **Effort (inverted)** | 5 | Under 15 minutes |
| | 4 | 15-30 minutes |
| | 3 | 30-60 minutes |
| | 2 | 1-3 hours |
| | 1 | Half-day or more |

**Priority Score = Impact x Urgency x Effort**
- 75-125: Urgent (do today)
- 40-74: High (do this week)
- 15-39: Medium (schedule for next week)
- 1-14: Low (batch or delegate)

---

## Actions by Type

### Email Actions

#### AE-01: Value-Add Follow-Up Email
| Attribute | Value |
|---|---|
| Impact | 3 |
| Default Urgency | 3 |
| Effort | 5 (10-15 min) |
| Priority Score | 45 (High) |
| Prerequisites | Active contact, something valuable to share |

**Description**: Send an email that adds value beyond "just checking in." Share an insight, article, case study, or data point relevant to the buyer's situation.

**Template**:
```
[Name],

I came across [specific insight/article/data point] that connects
to what you mentioned about [their specific concern from RAG context].

[1-2 sentences explaining why this is relevant to them]

Would it be worth a quick chat this week to discuss how this
applies to [their initiative]?
```

**Prerequisites**: Must have something genuinely valuable to share. If you cannot articulate what value the email adds, do not send it.

**Never say**: "Just checking in," "Wanted to touch base," "Following up," "Bumping this." These signal you have nothing valuable to add.

---

#### AE-02: Meeting Recap with Insight
| Attribute | Value |
|---|---|
| Impact | 3 |
| Default Urgency | 4 (must send within 24 hours) |
| Effort | 4 (15-20 min) |
| Priority Score | 48 (High) |
| Prerequisites | Meeting occurred within 24 hours |

**Template**:
```
[Name],

Great conversation today. Here's what I took away:

1. [Their pain, in their words -- pull from transcript if available]
2. [The impact you discussed]
3. [The timeline or urgency factor]

One thing I wanted to add: [an insight they did not have --
a data point, a competitor trend, a customer story].

Next step: [specific action with date]
```

---

#### AE-03: Proposal Delivery Email
| Attribute | Value |
|---|---|
| Impact | 5 |
| Default Urgency | 5 |
| Effort | 2 (1-2 hours to prepare) |
| Priority Score | 50 (High) |
| Prerequisites | Buyer has verbally agreed to move forward |

**Description**: Proposals sent within 24 hours of verbal agreement close at 2.1x the rate of proposals sent after 72+ hours (Proposify, 1.4M proposals). Do not wait to perfect it.

---

#### AE-04: Breakup Email
| Attribute | Value |
|---|---|
| Impact | 3 |
| Default Urgency | 5 (21+ day gap) |
| Effort | 5 (5 min) |
| Priority Score | 75 (Urgent) |
| Prerequisites | 21+ days of silence, all other channels exhausted |

**Template**:
```
[Name],

I haven't heard back, so I'm going to assume the timing
isn't right for [project/initiative].

If things change, I'm here. In the meantime, I'll close this
out on my end.

All the best.
```

**Rule**: Send exactly one breakup email. Never send a second one. Paradoxically re-engages 15-20% of stalled deals (Gong Labs).

---

### Call Actions

#### AC-01: Champion Check-In Call
| Attribute | Value |
|---|---|
| Impact | 4 |
| Default Urgency | 3 |
| Effort | 5 (10-15 min) |
| Priority Score | 60 (High) |
| Prerequisites | Identified champion, specific agenda |

**Description**: Call your champion with a specific purpose -- not a generic check-in. Use RAG context to reference their last concern or commitment.

**Script skeleton**:
1. "Hey [Name], quick call about [specific topic from last conversation]."
2. Reference what they said: "Last time we spoke, you mentioned [concern/priority]."
3. Share update or ask specific question.
4. Confirm next step with date.

---

#### AC-02: Pre-Wire Negotiation Call
| Attribute | Value |
|---|---|
| Impact | 5 |
| Default Urgency | 4 |
| Effort | 5 (10-15 min) |
| Priority Score | 100 (Urgent) |
| Prerequisites | Deal approaching proposal/negotiation stage |

**Description**: Before formal negotiation, call your champion and ask: "What concerns do you think [economic buyer] will have? What would make this a no-brainer?" Prevents surprises.

---

#### AC-03: Final Objection Resolution Call
| Attribute | Value |
|---|---|
| Impact | 5 |
| Default Urgency | 5 |
| Effort | 5 (10 min) |
| Priority Score | 125 (Urgent) |
| Prerequisites | Contract sent but not moving |

**Script**: "Is there anything between us and getting this signed this week?" Then silence. Let them answer.

---

### Meeting Actions

#### AM-01: Multi-Stakeholder Discovery Meeting
| Attribute | Value |
|---|---|
| Impact | 5 |
| Default Urgency | 3 |
| Effort | 3 (30-45 min prep + meeting) |
| Priority Score | 45 (High) |
| Prerequisites | 2+ stakeholders identified |

**Description**: Schedule a meeting with multiple stakeholders to validate pain across the organization. Single-threaded deals close at 5.4% vs. 17% for multi-threaded (Gong Labs).

---

#### AM-02: Executive Alignment Meeting
| Attribute | Value |
|---|---|
| Impact | 4 |
| Default Urgency | 4 (if past evaluation midpoint without EB) |
| Effort | 4 (15-30 min prep) |
| Priority Score | 64 (High) |
| Prerequisites | Champion engaged, economic buyer identified but not met |

**Template request**:
```
[Champion],

I want to make sure our solution aligns with [Executive Name]'s
priorities for the team this year.

Would it be helpful to schedule a brief executive alignment meeting?
My [VP/CEO] would join to discuss strategic fit.

This usually takes 20-30 minutes and helps accelerate the
evaluation for both sides.
```

---

#### AM-03: Technical Deep-Dive / Demo
| Attribute | Value |
|---|---|
| Impact | 5 |
| Default Urgency | 3 |
| Effort | 2 (1-3 hours prep) |
| Priority Score | 30 (Medium) |
| Prerequisites | Discovery complete, specific use case identified |

**Customization checklist**:
- [ ] Use the buyer's industry terminology
- [ ] Build demo around their specific use case (from discovery/RAG)
- [ ] Include their data or realistic substitute data
- [ ] Address their top 3 concerns from transcripts
- [ ] Have competitor differentiation ready

Generic demos close at 20% vs. 45% for customized (Consensus benchmark).

---

### Task / Research Actions

#### AT-01: Company Research Deep-Dive
| Attribute | Value |
|---|---|
| Impact | 3 |
| Default Urgency | 3 |
| Effort | 3 (30-45 min) |
| Priority Score | 27 (Medium) |
| Prerequisites | None |

**Research checklist**:
- Company size, revenue, growth trajectory
- Recent news (funding, M&A, leadership changes, product launches)
- Tech stack and existing tools
- Competitors they face in their market
- Industry trends affecting their business
- Key executives and decision makers

---

#### AT-02: ROI Model / Business Case
| Attribute | Value |
|---|---|
| Impact | 5 |
| Default Urgency | 3 |
| Effort | 2 (1-2 hours) |
| Priority Score | 30 (Medium) |
| Prerequisites | Pain quantified, buyer engaged |

**ROI model components**:
1. Current cost of the problem (annual)
2. Implementation cost (one-time)
3. Ongoing cost (annual)
4. Time to value
5. 3-year net value
6. Payback period
7. Risk-adjusted return (conservative/expected/optimistic)

Deals without a business case close at 12% vs. 38% with one (Gartner).

---

#### AT-03: Competitive Analysis
| Attribute | Value |
|---|---|
| Impact | 4 |
| Default Urgency | 4 (if competitor mentioned in transcripts) |
| Effort | 3 (30-60 min) |
| Priority Score | 48 (High) |
| Prerequisites | Competitor identified or suspected |

**Rules**:
- Never attack the competitor by name unprompted
- Differentiate on the buyer's criteria, not generic feature lists
- Use web search for competitor's recent announcements, pricing changes, customer complaints
- Position on the 3 things that matter most to THIS buyer

---

### Internal Alignment Actions

#### AI-01: Manager Briefing
| Attribute | Value |
|---|---|
| Impact | 2 |
| Default Urgency | 2 |
| Effort | 4 (15-20 min) |
| Priority Score | 16 (Low) |
| Prerequisites | Deal needs executive support, pricing approval, or strategic guidance |

---

#### AI-02: Pre-Call Planning
| Attribute | Value |
|---|---|
| Impact | 3 |
| Default Urgency | 3 |
| Effort | 4 (15-30 min) |
| Priority Score | 36 (Medium) |
| Prerequisites | Important buyer meeting scheduled |

Research attendees, prepare questions, anticipate objections using RAG transcript context.

---

#### AI-03: Solution Engineering Support Request
| Attribute | Value |
|---|---|
| Impact | 3 |
| Default Urgency | 3 |
| Effort | 5 (10 min to request) |
| Priority Score | 45 (High) |
| Prerequisites | Technical questions raised that rep cannot answer |

---

### Reference Call Actions

#### AR-01: Arrange Peer Reference Call
| Attribute | Value |
|---|---|
| Impact | 5 |
| Default Urgency | 3 |
| Effort | 4 (15-30 min to arrange) |
| Priority Score | 60 (High) |
| Prerequisites | Post-demo, pre-proposal timing |

**Reference matching priority**:
1. Same industry + same use case (best)
2. Same industry + different use case (good)
3. Different industry + same use case (acceptable)
4. Same company size (helpful supplement)

---

### Proposal Actions

#### AP-01: Send Proposal with 3 Tiers
| Attribute | Value |
|---|---|
| Impact | 5 |
| Default Urgency | 5 |
| Effort | 2 (1-2 hours) |
| Priority Score | 50 (High) |
| Prerequisites | Evaluation complete, verbal agreement to proceed |

Include 3 pricing tiers with clear differentiation. Always include an "anchor" tier above the target.

---

### CRM Update Actions

#### AU-01: CRM Data Hygiene
| Attribute | Value |
|---|---|
| Impact | 2 |
| Default Urgency | 2 |
| Effort | 5 (5-10 min) |
| Priority Score | 20 (Medium) |
| Prerequisites | Data mismatch detected |

Matters for forecasting accuracy but should never be the top priority action for deal advancement.

---

## Re-Engagement Actions by Silence Duration

### 7-Day Gap: Value-Add Re-Engagement

**Action**: Send an email with genuine value. Not a check-in.

**Template options** (choose based on what is available):
1. Share a relevant article or industry report
2. Share a customer result from their industry
3. Share a competitive insight (from web search)
4. Share a product update relevant to their use case
5. Reference something from your last conversation (RAG) with a new angle

**Template**:
```
[Name],

Since our last conversation about [topic from RAG context],
I came across [specific insight/article/data point].

[1-2 sentences on why it's relevant to their situation]

Thought you'd find this useful regardless of where things stand
with [our initiative]. Worth a quick chat?
```

**Urgency**: 4 | **Effort**: 5 (10 min) | **Priority Score**: 60

---

### 14-Day Gap: Direct Outreach with Specific Question

**Action**: Phone call preferred, not email. Contact champion with a question that requires a substantive response.

**Script**:
```
"Hi [Name], it's [your name]. I wanted to follow up on
[specific topic from last conversation]. Specifically,
[ask a question that requires more than yes/no].

I ask because [reason tied to their timeline or a trigger event]."
```

If no answer, leave voicemail and send a parallel text or LinkedIn message: "Tried you on the phone -- wanted to check in on [specific item]."

**If no response in 48 hours**: Contact a different stakeholder.

**Urgency**: 5 | **Effort**: 5 (10 min) | **Priority Score**: 75

---

### 21-Day Gap: Breakup Email + Channel Switch

**Action**: Send the breakup email (AE-04). Simultaneously, attempt one final outreach through a different channel (LinkedIn, colleague introduction, or different stakeholder).

**Important**: The breakup email is the LAST email you send. Do not follow up on it. If the buyer re-engages, respond immediately. If not, mark the deal as at-risk and reassess in 10 days.

**Urgency**: 5 | **Effort**: 5 (5 min) | **Priority Score**: 75

---

### 30+ Day Gap: Deal Viability Assessment

**Action**: Before investing any more time, conduct a 5-minute viability check:

1. Is the close date past? If yes, this deal is likely dead.
2. Was there ever real buyer engagement (multiple meetings, multiple stakeholders)? If not, this was never a real deal.
3. Has anything changed externally (check web search for company news)? A leadership change or funding round might justify re-engagement.
4. Do you have a different contact to try? If you have exhausted all contacts, mark as lost.

**If viable**: Send a re-activation email tied to a trigger event: "I noticed [company] just [trigger event]. Given what you shared about [pain from RAG context], this seemed worth revisiting."

**If not viable**: Mark as lost. Reallocate time. A dead deal consuming attention is worse than no deal at all.

**Urgency**: 5 | **Effort**: 5 (5 min for assessment) | **Priority Score**: 75

---

## Multi-Threading Action Templates

### Template MT-01: Ask Champion for Introduction
```
[Champion],

To make sure we address everyone's priorities (and avoid
surprises later), it would help to connect with [role].

Would you be open to introducing me to [specific name if known],
or would it be easier to include them in our next call?
```
**When**: Only 1 contact engaged. **Impact**: 5. **Effort**: 5 (5 min).

### Template MT-02: Direct Outreach to Second Stakeholder
```
[Name],

I've been working with [Champion] on [initiative]. [Champion]
mentioned you'd be involved in evaluating [specific aspect].

I'd love to get your perspective on [specific question relevant
to their role]. Would 15 minutes this week work?
```
**When**: Champion introduction not forthcoming. **Impact**: 4. **Effort**: 5 (10 min).

### Template MT-03: Executive-to-Executive Outreach
```
[Executive],

Our team has been working with [Champion] on [initiative] that
could [specific business outcome]. [Champion] has been great,
and we want to make sure this aligns with your priorities for
[department/year].

Would 20 minutes make sense for a quick alignment conversation?
My [VP/CEO], [name], would join.
```
**When**: Need economic buyer engagement. Champion cannot or will not introduce. **Impact**: 5. **Effort**: 4 (15 min).

### Template MT-04: End-User Champion Outreach
```
[Name],

[Champion] mentioned that your team would be the primary users
of [solution]. I'd love to understand your day-to-day workflow
and what would make the biggest difference for your team.

Could we schedule 15 minutes? I want to make sure anything we
propose actually works for the people using it every day.
```
**When**: Have buyer-side champion but no end-user validation. **Impact**: 4. **Effort**: 5 (10 min).

---

## Escalation Action Templates

### Template ES-01: Stalled Deal Escalation (Internal)
**When to use**: Deal has exceeded 2x the stage target duration.

**Brief your manager with**:
1. Deal status: stage, value, days in stage
2. Diagnosis: why is it stalled? (Use RAG context for specifics)
3. What you have tried: outreach attempts, channels used
4. Recommended intervention: executive sponsorship, pricing flexibility, or close as lost
5. Your honest probability: what are the real odds this closes?

### Template ES-02: Champion Has Gone Silent
**When to use**: Your primary contact has stopped responding but other signals suggest the deal is alive.

**Escalation sequence**:
1. Day 1-3: Try alternate channels (call, text, LinkedIn)
2. Day 4-7: Contact a different stakeholder
3. Day 8-14: Executive-to-executive outreach (MT-03)
4. Day 15+: Breakup email. If no response, mark at-risk.

### Template ES-03: Competitor Threat Detected
**When to use**: Web search or transcript reveals active competitor evaluation.

**Response sequence**:
1. Identify the competitor (web search, ask directly)
2. Research their recent positioning, pricing, wins/losses
3. Prepare differentiation on the buyer's top 3 criteria
4. Request a meeting focused on evaluation criteria alignment
5. Offer reference call from a customer who evaluated both solutions

---

## Quick Wins Catalog

Actions completable in under 15 minutes with high impact. Use when capacity is "busy" or when the user needs one clear thing to do right now.

| Action | Time | Impact | When to Use |
|---|---|---|---|
| Send value-add email with article/insight | 10 min | 3 | 7+ day activity gap |
| Call champion with one specific question | 10 min | 4 | Need to confirm next step or surface blocker |
| Send meeting recap (from transcript/RAG) | 15 min | 3 | Within 24h of any meeting |
| Request introduction to second stakeholder | 5 min | 5 | Single-threaded deal |
| Send e-sign contract link | 10 min | 5 | Terms agreed, contract approved |
| Follow up on unopened proposal (phone call) | 5 min | 4 | Proposal sent 48h+ ago, not opened |
| Update CRM deal stage and close date | 5 min | 2 | Data mismatch detected |
| Send breakup email | 5 min | 3 | 21+ days silence, all channels exhausted |
| Share competitor differentiation one-pager | 10 min | 4 | Competitor mentioned in recent transcript |
| Schedule next meeting before current one ends | 2 min | 4 | During any active meeting |
| Send LinkedIn connection request to 2nd stakeholder | 5 min | 3 | Need alternate contact path |
| Forward relevant trigger event to buyer | 10 min | 3 | Web search found relevant company/industry news |

**The golden rule for quick wins**: Each must create either a buyer commitment or a seller insight. If the action does not result in the buyer doing something or the seller learning something, it is not a quick win -- it is busywork.

---

## Trigger Event to Action Mapping

When web search reveals external events, map them to specific actions:

| Trigger Event | Recommended Action | Urgency Boost | Template |
|---|---|---|---|
| Company raised funding | Propose larger deal, reference budget availability | +2 | "Congrats on the round. Given what you shared about [pain], this might be the right time to [action]." |
| New executive hired (in buying function) | Request introduction, re-qualify with new decision maker | +2 | "I saw [name] joined as [title]. Would it make sense to include them in our conversation?" |
| Company layoffs announced | Reframe value as efficiency/cost reduction, check champion status | +1 | "I understand [company] is restructuring. [Solution] could help [specific efficiency gain]." |
| Competitor announcement | Share differentiation, address competitive concerns proactively | +2 | "You may have seen [competitor]'s announcement about [X]. Here's how we compare on [buyer's criteria]." |
| Industry regulation change | Connect solution to compliance requirement | +2 | "[Regulation] takes effect [date]. [Solution] addresses [specific requirement]." |
| Company product launch | Congratulate, connect to increased operational needs | +1 | "Congrats on launching [product]. As you scale, [solution] can help with [specific operational challenge]." |
| Earnings report (positive or negative) | Align message to financial narrative | +1 | Reference their stated priorities from the earnings call |
| Key person promotion | Congratulate, use as re-engagement hook | +1 | "Congrats on the promotion. Given your expanded scope, [solution] might be even more relevant." |
| Office expansion / new location | Tie to scaling challenges solution addresses | +1 | "Saw the expansion news. As you grow, [specific scaling challenge] often becomes [pain point]." |

---

## Action Selection Decision Tree

Use this when multiple actions could apply. Follow the first matching rule.

```
1. Is the buyer silent (7+ days, no response)?
   YES -> Re-engagement action is the #1 priority
   NO  -> Continue to step 2

2. Is there only 1 contact engaged?
   YES -> Multi-threading is in the top 3 actions
   NO  -> Continue to step 3

3. Did RAG transcripts reveal an unfulfilled commitment?
   YES -> Fulfilling or addressing that commitment is #1 or #2
   NO  -> Continue to step 4

4. Did web search reveal a trigger event?
   YES -> Map event to action (see Trigger Event table) and boost urgency
   NO  -> Continue to step 5

5. Is the close date within 2 weeks?
   YES -> Focus on closing actions (AC-03, AP-01)
   NO  -> Continue to step 6

6. Is the economic buyer engaged?
   NO  -> AM-02 (Executive Alignment) is the #1 or #2 priority
   YES -> Continue to step 7

7. Does the deal have a business case / ROI model?
   NO  -> AT-02 (ROI Model) if past discovery stage
   YES -> Continue to step 8

8. Is there a next meeting scheduled?
   NO  -> Book the next meeting as the minimum viable action
   YES -> Use stage-specific actions

9. Are there 10+ open tasks on this deal?
   YES -> Prioritize existing tasks, do not add more
   NO  -> Select stage-appropriate actions
```

**The golden rule**: When in doubt, pick the action that requires the BUYER to do something. Buyer actions create commitment. Seller-only actions create the illusion of progress.
