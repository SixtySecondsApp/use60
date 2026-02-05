# use60 Agent Sequences Architecture

## Overview

This document defines the core sequences for 60, the AI sales agent, along with the context engineering principles that ensure reliable, efficient execution across multi-step workflows.

---

## Part 1: Context Engineering Principles

### The Problem

Agent sequences loop through multiple skills. Each loop adds tool calls and results to context. Without careful management, token accumulation causes:

- Model drift and inconsistent reasoning
- Hallucinated next steps
- Invalid tool calls
- Performance degradation

**The goal:** Keep context in the optimal window. More tokens ≠ more intelligence past a threshold.

---

### Core Principles

#### 1. Compaction: Pointers, Not Payloads

Store full data externally. Pass references and summaries in context.

**Bad:**
```
Skill: Transcription
Result: [Full 8,000 word transcript in context]
```

**Good:**
```
Skill: Transcription
Result: {
  "transcript_ref": "s3://transcripts/meeting-abc123.json",
  "summary": "45 min call with Sarah Chen (VP Sales) at Acme...",
  "key_quotes": ["We need ROI within 90 days", "The Gong overlap concerns me"],
  "duration_mins": 45,
  "speakers": ["Andrew", "Sarah Chen", "Tom (RevOps)"]
}
```

The downstream skill can fetch full data if needed. The orchestrator only sees the summary.

---

#### 2. Isolation: Results, Not Context Dumps

Sub-agents (skills) return structured outputs via a contract. They do not expose their reasoning chains or intermediate state.

**Rule:** Don't communicate by sharing memory. Share memory by communicating.

Each skill receives what it needs, processes internally, returns only the output contract.

---

#### 3. Offloading: Hierarchical Action Space

Don't give the orchestrator 30 tools. Give it categories that expand when needed.

**Level 1 - Orchestrator Tools:**
```
research(target, depth)
enrich(contact_or_company)
draft(type, context)
crm_action(action, entity)
notify(channel, message)
execute(action_type, params)
```

**Level 2 - Internal Routing:**
`research()` internally dispatches to:
- apollo_company_search
- apollo_contact_search
- apify_linkedin_profile
- apify_linkedin_posts
- gemini_news_search

The orchestrator says "research Acme Corp, depth: full" — it doesn't manage individual tools.

---

#### 4. Mutable State, Not Append-Only History

Maintain a sequence state object that gets **updated**, not a conversation history that gets **appended**.

Each skill reads state → does work → updates relevant fields.

---

#### 5. Cache-Friendly Prompt Structure

**Stable prefix (cached):**
- Agent identity and personality
- Skill definitions and output contracts
- Sequence definitions
- Rules and constraints

**Dynamic suffix (injected per-request):**
- Current user context
- Sequence state object
- Immediate task parameters

The stable prefix caches across requests. Dynamic content is minimal and structured.

---

### Token Budget Guidelines

| Component | Token Budget | Notes |
|-----------|--------------|-------|
| System prompt (stable) | ~2,000 | Cached, doesn't compound |
| Sequence state object | ~500 | Compact, updated not appended |
| Current skill context | ~1,000 | What this skill needs |
| Skill result | ~300 | Structured output only |
| **Per-step total** | ~3,800 | Target ceiling |

After 6 skills: ~5,000 tokens accumulated vs 50,000+ with naive approach.

---

## Part 2: Core Interfaces

### SkillResult Interface

Every skill returns this contract. No exceptions.

```typescript
interface SkillResult {
  // Execution status
  status: "success" | "partial" | "failed"
  error?: string                          // Only if status !== "success"
  
  // Human-readable summary (<100 words)
  summary: string
  
  // Machine-readable structured output
  data: Record<string, any>
  
  // Pointers to full payloads stored externally
  references: Reference[]
  
  // Optional hints for orchestrator
  hints?: {
    suggested_next_skills?: string[]
    confidence?: number                   // 0-1 scale
    flags?: string[]                      // "needs_human_review", "high_value", "risk_detected"
  }
  
  // Metadata
  meta: {
    skill_id: string
    skill_version: string
    execution_time_ms: number
    tokens_used?: number
  }
}

interface Reference {
  type: "transcript" | "enrichment" | "draft" | "analysis" | "raw_response"
  location: string                        // s3://bucket/path or internal ref
  summary?: string                        // Optional preview
  size_bytes?: number
}
```

---

### Skill Output Examples

