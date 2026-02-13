**From Working Parts to Autonomous Sales Copilot**                                                                        
                                                                                                                          
**Date:** 13 February 2026                                                                                                
**Author:** Andrew Bryce / Sixty Seconds                                                                                  
**Status:** Planning

---

## What Actually Exists

This plan starts from the real system, not assumptions.

### Infrastructure (Built & Running)

| Capability | Implementation | Status |
|---|---|---|
| Event scheduling | `agent_schedules` + `agent_triggers` + execution logging | ✅ Live |
| User preferences | `slack_user_preferences` (quiet hours, max notifs/hr), `notification_feature_settings` (per-org 
toggles), `slack_user_mappings` (briefing time, timezone) | ✅ Live |
| Heartbeat monitoring | `cron_job_logs` + `call_proactive_edge_function()` RPC with vault-secured service role | ✅ Live 
|
| Interactive Slack | `slack-interactive` edge function handling `block_actions`, `view_submission`, `shortcut`, 
`message_action` with HITL approval flows | ✅ Live |
| Pre-meeting prep | `proactive-meeting-prep` edge function (2hrs before meetihes attendees, sends Slack) | ✅ Live |
| Pipeline scan | `proactive-pipeline-analysis` edge function (8am daily) | ✅ Live |
| Post-meeting flows | `slack-post-meeting` + `meeting-workflow-notifications` + `extract-action-items` + 
`create-task-from-action-item` | ✅ Live |
| Sequence execution | `sequence_jobs` table with `start_sequence_job()`, `pause_sequence_job()`, `resume_sequence_job()` 
+ `slack_pending_actions` for confirmation | ✅ Live |
| Agent scheduling | `agent-scheduler` edge function with 6 specialist types (pipeline, outreach, research, crm_ops, 
meetings, prospecting) | ✅ Live |
| Morning brief | Dynamic: real calendar data, pipeline deltas via `daily_digest_analyses`, AI priorities via 
`suggest_next_actions` skill, action buttons | ✅ Live |
| Slack webhook handling | Supabase edge functions (not Cloudflare) | ✅ Live |
| Proactive delivery | `_shared/proactive/` with 6 modules (recipients, delivery, dedupe, settings) | ✅ Live |
| Rate limiting | `slack_notifications_sent` table dule | ✅ Live |
| Cost tracking | `costTracking.ts` in `_shared/` with AI cost logging and budget checking | ✅ Live |
| Context loading | `_shared/proactive/` loads org context, user prefs, feature settings | ✅ Live |
| Sequence retry logic | Built into sequence executor | ✅ Live |
| ~30 Slack edge functions | Various capabilities | ✅ Live |
| 75+ shared utility modules | Reusable across functions | ✅ Live |

### The Orchestra is Assembled. There's No Conductor.

The system has 30+ Slack functions, 6 specialist agents, a sequence executor with retry and approval, a proactive delivery
 subsystem, and extensive shared modules. But these pieces run independently. When a meeting ends, the post-meeting 
function fires — but it doesn't automatically chain into "draft follow-up → update CRM → detect commitments → queue 
proposal → notify rep." Each step works in isolation.

---

## What's Genuinely Missing

Seven high-value gaps stand between what exists and the autonomous copilot:

### 1. The Octor that chains existing capabilities into event-driven workflows. When something happens (meeting ends, 
email arrives, rep clicks a button), the orchestrator decides what sequence of existing skills to run, in what order, with
 what context.

**This is the single highest-leverage piece to build.** It unlocks everything else by connecting parts that already work.

### 2. Intent Detection from Transcripts

Transcript processing exists. Action item extraction exists. What doesn't exist is the commitment-phrase-to-event mapping:
 detecting "I'll send you a proposal" and automatically queueing a proposal generation event.

### 3. Calendar Availability Finder

Google Calendar read access exists. What doesn't exist is the "find mutual free slots across two calendars and present 
time options" flow.

### 4. Email Send-as-Rep

Email sync and categorisation exist. Sending emails as the rep through their connected Gmail/O365 account doesn't. This 
requires Gmail API write scope (or O365 equivalent) and is the prerequisite for any automated follow-up delivery.

### 5. Proposal Generation Pipeline

`generate-proposal` edge function exists but isn't wired into the intent-detection → draft → approve → send pipeline.

### 6. Coaching & Trend Analysis

Nothing exists here. Meeting transcript analysis for rep performance, talk ratios, objection handling patterns, win/loss 
correlation.

### 7. Campaign Monitoring Automation

Instantly integration exists for sending. Automated reply handling, performance monitoring, and optimisation 
recommendations don't.

---

## Architecture: The Orchestrator

### Design Principle: Extend, Don't Rebuild

No new queue tables. No new preference tables. No polling heartbeat. Extend `sequence_jobs` with:

```sql
-- Extend sequence_jobs to support event-triggered sequences
ALTER TABLE sequence_jobs ADD COLUMN IF NOT EXISTS event_source TEXT;      -- 'webhook:meetingbaas', 'cron:morning', 
'slack:button', 'orchestrator:chain'
ALTER TABLE sequence_jobs ADD COLUMN IF NOT EXISTS event_chain JSONB;   Links to parent/child sequence_jobs
ALTER TABLE sequence_jobs ADD COLUMN IF NOT EXISTS trigger_payload JSONB;  -- The raw event that started this
```

