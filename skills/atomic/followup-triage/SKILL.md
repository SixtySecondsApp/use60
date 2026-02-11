---
name: Follow-Up Triage
description: |
  Identify email threads that need a response: unanswered questions, promised deliverables,
  and stale conversations. Use when a user asks "which emails need replies", "what follow-ups
  am I missing", "triage my inbox", or wants to find threads they haven't responded to.
  Returns prioritized threads needing attention.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: communication
  agent_affinity:
    - outreach
  triggers:
    - pattern: "which emails need replies"
      intent: "email_triage"
      confidence: 0.85
      examples:
        - "what emails need my response"
        - "which threads am I behind on"
        - "emails I haven't replied to"
    - pattern: "triage my inbox"
      intent: "inbox_triage"
      confidence: 0.85
      examples:
        - "help me triage my inbox"
        - "sort my follow-ups"
        - "prioritize my email responses"
    - pattern: "what follow-ups am I missing"
      intent: "missed_followups"
      confidence: 0.80
      examples:
        - "am I missing any follow-ups"
        - "stale email threads"
        - "overdue responses"
  keywords:
    - "email"
    - "inbox"
    - "triage"
    - "follow-up"
    - "reply"
    - "respond"
    - "unanswered"
    - "stale"
    - "overdue"
  requires_capabilities:
    - email
    - crm
  requires_context:
    - email_threads
    - recent_contacts
    - company_name
  inputs:
    - name: days_since_contact
      type: number
      description: "Number of days without contact to flag as stale"
      required: false
      default: 7
    - name: limit
      type: number
      description: "Maximum number of threads to analyze"
      required: false
      default: 50
    - name: filter
      type: string
      description: "Filter criteria for thread selection"
      required: false
      example: "deal_related"
  outputs:
    - name: threads_needing_response
      type: array
      description: "5-10 threads needing response with contact, subject, reason, urgency, and context"
    - name: priorities
      type: array
      description: "Top 3 most urgent threads requiring immediate attention"
  priority: high
---

# Follow-Up Triage

## Goal
Identify **email threads** that need a response: unanswered questions, promised deliverables, stale conversations, deal-critical communications, and relationship-maintenance touchpoints. Return a prioritized, scored list that tells the rep exactly where to spend their next 30 minutes.

## Why Triage Matters

Follow-up is the single highest-leverage activity in sales, yet it is the most neglected:

- **80% of sales require 5+ follow-ups** after the initial meeting, but 44% of reps give up after one attempt (Brevet Group).
- **The average rep lets 40% of qualified leads go dark** simply because follow-ups fall through the cracks (HubSpot State of Sales, 2024).
- **Response rates drop 10x** after the first hour of silence on a warm thread (InsideSales.com).
- **35-50% of deals go to the vendor that responds first** (Drift/Harvard Business Review).
- Reps who systematically triage their inbox close **27% more revenue** than those who work first-in-first-out (Salesforce Research).

The core problem is not laziness; it is cognitive overload. A typical B2B AE has 40-80 active threads at any time. Without a scoring system, they rely on memory and recency bias, which means the loudest threads win and the most valuable threads decay silently.

This skill replaces guesswork with a repeatable, data-driven triage methodology.

## Required Capabilities
- **Email**: To search and retrieve recent email threads
- **CRM**: To cross-reference threads with contacts, deals, and activity history

## Inputs
- `email_threads`: from `execute_action("search_emails", { limit: 50 })` (recent emails)
- `recent_contacts`: from `execute_action("get_contacts_needing_attention", { days_since_contact: 7, limit: 20 })`
- (Optional) `deals`: from `execute_action("get_deals", { stage: "active" })` for deal-linked enrichment

## Data Gathering (via execute_action)
1. Fetch recent email threads: `execute_action("search_emails", { limit: 50 })`
2. Fetch contacts needing attention: `execute_action("get_contacts_needing_attention", { days_since_contact: 7, limit: 20 })`
3. Fetch active deals: `execute_action("get_deals", { stage: "active" })` for deal context enrichment
4. For each flagged thread, optionally fetch contact detail: `execute_action("get_contact", { id: contact_id })`

## Thread Categorization Taxonomy

Every thread must be classified into exactly one primary category. These are listed in default priority order (highest first):

