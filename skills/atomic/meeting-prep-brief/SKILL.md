---
name: Meeting Prep Brief
description: |
  Generate a comprehensive pre-meeting brief with agenda, talking points, and risk assessment.
  Use when a user asks "brief me for my meeting", "prep for the call with Acme",
  "meeting brief", or needs context before a sales call. Uses calendar, CRM, and transcript data.
  Returns a structured brief with attendees, goals, talking points, and risks.
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
    - pattern: "brief me for my meeting"
      intent: "meeting_brief"
      confidence: 0.85
      examples:
        - "meeting brief for tomorrow"
        - "brief me before the call"
        - "pre-meeting brief"
    - pattern: "prep for my meeting"
      intent: "meeting_prep"
      confidence: 0.85
      examples:
        - "prep for the call with"
        - "help me prepare for my meeting"
        - "meeting preparation"
    - pattern: "what should I know before the meeting"
      intent: "meeting_context"
      confidence: 0.80
      examples:
        - "context for my next call"
        - "background for the meeting"
        - "who am I meeting with"
  keywords:
    - "brief"
    - "meeting"
    - "prep"
    - "preparation"
    - "agenda"
    - "talking points"
    - "call"
    - "before meeting"
  required_context:
    - meeting_id
    - event_id
    - company_name
  inputs:
    - name: meeting_id
      type: string
      description: "The meeting or calendar event identifier to prepare a brief for"
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
    - name: brief
      type: object
      description: "Structured pre-meeting brief with attendees, goals, context, and success criteria"
    - name: agenda
      type: array
      description: "Suggested agenda items for the meeting"
    - name: talking_points
      type: array
      description: "Key talking points aligned to deal stage and company needs"
    - name: risks
      type: array
      description: "Potential risks or objections to prepare for"
    - name: questions
      type: array
      description: "Strategic questions to ask during the meeting"
    - name: context_summary
      type: string
      description: "High-level summary of relationship and deal context"
  requires_capabilities:
    - calendar
    - crm
  priority: high
  tags:
    - sales-ai
    - meetings
    - preparation
    - pre-meeting
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Meeting Prep Brief

## Why Meeting Prep Matters

The data is overwhelming and unambiguous:

- **Reps who prepare close 32% more deals** (Gong, 2023 analysis of 1.2M sales calls). Prepared reps ask better questions, handle objections earlier, and move deals forward faster.
- **70% of B2B buyers say sales reps don't understand their business** (Forrester). The #1 reason? Reps show up with generic pitches instead of tailored context.
- **First meetings set the trajectory.** CSO Insights found that 65% of deals that reach advanced stages had a "strong first impression" score -- meaning the rep demonstrated knowledge of the prospect's situation in the initial call.
- **The average rep spends only 4 minutes preparing for a call** (Salesforce State of Sales). The top 10% spend 15-30 minutes. That delta is where quota is won or lost.

This skill exists to close the gap: give every rep the preparation quality of a top performer in 60 seconds.

## The 5-Layer Prep Framework

Consult `references/prep-frameworks.md` for detailed meeting type frameworks including preparation checklists, question banks, and time allocation guides for discovery, demo, QBR, negotiation, renewal, and executive briefing meetings.

Effective meeting prep is not a flat list. It is a layered intelligence model where each layer builds on the previous one. Work through these in order -- each layer informs the next.

### Layer 1: Company Context

**What you need to know:**
- What does the company do? (1-sentence description you could say aloud)
- Industry and vertical (shapes language and examples)
- Company size: employee count, revenue range (shapes pricing and use-case)
- Funding and growth stage (seed startup vs. enterprise -- completely different conversations)
- Recent news: funding round, acquisition, leadership change, product launch, layoffs (within 90 days)
- Tech stack (especially tools adjacent to or competing with ${company_name} products listed in Organization Context)
- Fiscal calendar (Q4 budget push? New fiscal year starting?)

**Where to find it:**
- CRM company record and custom fields
- Previous meeting notes mentioning company context
- Company website (About, Careers, Blog, Press pages)
- Crunchbase for funding and leadership
- LinkedIn company page for headcount and growth
- News search for last 90 days

