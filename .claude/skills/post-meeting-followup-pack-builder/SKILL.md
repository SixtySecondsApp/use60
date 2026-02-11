---
name: Post-Meeting Follow-Up Pack Builder
description: |
  Build a complete follow-up pack after a meeting: buyer-facing email, internal Slack update,
  and 3 actionable tasks. Use when a user asks "build a follow-up pack for the meeting",
  "create post-meeting deliverables", "what do I need to send after the call", or needs
  a full set of post-meeting communications and tasks ready to go.
metadata:
  author: sixty-ai
  version: "2"
  category: writing
  skill_type: atomic
  is_active: true
  agent_affinity:
    - outreach
    - meetings
  triggers:
    - pattern: "follow-up pack for the meeting"
      intent: "followup_pack"
      confidence: 0.85
      examples:
        - "build a follow-up pack"
        - "create post-meeting deliverables"
        - "meeting follow-up package"
    - pattern: "what do I need to send after the call"
      intent: "post_call_actions"
      confidence: 0.85
      examples:
        - "post-meeting tasks and emails"
        - "after meeting to-dos"
        - "what's needed after the meeting"
    - pattern: "post-meeting email and tasks"
      intent: "post_meeting_bundle"
      confidence: 0.80
      examples:
        - "email and tasks from the meeting"
        - "meeting follow-up bundle"
        - "create follow-up from meeting"
  keywords:
    - "follow-up pack"
    - "post-meeting"
    - "email"
    - "slack"
    - "tasks"
    - "meeting"
    - "deliverables"
    - "after call"
  requires_capabilities:
    - crm
    - email
    - messaging
  requires_context:
    - meeting_data
    - meeting_digest
  inputs:
    - name: context
      type: string
      description: "Meeting digest or summary to build the follow-up pack from"
      required: true
    - name: tone
      type: string
      description: "Desired tone for the buyer-facing email"
      required: false
      default: "professional"
      example: "friendly"
    - name: recipient_name
      type: string
      description: "Name of the buyer/recipient for the follow-up email"
      required: false
    - name: meeting_id
      type: string
      description: "Meeting identifier for fetching meeting data and transcript"
      required: false
  outputs:
    - name: buyer_email
      type: object
      description: "Buyer-facing email with to, subject, structured context, and tone"
    - name: slack_update
      type: object
      description: "Internal Slack update with summary, risks, next steps, and optional Block Kit"
    - name: tasks
      type: array
      description: "3 actionable task previews: internal follow-up, customer follow-up, deal hygiene"
  priority: critical
---

# Post-Meeting Follow-Up Pack Builder

## Goal
Create a complete follow-up pack that a rep can execute immediately after a meeting — everything they need in one shot:
1. A **buyer-facing email** (personalized, references their words, clear CTA)
2. An **internal Slack update** (summary, risks, asks, next steps)
3. **3 actionable tasks** (one internal, one customer-facing, one deal hygiene)

The pack should be ready to send/create within 5 minutes of review. The rep's only job is to verify accuracy and hit send.

## The "3-Artifact" Follow-Up Pack Methodology

Consult `references/pack-templates.md` for complete follow-up pack templates by meeting type (discovery, demo, QBR, negotiation, executive briefing) with all 3 artifacts fully templated. See `references/artifact-examples.md` for annotated real-world examples and a before/after comparison of mediocre vs. excellent packs.

### Why Bundling Matters

Most reps do one of the three artifacts (usually the email). Few do all three. The data shows that the complete bundle is dramatically more effective:

- **Reps who send all 3 artifacts within 1 hour of the meeting close 38% more deals** (Gong.io, analysis of 25K+ deal outcomes, 2023).
- **The buyer email alone advances the deal 42% of the time. Add the internal Slack update and it jumps to 58%.** The Slack update enables team coordination — your SE prepares the POC, your manager approves the discount, your CSM schedules the onboarding review. Deals are team sports.
- **Tasks are the hidden multiplier**: Reps who create follow-up tasks within 1 hour of a meeting are **2.4x less likely** to let the deal stall in the next 14 days (HubSpot pipeline velocity data).
- **The 1-hour window**: Every hour of delay after the meeting reduces the probability of completing all 3 artifacts by 15%. After 4 hours, only 23% of reps complete the full pack. After 24 hours, it drops to 8%.