**Transcription Skill:**
```json
{
  "status": "success",
  "summary": "45 min sales call with Sarah Chen (VP Sales) and Tom Rivera (RevOps) at Acme Corp. Discussed pricing, Gong integration concerns, and 90-day ROI requirements.",
  "data": {
    "duration_mins": 45,
    "speakers": [
      {"name": "Andrew", "role": "internal", "talk_time_pct": 35},
      {"name": "Sarah Chen", "role": "VP Sales", "talk_time_pct": 45},
      {"name": "Tom Rivera", "role": "RevOps", "talk_time_pct": 20}
    ],
    "key_quotes": [
      {"speaker": "Sarah Chen", "text": "We need to see ROI within 90 days", "timestamp": "12:34"},
      {"speaker": "Tom Rivera", "text": "How does this sit alongside Gong?", "timestamp": "23:45"}
    ],
    "topics_discussed": ["pricing", "integration", "timeline", "competition"],
    "sentiment": "positive_with_concerns"
  },
  "references": [
    {"type": "transcript", "location": "s3://transcripts/meeting-abc123.json", "size_bytes": 45000}
  ],
  "hints": {
    "flags": ["competitor_mentioned"]
  },
  "meta": {
    "skill_id": "transcription",
    "skill_version": "1.2.0",
    "execution_time_ms": 3400
  }
}
```

**Apollo Enrichment Skill:**
```json
{
  "status": "success",
  "summary": "Acme Corp: B2B SaaS, 85 employees, Series B ($12M). Tech stack includes HubSpot, Gong, Outreach. Currently hiring 3 sales roles - strong expansion signal.",
  "data": {
    "company": {
      "name": "Acme Corp",
      "industry": "B2B SaaS",
      "employee_count": 85,
      "funding_stage": "Series B",
      "funding_amount": 12000000,
      "location": "San Francisco, CA"
    },
    "tech_stack": ["HubSpot", "Gong", "Outreach", "Salesforce"],
    "signals": {
      "hiring": ["SDR", "SDR", "Sales Ops"],
      "news": ["DACH expansion announced"],
      "growth_indicators": ["headcount_up_20pct_yoy"]
    },
    "icp_score": 0.85,
    "icp_match_reasons": ["right_size", "right_stack", "growth_mode"]
  },
  "references": [
    {"type": "enrichment", "location": "s3://enrichment/acme-corp-full.json"}
  ],
  "meta": {
    "skill_id": "apollo_enrichment",
    "skill_version": "2.0.1",
    "execution_time_ms": 1200
  }
}
```

**Meeting Analyzer Skill:**
```json
{
  "status": "success",
  "summary": "Positive discovery call. Two clear objections (Gong overlap, ROI timeline). Three action items identified. Deal stage signal: Evaluation. Recommend technical deep-dive as next step.",
  "data": {
    "meeting_type": "discovery",
    "overall_sentiment": "positive",
    "buying_signals": [
      {"signal": "Asked about implementation timeline", "strength": "strong"},
      {"signal": "Mentioned budget approval process", "strength": "moderate"}
    ],
    "objections": [
      {"objection": "Gong overlap concern", "severity": "medium", "addressed": false},
      {"objection": "90-day ROI requirement", "severity": "high", "addressed": "partially"}
    ],
    "action_items": [
      {"owner": "internal", "task": "Send proposal with ROI projections", "due": "48h"},
      {"owner": "internal", "task": "Schedule technical deep-dive with Tom", "due": "1w"},
      {"owner": "prospect", "task": "Share current Gong workflow", "due": "before_next_call"}
    ],
    "stakeholders": [
      {"name": "Sarah Chen", "role": "VP Sales", "stance": "champion", "influence": "decision_maker"},
      {"name": "Tom Rivera", "role": "RevOps", "stance": "neutral", "influence": "technical_evaluator"}
    ],
    "deal_stage_signal": "evaluation",
    "next_step_recommendation": "technical_deep_dive",
    "risk_flags": []
  },
  "references": [
    {"type": "analysis", "location": "s3://analysis/meeting-abc123.json"}
  ],
  "hints": {
    "suggested_next_skills": ["follow_up_drafter", "crm_updater"],
    "confidence": 0.88
  },
  "meta": {
    "skill_id": "meeting_analyzer",
    "skill_version": "1.5.0",
    "execution_time_ms": 2100
  }
}
```

**Copywriter Skill (Follow-up Draft):**
```json
{
  "status": "success",
  "summary": "Follow-up email drafted. Addresses Gong concern directly, references ROI discussion, proposes technical session. Tone: professional, consultative.",
  "data": {
    "draft_type": "follow_up_email",
    "subject": "Next steps + addressing the Gong question",
    "preview": "Hi Sarah, Thanks for the conversation today. I wanted to address Tom's question about Gong directly...",
    "word_count": 180,
    "tone": "consultative",
    "personalization_elements": ["referenced_gong_concern", "mentioned_90_day_roi", "named_tom"],
    "cta": "book_technical_session"
  },
  "references": [
    {"type": "draft", "location": "s3://drafts/abc123-followup.md"}
  ],
  "hints": {
    "flags": ["needs_human_review"],
    "confidence": 0.82
  },
  "meta": {
    "skill_id": "copywriter",
    "skill_version": "3.1.0",
    "execution_time_ms": 1800
  }
}
```

---

### Sequence State Object

The orchestrator maintains this mutable state throughout sequence execution.

