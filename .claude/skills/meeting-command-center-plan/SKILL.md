---
name: Meeting Command Center Plan
description: |
  Create a concrete meeting prep plan with a checklist task, talking points, risks, and questions.
  Use when a user asks "prepare for my next meeting", "meeting prep checklist",
  "what should I prepare for my call", or needs a structured preparation plan.
  Returns a prep task with time-bound checklist, key risks, and talking points.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: full
  agent_affinity:
    - meetings
  triggers:
    - pattern: "prepare for my meeting"
      intent: "meeting_prep_plan"
      confidence: 0.85
      examples:
        - "prepare for my next meeting"
        - "help me prepare for the call"
        - "meeting preparation checklist"
    - pattern: "meeting prep checklist"
      intent: "meeting_checklist"
      confidence: 0.85
      examples:
        - "give me a prep checklist"
        - "what should I prepare for my meeting"
        - "meeting prep task"
    - pattern: "get ready for my call"
      intent: "call_preparation"
      confidence: 0.80
      examples:
        - "prep for the call"
        - "what do I need for the meeting"
        - "meeting prep plan"
  keywords:
    - "prepare"
    - "prep"
    - "meeting"
    - "checklist"
    - "call"
    - "ready"
    - "talking points"
    - "risks"
  required_context:
    - next_meeting
    - brief
    - company_name
  inputs:
    - name: meeting_id
      type: string
      description: "The meeting or calendar event identifier to build a prep plan for"
      required: true
    - name: contact_id
      type: string
      description: "Primary contact associated with the meeting"
      required: false
    - name: include_transcript
      type: boolean
      description: "Whether to include previous meeting transcript context"
      required: false
      default: false
  outputs:
    - name: prep_task
      type: object
      description: "Preparation task with title, description, due date, priority, and time-bound checklist"
    - name: key_risks
      type: array
      description: "Key risks and potential objections to prepare for"
    - name: talking_points
      type: array
      description: "Recommended talking points for the meeting"
    - name: questions
      type: array
      description: "Strategic questions to ask during the meeting"
  priority: high
  requires_capabilities:
    - calendar
    - crm
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Meeting Command Center Plan

## The Command Center Concept

A Meeting Command Center is everything you need for a meeting -- organized, time-phased, and actionable -- in one place. It is the difference between "I think I'm ready" and "I know exactly what I'm doing."

The concept comes from military and aviation pre-mission briefings: before every sortie, the crew assembles at a single station that has weather, threat intel, comms frequencies, fuel calculations, and the mission plan. Nothing is scattered across four screens. Everything is checklist-driven. The crew does not wing it.

Sales meetings deserve the same rigor. Research shows:

- **Reps who use structured prep checklists advance deals 28% faster** through pipeline stages (TOPO Group research).
- **73% of missed follow-ups trace back to unclear meeting outcomes** -- the rep walked out without a defined next step (Gong analysis of 40K sales calls).
- **The #1 predictor of meeting success is pre-meeting preparation quality**, not presentation skill, product knowledge, or even pricing (CSO Insights).

This skill synthesizes meeting context, deal intelligence, and interaction history into a single actionable command center with time-phased tasks, talking points, risk mitigation plans, and resource links.

## Inputs

- `next_meeting`: Calendar event object from `execute_action(get_next_meeting)` -- includes title, time, attendees, meeting URL
- `brief`: Meeting prep brief object from the `meeting-prep-brief` skill (or generated inline)
- `organization_id`: Current organization context -- use Organization Context for ${company_name} brand tone, products, and competitive positioning

If the brief is not provided, the command center should gather sufficient context independently via CRM and calendar data. However, the output will be richer when paired with a full meeting-prep-brief.

## Data Gathering (via execute_action)

