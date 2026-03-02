# Personalization & Multi-Threading Guide

A reference guide for personalizing follow-up emails at depth, selecting the right value-add by deal stage, detecting when to multi-thread, and optimizing send timing.

## Table of Contents

1. [Personalization Signal Types](#personalization-signal-types)
2. [Value-Add Library by Deal Stage](#value-add-library-by-deal-stage)
3. [Multi-Threading Playbook](#multi-threading-playbook)
4. [Send Timing Research](#send-timing-research)
5. [Pattern Detection: Ghosting vs. Busy](#pattern-detection-ghosting-vs-busy)

---

## Personalization Signal Types

Personalization is the difference between an email that gets opened and one that gets archived. The 3-signal rule requires at least 3 of these in every email. Ranked by impact:

### Tier 1: Conversation Signals (Highest Impact)
These come from meeting transcripts (RAG) and meeting notes. They prove you listened.

| Signal Type | Example | Where to Find |
|-------------|---------|---------------|
| **Direct quote** | "You mentioned 'our reps spend more time in Salesforce than on the phone'" | RAG transcript search |
| **Specific pain point** | "The 6-week onboarding ramp you described" | Meeting digest, RAG |
| **Commitment reference** | "I promised to send the ROI model by Friday" | RAG: "commitments made to {contact}" |
| **Question they asked** | "You asked whether we support SSO with Okta" | RAG: "{contact} asked about" |
| **Decision made** | "After the demo, your team decided to focus on the pipeline module first" | RAG: "decisions made in meeting" |
| **Concern raised** | "You flagged data migration as the biggest risk" | RAG: "concerns raised by {contact}" |

### Tier 2: CRM Signals (Medium Impact)
These come from deal records, activity history, and contact properties.

| Signal Type | Example | Where to Find |
|-------------|---------|---------------|
| **Deal stage context** | "As you're evaluating options this quarter" | Deal record |
| **Activity pattern** | "Since our call last Tuesday" | Activity timeline |
| **Company details** | "With your team of 50 reps across 3 offices" | Contact/company record |
| **Previous deliverables** | "Building on the comparison grid I sent last week" | Activity timeline |
| **Task/commitment** | "The security questionnaire your team requested" | Open tasks |
| **Timeline reference** | "With your Q2 launch target" | Deal close date, notes |

### Tier 3: Enrichment Signals (Supporting Impact)
These come from company research, news, and enrichment data.

| Signal Type | Example | Where to Find |
|-------------|---------|---------------|
| **Company news** | "Congratulations on the Series C -- $40M is a strong signal" | News search, enrichment |
| **Industry trend** | "With the shift to product-led growth in your space" | Industry research |
| **Role-specific insight** | "As a VP of RevOps, you're likely focused on forecasting accuracy" | Title analysis |
| **Mutual connections** | "I was talking to [mutual connection] who mentioned your team" | LinkedIn, CRM |
| **Recent content** | "I saw your LinkedIn post on sales enablement -- resonated with what we discussed" | LinkedIn activity |

### Signal Combination Rules

- **Minimum**: 3 signals per email (the 3-signal rule)
- **Ideal mix**: 1 Tier 1 + 1 Tier 2 + 1 Tier 3 (shows depth across sources)
- **For re-engagement**: At least 1 Tier 3 signal (something new, not rehashing old conversation)
- **For post-meeting**: At least 2 Tier 1 signals (prove you listened)
- **For executives**: Tier 2 and Tier 3 preferred (they care about business context, not conversation details)

---

## Value-Add Library by Deal Stage

Every follow-up must provide something useful. The value-add should match where the deal is in the buying process. Offering an ROI calculator in discovery is premature; offering a discovery article post-negotiation is irrelevant.

### Pre-Deal / Prospecting

**Goal:** Earn attention and establish relevance.

| Value-Add Type | Example | When to Use |
|----------------|---------|-------------|
| Industry insight | "Gartner just published their 2025 RevOps predictions -- 3 trends affecting your space" | Cold or warm outreach |
| Benchmark data | "Companies your size typically see 12% pipeline leakage -- here's how to measure yours" | After initial interest |
| Relevant content | Article, podcast, or report aligned to their likely pain | First touch or follow-up |
| Peer example | "Similar company in your space solved this by..." (anonymized if needed) | When building credibility |

### Discovery Stage

**Goal:** Demonstrate understanding and build trust.

| Value-Add Type | Example | When to Use |
|----------------|---------|-------------|
| Pain validation | "Here's research confirming the problem you described is industry-wide" | Post-discovery follow-up |
| Framework/checklist | "A checklist for evaluating [category] solutions based on what you told me matters" | Between discovery and demo |
| Case study | Story from a similar company with similar pain | When building the case for change |
| Diagnostic tool | "Here's a quick self-assessment to quantify the impact" | When they need internal justification |

### Evaluation / Demo Stage

**Goal:** Reduce risk and accelerate the evaluation.

| Value-Add Type | Example | When to Use |
|----------------|---------|-------------|
| Comparison grid | Feature-by-feature mapping to their requirements | Post-demo |
| Technical deep-dive | Architecture doc, integration guide, or API documentation | When technical team is evaluating |
| Reference customer | Offer to connect with a customer in their industry | When they need social proof |
| Trial/sandbox | Hands-on environment with their data | When they need to "feel" it |
| FAQ document | Answers to the 10 most common evaluation questions | When multiple stakeholders are reviewing |

### Proposal / Negotiation Stage

**Goal:** Justify value and remove friction.

| Value-Add Type | Example | When to Use |
|----------------|---------|-------------|
| Custom ROI model | Calculator using their specific metrics | Post-proposal |
| Implementation plan | Detailed timeline showing what the first 90 days look like | When they're concerned about disruption |
| Risk mitigation | Security review, compliance docs, SLAs | When legal/IT is reviewing |
| Executive summary | 1-page brief for the decision-maker who wasn't in meetings | When the deal needs executive sign-off |
| Mutual action plan | Shared timeline with milestones and owners | When the process is complex |

### Post-Close / Renewal

**Goal:** Deliver value and expand.

| Value-Add Type | Example | When to Use |
|----------------|---------|-------------|
| Usage report | "Your team used X feature 340 times last month -- here's the ROI impact" | Renewal discussion |
| Success metrics | Quantified outcomes since implementation | QBR or renewal |
| Expansion opportunity | "Teams using [Feature Y] see 25% better results -- your team hasn't activated it yet" | When usage data shows opportunity |
| Roadmap preview | Upcoming features relevant to their use case | When building long-term commitment |

---

## Multi-Threading Playbook

Multi-threading is the practice of building relationships with multiple stakeholders at an account, not just one contact. Research shows that deals with 3+ engaged contacts close at 2.8x the rate of single-threaded deals (Gong, 2023).

### When to Multi-Thread

| Trigger | Action |
|---------|--------|
| **2+ follow-ups with no reply** (7+ days) | Begin multi-thread evaluation |
| **14+ days of silence** from primary contact | Active multi-thread recommended |
| **Primary contact changes roles** or goes on leave | Immediate multi-thread required |
| **Deal enters negotiation** | Proactive multi-thread (don't wait for silence) |
| **New stakeholder appears** in meeting or email chain | Thread to them while relationship is fresh |

### Who to Thread To (Decision Tree)

```
Primary contact unresponsive
    |
    ├── Is there another attendee from a recent meeting?
    |   └── YES → Thread to them. They have shared context.
    |       Reference: "In the [date] meeting, you raised [topic] -- I wanted to follow up on that specifically."
    |
    ├── Is there a champion identified in the CRM?
    |   └── YES → Thread to the champion with a specific ask for help.
    |       Reference: "You've been a strong advocate for this -- could you help me connect with [primary contact] or suggest the best next step?"
    |
    ├── Is there a senior stakeholder (VP+) in the CRM?
    |   └── YES → Thread up with a concise executive summary.
    |       Reference: "I wanted to share a brief update on the [project/initiative] your team is evaluating."
    |
    ├── Is there a technical evaluator or end-user?
    |   └── YES → Thread sideways with a value-add relevant to their role.
    |       Reference: "I thought this technical overview might be useful as your team evaluates [solution]."
    |
    └── No other contacts found
        └── Flag to user: "I can only find one contact at this company. Consider asking for an introduction to another stakeholder."
```

### How to Thread (Email Approach)

**Rule 1: Never throw the primary contact under the bus.**
- Do NOT say: "I haven't been able to reach Sarah"
- DO say: "I wanted to connect with you directly about [topic] since it touches your area"

**Rule 2: Give the new contact their own reason to engage.**
- The email to the new contact should stand on its own, not feel like a workaround.
- Reference something specific to their role or interest.

**Rule 3: Keep the primary contact in the loop (usually).**
- CC the primary contact unless there's a specific reason not to (they've explicitly asked you to stop emailing).
- This signals transparency and often prompts the primary contact to re-engage.

### Multi-Thread Email Template

> **Subject:** [Topic relevant to new contact's role]
>
> Hi [New Contact],
>
> [One sentence establishing why you're reaching out to them specifically -- reference their role, a meeting they attended, or a topic in their domain.]
>
> [One sentence of value -- what you're providing that's useful to them.]
>
> [CTA -- specific and relevant to their role, not the deal overall.]

---

## Send Timing Research

### Optimal Windows by Day

| Day | Open Rate Index | Best For |
|-----|----------------|----------|
| Monday | 0.85 | Avoid -- inbox overload from weekend |
| Tuesday | 1.15 | Best overall day for B2B email |
| Wednesday | 1.10 | Strong second choice |
| Thursday | 1.05 | Good for follow-ups (before Friday wind-down) |
| Friday | 0.80 | Avoid -- mental check-out begins afternoon |
| Saturday | 0.40 | Never send B2B email |
| Sunday | 0.45 | Never send B2B email (exception: schedule to land Monday 8am) |

Source: HubSpot State of Email 2024, Yesware research 2024.

### Optimal Windows by Time (Recipient's Timezone)

| Time Window | Open Rate Index | Best For |
|-------------|----------------|----------|
| 6-8am | 0.75 | Early risers; executives who scan before meetings |
| **8-10am** | **1.20** | **Peak window -- top of inbox at work start** |
| 10am-12pm | 0.95 | Solid but crowded |
| **12-2pm** | **1.10** | **Post-lunch scan -- second peak window** |
| 2-4pm | 0.85 | Declining attention |
| 4-6pm | 0.70 | End-of-day fatigue |
| After 6pm | 0.50 | Avoid -- feels intrusive |

### Follow-up Cadence by Type

| Follow-up # | Wait Time | Strategy |
|-------------|-----------|----------|
| 1st (after meeting/event) | Same day or next morning | Reference specific details while fresh |
| 2nd (no reply to 1st) | 3-5 business days | Add new value, don't just "bump" |
| 3rd (no reply to 2nd) | 5-7 business days | Pattern break: different angle, new info, or different channel |
| 4th (no reply to 3rd) | 7-14 business days | Multi-thread or breakup email |
| Breakup email | After 4th attempt | Low-pressure close: "I'll assume timing isn't right. If things change, here's how to reach me." |

### Timezone Handling

1. Check the contact's timezone from CRM or enrichment data
2. If unknown, infer from company headquarters location
3. If still unknown, default to the user's timezone
4. Always display the suggested time in the recipient's timezone
5. For international contacts, avoid Monday mornings (their Monday may be your Sunday)

---

## Pattern Detection: Ghosting vs. Busy

Not every silence means lost interest. Accurate diagnosis prevents premature escalation or giving up too early.

### Signs of "Busy" (Temporarily Unavailable)

| Signal | What It Means |
|--------|---------------|
| Previously engaged and responsive | Strong prior behavior suggests they'll return |
| Company is in a known busy period (quarter-end, product launch, board prep) | External cause for silence |
| They opened your email but didn't reply | Interest exists but competing priorities |
| Their colleagues are still responsive | The relationship is alive at the company level |
| They moved your meeting but didn't cancel | Still committed, just time-constrained |

**Action:** Wait 5-7 days, then send a low-pressure follow-up with new value. Do NOT escalate.

### Signs of "Ghosting" (Lost Interest)

| Signal | What It Means |
|--------|---------------|
| **Engagement decay curve**: Responses went from same-day to 3-day to no reply | Progressive disengagement |
| **No email opens** on last 2+ emails | Not even reading |
| **Deal stage stalled** for 2x+ average cycle time | Process has stopped |
| **Champion went quiet** after being vocal | May have lost internal support |
| **New stakeholder appeared** then went silent | Possible internal pushback or competitive evaluation |
| **They visited your pricing page** but didn't respond to proposal | Price may be the blocker |

**Action:** Multi-thread immediately. Send a breakup email to the primary contact. Flag to the user with an honest assessment.

### Engagement Scoring

Calculate a simple engagement score to inform confidence level:

| Activity | Points |
|----------|--------|
| Email reply within 24 hours | +3 |
| Email reply within 72 hours | +2 |
| Email opened (no reply) | +1 |
| Meeting attended | +4 |
| Meeting rescheduled (not cancelled) | +2 |
| Meeting cancelled | -2 |
| No response to email (7+ days) | -2 |
| No response to email (14+ days) | -4 |
| Inbound message from contact | +5 |

**Score interpretation:**
- **10+**: Healthy engagement. Follow up confidently.
- **5-9**: Moderate engagement. Add extra value to maintain momentum.
- **0-4**: Low engagement. Consider multi-threading. Increase value-add.
- **Below 0**: Critical. Multi-thread immediately. Consider breakup email.

### The Breakup Email

When all signals point to ghosting and you've attempted 3-4 follow-ups:

> **Subject:** Closing the loop on [project/topic]
>
> Hi [Name],
>
> I haven't been able to connect on [topic] and I want to be respectful of your time. I'll assume the timing isn't right for now.
>
> If things change down the road, I'm always happy to pick the conversation back up. In the meantime, [one final value-add -- article, resource, or insight they can use regardless of whether they buy].
>
> Wishing you and the team a strong [quarter/year].
>
> Best,
> [Name]

**Why this works:**
- Respectful and professional -- no guilt
- Creates psychological "door closing" that often prompts a response
- Leaves value on the table (they remember you as helpful, not pushy)
- Keeps the door open without being desperate
- Research shows breakup emails get 2-3x higher response rates than standard follow-ups (Yesware, 2024)