```typescript
interface SequenceState {
  // Sequence identity
  sequence_id: string
  sequence_type: SequenceType
  instance_id: string                     // Unique execution ID
  
  // Trigger context
  trigger: {
    type: string
    timestamp: string                     // ISO 8601
    source: string
    params: Record<string, any>
  }
  
  // Execution tracking
  execution: {
    started_at: string
    current_step: number
    total_steps: number
    completed_skills: string[]
    pending_skills: string[]
    failed_skills: FailedSkill[]
  }
  
  // Accumulated state (compact summaries, not full payloads)
  context: {
    // Entities involved
    entities: {
      contacts: ContactSummary[]
      companies: CompanySummary[]
      deals: DealSummary[]
    }
    
    // Key findings (skill outputs rolled up)
    findings: {
      key_facts: string[]                 // Bullet points, max 10
      action_items: ActionItem[]
      risks: Risk[]
      opportunities: Opportunity[]
    }
    
    // References to full data
    references: Reference[]
  }
  
  // Human-in-the-loop state
  approval: {
    required: boolean
    status: "not_required" | "pending" | "approved" | "rejected" | "modified"
    requested_at?: string
    responded_at?: string
    channel?: "slack" | "email" | "app"
    modifications?: string                // If user edited before approving
  }
  
  // Outputs ready for delivery
  outputs: {
    drafts: DraftOutput[]
    notifications: NotificationOutput[]
    crm_updates: CRMUpdate[]
    tasks_created: Task[]
  }
}

type SequenceType = 
  | "post_meeting_intelligence"
  | "daily_pipeline_pulse"
  | "pre_meeting_prep"
  | "stalled_deal_revival"
  | "prospect_to_campaign"
  | "inbound_qualification"
  | "champion_job_change"
  | "event_follow_up"

interface ContactSummary {
  id: string
  name: string
  role: string
  company: string
  stance?: "champion" | "neutral" | "blocker" | "unknown"
  last_contact?: string
}

interface CompanySummary {
  id: string
  name: string
  size: number
  industry: string
  icp_score: number
  key_signals: string[]
}

interface DealSummary {
  id: string
  name: string
  value: number
  stage: string
  days_in_stage: number
  health: "on_track" | "at_risk" | "stalled"
}

interface ActionItem {
  task: string
  owner: "internal" | "prospect"
  due: string
  priority: "high" | "medium" | "low"
  status: "pending" | "completed" | "blocked"
}

interface Risk {
  type: string
  description: string
  severity: "high" | "medium" | "low"
  mitigation?: string
}

interface Opportunity {
  type: string
  description: string
  potential_value?: number
}

interface FailedSkill {
  skill_id: string
  error: string
  recoverable: boolean
  attempted_at: string
}

interface DraftOutput {
  type: "email" | "linkedin" | "slack" | "call_script"
  reference: string
  summary: string
  status: "draft" | "approved" | "sent"
}

interface NotificationOutput {
  channel: "slack" | "email"
  recipient: string
  message_ref: string
  status: "pending" | "sent" | "failed"
}

interface CRMUpdate {
  entity_type: "contact" | "company" | "deal" | "activity"
  entity_id: string
  fields_updated: string[]
  status: "pending" | "applied" | "failed"
}

interface Task {
  id: string
  title: string
  due_date: string
  assigned_to: string
  crm_task_id?: string
}
```

---

### Sequence State Example

Post-Meeting Intelligence sequence, mid-execution:

```json
{
  "sequence_id": "post_meeting_intelligence",
  "sequence_type": "post_meeting_intelligence",
  "instance_id": "pmi-2025-01-04-abc123",
  
  "trigger": {
    "type": "meeting_recording_processed",
    "timestamp": "2025-01-04T14:45:00Z",
    "source": "meetingbaas_webhook",
    "params": {
      "meeting_id": "abc123",
      "calendar_event_id": "cal_xyz789",
      "recording_url": "s3://recordings/abc123.mp4"
    }
  },
  
  "execution": {
    "started_at": "2025-01-04T14:45:02Z",
    "current_step": 5,
    "total_steps": 7,
    "completed_skills": ["transcription", "meeting_analyzer", "crm_updater", "follow_up_drafter"],
    "pending_skills": ["slack_presenter", "executor", "manager_alert"],
    "failed_skills": []
  },
  
  "context": {
    "entities": {
      "contacts": [
        {"id": "con_123", "name": "Sarah Chen", "role": "VP Sales", "company": "Acme Corp", "stance": "champion"},
        {"id": "con_456", "name": "Tom Rivera", "role": "RevOps", "company": "Acme Corp", "stance": "neutral"}
      ],
      "companies": [
        {"id": "comp_789", "name": "Acme Corp", "size": 85, "industry": "B2B SaaS", "icp_score": 0.85, "key_signals": ["Series B", "hiring sales", "DACH expansion"]}
      ],
      "deals": [
        {"id": "deal_abc", "name": "Acme Corp - use60", "value": 45000, "stage": "Evaluation", "days_in_stage": 0, "health": "on_track"}
      ]
    },
    
    "findings": {
      "key_facts": [
        "45 min discovery call, positive sentiment",
        "Sarah is champion, Tom is technical evaluator",
        "Using Gong currently - overlap concern raised",
        "90-day ROI requirement mentioned",
        "Budget approval needed from Sarah's boss"
      ],
      "action_items": [
        {"task": "Send proposal with ROI projections", "owner": "internal", "due": "48h", "priority": "high", "status": "pending"},
        {"task": "Schedule technical deep-dive with Tom", "owner": "internal", "due": "1w", "priority": "medium", "status": "pending"}
      ],
      "risks": [
        {"type": "competitor", "description": "Gong overlap concern not fully addressed", "severity": "medium", "mitigation": "Position as complementary in follow-up"}
      ],
      "opportunities": [
        {"type": "expansion", "description": "DACH expansion could mean multi-region deal", "potential_value": 90000}
      ]
    },
    
    "references": [
      {"type": "transcript", "location": "s3://transcripts/abc123.json"},
      {"type": "analysis", "location": "s3://analysis/abc123.json"},
      {"type": "draft", "location": "s3://drafts/abc123-followup.md"}
    ]
  },
  
  "approval": {
    "required": true,
    "status": "pending",
    "requested_at": null,
    "channel": "slack"
  },
  
  "outputs": {
    "drafts": [
      {"type": "email", "reference": "s3://drafts/abc123-followup.md", "summary": "Follow-up addressing Gong concern, proposing technical session", "status": "draft"}
    ],
    "notifications": [],
    "crm_updates": [
      {"entity_type": "deal", "entity_id": "deal_abc", "fields_updated": ["stage", "notes", "next_step"], "status": "applied"},
      {"entity_type": "activity", "entity_id": "act_new", "fields_updated": ["meeting_notes"], "status": "applied"}
    ],
    "tasks_created": []
  }
}
```

---

## Part 3: Core Sequences

### Sequence 1: Post-Meeting Intelligence

**Purpose:** Transform every sales meeting into structured CRM updates, personalized follow-ups, and actionable next steps — automatically.

**Trigger:** Meeting recording processed (MeetingBaaS webhook)

**Skills Pipeline:**

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | Transcription | recording_url | transcript_ref, speakers, duration, key_quotes |
| 2 | Meeting Analyzer | transcript_ref, deal_context | sentiment, objections, buying_signals, action_items, stakeholders, stage_signal |
| 3 | CRM Updater | analysis_data, deal_id | fields_updated, activity_logged |
| 4 | Follow-up Drafter | analysis_data, contact_context | draft_ref, personalization_elements |
| 5 | Slack Presenter | full_state | approval_request_sent |
| 6 | Executor | approved_actions | emails_sent, tasks_created, meetings_booked |
| 7 | Manager Alert (conditional) | risk_flags | notification_sent |

**Trigger Conditions for Manager Alert:**
- Competitor mentioned
- Deal value > £30k and risk detected
- Close date at risk
- Champion sentiment shifted negative

**Slack Approval Message:**

```
📞 Meeting Summary: Acme Corp

ATTENDEES
Sarah Chen (VP Sales) • Tom Rivera (RevOps)

KEY TAKEAWAYS
━━━━━━━━━━━━━
✓ Positive discovery call - Sarah is champion
⚠️ Gong overlap concern raised by Tom
⚠️ 90-day ROI requirement 
✓ Budget approval process discussed

ACTION ITEMS
━━━━━━━━━━━━
You:
• Send proposal with ROI projections (48h)
• Schedule technical deep-dive with Tom (1w)

Them:
• Share current Gong workflow (before next call)

CRM UPDATES APPLIED
━━━━━━━━━━━━━━━━━━
✓ Deal stage → Evaluation
✓ Meeting notes logged
✓ Next step updated

FOLLOW-UP DRAFT READY
━━━━━━━━━━━━━━━━━━━━
Subject: Next steps + addressing the Gong question

[Preview Draft] [Edit] [Approve & Send] [Reject]
```

---

### Sequence 2: Daily Pipeline Pulse

**Purpose:** Every morning, surface the deals that need attention, the actions to take, and the risks to address — before the rep opens their CRM.

**Trigger:** CRON - 07:30 weekdays

**Skills Pipeline:**

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | Pipeline Pull | user_id, filters | active_deals with metadata |
| 2 | Activity Scanner | deal_ids | last_activity_per_deal, communication_history |
| 3 | Risk Analyzer | deals + activities | stalled_flags, missing_next_steps, slipped_dates, single_threaded |
| 4 | Next Best Action Engine | deals + risks | recommended_actions per deal |
| 5 | Priority Ranker | deals + actions | stack_ranked by (value × urgency × actionability) |
| 6 | Slack Briefing | ranked_deals + actions | morning_summary delivered |

**Risk Detection Rules:**
- Stalled: No activity for X days (configurable by stage)
- Slipped: Close date in past or pushed more than twice
- Single-threaded: Only one contact engaged
- Missing next step: No scheduled follow-up
- Gone cold: Prospect hasn't responded to last 2+ touches