1. **Fetch meeting details**: `execute_action("get_meetings", { meeting_id })` -- title, time, attendees, URL
2. **Fetch primary contact**: `execute_action("get_contact", { id: primary_contact_id })` -- name, title, company, notes
3. **Fetch related deal**: `execute_action("get_deal", { name: company_or_deal_name })` -- stage, amount, MEDDICC, history
4. **Fetch recent activities**: Recent emails, calls, tasks involving this contact in the last 30 days
5. **Fetch previous meeting notes** (if `include_transcript`): Transcripts from past meetings with this contact

## Pre-Meeting Checklist Methodology

The checklist is organized into time-phased blocks. Each block has a target completion time relative to the meeting start. This prevents the "I'll do it all at once" trap that leads to shallow prep.

### Phase 1: Foundation (24-48 hours before)

This phase handles research and context-gathering that requires thought, not just retrieval.

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 1 | Review CRM deal record -- stage, amount, close date, custom fields | Must-do | Flag anything stale (no update in 14+ days) |
| 2 | Review contact profiles for all attendees | Must-do | Note titles, roles, decision authority |
| 3 | Check for new attendees not seen in previous meetings | Must-do | New attendees = new dynamics. Research them. |
| 4 | Read last meeting transcript or notes | Must-do | What was promised? What concerns were raised? |
| 5 | Check for open tasks or commitments to this contact | Must-do | Nothing kills credibility like a missed follow-up |
| 6 | Research company news (last 30 days) | Should-do | Funding, hiring, leadership change, product launch |
| 7 | Review competitive intelligence (if competitive deal) | Should-do | What are alternatives? Where do you win/lose? |
| 8 | Review internal Slack/email for relevant team context | Nice-to-have | Has support flagged any issues? Has marketing shared content? |

### Phase 2: Strategy (2-4 hours before)

This phase turns research into a plan.

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 9 | Define primary meeting objective | Must-do | One sentence: "By end of meeting, we will have X" |
| 10 | Define secondary objective (fallback) | Should-do | If primary fails, what is still a win? |
| 11 | Draft 3-5 talking points | Must-do | Specific to deal stage and attendee roles |
| 12 | Prepare 3 strategic questions | Must-do | Open-ended, designed to surface information you need |
| 13 | Identify top 2-3 risks and prepare responses | Must-do | For each risk: trigger phrase, response, redirect |
| 14 | Prepare success criteria | Should-do | How will you know this meeting went well? |

### Phase 3: Staging (10-15 minutes before)

This phase is about logistics and mental readiness.

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 15 | Open meeting link and test audio/video | Must-do | Nothing wastes time like tech issues in the first 2 minutes |
| 16 | Open CRM deal record in a browser tab | Must-do | For real-time reference during the call |
| 17 | Open contact profiles in a browser tab | Should-do | Quick reference for names, titles, context |
| 18 | Have notepad/doc ready for live notes | Must-do | Capture commitments and action items in real-time |
| 19 | Review your opening statement (first 30 seconds) | Should-do | Set the tone, state the agenda, confirm time |
| 20 | Silence notifications | Must-do | Full focus. No Slack pings, no email popups. |

### Phase 4: Post-Meeting (within 30 minutes after)

Pre-plan the post-meeting actions BEFORE the meeting. This prevents the "I'll do it later" decay.

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 21 | Send follow-up email with summary and next steps | Must-do | Within 30 minutes. First to follow up wins. |
| 22 | Update CRM deal record | Must-do | Stage change? New close date? Updated amount? |
| 23 | Create tasks for commitments made | Must-do | Every promise = a tracked task with a deadline |
| 24 | Share meeting insights with team | Should-do | Slack update, internal note, or team stand-up item |
| 25 | Schedule next meeting (if agreed) | Must-do | Lock it in while momentum is high |

## How to Structure a Meeting Agenda That Drives Outcomes

Consult `references/agenda-templates.md` for full agenda templates for 8+ meeting types (discovery, demo, QBR, negotiation, kickoff, check-in, executive briefing, renewal) with time allocations, owner assignments, and facilitation notes.

