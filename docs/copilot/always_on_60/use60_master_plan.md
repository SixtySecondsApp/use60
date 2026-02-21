# use60 PRD Master Plan

**The Full Build Sequence: From Config Engine to Always-On Copilot**

**Date:** 21 February 2026
**Source Documents:**
- Agent Configuration Schema
- Agent Personalisation Architecture
- Always-On Copilot Review

---

## Summary

**24 PRDs across 8 phases.** Each PRD is a self-contained deliverable that ships real value. Dependencies flow downward — nothing in Phase 3 requires Phase 4. Within phases, PRDs can often be parallelised.

Estimated total timeline: **6–9 months** depending on team size and parallelisation.

---

## Phase 0: Foundation
*The infrastructure everything else depends on. Build once, use everywhere.*
*Estimated: 3–4 weeks*

### PRD-01: Agent Configuration Engine
**What it delivers:** The three-layer config system (platform defaults → org overrides → user overrides) with resolution logic, caching, and the TypeScript config loader that every edge function will use.

**Scope:**
- `agent_config_defaults` table seeded with all platform defaults
- `agent_config_org_overrides` table
- `agent_config_user_overrides` table
- `agent_config_user_overridable` table
- `resolve_agent_config()` and `resolve_agent_config_all()` Postgres functions
- `_shared/config/agentConfig.ts` loader with 5-minute caching
- `agent_methodology_templates` table seeded with Generic, MEDDIC, BANT, Challenger, SPIN
- Platform default values for all agent types
- RLS policies for org/user isolation

**Dependencies:** None — this is the bedrock.

**Definition of done:** Any edge function can call `getAgentConfig(orgId, userId, agentType)` and receive a fully resolved config object in <50ms. Methodology switch changes resolved config values correctly.

**Effort:** 1.5–2 weeks

---

### PRD-02: Fleet Orchestrator & Event Router
**What it delivers:** The conductor layer that connects the existing 30+ edge functions into coordinated workflows. Agent-to-agent handoffs, event routing, and sequence chaining.

**Scope:**
- `fleet.json` configuration defining all agents, triggers, and handoff routes
- Event routing logic: event type → agent selection → context loading → execution
- Handoff protocol: post-meeting-intel hands off to auto-crm-update, etc.
- Extend `agent_triggers` table with handoff routing fields
- Orchestrator edge function that reads fleet config and routes events
- Sequence chaining: step completes → next step queues automatically
- Error handling: retry logic, dead-letter alerting, circuit breakers
- Integration with existing `_shared/proactive/` delivery subsystem

**Dependencies:** PRD-01 (reads agent configs to determine routing)

**Definition of done:** A meeting ending triggers a chain: post-meeting processing → CRM update suggestion → risk score recalculation — all flowing through the orchestrator without manual intervention. Each step reads its agent config to determine behaviour.

**Effort:** 2–3 weeks

---

## Phase 1: Core Agents
*The three priority agents, now built on the config engine.*
*Estimated: 6–8 weeks*

### PRD-03: Auto CRM Update Agent
**What it delivers:** After every meeting, HubSpot is updated automatically — notes, next steps, contacts, activity logs auto-applied; stage changes, close date, and amount presented for approval.

**Scope:**
- `agent-crm-update` edge function
- Meeting transcript analysis for CRM-relevant data extraction
- Stage progression detection using playbook decision tree rules
- CRM write execution (auto-approve fields vs approval-required fields)
- Slack summary message with approve/reject/edit buttons
- Confidence scoring: high confidence = suggest stage change, low = note only
- Heartbeat checks: pending updates, stale approval queue, error rates
- Per-agent `mission.json`, `playbook.json`, `boundaries.json`, `voice.json`, `heartbeat.json` configs
- Integration with existing `extract-action-items` and `create-task-from-action-item` functions

**Dependencies:** PRD-01 (config), PRD-02 (receives handoff from post-meeting-intel)

**Definition of done:** Rep finishes a call → within 15 minutes gets a Slack message showing what was updated automatically and what needs approval → one-tap approve updates HubSpot. CRM admin time measurably reduced.

**Effort:** 2–3 weeks

---

### PRD-04: Deal Risk Scorer Agent
**What it delivers:** Every active deal has a risk score based on engagement decay, champion health, deal momentum, and conversation sentiment. High-risk deals trigger alerts with specific intervention suggestions.

