# Product Requirements Document: Proactive AI Sales Teammate

**Version**: 1.0  
**Status**: Active Development  
**Last Updated**: 2026-01-24  
**Owner**: Product Team

---

## Executive Summary

Transform the 60 Copilot from a reactive AI assistant into a **proactive AI sales teammate** — a dedicated team member who knows your company inside-out, acts autonomously to help senior sales reps be more successful, and communicates regularly via Slack.

**The Vision**: After onboarding, users feel like they have a brilliant junior colleague who has memorized everything about the company, can research in seconds, drafts emails in the perfect voice, and proactively keeps them on top of their pipeline.

---

## Table of Contents

1. [The Problem](#the-problem)
2. [The Solution](#the-solution)
3. [Core Principles](#core-principles)
4. [User Journey](#user-journey)
5. [Feature Specifications](#feature-specifications)
6. [Technical Architecture](#technical-architecture)
7. [Success Metrics](#success-metrics)
8. [Phased Rollout](#phased-rollout)

---

## The Problem

### Current State

Sales reps today face:
- **Information overload** — CRM data, meeting notes, emails, Slack all fragmented
- **Manual prep** — Spending 15-30 minutes prepping for each meeting
- **Stalling deals** — Missing follow-ups because things slip through the cracks
- **Generic AI** — Existing copilots don't know the company, products, or voice

### Why Current AI Assistants Fall Short

| Issue | Impact |
|-------|--------|
| Generic responses | Don't reference company products or competitors |
| Reactive only | Wait to be asked, never proactive |
| No company context | Can't position against competitors or address pain points |
| No HITL | Either fully autonomous (risky) or fully manual (slow) |
| No Slack integration | Reps have to open another app |

---

## The Solution

### The Proactive AI Sales Teammate

A dedicated team member that:

1. **Knows Your Company** — Products, competitors, pain points, brand voice (from onboarding)
2. **Acts Proactively** — Runs periodic analysis, sends Slack updates, does tasks autonomously
3. **Uses Skills & Sequences** — Has "superpowers" via pre-built workflows
4. **Gets Confirmation** — HITL for external actions (emails, Slack posts)
5. **Tracks Engagement** — Measures value delivered, optimizes outreach

### The Transformation

```
BEFORE (Generic AI):
┌─────────────────────────────────────────────────────────────────┐
│  User: "Help me with my meeting"                                │
│  AI: "I'd be happy to help! What meeting would you like        │
│       assistance with?"                                         │
│                                                                 │
│  [Generic, no context, no proactivity]                          │
└─────────────────────────────────────────────────────────────────┘

AFTER (Your Team Member):
┌─────────────────────────────────────────────────────────────────┐
│  [Slack notification, 2 hours before meeting]                   │
│                                                                 │
│  🤖: "Hey Sarah! Your TechCorp meeting is in 2 hours.          │
│       I've prepared a brief:                                    │
│                                                                 │
│       📋 Key Points:                                            │
│       • They're evaluating us against WidgetCo                  │
│       • Last call: Asked about Widget Pro integrations          │
│       • Decision maker: John Chen (CTO)                         │
│                                                                 │
│       💡 Talking Points:                                         │
│       1. Our Salesforce integration is 3x faster                │
│       2. Address their pricing concern with case study          │
│                                                                 │
│       [View Full Brief]  [Add Notes]                            │
│                                                                 │
│       Good luck! 🎯"                                            │
│                                                                 │
│  [Proactive, contextual, actionable]                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Principles

### 1. Team Member, Not Chatbot

The AI should feel like a knowledgeable colleague:
- Addresses users by name
- References their specific deals and contacts
- Speaks in the company's voice
- Is proactive with suggestions
- Remembers context across conversations

### 2. Company-Specific Knowledge

After onboarding, the AI knows:
- **Products & Features** — References by name in emails and prep
- **Competitors** — Knows positioning and differentiators
- **Customer Pain Points** — Addresses in discovery questions
- **Brand Voice** — Writes emails that sound like the company
- **ICP** — Helps qualify leads against ideal customer profile
- **Objection Handling** — Coaches reps on responses

### 3. Proactive, Not Just Reactive

The AI initiates contact when it can add value:
- **Daily pipeline analysis** → Slack summary at 9am
- **Pre-meeting prep** → Automatic brief 2 hours before
- **Overdue tasks** → Offers to complete or reschedule
- **Deal stalling** → Alerts and offers action

### 4. HITL for External Actions

For any external-facing action:
- **Preview first** — Show what will happen
- **Wait for confirmation** — User clicks Confirm/Cancel
- **Then execute** — Only after explicit approval

Applies to:
- Sending emails
- Creating tasks
- Posting to Slack
- Any action with external visibility

### 5. Superpowers via Skills & Sequences

The AI has capabilities beyond a normal assistant:

| Superpower | Skill/Sequence | Time Saved |
|------------|---------------|------------|
| Meeting Prep | `seq-next-meeting-command-center` | 15-30 min |
| Pipeline Health | `seq-pipeline-focus-tasks` | 20 min |
| Follow-up Emails | `seq-post-meeting-followup-pack` | 10 min |
| Deal Rescue | `seq-deal-rescue-pack` | 30 min |
| Research | `lead-research` | 20 min |

### 6. Clarifying Questions

When intent is ambiguous:
- Detect the ambiguity
- Offer 2-4 clear options
- Execute selected option with full context

```
User: "Help me with the Acme deal"

AI: "I can help with Acme! What would you like to do?
     1. Draft a follow-up email
     2. Review deal health
     3. Prep for your next meeting
     4. Check competitor positioning
     
     Just reply with the number or tell me more."
```

---

## User Journey

### Phase 1: Onboarding (5-10 minutes)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. WEBSITE ENRICHMENT                                          │
│     • User enters company website                               │
│     • AI scrapes and extracts company intelligence              │
│     • Products, competitors, pain points, voice extracted       │
│                                                                 │
│  2. PERSONA GENERATION                                          │
│     • AI generates specialized persona                          │
│     • "You are Sarah's dedicated sales analyst at Acme..."      │
│     • Includes company knowledge, voice, HITL instructions      │
│                                                                 │
│  3. SKILLS CONFIGURED                                           │
│     • Lead qualification criteria                               │
│     • Objection handling responses                              │
│     • ICP definition                                            │
│     • Brand voice guidelines                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: Daily Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  MORNING (9:00 AM)                                              │
│  • Agent runs pipeline analysis                                 │
│  • Sends Slack: "Good morning Sarah! Pipeline pulse:            │
│    3 deals need attention, 2 meetings today..."                 │
│  • User can reply or click buttons for more                     │
│                                                                 │
│  BEFORE MEETINGS (2 hours prior)                                │
│  • Agent detects upcoming meeting with no prep                  │
│  • Runs meeting prep sequence automatically                     │
│  • Sends Slack: "Your TechCorp meeting is in 2 hours.          │
│    I've prepared a brief..."                                    │
│                                                                 │
│  DURING DAY (as needed)                                         │
│  • User asks questions in copilot                               │
│  • Agent uses skills/sequences to respond                       │
│  • Gets confirmation for external actions                       │
│                                                                 │
│  TASK COMPLETION                                                │
│  • Agent identifies overdue tasks                               │
│  • Offers to complete (e.g., draft that follow-up email)        │
│  • Completes and notifies user                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 3: Continuous Improvement

```
┌─────────────────────────────────────────────────────────────────┐
│  ENGAGEMENT TRACKING                                            │
│  • Track which messages get opened, actioned                    │
│  • Measure time from notification to action                     │
│  • Calculate value delivered (time saved)                       │
│                                                                 │
│  RE-ENRICHMENT (Weekly)                                         │
│  • Re-scrape company website for updates                        │
│  • Detect new products, messaging changes                       │
│  • Update persona if significant changes                        │
│                                                                 │
│  OPTIMIZATION                                                   │
│  • Adjust proactive outreach based on engagement                │
│  • Surface insights on agent performance                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature Specifications

### F1: Specialized Team Member Persona

**Goal**: After onboarding, the copilot behaves like a dedicated team member.

**Requirements**:
- Compile persona from organization enrichment data
- Inject persona into Gemini system prompt
- Include: company knowledge, brand voice, HITL instructions
- Cache persona in `organization_context` table
- Regenerate when enrichment data changes

**Persona Template**:
```
You are {rep_name}'s dedicated sales analyst at {company_name}. 
Think of yourself as their brilliant junior colleague who has 
superpowers — you've memorized everything about the company, 
you can research in seconds, and you draft emails in the perfect voice.

YOU ARE A TEAM MEMBER, NOT A GENERIC AI.
- Call them by name
- Reference their specific deals and contacts
- Be proactive with suggestions
- Speak like a knowledgeable colleague, not a chatbot

[Company Knowledge]
[Superpowers]
[Writing Voice]
[HITL Instructions]
```

### F2: Proactive Agent Workflows

**Goal**: Agent acts like an active team member, not just reactive.

**Workflows**:

| Workflow | Trigger | Action | Notification |
|----------|---------|--------|--------------|
| Pipeline Analysis | Daily cron (9am) | Analyze pipeline health | Slack summary with actions |
| Pre-Meeting Prep | 2 hours before meeting | Run prep sequence | Slack brief with key points |
| Task Analysis | Daily cron | Find overdue tasks | Slack with quick actions |
| Deal Stall Alert | Deal inactive 7+ days | Suggest follow-up | Slack with draft email offer |

**Requirements**:
- Cron jobs for periodic analysis
- Detect opportunities to add value
- Execute sequences autonomously when appropriate
- Always notify user via Slack
- Support interactive Slack actions

### F3: Clarifying Questions Flow

**Goal**: When intent is ambiguous, ask for clarification before executing.

**Requirements**:
- Detect ambiguous requests (multiple valid interpretations)
- Generate 2-4 clear options based on available skills/sequences
- Present numbered choices
- Execute selected option with full context
- Track clarification patterns for optimization

**Example**:
```
User: "Help me with Acme"

Agent: "I can help with Acme Corp! What would you like to do?

1. **Draft a follow-up email** — They haven't heard from us in 14 days
2. **Review deal health** — Check what's stalling and what to do
3. **Prep for a call** — Get talking points and research
4. **Check competitor positioning** — They might be evaluating WidgetCo

Just reply with the number or tell me more about what you need."
```

### F4: Slack Integration

**Goal**: Communicate with users where they already are.

**Notification Types**:
- Daily pipeline summary
- Pre-meeting briefs
- Task reminders
- Deal alerts
- Win/loss celebrations

**Interactive Actions**:
- Button clicks (Draft Email, View Brief, More Info)
- Threaded replies as copilot prompts
- HITL confirmation in Slack

**Requirements**:
- Rich Block Kit formatting
- Clickable buttons
- Thread support
- Link to copilot for full details

### F5: HITL Confirmation Pattern

**Goal**: Get explicit confirmation before external actions.

**Pattern**:
```
1. User requests action (e.g., "Send follow-up to John")
2. Agent runs sequence with is_simulation=true
3. Agent shows preview (email content, task details)
4. User sees [Confirm] [Edit] [Cancel] buttons
5. User clicks Confirm
6. Agent runs sequence with is_simulation=false
7. Agent confirms completion
```

**Applies To**:
- Sending emails
- Creating tasks
- Posting to Slack
- Updating deal stages
- Any external action

### F6: Engagement Tracking

**Goal**: Measure value delivered, optimize proactive outreach.

**Metrics Tracked**:
- Messages sent (proactive vs reactive)
- Message opens (for Slack)
- Actions taken (button clicks, replies)
- Time from notification to action
- Sequences executed
- Outcomes (emails sent, tasks created, deals updated)

**Value Calculation**:
- Time saved per sequence
- Deals progressed
- Tasks completed
- Response rate to proactive messages

### F7: Copilot Lab

**Goal**: World-class testing platform for skills and sequences.

**Features**:
- Interactive playground with execution tracing
- Cost/latency display
- Save/load test queries
- Debug mode toggle
- Prompt library with expected outputs
- Response grading (accuracy, helpfulness, tone)
- Result comparison (A/B testing)

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     PROACTIVE AI TEAMMATE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐                 │
│  │   ONBOARDING     │     │    COPILOT       │                 │
│  │                  │     │                  │                 │
│  │ • Website scrape │     │ • Chat interface │                 │
│  │ • Enrichment     │     │ • Skill selection│                 │
│  │ • Persona gen    │     │ • Sequence exec  │                 │
│  │ • Skill config   │     │ • HITL confirm   │                 │
│  └────────┬─────────┘     └────────┬─────────┘                 │
│           │                        │                            │
│           ▼                        ▼                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    BACKEND SERVICES                      │   │
│  │                                                          │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        │   │
│  │  │ api-copilot│  │ Sequences  │  │ Skills     │        │   │
│  │  │ Edge Func  │  │ Executor   │  │ Library    │        │   │
│  │  └────────────┘  └────────────┘  └────────────┘        │   │
│  │                                                          │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        │   │
│  │  │ Proactive  │  │ Engagement │  │ Persona    │        │   │
│  │  │ Cron Jobs  │  │ Tracker    │  │ Compiler   │        │   │
│  │  └────────────┘  └────────────┘  └────────────┘        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│           │                        │                            │
│           ▼                        ▼                            │
│  ┌──────────────────┐     ┌──────────────────┐                 │
│  │     SLACK        │     │   DATABASE       │                 │
│  │                  │     │                  │                 │
│  │ • Notifications  │     │ • Enrichment     │                 │
│  │ • Actions        │     │ • Context        │                 │
│  │ • Threads        │     │ • Engagement     │                 │
│  └──────────────────┘     └──────────────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `organization_enrichment` | Company data from website scraping |
| `organization_context` | Key-value pairs including compiled persona |
| `organization_skills` | Configured skills per org |
| `platform_skills` | Skill and sequence definitions |
| `copilot_engagement_events` | Engagement tracking |
| `copilot_analytics` | Request/response metrics |
| `sequence_executions` | Sequence execution tracking |

### Edge Functions

| Function | Purpose |
|----------|---------|
| `api-copilot` | Main copilot endpoint |
| `deep-enrich-organization` | Website scraping and enrichment |
| `proactive-pipeline-analysis` | Daily pipeline analysis cron |
| `proactive-meeting-prep` | Pre-meeting auto-prep cron |
| `proactive-task-analysis` | Overdue task analysis cron |
| `slack-copilot-actions` | Handle Slack interactive actions |

---

## Success Metrics

### User Engagement

| Metric | Target | Measurement |
|--------|--------|-------------|
| Daily Active Users | 80% of reps | Unique users per day |
| Proactive Message Open Rate | >60% | Slack analytics |
| Action Rate | >40% | Actions taken / messages sent |
| Time to Action | <5 min | Time from notification to action |

### Value Delivered

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time Saved per User | 2 hours/week | Sequence execution × time saved |
| Meeting Prep Adoption | 80% of meetings | Prep sequences run / meetings |
| Follow-up Completion | 90% | Emails sent after meetings |
| Task Completion Rate | +20% | Tasks completed with agent help |

### Product Quality

| Metric | Target | Measurement |
|--------|--------|-------------|
| Response Quality Score | >85/100 | Response grading in Lab |
| Personalization Score | >80% | Enrichment fields used |
| HITL Confirmation Rate | >95% | External actions confirmed |
| Error Rate | <1% | Failed sequence executions |

---

## Phased Rollout

### Phase 1: Specialized Team Member (Week 1-2)

- [ ] AGENT-001: Compile persona from enrichment
- [ ] AGENT-002: Inject persona into system prompt
- [ ] AGENT-003: Generate persona during onboarding

**Outcome**: Copilot feels personalized after onboarding

### Phase 2: Proactive Agent (Week 3-4)

- [ ] PROACTIVE-001: Clarifying questions flow
- [ ] PROACTIVE-002: Daily pipeline analysis cron
- [ ] PROACTIVE-003: Pre-meeting auto-prep
- [ ] PROACTIVE-004: Task analysis and completion
- [ ] PROACTIVE-005: Slack interactive actions

**Outcome**: Agent proactively reaches out via Slack

### Phase 3: Engagement Tracking (Week 5)

- [ ] ENGAGE-001: Engagement analytics table
- [ ] ENGAGE-002: Value tracking in sequences
- [ ] ENGAGE-003: Performance dashboard

**Outcome**: Measure and visualize agent value

### Phase 4: Enhanced Personalization (Week 6)

- [ ] PERS-001: Add enrichment to context
- [ ] PERS-002: Add AI preferences to context
- [ ] PERS-003: Working hours awareness

**Outcome**: Use 80% of collected data

### Phase 5: Re-Enrichment (Week 7)

- [ ] ENRICH-001: Re-enrichment cron job
- [ ] ENRICH-002: Change detection
- [ ] ENRICH-003: Manual re-enrich button

**Outcome**: Company knowledge stays fresh

### Phase 6-7: Copilot Lab (Week 8-10)

- [ ] LAB-001: Cost/latency display
- [ ] LAB-002: Save/load queries
- [ ] LAB-003: Debug mode
- [ ] LAB-004: Prompt Library
- [ ] LAB-005: Response Grading
- [ ] LAB-006: Result Comparison

**Outcome**: World-class testing platform

---

## Appendix

### A. Persona Template (Full)

```
You are {rep_name}'s dedicated sales analyst at {company_name}. 
Think of yourself as their brilliant junior colleague who has 
superpowers — you've memorized everything about the company, 
you can research in seconds, and you draft emails in the perfect voice.

YOU ARE A TEAM MEMBER, NOT A GENERIC AI.
- Call them by name
- Reference their specific deals and contacts
- Be proactive with suggestions
- Speak like a knowledgeable colleague, not a chatbot

YOUR SUPERPOWERS (Sequences):
- Meeting prep in 30 seconds
- Pipeline health check with actionable insights
- Follow-up emails in the company voice
- Deal rescue plans when things stall
- Research & competitive intel

COMPANY KNOWLEDGE (you've memorized this):
- Products: {products}
- Competitors: {competitors} (positioning: {differentiators})
- Customer pain points: {pain_points}
- ICP: {icp_summary}
- Buying signals: {buying_signals}

WRITING IN THE COMPANY VOICE:
- Tone: {brand_tone}
- Phrases we use: {key_phrases}
- Never say: {words_to_avoid}

OBJECTION COACHING:
{objection_responses}

HITL (always get confirmation for external actions):
- Preview emails → wait for 'Confirm' → then send
- Preview tasks → wait for 'Confirm' → then create
- Preview Slack posts → wait for 'Confirm' → then post
```

### B. Slack Message Templates

See `.cursor/rules/slack-blocks.mdc` for Block Kit patterns.

### C. Related Documents

- `.sixty/plan-copilot-lab-specialized.json` — Execution plan
- `.sixty/consult/copilot-lab-world-class.md` — Consult report
- `docs/QA_COPILOT_EXCELLENCE_CHECKLIST.md` — Testing checklist
- `CLAUDE.md` — Developer reference

---

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-24 | Initial PRD |