Most meeting agendas are lists of topics. Effective agendas are structured around outcomes.

### The Outcome-Driven Agenda Framework

```
Meeting Agenda: [Meeting Title]
Date: [Date] | Time: [Duration] | Attendees: [Names]

1. Opening & Alignment (2-3 min)
   - Confirm agenda and time
   - State the purpose: "By end of this meeting, we'd like to [outcome]"

2. Context Check (3-5 min)
   - "Since our last conversation, has anything changed on your end?"
   - This surfaces new information BEFORE you present outdated assumptions

3. Core Discussion (15-25 min)
   - [Topic 1]: [What outcome you want from this topic]
   - [Topic 2]: [What outcome you want from this topic]
   - [Topic 3]: [What outcome you want from this topic]

4. Questions & Concerns (5-10 min)
   - "What questions do you have?"
   - "Is there anything we haven't covered that's on your mind?"

5. Next Steps & Commitments (3-5 min)
   - Summarize what was agreed
   - Confirm next actions with owners and deadlines
   - Schedule the follow-up
```

### Agenda Rules

1. **Never more than 3 core topics.** Research from Harvard Business Review shows that meetings with more than 3 agenda items have 50% lower completion rates. Prioritize ruthlessly.
2. **Always start with alignment.** Confirm the agenda, confirm the time, confirm the purpose. This prevents scope creep and sets expectations.
3. **Always end with next steps.** The last 5 minutes are the most important. If you run out of time, cut a discussion topic -- never cut the close.
4. **Time-box each section.** Without time boxes, the first topic consumes the entire meeting. Write the minutes next to each item.
5. **Share the agenda beforehand** (24 hours in advance for high-stakes meetings). This lets the prospect prepare too, which leads to a higher-quality conversation.

### Agenda Templates by Meeting Type

**Discovery Call Agenda:**
```
1. Introductions & agenda confirmation (3 min)
2. Their current situation: "Walk me through how you handle [X] today" (15 min)
3. Pain exploration: "What happens when [X] breaks down?" (10 min)
4. Next steps: "Based on what we've discussed, here's what I'd suggest as a next step" (5 min)
```

**Demo / Evaluation Agenda:**
```
1. Recap: "Last time we discussed [pains]. Let me confirm these are still top priorities" (5 min)
2. Solution walkthrough focused on their 3 key requirements (20 min)
3. Technical questions & integration discussion (10 min)
4. Next steps: evaluation criteria, timeline, stakeholders needed (5 min)
```

**Negotiation / Commercial Agenda:**
```
1. Alignment: "We're here to discuss commercial terms. Let me confirm what we've agreed so far" (5 min)
2. Proposal review: Walk through each line item with value justification (15 min)
3. Concerns & negotiation points (15 min)
4. Path to close: "What needs to happen between now and [date] to get this done?" (5 min)
```

**Executive Alignment Agenda:**
```
1. Strategic context: "Here's what we understand about [company]'s priorities" (5 min)
2. Business case: Impact in executive language (revenue, margin, risk, speed) (10 min)
3. Executive's perspective: "How does this align with your priorities?" (10 min)
4. Ask: Specific request (budget, sponsorship, timeline commitment) (5 min)
```

## Talking Point Development from Deal Context

Talking points should never be generic. They must be derived from deal context and tailored to the meeting type.

### The STAR Method for Talking Points

Each talking point should follow this structure:

- **S**ituation: Reference their specific context ("You mentioned your team spends 4 hours per week on manual reporting...")
- **T**ension: Highlight the cost or risk of the status quo ("...which means your SDRs have 4 fewer hours of selling time each week")
- **A**ction: Present the relevant ${company_name} capability from Organization Context ("Our automated pipeline dashboard eliminates that manual work entirely")
- **R**esult: Quantify the outcome with proof, referencing case studies from Organization Context where available ("Customers like [similar company] recovered 15% more selling time within the first month")