**Why it matters:** Walking into a meeting without knowing the company had layoffs last month, or just raised a $50M Series C, makes you look unprepared at best and tone-deaf at worst.

### Layer 2: People Intelligence

See `references/stakeholder-guide.md` for the complete stakeholder mapping framework, including the authority-influence matrix, MEDDICC stakeholder mapping, and stakeholder brief templates.

**What you need to know for each attendee:**
- Full name and correct pronunciation (check LinkedIn for phonetic spellings)
- Job title and functional area (Engineering? Finance? Operations?)
- Seniority level: IC, Manager, Director, VP, C-Suite
- Decision-making authority: Are they an influencer, champion, economic buyer, or technical evaluator?
- LinkedIn profile highlights: career path, recent posts, shared connections
- Communication style signals: Do they post long-form thought pieces (analytical) or short punchy takes (direct)?
- Previous interactions with your company (meetings, emails, support tickets)
- Known preferences or concerns from CRM notes

**For new attendees you haven't met before:**
- Google "[Name] [Company]" for published content, speaking appearances, podcast interviews
- Check if they were recently promoted or changed roles (timing signal)
- Look for mutual connections who could provide warm context

**For returning attendees:**
- What did they say in the last meeting? (check transcript)
- What commitments were made to them?
- What concerns did they raise?

**Why it matters:** Calling the VP of Engineering "the technical guy" or not knowing that Sarah from Procurement joined the call signals you don't value their time.

### Layer 3: Deal Context

**What you need to know:**
- Current deal stage in your pipeline
- Deal amount and timeline
- MEDDICC status: Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion, Competition
- What has been agreed so far? What is still open?
- Competitive situation: Are they evaluating alternatives? Who?
- Last activity date: How long since meaningful engagement?
- Relationship health score (if available)
- Blockers: What is preventing this deal from moving forward?

**Where to find it:**
- CRM deal record: stage, amount, close date, custom fields
- Activity timeline: emails, calls, meetings in last 30 days
- Previous meeting transcripts (search for commitments and concerns)
- Task history: Open tasks assigned to you or the prospect

**Red flags to surface:**
- Deal has been in the same stage for more than 2x the average time
- Close date has been pushed more than twice
- No contact from the prospect in 14+ days
- Champion has gone quiet
- New stakeholders appearing late in the process

### Layer 4: Interaction History

**What you need to know:**
- Number of previous meetings and when they occurred
- Key themes from past conversations (what keeps coming up?)
- Commitments made by both sides -- especially unfulfilled ones
- Questions they asked that you didn't answer well
- Objections raised and how they were handled
- Materials shared: proposals, decks, case studies, ROI models
- Email thread summary: what is the most recent written exchange about?

**Where to find it:**
- CRM activity timeline
- Meeting transcripts (search for the contact name)
- Email integration (last 5-10 exchanges)
- Notes and tasks associated with the deal

**Critical rule:** Never walk into a meeting asking a question the prospect already answered. This is the fastest way to destroy credibility. Always check what has already been discussed.

### Layer 5: Meeting Strategy

This layer synthesizes Layers 1-4 into an actionable plan. It answers: "Given everything I know, what should I actually DO in this meeting?"

**Strategic questions to answer:**
- What is the PRIMARY objective of this meeting? (Advance stage? Gather info? Close?)
- What is the SECONDARY objective? (Build champion? Map org chart? Introduce new stakeholder?)
- What must be TRUE after this meeting for the deal to progress?
- What is the prospect expecting from this meeting?
- What is the biggest risk to this meeting going well?

## Data Gathering (via execute_action)

