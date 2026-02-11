---
name: Follow-Up Reply Drafter
description: |
  Draft contextual reply emails for threads that need a response, with subject lines and clear CTAs.
  Use when a user asks "draft a reply", "help me respond to this email", "write a follow-up email",
  or needs email drafts for outstanding threads. Returns reply drafts and follow-up task previews.
metadata:
  author: sixty-ai
  version: "2"
  category: writing
  skill_type: atomic
  is_active: true
  agent_affinity:
    - outreach
  triggers:
    - pattern: "draft a reply"
      intent: "reply_drafting"
      confidence: 0.85
      examples:
        - "draft a reply to this email"
        - "help me respond to this thread"
        - "write a reply"
    - pattern: "write a follow-up email"
      intent: "followup_email"
      confidence: 0.85
      examples:
        - "draft a follow-up email"
        - "help me write a follow-up"
        - "compose a reply email"
    - pattern: "respond to this email"
      intent: "email_response"
      confidence: 0.80
      examples:
        - "I need to reply to this"
        - "help me answer this email"
        - "what should I say in response"
  keywords:
    - "reply"
    - "draft"
    - "email"
    - "respond"
    - "follow-up"
    - "compose"
    - "write"
    - "thread"
  requires_capabilities:
    - email
    - crm
  requires_context:
    - threads_needing_response
    - contact_data
  inputs:
    - name: context
      type: string
      description: "Email thread content or summary requiring a reply"
      required: true
    - name: tone
      type: string
      description: "Desired tone for the reply"
      required: false
      default: "professional"
      example: "friendly"
    - name: recipient_name
      type: string
      description: "Name of the person being replied to"
      required: false
  outputs:
    - name: reply_drafts
      type: array
      description: "3-5 email draft objects with to, subject, context, tone, and linked IDs"
    - name: task_previews
      type: array
      description: "2-3 follow-up task previews with title, description, due date, and priority"
  priority: high
---

# Follow-Up Reply Drafter

## Goal
Draft **contextual reply emails** for threads needing response, with suggested subject lines and clear CTAs. Every reply should feel like it was written by the rep, not a machine — it acknowledges context, advances the conversation, and asks for exactly one thing.

## Why Reply Quality Matters

The data is clear: how you reply matters as much as whether you reply at all.

- **Replies under 100 words get 2x the response rate** compared to replies over 200 words (Boomerang, 2023 analysis of 300K+ email threads).
- **Emails with a single CTA have 371% higher click rates** than those with multiple asks (WordStream).
- **Personalized subject lines increase open rates by 26%** (Campaign Monitor), and reply threading (keeping "Re:") gets 93% open rates.
- **The first sentence determines read-through**: 65% of recipients decide whether to read the full email based on the opening line (Litmus).
- **Tone-matched replies get 40% faster responses**: When your reply mirrors the formality level of the sender, they respond faster (Gong.io communication study).
- **Including a specific time in your CTA** (e.g., "Does Thursday at 2pm work?") increases booking rates by 3.5x compared to "Let me know when you're free" (Calendly data).

Bad follow-ups don't just fail to advance the deal — they actively damage it. A generic "just checking in" email signals low effort and makes the prospect less likely to engage in the future.

## Required Capabilities
- **Email**: To access thread history and draft replies
- **CRM**: To enrich replies with deal context and contact data

## Inputs
- `threads_needing_response`: output from `followup-triage` (or a single thread object)
- `contact_data`: from `execute_action("get_contact", { id })` for each thread's contact_id
- (Optional) `deal_data`: from `execute_action("get_deal", { id })` for deal-linked threads
- (Optional) `tone`: override tone preference ("professional", "friendly", "executive")

## Data Gathering (via execute_action)
1. Fetch thread details: `execute_action("search_emails", { thread_id })` for full thread context
2. Fetch contact: `execute_action("get_contact", { id: contact_id })` for name, title, company
3. Fetch deal: `execute_action("get_deal", { id: deal_id })` if thread is deal-linked
4. Fetch recent activities: `execute_action("get_activities", { contact_id, limit: 5 })` for interaction history

## Context-Aware Reply Frameworks

