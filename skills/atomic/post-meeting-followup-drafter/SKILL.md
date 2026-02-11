---
name: Post-Meeting Follow-up Drafter
description: |
  Generate a follow-up email and internal Slack update from a meeting digest.
  Use when a user asks "draft a follow-up email for the meeting", "write a post-meeting email",
  "send meeting recap to the client", or needs professional follow-up communications.
  Returns email draft with recap, decisions, next steps, and CTA plus a Slack update.
metadata:
  author: sixty-ai
  version: "2"
  category: writing
  skill_type: atomic
  is_active: true
  context_profile: full
  agent_affinity:
    - outreach
    - meetings
  triggers:
    - pattern: "draft a follow-up email for the meeting"
      intent: "post_meeting_email"
      confidence: 0.85
      examples:
        - "write a follow-up email from the meeting"
        - "post-meeting follow-up email"
        - "draft meeting follow-up"
    - pattern: "send meeting recap"
      intent: "meeting_recap_email"
      confidence: 0.85
      examples:
        - "send a recap to the client"
        - "email the meeting summary"
        - "share meeting recap"
    - pattern: "meeting follow-up communications"
      intent: "followup_comms"
      confidence: 0.80
      examples:
        - "create meeting follow-up"
        - "post-meeting email and slack"
        - "follow-up from the call"
  keywords:
    - "follow-up"
    - "email"
    - "meeting"
    - "recap"
    - "post-meeting"
    - "draft"
    - "slack"
    - "send"
    - "summary"
  required_context:
    - meeting_digest
    - meeting_id
    - company_name
  inputs:
    - name: context
      type: string
      description: "Meeting digest or summary to generate follow-up communications from"
      required: true
    - name: tone
      type: string
      description: "Desired tone for the follow-up email"
      required: false
      default: "professional"
      example: "executive"
    - name: recipient_name
      type: string
      description: "Name of the primary recipient for the follow-up email"
      required: false
    - name: meeting_id
      type: string
      description: "Meeting identifier for fetching additional context"
      required: false
  outputs:
    - name: email_draft
      type: object
      description: "Follow-up email with subject, body sections, recipients, and quotes"
    - name: slack_update
      type: object
      description: "Internal Slack update with channel, message, and optional Block Kit payload"
    - name: subject_lines
      type: array
      description: "Array of subject line options for the follow-up email"
    - name: cta
      type: string
      description: "Clear call-to-action for the email"
  requires_capabilities:
    - email
    - messaging
  priority: high
  tags:
    - writing
    - meetings
    - follow-up
    - email
    - slack
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Post-Meeting Follow-up Drafter

## Goal
Generate professional follow-up communications (buyer-facing email + internal Slack update) that recap meeting value, lock in decisions, drive next steps, and keep deal momentum alive. The follow-up should feel like a thoughtful, personalized message from the rep — not a robotic transcript summary.

## Why Post-Meeting Follow-up Timing Matters

Post-meeting follow-up is the single most predictable driver of deal velocity, and the data is unambiguous:

- **42% of deals advance when follow-up is sent the same day**, dropping to 16% when sent after 3 days (Gong.io analysis of 100K+ B2B sales meetings, 2023).
- **Deals with a follow-up email within 1 hour of the meeting close 28% faster** than those with next-day follow-ups (Chorus.ai pipeline velocity study).
- **67% of buyers say a poor follow-up experience makes them reconsider the vendor** (Forrester B2B Buying Study, 2024).
- **Follow-up emails that reference specific buyer quotes have 3.1x higher reply rates** than generic recaps (Lavender email intelligence data).
- **Reps who send both an external email AND an internal Slack update** within 2 hours of the meeting have **31% higher team-assisted close rates** — because the team can act on risks and requests faster (Salesforce internal research).
- **The #1 complaint from buyers about sales reps**: "They don't follow through on what they say in meetings" (LinkedIn State of Sales, 2024). A prompt, detailed follow-up directly addresses this.

