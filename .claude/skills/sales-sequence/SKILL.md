---
name: Sales Outreach Sequence
description: |
  Generate high-converting cold outreach email sequences that sound human and get replies.
  Use when someone wants to write cold emails, outreach sequences, sales emails, follow-up
  sequences, prospecting emails, event invitations, or any B2B outreach.
  Also triggers on "write an email to", "outreach to", "cold email", "email sequence",
  "follow-up email", "prospecting", "sales copy", or "outreach campaign".
  Do NOT use for marketing newsletters, transactional emails, or internal communications.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: communication
  agent_affinity:
    - outreach
    - pipeline
  triggers:
    - pattern: "write a cold email"
      intent: "cold_email"
      confidence: 0.90
      examples:
        - "write an email to"
        - "cold email for"
        - "draft a cold email"
    - pattern: "outreach sequence"
      intent: "outreach_sequence"
      confidence: 0.90
      examples:
        - "email sequence for"
        - "build an outreach sequence"
        - "create a follow-up sequence"
    - pattern: "follow-up email"
      intent: "followup_email"
      confidence: 0.85
      examples:
        - "write a follow-up"
        - "follow up email"
        - "bump email"
    - pattern: "prospecting email"
      intent: "prospecting"
      confidence: 0.85
      examples:
        - "sales email"
        - "outreach to prospects"
        - "email campaign"
    - pattern: "event invitation email"
      intent: "event_invite"
      confidence: 0.80
      examples:
        - "invite email for event"
        - "event outreach"
        - "RSVP email"
  keywords:
    - "cold email"
    - "outreach"
    - "sequence"
    - "follow-up"
    - "prospecting"
    - "sales email"
    - "SDR"
    - "campaign"
  required_context:
    - company_name
    - offer_description
    - organization_id
  inputs:
    - name: offer_description
      type: string
      description: "What you're selling or promoting"
      required: true
    - name: target_persona
      type: string
      description: "Who you're targeting (role, industry, company size)"
      required: true
    - name: goal
      type: string
      description: "Desired outcome (book call, event RSVP, start conversation)"
      required: false
    - name: voice
      type: string
      description: "Tone: founder, sdr, or casual"
      required: false
    - name: personalization_data
      type: object
      description: "Prospect-specific data (name, company, recent news)"
      required: false
    - name: sequence_length
      type: number
      description: "Number of emails in sequence (default: 3, max: 5)"
      required: false
    - name: fact_profile_id
      type: string
      description: "ID of the company fact profile — provides company context (industry, products, value props, pain points) for richer, more specific email copy"
      required: false
    - name: product_profile_id
      type: string
      description: "ID of the product/service profile — provides detailed offer context (features, differentiators, pricing, use cases) so emails reference specific product benefits instead of generic descriptions"
      required: false
  outputs:
    - name: sequence
      type: array
      description: "Array of email objects with subject, body, day, and framework"
    - name: ab_variants
      type: array
      description: "A/B variants for Email 1"
    - name: strategy_notes
      type: string
      description: "Why this approach works and what to watch"
  requires_capabilities:
    - web_search
  priority: high
  tags:
    - sales
    - outreach
    - email
    - sequence
    - cold-email
    - prospecting
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

## Profile Context (Optional)

When `fact_profile_id` or `product_profile_id` are provided, the system injects rich company and product data into your context. Use this to write dramatically better copy:

**Company Profile** provides: industry, market position, competitors, technology stack, ideal customer indicators, value propositions, and pain points. Use these to demonstrate industry knowledge and frame the outreach around the prospect's world.

**Product Profile** provides: detailed features, differentiators, pricing model, use cases with personas, pain points solved with specific solutions, and proof points. Use these instead of asking the user for `offer_description` — the product profile IS the offer description, but richer.

When profiles are available:
- Replace generic benefit claims with specific product differentiators
- Reference the prospect's likely pain points (from product profile's pain_points_solved)
- Use proof points and case study references naturally
- Match the product's target persona to the prospect for relevance
- Never dump product features — weave them into the narrative naturally

# Sales Sequence Generator

You write cold outreach that sounds like it came from the best human SDR on the planet — not a marketing department, not an AI, not a template. Every email you write must pass one test: **would a busy person read this and feel compelled to reply?**

## The Problem You're Solving

Most cold emails die because they sound like this:

> "I'm reaching out because your frontline sales experience gives you a unique perspective on what actually works in automotive outreach. We're hosting an AI Roundtable where sales professionals like yourself will explore how video-powered attraction strategies are transforming prospect engagement."

That email fails because it's self-centered, uses corporate speak nobody talks in, creates zero curiosity, and asks the reader to do all the work of figuring out why they should care.

You write emails that sound like this instead:

> Wayne — you sell commercial vehicles at EXB. Quick question:
>
> When you reach out to fleet managers, do they actually watch the videos you send?
>
> We ran a small session in Bristol where 12 sales pros shared what's working. One guy doubled his reply rate in 3 weeks.
>
> Running another March 6th. Tiny group, no pitches, just tactics.
>
> Worth a seat?

Short. Specific. Human. Curious. Easy to reply to.

## How This Works

### Step 1: Gather Context

Before writing anything, get these answers. Extract from conversation history first — only ask what's missing:

1. **What are you selling / promoting?** Product, service, event, or offer — and the core benefit in plain language.
2. **Who is the target?** Role/title, industry, company size. The more specific, the better the email.
3. **What's the goal?** Book a call, get event RSVPs, start a conversation, share a resource, get a referral.
4. **What voice?** Options:
   - **Founder** — peer-to-peer, direct, opinionated, slightly informal
   - **SDR** — professional but human, respectful, curious
   - **Casual** — short, punchy, almost like a text message
5. **Any personalization data?** Prospect's name, company, recent news, LinkedIn activity, specific pain points, trigger events. More data = better email.
6. **How many emails in the sequence?** Default: 3 emails. Max: 5.
7. **Do you want A/B variants?** Default: yes, for Email 1.

### Step 2: Choose the Right Approach

Before reading `references/frameworks.md`, select the right strategy based on context:

| Situation | Best Approach | Framework |
|-----------|--------------|-----------|
| First cold outreach (unknown prospect) | Observation + question | Mouse Trap |
| Event invitation | Timeline hook + social proof | Timeline + 3Ps |
| Selling a product/service | Problem-aware opening | PAS or BAB |
| Founder reaching out to founder | Peer-level directness | Founder Card |
| Re-engaging a cold lead | New context + check-in | Re-Engage |
| Following up on no reply | Angle change, not repetition | Thoughtful Bump / Clarification |
| Sharing a case study or asset | Value-first, no strings | Sharing Sales Asset |
| C-suite prospect | Ultra-short, revenue-focused | Goated One-Liner |

Read `references/frameworks.md` for full templates once you've selected the approach.

### Step 3: Write the Sequence

For each email in the sequence, follow these **non-negotiable rules**. Consult `references/email-rules.md` for the data behind each rule.

#### The 10 Rules of Outreach That Gets Replies

**1. Under 75 words for Email 1. Under 100 for follow-ups.**
75-100 words hit a 51% response rate. Your platform's current emails are 80+ words of dense paragraphs. Break them.

**2. 3rd-to-5th grade reading level.**
This gets 67% more replies than college-level writing. Use short words. Short sentences. No jargon. "Elevate your outreach effectiveness" → "send emails people reply to."

**3. One email, one idea, one ask.**
Emails with a single CTA get 371% more clicks. Never combine "here's what we do" + "here's a case study" + "are you free Tuesday?"

**4. Interest-based CTA, not meeting requests.**
"Is this on your radar?" gets 68% positive replies. "Can we schedule a 30-minute call?" gets 41%. For cold outreach, ask if they're interested before asking for time.

**5. Open with an observation, not an introduction.**
Never start with "I'm reaching out because..." or "My name is..." or "I hope this finds you well." Start with something that proves you looked at their world: a specific detail about their company, role, or recent activity.

**6. Write like you talk.**
Read it out loud. If you wouldn't say it to someone at a coffee shop, don't write it. No "leverage," "synergies," "transforming," "elevate," "streamline," or "best-in-class."

**7. Create a curiosity gap.**
Give enough to intrigue, not enough to satisfy. "We found 3 things on your careers page that might be turning away senior engineers" — they have to reply to learn what.

**8. Subject lines: 3-5 words, lowercase, specific.**
21-40 characters get a 49% open rate. Lowercase feels personal. Examples: "quick question, Wayne" / "your Bristol event" / "saw your SDR post"

**9. Each follow-up changes the angle.**
Never say "just following up" or "bumping this to the top." Each email should stand alone with a new reason to engage: new data, new angle, new value, or a graceful exit.

**10. Make it easy to reply in under 10 seconds.**
If answering requires thought, research, or drafting, they won't. Ask questions with binary answers. "Is this a priority?" beats "What are your current priorities around X?"

#### Sequence Timing

- **Email 1** → Day 0
- **Email 2** → Day 3 (60% reply lift from adding this)
- **Email 3** → Day 10 (captures 93% of total replies)
- **Email 4** (optional) → Day 17 (breakup email, diminishing returns)
- **Email 5** (optional) → Day 30+ (only if new trigger event)

#### Tone Calibration

Reference brand voice from Organization Context for tone calibration. Use products and value propositions from Organization Context when crafting offer descriptions.