### Category 1: Unanswered Question
The prospect or customer asked a direct question and you have not replied.
- **Detection signals**: Question marks in their last message, phrases like "can you", "could you clarify", "what is your", "do you have", "when can we"
- **Why it matters**: An unanswered question signals the prospect is engaged and actively evaluating. Silence kills momentum.
- **Default urgency floor**: Medium (escalates to High if deal-linked or > 48 hours old)

### Category 2: Promised Deliverable
You (or your team) committed to sending something — a proposal, pricing, case study, demo recording, intro, or resource — and the thread shows no evidence it was delivered.
- **Detection signals**: Your previous message contains "I'll send", "will share", "let me get back to you", "I'll follow up with", "we'll prepare"
- **Why it matters**: Broken promises destroy trust faster than any competitor. The prospect remembers what you said you would do.
- **Default urgency floor**: High (always)

### Category 3: Deal-Related Thread
The thread involves a contact linked to an active deal, regardless of the thread's content.
- **Detection signals**: Contact ID matches a contact on an active deal; thread subject references a deal name, product, or pricing
- **Why it matters**: Any silence on a deal-linked thread is a risk to pipeline. Deal threads should never go more than 3 business days without activity.
- **Default urgency floor**: Medium (escalates to High if deal stage is Negotiation or later)

### Category 4: Stale Conversation
A thread that was warm (multiple back-and-forth exchanges) but has gone quiet.
- **Detection signals**: Last message is from the prospect, you have not replied; OR your last message received no response and the thread had 3+ prior exchanges
- **Staleness thresholds**:
  - **Warm stale (3-5 days)**: Still recoverable with a casual nudge
  - **Cold stale (6-14 days)**: Needs a value-add re-engagement, not just "checking in"
  - **Dead stale (15+ days)**: Requires a pattern interrupt or new angle
- **Default urgency floor**: Low (escalates based on deal linkage and contact seniority)

### Category 5: Relationship Maintenance
Threads with important contacts (champions, executives, referral sources) where no business is immediately pending but the relationship needs nurturing.
- **Detection signals**: Contact is tagged as champion, executive, or referral source; no deal is active but contact has historical deal involvement; last touch was 14+ days ago
- **Why it matters**: Your network is your pipeline. Champions go cold when you only reach out when you need something.
- **Default urgency floor**: Low

## Urgency Scoring Framework

Consult `references/urgency-rules.md` for the complete urgency scoring framework with data backing, response expectation windows, reply rate decay curves, and worked scoring examples.

Each thread receives a composite urgency score (0-100) calculated across five weighted dimensions. The final score maps to a label: High (70-100), Medium (40-69), Low (0-39).

### Dimension 1: Thread Category Weight (30% of score)
| Category | Base Points |
|----------|-------------|
| Promised Deliverable | 30 |
| Unanswered Question | 24 |
| Deal-Related Thread | 20 |
| Stale Conversation | 12 |
| Relationship Maintenance | 6 |

### Dimension 2: Time Decay (25% of score)
How long since the thread needed your response:
| Time Elapsed | Points |
|--------------|--------|
| < 4 hours | 5 |
| 4-24 hours | 10 |
| 1-2 days | 15 |
| 2-3 days | 20 |
| 3-5 days | 23 |
| 5+ days | 25 |

### Dimension 3: Deal Value (20% of score)
If the thread's contact is linked to an active deal:
| Deal Value | Points |
|------------|--------|
| No deal linked | 0 |
| < $10K | 5 |
| $10K-$50K | 10 |
| $50K-$100K | 15 |
| > $100K | 20 |

### Dimension 4: Contact Seniority (15% of score)
| Seniority Level | Points |
|-----------------|--------|
| Unknown / Individual Contributor | 3 |
| Manager | 6 |
| Director | 9 |
| VP | 12 |
| C-Suite / Founder | 15 |

### Dimension 5: Relationship Warmth (10% of score)
Based on historical interaction volume and recency:
| Warmth Signal | Points |
|---------------|--------|
| New contact (< 3 interactions) | 2 |
| Developing (3-10 interactions) | 5 |
| Established (10+ interactions) | 7 |
| Champion (tagged or high engagement) | 10 |

### Score Calculation
```
urgency_score = category_weight + time_decay + deal_value + contact_seniority + relationship_warmth
```