**Slack Briefing Message:**

```
☀️ Good morning Andrew — Tuesday Pipeline Pulse

📊 PIPELINE SNAPSHOT
━━━━━━━━━━━━━━━━━━
Active deals: 12 | Value: £340k | Avg age: 23 days
Closing this month: 4 deals (£145k)

🔴 NEEDS ATTENTION (3)
━━━━━━━━━━━━━━━━━━━━

Acme Corp — £45k — Evaluation
⏰ 12 days since last contact
💡 Re-engage with case study on 90-day ROI
[Draft Email] [Call Script] [Snooze 3 days]

TechStart — £28k — Proposal
⏰ Close date was yesterday
💡 Timeline check-in, offer flexibility
[Draft Email] [Update Close Date]

DataFlow — £32k — Discovery  
⚠️ Single-threaded (only talking to SDR)
💡 Ask for intro to decision maker
[Draft Email] [Research Stakeholders]

🟡 ACTION TODAY (2)
━━━━━━━━━━━━━━━━━━

BlueCo — £62k — Negotiation
📋 Follow-up due from Thursday call
Draft ready for your review
[Review Draft] [Edit] [Send]

GrowthInc — £18k — Demo Scheduled
📅 Demo at 2pm today
[View Meeting Prep]

🟢 ON TRACK (7)
━━━━━━━━━━━━━━
£175k moving healthy — no action needed

[View Full Pipeline] [Snooze All for 1 Day]
```

---

### Sequence 3: Pre-Meeting Prep

**Purpose:** Two hours before any external meeting, deliver a briefing that makes the rep look like they did an hour of research in 30 seconds.

**Trigger:** Calendar event with external attendee, 2 hours before

**Skills Pipeline:**

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | Attendee Extractor | calendar_event | external_contacts, meeting_context |
| 2 | LinkedIn Scraper (Apify) | contact_linkedin_urls | profiles, role_history, recent_posts |
| 3 | Company Research (Apollo + Gemini) | company_domains | size, funding, stack, news, hiring |
| 4 | CRM History Pull | contact_ids, company_ids | previous_touches, deal_notes, objections |
| 5 | Briefing Compiler (Gemini) | all_research | synthesized_briefing |
| 6 | Slack Delivery | briefing | notification_sent |

**Trigger Filtering:**
- Only external attendees (exclude internal domains)
- Only meetings 15+ minutes
- Exclude "Hold" or "Blocked" calendar events
- Configurable: include/exclude specific meeting types

**Slack Briefing Message:**

```
📋 Meeting Prep: Sarah Chen @ Acme Corp
📅 Today at 2:00pm (in 2 hours) • 45 min • Zoom

PERSON
━━━━━━
Sarah Chen
VP Sales — 18 months in role
Previously: Sales Director @ TechCorp (3 years)

Recent LinkedIn:
• Shared article: "Scaling SDR teams without burning budget"
• Commented on AI in sales post last week
→ 💡 Talking point: Our automation angle directly addresses SDR scaling

COMPANY
━━━━━━━
Acme Corp | B2B SaaS | San Francisco
85 employees | Series B ($12M raised)

Tech Stack: HubSpot, Gong, Outreach, Salesforce
Hiring: 2 SDRs, 1 Sales Ops — expansion mode

Recent News:
• Expanded into DACH market (3 weeks ago)
• Named in "Top 50 SaaS Startups" list

YOUR HISTORY
━━━━━━━━━━━━
Last contact: Demo call 3 weeks ago
Deal: £45k — Evaluation stage

Previous Notes:
• Liked meeting summary feature
• Concerned about Gong overlap
• Tom (RevOps) is technical evaluator

Stakeholders Met:
• Sarah Chen (Champion) ✓
• Tom Rivera (Evaluator) ✓
• CFO (Blocker?) — not yet engaged

SUGGESTED APPROACH
━━━━━━━━━━━━━━━━━━
1. Open with her LinkedIn post on SDR scaling
2. Address Gong concern upfront — position as complementary
3. Ask about DACH expansion challenges (personalization angle)
4. Goal: Get technical deep-dive scheduled with Tom

[Add to Notes] [View Full CRM Record]
```

---

### Sequence 4: Stalled Deal Revival

**Purpose:** Proactively surface stalled deals with fresh triggers that justify re-engagement, and provide ready-to-send outreach.

**Trigger:** Daily scan - 08:00 weekdays

**Skills Pipeline:**

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | Stall Detector | pipeline_rules | stalled_deals with context |
| 2 | Trigger Research (Apollo + Apify) | company_ids, contact_ids | news, funding, hiring, job_changes |
| 3 | Context Analyzer (Gemini) | deal_history, last_notes | stall_reason, relationship_status |
| 4 | Re-engagement Drafter | triggers + context | email_draft, linkedin_draft, call_script |
| 5 | Opportunity Scorer | all_data | priority_score per deal |
| 6 | Slack Presenter | scored_deals + drafts | revival_opportunities |
| 7 | Executor | approved_outreach | messages_queued, tasks_created |