Consult `references/reply-frameworks.md` for the complete framework library with 3 example replies per framework, a framework selection decision tree, CTA options, and anti-patterns to avoid.

Every reply falls into one of these scenario types. Identify the scenario first, then apply the matching framework.

### Scenario 1: Answering a Question
The prospect asked something specific and you need to respond.

**Framework: Answer-Expand-Advance**
1. **Answer**: Direct answer to their question in the first sentence. No preamble.
2. **Expand**: One sentence of helpful context or a resource link if relevant.
3. **Advance**: Move the conversation forward with a related question or next step.

**Example:**
```
Hi Sarah,

Yes, our API fully supports OAuth 2.0 PKCE for mobile and SPA clients. Here's our auth documentation with implementation examples: [link]

Would it be helpful to schedule a 20-minute technical walkthrough with our solutions engineer this week? I have Thursday 2-3pm open.

Best,
[Rep]
```

**Anti-pattern (what NOT to write):**
```
Hi Sarah,

Thanks for reaching out! Great question. I wanted to circle back on your inquiry about OAuth support...
[3 paragraphs of background nobody asked for]
Let me know if you have any other questions!
```

### Scenario 2: Delivering a Promise
You committed to sending something and now need to follow through.

**Framework: Deliver-Context-Bridge**
1. **Deliver**: Lead with the deliverable. Attach it or link it immediately.
2. **Context**: One sentence explaining what they will find and why it matters to them specifically.
3. **Bridge**: Connect the deliverable to the next step in the buying process.

**Example:**
```
Hi Mike,

Attached is the enterprise pricing breakdown we discussed. I've highlighted the volume tier that matches your 500-seat deployment — it comes in 18% under your current vendor.

Shall I walk through the ROI model with your procurement team? Happy to join your internal review.

Best,
[Rep]
```

### Scenario 3: Re-engaging a Stale Thread
The conversation went cold and you need to restart momentum without being pushy.

**Framework: Value-Hook-Easy-Ask**
1. **Value**: Lead with something genuinely useful — a relevant insight, resource, case study, or market update. Never lead with "just checking in."
2. **Hook**: Connect the value to their specific situation or a previous conversation point.
3. **Easy Ask**: Make the CTA low-friction. Not "let's schedule a call" but "worth a look?"

**Warm stale (3-7 days):**
```
Hi Lisa,

Thought you'd find this relevant — [Company in their industry] just published their Q3 results showing a 34% improvement in pipeline velocity after implementing [relevant capability]. Reminds me of the conversion challenges you mentioned.

Worth a quick look? Happy to share how the approach maps to your setup.

Best,
[Rep]
```

**Cold stale (8-14 days):**
```
Hi Lisa,

I came across [specific insight] and immediately thought of your team's [specific challenge they mentioned]. We just helped [similar company] solve this — here's a 2-minute case study: [link]

No pressure at all — just thought it might be useful as you evaluate options.

Best,
[Rep]
```

**Dead stale (15+ days) — Pattern Interrupt:**
```
Hi Lisa,

I realize I may have been approaching this from the wrong angle. Instead of [previous topic], I'm curious: what's the single biggest pipeline challenge keeping your team up at night this quarter?

Even a one-line reply would help me understand if there's a way I can actually be useful.

Best,
[Rep]
```

### Scenario 4: Advancing a Deal
The thread is active and you need to push toward the next milestone.

**Framework: Acknowledge-Advance-Commit**
1. **Acknowledge**: Reference the last interaction or decision point.
2. **Advance**: Propose the specific next step with reasoning.
3. **Commit**: Offer concrete times or actions to remove friction.

**Example:**
```
Hi James,

Great call yesterday — your team's questions about data migration were exactly the right ones to raise at this stage.

Based on what we covered, I think the logical next step is a 45-minute technical deep dive with your data engineering lead. That way we can map your current schema to our migration tooling before you commit budget.

I have Tuesday 10am or Wednesday 2pm open. Which works better for your team?

Best,
[Rep]
```

## The "Acknowledge-Advance" Pattern

This is the universal principle underlying all reply frameworks. Every good reply does two things:

1. **Acknowledge what they said or did** — proves you read their message, validates their concern, and shows you are paying attention. This is not fluff; it is trust-building.
2. **Advance the conversation** — move it toward a specific outcome. Never leave a thread in the same state you found it.

### Acknowledgment Techniques
- **Mirror their language**: If they said "we're struggling with pipeline visibility," use "pipeline visibility" in your reply, not "sales analytics."
- **Reference specifics**: Quote a number, a name, or a date they mentioned.
- **Validate their concern**: "That's a fair point" or "Makes sense given your timeline."

### Advancement Techniques
- **Propose a specific next step** (not "let me know your thoughts").
- **Offer two options** (creates a choice, not a yes/no decision).
- **Set a deadline or date** (adds productive urgency without pressure).

## Tone Matching Methodology

See `references/tone-matching.md` for the complete tone calibration guide with sender detection signals, the tone matching matrix, the formality ladder with word substitutions, cultural and industry adjustments, and data on tone matching impact on reply rates.

Reply tone should mirror the sender's formality level, adjusted one notch toward professional. This builds rapport without being jarring.

### Tone Detection Signals
| Signal | Formal | Casual |
|--------|--------|--------|
| Greeting | "Dear [Name]" | "Hey [Name]" or no greeting |
| Sentence structure | Complete sentences, proper punctuation | Fragments, dashes, ellipses |
| Sign-off | "Best regards," "Sincerely," | "Thanks!", "Cheers," or none |
| Word choice | "I would like to inquire" | "Quick question" |
| Emoji/exclamation | None | Present |

### Tone Matching Rules
1. **If they write formally**: Match their formality. Use "Dear" or "Hi [Full Name]."
2. **If they write casually**: Be warm but slightly more polished. Use "Hi [First Name]" not "Hey."
3. **If they use humor**: You can acknowledge it lightly but keep it brief. Never force humor.
4. **If uncertain**: Default to "professional-warm" — friendly but not casual. "Hi [First Name]," complete sentences, "Best,"
5. **C-suite rule**: Always lean one notch more formal when writing to VP+ level, regardless of their tone.

### Tone Override
If the user explicitly specifies a tone ("make it friendly," "keep it executive"), that overrides the matching algorithm. Map to:
- **"friendly"**: First name, warm opening, conversational language, exclamation mark allowed
- **"professional"**: Full name first time, measured language, structured paragraphs
- **"executive"**: Shortest possible, bullet points, no pleasantries, bottom-line-first

## CTA Design for Replies

Reply CTAs are fundamentally different from cold outreach CTAs. In a reply, you already have context and relationship. Use it.

### CTA Principles for Replies
1. **Single CTA only**: Never ask for two things. Pick the most important next action.
2. **Be specific**: "Does Thursday at 2pm work?" beats "Let me know when you're free."
3. **Reduce friction**: Offer to do the work. "I'll send a calendar invite" vs "Please find a time."
4. **Match the stakes**: Small ask for early-stage, bigger commitment for late-stage.
5. **Give an out**: "No pressure if the timing isn't right" — paradoxically increases response rates by 22% (HubSpot A/B tests).

### CTA by Thread Category
| Category | CTA Style | Example |
|----------|-----------|---------|
| Answering a question | Offer related help | "Want me to set up a walkthrough?" |
| Delivering a promise | Bridge to next step | "Shall I loop in your [role] to review?" |
| Re-engaging stale | Low-friction value | "Worth a look?" |
| Advancing a deal | Specific commitment | "Tuesday 10am or Wednesday 2pm?" |
| Relationship maintenance | Open-ended personal | "Would love to catch up — coffee next week?" |

## Thread Continuation Principles

When drafting a reply within an existing thread:

1. **Never restart**: Do not re-introduce yourself or recap the entire thread. They know who you are.
2. **Build momentum**: Reference the most recent message, not the first one.
3. **Keep the thread**: Reply in-thread, do not start a new email. Threading has 93% open rates.
4. **Shorten over time**: As the thread progresses, replies should get shorter, not longer. First reply might be 100 words. Fifth reply might be 30.
5. **Match cadence**: If they reply in 2-hour cycles, you should too. If they reply in 24-hour cycles, give them at least 12 hours.

