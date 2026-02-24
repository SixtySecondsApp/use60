# Urgency Scoring Framework — Complete Reference

A data-backed urgency scoring system for email thread triage. This document provides the research foundation, scoring matrices, and response window guidelines that power the Follow-Up Triage skill.

## Table of Contents

1. [Response Expectation Windows](#response-expectation-windows)
2. [The Science of Response Timing](#the-science-of-response-timing)
3. [Reply Rate Decay Curves](#reply-rate-decay-curves)
4. [Urgency Scoring Matrix](#urgency-scoring-matrix)
5. [Factor Deep Dives](#factor-deep-dives)
6. [Score Calculation Worked Examples](#score-calculation-worked-examples)
7. [Escalation Rules](#escalation-rules)
8. [Response Window Benchmarks by Industry](#response-window-benchmarks-by-industry)
9. [Sources](#sources)

---

## Response Expectation Windows

Every thread type carries an implicit response expectation. Exceeding that expectation erodes trust. These windows are calibrated from industry research and buyer survey data.

### Windows by Thread Type

| Thread Type | Expected Response | Warning | Critical | Source |
|-------------|-------------------|---------|----------|--------|
| Prospect inquiry (inbound) | 1 hour | 4 hours | 24 hours | Drift/Harvard Business Review |
| Active deal — Negotiation | 2 hours | 8 hours | 24 hours | Gong.io deal velocity data |
| Active deal — Discovery/Demo | 4 hours | 24 hours | 48 hours | Salesforce Research |
| Active deal — Early stage | Same day | 48 hours | 72 hours | HubSpot pipeline data |
| Customer success / renewal | 24 hours | 3 days | 7 days | Gainsight benchmark |
| Partner / referral source | 24 hours | 3 days | 7 days | LinkedIn relationship data |
| Nurture / long-term prospect | 48 hours | 7 days | 14 days | Outreach.io sequence data |
| Networking / relationship | 3 days | 14 days | 30 days | General professional norms |

### Windows by Sender Seniority

Higher-seniority senders carry tighter implicit windows because their time is scarcer and their decision authority is greater.

| Sender Level | Window Modifier | Rationale |
|--------------|-----------------|-----------|
| C-Suite / Founder | -50% (halve the window) | They set the pace; delays signal you are not a priority |
| VP | -30% | Senior decision-makers expect vendor responsiveness |
| Director | Standard | Baseline expectation |
| Manager | Standard | Baseline expectation |
| Individual Contributor | +25% | Slightly more tolerance, but do not abuse it |

**Example**: An active deal in Negotiation with a VP sender:
- Standard window: 2 hours
- VP modifier: 2 hours x 0.7 = ~1.4 hours (round to 1.5 hours)
- Warning threshold: 6 hours instead of 8

---

## The Science of Response Timing

### The 5-Minute Rule (Inbound Leads)

The seminal MIT/InsideSales.com study (Oldroyd, 2011) analyzed 15,000+ leads across 100+ companies:

- **Contacting a lead within 5 minutes** makes you **100x more likely to connect** and **21x more likely to qualify** the lead compared to waiting 30 minutes.
- At 10 minutes, the odds of qualifying drop by 400%.
- After 1 hour, you are **7x less likely to qualify** the lead than at 5 minutes.
- After 24 hours, **60% of the lead's potential value has decayed** (SuperOffice, 2023).

### Why Speed Matters Psychologically

1. **Recency effect**: The prospect's need is freshest at the moment they reach out. Their mental model of the problem is most active and receptive to solutions.
2. **Availability heuristic**: A fast response creates a disproportionate impression of competence and reliability. Buyers generalize: "If they respond this fast before I am a customer, imagine how responsive they will be after."
3. **Competitive framing**: 35-50% of deals go to the vendor that responds first (Drift Lead Response Report, 2022). Speed is a differentiator in itself.
4. **Commitment escalation**: Each exchange deepens the prospect's investment in the conversation. A fast reply captures them while they are still engaged and before a competitor enters the frame.

### The Forgetting Curve Applied to Sales

Ebbinghaus's forgetting curve shows that people forget approximately:
- 50% of new information within 1 hour
- 70% within 24 hours
- 90% within 1 week

Applied to sales: a prospect who asked about your API capabilities on Monday has forgotten most of the context by Wednesday. Your reply on Wednesday forces them to re-read the thread, re-load the context, and re-engage — all friction that reduces reply likelihood.

---

## Reply Rate Decay Curves

### Data: Reply Probability by Hours Since Thread Needed Response

| Hours Elapsed | Reply Probability (if you respond now) | Relative to Immediate | Source |
|---------------|----------------------------------------|----------------------|--------|
| 0-1 hour | 85-90% | Baseline (1.0x) | Gong.io, 2023 |
| 1-4 hours | 70-80% | 0.85x | SuperOffice, 2023 |
| 4-8 hours | 55-65% | 0.70x | InsideSales.com |
| 8-24 hours | 40-50% | 0.55x | Drift, 2022 |
| 24-48 hours | 25-35% | 0.40x | HubSpot, 2024 |
| 48-72 hours | 15-25% | 0.25x | Salesforce Research |
| 3-5 days | 10-15% | 0.15x | Outreach.io |
| 5-7 days | 5-10% | 0.10x | Yesware, 2023 |
| 7-14 days | 3-7% | 0.06x | Industry average |
| 14+ days | 1-3% | 0.02x | Industry average |

### The Decay Formula

Reply probability follows an approximate exponential decay:

```
P(reply) = P_base * e^(-lambda * hours)
```

Where:
- `P_base` = baseline reply probability (~0.85 for warm threads)
- `lambda` = decay constant (~0.03 for deal-linked threads, ~0.05 for general threads)
- `hours` = hours since response was needed

### Key Inflection Points

1. **The 1-hour cliff**: Reply rates drop ~15% after the first hour. This is the "golden hour" for responses.
2. **The same-day threshold**: Responding same-day retains ~55% of reply potential. This is the minimum acceptable standard for deal-linked threads.
3. **The 48-hour wall**: After 48 hours, you have lost more than half of your reply potential. A standard follow-up will not work — you need a value-add or re-engagement approach.
4. **The 7-day point of no return**: After a week, the thread is effectively cold. A simple reply will feel out of place. You need a pattern interrupt, a new angle, or a value-add to restart the conversation.

---

## Urgency Scoring Matrix

### Five Scoring Dimensions

The composite urgency score (0-100) is calculated across five weighted dimensions. Each dimension has clear, measurable criteria.

#### Dimension 1: Thread Category Weight (30% of total)

| Category | Base Points | Rationale |
|----------|-------------|-----------|
| Promised Deliverable | 30 | Broken promises destroy trust faster than anything else |
| Unanswered Question | 24 | Engaged prospect awaiting information — silence kills momentum |
| Deal-Related Thread | 20 | Any silence on a deal thread is pipeline risk |
| Stale Conversation | 12 | Was warm, now cooling — recoverable if acted on soon |
| Relationship Maintenance | 6 | Important but not time-critical |

#### Dimension 2: Time Decay (25% of total)

| Time Since Response Needed | Points | Rationale |
|----------------------------|--------|-----------|
| Less than 4 hours | 5 | Still within the golden window |
| 4-24 hours | 10 | Same-day, but urgency is building |
| 1-2 days | 15 | Noticeable delay — prospect may be wondering |
| 2-3 days | 20 | Active damage to trust and momentum |
| 3-5 days | 23 | Significant relationship erosion |
| 5+ days | 25 | Maximum decay — thread may require re-engagement rather than reply |

#### Dimension 3: Deal Value (20% of total)

| Deal Value Range | Points | Rationale |
|------------------|--------|-----------|
| No deal linked | 0 | No pipeline risk from this thread |
| Under $10K | 5 | Low-value deal, still important |
| $10K-$50K | 10 | Mid-market deal, meaningful pipeline |
| $50K-$100K | 15 | Significant deal, high pipeline impact |
| Over $100K | 20 | Enterprise deal, maximum pipeline urgency |

#### Dimension 4: Contact Seniority (15% of total)

| Seniority Level | Points | Rationale |
|-----------------|--------|-----------|
| Unknown / IC | 3 | Lower decision authority, but still a real person waiting |
| Manager | 6 | Operational influence, can champion internally |
| Director | 9 | Budget influence, drives evaluation |
| VP | 12 | Budget authority, strategic decision-maker |
| C-Suite / Founder | 15 | Final decision authority, reputation at highest stakes |

#### Dimension 5: Relationship Warmth (10% of total)

| Warmth Signal | Points | Rationale |
|---------------|--------|-----------|
| New contact (fewer than 3 interactions) | 2 | Low history, less at stake |
| Developing (3-10 interactions) | 5 | Building rapport, consistency matters |
| Established (10+ interactions) | 7 | Deep relationship, silence is more noticeable |
| Champion (tagged or high engagement) | 10 | Your most valuable relationships — protect them |

### Bonus Points (Applied After Base Calculation)

| Condition | Bonus | Cap |
|-----------|-------|-----|
| Deal closing this month | +10 | Score capped at 100 |
| Champion contact on a deal | +10 | Score capped at 100 |
| Competitive deal | +5 | Score capped at 100 |
| Explicit deadline mentioned in thread | +5 | Score capped at 100 |
| Multiple stakeholders on the thread | +3 | Score capped at 100 |

---

## Factor Deep Dives

### Days Since Last Reply

This is the most dynamic factor. It directly measures how long the prospect has been waiting.

**Business days vs. calendar days**: Use business days for scoring. A prospect who emails Friday afternoon and receives a reply Monday morning has waited 0 business days, not 2 calendar days. However, if the prospect's message is clearly urgent (explicit deadline, question mark density, words like "ASAP" or "urgent"), count calendar days instead.

**Thread direction matters**:
- If the last message is FROM them (awaiting your reply): full time decay applies
- If the last message is FROM you (awaiting their reply): reduce time decay by 50% — the ball is in their court

### Sender Seniority Detection

Detect seniority from these signals, in order of reliability:

1. **CRM data**: Title field from contact record (most reliable)
2. **Email signature**: Parse title from signature block
3. **Thread context**: How they are addressed by others in the thread
4. **Domain role**: Infer from email alias patterns (ceo@, vp-sales@)
5. **Default**: If no signal, score as "Unknown / IC" (3 points)

### Deal Value Considerations

- Use **weighted deal value** (deal value x probability) if available
- If the deal is in Negotiation or later stages, treat the full deal value as the score basis (probability is already high)
- Multi-year deals: use the total contract value, not just year 1
- If a contact is on multiple active deals, use the highest-value deal for scoring

### Explicit Deadline Detection

Scan the thread for temporal language that indicates a deadline:

**High-confidence deadline signals**:
- "by [date]", "before [date]", "need this by", "deadline is"
- "end of week", "EOD", "by Friday", "by end of month"
- "board meeting on [date]", "launching on [date]"
- "contract expires [date]", "renewal due [date]"

**Medium-confidence deadline signals**:
- "soon", "this week", "this month"
- "before our next meeting", "ahead of the review"

**Low-confidence deadline signals**:
- "when you get a chance", "whenever possible"
- "at your earliest convenience"

---

## Score Calculation Worked Examples

### Example 1: High-Urgency Thread

**Thread**: VP of Engineering at Acme Corp asked about OAuth 2.0 support. Active deal worth $120K in Negotiation stage. 2 days since their question. Contact is a champion with 15+ interactions.

| Dimension | Value | Points |
|-----------|-------|--------|
| Category | Unanswered Question | 24 |
| Time Decay | 2 days | 15 |
| Deal Value | $120K | 20 |
| Contact Seniority | VP | 12 |
| Relationship Warmth | Champion | 10 |
| **Subtotal** | | **81** |
| Bonus: Deal closing this month | +10 | capped at 100 |
| Bonus: Champion contact | +10 | capped at 100 |
| **Final Score** | | **100** |
| **Label** | | **High** |

### Example 2: Medium-Urgency Thread

**Thread**: Manager at BigCorp mentioned they are evaluating tools. No deal in CRM yet. 4 days since last exchange. 5 prior interactions. Last message was from them.

| Dimension | Value | Points |
|-----------|-------|--------|
| Category | Stale Conversation | 12 |
| Time Decay | 4 days | 23 |
| Deal Value | No deal | 0 |
| Contact Seniority | Manager | 6 |
| Relationship Warmth | Developing (5 interactions) | 5 |
| **Final Score** | | **46** |
| **Label** | | **Medium** |

### Example 3: Low-Urgency Thread

**Thread**: Former colleague reached out to catch up. No deal, no business context. 10 days since their message. 3 prior interactions.

| Dimension | Value | Points |
|-----------|-------|--------|
| Category | Relationship Maintenance | 6 |
| Time Decay | 10 days (5+ days) | 25 |
| Deal Value | None | 0 |
| Contact Seniority | Unknown | 3 |
| Relationship Warmth | Developing | 5 |
| **Final Score** | | **39** |
| **Label** | | **Low** |

---

## Escalation Rules

### Automatic High-Urgency Overrides

Certain conditions override the scoring formula and force a thread to High urgency (minimum score 70):

1. **Promised deliverable older than 24 hours**: A broken promise older than one business day is always critical. Score floor: 75.
2. **Deal closing this month with 24+ hours of silence**: Any thread on a deal with a close date in the current month that has gone 24+ hours without a reply. Score floor: 70.
3. **C-Suite sender with unanswered question**: A direct question from a C-level executive with no response. Score floor: 72.
4. **Explicit deadline within 48 hours**: If the thread mentions a deadline that is less than 48 hours away. Score floor: 70.
5. **Champion going cold**: A tagged champion whose last interaction was 5+ days ago when they were previously engaging every 1-2 days. Score floor: 70.

### Automatic Score Modifiers

| Condition | Modifier | Application |
|-----------|----------|-------------|
| Deal is marked "at risk" in CRM | +15 | Added after base calculation |
| Contact has open support ticket | +5 | Customer success context |
| Thread has been triaged before and not addressed | +10 | Repeat neglect is compounding risk |
| Prospect cc'd their boss on last message | +10 | Escalation signal — they need an answer |
| Thread contains pricing or contract language | +5 | Commercial sensitivity |

---

## Response Window Benchmarks by Industry

Different industries have different response expectations based on buyer behavior and deal cycle norms.

| Industry | Typical Deal Cycle | Expected Response Window | Tolerance |
|----------|--------------------|--------------------------|-----------|
| SaaS / Technology | 30-90 days | 2-4 hours | Low — buyers evaluate multiple vendors simultaneously |
| Financial Services | 60-180 days | 4-8 hours | Medium — compliance and committee processes slow things |
| Healthcare / Life Sciences | 90-365 days | 8-24 hours | Higher — long procurement cycles normalize slower cadence |
| Manufacturing / Industrial | 60-180 days | 8-24 hours | Medium — decision cycles are methodical |
| Professional Services | 14-60 days | 2-4 hours | Low — relationship-driven, speed signals commitment |
| Retail / eCommerce | 7-30 days | 1-2 hours | Very low — fast-moving, competitive |
| Government / Public Sector | 180-365 days | 24-48 hours | High — bureaucratic process, but deadlines are hard |
| Education | 60-180 days | 8-24 hours | Medium — academic calendar creates seasonal urgency |

---

## Sources

- Oldroyd, J. (2011). "The Short Life of Online Sales Leads." MIT Sloan / InsideSales.com. Analysis of 15,000+ leads showing 5-minute response correlation with qualification rates.
- SuperOffice (2023). "Customer Service Benchmark Report." Response time data across 1,000+ companies. Found 1-hour response correlates with 7x conversion improvement.
- Drift (2022). "State of Conversational Marketing." Lead response data showing 35-50% of deals go to the first responder.
- Gong.io (2023). "Deal Velocity Analysis." 100K+ B2B meeting analysis showing 42% deal advancement with same-day follow-up.
- HubSpot (2024). "State of Sales Report." Pipeline data on follow-up impact, including the 44% stat on reps giving up after one attempt.
- Salesforce Research (2023). "State of the Connected Customer." Survey data on buyer expectations for response times.
- Brevet Group. "Follow-Up Statistics." The 80% / 5+ follow-ups data point on sales persistence.
- Chorus.ai (2023). "Pipeline Velocity Study." Follow-up timing correlation with deal close rates.
- Outreach.io (2023). "Sales Engagement Benchmark." Sequence timing and reply rate optimization data.
- Yesware (2023). "Email Response Time Analysis." Reply rate decay data across 500K+ email threads.
- Gainsight (2023). "Customer Success Benchmarks." Response time norms for customer success communications.