**Stall Thresholds (configurable by stage):**
- Discovery: 14 days no activity
- Evaluation: 21 days no activity
- Proposal: 14 days no activity
- Negotiation: 7 days no activity
- Closed Lost (recent): 90 days for check-in

**Trigger Types Detected:**
- Funding announced
- New leadership (especially sales/ops)
- Hiring surge in relevant roles
- Champion job change (internal promotion)
- Company news/PR
- Competitor mentioned in news
- Tech stack change

**Opportunity Scoring:**
```
Score = (Deal Value × 0.3) + (Trigger Strength × 0.3) + (Recency × 0.2) + (ICP Fit × 0.2)

Trigger Strength:
- Funding/Leadership change: 1.0
- Hiring surge: 0.8
- News mention: 0.6
- No trigger: 0.2
```

**Slack Presenter Message:**

```
🔄 Stalled Deal Revival — 3 opportunities found

#1 STRONG TRIGGER
━━━━━━━━━━━━━━━━
GlobalTech — £55k — 34 days silent
Score: 92/100

🔥 TRIGGER: New VP Sales started last week + 3 SDR roles posted
📝 LAST CONVO: Budget timing was the blocker (was end of Q4)
💡 ANGLE: New budget cycle + new leadership = fresh start

[View Email Draft] [View LinkedIn Draft] [Call Script] [Skip]

---

#2 WARM OPPORTUNITY
━━━━━━━━━━━━━━━━━━
DataFlow — £32k — 28 days silent
Score: 78/100

📰 TRIGGER: Announced Series A ($8M) last week
📝 LAST CONVO: "Love it, but waiting until we scale the team"
💡 ANGLE: Funding secured + they're scaling now

[View Email Draft] [Skip]

---

#3 WORTH A CHECK-IN
━━━━━━━━━━━━━━━━━━
SmartCo — £24k — 45 days silent
Score: 45/100

❓ TRIGGER: None found
📝 LAST CONVO: Went with competitor (Outreach)
💡 ANGLE: 90-day check-in to see if it's working for them

[View Email Draft] [Skip for 45 days]

---

[Skip All] [Process Top 2]
```

---

## Part 4: Additional Sequences

### Sequence 5: Prospect to Campaign

**Purpose:** Turn an ICP definition into validated, personalized outreach ready to deploy — end to end.

**Trigger:** Manual (user initiates) or scheduled prospecting cadence

**Skills Pipeline:**

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | ICP Loader | icp_profile_id | targeting_criteria |
| 2 | Prospect Finder (Apollo) | criteria | raw_prospects |
| 3 | Email Validator (Reoon) | email_list | validated_emails, catch_all_flags |
| 4 | Prospect Enricher (Gemini + Apollo) | validated_prospects | enriched_profiles |
| 5 | Outreach Drafter (Copywriter) | enriched_profiles, outreach_template | personalized_sequences |
| 6 | Slack Presenter | campaign_plan | approval_request |
| 7 | Campaign Creator (Instantly) | approved_plan | campaign_id, contacts_added |
| 8 | Scheduler (Instantly) | campaign_id, schedule | campaign_scheduled |
| 9 | Confirmation (Slack) | campaign_details | user_notified |

---

### Sequence 6: Inbound Lead Qualification

**Purpose:** Instantly qualify, enrich, and route inbound leads with appropriate response speed.

**Trigger:** New lead created in CRM / Form submission webhook

**Skills Pipeline:**

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | Lead Capture | webhook_payload | lead_data |
| 2 | Enrichment (Apollo + Gemini) | lead_email, company | enriched_lead |
| 3 | ICP Scorer | enriched_lead, icp_profile | score, match_reasons |
| 4 | Intent Analyzer | lead_source, behavior_data | intent_signals |
| 5 | Response Drafter | lead_context, score | personalized_response |
| 6 | Router | score + intent | routing_decision |
| 7 | Executor | routing_decision | response_sent, rep_notified, sequence_started |

**Routing Logic:**
- Hot (score > 80, high intent): Instant Slack alert + auto-response with booking link
- Warm (score 50-80): Personalized email sequence
- Cold (score < 50): Nurture sequence

---

### Sequence 7: Champion Job Change

**Purpose:** Never miss when a champion moves to a new company — it's the warmest possible outreach.

**Trigger:** LinkedIn monitoring detects job change (daily scan)

**Skills Pipeline:**

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | Job Change Detector (Apify) | monitored_contacts | job_changes |
| 2 | New Company Research (Apollo + Gemini) | new_company | icp_fit, context |
| 3 | Relationship Context (CRM) | contact_id | deal_history, relationship_strength |
| 4 | Outreach Drafter (Copywriter) | all_context | congrats_email, value_prop |
| 5 | Backfill Analyzer | old_company | replacement_opportunity |
| 6 | Slack Presenter | both_opportunities | dual_opportunity_alert |
| 7 | Executor | approved_actions | outreach_sent, backfill_task_created |