The conclusion: every hour of delay after a meeting erodes trust and momentum. This skill ensures the rep sends a high-quality follow-up within the "golden hour."

## The "Golden Hour" Rule

See `references/timing-rules.md` for data-backed timing guidance, including the follow-up decay curve, timing by meeting type, time-of-day send optimization, and decision trees for timing based on meeting outcome.

The first 60 minutes after a meeting ends is the golden hour for follow-ups. During this window:

1. **The conversation is fresh** — both you and the buyer remember specifics, emotions, and commitments.
2. **The buyer's attention is still allocated** — they are mentally in "this deal" mode.
3. **Internal stakeholders can be briefed immediately** — your manager, SE, or CSM can act on risks or requests before EOD.
4. **Competitors cannot outpace you** — if the buyer is evaluating multiple vendors, the first follow-up sets the anchor.

### Golden Hour Priority Order
If you can only do one thing in the first 60 minutes:
1. **Send the buyer email** (5 minutes to draft with this skill)
2. **Post the internal Slack update** (2 minutes)
3. **Create follow-up tasks** (handled by pack-builder skill)

## Required Capabilities
- **Email**: To draft and send follow-up emails
- **Messaging**: To post internal Slack updates

## Inputs
- `meeting_digest`: Output from meeting-digest-truth-extractor (primary content source)
- `meeting_id`: Meeting identifier for fetching raw data
- `organization_id`: Current organization context -- use Organization Context for ${company_name} brand voice, writing style, and words_to_avoid when calibrating email tone
- (Optional) `tone`: Override tone preference ("professional", "friendly", "executive")
- (Optional) `recipient_name`: Primary recipient for the follow-up email

## Data Gathering (via execute_action)
1. Fetch meeting details: `execute_action("get_meetings", { meeting_id })`
2. Fetch contact details: `execute_action("get_contact", { id: contact_id })`
3. Fetch deal context: `execute_action("get_deal", { id: deal_id })`
4. Fetch organization settings: for brand_tone, writing_style, words_to_avoid

## Follow-up Email Structure Methodology

Consult `references/email-templates.md` for complete post-meeting email templates by meeting type (discovery, demo, QBR, negotiation, kickoff, renewal) with concise, detailed, and executive variants for each.

Every post-meeting follow-up email uses a 5-section structure. Each section has a specific purpose, a target length, and quality rules.

### Section 1: Opening + Recap (2-3 sentences)
**Purpose**: Acknowledge the meeting happened, thank the buyer for their time, and set the frame for the email.

**Rules**:
- Lead with gratitude, not a generic "Hope you're well."
- Reference something specific from the meeting to prove this is personalized.
- Keep it to 2-3 sentences maximum.
- Include the date and rough duration if helpful ("Great conversation this morning...").

**Good example**: "Thanks for the deep dive into your migration timeline this morning, Sarah. Really valuable to hear directly from your engineering leads about the OAuth and SSO requirements."

**Bad example**: "Thank you for meeting with us today. We appreciate your time and look forward to working together."

### Section 2: "What We Heard" (3-5 bullet points)
**Purpose**: Prove you were listening. This is the highest-trust section of the entire email.

**The "What We Heard" Technique**: Quote the prospect's own words back to them. This accomplishes three things simultaneously:
1. **Validates their concerns** — they feel heard and understood.
2. **Creates accountability** — both sides agree on what was said.
3. **Prevents misalignment** — catches misunderstandings before they fester.

**Rules**:
- Use their language, not yours. If they said "we're drowning in manual processes," do not paraphrase to "operational inefficiency."
- Frame as "What we heard from your team:" or "Key themes from our discussion:"
- 3-5 bullet points maximum. More than 5 and you lose readability.
- Do NOT include your pitch points here. This section is about THEIR words.
- Attribution matters: "Sarah mentioned..." or "Your engineering team flagged..."