**Scope:**
- `agent-deal-risk` edge function
- Weighted scoring model: engagement (25%), champion (25%), momentum (25%), sentiment (25%)
- Signal detection across CRM data, meeting transcripts, and email activity
- Risk levels: Low (0–30), Medium (31–60), High (61–80), Critical (81–100)
- Intervention playbooks per risk type (engagement decay, champion risk, stalling, competitive)
- Scheduled daily scoring run + event-triggered re-scoring (after CRM updates, meetings)
- Risk alert Slack messages with evidence and suggested actions
- Risk score history tracking for trend analysis
- Per-agent config files with org-customisable weights and thresholds

**Dependencies:** PRD-01 (config), PRD-02 (receives handoff from auto-crm-update), PRD-03 (clean CRM data improves accuracy)

**Definition of done:** All active deals scored daily. Alerts fire for High/Critical with specific evidence and actionable suggestions. Rep intervention rate on flagged deals >50%.

**Effort:** 2–3 weeks

---

### PRD-05: Re-engagement Trigger Agent
**What it delivers:** Closed-lost deals and dormant prospects are monitored for buying signals (job changes, funding, company news, inbound activity). When signals fire, the agent drafts contextual re-engagement outreach.

**Scope:**
- `agent-reengagement` edge function
- Signal source integrations: Apollo (job changes, funding), Apify (company news)
- Signal relevance scoring: does this signal address the original objection?
- Historical context loading: original deal, why closed-lost, champion relationship
- AI-generated personalised re-engagement email using rep's writing style
- Slack presentation with signal summary, deal history, draft outreach, approve/edit/dismiss
- Cooldown rules: min days since close, max attempts, respect unsubscribe
- Per-agent config files

**Dependencies:** PRD-01 (config), PRD-02 (orchestrator), PRD-04 (risk scorer identifies deals transitioning to closed-lost)

**Definition of done:** At least 1 buying signal detected per week per active org. Re-engagement outreach sent on >50% of flagged signals. First reopened deal from re-engagement within 90 days of launch.

**Effort:** 2–3 weeks

---

## Phase 2: The Daily Rhythm
*Transform the agent from event-responder to daily companion.*
*Estimated: 3–4 weeks*

### PRD-06: Enhanced Morning Briefing
**What it delivers:** The existing morning brief upgraded with pipeline mathematics, temporal/quarter awareness, and urgency-weighted prioritisation.

**Scope:**
- Pipeline math calculations: target vs closed, weighted pipeline, coverage ratio, gap analysis
- Quota/target input (manual entry or CRM sync) stored in org config
- Quarter phase detection: build/progress/close with adjusted emphasis
- "Highest-leverage action" recommendation based on gap analysis + risk scores
- Overnight work summary ("While you slept: enriched 3 contacts, Meridian opened your email at 11:42pm")
- Upgrade existing `proactive-pipeline-analysis` to use new calculations
- `pipeline_snapshots` table for weekly state capture (enables trend analysis later)
- Config for briefing format preferences (detailed vs summary, pipeline math on/off)

**Dependencies:** PRD-01 (config), PRD-04 (risk scores feed into briefing)

**Definition of done:** Morning brief includes gap-to-target analysis, quarter context, and a specific recommended first action. Rep can see at a glance whether they're on track.

**Effort:** 1.5–2 weeks

---

### PRD-07: End-of-Day Synthesis
**What it delivers:** A 5pm wrap that closes the daily loop — scorecard, open items, tomorrow preview, and overnight work plan.

**Scope:**
- `agent-eod-synthesis` edge function triggered at user's configured end-of-day time
- Today's scorecard: meetings completed, emails sent, CRM updates, pipeline changes
- Open items: unanswered emails, unsent drafts, incomplete action items
- Tomorrow preview: calendar with prep status, flagged attention items
- Overnight plan: what the agent will do while the rep is offline
- Links back to morning brief ("morning brief will include overnight results")
- Configurable: enabled/disabled, delivery time, detail level

**Dependencies:** PRD-01 (config), PRD-02 (orchestrator tracks completed actions for scorecard)

**Definition of done:** Rep receives end-of-day wrap at configured time. Next morning's brief references overnight work. Continuous loop established with zero gaps.

**Effort:** 1–1.5 weeks

---