---

### Sequence 8: Event Follow-Up

**Purpose:** Turn conference contacts into qualified pipeline before the momentum fades.

**Trigger:** Manual (post-event) with contact list upload

**Skills Pipeline:**

| Step | Skill | Input | Output |
|------|-------|-------|--------|
| 1 | Contact Importer | csv/list | raw_contacts |
| 2 | Enrichment (Apollo + Gemini) | contacts | enriched_contacts |
| 3 | Email Validator (Reoon) | emails | validated_list |
| 4 | Segmenter | contacts + notes | hot/warm/cold tiers |
| 5 | Outreach Drafter (Copywriter) | tiered_contacts, event_context | personalized_sequences |
| 6 | Slack Presenter | tiered_plan | approval_request |
| 7 | Campaign Creator (Instantly) | approved_tiers | campaigns_created |
| 8 | Executor | campaigns | sequences_deployed |

**Tier Definitions:**
- Hot: Had meaningful conversation, expressed interest
- Warm: Brief interaction, exchanged cards
- Cold: Badge scan only, no conversation

---

## Part 5: Orchestrator Architecture

### System Prompt Structure

```
┌─────────────────────────────────────────────────────────────┐
│  STABLE PREFIX (cached)                                      │
│  ─────────────────────────────────────────────────────────  │
│  • Agent identity: "You are 60, an AI sales agent..."       │
│  • Core capabilities and limitations                         │
│  • Skill definitions and output contracts                    │
│  • Sequence definitions and step logic                       │
│  • Tool definitions (Level 1 only)                          │
│  • Rules: approval requirements, escalation triggers         │
│  • Output format requirements                                │
│                                                              │
│  ~2,000 tokens — STABLE, CACHED                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  DYNAMIC SUFFIX (injected per-request)                       │
│  ─────────────────────────────────────────────────────────  │
│  <current_context>                                          │
│    <user>                                                   │
│      name, company, role, timezone                          │
│    </user>                                                  │
│    <timestamp>2025-01-04T09:30:00Z</timestamp>             │
│    <sequence_state>                                         │
│      {current SequenceState object}                         │
│    </sequence_state>                                        │
│    <immediate_task>                                         │
│      What needs to happen next                              │
│    </immediate_task>                                        │
│  </current_context>                                         │
│                                                              │
│  ~500-1,000 tokens — DYNAMIC, MINIMAL                       │
└─────────────────────────────────────────────────────────────┘
```

---

### Tool Hierarchy

**Level 1 — Orchestrator Tools (6 tools):**

```typescript
// Research entities (contacts, companies, deals)
research(target: string, depth: "quick" | "standard" | "deep"): SkillResult

// Enrich a contact or company with external data
enrich(entity_type: "contact" | "company", identifier: string): SkillResult

// Draft content (emails, messages, scripts)
draft(type: "email" | "linkedin" | "slack" | "call_script", context: DraftContext): SkillResult

// Perform CRM operations
crm_action(action: "read" | "update" | "create", entity: CRMEntity): SkillResult

// Send notifications
notify(channel: "slack" | "email", message: NotificationMessage): SkillResult

// Execute approved actions
execute(action_type: "send_email" | "send_linkedin" | "create_task" | "book_meeting", params: ExecuteParams): SkillResult
```

**Level 2 — Internal Routing (hidden from orchestrator):**

```
research() routes to:
├── apollo_company_search
├── apollo_contact_search
├── apify_linkedin_profile
├── apify_linkedin_posts
├── apify_linkedin_job_changes
├── gemini_news_search
└── gemini_company_analysis

enrich() routes to:
├── apollo_enrichment
├── gemini_enrichment
└── reoon_email_validation

draft() routes to:
├── copywriter_email
├── copywriter_linkedin
├── copywriter_slack
└── copywriter_call_script

crm_action() routes to:
├── hubspot_read
├── hubspot_write
├── bullhorn_read
└── bullhorn_write

notify() routes to:
├── slack_blocks_sender
└── email_notification

execute() routes to:
├── email_sender
├── linkedin_sender (if connected)
├── instantly_campaign
├── crm_task_creator
└── calendar_booker
```

---

### Sub-Agent Isolation Pattern

```
┌─────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR                                                │
│  • Sees: 6 high-level tools                                 │
│  • Maintains: SequenceState object                          │
│  • Receives: SkillResult contracts only                     │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Research   │      │    Draft    │      │     CRM     │
│   Agent     │      │    Agent    │      │    Agent    │
├─────────────┤      ├─────────────┤      ├─────────────┤
│ Has access  │      │ Has access  │      │ Has access  │
│ to full     │      │ to full     │      │ to full     │
│ Apollo/     │      │ context +   │      │ CRM schema  │
│ LinkedIn    │      │ templates   │      │ + history   │
│ responses   │      │             │      │             │
├─────────────┤      ├─────────────┤      ├─────────────┤
│ Returns:    │      │ Returns:    │      │ Returns:    │
│ • summary   │      │ • summary   │      │ • summary   │
│ • key data  │      │ • draft_ref │      │ • fields    │
│ • ref to    │      │ • preview   │      │   updated   │
│   full JSON │      │             │      │             │
└─────────────┘      └─────────────┘      └─────────────┘
```