### Score-to-Label Mapping
| Score Range | Label | Action Guidance |
|-------------|-------|-----------------|
| 70-100 | **High** | Respond within 2 hours. This thread is actively damaging your pipeline or reputation. |
| 40-69 | **Medium** | Respond today. This thread has meaningful pipeline or relationship impact. |
| 0-39 | **Low** | Respond this week. Important but not time-critical. |

## The "Response Debt" Concept

Response debt is a measure of how much follow-up obligation you have accumulated across your entire inbox. Like technical debt, it compounds: the longer you ignore it, the harder it becomes to recover.

### Calculating Response Debt
```
response_debt = SUM(urgency_score) for all threads needing response
```

### Debt Thresholds
| Total Debt Score | Status | Interpretation |
|------------------|--------|----------------|
| 0-100 | **Healthy** | Inbox is under control. Normal follow-up cadence. |
| 100-300 | **Elevated** | Multiple threads need attention. Block 1-2 hours for catch-up. |
| 300-500 | **Critical** | Significant pipeline risk. Cancel low-priority meetings and triage immediately. |
| 500+ | **Emergency** | Deals are likely slipping. Escalate: ask manager for support or delegate threads. |

### Debt Trend
When possible, compare current debt to the previous triage run. Report whether debt is increasing, stable, or decreasing. An increasing trend over 3+ consecutive triages is a red flag that the rep is over-capacity.

## Organization Context Integration

When generating recommended actions and mini-briefs, leverage the Organization Context to make guidance actionable:
- Reference ${company_name} value propositions when suggesting re-engagement angles for stale threads
- Use case studies from the Organization Context to suggest relevant resources the rep can share
- Align recommended action tone with the organization's brand voice (e.g., consultative vs. direct)

## Priority Matrix: Urgency x Deal Value x Relationship Warmth

For the top 3 priority threads, provide a mini-brief:

```
PRIORITY #1: [Contact Name] - [Subject Line]
Category: Promised Deliverable | Score: 87/100
Deal: Acme Corp Expansion ($120K, Negotiation stage)
Last Touch: 3 days ago (you promised to send pricing)
Risk: High - silence on a promised deliverable during negotiation
Recommended Action: Send pricing doc with personal note within 1 hour
```

## Staleness Detection Methodology

See `references/staleness-framework.md` for the complete staleness detection methodology, including pattern library, ghost detection scoring, re-engagement templates by staleness stage, and response debt impact data.

### When Does "Quiet" Become "Danger"?

The danger threshold depends on the thread context:

| Context | Safe Window | Warning | Danger |
|---------|-------------|---------|--------|
| Active deal, Negotiation+ | 1 day | 2 days | 3+ days |
| Active deal, Discovery/Demo | 2 days | 4 days | 7+ days |
| Prospect, no deal yet | 3 days | 7 days | 14+ days |
| Customer success / renewal | 5 days | 10 days | 21+ days |
| Networking / relationship | 14 days | 30 days | 60+ days |

### Ghost Detection
A "ghost" pattern is when:
1. You sent a message with a question or CTA
2. The prospect has NOT replied
3. It has been > 2x the normal reply cadence for this thread

When a ghost pattern is detected, flag it explicitly and suggest a re-engagement approach rather than a simple follow-up.

## Deal-Linked Escalation Rules

Threads linked to deals require special handling:

1. **Closing this month**: Any thread on a deal closing this month with > 24 hours of silence is automatically High urgency, regardless of score.
2. **Multi-threaded deals**: If multiple threads exist for the same deal, flag the most urgent one and note the others. Do not list them all separately.
3. **Champion thread**: If the thread involves the identified champion for a deal, add +10 bonus points to the urgency score.
4. **Competitive deal**: If the deal is marked as competitive, add +5 bonus points and flag that competitor timing pressure exists.
5. **Stalled deals**: If the deal has not moved stages in 14+ days AND a thread is stale, flag as "deal stall risk" with a recommendation to try a new angle.

## Output Contract

Return a SkillResult with:

### `data.threads_needing_response`
Array of 5-10 threads, sorted by urgency_score descending. Each entry:
- `thread_id`: string | null
- `contact_email`: string
- `contact_name`: string
- `contact_id`: string | null
- `subject`: string
- `last_message_date`: string (ISO date)
- `last_message_from`: "them" | "me" (who sent the last message)
- `category`: "unanswered_question" | "promised_deliverable" | "stale_conversation" | "deal_related" | "relationship_maintenance"
- `urgency`: "high" | "medium" | "low"
- `urgency_score`: number (0-100)
- `score_breakdown`: object with individual dimension scores
- `context`: string (deal name, company, last interaction summary)
- `days_waiting`: number (business days since response was needed)
- `recommended_action`: string (one-sentence guidance)
- `deal_id`: string | null (if deal-linked)
- `deal_stage`: string | null
- `deal_value`: number | null