### How It Works

```
EVENT SOURCE                           ORCHESTRATOR                              EXISTING CAPABILITIES
                                       (single edge function)
                                       
meetingbaas-webhook ──────────┐        ┌──────────────────────┐        ┌──────────────────────────┐
                              │        │                      │        │ extract-action-items      │
proactive-meeting-prep ───────┤        │  1. Receive event    │───────▶│ suggest-next-actions      │
                              │        │  2. Load context     │        │ copywriter skill          │
slack-interactive ──────────── │      proactive/)     │        │ generate-proposal         │
                              │        │  3. Select sequence  │        │ proactive-pipeline-anal.  │
email webhook ────────────────┤        │  4. Chain skills     │        │ proactive-meeting-prep    │
                              │        │  5. Route output     │        │ Slack delivery modules    │
calendar webhook ─────────────┘        │  6. Queue follow-ups │        │ CRM update functions      │
                                       │                      │        │ Apollo / Apify / Instantly│
                                       └──────────────────────┘        │ sequence executor         │
                                                                       └──────────────────────────┘
```

### The Orchestrator Edge s existing capabilities — does NOT duplicate them.

interface OrchestratorEvent {
  type: string                    // 'meeting_ended' | 'email_received' | 'slack_action' | 'pre_meeting' | etc.
  source: string                  // 'webhook:meetingbaas' | 'cron:morning' | 'slack:button_approve' | etc.
  org_id: string
  user_id: string
  payload: Record<string, any>    // Event-specific data
  parent_job_id?: string          // If chained from another sequence
}

interface SequenceState {
  event: OrchestratorEvent
  context: {
    tier1: OrgContext              // Always: org profile, user prefs, ICP (via _shared/proactive/)
    tier2?: ContactContext         // When contact involved: CRM record, meeting history, email threads
    tier3?: Record<string, any>   // On-demand: LinkedIn, company news, templates, campaign metrics
  }
  steps_completed: string[]
  outputs: Record<string, any>    // Skill results keyed by step name
  pending_approvals: Action[]
  queued_followups: OrchestratorEvent[]
}