### Why 3 Artifacts, Specifically?

Each artifact serves a different audience and purpose. Skipping any one of them creates a gap:

| Artifact | Audience | Purpose | Risk if Skipped |
|----------|----------|---------|-----------------|
| Buyer Email | External — prospect/customer | Lock in decisions, advance deal, build trust | Buyer forgets commitments, momentum dies |
| Slack Update | Internal — your team | Enable coordination, flag risks, request help | Team is blind, risks go unaddressed |
| Task List | You (the rep) | Ensure execution, prevent things from slipping | Follow-through fails, promises are broken |

Without the email, the buyer drifts. Without the Slack, your team cannot help. Without the tasks, you forget. The pack is the minimum viable follow-up.

## Required Capabilities
- **CRM**: To fetch deal and contact context, create tasks
- **Email**: To draft and send the buyer-facing email
- **Messaging**: To post the internal Slack update

## Inputs
- `meeting_data`: output from `execute_action("get_meetings", {...})` (should include `meetings[0].summary` and optionally `meetings[0].transcript_text`)
- `meeting_digest`: output from `meeting-digest-truth-extractor` (verified decisions, commitments, risks)
- (Optional) `contact_data`: output from `execute_action("get_contact", { id })`
- (Optional) `deal_data`: output from `execute_action("get_deal", { id })`
- (Optional) `tone`: override tone for buyer email
- (Optional) `recipient_name`: buyer's name

## Data Gathering (via execute_action)
1. Fetch meeting details: `execute_action("get_meetings", { meeting_id })`
2. Fetch contact: `execute_action("get_contact", { id: contact_id })` for name, email, title, company
3. Fetch deal: `execute_action("get_deal", { id: deal_id })` for deal name, stage, value, close date
4. Fetch recent activities: `execute_action("get_activities", { contact_id, limit: 5 })` for interaction context

## Artifact 1: Buyer Email — Best Practices

The buyer email is the external-facing artifact. It represents you and your company to the prospect. It must be excellent.

### Personalization Requirements
Every buyer email must include at least 3 personalization signals:
1. **Their words**: At least one quote or paraphrased reference from the meeting
2. **Their context**: Reference their company, team, or specific challenge
3. **Their timeline**: Reference a deadline, milestone, or date they mentioned

### Structure (Mandatory)
```
1. Opening (1-2 sentences): Thank them + reference a specific meeting moment
2. What We Heard (2-4 bullets): Their key concerns/needs in their own words
3. Decisions (1-3 bullets): What was agreed, with owners
4. Next Steps (2-3 bullets): Clear actions with deadlines
5. CTA (1 sentence): Single, specific ask
```

### Word Count Rules
- **Target**: 120-180 words total
- **Hard maximum**: 200 words (beyond this, response rates drop)
- **Executive recipients**: Target 80-100 words (use the short variant)

### Email Tone Calibration
| Meeting Outcome | Tone | Opening Style | CTA Style |
|-----------------|------|---------------|-----------|
| Strong positive | Confident, warm | "Excited to move forward on..." | Assumptive ("I'll send the contract Thursday") |
| Mildly positive | Professional, helpful | "Great discussion today about..." | Specific ask ("Does Tuesday work for the review?") |
| Neutral | Professional, patient | "Appreciated the thorough conversation..." | Value-add offer ("Would a comparison doc be helpful?") |
| Concerns raised | Empathetic, direct | "Thanks for your candor about..." | Address concern ("Attached: the security brief Sarah requested") |
| Difficult | Solution-oriented | "I heard the concerns about..." | Low-friction next step ("Happy to connect your team with our [role]") |

### What NOT to Include in the Buyer Email
- Feature lists or product pitches that were not discussed in the meeting
- Pricing that was not explicitly shared or approved for external communication
- Internal team names, deal stages, or CRM terminology
- Competitive intelligence or references to other prospects
- Anything that was said "off the record" during the meeting

## Artifact 2: Internal Slack Update — Format and Best Practices