### Talking Point Prioritization

Not all points are equal. Rank them:

1. **Must-say** (max 2): Points that directly address the prospect's #1 concern or advance the deal stage. If the meeting gets cut short, you said these.
2. **Should-say** (max 2): Points that build value or address secondary concerns.
3. **Could-say** (1-2): Points to use if the conversation opens naturally. Do not force them.

### Talking Points Derived from MEDDICC Fields

| MEDDICC Field | Talking Point Focus |
|---------------|-------------------|
| Metrics | "Here's the ROI model based on the numbers you shared: [specific calculation]" |
| Economic Buyer | "I'd love to understand how [EB name] thinks about investments like this" |
| Decision Criteria | "You mentioned [criteria] -- let me show you specifically how we address that" |
| Decision Process | "Walk me through what happens after this meeting -- who else needs to weigh in?" |
| Identify Pain | "The core issue seems to be [pain] -- is that still the top priority?" |
| Champion | "How can I best equip you to make the case internally?" |
| Competition | "I know you're also looking at [competitor] -- let me address the key differences" (use competitor intel from Organization Context) |

## Risk Mitigation Planning (Objection Prep)

See `references/objection-prep.md` for the complete ACE objection handling framework with worked examples, pre-meeting objection prediction methodology, common objections by meeting type and deal stage, and live response templates.

For every identified risk, prepare a structured response using the ACE framework:

### ACE Objection Response Framework

- **A**cknowledge: Show you heard and respect the concern. Never dismiss.
- **C**larify: Ask a follow-up question to understand the real issue beneath the surface objection.
- **E**xplore: Offer perspective, data, or a path forward without being defensive.

### Common Objection Preparation Table

| Objection | Acknowledge | Clarify | Explore |
|-----------|-------------|---------|---------|
| "Too expensive" | "I hear you -- budget is always a consideration" | "Help me understand -- is it the total cost, the per-seat pricing, or the timing of the spend?" | "Let me walk through the ROI model. Customers at your scale typically see [X] return in [timeframe]" (use pricing and value props from Organization Context) |
| "We're happy with [competitor]" | "That's great -- [competitor] is a solid tool" | "What would need to change for you to consider an alternative?" | "Most of our customers came from [competitor]. The main reasons they switched were [1, 2, 3]" (use competitive differentiators from Organization Context) |
| "Not a priority right now" | "I understand -- timing matters" | "Is there a specific event or date that would make this a priority? Budget cycle? New quarter?" | "What I'm hearing from similar companies is that [trigger event] is pushing this up the priority list" |
| "Need to think about it" | "Of course -- this is a significant decision" | "What specific concerns would you want to think through? I might be able to help clarify" | "Would it help if I sent over [case study / ROI calculator / reference call] to help with the evaluation?" |
| "We need to involve more people" | "Absolutely -- getting alignment is important" | "Who else should be involved? I'd love to tailor the next conversation to their concerns" | "I can prepare a one-pager for [stakeholder] that focuses on [their specific concerns]" |

### Pre-Loading Risk Responses

For each risk identified in the brief, the command center should include:

```
RISK: [Description]
PROBABILITY: High / Medium / Low
TRIGGER PHRASE: [What the prospect might say that signals this risk]
PREPARED RESPONSE: [ACE-format response]
FALLBACK: [If the response doesn't land, what's Plan B?]
REDIRECT: [Question to pivot the conversation forward]
```

## Question Strategy for Different Meeting Types

### Discovery Questions (prioritize information gathering)
1. "What prompted you to take this meeting?" (reveals trigger event and urgency)
2. "Walk me through your current process for [X]." (reveals pain and workflow)
3. "What does success look like for you in the next 6-12 months?" (reveals goals and metrics)
4. "Who else is involved in a decision like this?" (maps the buying committee)
5. "If you could change one thing about how [process] works today, what would it be?" (reveals top pain)

