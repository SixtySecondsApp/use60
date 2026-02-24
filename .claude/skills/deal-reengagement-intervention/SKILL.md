---
name: Deal Reengagement Intervention
description: |
  Diagnose ghosting signals and generate a personalized reengagement intervention with strategy selection,
  message templates, and reasoning. Use when a user asks "reengage this contact", "they're ghosting me",
  "intervention needed", "how to reconnect", or "break through the silence". Returns intervention strategy,
  personalized message, channel recommendation, and success metrics.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - pipeline
    - outreach
  triggers:
    - pattern: "reengage this contact"
      intent: "contact_reengagement"
      confidence: 0.90
      examples:
        - "reengage this prospect"
        - "reengage the champion"
        - "how do I reengage"
    - pattern: "they're ghosting me"
      intent: "ghosting_intervention"
      confidence: 0.95
      examples:
        - "my contact is ghosting me"
        - "they stopped responding"
        - "dealing with ghosting"
    - pattern: "intervention"
      intent: "contact_intervention"
      confidence: 0.80
      examples:
        - "I need an intervention strategy"
        - "intervention plan for this contact"
        - "help me intervene"
    - pattern: "how to reconnect"
      intent: "reconnection_strategy"
      confidence: 0.85
      examples:
        - "how do I reconnect with them"
        - "reconnect with this prospect"
        - "get them to respond"
    - pattern: "break through"
      intent: "breakthrough_contact"
      confidence: 0.80
      examples:
        - "break through the silence"
        - "get past the ghosting"
        - "breakthrough strategy"
  keywords:
    - "reengage"
    - "ghosting"
    - "intervention"
    - "reconnect"
    - "break through"
    - "silence"
    - "not responding"
    - "gone dark"
    - "contact"
    - "prospect"
  required_context:
    - contact
    - deal_context
  inputs:
    - name: contact_id
      type: string
      description: "The contact identifier to reengage"
      required: true
    - name: deal_id
      type: string
      description: "Associated deal identifier for context"
      required: false
    - name: intervention_urgency
      type: string
      description: "How urgent the reengagement is"
      required: false
      default: "normal"
      example: "urgent"
  outputs:
    - name: ghosting_diagnosis
      type: object
      description: "Analysis of ghosting signals, severity, probable cause, and confidence level"
    - name: intervention_strategy
      type: object
      description: "Selected strategy with reasoning, channel, timing, and success probability"
    - name: message
      type: object
      description: "Personalized message with subject, body, tone analysis, and alternative versions"
    - name: success_metrics
      type: object
      description: "How to measure success and when to escalate to next strategy"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales-ai
    - reengagement
    - ghosting
    - intervention
    - relationship-rescue
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Deal Reengagement Intervention

## Goal
When a contact has gone dark, generate a data-driven reengagement intervention that analyzes ghosting signals, selects the optimal intervention strategy based on the relationship context, and produces a personalized message with reasoning. This is not a generic "follow-up template" -- it is a strategic intervention designed for THIS contact in THIS situation.

## Why Reengagement Interventions Matter

Ghosting is the #1 silent killer of B2B deals. Research consistently shows:

- **71% of buyers ghost sellers at some point** in the evaluation process (RAIN Group, B2B Buyer Behavior Study)
- **The average deal goes dark 2.7 times** before closing (Gong Labs analysis of 70,000+ deals)
- **15-20% of "dead" deals can be reactivated** with the right intervention at the right time (HubSpot Sales Benchmark)
- **The breakup email strategy** (honest, low-pressure check-in) reengages 18% of unresponsive contacts within 48 hours (Gong)
- **Multi-channel reengagement** (email → phone → LinkedIn) is 2.5x more effective than email-only (RAIN Group)
- **72 hours is the intervention window** -- after a contact goes dark, you have roughly 3 days to intervene before their attention permanently shifts elsewhere (Forrester B2B Buying Study)

The difference between "following up" and "intervening" is diagnosis + strategy. Following up repeats the same failed approach. Intervening changes the approach based on what went wrong.

## Required Capabilities
- **CRM**: To fetch contact data, relationship health, communication history, and deal context

## Inputs
- `contact_id`: The contact identifier (required)
- `deal_id`: Associated deal identifier for context (optional but recommended)
- `intervention_urgency`: "urgent" | "normal" | "low" -- affects strategy selection (optional, default: "normal")