The Slack update is for your team. It must be scannable, honest, and actionable.

### Slack Structure (Mandatory)
```
*[Company Name] — Meeting Update ([Meeting Type])*
*Signal*: :green_circle: Advancing | :yellow_circle: Neutral | :red_circle: At Risk

*TL;DR*: [1 sentence deal status after this meeting]

*Key Intel*:
- [Most important thing learned — a new decision-maker, a timeline shift, a budget approval, etc.]
- [Second most important thing]

*Risks / Blockers*:
- :warning: [Risk 1 with context]
- :warning: [Risk 2 with context]
(If no risks: "No new risks identified")

*Asks for Team*:
- @[SE Name]: [Specific technical deliverable needed by date]
- @[Manager]: [Approval or guidance needed by date]
(If no asks: "No immediate asks — will update after next meeting")

*Next Steps*:
- [Action] — [Owner] — [Deadline]
- [Action] — [Owner] — [Deadline]
```

### Slack Tone Rules
1. **Be honest about risk**: This is the one place where you can be candid about concerns. Do not sugarcoat deal health for your team.
2. **Be specific about asks**: "Need help with the POC" is useless. "@James: need the SOC 2 compliance brief by Monday EOD for their security review" is actionable.
3. **Use signal icons consistently**: Green = deal is advancing / on track. Yellow = neutral or mixed signals. Red = at risk / requires intervention.
4. **Keep it under 150 words**: Your team reads dozens of these daily. Respect brevity.
5. **Thread, don't new-post**: If a deal channel exists, reply in the existing thread.

### When to Escalate via Slack
Flag for immediate manager attention if any of these are true:
- Buyer mentioned evaluating a competitor by name
- Timeline shifted by more than 2 weeks
- New stakeholder entered the deal (especially legal or procurement)
- Budget was reduced or questioned
- Champion expressed doubt or hesitation
- Meeting was cancelled or significantly shortened

## Artifact 3: Task Design — Principles and Structure

The three tasks form a triangle of follow-through: internal preparation, external execution, and CRM hygiene.

### Task 1: Internal Follow-Up
**Purpose**: Something your team needs to prepare or do before the next buyer interaction.

**Examples**:
- "Prepare SOC 2 compliance brief for Acme security review — due Monday EOD"
- "Build custom ROI model using Acme's 15hr/week manual process data — due Wednesday"
- "Brief SE on OAuth PKCE requirements discussed in today's call — due tomorrow AM"

**Design rules**:
- Must reference a specific meeting deliverable or buyer need
- Owner should be the person best equipped to deliver (not always the rep)
- Deadline should be at least 24 hours before the next buyer interaction

### Task 2: Customer-Facing Follow-Up
**Purpose**: The next action that involves the buyer directly.

**Examples**:
- "Send enterprise pricing to Sarah Chen with volume tier highlighted — due tomorrow EOD"
- "Schedule technical deep-dive with Acme engineering team — target Thursday 2pm"
- "Follow up with James if API credentials not received by Friday — due Friday 3pm"

**Design rules**:
- Must be the single most important external action post-meeting
- Include the specific buyer name and contact method
- Deadline should match the commitment made in the meeting

### Task 3: Deal Hygiene
**Purpose**: CRM and internal process maintenance that keeps the deal record accurate.

**Examples**:
- "Update Acme deal stage from Discovery to Technical Review in CRM"
- "Add James Rodriguez (VP Engineering) as new contact on Acme deal"
- "Update deal close date from March 15 to April 1 based on revised timeline"
- "Log meeting notes and attach transcript to Acme deal record"

**Design rules**:
- Must update the CRM to reflect what happened in the meeting
- Should be completable in under 5 minutes
- Priority is always "medium" unless deal stage change is required (then "high")

### Task Prioritization and Deadline Setting

**Priority Assignment**:
| Task Type | Default Priority | Escalate to High If... |
|-----------|-----------------|----------------------|
| Internal Follow-Up | High | Buyer needs it before the next meeting |
| Customer-Facing | High | Promised to the buyer with a specific date |
| Deal Hygiene | Medium | Deal stage needs to change |