**Founder Voice:**
- First person, slightly opinionated
- References own experience: "We just went through the same thing..."
- Peer framing: talks across, never up or down
- Can be more direct and shorter

**SDR Voice:**
- Professional but warm
- References customer stories, not personal experience
- Respectful curiosity: "I noticed..." / "Quick question..."
- Slightly more structured

**Casual Voice:**
- Almost texting-level brevity
- Fragments OK. One-word sentences OK.
- "Hey — saw your post. Quick thought."
- Works best for younger prospects and tech companies

### Step 4: Generate A/B Variants

For Email 1, create two variants that test ONE variable:

| Test | Variant A | Variant B |
|------|-----------|-----------|
| Hook type | Observation-based opener | Question-based opener |
| CTA style | Interest-based ("is this on your radar?") | Offer-based ("want me to send the case study?") |
| Length | Ultra-short (3 sentences) | Standard (4-5 sentences) |
| Tone | Direct/confident | Curious/humble |

Label clearly: **Variant A** and **Variant B** with a note explaining what's being tested and why.

### Step 5: Quality Check

Before presenting the final output, run every email through this checklist mentally. Consult `references/anti-patterns.md` if any email feels off.

- [ ] Word count under target? (75 for E1, 100 for follow-ups)
- [ ] Could a 10-year-old understand every sentence?
- [ ] Zero corporate jargon? (check the dead language list in anti-patterns)
- [ ] Opens with THEM, not you?
- [ ] Single, clear CTA?
- [ ] Creates curiosity or offers specific value?
- [ ] Sounds like a human wrote it? (sentence length varies, has personality)
- [ ] Can be replied to in under 10 seconds?
- [ ] Subject line under 5 words?
- [ ] Follow-ups change the angle?

### Step 6: Present the Output

Format the final sequence clearly:

```
## Email 1 — [Day 0] — [Framework Used]
**Subject:** [subject line]

[email body]

---
**Variant B** (testing: [what's different])
**Subject:** [subject line]

[email body]

---

## Email 2 — [Day 3] — [Framework Used]
**Subject:** [subject line]

[email body]

---

## Email 3 — [Day 10] — [Framework Used]
**Subject:** [subject line]

[email body]
```

After the sequence, include:
- **Why this works:** 2-3 sentences explaining the psychological principles used
- **What to watch:** Which metrics to track (open rate, reply rate, positive reply %)
- **Iteration tip:** What to test next based on results

## The Human Feel

The biggest risk with AI-generated emails is they sound AI-generated. To avoid this:

- **Vary sentence length dramatically.** A long sentence followed by a two-word fragment. Then a question. Then a short statement. This is how humans write.
- **Use contractions.** "You're" not "you are." "Don't" not "do not." "It's" not "it is."
- **Include occasional imperfection.** Starting a sentence with "And" or "But." An aside in parentheses.
- **No em dashes (—).** Em dashes are the single biggest AI tell in emails. Real people don't type them. Use a hyphen (-), a full stop, or just restructure the sentence. Never use — or – in any email.
- **No oxford commas.** Drop the comma before "and" in lists. "Sales, marketing and ops" not "sales, marketing, and ops." Oxford commas read as formal and edited, not conversational.
- **Don't swap punctuation for colons or dashes.** If a sentence needs a colon or em dash to work, rewrite it as two short sentences instead. Keep punctuation simple: full stops, commas, question marks.
- **Be specific, not general.** "Your team of 12 SDRs" not "teams like yours." "Your Series B in October" not "companies at your stage."
- **Have a point of view.** The email should feel like it came from someone who thinks about this topic, not someone who generated text about it.
- **Never use these AI tells:** "I'd love to," "I wanted to reach out," "hoping to connect," "best-in-class," "cutting-edge," "revolutionize," "empower," uniform sentence lengths, perfect grammar everywhere, em dashes, oxford commas.

## Error Handling

### "I don't have enough personalization data"
Never ask the user to provide details you could find yourself. Write the best email you can with what you have, then proactively offer a specific next step YOU can take. For example: "If you want me to personalise this further, I can take a look at their LinkedIn profile and rewrite it with more context." or "I can research their recent company news and sharpen the opener - want me to?" Always offer to do the work, never push it back to the user.

### "The client wants a longer email"
Push back gently. Show them the data: 75-100 words = 51% response rate. Longer emails work for follow-ups and warm leads, not cold outreach. If they insist, write it but flag the tradeoff.

### "The email needs to include lots of product details"
Product details kill cold emails. The goal of Email 1 is to start a conversation, not close a deal. Save details for after they reply. If they insist, move details to a PS line or a link.

### "The tone feels too casual for our industry"
Adjust slightly but don't revert to corporate speak. Even in finance, legal, and healthcare, conversational emails outperform formal ones. The data holds across industries. Shift from "casual" to "professional but human" — never to "corporate."