### `data.priorities`
Array of top 3 threads (highest urgency_score). Same schema as above plus:
- `mini_brief`: string (formatted priority brief as shown in Priority Matrix section)

### `data.response_debt`
Object:
- `total_score`: number
- `status`: "healthy" | "elevated" | "critical" | "emergency"
- `high_count`: number
- `medium_count`: number
- `low_count`: number
- `recommendation`: string (what to do given current debt level)

### `data.summary`
String: One paragraph human-readable summary. Example: "You have 8 threads needing attention (3 high, 4 medium, 1 low). Your response debt is Elevated at 247. Top priority: Sarah Chen at Acme Corp is waiting on pricing you promised 3 days ago."

## Quality Checklist

Before returning results, validate:

- [ ] Every thread has exactly one category assigned
- [ ] Urgency scores are calculated using all 5 dimensions, not just gut feel
- [ ] Promised deliverables are always scored High or above (minimum 70)
- [ ] Deal-linked threads include deal context (name, stage, value)
- [ ] No duplicate threads (same contact + same subject = one entry)
- [ ] Top 3 priorities have mini-briefs with specific recommended actions
- [ ] Response debt is calculated and reported with status
- [ ] Summary paragraph is included and reads naturally
- [ ] Threads are sorted by urgency_score descending, not by date
- [ ] Staleness thresholds match the context-aware table, not a flat 7 days
- [ ] Recommended actions reference ${company_name} value props or case studies from Organization Context where relevant

## Error Handling

### No email threads found
If `search_emails` returns empty, check if email integration is connected. Return a helpful message:
"No email threads found. This could mean your email integration is not connected, or there are no recent threads. Check Settings > Integrations to verify email access."

### No contacts needing attention
If `get_contacts_needing_attention` returns empty, this is actually good news. Return:
"All contacts have been recently touched. No stale threads detected. Consider proactive outreach to prospects in early-stage deals."

### Missing deal context
If a contact is linked to a deal but `get_deal` fails, still include the thread but note: "Deal context unavailable — score may be understated." Do not skip the thread.

### Mixed thread signals
If a thread matches multiple categories (e.g., both an unanswered question AND a promised deliverable), assign the higher-priority category. Do not double-count.

### Rate limiting / timeout
If email API calls are slow or rate-limited, process in batches of 10. Return partial results with a note: "Analyzed [N] of [total] threads. Re-run to process remaining."

### Stale data
If the most recent email data is > 24 hours old, flag this: "Email data may not reflect the last 24 hours. Thread statuses could have changed."

## Examples

### Good Triage Output
```
PRIORITY #1: Sarah Chen (sarah@acme.com) - "Re: Enterprise Pricing"
Category: Promised Deliverable | Score: 87/100
Deal: Acme Corp Expansion ($120K, Negotiation)
Waiting: 3 days (you wrote "I'll send updated pricing by EOD Friday")
Action: Send pricing sheet with personalized cover note within 1 hour

PRIORITY #2: Mike Rodriguez (mike@bigcorp.io) - "Re: Technical Requirements"
Category: Unanswered Question | Score: 72/100
Deal: BigCorp Integration ($75K, Technical Review)
Waiting: 2 days (asked "Does your API support OAuth 2.0 PKCE?")
Action: Reply with technical confirmation or loop in SE within 4 hours

PRIORITY #3: Lisa Park (lisa@startup.co) - "Coffee chat follow-up"
Category: Stale Conversation | Score: 45/100
Deal: None (relationship building)
Waiting: 8 days (warm intro from your VP)
Action: Send a brief personal note referencing the intro context
```

### Bad Triage Output (what to avoid)
```
1. sarah@acme.com - needs reply (HIGH)
2. mike@bigcorp.io - needs reply (HIGH)
3. lisa@startup.co - needs reply (MEDIUM)
```

This is bad because: no context, no scoring rationale, no deal linkage, no specific recommended action, and no response debt assessment. It gives the rep a list but not the intelligence to act on it.