## Data Gathering (via execute_action)

Gather comprehensive context for diagnosis:

1. **Contact record**: `execute_action("get_contact", { id: contact_id })` -- name, title, email, phone, company
2. **Relationship health**: Query `relationship_health_scores` table:
   - `overall_health_score`, `is_ghost_risk`, `ghost_probability_percent`
   - `days_since_last_contact`, `days_since_last_response`, `response_rate_percent`
   - `communication_frequency_score`, `sentiment_score`, `meeting_pattern_score`
   - `avg_response_time_hours`, `total_interactions_30_days`
3. **Communication history**: Query `communication_events` table (last 60 days):
   - All emails, calls, LinkedIn messages sent to this contact
   - Response patterns: which messages got responses, which did not
   - Last response date and content (if available)
4. **Meeting history**: `execute_action("get_contact_meetings", { contact_id, limit: 10 })`
   - Last meeting date, outcome, sentiment score
   - Topics discussed, commitments made
5. **Deal context** (if deal_id provided): `execute_action("get_deal", { id: deal_id, include_health: true })`
   - Deal stage, value, close date, health score
   - Other contacts engaged on the deal (multi-threading status)
6. **Recent activity on contact**: Last 5 CRM activities (notes, tasks, emails)
   - Look for patterns: what has been tried already?

If data is missing, proceed with available information but note gaps in the diagnosis.

## Ghosting Diagnosis Framework

Before selecting a strategy, diagnose the ghosting situation using these criteria:

### Ghosting Severity Levels

| Severity | Definition | Health Score Indicator | Days Since Response |
|----------|------------|------------------------|---------------------|
| **Mild** | Slower than usual to respond, but engagement history is strong | `is_ghost_risk: false`, score 50-70 | 3-7 days |
| **Moderate** | No response to 2+ messages, engagement declining | `is_ghost_risk: true`, score 30-50, ghost prob 40-60% | 7-14 days |
| **Severe** | No response to 3+ multi-channel attempts, relationship at risk | `is_ghost_risk: true`, score < 30, ghost prob 60-80% | 14-21 days |
| **Critical** | Complete radio silence for 3+ weeks, relationship likely dead | `is_ghost_risk: true`, score < 20, ghost prob 80%+ | 21+ days |

### Probable Cause Analysis

Ghosting rarely happens without reason. Diagnose the likely cause:

**1. Overwhelmed / Busy (40% of cases)**
- **Signals**: Previous engagement was positive, response time has historically been good, recent organizational changes or busy season
- **Context clues**: Contact mentioned being swamped, Q4 crunch time, product launch, etc.
- **Intervention approach**: Low-pressure, value-add, explicit acknowledgment of their workload

**2. Internal Deprioritization (25%)**
- **Signals**: Budget discussions stalled, project was pushed to next quarter, new priorities emerged
- **Context clues**: Last meeting mentioned "need to check on timing", references to budget cycle or other priorities
- **Intervention approach**: Permission-to-close, offer to revisit at a better time, seek candid feedback

**3. Objection Unresolved (15%)**
- **Signals**: Engagement dropped after a specific meeting or proposal, sentiment score declined, pricing or technical questions were raised but not fully resolved
- **Context clues**: Demo raised concerns, proposal had sticker shock, security review flagged issues
- **Intervention approach**: Address the objection explicitly, offer technical deep-dive or reference customer

**4. Competitor Won (10%)**
- **Signals**: Buyer mentioned evaluating alternatives, new requirements surfaced late, sudden radio silence after active engagement
- **Context clues**: Competitive positioning discussions, buyer asked for feature match
- **Intervention approach**: Honest check-in, leave door open, ask for feedback to improve

**5. Champion Lost Political Support (5%)**
- **Signals**: Champion was enthusiastic but could not get internal buy-in, economic buyer never engaged, champion's role or influence is limited
- **Context clues**: Champion said "I need to run this by my boss" repeatedly, decision delayed
- **Intervention approach**: Escalate to economic buyer, go around, or offer executive-to-executive alignment

**6. Poor Fit Realized (5%)**
- **Signals**: Buyer's use case diverged from solution capabilities, scope expanded beyond what ${company_name} offers
- **Context clues**: Buyer kept asking "can you do X?" where X is out of scope
- **Intervention approach**: Graceful exit, refer to partner or alternative, preserve relationship for future