**Deadline Assignment**:
- If a date was committed in the meeting, use that date minus 1 business day (buffer)
- If no date was committed, use these defaults:
  - Internal follow-up: Tomorrow EOD
  - Customer-facing: Tomorrow EOD (or the date promised in the email CTA)
  - Deal hygiene: Today EOD (should be done same day)

## The "Momentum Preservation" Principle

See `references/pack-templates.md` for the complete momentum preservation framework with data backing and the four momentum signals.

Every follow-up pack should be evaluated against a single question: **Does this pack keep the deal moving forward?**

### Momentum Signals
A good follow-up pack creates momentum by:
1. **Locking in commitments**: Both sides know what they agreed to (buyer email)
2. **Enabling the team**: Your colleagues know what is needed and by when (Slack update)
3. **Creating accountability**: Concrete tasks with owners and deadlines prevent drift (tasks)
4. **Setting a next interaction date**: The CTA in the buyer email should reference a specific future touchpoint

### Momentum Killers to Avoid
- **Vague next steps**: "We'll reconnect soon" = momentum killer. "Technical review Thursday 2pm" = momentum preserver.
- **No internal coordination**: If your SE does not know they need to prepare a POC by Thursday, it will not happen.
- **Unlinked tasks**: Tasks that are not connected to the deal or contact in CRM become orphans that get lost.
- **Delayed execution**: A follow-up pack sent 3 days later is a momentum autopsy, not a momentum preserver.

### Momentum Score (Internal)
Evaluate each pack on a 1-5 momentum scale:
| Score | Criteria |
|-------|----------|
| 5 | Next meeting date confirmed, specific deliverables committed, team aligned |
| 4 | Clear next steps with deadlines, team notified, most commitments captured |
| 3 | Buyer email sent, basic tasks created, but next interaction date is vague |
| 2 | Buyer email sent but lacking specificity, no Slack update, tasks are generic |
| 1 | Minimal follow-up, no clear next step, deal likely to stall |

Include this score in the output so the rep can assess their follow-up quality.

## Pack Quality Standards

### Completeness
All 3 artifacts must be present. A pack with only 2 artifacts is incomplete and should be flagged.

### Consistency
Information must be consistent across all 3 artifacts:
- The decisions in the buyer email must match the decisions in the Slack update
- The deadlines in the buyer email must match the task due dates
- The risks in the Slack update should inform the task priorities

### Actionability
- Buyer email: rep can send within 2 minutes of review
- Slack update: rep can post within 1 minute of review
- Tasks: rep can create all 3 within 3 minutes

### Accuracy
- Quotes are sourced from the meeting digest, not fabricated
- Dates and deadlines match what was actually discussed
- Contact names and titles are correct
- Deal information (stage, value) is current

## Output Contract

Return a SkillResult with:

### `data.buyer_email`
Object:
- `to`: string | null (contact email if available)
- `contact_name`: string | null
- `subject`: string (recommended subject line)
- `subject_variants`: array of 3 options with `text` and `style` fields
- `body`: string (full email text, 120-180 words)
- `body_short`: string (executive variant, 80-100 words)
- `body_html`: string | null (HTML formatted version)
- `context`: string (structured bullets for reference — what informed the email)
- `tone`: "professional" | "friendly" | "executive"
- `meeting_outcome`: "positive" | "neutral" | "difficult"
- `word_count`: number
- `personalization_signals`: array of strings (which personalization elements were used)
- `cta`: string (the call-to-action)
- `approval_required`: true (always)

### `data.slack_update`
Object:
- `channel`: string (suggested channel name or "general-pipeline")
- `signal`: "green" | "yellow" | "red"
- `message`: string (Slack mrkdwn formatted)
- `blocks`: object | null (Slack Block Kit payload)
- `mentions`: string[] (team members to @mention)
- `risks`: array of `{ severity: "high" | "medium" | "low", description: string }`
- `asks`: array of `{ person: string, ask: string, deadline: string }`
- `escalate`: boolean (true if manager attention needed per escalation rules)

