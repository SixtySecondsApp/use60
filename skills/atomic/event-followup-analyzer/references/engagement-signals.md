# Event Engagement Signal Scoring Framework

A comprehensive framework for scoring event attendee engagement, assigning priority tiers, and making follow-up decisions based on observable signals. Includes signal ranking by intent strength, cross-referencing with pre-event data, a scoring matrix, and worked examples.

## Table of Contents

1. [Engagement Signal Theory](#engagement-signal-theory)
2. [Signal Categories and Weights](#signal-categories-and-weights)
3. [In-Person Event Signals](#in-person-event-signals)
4. [Virtual Event Signals](#virtual-event-signals)
5. [Pre-Event Data Cross-Reference](#pre-event-data-cross-reference)
6. [CRM Multipliers](#crm-multipliers)
7. [Composite Scoring Methodology](#composite-scoring-methodology)
8. [Tier Assignment Logic](#tier-assignment-logic)
9. [Worked Examples](#worked-examples)
10. [Edge Cases and Exceptions](#edge-cases-and-exceptions)
11. [Signal Decay Over Time](#signal-decay-over-time)

---

## Engagement Signal Theory

Not all event interactions are equal. A badge scan at a booth is fundamentally different from a 10-minute conversation about a specific business problem. The engagement signal framework ranks interactions by buying intent -- the likelihood that the interaction indicates genuine interest in purchasing.

### The Engagement Pyramid

```
                    /\
                   /  \
                  / DM \      DEMO REQUEST / MEETING REQUEST
                 / REQ  \    (Explicit buying intent)
                /--------\
               / DEEP     \   ASKED SPECIFIC PRODUCT QUESTION
              / CONVO      \  (Active evaluation behavior)
             /--------------\
            / BOOTH +        \  5+ MINUTE CONVERSATION
           / DETAIL EXCHANGE  \  (Invested time and shared info)
          /--------------------\
         / SESSION ATTENDANCE   \  ATTENDED YOUR TALK
        / + ENGAGEMENT           \  (Chose to spend time on topic)
       /--------------------------\
      / GENERAL PRESENCE           \  BADGE SCAN / ATTENDEE LIST
     /                              \  (Low signal, shared context)
    /________________________________\
```

Each level up the pyramid represents stronger buying intent and warrants more aggressive follow-up. The framework quantifies this hierarchy into a scoring system.

### Key Principle: Behaviors Over Demographics

Traditional lead scoring over-weights demographics (title, company size). Event engagement scoring should weight behaviors higher. A Director who asks a detailed product question is a better lead than a VP who walked past your booth. The scoring framework reflects this by weighting engagement signals 2-3x higher than demographic fit.

---

## Signal Categories and Weights

### Category 1: Direct Product Interest (Highest Weight)

These signals indicate the attendee is actively considering your solution.

| Signal | Weight | Evidence Required | Notes |
|--------|--------|------------------|-------|
| Requested a demo or meeting | 10 | Verbal or written request, badge scan with request flag | Strongest possible signal. Treat as inbound lead. |
| Asked a specific question about your product/service | 10 | Question documented by booth staff | Must be product-specific, not general topic |
| Mentioned a specific problem your product solves | 8 | Documented by booth staff or during session Q&A | High intent -- they are connecting their pain to your solution |
| Referenced budget, timeline, or decision process | 8 | Documented in notes | Buying process language = active evaluation |
| Asked about pricing or packaging | 9 | Documented | Strong buying signal -- pricing is a late-stage question |
| Asked for a reference or case study | 9 | Documented | Validation-seeking = close to decision |

### Category 2: Engaged Interaction (High Weight)

These signals show meaningful engagement without explicit buying intent.

| Signal | Weight | Evidence Required | Notes |
|--------|--------|------------------|-------|
| Visited booth and spent 5+ minutes in conversation | 7 | Time estimate from booth staff, badge scan timestamp | Time invested = interest invested |
| Exchanged contact details and asked you to reach out | 7 | Business card, badge scan with contact info shared voluntarily | Permission-based = high intent |
| Attended your session AND asked a question | 7 | Session attendance log + Q&A record | Engaged enough to participate publicly |
| Participated in a live demo at your booth | 8 | Documented by booth staff | Hands-on engagement = evaluating |
| Took product collateral AND asked a follow-up question | 6 | Documented | Active interest, not just browsing |

### Category 3: Moderate Engagement (Medium Weight)

These signals show awareness and some interest.

| Signal | Weight | Evidence Required | Notes |
|--------|--------|------------------|-------|
| Attended your session/talk/workshop | 5 | Session attendance log | Chose to spend time on your topic |
| Stopped by booth and picked up materials | 4 | Badge scan, material pickup log | Low-effort but intentional |
| Connected on LinkedIn during/after event | 5 | LinkedIn connection timestamp | Social signal of interest |
| Mentioned they use a competitor's product | 5 | Documented in notes | Switch opportunity -- but may be satisfied |
| Participated in a poll or survey at your booth | 4 | Survey completion record | Mild engagement, useful data |
| Referred a colleague to your booth | 6 | Documented | Enough interest to recommend |

### Category 4: Passive Signals (Low Weight)

These signals provide context but minimal buying intent.

| Signal | Weight | Evidence Required | Notes |
|--------|--------|------------------|-------|
| Attended the event (general) | 2 | Attendee list | Shared context, nothing more |
| Badge scanned at booth (walk-by) | 2 | Badge scan without conversation | May be accidental or polite |
| Appeared on attendee list, no interaction | 1 | Attendee list | No engagement evidence |
| Downloaded event materials post-event | 3 | Download log | Post-event interest, not live |
| Watched session recording after the event | 3 | View log | Interest in topic, delayed engagement |
| Works at a target account (no personal engagement) | 3 | CRM match | Account interest, not person interest |

---

## In-Person Event Signals

### Signal Collection Methods

| Method | Signals Captured | Reliability |
|--------|-----------------|------------|
| Badge scanning at booth | Visit, duration (if timestamped in/out), contact info | High for visit, low for intent |
| Booth staff notes | Conversation topics, questions asked, product interest level | High (if staff is trained) |
| Session attendance tracking | Which sessions attended, duration | Medium (may attend but not engage) |
| Business card exchange | Contact info, voluntary interest | High |
| Lead capture forms | Specific interest areas, budget, timeline | Highest (self-reported intent) |
| Q&A documentation | Questions asked during sessions | High |
| Meeting scheduler | Booked follow-up meeting at event | Highest |

### Booth Staff Signal Documentation Template

Train booth staff to capture signals using this quick-entry format:

```
Name: _______________
Company: _______________
Title: _______________
Contact: _______________

ENGAGEMENT LEVEL (circle one):
[ ] Deep conversation (5+ min, specific questions)
[ ] Moderate conversation (2-5 min, general interest)
[ ] Brief interaction (< 2 min, picked up materials)
[ ] Badge scan only (walked by)

SIGNALS OBSERVED (check all that apply):
[ ] Asked about specific feature or capability
[ ] Mentioned a business problem
[ ] Asked about pricing
[ ] Requested demo or meeting
[ ] Mentioned competitor
[ ] Referenced budget or timeline
[ ] Asked for reference or case study
[ ] Exchanged personal contact info

TOPIC OF CONVERSATION:
_________________________________

FOLLOW-UP PRIORITY (staff assessment):
[ ] HOT -- follow up today
[ ] WARM -- follow up this week
[ ] COOL -- add to nurture
```

---

## Virtual Event Signals

Virtual events produce different engagement data. Adapt the scoring framework for digital interactions.

### Virtual Signal Weights

| Signal | Weight | Data Source |
|--------|--------|-----------|
| Asked a question in live Q&A | 7 | Chat/Q&A log |
| Sent a direct chat message to your company | 8 | Chat log |
| Attended full session (90%+ duration) | 5 | Attendance duration |
| Attended partial session (50-89% duration) | 3 | Attendance duration |
| Clicked on links shared in your session | 4 | Click tracking |
| Downloaded session materials | 4 | Download log |
| Visited your virtual booth | 4 | Booth visit log |
| Spent 3+ minutes at virtual booth | 6 | Time on booth |
| Requested meeting via virtual booth | 10 | Meeting request log |
| Participated in poll/quiz | 3 | Poll data |
| Watched session recording within 24h | 4 | View log |
| Watched session recording after 24h | 2 | View log |
| Joined breakout room related to your topic | 6 | Breakout attendance |

### Virtual vs. In-Person Signal Comparison

| Engagement Level | In-Person Equivalent | Virtual Equivalent |
|-----------------|---------------------|-------------------|
| Highest | Requested demo at booth | Requested meeting via chat |
| High | 10-minute booth conversation | Asked question in Q&A + direct messaged |
| Medium | Attended session | Full session attendance (90%+) |
| Low | Badge scan, walk-by | Registered but did not attend |

---

## Pre-Event Data Cross-Reference

Event signals become more meaningful when combined with pre-event intelligence. Cross-reference every attendee against these data sources.

### ICP Fit Assessment

| Factor | Score Boost | Rationale |
|--------|------------|-----------|
| Company matches ICP (industry, size, tech stack) | +3 | Right company = higher conversion probability |
| Title matches target persona | +2 | Right person = decision-making relevance |
| Company in target account list | +3 | Strategic account = higher investment in follow-up |
| Company is in an active growth phase (funding, hiring) | +2 | Growth = budget and urgency |
| Their industry is a vertical you specialize in | +1 | Domain expertise increases relevance |

### Existing Relationship Assessment

| Relationship Status | Score Multiplier | Rationale |
|--------------------|-----------------|-----------|
| Contact at a company with an open deal | 2.0x | Event = new touchpoint in active opportunity |
| Previous customer (churned) | 1.5x | Re-engagement opportunity |
| Contact at a target account (no deal) | 1.5x | New entry point into strategic account |
| In CRM with prior interaction (no deal) | 1.2x | Familiarity increases receptivity |
| Net new (not in CRM) | 1.0x | Baseline -- standard scoring |

---

## CRM Multipliers

After calculating the base engagement score, apply CRM multipliers based on existing relationship data.

### Multiplier Calculation

```
Final Score = (Base Engagement Score + ICP Fit Bonus) x CRM Multiplier
```

### Multiplier Lookup Table

| CRM Status | Multiplier | Example |
|-----------|-----------|---------|
| Active open deal > $100K | 2.5x | Contact from your biggest prospect stops by your booth |
| Active open deal < $100K | 2.0x | Mid-market prospect visits your session |
| Previous customer (churned < 12 months ago) | 1.8x | Recently churned account attends your event |
| Previous customer (churned > 12 months ago) | 1.3x | Old customer re-engages |
| In CRM, contacted in last 90 days | 1.5x | Active outreach target shows up |
| In CRM, no contact in 90+ days | 1.2x | Cold contact re-appears |
| Target account, no personal contact | 1.5x | First entry point into dream account |
| Not in CRM | 1.0x | Net new lead |

---

## Composite Scoring Methodology

### Step-by-Step Scoring Process

1. **Collect signals:** Sum all engagement signal weights for the contact
2. **Add ICP bonus:** Add +1 to +3 based on company and persona fit
3. **Apply CRM multiplier:** Multiply by the appropriate relationship multiplier
4. **Calculate final score:** Round to nearest whole number
5. **Assign tier:** Use the tier assignment table below

### Formula

```
Final Score = ROUND((SUM(engagement_signals) + ICP_fit_bonus) x CRM_multiplier)
```

---

## Tier Assignment Logic

| Final Score | Tier | Label | Follow-Up Window | Follow-Up Type |
|-------------|------|-------|-----------------|----------------|
| 20+ | Tier 1 | HOT | Within 24 hours | Personalized email + phone call |
| 12-19 | Tier 2 | WARM | Within 48 hours | Personalized email |
| 6-11 | Tier 3 | COOL | Within 72 hours | Semi-personalized email |
| 1-5 | Tier 4 | COLD | Within 1 week | Add to nurture sequence |
| 0 | Unscored | N/A | Do not follow up | No engagement evidence |

### Tier Override Rules

These conditions automatically promote a lead to a higher tier, regardless of score:

| Condition | Override |
|-----------|---------|
| Contact is at a company with a deal > $100K | Minimum Tier 2 (WARM) |
| Contact explicitly requested a meeting | Always Tier 1 (HOT) |
| Contact is an executive (VP+ title) at a target account | Minimum Tier 2 (WARM) |
| Contact is a previous champion who churned | Minimum Tier 2 (WARM) |
| Contact asked about pricing | Minimum Tier 1 (HOT) |

---

## Worked Examples

### Example 1: HOT Lead -- Trade Show Booth Interaction

**Contact:** Sarah Chen, VP of Sales Operations, Acme Corp (500 employees, SaaS)

**Event Signals:**
- Visited booth and spent 8 minutes in conversation: +7
- Asked about integration with Salesforce CPQ: +10
- Mentioned her team wastes 6 hours/week on manual reporting: +8
- Exchanged business card and said "please follow up": +7
- Asked about pricing for 50 users: +9

**Base Score:** 41

**ICP Fit:** SaaS company, 500 employees, VP title matches persona: +5
**Subtotal:** 46

**CRM Check:** Not in CRM (net new): x1.0

**Final Score: 46 -- Tier 1 (HOT)**

**Recommended Action:** Personalized email within 24 hours referencing the Salesforce CPQ question and manual reporting pain. Phone call same day. Draft a custom ROI estimate showing time savings for 50 users.

---

### Example 2: WARM Lead -- Session Attendee

**Contact:** Michael Torres, Director of Revenue Operations, BetaTech (200 employees, FinTech)

**Event Signals:**
- Attended session on pipeline forecasting: +5
- Connected on LinkedIn after session: +5
- Company matches ICP (FinTech, 200 employees): +3

**Base Score:** 10

**ICP Fit:** Already included above: +0 additional
**Subtotal:** 13

**CRM Check:** In CRM, contacted 60 days ago (cold outreach, no reply): x1.2

**Final Score: 16 -- Tier 2 (WARM)**

**Recommended Action:** Semi-personalized email within 48 hours referencing the pipeline forecasting session. Include a relevant case study from FinTech. Do not reference the previous cold outreach that got no reply -- treat this as a fresh start via the event.

---

### Example 3: COOL Lead with CRM Boost

**Contact:** Jessica Park, Sales Manager, OmegaSoft (1000 employees, Enterprise SaaS)

**Event Signals:**
- Badge scanned at booth (walk-by): +2
- Attended event (general): +2

**Base Score:** 4

**ICP Fit:** Enterprise SaaS, 1000 employees, target persona: +3
**Subtotal:** 7

**CRM Check:** OmegaSoft has an active $250K deal in negotiation. Jessica is not the primary contact, but she is in the same department: x2.5

**Final Score: 18 -- Tier 2 (WARM) -- Override: Active deal promotes to minimum WARM**

**Recommended Action:** Coordinate with the AE owning the OmegaSoft deal. The event interaction is a valuable touchpoint. AE should send a personalized note: "Great to see OmegaSoft represented at [Event]. Wanted to introduce myself since I'm working with your team on [deal context]."

---

### Example 4: COLD Lead -- Attendee List Only

**Contact:** David Kim, Marketing Analyst, SmallStartup (25 employees)

**Event Signals:**
- Appeared on attendee list: +1

**Base Score:** 1

**ICP Fit:** Below minimum company size, analyst title not decision-maker: +0
**Subtotal:** 1

**CRM Check:** Not in CRM: x1.0

**Final Score: 1 -- Tier 4 (COLD)**

**Recommended Action:** Add to general nurture sequence with event context. Do not invest individual follow-up time. If they engage with nurture content (click, reply, download), escalate to individual treatment.

---

## Edge Cases and Exceptions

### Case 1: VIP Attendee with No Engagement Signals

A C-suite executive at a Fortune 500 target account attended the event but did not visit your booth or attend your session.

**Handling:** The ICP fit and CRM multiplier may produce a WARM score. Even if the engagement score is low, the strategic value justifies personalized follow-up. Use the "event context + value offer" approach, not the "great meeting you" approach (since you did not meet).

### Case 2: High Engagement from a Non-ICP Contact

A junior employee at a tiny company spent 20 minutes at your booth and loved everything. High engagement score, low ICP fit.

**Handling:** Score will reflect high engagement. Do not override downward. They may be an influencer, future decision-maker, or referral source. Follow up but with adjusted expectations and lower resource investment.

### Case 3: Same Person at Multiple Events

You met the same contact at two events within a month.

**Handling:** Combine signals from both events into a single score. Do NOT send separate follow-ups for each event -- it looks like you are not tracking interactions. Send one follow-up that references the most recent event.

### Case 4: Contact with Active Deal Who Gave Negative Signals

An existing prospect with an open deal visited your booth but seemed disengaged or made negative comments.

**Handling:** Flag as risk in the deal record. Do not score as a standard event lead. Alert the AE with the specific interaction details. This is competitive intelligence, not lead scoring.

---

## Signal Decay Over Time

Engagement signals lose value as time passes after the event. Apply a decay factor to the final score based on days elapsed.

| Days Since Event | Decay Factor | Effective Score |
|-----------------|-------------|----------------|
| 0-1 (same day / next day) | 1.0x | Full score |
| 2-3 | 0.85x | 85% of score |
| 4-5 | 0.65x | 65% of score |
| 6-7 | 0.45x | 45% of score |
| 8-14 | 0.25x | 25% of score |
| 15+ | 0.10x | 10% of score (event context nearly irrelevant) |

**Implication:** A HOT lead (score 25) at Day 0 decays to an effective score of 6.25 (COOL) by Day 8. This is why speed matters. Every day of delay demotes your best leads.

---

## Sources and References

- InsideSales.com / XANT (2023): Speed-to-lead and first-mover advantage in event follow-up
- Bizzabo (2023): Event engagement signals and lead conversion correlation
- SiriusDecisions: Event lead scoring methodology and best practices
- HubSpot Event Marketing: Personalization impact on event lead conversion
- Marketo: Event lead lifecycle management and scoring benchmarks
- Gartner (2024): B2B event ROI measurement framework
- Forrester (2024): Event-to-pipeline attribution methodology
- Demandbase: Account-based event engagement scoring framework