## Intervention Strategy Playbook

Select ONE strategy based on the diagnosis. Do not mix strategies -- it dilutes the message.

### Strategy 1: Permission to Close (Best for: Internal Deprioritization)

**When to use**: When the silence signals timing issues, not rejection. The contact was engaged but the project lost internal priority.

**Approach**: Give them an easy out. Remove pressure. Paradoxically, this often re-engages by creating the fear of loss.

**Message template**:
```
Subject: [Contact Name] -- Closing Out

Hi [Contact Name],

I haven't heard back on [project/initiative], so I'm assuming the timing isn't right or priorities have shifted. I totally understand -- these things happen.

I'm going to close this out on my end. If things change down the road, I'm here and happy to reconnect.

Best,
[Your Name]
```

**Why this works**: It is honest, low-pressure, and respectful. It removes the awkwardness of ignoring emails. 15-20% respond within 48 hours to clarify or re-engage.

**Channel**: Email (primary). If no response in 48 hours, LinkedIn message (secondary).

**Success metric**: Response within 48-72 hours clarifying status or re-engaging.

---

### Strategy 2: Value-Add / Pattern Interrupt (Best for: Overwhelmed / Busy)

**When to use**: When the contact is likely just swamped and your generic "checking in" emails are getting lost in the noise.

**Approach**: Shift from asking for their time to giving them value. Share a relevant insight, case study, article, or introduction that helps their business.

**Message template**:
```
Subject: Quick resource for [their initiative]

Hi [Contact Name],

I know you're slammed (saw the [recent company news / product launch / event]). Not asking for time -- just wanted to share something that might be useful.

[Specific valuable thing]:
- Article / case study relevant to their problem
- Introduction to someone in their industry who solved a similar challenge
- Data point or benchmark they can use internally

No response needed. If you want to discuss, my calendar is open.

Best,
[Your Name]
```

**Why this works**: It breaks the pattern of "need a response" and reframes you as helpful, not needy. It gives them a reason to reply that is not defensive.

**Channel**: Email (primary). If they open but do not respond, call 24 hours later referencing the email.

**Success metric**: Email opened + response (even a "thank you" re-opens the door).

---

### Strategy 3: Honest Check-In (Best for: Moderate ghosting, unclear cause)

**When to use**: When you do not know why they stopped responding, but the relationship had been solid.

**Approach**: Ask directly. Be vulnerable. Acknowledge the silence without guilt-tripping.

**Message template**:
```
Subject: Real talk -- what happened?

Hi [Contact Name],

We had a good conversation going, and then things went quiet. I want to be direct: did something change on your end, or did I miss something?

If the timing is off or this isn't a priority anymore, no hard feelings -- just let me know so I'm not spinning my wheels.

If there is a concern or question I didn't address, I would love to hear it.

Best,
[Your Name]
```

**Why this works**: Vulnerability disarms. It acknowledges the elephant in the room and invites honesty. People respect directness.

**Channel**: Email (primary). If no response in 48 hours, call and reference the email.

**Success metric**: Response (positive or negative) that clarifies status.

---

### Strategy 4: Channel Switch (Best for: Severe ghosting, email fatigue)

**When to use**: When email is clearly not working. They are not opening, or opening but not responding.

**Approach**: Switch to a different channel. Phone, LinkedIn, SMS (if appropriate), or go through a mutual connection.

**Phone voicemail script**:
```
Hi [Contact Name], [Your Name] from ${company_name}. I have sent a few emails but haven't heard back -- totally possible they are in spam or you are just buried. I will keep this short: I wanted to confirm if [project] is still on your radar or if the timing shifted. If it is off the table, no problem -- just let me know so I can close the loop. My number is [your number]. Thanks.
```

**LinkedIn message**:
```
Hi [Contact Name] -- I have tried reaching you via email but haven't heard back. Just want to confirm: is [project] still active, or has timing shifted? If it is off the table, no worries -- just want to make sure I'm not spamming you. Let me know either way. Thanks.
```

**Why this works**: Different channel = different inbox. Phone and LinkedIn have less noise than email. The message is short, clear, and gives them an easy way to reply.

**Channel**: Phone (voicemail) or LinkedIn DM. Email has failed -- do not repeat it.

**Success metric**: Callback or DM response within 48 hours.

---

### Strategy 5: Go Around / Go Above (Best for: Champion lost support, single-threaded risk)

