---
name: Chase
description: |
  Multi-channel re-engagement for deals and contacts that have gone quiet.
  Uses RAG transcript search for conversation history, web search for trigger
  events and company news, silence-duration templates, and multi-channel strategy.
  Produces a personalized chase message with channel recommendation, silence
  analysis, and escalation path. Adapts tone and approach based on how long
  the prospect has been silent and what the transcripts reveal.
metadata:
  author: sixty-ai
  version: "3"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - outreach
  triggers:
    - pattern: "/chase"
      intent: "chase_slash_command"
      confidence: 0.95
      examples:
        - "/chase"
        - "/chase Acme Corp"
    - pattern: "chase up"
      intent: "chase_followup"
      confidence: 0.90
      examples:
        - "chase up this deal"
        - "chase up Sarah at Acme"
        - "can you chase this contact"
    - pattern: "gentle follow up"
      intent: "gentle_followup"
      confidence: 0.85
      examples:
        - "send a gentle follow up"
        - "write a soft follow up email"
        - "nudge this prospect"
    - pattern: "deal gone quiet"
      intent: "deal_reengagement"
      confidence: 0.85
      examples:
        - "this deal has gone quiet"
        - "haven't heard back from them"
        - "prospect went dark"
        - "no response in weeks"
  keywords:
    - "chase"
    - "follow up"
    - "nudge"
    - "re-engage"
    - "gone quiet"
    - "went dark"
    - "no response"
    - "haven't heard back"
    - "ghosted"
  requires_context:
    - contact
    - deal
  inputs:
    - name: deal_id
      type: string
      description: "Deal ID to chase -- pulls contact and conversation history"
      required: false
    - name: contact_id
      type: string
      description: "Contact ID to chase if no deal context"
      required: false
    - name: tone
      type: string
      description: "Email tone: warm (default), direct, or humorous"
      required: false
      default: "warm"
  outputs:
    - name: email_subject
      type: string
      description: "Subject line for the chase email -- concise, non-pushy, curiosity-driven"
    - name: email_body
      type: string
      description: "Full email body using a re-engagement pattern -- references last conversation, adds new value, soft CTA"
    - name: timing_suggestion
      type: object
      description: "Recommended send day, time, and rationale based on engagement history"
    - name: silence_analysis
      type: object
      description: "days_silent, silence_category (cooling/ghost/busy), risk_level (low/medium/high/critical)"
    - name: channel_recommendation
      type: object
      description: "primary_channel (email/call/linkedin/text), rationale, secondary_channel"
    - name: multi_thread_option
      type: object
      description: "Alternative contact suggestion if primary is unresponsive"
    - name: rag_context_used
      type: array
      description: "Specific findings from transcript search that informed the chase"
    - name: confidence_level
      type: string
      description: "high/medium/low based on data richness across all layers"
    - name: escalation_path
      type: object
      description: "What to do if this chase does not get a response -- next action, timeline, channel"
  requires_capabilities:
    - crm
    - web_search
  priority: high
  tags:
    - sales-ai
    - outreach
    - follow-up
    - re-engagement
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Chase

## Instructions

You are executing the /chase skill. Your job is to craft a re-engagement message that breaks the silence without damaging the relationship. The message must feel human, add genuine value, and give the prospect a low-friction reason to respond. Use the 5-Layer Intelligence Model below to gather maximum context before composing.

## Goal

Produce a multi-channel chase strategy that re-opens a stalled conversation. The primary output is a message tailored to the optimal channel, informed by transcript history, enrichment data, and silence duration analysis. Every recommendation must be grounded in data from the layers below.

## References

Consult `references/chase-templates.md` for duration-specific email templates, channel-specific message formats, tone variations, and annotated good vs bad examples.

Consult `references/reengagement-playbook.md` for the psychology of silence, multi-channel chase sequences, when to stop chasing, multi-threading strategies, and trigger event monitoring.

## The 5-Layer Intelligence Model

Work through these layers in order. Each layer informs the next.

### Layer 1: Contact & Deal Context

**Data to gather:**
- Contact: name, title, company, last activity date, communication preferences
- Deal: stage, value, close date, days in current stage, owner
- Activity timeline: last 20 activities across all channels
- Last touchpoint: date, channel, topic, who initiated
- Open commitments: next steps promised by either side