## Subject Line Modification Rules

### When to Keep "Re: [Original Subject]"
- Thread has < 10 messages
- Original subject is still relevant
- Conversation has not changed topics
- You want to maintain the high open rate of threaded replies (93%)

### When to Modify the Subject
- Thread has changed topics significantly
- Original subject is vague (e.g., "Re: Quick question" after 15 exchanges)
- You are delivering a specific deliverable (change to "Re: [Original] — Pricing Attached")
- Thread has > 10 messages and you want to reset readability

### Subject Line Modification Format
Always preserve the "Re:" prefix for threading. Append a clarifier:
- `Re: Q3 Planning — Pricing Breakdown Attached`
- `Re: Technical Review — OAuth 2.0 Details`
- `Re: Partnership Discussion — Next Steps for Tuesday`

## Task Creation from Email Context

For each reply draft, generate 1-2 follow-up task previews. These ensure the rep does not just send the reply and forget about it.

### Task Design Rules
1. **One internal task**: Something the rep or their team needs to do (prepare a doc, brief a colleague, update CRM).
2. **One customer-facing task**: The expected follow-up after the reply (confirm meeting, check if they opened the attachment, send the next artifact).
3. **Due dates should be specific**: "Tomorrow by 2pm" or "Wednesday EOD" — not "soon" or "next week."
4. **Priority matches thread urgency**: High-urgency thread = high-priority tasks.
5. **Tasks must be actionable**: Start with a verb. "Send," "Prepare," "Follow up," "Update," "Schedule."

### Example Task Previews
```
Task 1 (Internal): "Update Acme deal stage to Negotiation in CRM"
Due: Today EOD | Priority: High | Deal: Acme Corp Expansion

Task 2 (Customer-facing): "Follow up with Sarah if no reply to pricing by Thursday"
Due: Thursday 10am | Priority: High | Contact: Sarah Chen
```

## Output Contract

Return a SkillResult with:

### `data.reply_drafts`
Array of 3-5 email drafts (one per top-priority thread), sorted by urgency. Each entry:
- `to`: string (contact email)
- `contact_name`: string
- `subject`: string (suggested subject line, preserving "Re:" when appropriate)
- `body`: string (the full reply text, ready to send)
- `body_html`: string | null (HTML formatted version if available)
- `scenario`: "answering_question" | "delivering_promise" | "re_engaging" | "advancing_deal" | "relationship_maintenance"
- `framework_used`: string (name of the framework applied)
- `tone`: "professional" | "friendly" | "executive"
- `word_count`: number (must be <= 150 for standard replies)
- `cta`: string (the specific call-to-action used)
- `cta_type`: "specific_time" | "binary_choice" | "low_friction" | "open_ended"
- `thread_id`: string | null
- `contact_id`: string | null
- `deal_id`: string | null
- `context_used`: string (brief note on what context informed the reply)

### `data.task_previews`
Array of 2-3 task previews. Each entry:
- `title`: string (starts with a verb)
- `description`: string (includes checklist items if multi-step)
- `due_date`: string (ISO date, or relative like "tomorrow 2pm")
- `priority`: "high" | "medium" | "low"
- `type`: "internal" | "customer_facing"
- `contact_id`: string | null
- `deal_id`: string | null
- `trigger_condition`: string | null (e.g., "if no reply by Thursday" — for conditional follow-up tasks)

### `data.summary`
String: Human-readable summary. Example: "Drafted 4 replies: pricing follow-up to Sarah Chen (High), technical answer to Mike Rodriguez (High), re-engagement to Lisa Park (Medium), and relationship touch to James Kim (Low). Created 3 follow-up tasks."

## Quality Checklist

Before returning results, validate every reply draft against these criteria:

### Content Quality
- [ ] Reply is under 150 words (hard limit for standard replies; executive tone allows up to 80 words)
- [ ] Reply has exactly ONE call-to-action (never two)
- [ ] Reply acknowledges something specific from the previous message (a quote, a number, a name, a concern)
- [ ] Reply advances the conversation (thread state after sending is different from before)
- [ ] Reply does not start with "Just checking in," "Hope you're well," "I wanted to follow up," or any variant of these dead phrases
- [ ] Reply does not re-introduce the rep or the company (they already know)