**When to use**: When the contact was a champion but does not have the authority or political capital to move the deal forward.

**Approach**: Go to a different stakeholder. Ask for an introduction. If blocked, go directly to the economic buyer or a peer.

**Message template (to original contact)**:
```
Subject: Looping in [other stakeholder]

Hi [Contact Name],

I haven't heard back, which makes me think either the timing is off or there is someone else who should be looped in.

Would it make sense to include [economic buyer / technical lead / project sponsor] in the conversation? I want to make sure we are aligned with whoever is driving this decision.

Let me know -- happy to send a quick intro or set up a call.

Best,
[Your Name]
```

**Message template (to new stakeholder, if going direct)**:
```
Subject: Following up on [project/initiative]

Hi [New Stakeholder Name],

I have been working with [Original Contact] on [project], but I have not been able to reconnect. I wanted to reach out directly to check: is [project] still moving forward, and if so, who is the best point of contact?

Happy to send over context or schedule a quick call to get aligned.

Best,
[Your Name]
```

**Why this works**: Single-threaded deals die when the thread breaks. Multi-threading saves deals. Going around is not rude if done respectfully.

**Channel**: Email (to original contact first). If no response, email or LinkedIn to new stakeholder.

**Success metric**: New stakeholder engages OR original contact responds to prevent you from going around.

---

### Strategy 6: Soft Close / Future Nurture (Best for: Critical ghosting, likely dead)

**When to use**: When 3+ weeks of multi-channel silence suggests the deal is dead.

**Approach**: Close it out gracefully. Preserve the relationship for the future. Do not burn the bridge.

**Message template**:
```
Subject: Closing out -- staying in touch

Hi [Contact Name],

I have not heard back in a few weeks, so I am going to assume this is not a priority right now. I will close this out on my end and stop reaching out.

If things change in the future, I would love to reconnect. In the meantime, I will send occasional updates on [relevant topic] -- let me know if you would rather I don't.

Best of luck with [their initiative / company goal].

Best,
[Your Name]
```

**Why this works**: It is graceful. It acknowledges reality. It leaves the door open without pressure. Some contacts come back 3-6 months later.

**Channel**: Email (final message). Add to long-term nurture sequence.

**Success metric**: No expectation of immediate response. Relationship preserved for future reactivation.

---

## Strategy Selection Logic

Use this decision tree to select the optimal strategy:

1. **Check ghosting severity** (from relationship_health_scores):
   - Mild (3-7 days) → Value-Add or Honest Check-In
   - Moderate (7-14 days) → Permission to Close or Honest Check-In
   - Severe (14-21 days) → Channel Switch or Go Around
   - Critical (21+ days) → Soft Close

2. **Check probable cause** (from diagnosis):
   - Overwhelmed → Value-Add
   - Deprioritized → Permission to Close
   - Objection → Honest Check-In (address objection in message)
   - Competitor → Permission to Close or Honest Check-In
   - Lost support → Go Around
   - Poor fit → Soft Close

3. **Check intervention urgency**:
   - Urgent (deal closing soon, high value) → Channel Switch or Go Around
   - Normal → Permission to Close or Honest Check-In
   - Low → Value-Add or Soft Close

4. **Check past attempts** (from communication history):
   - 0-1 attempts → Honest Check-In or Value-Add
   - 2-3 attempts → Permission to Close or Channel Switch
   - 4+ attempts → Soft Close or Go Around

## Message Personalization Rules

The selected strategy provides a template. Personalize it with:

1. **Contact's name and title** (obvious but critical)
2. **Last meaningful interaction** -- reference the last meeting, call, or email that got a response. "After our demo on Feb 10..." not "I haven't heard from you."
3. **Specific project or initiative name** -- "the data platform evaluation" not "our conversation"
4. **Company or industry context** -- "I saw [company] launched [product]" or "given the [industry trend]"
5. **Why now** -- why are you reaching out today? Time-based ("it has been 2 weeks"), deal-based ("your close date is approaching"), or value-based ("I came across something relevant")

**Avoid**:
- "Just checking in" (meaningless filler)
- "Circling back" (annoying cliche)
- Guilt-tripping: "I have sent you 5 emails" (defensive, not helpful)
- Generic value props: "We help companies save time" (they know this already)

## Output Contract

Return a SkillResult with:

- `data.ghosting_diagnosis`: object
  - `severity`: "mild" | "moderate" | "severe" | "critical"
  - `probable_cause`: "overwhelmed" | "deprioritized" | "objection" | "competitor" | "lost_support" | "poor_fit"
  - `confidence`: "high" | "medium" | "low" (based on signal strength)
  - `supporting_signals`: string[] (specific evidence from relationship_health_scores and communication_events)
  - `days_since_last_response`: number
  - `ghost_probability_percent`: number (from relationship_health_scores)
  - `previous_response_rate`: number (historical baseline)

- `data.intervention_strategy`: object
  - `strategy_name`: "permission_to_close" | "value_add" | "honest_checkin" | "channel_switch" | "go_around" | "soft_close"
  - `reasoning`: string (why this strategy for THIS contact)
  - `primary_channel`: "email" | "phone" | "linkedin" | "in_person"
  - `secondary_channel`: string | null (fallback if primary fails)
  - `timing_recommendation`: "immediate" | "wait_24h" | "wait_48h" (when to send)
  - `success_probability`: number (0-100, estimated based on strategy and severity)
  - `escalation_trigger`: string (when to switch to next strategy, e.g., "no response in 48 hours")

- `data.message`: object
  - `subject`: string (email subject line)
  - `body`: string (personalized message body)
  - `tone`: "professional" | "casual" | "direct" | "vulnerable"
  - `call_to_action`: string | null (what you are asking them to do, if anything)
  - `alternative_version`: string (optional second version with different tone or framing)

- `data.success_metrics`: object
  - `primary_metric`: string (e.g., "Response within 48 hours")
  - `secondary_metric`: string (e.g., "Email opened")
  - `failure_threshold`: string (e.g., "No response or open after 72 hours")
  - `next_action_if_fails`: string (what to do if this intervention does not work)

## Quality Checklist

Before returning the intervention, verify:

- [ ] Ghosting severity is based on actual data (days since response, ghost probability)
- [ ] Probable cause is supported by specific signals from the data
- [ ] Strategy selection is logical given severity, cause, and urgency
- [ ] Message is personalized (uses contact name, references last interaction, includes specific context)
- [ ] Message avoids cliches and filler phrases
- [ ] Tone matches strategy (vulnerable for honest check-in, low-pressure for permission to close)
- [ ] Channel recommendation is different from what has already failed
- [ ] Success metrics are specific and measurable
- [ ] Escalation trigger is time-bound (not open-ended)
- [ ] Alternative message version provides a meaningfully different approach (not just rephrased)

## Error Handling

### No relationship health data
Calculate ghosting severity manually from communication_events: days since last response, number of unanswered messages. Note: "Relationship health data unavailable -- severity assessment based on activity log."

### No communication history
Cannot diagnose cause without history. Default to "Honest Check-In" strategy. Note: "Communication history incomplete -- recommend updating CRM logs for better intervention design."

### Contact has responded recently (false ghost)
If `days_since_last_response < 3`, flag this: "Contact responded [X] days ago. No intervention needed at this time. Monitor for 7 days before intervening."

### Deal is closed-lost
If associated deal is marked closed-lost, ask: "Deal is marked closed-lost. Are you attempting to reactivate the deal, or is this a relationship-building outreach for future opportunities?" Adjust strategy accordingly.

### Contact left company
Check LinkedIn or company website if possible. If confirmed: "Contact is no longer at [company]. Recommend identifying their replacement or reaching out to a different stakeholder. Intervention strategy: Go Around."

### Multiple people ghosting on same deal
This is a systemic deal issue, not a contact issue. Recommend: "Multiple contacts on this deal are unresponsive. This suggests the deal is deprioritized or lost. Recommend a deal-level diagnosis (deal-rescue-plan skill) before intervening on individual contacts."

## Tone and Presentation

- Be diagnostic first, prescriptive second. Explain WHY this strategy, not just WHAT to say.
- Message tone should feel natural, not robotic. Read it out loud -- if it sounds stiff, revise.
- Avoid sales cliches. "Checking in" and "circling back" are banned phrases.
- Be honest about probability. If the ghost is severe and success probability is low, say so: "This is a long-shot reactivation -- the relationship health data suggests the deal is likely dead. The Soft Close strategy preserves goodwill for future opportunities."
- Personalization is non-negotiable. A generic template is worse than no message at all.