**Via execute_action:**
- If deal_id: `get_deal`, `get_deal_contacts`, `get_deal_activities` (limit: 20), `get_meetings`
- If contact_id: `get_contact`, `get_contact_activities` (limit: 20)

### Layer 2: Enrichment

**Web search for trigger events:**
- Prospect company news (funding, acquisitions, leadership changes, product launches) in last 90 days
- Industry developments relevant to the deal context
- Contact's recent LinkedIn activity or role changes
- Competitor moves that create urgency

**Contact enrichment:**
- Check `client_fact_profiles` for existing research (if `research_completed_at` within 7 days, use cached data)
- Updated role, title, or company changes since last contact
- New decision-makers or stakeholders at the account

### Layer 3: Historical Context (RAG)

**Search meeting transcripts for:**
- Last conversation topics and key themes with this contact
- Commitments made by both sides ("I will send you...", "We agreed to...")
- What excited the prospect (features, outcomes, ROI numbers they reacted to)
- What concerned them (objections, hesitations, questions they raised)
- Mentioned timelines or deadlines ("We need this by Q2", "Budget resets in April")
- Competitive mentions ("We are also looking at...", "Your competitor offered...")

**Use RAG results to:**
- Ground the chase message in real conversation history
- Reference specific moments that resonated
- Avoid re-asking questions already answered
- Flag if no transcripts exist (first interaction vs. data gap)

### Layer 4: Intelligence Signals

**Silence analysis:**
- Days since last contact
- Silence category: cooling (5-14 days), ghost (15-30 days), dormant (30+ days)
- Risk level: low (under 7 days), medium (8-14), high (15-21), critical (22+)
- Pattern check: Is this silence normal for deals at this stage and value?

**Multi-threading status:**
- Are there other contacts at this account?
- Has anyone else at the company engaged recently?
- Is there a champion, economic buyer, or technical evaluator we have not contacted?

**Competitive risk signals:**
- Did transcripts mention competitor evaluations?
- Has the prospect's company posted job listings suggesting they chose another vendor?
- Any trigger events that suggest the window is closing?

### Layer 5: Re-engagement Strategy

**Synthesize layers 1-4 into the optimal approach:**
- Select template tier based on silence duration (see below)
- Choose primary channel based on engagement history and contact preferences
- Determine tone based on relationship depth and deal stage
- Craft the value-add based on enrichment findings (Layer 2) and transcript context (Layer 3)
- Build escalation path if this chase does not get a response

## Silence Duration Template Selection

Select the approach based on days since last contact. See `references/chase-templates.md` for full templates.

| Duration | Category | Approach | Tone |
|----------|----------|----------|------|
| 5-7 days | Light touch | Value-add nudge, share a resource or insight | Warm, helpful |
| 8-14 days | Pattern break | New angle, different value prop, fresh information | Curious, direct |
| 15-21 days | Direct check-in | Acknowledge the gap, ask if priorities shifted | Respectful, clear |
| 22-30 days | Breakup | Permission-to-close, last-chance framing | Direct, professional |
| 30+ days | Re-activation | Only if trigger event found; otherwise graceful exit | Event-driven |

**Critical rule:** Never send a 5-7 day template when 22+ days have passed. The approach must match the silence duration.

## Multi-Channel Strategy

Choose the primary channel based on where the prospect previously engaged best. See `references/reengagement-playbook.md` for full sequences.

**Channel selection logic:**
1. Check which channel the prospect last responded on -- start there
2. If email has failed twice, switch to LinkedIn or phone
3. If no channel history, default sequence: email (day 0) -> LinkedIn (day 3) -> call (day 5) -> text (day 7)

**Channel-specific guidelines:**
- **Email**: 80-120 words, subject under 50 chars, single CTA
- **LinkedIn**: 40-60 words, reference a shared connection or their content, no attachments
- **Call**: 30-second voicemail script, reference one specific thing, leave a reason to call back
- **Text**: 20-30 words, only if prior text relationship exists, ultra-casual

## Email Composition