### PRD-08: Internal Meeting Prep
**What it delivers:** The pre-meeting agent preps internal meetings too — 1:1s with managers, pipeline reviews, QBRs, and team standups — using deal data the rep already has.

**Scope:**
- Internal meeting detection: same-domain attendees, meeting title pattern matching
- Meeting type classification: 1:1, pipeline review, QBR, standup, other
- Type-specific prep templates:
  - 1:1: pipeline changes since last 1:1, coaching points, wins, blockers
  - Pipeline review: full pipeline by stage with movement, forecast vs target, risk summary
  - QBR: quarter performance, win/loss analysis, competitive landscape, next quarter projection
  - Standup: personal update bullets, deals needing help, wins since last standup
- "Send to manager as pre-read" action button
- Config: enabled/disabled per meeting type, prep detail level

**Dependencies:** PRD-01 (config), PRD-06 (pipeline math calculations shared)

**Definition of done:** Agent correctly detects and classifies internal meetings, delivers relevant prep 90 minutes before. Rep walks into 1:1 with prepared talking points.

**Effort:** 1.5–2 weeks

---

## Phase 3: Personalisation & Settings UI
*Give revenue leaders control over their copilot.*
*Estimated: 4–5 weeks*

### PRD-09: Sales Methodology & Process Settings
**What it delivers:** A settings page where admins select their sales methodology and the agent's behaviour cascades accordingly — stage rules, qualification criteria, coaching focus, CRM fields all update.

**Scope:**
- Settings UI page: "Sales Process" under Agent Configuration
- Methodology selector cards: Generic, MEDDIC, BANT, SPIN, Challenger, Custom
- "Preview what changes" modal before applying methodology switch
- Stage mapping editor: drag-and-drop matching of CRM stages to agent stages
- Qualification criteria editor per methodology
- Real-time config write to `agent_config_org_overrides`
- Methodology template loading from `agent_methodology_templates`
- Custom methodology creation flow (for power users)

**Dependencies:** PRD-01 (config engine stores the settings)

**Definition of done:** Admin selects MEDDIC → all agents immediately use MEDDIC qualification criteria, stage rules, coaching focus. Switching back to Generic reverts cleanly.

**Effort:** 1.5–2 weeks

---

### PRD-10: Autonomy & Approval Policy Settings
**What it delivers:** The autonomy dial — preset levels (Conservative/Balanced/Autonomous/Custom) with per-action toggle overrides and graduated autonomy suggestions.

**Scope:**
- Settings UI page: "Agent Autonomy" under Agent Configuration
- Preset selector with clear descriptions of what each level means
- Per-action toggle grid: Auto / Approve / Suggest Only / Disabled for each action type
- Preset → Custom automatic switch when individual toggles are changed
- Approval statistics display: "48 auto-approved, 0 corrections this month"
- Graduated autonomy engine:
  - Background tracking of approval rates and rejection rates per action
  - Promotion rules: X approvals with <Y% rejection rate over Z days
  - Slack suggestion: "Want to auto-approve this action type?"
  - Admin can enable/disable graduation per action
- User-level override permissions (admin controls which settings reps can adjust)

**Dependencies:** PRD-01 (config engine), PRD-03 (approval tracking data from CRM agent)

**Definition of done:** Admin sets Balanced preset → agent auto-approves routine updates, requests approval for stage changes. After 50 clean approvals, system suggests auto-promoting that action. Stats visible in settings.

**Effort:** 2 weeks

---

### PRD-11: CRM Field Mapping & Write Policies
**What it delivers:** Auto-detected CRM field mapping from HubSpot with admin confirmation, plus granular control over what the agent can read/write.

**Scope:**
- HubSpot pipeline and field auto-detection on connect
- Mapping UI: HubSpot fields → agent fields, with confidence indicators
- Custom field mapping for non-standard HubSpot properties
- Write policy editor per action type: auto / approval / suggest only / disabled
- CRM field mapping stored in org config
- Methodology-specific custom fields auto-suggested (e.g. MEDDIC → 6 custom fields)
- Validation: required fields per stage (configurable)
- "Test connection" button that runs a read-only CRM query to verify mapping

**Dependencies:** PRD-01 (config), PRD-09 (methodology may add custom fields)

**Definition of done:** New org connects HubSpot → stages and fields auto-mapped → admin confirms or adjusts → agent uses correct field names for all CRM operations.

**Effort:** 1.5–2 weeks

