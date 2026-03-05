---
name: Post-Meeting Follow-Up Pack Builder
description: |
  Build a complete follow-up pack after a meeting: buyer-facing email, internal Slack update,
  and 3 actionable tasks with meeting outcome confidence scoring and cross-artifact consistency
  checking. Use when a user asks "build a follow-up pack for the meeting", "create post-meeting
  deliverables", "what do I need to send after the call", or needs a full set of post-meeting
  communications and tasks ready to go. Enriches packs with post-meeting web intelligence and
  RAG-powered historical context from previous transcripts.
metadata:
  author: sixty-ai
  version: "3"
  category: writing
  skill_type: atomic
  is_active: true
  context_profile: full
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
    - web_search
  requires_context:
    - meeting_data
    - meeting_digest
    - company_name
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
    - name: outcome_confidence
      type: object
      description: "Meeting outcome confidence assessment: { level, signals, hedging_detected }"
    - name: rag_context_used
      type: array
      description: "Previous commitments and running themes from transcript RAG search"
    - name: consistency_check
      type: object
      description: "Cross-artifact consistency verification: decisions, dates, names match across all 3 artifacts"
  priority: critical
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

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

Complete 3-artifact packs close 38% more deals than partial follow-up (Gong.io, 25K+ deals). The 1-hour window is critical — every hour of delay reduces completion probability by 15%. See `references/pack-templates.md` for the full data and momentum preservation framework.

| Artifact | Audience | Purpose |
|----------|----------|---------|
| Buyer Email | External — prospect/customer | Lock in decisions, advance deal |
| Slack Update | Internal — your team | Enable coordination, flag risks |
| Task List | You (the rep) | Ensure execution, prevent drift |

## Required Capabilities
- **CRM**: To fetch deal and contact context, create tasks
- **Email**: To draft and send the buyer-facing email
- **Messaging**: To post the internal Slack update
- **Web Search**: To enrich packs with post-meeting company intelligence

## 5-Layer Intelligence Model

Each follow-up pack is built through five layers of progressively richer context. Layers 1 and 5 are the existing core. Layers 2-4 are enrichment layers that elevate pack quality.

### Layer 1: Meeting and Deal Context (Core)
The existing data gathering step. Fetch meeting details, contact, deal, and recent activities via `execute_action`. This is the foundation — every pack starts here.

### Layer 2: Post-Meeting Enrichment (Web Search)
After gathering meeting data, run a quick web search for the company:
- **Company news since last meeting**: Funding rounds, leadership changes, product launches, earnings. Reference anything relevant in the buyer email to show you are paying attention beyond the meeting itself.
- **Recent competitive moves**: If a competitor was mentioned in the meeting, check for their recent news. Use in the Slack update to give the team current competitive context.
- Graceful degradation: If web search returns nothing relevant or fails, proceed without it. Do not delay the pack for enrichment.

### Layer 3: Historical Context (RAG Transcript Search)
Search meeting transcripts via `createRAGClient()` for:
- **Previous commitments**: Did the buyer or your team commit to things in earlier meetings? Check if those commitments were fulfilled. If not, reference them diplomatically in the email or flag in Slack.
- **Running themes**: What topics recur across meetings? Persistent concerns, evolving priorities, shifting stakeholders. Use these to show continuity in the buyer email.
- **Deal evolution**: How has the deal changed over time — stage progression, value changes, timeline shifts. Inform the Slack update and task priorities.
- If RAG returns no results (first meeting or no transcripts), note "first interaction — no historical context available" and proceed.

### Layer 4: Outcome Confidence Assessment
Evaluate meeting outcome confidence before drafting artifacts. See the "Meeting Outcome Confidence Assessment" section below for detailed methodology. This assessment informs:
- **Buyer email tone**: High confidence = assumptive CTA. Low confidence = softer, value-add CTA.
- **Slack signal**: Confidence level directly influences green/yellow/red signal selection.
- **Task urgency**: Low confidence outcomes may need an additional "re-confirmation" task.

### Layer 5: Pack Strategy (Enhanced)
The existing pack methodology — now informed by Layers 2-4. When drafting each artifact:
- Weave in web enrichment naturally (do not force it)
- Reference historical context where it strengthens personalization
- Calibrate tone and urgency based on outcome confidence
- Consult `references/pack-templates.md` for meeting-type-specific templates

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

The buyer email is the external-facing artifact. It represents you and ${company_name} to the prospect. Use the brand voice and writing style from Organization Context to ensure it matches ${company_name}'s communication standards.

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
- Internal ${company_name} team names, deal stages, or CRM terminology
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
Something your team needs to prepare before the next buyer interaction. Must reference a specific meeting deliverable. Owner = person best equipped (not always the rep). Deadline = at least 24 hours before next buyer interaction.

### Task 2: Customer-Facing Follow-Up
The single most important external action post-meeting. Include specific buyer name and contact method. Deadline matches the commitment made in the meeting.

### Task 3: Deal Hygiene
CRM update to reflect what happened. Completable in under 5 minutes. Priority "medium" unless deal stage change required (then "high").

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

## Meeting Outcome Confidence Assessment

Assess how firm the meeting outcomes actually are before building the pack. Not all "decisions" are equal — a verbal nod from a junior contact is not the same as a signed-off commitment from the VP.