### `data.tasks`
Array of exactly 3 objects. Each:
- `title`: string (starts with a verb)
- `description`: string (includes context and checklist items)
- `type`: "internal_followup" | "customer_followup" | "deal_hygiene"
- `due_date`: string (ISO date or relative like "tomorrow EOD")
- `priority`: "high" | "medium" | "low"
- `owner`: string | null (suggested owner — rep name, SE name, etc.)
- `contact_id`: string | null
- `deal_id`: string | null
- `meeting_id`: string | null
- `checklist`: string[] | null (sub-tasks if the task has multiple steps)

### `data.momentum_score`
Object:
- `score`: number (1-5)
- `rationale`: string (why this score)
- `improvements`: string[] | null (what would raise the score)

### `data.pack_summary`
String: Human-readable summary. Example: "Follow-up pack for Acme Corp technical review meeting. Buyer email (147 words) to Sarah Chen with pricing recap and Thursday review confirmation. Slack update posted to #deal-acme-corp flagging SOC 2 timeline risk. 3 tasks created: SOC 2 brief prep (High, Monday EOD), send pricing to Sarah (High, tomorrow), update deal stage to Technical Review (Medium, today). Momentum score: 4/5."

## Quality Checklist

Before returning the pack, validate:

### Pack Completeness
- [ ] All 3 artifacts are present (buyer email, Slack update, 3 tasks)
- [ ] Buyer email has both standard and executive-short variants
- [ ] Slack update has signal icon, risks section, and asks section
- [ ] Tasks include exactly 1 internal, 1 customer-facing, and 1 deal hygiene

### Cross-Artifact Consistency
- [ ] Decisions in buyer email match decisions in Slack update
- [ ] Deadlines in buyer email match task due dates
- [ ] Risks in Slack update are reflected in task priorities
- [ ] Contact name/email is consistent across all artifacts
- [ ] Deal stage/value is consistent across all artifacts

### Buyer Email Quality
- [ ] Under 200 words (target 120-180)
- [ ] Contains at least 3 personalization signals
- [ ] References buyer's own words at least once
- [ ] Has exactly ONE CTA
- [ ] Does not re-pitch features or include internal jargon
- [ ] Does not expose confidential CRM data to the buyer

### Slack Update Quality
- [ ] Under 150 words
- [ ] Signal icon (green/yellow/red) is present and accurate
- [ ] Risks are explicitly listed (not hidden in summary)
- [ ] @mentions are specific with specific asks and deadlines
- [ ] Escalation flag is set if escalation criteria are met

### Task Quality
- [ ] All 3 task titles start with a verb
- [ ] All 3 tasks have specific deadlines (not "soon" or "next week")
- [ ] Internal task deadline is before the next buyer interaction
- [ ] Customer-facing task matches a commitment from the meeting
- [ ] Deal hygiene task updates CRM to reflect current state
- [ ] Tasks are linked to contact_id and deal_id where available

### Momentum Assessment
- [ ] Momentum score is calculated and included
- [ ] Pack creates at least one future interaction date
- [ ] Pack enables at least one team member to take action
- [ ] Pack does not leave any meeting commitment unassigned

## Error Handling

### No meeting data available
If both `meeting_data` and `meeting_digest` are null or empty, return an error: "No meeting content available. Please provide a meeting summary or meeting ID to build a follow-up pack."

### Partial meeting data
If `meeting_digest` is available but `meeting_data` is not (or vice versa), build the pack with what is available. Flag: "Pack built with partial data — some fields may need manual completion."

### No contact email
If the buyer's email is not available, set `buyer_email.to: null` and flag: "Recipient email not found — please add before sending." Still generate the full email body.

### No deal linked
If no deal is associated with the meeting, omit deal-specific language from the email and Slack update. Set task 3 (deal hygiene) to: "Create new deal record for [Company] based on meeting discussion." This is not an error — many meetings are pre-deal.

### Meeting had no clear decisions
If the meeting digest shows no firm decisions, replace the "Decisions" section with "Alignment Points" — things both sides seemed to agree on directionally, even if not formally decided. Flag in Slack: "No firm decisions made — consider scheduling a decision-focused follow-up."

### Meeting had no clear next steps
If no next steps were discussed, generate suggested next steps based on the deal stage and meeting content. Flag: "No explicit next steps were discussed. Suggested next steps are based on deal stage best practices. Verify before including in buyer email."