// Event Sequence mapping
const EVENT_SEQUENCES: Record<string, SequenceStep[]> = {
  
  'meeting_ended': [
    { skill: 'extract-action-items',       requires_context: ['tier1', 'tier2'] },
    { skill: 'detect-intents',             requires_context: ['tier1'] },           // NEW
    { skill: 'suggest-next-actions',       requires_context: ['tier1', 'tier2'] },
    { skill: 'draft-followup-email',       requires_context: ['tier1', 'tier2'], requires_approval: true },
    { skill: 'update-crm-from-meeting',    requires_context: ['tier2'] },
    { skill: 'create-tasks-from-actions',  requires_context: ['tier2'] },
    { skill: 'notify-slack-summary',       requires_context: ['tier1'] },
    // If intents detected, queue follow-up events:
    // "send proposal" → queue 'proposal_generation'
    // "schedule follow-up" → queue 'calendar_find_times'
    // "send pricing" → queue 'pricing_retrieval'
  ],

  'pre_meeting_90min': [
    { skill: 'enrich-attendees',           requires_context: ['tier1', 'tier3:apollo'r3:linkedin'] },
    { skill: 'pull-crm-history',           requires_context: ['tier2'] },
    { skill: 'check-previous-action-items', requires_context: ['tier2'] },
    { skill: 'research-company-news',      requires_context: ['tier3:news'] },
    { skill: 'generate-briefing',          requires_context: ['tier1', 'tier2'] },
    { skill: 'deliver-slack-briefing',     requires_context: ['tier1'] },
  ],

  'email_received': [
    { skill: 'classify-email-intent',      requires_context: ['tier1'] },
    { skill: 'match-to-crm-contact',      requires_context: ['tier2'] },
    // Branch based on classification:
    // 'meeting_request' → queue 'calendar_find_times'
    // 'needs_response' → draft response, send to Slack for approval
    // 'proposal_request' → queue 'proposal_generation'
    // 'fyi' → log, no action
  ],

  'proposal_generation': [
    { skill: 'select-proposal-template',   requires_context: ['tier1', 'tier2'] },
    { skill: 'populate-proposal',          requires_context: ['tier2', 'mplate'] },
    { skill: 'generate-custom-sections',   requires_context: ['tier1', 'tier2'] },
    { skill: 'present-for-review',         requires_context: ['tier1'], requires_approval: true },
    // On approval → email-send-as-rep (Phase 4)
  ],

  'calendar_find_times': [
    { skill: 'parse-scheduling-request',   requires_context: ['tier1'] },
    { skill: 'find-available-slots',       requires_context: ['tier2'] },       // NEW
    { skill: 'present-time-options',       requires_context: ['tier1'], requires_approval: true },
    // On time selected → send calendar invite or email with times
  ],

  'stale_deal_revival': [
    { skill: 'research-trigger-events',    requires_context: ['tier2', 'tier3:news', 'tier3:linkedin'] },
    { skill: 'analyse-stall-reason',       requires_context: ['tier2'] },
    { skill: 'draft-reengagement',         requires_context: ['tier1', 'tier2'], requires_approval: true },
  ],
}
```

### Context Loading: Formalise What Exists

The `_shared/proactive/` modules alreadad most context. Formalise into explicit tiers that the orchestrator calls:

```typescript
// Extend _shared/proactive/ with explicit tier loading

async function loadContext(event: OrchestratorEvent, tiers: string[]): Promise<SequenceState['context']> {
  const context: SequenceState['context'] = { tier1: null }

  // Tier 1 — Always loaded (uses existing _shared/proactive/ modules)
  context.tier1 = {
    org: await loadOrgProfile(event.org_id),           // Existing
    user: await loadUserPreferences(event.user_id),    // Existing: slack_user_preferences + slack_user_mappings
    features: await loadFeatureSettings(event.org_id), // Existing: notification_feature_settings
    icp: await loadICPProfile(event.org_id),           // Existing
    products: await loadProductProfile(event.org_id),  // Existing
    costBudget: await checkCostBudget(event.org_id),   // Existing: costTracking.ts
  }

  // Tier 2 — Per-contact (when event involves a specific contact/deal)
  if (tiers.includes('tier2') && eventload.contact_id) {
    context.tier2 = {
      contact: await loadCRMContact(event.payload.contact_id),
      company: await loadCRMCompany(event.payload.company_id),
      deal: await loadCRMDeal(event.payload.deal_id),
      meetingHistory: await loadMeetingHistory(event.payload.contact_id),
      emailHistory: await loadEmailThread(event.payload.contact_id),
      activities: await loadActivities(event.payload.contact_id),  // Joins on activities table, not 
deals.last_activity_at
    }
  }

  // Tier 3 — On-demand (loaded only when specific skills need them)
  if (tiers.some(t => t.startsWith('tier3:'))) {
    context.tier3 = {}
    if (tiers.includes('tier3:apollo'))    context.tier3.apollo = await enrichViaApollo(event.payload)
    if (tiers.includes('tier3:linkedin'))  context.tier3.linkedin = await enrichViaApify(event.payload)
    if (tiers.includes('tier3:news'))      context.tier3.news = await researchCompanyNews(event.payload)
    if (tiers.includes('tier3:template'))  context.tier3.template = ait loadProposalTemplate(event.payload)
    if (tiers.includes('tier3:campaign'))  context.tier3.campaign = await loadCampaignMetrics(event.payload)
  }

  return context
}
```

### State Flows Through sequence_jobs

Use the existing `sequence_jobs.context` JSONB column for SequenceState — no parallel state system:

```typescript
// When starting an orchestrated sequence:
await startSequenceJob({
  org_id: event.org_id,
  user_id: event.user_id,
  sequence_type: event.type,
  event_source: event.source,                              // NEW column
  trigger_payload: event.payload,                           // NEW column
  event_chain: event.parent_job_id                          // NEW column
    ? { parent: event.parent_job_id }
    : null,
  context: {                                                // Existing column, richer payload
    steps_completed: [],
    outputs: {},
    pending_approvals: [],
    queued_followups: [],
  },
})
```

### Event Routing: No Polling, No New Queue

Every event has a cleatrigger source. No 1-minute heartbeat polling loop:

| Event | Trigger Mechanism | Invokes |
|---|---|---|
| Meeting ended | MeetingBaaS webhook → existing `meetingbaas-webhook` edge function | Calls orchestrator with 
`meeting_ended` |
| Pre-meeting prep | Existing `proactive-meeting-prep` cron (2hrs before) | Upgraded to call orchestrator with 
`pre_meeting_90min` |
| Morning brief | Existing pg_cron → `call_proactive_edge_function()` | Upgraded to use richer Slack blocks |
| Pipeline scan | Existing pg_cron → `proactive-pipeline-analysis` | Upgraded to detect stale deals and chain revival |
| Email received | Gmail/O365 push notification or polling webhook (new) | Calls orchestrator with `email_received` |
| Slack button click | Existing `slack-interactive` edge function | Routes approval to orchestrator to resume paused 
sequence |
| Calendar event created | Google Calendar webhook (new) | Calls orchestrator with `pre_meeting_90min` |
| Sequence step completed | Orchestrator self-invokes | Continues or queues follow-up |

---

## The Seven Builds

### Build 1: The Orchestrator (Weeks 1-2)

The single highest-leverage piece. One new edge function that connects everything.

**New code:**
- `agent-orchestrator` edge function (~500 lines)
- Event-to-sequence mapping config
- Context tier loader (formalising existing `_shared/proactive/` modules)
- Sequence chaining logic (step completes → invoke next, or pause for approval)

**Extend existing:**
- Add `event_source`, `event_chain`, `trigger_payload` columns to `sequence_jobs`
- Upgrade `meetingbaas-webhook` to call orchestrator after transcript processing
- Upgrade `proactive-meeting-prep` to call orchestrator for richer briefing pipeline
- Upgrade `slack-interactive` to route approval actions back to orchestrator (resume paused sequences)
- Upgrade morning brief Slack blocks with the richer format:

```
☀️  Good morning, [Name]. Here's your Thursday.

📅 TODAY'S MEETINGS (3)
├─ 10:00am — Sarah Chen, Acme Corp (Demo follow-up)
│  [Prep ready→]
├─ 1:00pm — Internal: Pipeline review
│  No prep needed
└─ 3:30pm — New: James Wright, TechFlow
   [Prepping now...] [Skip prep]

📧 NEEDS YOUR ATTENTION (2)
├─ David Park (Zenith) replied to your proposal
│  [Draft reply →] [View email →]
└─ Inbound: Lisa Tran requesting a demo
   [Check calendar →] [Qualify first →]

📊 PIPELINE PULSE
├─ 3 deals need action today
├─ 1 deal at risk (Meridian — 18 days no activity)
└─ $42K in proposals awaiting response

✅ OVERNIGHT UPDATES
├─ Campaign "Q1 SaaS Outreach" — 3 replies received
└─ CRM updated: 4 meeting notes synced

[Expand pipeline →] [Show full inbox →]
```

**What this unlocks:** Meeting ends → orchestrator chains extract-action-items → suggest-next-actions → draft follow-up → 
update CRM → notify Slack. All existing pieces, newly connected.

**Done when:** A meeting ends and the rep receives a Slack message within 5 minutes with a follow-up draft, CRM updates 
confirmed, and achestrator.

### Build 2: Intent Detection (Weeks 3-4)

The intelligence layer that makes post-meeting truly proactive.

**New code:**
- `detect-intents` skill (~200 lines) — analyses transcript for commitment phrases
- Intent-to-event mapping config
- Queuing logic: detected intent → new `OrchestratorEvent` added to `queued_followups`

**Intent detection targets:**

| Phrase Pattern | Detected Intent | Queued Event |
|---|---|---|
| "I'll send you a proposal / quote / pricing" | `commitment:send_proposal` | `proposal_generation` |
| "Let's schedule / book / find time for a follow-up" | `commitment:schedule_meeting` | `calendar_find_times` |
| "Can you send me [document/case study/info]?" | `request:send_content` | `content_retrieval` |
| "I need to run this by [name/title]" | `signal:multi_stakeholder` | Flag on deal + notification |
| "We're also looking at [competitor]" | `signal:competitive` | Flag on deal + competitive intel research |
| "Budget is approved / we have budget" | `signal:buying_positiv Update deal stage + notify |
| "Budget is tight / not sure about budget" | `signal:buying_negative` | Flag risk + notify manager |
| "Timeline is [Q2/next month/urgent]" | `signal:timeline` | Update deal properties |
| "I'll get back to you by [date]" | `commitment:prospect_followup` | Create reminder for follow-up if no response |

**Implementation approach:** Single Gemini Flash call with structured JSON output. The transcript is already processed — 
this is an additional analysis pass on the existing transcript text, not a new transcription pipeline.

```typescript
// Prompt structure for intent detection
const INTENT_DETECTION_PROMPT = `
Analyse this meeting transcript for commitments, requests, and buying signals.

Context:
- Our company: {org_profile.company_name}
- Our rep: {user_name}
- Meeting attendees: {attendees}

Return JSON:
{
  "commitments": [
    { "speaker": "rep|prospect", "phrase": "exact quote", "intent": "send_proposal|schedule_meeting|...", "confidence": 
0.0-1.0 }
  ],
  "buying_sigls": [
    { "type": "positive|negative|neutral", "signal": "budget|timeline|authority|need", "phrase": "exact quote", 
"confidence": 0.0-1.0 }
  ],
  "follow_up_items": [
    { "owner": "rep|prospect", "action": "description", "deadline": "if mentioned", "intent_type": "if maps to an event" }
  ]
}

Only include items with confidence > 0.7.
Transcript:
{transcript}
`
```

**Wire into orchestrator:** The `meeting_ended` sequence now includes `detect-intents` as step 2. If intents are detected,
 the orchestrator queues follow-up events:

```typescript
// In the orchestrator, after detect-intents completes:
const intents = state.outputs['detect-intents']

for (const commitment of intents.commitments) {
  if (commitment.speaker === 'rep' && commitment.intent === 'send_proposal') {
    state.queued_followups.push({
      type: 'proposal_generation',
      source: 'orchestrator:chain',
      payload: {
        meeting_id: state.event.payload.meeting_id,
        contact_id: state.context.tier2.contact.id,
        trigger_phrase: commitment.phrase,
      },
      parent_job_id: state.event.job_id,
    })
  }
  // ... similar for other intent types
}
```

**Done when:** Rep says "I'll send you a proposal" in a meeting → 5 minutes later, Slack message: "You mentioned sending a
 proposal to Sarah at Acme. I've drafted one based on today's conversation. [Review draft →] [Edit first →] [Skip]"

### Build 3: Calendar Availability Finder (Weeks 5-6)

**New code:**
- `find-available-slots` skill
- Calendar conflict detection and slot scoring
- Slack time-picker interface
- Calendar invite creation (Google Calendar API write)

**What it does:**
1. Reads rep's Google Calendar for next 5-10 business days
2. Identifies free slots, respecting: existing meetings, buffer preferences (e.g. 15min gap), quiet hours, working hours 
from `slack_user_preferences`
3. If prospect's timezone is known (from CRM or email signature), filters to overlapping business hours
4. Scores slots by preference (morning vs. afternoon, day of week)
5. ts top 3-5 options in Slack:

```
📅 Available times for a 30min call with Sarah Chen (EST):

○ Tomorrow (Thu) 10:00-10:30am GMT / 5:00-5:30am EST ⚠️  early for them
● Tomorrow (Thu) 2:00-2:30pm GMT / 9:00-9:30am EST ✓
● Friday 3:00-3:30pm GMT / 10:00-10:30am EST ✓
● Monday 2:30-3:00pm GMT / 9:30-10:00am EST ✓

[Send these times via email →] [Send calendar invite →] [Show more options →] [I'll handle this →]
```

**Triggered by:**
- Intent detection: "Let's schedule a follow-up"
- Email classification: meeting request detected
- Direct Slack command: "/60 find times for [contact]"
- Morning brief button: "[Check calendar →]" on an inbound meeting request

### Build 4: Email Send-as-Rep (Weeks 7-8)

The prerequisite for any automated email delivery. This is the most sensitive build — it's acting on behalf of the rep.

**New code:**
- Gmail API write integration (requires OAuth scope upgrade to include `gmail.send`)
- O365 send integration (equivalent)
- Email composition from dlogging in CRM activity timeline
- Email tracking (open/click) if applicable

**Technical requirements:**
- OAuth consent screen must clearly request send permission
- Sent emails must appear in rep's "Sent" folder (Gmail API handles this natively)
- Rep's email signature must be appended
- Thread-aware: replies must use correct `In-Reply-To` and `References` headers

**Safety rails (non-negotiable):**
- Every email requires explicit approval via Slack HITL before sending
- No auto-send, ever — even if preferences say "auto-approve"
- Approval message shows full email preview (to, subject, body)
- Undo window: 30 seconds after approval, "Cancel send" button active
- All sends logged in `sequence_jobs` with full audit trail
- Daily send limit per rep (configurable, default 50)

**Approval flow in Slack:**

```
📧 Ready to send follow-up to Sarah Chen:

To: sarah.chen@acme.com
Subject: Great connecting today — next steps on the pilot

Hi Sarah,

Thanks for walking through the Q2 timeline today. A few
th wanted to follow up on...

[truncated — click to expand]

[✅ Send now] [✏️  Edit in use60] [⏰ Send later] [❌ Cancel]
```

**Wire into orchestrator:** The `meeting_ended` sequence's `draft-followup-email` step now has a real destination. On 
approval via `slack-interactive`, the orchestrator resumes the paused sequence and invokes `email-send-as-rep`.

### Build 5: Proposal Pipeline End-to-End (Weeks 7-8, parallel with Build 4)

Wire the existing `generate-proposal` edge function into the orchestrator.

**What exists:** `generate-proposal` edge function, proposal templates, copywriter skill.

**What's new:** The pipeline connecting intent detection → template selection → population → review → send.

**Flow:**
1. Intent detected: "I'll send you a proposal" (from Build 2)
2. Orchestrator queues `proposal_generation` event
3. Select template based on deal type, stage, and discussed features
4. Populate with: company name, contact details, discussed requirements, pricing tier, relevant case ststom sections: 
executive summary referencing specific conversation points, ROI projections based on discussed pain points
6. Present in Slack for review with link to full document
7. On approval: send via email (Build 4) or generate shareable link

**Depends on:** Build 2 (intent detection), Build 4 (email send — for delivery, though link sharing works without it).

### Build 6: Campaign Monitoring (Weeks 9-10)

**What exists:** Instantly integration for campaign creation and contact adding.

**New code:**
- `monitor-campaigns` skill — pulls campaign metrics from Instantly API
- Reply classifier — categorises replies (positive/negative/out-of-office/unsubscribe)
- Performance analyser — open/click/reply rates vs. benchmarks
- Response drafter — drafts replies to positive responses
- Alert generator — flags underperforming campaigns

**Triggered by:** Daily cron (morning or mid-morning)

**Output to Slack:**

```
📊 Campaign Update: "Q1 SaaS Outreach"

Performance (last 24hrs):
├─ Sent: 45  | Clicked: 8 (18%) | Replied: 3 (7%)
├─ Trend: Open rate ↑ 4% vs. last week

💬 REPLIES NEEDING ATTENTION (3)
├─ ✅ James Wright (TechFlow) — Interested, asking about pricing
│  [Draft response →] [View thread →]
├─ ⚠️  Maria Santos (DataPeak) — Forwarded to colleague
│  [Update contact →] [Draft follow-up →]
└─ ❌ Tom Harris (Nexus) — Not interested
   [Mark closed →] [Add to nurture →]

💡 SUGGESTION: Subject line B ("Cut your pipeline admin by 5hrs/week") 
is outperforming A by 12%. Consider switching all remaining sends.
[Apply suggestion →] [Keep testing →]
```

### Build 7: Coaching & Trend Analysis (Weeks 11-12)

The only capability with zero existing foundation. Built from scratch.

**New code:**
- `analyse-meeting-patterns` skill — processes multiple transcripts for patterns
- Talk ratio calculator (rep vs. prospect speaking time)
- Question quality scorer (discovery depth, open vs. closed questions)
- Objection handling analyser (detected objor (meeting behaviours in won vs. lost deals)
- Coaching digest generator
- `coaching_analyses` table for storing historical analysis

**Frequency options (from `agent_preferences`):**
- Per-meeting micro-feedback (quick, 2-3 bullet points after each meeting)
- Weekly coaching digest (comprehensive, pattern analysis)
- Both

**Weekly digest to Slack:**

```
🎯 Weekly Coaching Digest — [Rep Name]

📊 THIS WEEK'S NUMBERS
├─ 8 external meetings | 4 follow-ups sent within 10min ✓
├─ Talk ratio: 62% you / 38% prospect (target: 40/60) ⚠️
└─ Discovery questions per meeting: 4.2 avg (target: 6+)

📈 IMPROVING
├─ Objection handling — 3/4 objections addressed with evidence this week (was 1/4 last week)
└─ Meeting prep usage — viewed 7/8 briefings before meetings

⚠️  FOCUS AREA
├─ You're talking more than listening. In your TechFlow call, you spoke for 
│  8 minutes straight during the demo. Sarah asked a question at minute 3 
│  that went unanswered until minute 9.
�es so far?"

🏆 WINNING PATTERN
Your closed deals this month all had one thing in common: you asked about 
their current process in the first 5 minutes. In the 2 deals that stalled, 
you jumped to features before minute 10.

[View detailed analysis →] [Adjust coaching preferences →]
```

**Per-meeting micro-feedback:**

```
💡 Quick feedback on your Acme Corp call:

├─ ✅ Strong opening — asked about their challenges first
├─ ⚠️  Missed Sarah's budget concern at 14:23 — she said "we're being careful 
│     with spend this quarter" and you moved to features
└─ 💡 James asked "how does this compare to [competitor]?" — next time, 
      try acknowledging before redirecting

Overall: Good discovery, stronger close needed.
```

---

## HITL Patterns (Using Existing `slack_pending_actions`)

All patterns use the existing `slack-interactive` edge function and `slack_pending_actions` table. The orchestrator pauses
 the sequence at approval points and resumes when the rep acts.

### ls, proposals)

```
[✅ Send] [✏️  Edit] [❌ Skip] [💬 Feedback]
```

On button click → `slack-interactive` → update `slack_pending_actions` → orchestrator resumes sequence → execute or skip.

### Pattern 2: Choose from Options (scheduling, prioritisation)

```
○ Option A   ● Option B   ○ Option C
[Confirm selection →]
```

### Pattern 3: Batch Review (pipeline actions, leads)

```
1. Deal A  [Action →] [Skip]
2. Deal B  [Action →] [Skip]
[Handle all →] [Dismiss]
```

### Pattern 4: Inform Only (CRM updates, enrichment)

```
✅ Updates completed. No action needed.
```

---

## Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Time from meeting end to follow-up sent | < 10 minutes | `sequence_jobs` timestamps |
| Pre-meeting briefs delivered on time | > 95% | Delivery time vs. meeting start |
| CRM update completeness after meetings | > 90% of fields | Before/after comparison |
| Proactive suggestion acceptance rate | > 40% | Approved / total in `slack_pending_** | < 15% | Irrelevant suggestions 
dismissed / total | 
| Rep time saved per week | 5+ hours | Task audit + survey |
| Action button engagement | > 60% | Clicked / delivered |
| Intent detection accuracy | > 80% | Manual review sample |
| Stale deals re-engaged per week | 3+ per rep | Revival events actioned |
| Scheduling requests handled | > 70% | Agent-handled / total |

**False positive rate is the trust killer.** If the agent suggests irrelevant actions more than 15% of the time, reps stop
 reading the messages. Measure this from day one and optimise for precision over recall — it's better to miss a signal 
than to waste a rep's attention.

---

## Technical Constraints & Notes

- **`deals` table has no `last_activity_at`** — stale deal detection must join on the `activities` table. Pipeline scan 
queries reference activities, not a deal column.
- **Cost tracking** — all AI calls route through existing `costTracking.ts` in `_shared/`. The orchestrator must call 
`checkCostBudget()` before each AI-ine step and halt if budget exceeded.
- **Rate limiting** — existing `slack_notifications_sent` + `dedupe.ts` handles Slack rate limiting. Orchestrator respects
 quiet hours from `slack_user_preferences`.
- **Edge function timeout** — 150s. Long sequences must be broken into steps that each complete within timeout. The 
orchestrator self-invokes for multi-step sequences (each step is a separate edge function call, state persisted in 
`sequence_jobs.context`).
- **No Cloudflare Worker** — everything runs in Supabase edge functions. Slack's 3s response requirement handled by 
immediate acknowledgement + async processing (existing pattern in `slack-interactive`).

---

## Build Order Summary

| Phase | Build | Weeks | Dependencies |
|---|---|---|---|
| 1 | **Orchestrator** — connect existing pieces | 1-2 | None |
| 2 | **Intent Detection** — transcript commitment mapping | 3-4 | Phase 1 |
| 3 | **Calendar Finder** — availability + scheduling flow | 5-6 | Phase 1 |
| 4 | **Email Send-as-Rep** — Gmail/O3 | Phase 1 |
| 5 | **Proposal Pipeline** — end-to-end wiring | 7-8 | Phase 1, 2 |
| 6 | **Campaign Monitoring** — Instantly reply handling | 9-10 | Phase 1 |
| 7 | **Coaching** — meeting pattern analysis | 11-12 | Phase 2 |

Phases 4 and 5 run in parallel. Each phase builds on the orchestrator (Phase 1), which is why it's the critical path.

---

## What We're NOT Building

- Real-time meeting coaching (post-meeting only)
- Salesforce integration (HubSpot first)
- Voice interface (Slack and email only)
- Multi-language (English only)
- Fine-tuned models (foundation models + good prompts)
- Chrome extension (architecturally ready, not building now)
- New database tables for things that already have tables

---

*The orchestra is assembled. Time to hire the conductor.* 

⏺ This is a dramatically better plan. The "extend, don't rebuild" philosophy is applied consistently and the architecture 
  is grounded in reality. Here's a detailed review.
                                                                                                                          
  ---                                                                                                             
  What's Strong                                                                                                           
                                                                                                                          
  1. The framing is honest. Starting with "what actually exists" and identifying exactly 7 gaps is disciplined. No phantom
   infrastructure to build.

  2. Extending sequence_jobs is the right call. Three new columns (event_source, event_chain, trigger_payload) on an
  existing table with existing RPC functions (start_sequence_job, pause_sequence_job, resume_sequence_job) is far better
  than a parallel queue system. The state management through sequence_jobs.context JSONB reuses proven infrastructure.

  3. Event routing without polling is correct. Every event has a clear trigger source. No wasted edge function cold starts
   from a 1-minute heartbeat.

  4. The false positive metric. Most agent plans forget this. The "< 15% irrelevant suggestions" target and the principle
  "precision over recall" will protect trust.

  5. Email safety rails are exactly right. "No auto-send, ever" is the correct default for a product that sends emails on
  behalf of a salesperson. The 30-second undo window, daily send limits, and full audit trail are non-negotiable and
  you've included all of them.

  6. Build order and dependency chains are clean. Orchestrator first, everything else plugs in. Phases 4 and 5 parallelise
   correctly.

  ---
  What Needs Refinement

  1. The Orchestrator Self-Invocation Pattern Needs More Detail

  The plan says:

  "Long sequences must be broken into steps that each complete within timeout. The orchestrator self-invokes for
  multi-step sequences."

  This is the right approach but the hardest part of the whole plan to get right. Specific questions that need answers
  before building:

  a) How does the orchestrator resume after self-invocation?

  The meeting_ended sequence has 7 steps. If each step takes 10-20s (AI call + DB write), you're at 70-140s — right at the
   150s edge function limit. The self-invocation needs to be explicit:

  // After each step completes:
  if (timeRemaining < SAFETY_MARGIN) {
    // Persist state to sequence_jobs.context
    await updateSequenceJobStep(jobId, {
      steps_completed: [...state.steps_completed, currentStep],
      outputs: { ...state.outputs, [currentStep]: result }
    })
    // Self-invoke with the job_id to continue
    await fetch(`${SUPABASE_URL}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ resume_job_id: jobId })
    })
    return // Exit current invocation
  }

  The plan should specify the SAFETY_MARGIN (suggest 30s) and document that each step must be independently resumable —
  meaning no step should depend on in-memory state from a previous step within the same invocation.

  b) What happens on partial failure?

  Step 3 fails. Steps 1-2 succeeded (action items extracted, intents detected). Does the orchestrator:
  - Retry step 3 only? (correct for transient errors)
  - Skip step 3 and continue? (correct if non-critical)
  - Halt the whole sequence? (correct if step 3 is blocking)

  The sequenceExecutor.ts already has retry logic with transient error detection. The orchestrator should classify each
  step as critical or best-effort:

  { skill: 'extract-action-items',    criticality: 'critical' },    // Must succeed
  { skill: 'detect-intents',          criticality: 'best-effort' }, // Nice to have
  { skill: 'draft-followup-email',    criticality: 'critical' },    // Core value
  { skill: 'update-crm-from-meeting', criticality: 'best-effort' }, // Can retry later

  c) Concurrency control

  What if MeetingBaaS sends the webhook twice (they do, sometimes)? Or the orchestrator self-invokes but the previous
  invocation hasn't finished? You need idempotency per event:

  -- Add to sequence_jobs
  ALTER TABLE sequence_jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

  The idempotency key would be {event_type}:{event_id} (e.g., meeting_ended:meeting-uuid-123). If a job with that key
  already exists and isn't failed, skip.

  2. The Skills Referenced Don't All Exist as Callable Units

  The EVENT_SEQUENCES map references skills like:

  Referenced Skill: extract-action-items
  Actually Exists As: Edge function extract-action-items
  ────────────────────────────────────────
  Referenced Skill: suggest-next-actions
  Actually Exists As: Edge function suggest-next-actions
  ────────────────────────────────────────
  Referenced Skill: detect-intents
  Actually Exists As: Doesn't exist yet (Build 2)
  ────────────────────────────────────────
  Referenced Skill: draft-followup-email
  Actually Exists As: Copywriter skill exists, but not as a standalone callable function with this interface
  ────────────────────────────────────────
  Referenced Skill: update-crm-from-meeting
  Actually Exists As: Partial — meeting-workflow-notifications does some CRM updates, but not a clean standalone skill
  ────────────────────────────────────────
  Referenced Skill: create-tasks-from-actions
  Actually Exists As: Edge function create-task-from-action-item (singular — handles one at a time)
  ────────────────────────────────────────
  Referenced Skill: enrich-attendees
  Actually Exists As: apollo-enrich exists, but no unified "enrich all attendees" wrapper
  ────────────────────────────────────────
  Referenced Skill: find-available-slots
  Actually Exists As: Doesn't exist yet (Build 3)
  ────────────────────────────────────────
  Referenced Skill: classify-email-intent
  Actually Exists As: categorize-email exists but may need different interface

  The plan should include a skill adapter inventory in Build 1 — a clear list of which existing edge functions need thin
  wrappers to conform to the orchestrator's SequenceStep interface vs. which genuinely need to be written. This is
  probably 30-40% of Build 1's actual work and it's not currently scoped.

  3. Context Size and Cost

  Loading tier1 + tier2 for every step in a 7-step sequence means 7 separate context loads. If meeting history + email
  threads + activities is 5K tokens per load, that's 35K tokens of context alone across the sequence — before any AI
  processing.

  Two optimisations to consider:

  a) Load context once, pass by reference

  Load context at the start of the sequence, store it in sequence_jobs.context, and pass it to each step. Don't re-load
  for every step. The tiered system already supports this — just make it explicit that tier1 and tier2 load once, not
  per-step.

  b) Budget gate at sequence start, not per-step

  Rather than checking costBudget before each AI step (7 checks), estimate the full sequence cost upfront and gate once.
  If the budget allows "meeting_ended" (estimated ~$0.15 in AI calls), proceed. If not, skip or degrade gracefully. This
  is simpler and avoids the awkward state of "steps 1-4 completed but step 5 hit budget limit."

  4. OAuth Re-Authorization for Email Send (Build 4)

  The plan correctly identifies that gmail.send scope is needed, but doesn't address the migration path. Users who
  connected Gmail with read-only scope will need to re-authorize. This means:

  - A UI prompt in the app: "To enable automated follow-ups, we need send permission for your Gmail"
  - The OAuth consent screen will now show a scarier permission
  - Some users will refuse (and that's fine — the feature degrades gracefully)
  - The google_calendar_tokens or equivalent table needs a scopes column to track what each user has authorized

  This should be called out as a prerequisite sub-task within Build 4, not discovered during implementation.

  5. Stale Deal Query Performance

  The plan correctly notes that deals has no last_activity_at. But the stale deal detection query — joining deals to
  activities to find the most recent activity per deal — could be expensive at scale. For an org with 500 deals and 50K
  activities, this is a full table scan on activities.

  Consider adding a materialized view or a denormalized column as part of Build 1:

  -- Option A: Materialized view (refresh daily via cron)
  CREATE MATERIALIZED VIEW deal_last_activity AS
  SELECT d.id as deal_id, MAX(a.created_at) as last_activity_at
  FROM deals d
  LEFT JOIN activities a ON a.deal_id = d.id
  GROUP BY d.id;

  -- Option B: Trigger-maintained column on deals (more complex but real-time)

  Option A is simpler and the daily refresh is fine for stale deal detection (you're looking at 14+ day gaps).

  6. The agent_preferences Table is Referenced but Doesn't Exist

  Build 7 (coaching) references agent_preferences for coaching frequency:

  "Frequency options (from agent_preferences): per-meeting micro-feedback, weekly coaching digest"

  But this table doesn't exist — it was in v1's design and deliberately removed from v2. The coaching frequency preference
   should go into the existing slack_user_preferences or notification_feature_settings tables. Either add columns or use
  the existing JSONB metadata column.

  ---
  Minor Issues

  - The morning brief Slack blocks mock uses emoji icons. Your CLAUDE.md says "never use emoji icons in the UI — always
  use Lucide React icons." Slack is a different context (no Lucide in Block Kit), but worth noting the intentional
  exception.
  - Build 5 (Proposal Pipeline) depends on Build 4 (Email Send) for delivery, but the plan says they run in parallel. This
   is fine if you build proposal review/approve first and wire email delivery later — but the "done when" criteria for
  Build 5 should clarify whether "send" means email or shareable link.
  - The coaching_analyses table in Build 7 is the one genuinely new table in the plan. It needs a schema definition — even
   a rough one — since everything else reuses existing tables.
  - Build 6 (Campaign Monitoring) references Instantly API for metrics. Verify the Instantly API actually exposes
  campaign-level open/click/reply rates. Some ESPs require webhook-based tracking rather than API polling.

  ---
  Overall Assessment

  This is a buildable plan. The v1-to-v2 improvement is substantial — you've gone from "12 weeks of infrastructure +
  features" to "2 weeks of orchestration + 10 weeks of features on top." The extend-don't-rebuild principle is
  consistently applied.

  The critical path item is Build 1 (Orchestrator), specifically:
  1. The self-invocation and state persistence pattern
  2. The skill adapter inventory (wrapping existing edge functions)
  3. Idempotency handling for duplicate events

  If those three are nailed, Builds 2-7 are relatively straightforward feature work that plugs into a solid foundation.

  My recommendation: Treat weeks 1-2 as two sub-phases:
  - Week 1: Skill adapter inventory + migration (ALTER TABLE sequence_jobs) + orchestrator skeleton with one sequence
  (meeting_ended, even if some steps are stubs)
  - Week 2: Wire real event sources (meetingbaas-webhook, slack-interactive, proactive-meeting-prep) + morning brief
  upgrade + idempotency + error recovery

  That gives you a working orchestrator processing real events by end of week 2, with the meeting_ended chain as the proof
   point.