### Subject Line Rules
- Under 50 characters
- No "Re:" tricks or fake threads
- No "Just checking in" or "Following up"
- Options by type:
  - Reference-based: "Quick thought on [topic from last call]"
  - Value-based: "[Relevant insight] for [their company]"
  - Trigger-event: "[Company news] -- thought of you"
  - Direct: "[First name] -- still make sense?"

### Email Body Structure

**Opening (1 sentence)**: Reference the last conversation specifically. Use RAG transcript findings. Never open with "I hope this email finds you well."

**Value add (2-3 sentences)**: Must be grounded in Layer 2 or Layer 3 data:
- Trigger event from web search + how it relates to their stated problem
- Insight from transcript context (something they cared about + new development)
- Resource, case study, or data point relevant to their specific situation

**Graceful acknowledgment (1 sentence)**: Acknowledge the gap without blame. Tailor to the season or known context.

**Soft CTA (1 sentence)**: Low-friction, appropriate to silence duration:
- 5-7 days: "Would a quick call this week be useful?"
- 8-14 days: "Happy to send over [specific resource] if helpful"
- 15-21 days: "Has the priority shifted? Either way, no pressure"
- 22-30 days: "Should I close this out, or is there still interest?"

**Total length**: 80-120 words. Chase emails must be short.

### Tone Variations

**Warm (default)**: Friendly, helpful, no pressure. Best for most situations.

**Direct**: Respectful but clear ask. Best when the deal was progressing well and silence is unexpected. "I want to respect your time -- is this still something you are exploring, or has the priority shifted?"

**Humorous**: Light, self-aware. Only for prospects with established rapport. Use sparingly.

## Quality Checklist

Before returning results, verify every item:

- [ ] **Silence duration matches template tier.** A 22-day gap must not use a "light touch" template.
- [ ] **Email references specific context** from transcripts or CRM (not generic).
- [ ] **Value-add is grounded in data** -- enrichment finding, trigger event, or transcript insight.
- [ ] **Subject line is under 50 characters** and non-pushy.
- [ ] **Body is 80-120 words** (not a wall of text).
- [ ] **CTA matches silence duration** -- escalating directness over time.
- [ ] **Channel recommendation has a rationale** tied to engagement history.
- [ ] **No guilt-tripping, desperation signals, or passive aggression.**
- [ ] **Escalation path is defined** -- what happens if this chase gets no response.
- [ ] **Confidence level is honest** -- low if missing RAG/enrichment data, high if all layers populated.

## Graceful Degradation

| Failure | Impact | Fallback |
|---------|--------|----------|
| No CRM data | No deal/contact context | General re-engagement email, flag as "unlinked chase" |
| RAG returns nothing | No transcript history | Use CRM activity notes only, note "no transcript context" |
| Web search fails | No trigger events | Proceed without, use CRM context for value-add |
| Contact not enriched | No role/company updates | Use last-known CRM data, suggest enrichment |
| No activity history | Cannot calculate silence duration | Ask user for context, default to "warm" 8-14 day template |
| Multiple contacts on deal | Unclear who to chase | Choose champion or last engaged, present alternatives |
| Contact went dark < 3 days | Too soon to chase | Advise waiting at least 5 business days |
| Conflicting signals | RAG says positive, deal health says risk | Surface both, let user decide approach |
| No email address | Cannot send email | Recommend LinkedIn or phone as primary channel |
| All channels exhausted | Multiple chase attempts failed | Recommend graceful exit or multi-thread to new contact |

## Output Contract

Return a SkillResult with:
- `data.email_subject`: string (subject line, under 50 characters)
- `data.email_body`: string (full message body, 80-120 words, with greeting and sign-off)
- `data.timing_suggestion`: object with { best_day, best_time, timezone, wait_until, rationale }
- `data.silence_analysis`: object with { days_silent, silence_category, risk_level, pattern_normal }
- `data.channel_recommendation`: object with { primary_channel, rationale, secondary_channel, sequence }
- `data.multi_thread_option`: object with { alternative_contact, relationship, rationale } or null
- `data.rag_context_used`: array of { source, finding, relevance } objects from transcript search
- `data.confidence_level`: string ("high" / "medium" / "low") with `data.confidence_rationale`
- `data.escalation_path`: object with { next_action, timeline_days, channel, fallback_strategy }
- `data.context_used`: object with { last_contact_date, days_since_contact, last_topic, contact_name }