0. **Check for existing company research profile**: Before doing fresh company research, query the `client_fact_profiles` table for a profile matching the attendee's company domain or name (where `is_org_profile = false` and `research_status = 'complete'`). If a profile exists with `research_completed_at` within the last 7 days, use its `research_data` for Layer 1 (Company Context) instead of gathering from scratch. This avoids redundant research and provides richer data (industry, funding, tech stack, team size, competitors) that was collected during lead enrichment. The fact profile's `research_data` follows this structure: `company_overview` (name, description, founded, headquarters), `market_position` (industry, competitors, differentiators), `team_leadership` (employee count, key people), `financials` (funding, revenue range), `technology` (tech stack, platforms), `recent_activity` (news, milestones).
1. **Fetch meeting details**: `execute_action("get_meetings", { meeting_id })` -- title, time, attendees, meeting URL
2. **Fetch primary contact**: `execute_action("get_contact", { id: primary_contact_id })` -- name, title, company, email, phone, notes
3. **Fetch related deals**: `execute_action("get_deal", { name: company_or_deal_name })` -- stage, amount, MEDDICC, activity
4. **Fetch company status**: `execute_action("get_company_status", { company_name })` -- overview, relationship health
5. **Fetch previous transcripts** (if `include_transcript` is true): Search for transcripts involving the same contact or company
6. **Fetch recent activities**: Look for emails, calls, tasks in the last 30 days related to this contact/deal

## Talking Points Methodology by Meeting Type

### Discovery Call (First Meeting)
**Goal:** Understand their world, not pitch your product.

Talking points should focus on:
- Open-ended questions about their current situation ("Walk me through how you currently handle X")
- Pain discovery questions ("What happens when that breaks down?")
- Impact quantification ("How does that affect your team/revenue/timeline?")
- Process questions ("Who else is involved in decisions like this?")

**Do NOT include:** Product features, pricing, or case studies. It is too early.

### Demo / Evaluation Meeting
**Goal:** Show them their future state, not your feature list.

Talking points should focus on:
- Connecting features to their specific pain points from discovery
- Addressing concerns raised in previous conversations
- Competitive differentiation on criteria that matter to them (use competitor intel from Organization Context)
- Technical requirements and integration questions
- Timeline and next steps after the demo

### Negotiation / Pricing Discussion
**Goal:** Protect value while moving to close.

Talking points should focus on:
- ROI recap: Tie back to the metrics and pain identified in discovery, using ${company_name} value propositions from Organization Context
- Value justification for each line item
- Concession strategy: What can ${company_name} offer? What is non-negotiable?
- Procurement process: Legal, security review, contract redlines
- Timeline pressure: Why acting now matters (without being pushy)

### Executive Alignment / Sponsor Meeting
**Goal:** Get executive sponsorship and budget commitment.

Talking points should focus on:
- Business impact in executive language (revenue, margin, risk reduction, speed)
- Strategic alignment with company initiatives
- Competitive risk of inaction
- Clear ask: What you need from the executive (budget approval, champion empowerment, timeline commitment)

### Renewal / Expansion Meeting
**Goal:** Demonstrate value delivered and expand the relationship.

Talking points should focus on:
- Usage metrics and ROI achieved since implementation
- Success stories within their organization
- Gaps or underutilized ${company_name} features (expansion opportunity)
- Upcoming ${company_name} product roadmap items relevant to them
- Multi-year or expanded pricing

## Question Design Principles

Great questions are the single highest-leverage tool in sales. A well-designed question does more work than any slide deck.

### Open vs. Closed Questions

**Open questions** (use 70% of the time): Start with "How", "What", "Walk me through", "Tell me about", "Describe"
- "How does your team currently handle pipeline reporting?"
- "What happens when a deal slips past the expected close date?"
- "Walk me through the approval process for a purchase like this."

**Closed questions** (use 30% of the time, strategically): Yes/No or specific fact
- "Have you evaluated other solutions in this space?"
- "Is your fiscal year calendar-aligned?"
- "Does the CTO need to sign off on security?"

**Rule:** Never start with a closed question. Open questions build rapport and generate information. Closed questions confirm and narrow.

### Strategic vs. Tactical Questions

**Strategic** (decision-level, use with executives):
- "Where does this initiative rank in your top 3 priorities this quarter?"
- "If you could solve one operational problem this year, what would it be?"
- "What does success look like for you personally in this project?"

**Tactical** (implementation-level, use with practitioners):
- "How many users would be in the initial rollout?"
- "What integrations are non-negotiable?"
- "What does your current data migration process look like?"

### The "Why Behind the Why" Technique

Never stop at the first answer. The real insight is usually two questions deep.

1. "What is your biggest challenge with X?" --> Surface answer
2. "Why is that particularly important right now?" --> Timing context
3. "What happens if this doesn't get solved this quarter?" --> Stakes and urgency