---

### PRD-12: Custom SOP Builder
**What it delivers:** Revenue leaders can create custom decision trees — "when the agent detects X, do Y" — through a simple workflow builder UI.

**Scope:**
- SOP builder UI: trigger condition → ordered steps → per-step approval level
- Trigger conditions: transcript phrases, CRM field changes, email patterns, time-based
- Step types: CRM action, draft email, alert rep, alert manager, enrich contact, create task
- Per-step approval setting: auto or approval
- Standard SOP library (platform-provided): no-show handling, competitor mentioned, proposal requested, champion gone quiet
- Custom SOP CRUD: create, edit, test, enable/disable, delete
- "Test with example" feature: run SOP against a past meeting transcript to see what it would do
- SOP execution integration with orchestrator
- Credit impact estimate per SOP

**Dependencies:** PRD-01 (config), PRD-02 (orchestrator executes SOPs), PRD-09 (SOPs reference methodology context)

**Definition of done:** Admin creates "Pricing Objection Handling" SOP → next time a pricing objection is detected in a call, the agent follows the custom workflow. Test mode validates against historical data.

**Effort:** 2–3 weeks

---

## Phase 4: Signal Intelligence
*Fill the gaps between meetings. This is where "always-on" becomes real.*
*Estimated: 4–5 weeks*

### PRD-13: Email Signal Processing
**What it delivers:** The agent monitors the rep's inbox for sales-relevant signals — fast replies, slow replies, forwards, meeting requests, pricing questions, silence — and surfaces them as actionable Slack nudges.

**Scope:**
- Gmail/O365 webhook or polling integration for inbox monitoring
- Email classification model: meeting request, pricing question, objection, positive buying signal, competitor mention, introduction offer, generic
- Response speed tracking per contact (builds engagement pattern baseline)
- Absence detection: expected reply overdue based on contact's average response time
- Signal-to-action routing via orchestrator:
  - Meeting request → offer calendar times
  - Pricing question → draft response with pricing template
  - Silence → increment risk score
  - Forward detected → log multi-threading signal
- Slack nudge delivery with context and action buttons
- Rate limiting: batch signals, don't alert on every email open
- Config: enabled/disabled, signal types to monitor, alert threshold

**Dependencies:** PRD-01 (config), PRD-02 (orchestrator routes signals), PRD-04 (risk scorer updated by email signals)

**Definition of done:** Prospect forwards proposal to internal team → agent detects and alerts rep within 30 minutes with context. Prospect goes silent for 2x their average response time → risk score increases and rep is nudged.

**Effort:** 2–3 weeks

---

### PRD-14: Contact Engagement Patterns
**What it delivers:** Per-contact response time baselines, optimal send time learning, and communication preference detection.

**Scope:**
- `contact_engagement_patterns` table: best email day/hour, avg response time, trend, last calculated
- Pattern calculation job: analyse email thread history per contact to establish baselines
- Response time anomaly detection: current response time vs baseline triggers alerts
- Optimal send time recommendation: "I'll send this Tuesday at 9:15am — that's when David responds fastest"
- Scheduled send integration: approved emails held until optimal window
- Pattern display in pre-meeting prep and deal context
- Recalculation frequency: weekly baseline update

**Dependencies:** PRD-13 (email data feeds pattern calculation)

**Definition of done:** Agent recommends send time for approved follow-up based on contact's historical patterns. Response time deviation flagged when contact's behaviour changes significantly.

**Effort:** 1–1.5 weeks

---

### PRD-15: Ambient Signal Layer & Deal Temperature
**What it delivers:** A unified "deal temperature" score that aggregates all signals (email engagement, proposal opens, website visits, social activity) into a single rising/falling metric. Agent surfaces pattern-based alerts, not individual signal noise.

**Scope:**
- `deal_signal_temperature` table: temperature score, trend, signal counts, top signals
- Signal ingestion from multiple sources:
  - Email engagement (from PRD-13): opens, clicks, replies, forwards
  - Proposal tracking: open events, time spent, pages viewed, forwarded (tracking pixel integration)
  - Website visits (premium): pricing page, demo page, case studies (analytics webhook)
  - Social activity (premium): LinkedIn engagement monitoring via Apify