Each sub-agent:
1. Receives only what it needs
2. Works with full data internally
3. Returns only the SkillResult contract
4. Never exposes reasoning or intermediate state

---

## UI Integration Notes (Copilot web app)

When sequences are executed from Copilot, we aim for a consistent “skill-first” UX:

- **Progress story while working**: show a stepper with named steps (e.g., “Find next meeting → Load context → Draft follow-ups”) during tool execution.
- **Structured response panels**: prefer sequence-aware panels (preview + confirm) over free-form chat for:
  - next meeting prep
  - post-meeting follow-up packs
  - meetings list (today/tomorrow)
- **Clickable results contract** (handled centrally by the Copilot shell):
  - `open_contact`, `open_deal`, `open_meeting`, `open_task`, `open_external_url`

---

## Part 6: Implementation Checklist

### Skills Required

| Skill | Status | Priority | Notes |
|-------|--------|----------|-------|
| Transcription (Gladia/MeetingBaaS) | ✅ | P0 | Core dependency |
| Meeting Analyzer (Gemini Flash) | 🔨 | P0 | Build prompt + output contract |
| CRM Read (HubSpot) | ✅ | P0 | |
| CRM Write (HubSpot) | ✅ | P0 | |
| CRM Read (Bullhorn) | ✅ | P1 | |
| CRM Write (Bullhorn) | ✅ | P1 | |
| Copywriter Agent | ✅ | P0 | |
| Slack Blocks Presenter | ✅ | P0 | |
| Apollo Company Search | ✅ | P0 | |
| Apollo Contact Search | ✅ | P0 | |
| Apollo Enrichment | ✅ | P0 | |
| Apify LinkedIn Profile | ✅ | P0 | |
| Apify LinkedIn Posts | 🔨 | P1 | |
| Apify Job Change Monitor | 🔨 | P2 | |
| Gemini Flash Enrichment | 🔨 | P0 | General purpose analysis |
| Email Validator (Reoon) | ✅ | P1 | |
| Calendar Read (Google) | 🔨 | P0 | For Pre-Meeting Prep |
| Email Sender | 🔨 | P0 | Direct or via Instantly |
| Instantly Campaign Creator | 🔨 | P1 | |
| Task Creator (CRM) | 🔨 | P1 | |

### Sequence Build Order

1. **Post-Meeting Intelligence** — Core differentiator, daily value
2. **Daily Pipeline Pulse** — Builds habit, morning engagement
3. **Pre-Meeting Prep** — High perceived value, proactive
4. **Stalled Deal Revival** — Revenue recovery, clear ROI
5. **Prospect to Campaign** — Already partially built
6. **Inbound Lead Qualification** — Depends on CRM webhooks
7. **Champion Job Change** — Requires LinkedIn monitoring
8. **Event Follow-Up** — Manual trigger, lower priority

### Infrastructure Requirements

- [ ] S3/blob storage for references (transcripts, drafts, analysis)
- [ ] Sequence state persistence (database)
- [ ] CRON scheduler for daily sequences
- [ ] Webhook endpoints for triggers (MeetingBaaS, CRM, forms)
- [ ] Slack app with interactive message support
- [ ] Queue system for async skill execution

---

## Appendix: Slack Block Templates

### Approval Request Template

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {"type": "plain_text", "text": "📋 {title}"}
    },
    {
      "type": "section",
      "text": {"type": "mrkdwn", "text": "{summary}"}
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {"type": "mrkdwn", "text": "*Key Points*\n{bullet_points}"}
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "✓ Approve"},
          "style": "primary",
          "action_id": "approve_{sequence_instance_id}"
        },
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "Edit"},
          "action_id": "edit_{sequence_instance_id}"
        },
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "✗ Reject"},
          "style": "danger",
          "action_id": "reject_{sequence_instance_id}"
        }
      ]
    }
  ]
}
```

### Pipeline Card Template

```json
{
  "type": "section",
  "text": {
    "type": "mrkdwn", 
    "text": "*{company}* — £{value} — {stage}\n{status_emoji} {status_reason}\n💡 {suggestion}"
  },
  "accessory": {
    "type": "overflow",
    "options": [
      {"text": {"type": "plain_text", "text": "Draft Email"}, "value": "draft_email_{deal_id}"},
      {"text": {"type": "plain_text", "text": "View in CRM"}, "value": "crm_link_{deal_id}"},
      {"text": {"type": "plain_text", "text": "Snooze 3 days"}, "value": "snooze_{deal_id}"}
    ]
  }
}
```

---

*Document version: 1.0*
*Last updated: January 2025*