## Risk Identification Framework

For every meeting, identify and prepare for these risk categories:

### Competitive Risk
- Is there an incumbent? What would it take to displace them?
- Are they evaluating alternatives? Who and how far along?
- Has a competitor offered aggressive pricing or terms?
- **Prep:** Know ${company_name}'s 3 strongest differentiators against each likely competitor (reference competitors and differentiators from Organization Context).

### Stakeholder Risk
- Is a new decision-maker joining this call? What do we know about them?
- Has the champion gone quiet or changed tone?
- Is there an unknown blocker (legal, procurement, IT security)?
- **Prep:** Have a stakeholder map. Know who supports you, who is neutral, who is hostile.

### Timing Risk
- Has the close date slipped? Why?
- Is there a competing priority consuming their attention?
- Is their budget cycle ending or starting?
- **Prep:** Have a clear "why now" story. Quantify the cost of delay.

### Scope Risk
- Are requirements expanding without corresponding budget?
- Are they asking for capabilities you do not have?
- Is the project scope realistic for their timeline?
- **Prep:** Be ready to scope honestly. Overpromising kills deals in implementation.

### Relationship Risk
- Has there been a miscommunication or missed commitment?
- Are they frustrated with response times or support?
- Did a previous rep damage the relationship?
- **Prep:** Acknowledge issues directly. Have a remediation plan.

## Success Criteria Definition

Every brief must define what "good" looks like for this specific meeting. Success criteria make the difference between a meeting that felt good and a meeting that actually moved the deal.

### Framework: SMART Meeting Outcomes

- **Specific:** "Get verbal confirmation on the 3 evaluation criteria" (not "have a good meeting")
- **Measurable:** "Confirm budget range within $X-$Y" (not "discuss pricing")
- **Achievable:** Aligned with where the deal actually is (do not try to close on a first call)
- **Relevant:** Directly tied to advancing the deal to the next stage
- **Time-bound:** "Schedule the technical review before end of week"

### Examples by Stage

| Stage | Good Success Criteria | Bad Success Criteria |
|-------|----------------------|---------------------|
| Discovery | Identify 2-3 pain points with quantified impact | "Learn about their business" |
| Demo | Get agreement to proceed to technical evaluation | "Show all the features" |
| Negotiation | Agree on commercial terms pending legal review | "Talk about pricing" |
| Close | Get verbal yes with signed timeline | "Follow up next week" |

## Time-Based Prep Guide

### The 5-Minute Quick Prep (Minimum Viable Preparation)

When you are between back-to-back calls and have almost no time:

1. **Who** (1 min): Glance at attendee names and titles. Know who is in the room.
2. **What** (1 min): Check the deal stage and last activity. Know where things stand.
3. **Why** (1 min): What is the stated purpose of this meeting? What should happen next?
4. **Risk** (1 min): Is there one thing that could go wrong? Name it.
5. **Ask** (1 min): What is the ONE question you need answered? Write it down.

### The 15-Minute Standard Prep (Recommended)

The sweet spot for most meetings:

1. **Company scan** (3 min): Review company record, check for recent news
2. **People review** (3 min): Check attendee profiles, review previous interactions
3. **Deal status** (3 min): Review deal stage, open tasks, last meeting notes
4. **Talking points** (3 min): Draft 3-5 key points aligned to deal stage
5. **Questions + risks** (3 min): Write 3 questions and identify top 2 risks

### The 30-Minute Deep Prep (High-Stakes Meetings)

For executive meetings, competitive situations, or close attempts:

1. **Full company research** (5 min): Recent news, funding, leadership changes, earnings
2. **Attendee deep dive** (5 min): LinkedIn review, previous transcripts, communication style
3. **Deal archaeology** (5 min): Full history, every commitment made, every concern raised
4. **Competitive analysis** (5 min): What alternatives they are considering, differentiators
5. **Strategy and questions** (5 min): Meeting objective, fallback position, key questions
6. **Rehearsal** (5 min): Practice your opening, anticipate objections, prepare pivots

## Output Contract

Return a SkillResult with:

- `data.brief`: Structured brief object with:
  - `meeting_title`: Meeting subject/title
  - `meeting_time`: When the meeting is scheduled
  - `attendees`: Array of attendee objects (name, email, role, company, decision_authority, last_interaction)
  - `meeting_type`: Inferred type (discovery, demo, negotiation, executive, renewal, check-in)
  - `meeting_goals`: Primary and secondary objectives for this meeting
  - `context_summary`: Key context from CRM (deal stage, recent activity, relationship health)
  - `company_snapshot`: Quick company facts (size, industry, recent news)
  - `agenda`: Suggested agenda items with time allocations
  - `talking_points`: Key points to cover (aligned to meeting type and deal stage)
  - `questions`: Strategic questions to ask (3-5, prioritized)
  - `risks`: Potential risks or objections to prepare for (with mitigation suggestions)
  - `success_criteria`: Specific, measurable outcomes that define a successful meeting
  - `prep_level`: Recommended prep depth (quick/standard/deep) based on deal value and meeting type
- `data.context_summary`: High-level summary of relationship/deal context
- `references`: Links to related CRM records, previous meetings, transcripts

## Quality Checklist

Before returning the brief, verify every item:

- [ ] **Every attendee is identified** with name, title, and role in the decision. No "unknown attendee" entries.
- [ ] **Deal stage is current.** If the CRM deal stage is stale (no update in 30+ days), flag it.
- [ ] **Talking points are specific**, not generic. "Discuss how [Feature X] reduces their manual QA process by 40%" -- not "Talk about product benefits."
- [ ] **Questions are open-ended** (at least 70%). No questions that can be answered with "yes" or "no" unless strategically placed.
- [ ] **Risks are actionable.** Every risk has a suggested mitigation or response.
- [ ] **Success criteria are measurable.** "Get agreement to proceed to POC" -- not "have a productive meeting."
- [ ] **No stale data.** If key information is older than 30 days, flag it as potentially outdated.
- [ ] **Previous commitments are surfaced.** If either side made promises in past meetings, they must appear.
- [ ] **Competitive context is included** if the deal involves a competitive evaluation.
- [ ] **The brief fits on one screen.** Concise beats comprehensive. If it requires scrolling through paragraphs, tighten it.

## Error Handling

### Meeting not found in calendar
Fall back to searching by contact name, company name, or time range. If still not found, ask the user to specify which meeting they mean. Never fabricate meeting details.

### Contact not in CRM
Create a minimal attendee profile from the calendar event (name, email). Flag as "new contact -- not yet in CRM" and suggest creating a record.

### No deal associated with the contact/company
Generate the brief without deal context. Focus on company and people layers. Note: "No active deal found -- this may be a new opportunity or a relationship-building meeting."

### No previous meeting history
This is a first meeting. Emphasize discovery-oriented talking points and open-ended questions. Note: "First meeting with this contact -- prioritize discovery and rapport."

### Transcript not available or access denied
Proceed without transcript data. Note: "Previous meeting transcripts not available. Talking points are based on CRM data and activity history only."

### Multiple deals with the same company
Present context for all active deals, but highlight the one most likely related to this meeting (based on contacts involved, deal stage, and recency).

### Meeting is in less than 5 minutes
Switch to the 5-Minute Quick Prep format automatically. Prioritize: who is in the room, what stage the deal is in, and the single most important question to ask.

### Meeting type cannot be inferred
Default to a balanced brief with discovery-oriented questions and general talking points. Ask the user: "I couldn't determine the meeting type -- is this a discovery call, demo, negotiation, or something else?"

## Guidelines

- Reference the products, competitors, and case studies from Organization Context to prepare talking points tailored to ${company_name}'s positioning
- Reference deal stage to suggest appropriate next steps and talking point style
- Flag any red flags or risks from CRM data prominently -- do not bury them
- Keep the brief concise but actionable (aim for a single-screen summary)
- Always surface unfulfilled commitments from previous meetings -- this is the #1 credibility killer
- When in doubt, prioritize recency: recent interactions matter more than historical ones
- Tailor question style to the seniority of attendees: strategic for executives, tactical for practitioners
- If the meeting has more than 4 attendees, flag it as a "committee meeting" and adjust strategy accordingly