- Temperature calculation algorithm: weighted signal aggregation with 72-hour decay
- Threshold-based alerting: only surface when temperature crosses a boundary or changes significantly
- "Heating up" and "Cooling down" alert templates with aggregated signal evidence
- Temperature trend in daily briefing and deal risk context
- Config: signal sources enabled/disabled, alert thresholds, premium feature gating

**Dependencies:** PRD-01 (config), PRD-13 (email signals), PRD-04 (feeds into risk scoring)

**Definition of done:** Prospect opens proposal 3 times, visits pricing page, forwards email → deal temperature rises from 42 to 78 → agent surfaces "Acme Corp is heating up" alert with aggregated evidence. No alert for a single email open.

**Effort:** 2–3 weeks

---

## Phase 5: Knowledge & Memory
*The agent gets smarter with every interaction.*
*Estimated: 4–5 weeks*

### PRD-16: Relationship Graph
**What it delivers:** A persistent contact intelligence layer that maps connections across deals, tracks company history, and enables warm introduction detection and multi-threading suggestions.

**Scope:**
- `contact_graph` table: contacts enriched with relationship data, company history, known connections, interaction count, relationship strength
- Graph population: auto-build from meeting attendees, CRM contacts, Apollo enrichment
- Cross-deal connection detection: "James at TechFlow used to work at Meridian with your champion Sarah"
- Warm introduction mapping: when prospecting, check if any existing contacts have connections to the target
- Company change tracking: detect when contacts move companies (feeds re-engagement)
- Relationship strength scoring based on interaction frequency, sentiment, and recency
- Integration into pre-meeting prep: relationship context included in briefing
- Integration into prospecting: warm intro suggestions when reaching new accounts

**Dependencies:** PRD-01 (config), PRD-05 (re-engagement uses contact graph for job change detection)

**Definition of done:** Pre-meeting prep surfaces "James previously worked at Meridian where he overlapped with your champion Sarah" without the rep asking. Prospecting suggests warm intros from existing contact relationships.

**Effort:** 2–3 weeks

---

### PRD-17: Competitive Intelligence System
**What it delivers:** Every competitor mention across all sales calls accumulates into an org-specific competitive knowledge base that improves positioning over time.

**Scope:**
- `competitive_intelligence` table: competitor mentions with context, sentiment, strengths/weaknesses mentioned, pricing discussed, deal outcome
- Automated capture: post-meeting analysis extracts competitor mentions and classifies them
- Competitor profile aggregation: after N mentions, build competitor profile with win rate, common strengths/weaknesses, effective counter-positioning
- Battlecard surfacing: when competitor detected in call, surface relevant positioning from winning deals
- Competitive trend tracking: "CompetitorX appeared in 4 deals this month, up from 1 last month"
- Coaching integration: competitive handling tips in weekly digest
- Manual battlecard upload: admin can add/edit competitive positioning docs
- Config: competitor names to track, alert preferences

**Dependencies:** PRD-01 (config), PRD-02 (post-meeting analysis feeds competitive data)

**Definition of done:** After 10+ deals mentioning CompetitorX, the agent surfaces win rate, common objections, and the most effective counter-positioning from winning deals when CompetitorX is detected in a new call.

**Effort:** 2 weeks

---

### PRD-18: Cross-Deal Pattern Recognition
**What it delivers:** Weekly analysis across the entire pipeline that surfaces patterns no individual deal view would catch — objection clustering, stage bottlenecks, engagement pattern correlations, win/loss factors.

**Scope:**
- Pattern analysis job: weekly run analysing all active and recently closed deals
- Pattern types:
  - Common objections across deals (clustering)
  - Stage bottleneck detection (where deals get stuck, compared to team average)
  - Engagement pattern comparison (what separates progressing deals from stalling ones)
  - Win/loss correlation factors (meeting count, multi-threading, response speed, etc.)
  - Rep behaviour impact (talk ratio, question quality, follow-up speed)
- Pattern → Insight generation: AI summarisation of statistical patterns into actionable coaching
- Integration into coaching digest (PRD-19), daily briefing, and risk scoring context
- `pipeline_patterns` table: stores detected patterns with confidence scores and supporting evidence
- Minimum data threshold: only surface patterns with statistical confidence

**Dependencies:** PRD-01 (config), PRD-04 (risk data), PRD-06 (pipeline snapshots provide trend data)

