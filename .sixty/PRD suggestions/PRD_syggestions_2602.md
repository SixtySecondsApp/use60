# 60 — Next Priority PRDs (v4 — Final)

**Date:** 26 February 2026
**Revision:** v4 — corrected for orchestrator being live and `meeting_ended` chain already running through 5 waves

---

## The Real Picture

Every previous version of this document underestimated what's built. Here's where we actually stand:

| System | Status |
|--------|--------|
| Agent Memory | ✅ 90% — event-sourced deal memory, contact memory with decay, rep memory, 10-file shared module |
| Credit Governance | ✅ Complete — ledger, budgets, fleet throttle, model router, alerts |
| Autonomy / Autopilot | ✅ Complete — confidence, promotion/demotion engines, settings UI |
| Orchestrator | ✅ Running — event-driven sequences, HITL pause/resume, chain depth limits, idempotency, dead-letter retry |
| `meeting_ended` Chain | ✅ Running — 5 waves: classify → extract + detect intents + coaching → suggest + draft email + tasks + CRM → signal processor → Slack |
| Relationship Graph | 50-60% — health scoring, ghost detection, deal truth, contact graph |
| Control Room | 60% — data sources live, dashboards scattered, no unified manager view |
| **Email Send** | ❌ The draft is generated in Wave 3. Then it stops. |

The orchestrator question is answered. Intent detection is **already running** in Wave 2 (`detect-intents`). Follow-up email drafting is **already running** in Wave 3 (`draft-followup-email`). The entire pipeline from meeting end to drafted email is live and automated.

The gap is two missing steps at the tail of an already-running pipeline:

1. No Slack message to the rep with the draft + [Approve] [Edit] [Skip] buttons
2. No `send-followup-email` skill that fires after approval

That's it. That reframes every PRD.

---

## Revised Top 5 PRDs

### PRD-01: Close the Email Loop — HITL Approval + Gmail/O365 Send

**What changed:** This is no longer "build email as a channel." It's "wire two missing steps onto an existing 5-wave pipeline." The draft already exists in the Wave 3 output. The HITL infrastructure (`requires_approval`, `waiting_for_approval_since`, `resume_job_id`, Slack interactive handlers) is built into the orchestrator runner. The autonomy system is live with email.send pre-configured as the highest-stakes action type. The credit ledger is running.

**The actual build:**

*Step 1 — Slack approval message (~3-5 days):*
- After `draft-followup-email` completes in Wave 3, emit a Slack Block Kit message to the rep with: full email preview (to, subject, body), [Approve] [Edit in 60] [Schedule] [Skip] buttons
- Wire buttons through existing `slack-interactive` handler → update `slack_pending_actions` → set `requires_approval: true` on the sequence job → orchestrator pauses
- On [Approve]: orchestrator resumes, fires `send-followup-email` skill
- On [Edit]: deep link to copilot with draft pre-loaded for editing, then re-submit for approval
- On [Skip]: mark job completed, log skip reason in daily logs
- On [Schedule]: show time picker, queue delayed send

*Step 2 — Gmail/O365 send skill (~1-1.5 weeks):*
- `send-followup-email` skill: takes draft from sequence job context, sends via connected email account
- Gmail API: OAuth scope upgrade to `gmail.send` — thread-aware replies with correct `In-Reply-To` / `References` headers, email appears in rep's Sent folder
- Microsoft Graph: `Mail.Send` equivalent
- Signature detection and appending from connected account
- Send logged to: CRM activity timeline, `credit_ledger`, `agent_daily_logs` (when PRD-04 ships)
- 30-second undo window post-send (Slack message updates with [Undo] button, send is actually delayed 30s)
- Daily send cap per rep (configurable, default 50)