### Multiple meetings on same day
If the meeting ID is ambiguous or the rep had multiple meetings today, return the options and ask for clarification: "Found [N] meetings today. Which one should I build the follow-up pack for?"

### Insufficient context for 3 tasks
If the meeting was too brief or light on content to generate 3 distinct tasks, generate what is possible and fill remaining slots with deal-stage-appropriate defaults. Flag: "Meeting content was limited — [N] tasks are suggested based on deal stage best practices."

### Sensitive information detected
If the meeting data contains competitor pricing, legal discussions, or HR-related content, flag: "Sensitive content detected. Review buyer email carefully to ensure no confidential information is shared externally."

## Examples

### Good Follow-Up Pack
```
BUYER EMAIL (152 words):
Subject: Acme x Sixty — POC Setup + Next Steps

Hi Sarah,

Thanks for the thorough walkthrough of your migration requirements today.
Hearing directly from James about the SOC 2 deadline and your team's
experience with [Competitor]'s API docs was really helpful context.

What we heard:
- 15+ hours/week spent on manual data reconciliation across 3 engineering teams
- SOC 2 compliance by Q3 is a hard requirement for any new vendor
- API documentation quality is a key evaluation criterion
- VP Engineering sign-off needed by end of month

Next steps:
1. [Sixty] SOC 2 compliance brief + POC access — Monday EOD
2. [Acme] API credentials and test data — Friday EOD
3. [Both] Technical review — Thursday Feb 13, 2pm EST

Could you share those API credentials by Friday so we can configure the
POC environment for Thursday's review?

Best,
[Rep]

---

SLACK UPDATE (89 words):
*Acme Corp — Discovery Call Update*
*Signal*: :green_circle: Advancing

*TL;DR*: Strong meeting. SOC 2 compliance and API quality are key criteria.
Moving to technical POC.

*Key Intel*:
- VP Engineering (James Rodriguez) is the budget approver
- Evaluated [Competitor], unhappy with API docs — opening for us

*Risks*:
- :warning: SOC 2 deadline is Q3 — tight for full deployment

*Asks*:
- @David (SE): Prepare SOC 2 brief by Monday EOD
- @Lisa (CSM): Review onboarding timeline for Q3 delivery

*Next*: Technical review Thursday 2pm

---

TASKS:
1. [Internal] "Prepare SOC 2 compliance brief for Acme security review"
   Due: Monday EOD | Priority: High | Owner: David (SE)
   Checklist: [ ] Pull latest SOC 2 report, [ ] Highlight data sync controls,
   [ ] Include timeline for full compliance

2. [Customer] "Send POC environment access to Sarah Chen"
   Due: Tuesday EOD | Priority: High | Owner: [Rep]
   Checklist: [ ] Configure test environment, [ ] Create demo credentials,
   [ ] Include setup guide doc

3. [Deal Hygiene] "Update Acme deal: stage to Technical Review, add James Rodriguez"
   Due: Today EOD | Priority: Medium | Owner: [Rep]
   Checklist: [ ] Move stage from Discovery to Technical Review,
   [ ] Add James Rodriguez as contact, [ ] Update close date to April 1

Momentum Score: 4/5
- Next meeting confirmed (Thursday 2pm)
- Team aligned with specific asks
- Deducted 1 point: VP sign-off timeline unclear
```

### Bad Follow-Up Pack (what to avoid)
```
BUYER EMAIL:
Subject: Follow-up

Hi,

Thanks for the meeting today. Here's a recap of our discussion.
We talked about your needs and how our platform can help.
Let me know if you have any questions.

SLACK UPDATE:
Had a good meeting with Acme. Going well. Will follow up.

TASKS:
1. "Follow up with Acme" — due: next week
2. "Update CRM" — due: soon
3. "Prepare materials" — due: TBD
```
**Why this is bad**: Email has zero personalization, no buyer quotes, no decisions, no next steps, and a dead-end CTA. Slack update has no signal, no risks, no asks, and no specifics. Tasks have no deadlines, no owners, no context, and are not actionable. This pack adds no value and will not prevent deal stall.