**Definition of done:** Weekly pattern analysis surfaces "Your deals that progress past Discovery within 10 days close at 3x the rate of those that take 20+ days. You have 2 Discovery deals approaching day 15 — consider accelerating."

**Effort:** 2 weeks

---

## Phase 6: Coaching & Team Intelligence
*The agent makes reps better and learns from the whole org.*
*Estimated: 3–4 weeks*

### PRD-19: Enhanced Weekly Coaching Digest
**What it delivers:** The existing coaching digest transformed with cross-deal patterns, competitive trends, behavioural benchmarks, and personalised improvement suggestions backed by data.

**Scope:**
- Upgrade existing `proactive-coaching-digest` to incorporate:
  - Cross-deal patterns from PRD-18
  - Competitive trends from PRD-17
  - Meeting behaviour analysis (talk ratio, question quality, objection handling)
  - Comparison to personal baseline (improving/declining)
  - Forecast accuracy tracking (how well the rep predicts close dates)
- Specific, actionable coaching tips: not "improve discovery" but "your Discovery calls that lead to Qualification all included budget discussion — 2 of your current Discovery deals haven't touched budget yet"
- Weekly wins celebration (deals progressed, good meeting moments)
- Skill progression tracking: monthly trend of coaching metrics
- Config: coaching focus areas (auto or admin-selected), detail level, delivery day/time

**Dependencies:** PRD-17 (competitive data), PRD-18 (cross-deal patterns), PRD-06 (pipeline snapshots)

**Definition of done:** Weekly coaching digest includes at least 2 data-backed insights specific to the rep's actual pipeline and behaviour, with concrete next actions.

**Effort:** 1.5–2 weeks

---

### PRD-20: Org-Wide Learning Engine
**What it delivers:** Anonymised cross-rep intelligence that identifies what the best performers do differently and feeds winning tactics back into individual coaching — without exposing individual rep data.

**Scope:**
- Cross-rep pattern analysis: aggregate meeting behaviours, email patterns, deal progression strategies across the org
- Winning talk track extraction: identify specific phrases and approaches from closed-won deals
- Anonymised benchmarking: "Top performers on your team average 3.2 meetings per deal vs your 2.1"
- Objection handling library: best responses per objection type, sourced from successful deals
- Optimal cadence recommendations: meeting frequency, follow-up timing from winning patterns
- Privacy controls: anonymise all individual data, require manager role for team-level views
- Rep-facing coaching: "When facing budget objections, your team's most effective approach is..."
- Knowledge base that builds automatically as more deals close
- Config: enabled/disabled (org-level), anonymisation rules, minimum team size for team learning (5+ reps)

**Dependencies:** PRD-17 (competitive data), PRD-18 (pattern recognition), PRD-19 (coaching digest delivery channel)

**Definition of done:** After 50+ team deals, the agent surfaces anonymised winning tactics in individual coaching. Manager dashboard shows team-level patterns.

**Effort:** 2–3 weeks

---

### PRD-21: Pipeline Forecast & Accuracy Tracking
**What it delivers:** The agent tracks what reps predict versus what actually closes, building a calibration model that improves forecast accuracy over time.

**Scope:**
- `pipeline_snapshots` weekly capture (started in PRD-06, now used for forecasting)
- Forecast vs actual comparison: quarterly review of predicted vs actual close dates and amounts
- Rep calibration profile: "You tend to be 20% optimistic on close dates in Proposal stage"
- Adjusted forecast: agent applies calibration to current pipeline predictions
- Forecast confidence levels per deal based on historical accuracy
- Manager view: team forecast accuracy trends
- Integration into morning briefing and pipeline review prep: show calibrated forecast alongside raw

**Dependencies:** PRD-06 (pipeline snapshots), PRD-08 (pipeline review prep), minimum 1 quarter of data

**Definition of done:** After one quarter of data, the agent shows "Raw forecast: £120k. Calibrated (based on your history): £96k" in pipeline review prep. Calibration improves forecast accuracy by measurable margin over 2 quarters.

**Effort:** 1.5 weeks

---

## Phase 7: The Conversational Copilot
*The agent you can talk to.*
*Estimated: 3–4 weeks*

### PRD-22: Conversational Slack Interface
**What it delivers:** Rep DMs the agent in Slack and gets intelligent responses backed by all the intelligence layers — deal status, pipeline queries, competitive info, draft generation, coaching on demand.