**Good example**:
```
Key themes from our conversation:
- Your team is spending 15+ hours/week on manual data reconciliation (Sarah)
- The Q3 deadline for SOC 2 compliance is non-negotiable (James)
- You've evaluated [Competitor] but found their API documentation insufficient
- Budget approval requires VP Engineering sign-off, targeted for end of month
```

**Bad example**:
```
Summary of our meeting:
- We discussed our enterprise platform capabilities
- You're interested in our data integration features
- We covered pricing and implementation timelines
- Next steps were agreed upon
```

### Section 3: Decisions + Commitments (2-4 bullet points)
**Purpose**: Lock in what was decided. This creates a written record that both sides can reference.

**Rules**:
- Separate decisions from discussions. A decision is something both sides agreed to. A discussion is something you talked about but did not resolve.
- Format as "[Decision]: [Detail]" for clarity.
- Include who committed to what and by when.
- If no firm decisions were made, say so: "No firm decisions were made, but we aligned on the following direction..."

**Good example**:
```
Decisions from today:
- Proceed with a technical proof-of-concept focused on the data sync module
- Sarah will share API access credentials by Friday
- We'll provide a SOC 2 compliance brief by Monday EOD
- Review meeting scheduled for Thursday at 2pm
```

### Section 4: Next Steps (2-3 items)
**Purpose**: Assign clear ownership and deadlines for what happens next.

**Rules**:
- Every next step has an owner and a deadline.
- Format as "[Owner] will [action] by [date]."
- Include both your team's commitments AND the buyer's commitments.
- No more than 3 next steps. If there are more, you had too broad a meeting.
- The first next step should be YOUR commitment (shows initiative).

**Good example**:
```
Next steps:
1. [Our team] Send SOC 2 compliance brief and POC environment access — by Monday EOD
2. [Sarah] Share API credentials and test data set — by Friday EOD
3. [Both] Technical review call — Thursday Feb 13 at 2pm EST
```

### Section 5: CTA (1 sentence)
**Purpose**: End with a single, specific ask that moves the deal forward.

**Rules**:
- Exactly one CTA. Not zero. Not two.
- Make it confirmatory: "Does Thursday at 2pm still work for the technical review?" (they already agreed; this is a soft confirmation)
- OR make it a micro-commitment: "Could you share those API credentials by Friday so we can start the POC build?"
- Never end with "Let me know if you have any questions" — this is a dead-end CTA that invites silence.

## The "What We Heard" Technique — Deep Dive

This technique is so effective that it deserves its own section. Here is why it works and how to execute it:

### Why It Works (Behavioral Psychology)
- **Mirroring effect**: People trust those who reflect their own words back. It triggers a subconscious sense of alignment (Chris Voss, "Never Split the Difference").
- **Commitment consistency**: When buyers see their own words in writing, they are more likely to follow through on their stated needs (Cialdini, "Influence").
- **Error correction**: If you misunderstood something, the buyer will correct you — and that correction is a form of engagement.

### Sourcing Quotes
1. **From meeting digest**: The truth-extractor skill produces verified quotes with attribution.
2. **From transcript**: If transcript is available, search for emotionally charged language, numbers, and deadlines.
3. **Paraphrase only as a last resort**: If exact quotes are not available, paraphrase with attribution and use qualifiers: "If I understood correctly, Sarah mentioned..."

### Quote Selection Criteria
Include quotes that:
- Express a **pain point** (these validate the problem you solve)
- State a **deadline** or **constraint** (these create urgency)
- Reveal a **decision criteria** (these guide your positioning)
- Show **enthusiasm** or **concern** (these reveal emotional investment)

Do NOT include quotes that:
- Are off-topic or social pleasantries
- Reveal competitive pricing or sensitive internal information
- Were clearly stated in confidence ("off the record")

## Internal Slack Update Format and Best Practices

The Slack update serves a different audience (your team) and a different purpose (enable coordination). It should be concise, scannable, and actionable.

### Slack Update Structure

