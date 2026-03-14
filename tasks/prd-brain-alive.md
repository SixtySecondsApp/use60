# PRD: Brain Alive — 10 Intelligence Features That Make 60 a Teammate

## Introduction

The Brain infrastructure is built (Trinity Build: 19 stories, all complete). The memory tables exist, the UI renders, the data flows. But the Brain is currently passive — it shows what's been manually seeded. These 10 features make it **self-filling, proactive, and actionable**. The difference between a dashboard and a teammate.

The keystone is **Post-Meeting Auto-Extract** (#4) — without it, the Brain relies on manual seeding. Everything else builds on a Brain that fills itself from every meeting, email, and CRM event.

## Goals

- Brain populates automatically from every meeting — zero manual data entry
- Morning brief surfaces cross-referenced insights (commitments + decay + sentiment), not just counts
- Reps get accountability nudges when commitments slip or contacts go cold
- Every Slack notification threads into one daily conversation, not notification spam
- AI-drafted emails adapt to contact preferences learned from meeting history
- Win/loss patterns emerge from aggregated coaching data across deals

## User Stories

### FOUNDATION LAYER (must ship first)

### BA-001: Post-Meeting Memory Extraction — Auto-Fill the Brain
**Description:** As a rep, I want the agent to automatically extract commitments, objections, signals, stakeholder insights, and sentiment from every meeting transcript so that the Brain fills itself without manual work.

**Acceptance Criteria:**
- [ ] New orchestrator step `extract-deal-memories` added to `meeting_ended` sequence in Wave 2b
- [ ] Step depends on `extract-action-items` (needs the parsed transcript context)
- [ ] Calls a new edge function `extract-deal-memories` that uses Claude Haiku to extract structured events
- [ ] Extraction prompt produces: commitments (with owner + deadline), objections (with blocker flag), signals (buying/risk), stakeholder roles, sentiment assessment
- [ ] Each extracted item written to `deal_memory_events` with correct event_type, event_category, source_type='transcript'
- [ ] Contact memory updated via existing `updateContactFromEvent()` — relationship_strength boosted per meeting
- [ ] `next_steps_oneliner` parsed into individual commitment events with `detail.owner` and `detail.status='pending'`
- [ ] If no deal linked to meeting, events still created with deal_id=NULL (contact-level memory)
- [ ] Extraction runs best-effort (errors logged, never blocks the sequence)
- [ ] Typecheck passes

### BA-002: Morning Brief 2.0 — Cross-Referenced Intelligence
**Description:** As a rep, I want my morning brief to surface overdue commitments, decaying relationships, and sentiment trends — not just meeting counts — so I know exactly what needs attention.

**Acceptance Criteria:**
- [ ] `agent-morning-briefing/assembleBriefing()` enhanced to query Brain tables
- [ ] Fetches: overdue commitments (via `getOverdueCommitments()`), contacts with relationship_strength < 0.4, deals with negative sentiment trend (last meeting sentiment < 0.5)
- [ ] Haiku narrative prompt updated to include: "Commitments slipping", "Contacts going cold", "Deals at risk" sections
- [ ] Brief prioritizes action items over informational summaries
- [ ] Slack brief includes up to 3 specific actionable nudges with contact/deal names
- [ ] CC item created with item_type='morning_brief' containing the full brief
- [ ] Typecheck passes

### BA-003: Daily Slack Thread — One Thread, All Intelligence
**Description:** As a rep, I want all my agent's daily activity in a single Slack thread so I have one place to see everything instead of scattered notifications.

**Acceptance Criteria:**
- [ ] `send-slack-message` edge function gains optional `thread_ts` parameter
- [ ] When `thread_ts` provided, message posts as reply to existing thread
- [ ] Morning brief creates the daily thread, stores `thread_ts` in `agent_daily_logs` metadata
- [ ] Post-meeting summaries, commitment alerts, and decay warnings post as replies to the same thread
- [ ] New shared utility `getDailyThreadTs(userId, orgId, supabase)` — finds or creates today's thread
- [ ] Thread auto-creates a new one each day (no stale threads from yesterday)
- [ ] If thread lookup fails, falls back to direct DM (never silent)
- [ ] Typecheck passes

### ACCOUNTABILITY LAYER (needs BA-001)

### BA-004: Commitment Accountability Tracker — "You Said You Would"
**Description:** As a rep, I want the agent to alert me when commitments are overdue or approaching deadline so that I never forget a promise.

**Acceptance Criteria:**
- [ ] New cron job `check-commitment-deadlines` runs daily at 9am UTC
- [ ] Scans `deal_memory_events` for commitment_made events where `detail.deadline < NOW() + 48h` and `detail.status = 'pending'`
- [ ] Overdue commitments (deadline passed) fire immediate Slack alert via daily thread
- [ ] Approaching commitments (within 48h) fire gentle nudge
- [ ] Alert includes: commitment summary, deal name, contact name, days overdue/remaining
- [ ] CC item created with urgency='high' for overdue, 'normal' for approaching
- [ ] Cron respects `proactive_agent_config.is_enabled` and user opt-out (TRINITY-007 pattern)
- [ ] Typecheck passes

### BA-005: Decay Alerts — "Contacts Going Cold"
**Description:** As a rep, I want the agent to warn me when contact relationships are decaying so I can re-engage before deals go silent.

**Acceptance Criteria:**
- [ ] `runRelationshipDecay()` enhanced to return contacts that crossed below 0.4 threshold during this run
- [ ] New cron job `check-contact-decay` runs weekly (matches existing decay cron schedule)
- [ ] Contacts crossing below 0.4 fire a Slack alert: "{Name} at {Company} — relationship decaying. Last interaction {N} days ago."
- [ ] Alert suggests a re-engagement action (email, meeting, or Slack)
- [ ] CC item created with item_type='decay_alert' and inline action options
- [ ] Groups multiple decaying contacts into one alert (not one notification per contact)
- [ ] Typecheck passes

### INTELLIGENCE LAYER (needs BA-001 + BA-002)

### BA-006: Pre-Meeting Memory Injection
**Description:** As a rep, I want my pre-meeting brief to include everything the Brain knows about the contact — sentiment history, open commitments, coaching notes, communication style — so I walk in fully prepared.

**Acceptance Criteria:**
- [ ] `pre_meeting_90min` orchestrator step enhanced to query Brain tables
- [ ] Fetches: `contact_memory` (relationship_strength, communication_style, total_meetings), `copilot_memories` (recent deal/relationship memories for contact), `deal_memory_events` (open commitments, recent objections for linked deal)
- [ ] Memory context injected into the meeting prep prompt alongside calendar/CRM data
- [ ] Prep output includes: "What the Brain knows" section with relationship strength, open commitments, last sentiment, coaching tips
- [ ] If no Brain data exists for contact, falls back to standard prep (no errors)
- [ ] Posts to daily Slack thread (BA-003)
- [ ] Typecheck passes

### BA-007: Contact Intelligence in Email Drafts
**Description:** As a rep, I want the copilot to automatically adapt email tone and content based on what the Brain knows about the recipient — their communication style, budget sensitivity, preferred meeting times.

**Acceptance Criteria:**
- [ ] `copilot-autonomous` system prompt enhanced: before composing emails, fetches contact_memory + copilot_memories for the target contact
- [ ] Memory context injected as "[CONTACT INTELLIGENCE]" block in system prompt
- [ ] Email drafts adapt: formal/casual tone matching, length preferences, known objections to preempt, relationship strength context
- [ ] If contact has low relationship_strength (<0.4), draft includes re-engagement warmth
- [ ] If contact has known budget sensitivity (from objection events), draft avoids leading with price
- [ ] Works for both copilot chat and CC inline action "Reply Email"
- [ ] Existing email behavior unchanged when no contact intelligence exists
- [ ] Typecheck passes

### ANALYTICS LAYER (needs BA-001 running for 1+ weeks)

### BA-008: Coaching Pattern Dashboard — "Why You Win, Why You Lose"
**Description:** As a rep, I want to see aggregated coaching patterns — talk time correlation with outcomes, common objection types, win/loss factors — so I can improve systematically.

**Acceptance Criteria:**
- [ ] New Brain tab "Coaching" or section on existing Brain page
- [ ] Queries meetings with coaching data: talk_time_rep_pct vs sentiment_score scatter plot
- [ ] Shows: "Your avg sentiment is {X} when talk time <45%, {Y} when >55%"
- [ ] Top 3 coaching strengths aggregated from coach_summary across all meetings
- [ ] Top 3 coaching improvement areas aggregated from coach_summary
- [ ] Win/loss correlation if deal outcome data available (deals.status = 'won' vs 'lost')
- [ ] Uses Recharts (existing charting library) with GoldenEye dark theme compatibility
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### BA-009: Pipeline Sentiment Ticker
**Description:** As a rep, I want a single glance view of pipeline health based on real meeting sentiment — not just deal stages — so I can see which deals are actually healthy vs just labeled correctly.

**Acceptance Criteria:**
- [ ] New component `PipelineSentimentTicker` — shows aggregate sentiment across active pipeline
- [ ] Queries: latest meeting sentiment per deal (meetings grouped by company/deal, most recent sentiment_score)
- [ ] Displays: overall pipeline sentiment (avg), trend arrow (up/down based on last 7 days vs prior 7), count of deals trending negative
- [ ] Red/amber/green traffic light: <0.5 red, 0.5-0.7 amber, >0.7 green
- [ ] Positioned on Brain page header or dashboard
- [ ] Clicking a deal in the ticker navigates to deal detail
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### BA-010: Win/Loss Pattern Memory
**Description:** As a rep, I want the agent to identify patterns across won and lost deals — what behaviors, talk ratios, and objection handling approaches correlate with winning — so coaching is data-driven.

**Acceptance Criteria:**
- [ ] New edge function or Brain tab section that aggregates deal outcomes with meeting coaching data
- [ ] For won deals: extract common patterns from coach_summary (strengths), avg talk_time, avg sentiment
- [ ] For lost deals: extract common patterns from coach_summary (improvements), avg talk_time, avg sentiment, common objections
- [ ] Produces: "You win when..." and "You lose when..." pattern summaries
- [ ] Stores patterns in copilot_memories (category='fact') for use in future morning briefs and email drafts
- [ ] Refreshes monthly via cron or on-demand via Brain page button
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Post-meeting memory extraction must process within 30 seconds and never block the existing orchestrator sequence
- FR-2: All Slack notifications must attempt daily thread delivery before falling back to DM
- FR-3: Commitment alerts must respect user opt-out via marketplace toggle (TRINITY-007 pattern)
- FR-4: Contact intelligence injection must add <500 tokens to copilot system prompts (keep latency low)
- FR-5: All new cron jobs must check `proactive_agent_config.is_enabled` before processing
- FR-6: Analytics queries must be indexed and paginated — no full table scans on meetings (1,700+ rows)

## Non-Goals (Out of Scope)

- Email send integration (already exists via hitl-send-followup-email)
- Calendar booking automation (already exists via orchestrator calendar steps)
- Multi-org Brain isolation (handled by TRINITY-002 RLS already applied)
- Custom extraction prompt editing by users (future — keep extraction prompt internal for now)
- Real-time transcript analysis during meetings (post-meeting only)

## Technical Considerations

- **New edge function:** `extract-deal-memories` — uses Claude Haiku for structured extraction from transcript text
- **Orchestrator change:** Add step to `eventSequences.ts` meeting_ended sequence (Wave 2b)
- **Slack threading:** Add `thread_ts` param to `send-slack-message`, new `getDailyThreadTs()` utility
- **New cron jobs:** `check-commitment-deadlines` (daily 9am), `check-contact-decay` (weekly, extends existing)
- **Brain table writes:** All features write to existing `deal_memory_events`, `contact_memory`, `copilot_memories` — no new tables needed
- **Existing patterns:** Follow `cronPreferenceGate.ts` for cron opt-out, `fleetRouter.ts` cache pattern for contact memory lookups
- **Pin `@supabase/supabase-js@2.43.4`** on esm.sh in any new edge functions

## Success Metrics

- Brain auto-fills 5+ memory events per meeting (no manual seeding)
- Morning brief includes at least 1 cross-referenced insight (commitment + contact + deal)
- Commitment alerts fire within 24h of deadline
- Rep engagement with Brain page >3 visits/week
- Daily Slack thread consolidates >80% of agent notifications into single thread

## Open Questions

- None — all technical details verified against codebase