### Demo Questions (prioritize validation and advancement)
1. "Does this address the [pain point] you mentioned?" (confirm relevance)
2. "How does this compare to how you're doing it today?" (anchor value)
3. "What would your team think of this workflow?" (preview adoption)
4. "Is there anything missing that you'd need to see?" (surface gaps early)

### Negotiation Questions (prioritize commitment and timeline)
1. "What would need to be true for you to move forward this quarter?" (identify blockers)
2. "Are there any concerns we haven't addressed?" (surface hidden objections)
3. "If we can align on terms today, what's the approval process?" (map to close)

### Executive Questions (prioritize strategic alignment)
1. "Where does [initiative] rank in your top 3 priorities?" (gauge executive sponsorship)
2. "What's the cost to the business of not solving this?" (quantify inaction)
3. "What does your team need from a partner like us?" (reveal evaluation criteria)

## Follow-Up Planning: Set Up Success BEFORE the Meeting

The command center should pre-plan follow-up actions before the meeting even happens. This ensures follow-up is immediate and consistent.

### Pre-Planned Follow-Up Templates

**Follow-up email skeleton (to be completed during/after meeting):**
```
Subject: Next steps from our [meeting type] -- [Company]

Hi [Name],

Thank you for the time today. Here's a summary of what we discussed:

Key takeaways:
- [To be filled]

Commitments:
- [Your team]: [Action] by [date]
- [Their team]: [Action] by [date]

Next step: [Specific next step with date]

[Relevant attachment or link]

Looking forward to [next milestone],
[Your name]
```

**Internal debrief template:**
```
Meeting: [Title] | Date: [Date]
Attendees: [Names]
Deal stage: [Before] -> [After]
Key outcome: [One sentence]
Risks surfaced: [List]
Tasks created: [List with owners and dates]
Champion health: [Strong / Neutral / Weakening]
Next meeting: [Date and purpose]
```

## Link Organization: What to Have Open and Ready

Before the meeting starts, have these tabs/resources accessible:

### Essential (always open)
1. Meeting link (Zoom/Teams/Google Meet)
2. CRM deal record
3. Contact profile(s) for all attendees
4. This command center checklist
5. Notepad or note-taking tool

### Conditional (open when relevant)
6. Proposal or pricing document (if negotiation stage)
7. ${company_name} product demo environment (if demo meeting)
8. Case study or ROI calculator (if value discussion)
9. Previous meeting transcript or notes
10. Competitor comparison one-pager (if competitive deal)
11. Security/compliance documentation (if technical evaluation)

### Post-Meeting (bookmark for quick access after)
12. Follow-up email template (pre-drafted)
13. Task creation shortcut in CRM
14. Internal Slack channel for deal updates

## Output Contract

Return a SkillResult with:

- `data.prep_task`: Object with:
  - `title`: "Prep: [Meeting title] with [Contact] -- [Date]"
  - `description`: Brief description of what the meeting is about and why prep matters
  - `due_date`: Set to 2 hours before the meeting start time
  - `priority`: "high" for deals > $50K or executive meetings, "medium" otherwise
  - `checklist`: Array of checklist items, each with:
    - `text`: Description of the task
    - `phase`: "foundation" | "strategy" | "staging" | "post-meeting"
    - `timing`: When to complete relative to meeting time (e.g., "24h before", "2h before", "10min before", "30min after")
    - `priority`: "must-do" | "should-do" | "nice-to-have"
    - `completed`: false (initial state)
    - `link`: URL to relevant resource (CRM record, meeting link, document) if applicable
- `data.key_risks`: Array of risk objects:
  - `risk`: Description of the risk
  - `probability`: "high" | "medium" | "low"
  - `trigger_phrase`: What the prospect might say that signals this risk
  - `prepared_response`: ACE-format response
  - `redirect_question`: Question to pivot the conversation forward