### Tone Quality
- [ ] Tone matches the sender's formality level (within one notch)
- [ ] No forced humor or emojis unless the sender uses them
- [ ] First name used (not full name) unless writing to C-suite for the first time

### CTA Quality
- [ ] CTA is specific and actionable (not "let me know your thoughts")
- [ ] CTA includes a specific time or option when requesting a meeting
- [ ] CTA matches the thread stage (low friction for early stage, commitment for late stage)
- [ ] CTA gives an easy out for re-engagement emails ("no pressure" or equivalent)

### Context Quality
- [ ] Deal name and stage are referenced naturally (not forced) in deal-linked replies
- [ ] No confidential information from CRM is exposed to external recipients
- [ ] Company name and contact title are correct and current
- [ ] Dates and deadlines mentioned are realistic and not in the past

### Thread Quality
- [ ] Subject line preserves "Re:" threading unless topic changed significantly
- [ ] Reply fits naturally as the next message in the thread
- [ ] Reply is shorter than or equal in length to the previous exchange

## Error Handling

### Missing thread context
If the thread history is unavailable, draft a general reply based on the subject line and contact data. Flag in output: "Limited thread context — reply may need manual adjustment before sending."

### Contact not found in CRM
If `get_contact` returns null, use the email address and any name from the thread. Set `contact_id: null` and note: "Contact not in CRM — consider creating a record."

### No deal linked
If no deal is linked, omit deal references from the reply. This is not an error — many legitimate replies are pre-deal or relationship-based.

### Ambiguous scenario
If the thread fits multiple scenarios (e.g., answering a question AND delivering a promise), pick the higher-priority scenario (delivering a promise outranks answering a question). Note both in `context_used`.

### Thread too long
If the thread has 20+ messages, focus on the last 3-5 exchanges for context. Do not attempt to summarize the entire history in the reply.

### Sensitive content detected
If the thread contains pricing, contract terms, legal language, or competitor mentions, add a flag: `"sensitivity": "high"` and note: "Contains sensitive content — review carefully before sending."

### Tone conflict
If the user requests a tone that conflicts with the thread context (e.g., "make it casual" for a C-suite negotiation thread), honor the user's request but add a note: "Requested tone (casual) differs from typical formality for this contact level (executive). Applied as requested."

## Examples

### Good Reply Draft
```
Subject: Re: Q3 Planning — Pricing Breakdown Attached

Hi Sarah,

Attached is the enterprise pricing for your 500-seat deployment — I've highlighted
the volume tier that saves 18% vs. your current setup.

Two things to flag: the annual commitment unlocks an additional 10% discount,
and we can phase the rollout across your 3 offices to reduce migration risk.

Would it help to walk through this with your procurement lead? I have Thursday
2-3pm or Friday 10-11am open.

Best,
[Rep]
```
**Why this is good**: 73 words. Delivers the promise immediately. Adds value (discount detail, phased rollout). Specific CTA with two time options. References their situation (500 seats, 3 offices).

### Bad Reply Draft (what to avoid)
```
Subject: Re: Q3 Planning

Hi Sarah,

I hope this email finds you well! I wanted to follow up on our previous
conversation about pricing. As discussed, I'm attaching the pricing document
for your review. Our enterprise plan offers flexible pricing options for
organizations of all sizes. We have three tiers: Starter, Professional, and
Enterprise. The Enterprise tier includes unlimited users, priority support,
24/7 monitoring, advanced analytics, custom integrations, and dedicated
account management.

Please let me know if you have any questions or if you'd like to schedule
a call to discuss further. I'm happy to help in any way I can!

Looking forward to hearing from you.

Best regards,
[Rep]
```
**Why this is bad**: 118 words of fluff. Starts with "I hope this email finds you well." Generic feature list nobody asked for. Vague CTA ("let me know"). Does not reference her specific situation. Does not acknowledge what was promised.