**Scope:**
- Slack DM listener: detect when rep messages the agent bot
- Natural language intent classification:
  - Deal queries: "What's happening with the Acme deal?"
  - Pipeline queries: "Which deals are most at risk?" / "Am I on track for Q1?"
  - History queries: "When did I last talk to Sarah Chen?"
  - Action queries: "Draft a follow-up for the Meridian deal"
  - Competitive queries: "What works when people push back on pricing?"
  - Coaching queries: "How should I handle this objection?"
- Context assembly: pull relevant data from all intelligence layers based on query type
- Conversational memory within a thread (multi-turn dialogue)
- Action execution from conversation: "Draft that email" → generates and presents for approval
- Rate limiting: reasonable response time expectations, credit consumption per query
- Config: enabled/disabled, model tier for conversational queries

**Dependencies:** PRD-01 (config), all intelligence layers (deals with whatever data exists — graceful degradation for missing layers)

**Definition of done:** Rep asks "What should I focus on today?" → agent responds with prioritised actions based on pipeline math, risk scores, temporal context, and email signals. Rep can then ask follow-up questions and request actions in the same thread.

**Effort:** 3–4 weeks

---

## Phase 8: Onboarding & Growth
*Get new orgs to value fast, and build trust over time.*
*Estimated: 2–3 weeks*

### PRD-23: Onboarding Wizard & Bootstrap
**What it delivers:** Guided setup that configures the agent for a new org through 4 steps: connect integrations, select methodology, confirm CRM mapping, set autonomy level. Plus a "suggest only" learning week.

**Scope:**
- 4-step guided wizard:
  1. Connect (CRM, calendar, email — existing onboarding upgraded)
  2. Configure (methodology selector + stage mapping confirmation)
  3. Autonomy (preset selector with clear explanations)
  4. Preferences (briefing time, quiet hours, channel)
- CRM auto-detection on connect: pull stages, fields, pipeline structure
- Writing style analysis: scan sent emails to establish voice profile
- "Suggest only" first week: regardless of autonomy setting, agent shows what it *would* have done and asks for feedback
- Feedback collection: "Was this right?" buttons on every suggestion during learning week
- Config initialisation: wizard writes to `agent_config_org_overrides`
- Skip option for advanced users who want to configure manually

**Dependencies:** PRD-01 (config), PRD-09 (methodology settings), PRD-11 (CRM mapping)

**Definition of done:** New org goes from signup to working agent in under 15 minutes. First week of "suggest only" mode collects feedback that validates or adjusts playbook rules.

**Effort:** 2 weeks

---

### PRD-24: Graduated Autonomy System
**What it delivers:** The agent earns trust over time. Based on approval patterns, it suggests promoting specific actions from "require approval" to "auto-approve" — growing the copilot's autonomy as the org gains confidence.

**Scope:**
- Approval tracking: per-action approval/rejection/edit rates over time
- Promotion rules engine: configurable thresholds (min approvals, max rejection %, min days active)
- Suggestion delivery: Slack message + settings UI banner when promotion criteria met
- One-click promotion: "Yes, auto-approve this going forward"
- Demotion: if rejection rate spikes after promotion, suggest reverting
- Dashboard: autonomy progression over time (visual)
- Manager controls: which actions can be auto-promoted, org-wide vs per-rep
- Integration with settings UI (PRD-10): show promotion suggestions inline

**Dependencies:** PRD-10 (autonomy settings), PRD-03/04/05 (agents generating approval data)

**Definition of done:** After 30+ clean CRM field updates, system suggests auto-approval. Admin approves with one click. If accuracy drops, system suggests reverting. Net effect: autonomy increases over time without admin effort.

**Effort:** 1.5 weeks

---

## Master Dependency Map