### Confidence Levels

| Level | Criteria | Pack Implication |
|-------|----------|-----------------|
| **High** | Decisions stated clearly by authorized stakeholders, specific dates committed, no hedging language | Assumptive CTA in email, green signal likely, standard task deadlines |
| **Medium** | Directional agreement but with qualifiers, dates tentative, or decision-maker not present | Confirmatory CTA ("Does this align?"), yellow signal possible, add a re-confirmation task |
| **Low** | Hedging language throughout, no firm commitments, decisions deferred to absent stakeholders | Value-add CTA, yellow/red signal, prioritize a "get alignment" task over execution tasks |

### Hedging Language Patterns
Detect these in meeting transcripts and digests — they indicate tentative rather than firm commitments:
- **Tentative verbs**: "we'll try to", "hopefully", "we should be able to", "I think we can"
- **Deferral phrases**: "let me check with", "I need to run this by", "pending approval from", "once [person] signs off"
- **Conditional language**: "if the budget allows", "assuming no changes", "as long as", "provided that"
- **Time hedging**: "sometime next week", "in the coming weeks", "when we get a chance"

### Stakeholder Authority Check
- Was the decision-maker (budget authority, technical authority, legal authority) present in the meeting?
- If decisions were made by someone without authority, flag the confidence as Medium at best.
- Check RAG history: has this contact made commitments before that were later overridden by someone more senior?

### Output
Include in `data.outcome_confidence`:
- `level`: "high" | "medium" | "low"
- `signals`: string[] — specific phrases or observations that informed the assessment
- `hedging_detected`: boolean — true if hedging language patterns were found
- `authority_present`: boolean — true if the meeting included the relevant decision-maker

## Cross-Artifact Consistency Checker

Before finalizing the pack, run this automated consistency check. Every pack must pass.

### Verification Matrix

| Check | How to Verify | Failure Action |
|-------|--------------|----------------|
| **Decisions match** | Buyer email decisions = Slack update decisions | Reconcile — use the most specific version |
| **Dates match** | Email next-step dates = task due dates | Task due dates should be on or before email dates |
| **Names match** | Contact name spelled the same across all 3 artifacts | Standardize to CRM spelling |
| **Deal info matches** | Stage, value, close date consistent in Slack and tasks | Use CRM as source of truth |
| **Risks reflected** | Slack risks are reflected in task priorities | If Slack flags a risk, at least one task should address it |
| **CTA aligns with tasks** | The buyer email CTA should map to one of the 3 tasks | If CTA asks buyer to do X, a customer-facing task should track it |

Include the check result in `data.consistency_check`:
- `passed`: boolean
- `checks_run`: number (always 6)
- `failures`: array of { check: string, detail: string } (empty if all passed)

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

### `data.outcome_confidence`
Object:
- `level`: "high" | "medium" | "low"
- `signals`: string[] (specific phrases or observations — e.g., "Sarah said 'let me check with our VP' — deferral")
- `hedging_detected`: boolean
- `authority_present`: boolean (true if decision-maker was in the meeting)

### `data.rag_context_used`
Array of objects:
- `type`: "previous_commitment" | "running_theme" | "deal_evolution"
- `source_meeting`: string (meeting date or ID)
- `content`: string (what was found)
- `used_in`: "buyer_email" | "slack_update" | "tasks" | "confidence_assessment"

If no RAG results, return empty array with a note in `pack_summary`.

### `data.consistency_check`
Object:
- `passed`: boolean
- `checks_run`: number (always 6)
- `failures`: array of `{ check: string, detail: string }`

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

| Scenario | Action |
|----------|--------|
| **No meeting data** | Return error: "No meeting content available. Please provide a meeting summary or meeting ID." |
| **Partial data** | Build with what is available. Flag: "Pack built with partial data — some fields may need manual completion." |
| **No contact email** | Set `buyer_email.to: null`, flag it, still generate the full email body. |
| **No deal linked** | Omit deal-specific language. Task 3 becomes "Create new deal record for [Company]." Not an error — many meetings are pre-deal. |
| **No clear decisions** | Replace "Decisions" with "Alignment Points." Flag in Slack: "No firm decisions — consider a decision-focused follow-up." |
| **No clear next steps** | Generate suggested next steps from deal stage. Flag: "Suggested next steps based on best practices — verify before sending." |
| **Multiple meetings** | Ask for clarification: "Found [N] meetings today. Which one?" |
| **Insufficient context** | Fill remaining task slots with deal-stage defaults. Flag: "Meeting content limited — [N] tasks are best-practice suggestions." |
| **Sensitive info detected** | Flag: "Sensitive content detected. Review buyer email before sending externally." |

## Examples

See `references/artifact-examples.md` for 5 annotated excellent packs, 3 annotated poor packs with "what went wrong" analysis, before/after comparisons, industry-specific tone adjustments, and meeting outcome variations.

### Quick Reference: Good vs Bad

**Good pack signals**: Buyer's own words quoted, all next steps have owners + dates, single specific CTA, Slack has signal icon + risks + @mentions, tasks start with verbs and have deadlines, momentum score 4-5.

**Bad pack signals**: Generic email ("thanks for the meeting, let me know if you have questions"), Slack with no structure ("good meeting, will follow up"), tasks without deadlines or owners ("follow up with Acme — due: soon").