*Step 3 — Autonomy gating (~2-3 days):*
- email.send starts at `approve` tier for all orgs — every send requires HITL approval
- Autopilot confidence model starts accumulating signals from day one (approve/edit/reject/undo)
- Emergency demotion on any single undo (already spec'd in demotion engine)
- Rubber-stamp threshold: 5000ms (already spec'd)
- As confidence builds, autopilot proposes promotion to `auto` tier via existing Slack promotion flow
- When `auto`: email sends immediately, Slack notification shows [Undo] instead of [Approve]

**What it unlocks:**
- The `meeting_ended` pipeline becomes end-to-end: meeting ends → transcribe → analyse → detect intents → draft follow-up → **approve → send → log**. Zero context switches.
- Every other agent that drafts outreach (re-engagement, morning brief actions, proposal follow-ups) immediately gets a send path
- Autopilot starts learning email.send confidence from real approval signals
- The product promise — "follow-up email sent before you think about it" — becomes real

**Effort:** 1.5-2 weeks. Not 2-3 weeks like v3 estimated, because the orchestrator HITL infrastructure and autonomy gating already exist.

**Dependencies:** None. Everything this needs is live.

---

### PRD-02: Relationship Graph Intelligence Layer

**What changed:** Moved up from #3 to #2. With intent detection already running (Wave 2) and email send about to close the loop (PRD-01), the next highest-leverage capability is enriching agent intelligence. The relationship graph foundation is 50-60% built — health scoring, ghost detection, deal truth, contact graph. What's missing is the intelligence that makes it useful: who's the champion, who's blocking, are we single-threaded, did someone change jobs.

The `deal_contacts` junction table is the structural prerequisite. Without it, every relationship insight is deal-level ("this deal has a champion") instead of graph-level ("Sarah is champion on Deal A, blocker on Deal B, and just moved to Company C").

**The actual build:**

*Schema (~2-3 days):*
- `deal_contacts` junction table: deal_id, contact_id, role (champion / blocker / economic_buyer / influencer / end_user / technical_evaluator), confidence, inferred_from (transcript / email_pattern / manual / enrichment), first_seen, last_active
- `contact_org_history` table: contact_id, company_id, title, started_at, ended_at, source (linkedin / apollo / crm_update / email_domain_change)

*Role inference (~1 week):*
- Transcript-based: post-meeting analysis (new step in `meeting_ended` Wave 2) classifies attendee roles from speaking patterns, questions asked, authority signals, objection types. Writes to `deal_contacts` with confidence scores.
- Email-based: CC/BCC positioning, reply authority, forwarding patterns → role inference. Lighter weight, runs on email signal events.
- Manual override: rep can correct inferred roles via contact detail page or Slack interactive response.

*Graph intelligence (~1 week):*
- Cross-deal stakeholder RPC: "show me contacts appearing across multiple open deals with their role in each"
- Multi-threading score: contacts engaged / contacts needed by deal stage. Alert when single-threaded.
- Job change detection: periodic Apollo check on key contacts (champions, economic buyers). Email domain change monitoring on inbound emails.
- Wire `champion_disappeared` ghost detection signal (signal type exists, logic doesn't) — uses deal_contacts.last_active vs threshold.

*Agent integration (~3-5 days):*
- Meeting prep agent: query deal_contacts + contact_memory for per-attendee relationship context, roles, and interaction history
- Deal risk agent: champion engagement frequency, multi-threading score, blocker influence as weighted risk factors
- Re-engagement agent: job change events become high-priority triggers with full relationship context from contact_memory + contact_org_history
- Draft follow-up email (Wave 3): personalise based on attendee roles and relationship strength

**Effort:** 3 weeks. Junction table + role inference is the core. Cross-deal queries and agent integration add the final week.

**Dependencies:** Agent memory (built). Fleet agents (built, for consuming graph data).

---

### PRD-03: Agent Daily Logs — The Audit Trail

**What changed:** Elevated in urgency. Now that we know the orchestrator is running 5-wave chains automatically and email send is about to go live, the audit trail matters more. A manager needs to see: "At 2:14pm, the meeting_ended chain fired for the Acme call. Wave 1 classified it as a discovery call. Wave 2 detected 3 commitments and flagged a competitive mention. Wave 3 drafted a follow-up email. At 2:18pm, Andrew approved with a minor edit to paragraph 2. At 2:19pm, email sent to sarah@acme.com."

Without this, the system is doing real things (soon including sending emails) with no narrative record. The autopilot confidence model works on signals alone. The Control Room (PRD-05) has no action feed to display.

**The actual build:**

- `agent_daily_logs` table: id, org_id, user_id, agent_type, action_type, action_detail (JSONB), decision_reasoning (text), input_context_summary (text), outcome (success / failed / pending / cancelled), error_message, credit_cost, execution_ms, chain_id (links to orchestrator chain), wave_number, created_at
- Partitioned by date, 90-day retention, auto-pruned via pg_cron
- `_shared/memory/dailyLog.ts` — `logAgentAction()` function following existing `_shared/memory/*.ts` patterns
- Integration hooks: orchestrator runner logs each wave step, `send-followup-email` logs send outcome, fleet agents log at decision points
- chain_id + wave_number fields enable full chain replay: given a chain_id, see every step in order with timing, cost, reasoning, and outcome

**Effort:** 1 week. Single table, one shared module, integration hooks.

**Dependencies:** None. Ships in parallel with PRD-01.

---

### PRD-04: The Control Room — Unified Manager View

**What changed:** Simplified scope. With the orchestrator running, email send landing, and daily logs providing the narrative feed, this becomes a straightforward aggregation UI. All data sources are live. The build is connecting dots, not creating infrastructure.

**What exists already:**
- Command Centre at `/command-centre` (rep's personal inbox)
- Orchestrator Dashboard at `/platform/orchestrator-dashboard` (engineering monitoring)
- Agent Performance at `/platform/agent-performance` (dev telemetry)
- Autonomy Settings at `/settings/autonomy` (per-user config)
- All underlying tables populated: `command_centre_items`, `autopilot_confidence`, `autopilot_events`, `credit_ledger`

**What's missing:** One screen, manager-facing, that answers: "What did 60 do for my team today? Is it working? How much is it costing? Who's earning autonomy?"

**The actual build:**

- Route: `/admin/control-room` (admin/owner role via existing RLS)
- **Fleet Pulse**: 8 agents × status (running / idle / throttled / errored), last execution, items generated today, 7-day error rate trend. Sourced from orchestrator execution logs + fleet throttle state.
- **Team Autonomy Matrix**: reps (rows) × action types (columns) showing current tier with colour coding. Promotion badges on recent changes. Click-through to per-rep detail. Sourced from `autopilot_confidence` + `autopilot_events`.
- **Credit Health**: daily burn rate vs budget gauge, per-agent cost breakdown (pie/donut), 30-day trend line, projected exhaustion date. Sourced from `credit_ledger` rollups.
- **Action Feed**: cross-team stream from `agent_daily_logs`, filterable by rep / agent / action type / outcome. Each entry expandable to show chain context and decision reasoning. Falls back to `command_centre_items` + `autopilot_events` where daily logs aren't yet integrated.
- **ROI Summary**: hours saved (automated actions × configurable avg manual time), median follow-up speed (meeting end → email sent timestamp delta), pipeline coverage (% active deals with agent engagement in 7 days).
- Realtime subscription for action feed, 5-minute polling for aggregates.

**Effort:** 2 weeks. Frontend aggregation over live data sources.

**Dependencies:** PRD-03 (Daily Logs) for the rich action feed. Works without it but noticeably better with it.

---

### PRD-05: Complete the Meeting-to-Action Pipeline — Calendar + Proposal Send

**What changed:** This is new. With the orchestrator running the full `meeting_ended` chain, intent detection already in Wave 2, email send landing in PRD-01, and relationship intelligence enriching context in PRD-02 — the next gap is: what about the other commitment types? "I'll send you a proposal" is detected but there's no automated proposal-to-send pipeline. "Let's schedule a follow-up" is detected but there's no calendar availability finder.

These are the remaining legs of the post-meeting pipeline. PRD-01 closes the email loop. PRD-05 closes the calendar and proposal loops.

**Calendar Availability Finder:**
- `find-available-slots` skill: reads rep's Google Calendar for next 5-10 business days
- Slot scoring: respects existing meetings, buffer preferences, quiet hours from `slack_user_preferences`, prospect timezone from CRM/email
- Slack output: top 3-5 options with [Send times via email] [Send calendar invite] [Show more] [I'll handle this]
- Triggered by: intent detection (`schedule_meeting` commitment), email classification (meeting request), direct Slack command, morning brief button
- Wire into orchestrator: `schedule_meeting` intent → `find-available-slots` skill → HITL approval → `send-followup-email` with times (PRD-01) or Calendar API invite

**Proposal Pipeline Wiring:**
- `generate-proposal` edge function exists but isn't wired to the orchestrator
- Wire: `send_proposal` intent (from detect-intents Wave 2) → template selection based on deal type + discussed topics (from deal memory) → `generate-proposal` → HITL approval → send via email (PRD-01)
- Proposal populated with: company context, discussed requirements (from transcript intents), pricing tier, relevant case studies, ROI projections referencing specific conversation points
- Deal memory enrichment: proposal sent logged as `deal_memory_event` for tracking ("proposal sent on Feb 26, covering pricing and implementation timeline")

**Effort:** 2-3 weeks. Calendar finder is the heavier lift (Google Calendar API write for invites); proposal wiring is mostly orchestrator configuration since `generate-proposal` exists.

**Dependencies:** PRD-01 (Email Send) for delivery. Intent detection (already running in Wave 2) for triggers. Deal memory (built) for proposal context.

---

## Ship Sequence

```
Week 1-2:   PRD-01 (Close the Email Loop)     + PRD-03 (Daily Logs) in parallel
Week 3-5:   PRD-02 (Relationship Intelligence) + PRD-04 (Control Room) in parallel
Week 5-7:   PRD-05 (Calendar + Proposal Send)
```

**Total: ~7 weeks with parallelisation.**

Week 1 is the inflection point. The moment `send-followup-email` goes live and the HITL approval lands in Slack, every meeting that 60 records produces a ready-to-send follow-up email in the rep's Slack within minutes. That's the wow moment. Everything after compounds it.

---

## What's Left After These 5

For context, here's what remains from the original capability gap list after these PRDs ship:

| Capability | Status After These PRDs |
|---|---|
| Orchestrator | ✅ Was already running |
| Intent Detection | ✅ Was already running (Wave 2) |
| Email Send | ✅ PRD-01 |
| Calendar Finder | ✅ PRD-05 |
| Proposal Pipeline | ✅ PRD-05 |
| Relationship Graph | ✅ PRD-02 (intelligence layer) + existing foundation |
| Agent Memory | ✅ Already built + PRD-03 (daily logs) |
| Credit Governance | ✅ Already built |
| Control Room | ✅ PRD-04 |
| Campaign Monitoring (Instantly) | ❌ Future — automated reply handling + performance monitoring |
| Coaching & Trend Analysis | Partial — micro-feedback runs in Wave 2, weekly digest and trend analysis not yet built |
| `agent_daily_logs` | ✅ PRD-03 |

After these 5 PRDs, the two remaining gaps are Campaign Monitoring (Instantly reply handling and performance optimisation) and deep Coaching (weekly digest, talk ratio trends, win/loss pattern correlation). Both build on infrastructure that will exist — coaching already has micro-feedback in Wave 2 and rep_memory tracking patterns; campaigns need the Instantly API integration deepened.

The platform goes from "observes, scores, drafts" to "observes, scores, drafts, sends, tracks commitments, maps relationships, logs everything, and shows the manager it's working." That's a fundamentally different product.