```
*Meeting Update: [Company Name] — [Meeting Type]*

*Summary*: [2-3 sentence overview of what happened and the current deal status]

*Key Signals*:
- :white_check_mark: [Positive signal]
- :warning: [Risk or concern]
- :information_source: [New information learned]

*Decisions*:
- [Decision 1 with owner]
- [Decision 2 with owner]

*Asks for Team*:
- @[person]: [What you need from them and by when]

*Next Steps*:
- [Action 1] — [Owner] — [Deadline]
- [Action 2] — [Owner] — [Deadline]
```

### Slack Best Practices
1. **Use the deal channel**: Post in the dedicated deal channel if one exists (e.g., #deal-acme-corp). Otherwise, use the team's general pipeline channel.
2. **Tag specific people**: If you need something from an SE, CSM, or manager, @mention them directly with the specific ask.
3. **Lead with signal**: The first thing your team wants to know is "is this deal healthy?" Start with a clear positive/negative/neutral signal.
4. **Flag risks immediately**: If you heard a competitive threat, a timeline shift, or stakeholder hesitation, call it out explicitly. Early warning saves deals.
5. **Keep it under 150 words**: Your team reads dozens of these per day. Respect their time.

## Approval Workflow Methodology

All post-meeting follow-up emails go through an approval step before sending. This is non-negotiable for several reasons:

1. **Accuracy**: AI-generated quotes need human verification against actual meeting content.
2. **Tone**: The rep may want to adjust tone based on relationship nuances the AI cannot detect.
3. **Strategy**: The rep's manager may want to modify the CTA based on broader account strategy.
4. **Legal**: Some industries (financial services, healthcare) require compliance review of external communications.

### Approval Flow
1. Skill generates draft with `approval_required: true`
2. Draft is presented to the rep in the copilot UI
3. Rep reviews, edits if needed, and confirms
4. On confirmation, email is sent via the email action and Slack update is posted

## Tone Calibration by Meeting Outcome

The meeting outcome should influence the follow-up tone. Detect the outcome from the meeting digest and calibrate accordingly. Use the brand voice from Organization Context to match ${company_name}'s communication style -- including tone, formality level, and words_to_avoid.

### Positive Meeting (deal advancing, buyer enthusiastic)
- **Tone**: Warm, confident, forward-looking
- **Opening**: Reference a specific positive moment ("Your team's excitement about the POC was great to see")
- **CTA**: Direct and assumptive ("Let's lock in the technical review for Thursday")
- **Avoid**: Over-excitement, premature celebration, pushy upselling

### Neutral Meeting (information exchange, no clear signal)
- **Tone**: Professional, helpful, patient
- **Opening**: Reference the value of the conversation ("Appreciated the thorough questions from your team")
- **CTA**: Value-add offer ("Would it be helpful if we prepared a comparison doc for your internal review?")
- **Avoid**: Desperation, "just checking in" energy, ignoring the lack of signal

### Difficult Meeting (objections raised, concerns surfaced, competition mentioned)
- **Tone**: Empathetic, direct, solution-oriented
- **Opening**: Acknowledge the concerns head-on ("I appreciate your team's candor about the integration concerns")
- **CTA**: Address the top concern directly ("We've prepared a technical brief on the specific integration challenge Sarah raised — attached")
- **Avoid**: Defensiveness, dismissing concerns, ignoring the elephant in the room

## Subject Line Strategies for Follow-ups

### Option Generation
Generate 3 subject line options for every follow-up email:

1. **Recap-style**: "Re: [Meeting Topic] — Recap + Next Steps"
   - Best for: first-time meetings, discovery calls
   - Strength: sets clear expectations for content

2. **Value-forward**: "[Specific Deliverable] from Our [Day] Call"
   - Best for: meetings where you promised something specific
   - Strength: the buyer knows immediately this email has value

3. **Action-oriented**: "[Next Action] — [Company] x ${company_name}"
   - Best for: late-stage deal meetings, established relationships
   - Strength: drives the deal narrative forward

### Subject Line Rules
- Keep under 50 characters (47% higher open rate per Litmus)
- Include the company name for easy searching in their inbox
- Never use clickbait or misleading subjects
- If replying to an existing thread, keep the "Re:" prefix and add a clarifier

## Multi-Variant Generation

Generate TWO email variants for every follow-up:

### Variant A: Short Executive (80-120 words)
- For: Senior stakeholders, C-suite, time-constrained buyers
- Structure: 1-line recap, 3 bullet decisions/next steps, 1-line CTA
- No "What We Heard" section — too long for executive attention span
- Subject line: Action-oriented style

### Variant B: Detailed Operational (150-250 words)
- For: Technical buyers, procurement, working-level stakeholders
- Structure: Full 5-section format with "What We Heard" quotes
- Include specific technical details, compliance references, timeline specifics
- Subject line: Recap-style or value-forward

Let the rep choose which variant to send based on their primary recipient.

## Output Contract

Return a SkillResult with:

### `data.email_draft`
Object:
- `subject`: string (primary subject line recommendation)
- `subject_variants`: array of 3 subject line options with `text` and `style` fields
- `body`: string (full email text, Variant B by default)
- `body_short`: string (Variant A, executive-length)
- `body_html`: string | null (HTML formatted version)
- `to`: string | string[] (recipient email addresses)
- `cc`: string[] | null (CC recipients if any)
- `sections`: array of section objects:
  - `type`: "recap" | "what_we_heard" | "decisions" | "next_steps" | "cta"
  - `content`: string (section content)
  - `quotes`: string[] | null (relevant quotes from meeting, for "what_we_heard" section)
  - `attribution`: string[] | null (who said each quote)
- `tone`: "professional" | "friendly" | "executive"
- `meeting_outcome`: "positive" | "neutral" | "difficult"
- `word_count`: number
- `word_count_short`: number

### `data.slack_update`
Object:
- `channel`: string (suggested channel name or ID)
- `message`: string (Slack-formatted message using mrkdwn)
- `blocks`: object | null (Slack Block Kit payload for rich formatting)
- `thread_ts`: string | null (thread timestamp if continuing a thread)
- `mentions`: string[] (team members to @mention)
- `signals`: array of `{ type: "positive" | "risk" | "info", text: string }`

### `data.subject_lines`
Array of 3 objects: `{ text: string, style: "recap" | "value_forward" | "action_oriented", recommended: boolean }`

### `data.cta`
String: The recommended call-to-action for the email.

### `data.approval_required`
Boolean: Always `true` for post-meeting follow-ups.

### `data.meeting_context`
Object with enrichment data used:
- `meeting_date`: string
- `meeting_duration`: string
- `attendees`: string[]
- `deal_name`: string | null
- `deal_stage`: string | null
- `deal_value`: number | null

## Quality Checklist

Before returning results, validate:

### Email Quality
- [ ] Email references at least ONE specific detail from the actual meeting (not generic)
- [ ] "What We Heard" section uses the buyer's language, not sales jargon
- [ ] Every decision listed was actually made (not assumed or hoped for)
- [ ] Every next step has an owner AND a deadline
- [ ] CTA is a single, specific ask (not "let me know your thoughts")
- [ ] Email does not re-pitch features or capabilities that were not discussed
- [ ] Email does not use words from the organization's words_to_avoid list
- [ ] Variant A (short) is under 120 words
- [ ] Variant B (detailed) is under 250 words
- [ ] Subject line is under 50 characters

### Slack Quality
- [ ] Slack update is under 150 words
- [ ] Risks are explicitly called out, not buried in summary
- [ ] Specific team members are @mentioned with specific asks
- [ ] Deal signal (positive/risk/info) is the first thing visible

### Quote Quality
- [ ] Quotes are sourced from the meeting digest or transcript, not fabricated
- [ ] Quotes are attributed to specific speakers
- [ ] No sensitive or confidential information is included in external email
- [ ] Off-the-record statements are excluded

### Tone Quality
- [ ] Tone matches meeting outcome (positive, neutral, difficult)
- [ ] Tone matches buyer's formality level
- [ ] No forced enthusiasm after a difficult meeting
- [ ] No deflation after a positive meeting

## Error Handling

### No meeting digest available
If `meeting_digest` is null or empty, fall back to the meeting summary from `get_meetings`. If that is also empty, return an error: "No meeting content available. Please provide a summary of the meeting to generate a follow-up."

### Missing attendee information
If attendee names or emails are not available, generate the email body with placeholder: "[Recipient Name]" and flag: "Recipient details missing — please add the recipient's name and email before sending."

### No deal linked
If the meeting has no associated deal, omit deal-specific language from both the email and Slack update. This is not an error — many legitimate meetings (discovery, networking, partnership) are pre-deal.

### Missing transcript / no quotes available
If no quotes are available from the digest or transcript, replace the "What We Heard" section with "Key Themes" and use paraphrased summaries. Flag: "No direct quotes available — themes are paraphrased from meeting summary."

### Conflicting information in digest
If the meeting digest contains contradictory information (e.g., the buyer said yes and no to the same thing), flag the conflict in the Slack update and use the most recent statement in the email. Add a note: "Potential misalignment detected — verify [specific point] before sending."

### Meeting was very short (< 15 minutes)
If the meeting was under 15 minutes, use Variant A (short executive) as the default and reduce "What We Heard" to 1-2 bullets. Short meetings rarely produce enough content for a full-length follow-up.

### Meeting was very long (> 90 minutes)
If the meeting was over 90 minutes, focus the email on the TOP 3 decisions/next steps and reference the full meeting notes as a separate document. The email should not try to recap everything.

### Multiple recipients with different seniority levels
If the meeting had both C-suite and working-level attendees, generate the email in "professional" tone (not "executive" — that is too terse for the operational people) and address it to the primary contact. Include C-suite as CC if appropriate.

## Examples

### Good Follow-up Email (Variant B)
```
Subject: Acme x Sixty — Technical Review Recap + POC Access

Hi Sarah,

Thanks for the deep dive into your migration timeline this morning. Really
valuable hearing directly from your engineering leads about the OAuth and
SSO requirements.

What we heard from your team:
- Manual data reconciliation is consuming 15+ hours/week across 3 engineers
- SOC 2 compliance deadline (Q3) is non-negotiable for vendor selection
- Your team evaluated [Competitor] but found API documentation insufficient
- Budget approval requires VP Engineering sign-off, targeted for end of month

Decisions:
- Proceed with a technical POC focused on the data sync module
- Review meeting set for Thursday Feb 13 at 2pm EST

Next steps:
1. [Sixty] Send SOC 2 compliance brief + POC environment access — Monday EOD
2. [Acme] Share API credentials and test data set — Friday EOD
3. [Both] Technical review — Thursday Feb 13, 2pm EST

Could you share those API credentials by Friday so we can have the POC
environment ready for Thursday's review?

Best,
[Rep]
```

### Bad Follow-up Email (what to avoid)
```
Subject: Meeting Follow-up

Hi Sarah,

Thank you for your time today. We really enjoyed meeting with your team
and learning more about Acme's needs.

As discussed, our platform offers a comprehensive suite of data integration
tools including real-time sync, batch processing, custom connectors, API
management, and security compliance modules. We also provide 24/7 support,
dedicated account management, and a 99.9% uptime SLA.

We'd love to set up a follow-up meeting to discuss next steps and explore
how we can help your team achieve its goals. Please let me know if you have
any questions or would like to schedule a call.

Looking forward to hearing from you!

Best regards,
[Rep]
```
**Why this is bad**: No specific meeting references. Re-pitches features. No decisions or next steps documented. Generic CTA. Does not use the buyer's words. Could have been sent without attending the meeting at all.