- `data.talking_points`: Array of talking point objects:
  - `point`: The talking point in STAR format
  - `priority`: "must-say" | "should-say" | "could-say"
  - `context`: Why this point matters for this specific meeting
  - `supporting_data`: Any relevant data, quote, or reference
- `data.questions`: Array of question objects:
  - `question`: The question text
  - `purpose`: What information this question is designed to surface
  - `follow_up`: A follow-up question if they give a surface-level answer
  - `category`: "discovery" | "validation" | "commitment" | "strategic"
- `data.agenda`: Suggested meeting agenda (if not provided in the brief):
  - `items`: Array of { topic, outcome, time_minutes }
  - `total_duration`: Expected meeting length
- `data.links`: Array of resource links:
  - `label`: Display name
  - `url`: URL to open
  - `category`: "essential" | "conditional" | "post-meeting"
- `data.follow_up_template`: Pre-drafted follow-up email skeleton
- `references`: Links to related CRM records, meeting details, etc.

## Quality Checklist

Before returning the command center plan, verify every item:

- [ ] **Checklist is time-phased.** Every item has a timing tag (24h before, 2h before, 10min before, 30min after). No undated tasks.
- [ ] **Talking points are STAR-formatted.** Each point references a specific situation, tension, action, and result. No generic bullets like "discuss product value."
- [ ] **Risks have prepared responses.** Every identified risk includes a trigger phrase and ACE-format response. No risks without mitigations.
- [ ] **Questions have purpose tags.** Each question says what it is designed to surface. No questions for the sake of questions.
- [ ] **Agenda drives outcomes.** Each agenda item has an expected outcome, not just a topic label.
- [ ] **Links are real and relevant.** Every URL points to an actual resource (CRM record, meeting link, document). No placeholder URLs.
- [ ] **Follow-up template is pre-drafted.** The email skeleton is ready to complete during/after the meeting.
- [ ] **Priority is set correctly.** High-value deals and executive meetings get "high" priority and deeper checklists.
- [ ] **Post-meeting actions are defined.** The checklist includes Phase 4 items so follow-up is planned, not improvised.
- [ ] **The plan is demo-friendly.** Concise, scannable, and actionable. A rep should be able to use this in real-time during a meeting without getting lost.

## Error Handling

### No brief provided
Generate a lightweight brief inline from CRM and calendar data. The command center should still be useful even without the full meeting-prep-brief output. Flag: "Generated with limited context -- consider running a full meeting brief for deeper preparation."

### Meeting is in less than 1 hour
Skip Phase 1 (Foundation) and Phase 2 (Strategy) detailed tasks. Collapse into a rapid-prep checklist:
1. Review attendees (2 min)
2. Check deal stage and last activity (2 min)
3. Write ONE must-say talking point (1 min)
4. Write ONE must-ask question (1 min)
5. Open meeting link and CRM record (1 min)

### No deal found in CRM
Generate the command center without deal-specific talking points. Focus on company context and relationship-building questions. Suggest creating a deal record as a post-meeting action item.

### No contact information available
Use calendar event data (names, emails) to create minimal attendee profiles. Flag: "Contact records not found in CRM -- prep is based on calendar data only."

### Meeting has no stated purpose or title
Ask the user: "What is the purpose of this meeting?" If no response, default to a discovery-oriented command center with open-ended questions and general preparation tasks.

### Multiple meetings on the same day with the same company
Create separate command centers for each meeting, but cross-reference them. Note shared context and flag any risks of contradictory messaging between meetings.

### Calendar event has no attendees listed
Flag: "No attendees found on the calendar event. This may be a placeholder or the invite hasn't been accepted yet." Generate a minimal command center with company-level prep and suggest the user confirm attendees.

### Previous meeting transcript contains sensitive information
Never include raw transcript excerpts in the command center output. Instead, summarize key themes and commitments. Flag: "Transcript context included in summary form for privacy."