```
Phase 0 ─── PRD-01: Config Engine ──────────────────┐
         │                                            │
         └── PRD-02: Fleet Orchestrator ──────────────┤
                                                      │
Phase 1 ─── PRD-03: Auto CRM Update ─────────────────┤
         │                                            │
         ├── PRD-04: Deal Risk Scorer ────────────────┤
         │                                            │
         └── PRD-05: Re-engagement Trigger ───────────┤
                                                      │
Phase 2 ─── PRD-06: Enhanced Morning Briefing ────────┤
         │                                            │
         ├── PRD-07: End-of-Day Synthesis ────────────┤
         │                                            │
         └── PRD-08: Internal Meeting Prep ───────────┤
                                                      │
Phase 3 ─── PRD-09: Methodology Settings ─────────────┤
         │                                            │
         ├── PRD-10: Autonomy Settings ───────────────┤
         │                                            │
         ├── PRD-11: CRM Field Mapping ───────────────┤
         │                                            │
         └── PRD-12: Custom SOP Builder ──────────────┤
                                                      │
Phase 4 ─── PRD-13: Email Signals ────────────────────┤
         │                                            │
         ├── PRD-14: Engagement Patterns ─────────────┤
         │                                            │
         └── PRD-15: Ambient Signals & Temperature ───┤
                                                      │
Phase 5 ─── PRD-16: Relationship Graph ───────────────┤
         │                                            │
         ├── PRD-17: Competitive Intelligence ────────┤
         │                                            │
         └── PRD-18: Cross-Deal Patterns ─────────────┤
                                                      │
Phase 6 ─── PRD-19: Enhanced Coaching Digest ─────────┤
         │                                            │
         ├── PRD-20: Org-Wide Learning ───────────────┤
         │                                            │
         └── PRD-21: Forecast Accuracy ───────────────┤
                                                      │
Phase 7 ─── PRD-22: Conversational Slack Interface ───┤
                                                      │
Phase 8 ─── PRD-23: Onboarding Wizard ───────────────┘
         │
         └── PRD-24: Graduated Autonomy
```

---

## Effort Summary

| Phase | PRDs | Estimated Weeks | Parallelisable? |
|---|---|---|---|
| **Phase 0: Foundation** | PRD-01, PRD-02 | 3–4 weeks | Sequential (02 depends on 01) |
| **Phase 1: Core Agents** | PRD-03, PRD-04, PRD-05 | 6–8 weeks | Partially (03 first, then 04+05 can overlap) |
| **Phase 2: Daily Rhythm** | PRD-06, PRD-07, PRD-08 | 3–4 weeks | All three can parallelise |
| **Phase 3: Settings UI** | PRD-09, PRD-10, PRD-11, PRD-12 | 4–5 weeks | 09+11 parallel, then 10+12 |
| **Phase 4: Signal Intelligence** | PRD-13, PRD-14, PRD-15 | 4–5 weeks | Sequential (13 → 14 → 15) |
| **Phase 5: Knowledge** | PRD-16, PRD-17, PRD-18 | 4–5 weeks | All three can parallelise |
| **Phase 6: Coaching** | PRD-19, PRD-20, PRD-21 | 3–4 weeks | 19 first, then 20+21 parallel |
| **Phase 7: Conversational** | PRD-22 | 3–4 weeks | Independent |
| **Phase 8: Onboarding** | PRD-23, PRD-24 | 2–3 weeks | Sequential |
| **Total** | **24 PRDs** | **32–42 weeks** | |

**With a 2-person team and aggressive parallelisation: ~6–7 months**
**Solo developer: ~8–10 months**
**3+ person team: ~5–6 months**

---

## Strategic Sequencing Notes

### What to ship first for maximum impact
Phases 0–1 are the foundation. But Phase 2 (daily rhythm) delivers the most *perceptible* value to users. If you need to demo or get early feedback, the enhanced morning briefing + end-of-day synthesis will make the product feel alive before the full agent fleet is complete.

### What can start earning revenue earliest
PRD-03 (Auto CRM Update) is the single feature most likely to convert trial users. "I never have to update my CRM again" is a concrete, daily pain point solved. Ship this and measure conversion.

### What builds the moat
Phases 5–6 (Knowledge & Coaching) are where the competitive moat forms. Competitive intelligence that compounds, cross-deal patterns that get smarter, org-wide learning that improves coaching — these create switching costs that grow with usage. A competitor can copy your features but not your accumulated intelligence.

### What can be de-scoped if needed
PRD-15 (Ambient Signals) and PRD-20 (Org-Wide Learning) are the most complex and need the most data volume to be valuable. They can be deferred without breaking the rest. PRD-22 (Conversational Slack) is high-impact but also high-effort — it's a product differentiator, not a dependency.

### When to sell vs when to build
After Phase 1 is live, you have a sellable product. After Phase 2, you have a demonstrably different product from competitors. After Phase 4, you have the "always-on" story. After Phase 6, you have the moat. Selling can start at Phase 1 — don't wait for perfection.