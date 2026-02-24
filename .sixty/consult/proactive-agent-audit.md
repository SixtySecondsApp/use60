# Proactive Agent V2 — Audit Against Original Brief

**Date**: 14 February 2026
**Scope**: Compare `docs/copilot/proactive_agent_plan.md` (13 Feb 2026) to current `feat/proactive-agent-v2` branch
**Method**: Full codebase read of all orchestrator files, adapters, edge functions, migrations, and frontend components

---

## Executive Summary

The orchestrator core is **genuinely excellent** — the runner, type system, parallel wave execution, self-invocation, and state management are production-quality. The pre-meeting briefing pipeline and post-meeting debrief are the strongest end-to-end implementations.

However, the system has **significant stub coverage** that creates a gap between what the code structure suggests is complete and what would actually work in production. Of 9 declared event sequences, only **2 are fully wired end-to-end** (meeting_ended, pre_meeting_90min). The remaining 7 have partial or stub adapters.

---

## Build-by-Build Audit

### Build 1: Orchestrator Core — STRONG

| Component | Status | Evidence |
|-----------|--------|----------|
| `runner.ts` (768 lines) | Real | Self-invocation, parallel waves, retry, HITL, idempotency, chain depth limits — all implemented |
| `types.ts` (267 lines) | Real | 9 event types, 3 context tiers, full SequenceState, StepResult with followups |
| `eventSequences.ts` (475 lines) | Real | 9 sequences declared with depends_on DAGs, criticality, approval gates |
| `contextLoader.ts` (330 lines) | Real | 3-tier loading, cost budget gate, org/user/CRM context |
| `adapters/index.ts` (142 lines) | Real | 30+ adapters registered, 7 stubs clearly marked |
| `agent-orchestrator/index.ts` (85 lines) | Real | Entry point for runSequence/resumeSequence |
| Migration: `extend_sequence_jobs` | Real | event_source, event_chain, trigger_payload, idempotency_key columns |

**The "extend, don't rebuild" principle was followed.** The runner uses existing `sequence_jobs` RPCs with direct-table fallbacks. State persists through `sequence_jobs.context`. No new queue tables.

**Refinements from the plan that were implemented:**
- Context loaded once per sequence (not per-step) — addresses the plan review's concern
- Cost budget gate at sequence start — addresses the plan review's suggestion
- 30s safety margin for self-invocation — matches the recommended value
- Critical vs best-effort classification — exactly as recommended in the plan review
- Idempotency via `idempotency_key` column — addresses the duplicate event concern

**Plan's "done when" criteria**: *"A meeting ends and the rep receives a Slack message within 5 minutes with a follow-up draft, CRM updates confirmed, and action items created."*
**Current reality**: The meeting_ended sequence has 9 steps across 4 parallel waves. All steps have real adapters. Slack delivery via `notifySlackSummaryAdapter` collects all upstream outputs and sends a rich Block Kit debrief. This flow is the closest to production-ready.

---

### Build 2: Intent Detection — SOLID

| Component | Status | Evidence |
|-----------|--------|----------|
| `detect-intents/index.ts` (279 lines) | Real edge function | Claude Haiku, structured JSON output, confidence scoring |
| `adapters/detectIntents.ts` (226 lines) | Real adapter | Context enrichment, commitment-to-followup mapping, multiple fallback paths |
| Wired into `meeting_ended` wave 2 | Real | `depends_on: ['classify-call-type']`, `criticality: 'best-effort'` |

**Followup event generation works**: If detect-intents finds "I'll send a proposal", it creates a `QueuedFollowup` with `type: 'proposal_generation'`. The runner's `processFollowups()` fires these as new orchestrator events.

**Gap**: The `proposal_generation` sequence those followups would trigger has 3 of 4 steps stubbed (see Build 5).

---

### Build 3: Calendar Availability — EDGE FUNCTION REAL, ADAPTER PARTIAL

| Component | Status | Evidence |
|-----------|--------|----------|
| `find-available-slots/index.ts` (376 lines) | Real edge function | Google Calendar API, timezone handling, working hours, slot scoring |
| `create-calendar-event/index.ts` (207 lines) | Real edge function | Google Calendar event creation with attendees |
| `slack-interactive/handlers/calendar.ts` (271 lines) | Real handler | Block Kit time slot UI, send-times/send-invite buttons |
| `adapters/calendar.ts` | Real adapter | `findAvailableSlotsAdapter` + `presentTimeOptionsAdapter` |
| `parse-scheduling-request` | **STUB** | "Scheduling request parsing not yet implemented" |

**The `calendar_find_times` sequence has 3 steps**: parse-scheduling-request (STUB) -> find-available-slots (REAL) -> present-time-options (REAL). The first step being a stub means this sequence can't be triggered via the orchestrator pipeline — but the edge functions themselves work when called directly.

---

### Build 4: Email Send-as-Rep — REAL

| Component | Status | Evidence |
|-----------|--------|----------|
| `email-send-as-rep/index.ts` (309 lines) | Real edge function | Gmail API, thread-aware, 50/day rate limit, audit trail |
| `slack-interactive/handlers/emailSend.ts` (254 lines) | Real handler | Preview, send/edit/cancel buttons, 30s undo window |
| `adapters/emailSend.ts` | Real adapter | `draftFollowupEmailAdapter` + `sendEmailAsRepAdapter` |
| `email_send_log` migration | Real | Full audit trail table |
| `EmailSendPermission.tsx` (224 lines) | Real component | OAuth scope upgrade UI |

**This is the most complete build from a safety perspective.** Every safety rail from the plan is implemented: HITL approval, daily send limits, audit trail, undo window.

**Gap**: The plan called out the OAuth re-authorization migration path (users with read-only scope need to re-auth). The `EmailSendPermission.tsx` component handles the UI prompt, but the actual scope detection (checking what scopes a user has granted) isn't verified.

---

### Build 5: Proposal Pipeline — MOSTLY STUBBED

| Component | Status | Evidence |
|-----------|--------|----------|
| `adapters/proposalGenerator.ts` | Real adapter | Wraps existing `generate-proposal` edge function |
| `slack-interactive/handlers/proposal.ts` (209 lines) | Real handler | Approve & send, edit, share link, skip buttons |
| `populate-proposal` | **STUB** | "Proposal population not yet implemented" |
| `generate-custom-sections` | **STUB** | "Custom section generation not yet implemented" |
| `present-for-review` | **STUB** | "Review presentation not yet implemented" |

**The `proposal_generation` sequence has 4 steps**: select-proposal-template (REAL) -> populate-proposal (STUB) -> generate-custom-sections (STUB) -> present-for-review (STUB). This means 3 of 4 steps are stubs. The Slack handler exists but can't be reached through the orchestrator pipeline.

---

### Build 6: Campaign Monitoring — ADAPTER-LEVEL ONLY

| Component | Status | Evidence |
|-----------|--------|----------|
| `monitor-campaigns/index.ts` (229 lines) | Real edge function | Instantly API, metrics, reply classification |
| `slack-interactive/handlers/campaigns.ts` (241 lines) | Real handler | Campaign report Slack blocks with action buttons |
| `adapters/campaignMonitor.ts` | Real adapters | 4 adapters: pull-metrics, classify-replies, generate-report, deliver-slack |

**All 4 steps in `campaign_daily_check` have real adapters.** This sequence should work end-to-end through the orchestrator. However, the adapters call the `monitor-campaigns` edge function — which itself calls the Instantly API. Whether this works depends on Instantly API access being configured per-org.

---

### Build 7: Coaching Analysis — ADAPTER-LEVEL ONLY

| Component | Status | Evidence |
|-----------|--------|----------|
| `coaching-analysis/index.ts` (281 lines) | Real edge function | Claude Haiku, talk ratio, question quality, objection handling |
| `slack-interactive/handlers/coaching.ts` (216 lines) | Real handler | Per-meeting micro-feedback and weekly digest blocks |
| `adapters/coaching.ts` | Real adapters | 5 adapters: micro-feedback, aggregate-weekly, correlate-win-loss, generate-digest, deliver-slack |
| `coaching_analyses` migration | Real | Full table with per-meeting and weekly analysis |

**The `coaching_weekly` sequence has 4 steps, all with real adapters.** The per-meeting `coaching-micro-feedback` is wired into `meeting_ended` wave 2. The `coaching_analyses` table stores historical data.

**Gap from plan**: Build 7 referenced `agent_preferences` for coaching frequency — the plan review noted this table doesn't exist. Current implementation uses `slack_user_preferences` which is correct.

---

## Sequences Not In Original Plan (Added)

### Deal Risk Scan — ALL STUBBED

The `deal_risk_scan` event type was added with 4 steps: `scan-active-deals`, `score-deal-risks`, `generate-risk-alerts`, `deliver-risk-slack`. **None of these have adapters in the registry.** They'll fall through to `callEdgeFunctionDirect()` which will 404 since the edge functions don't exist either.

The `deal_risk_scores` migration exists (with RPCs for upserting scores and querying high-risk deals), but nothing writes to this table yet.

The `reengagement_watchlist` migration exists, but only `research-trigger-events` has a real adapter. Both `analyse-stall-reason` and `draft-reengagement` are stubs.

---

## Stub Inventory (Complete List)

| Stub Adapter | Sequence | Impact |
|-------------|----------|--------|
| `match-to-crm-contact` | email_received | Blocks email handling pipeline |
| `populate-proposal` | proposal_generation | Blocks proposal pipeline |
| `generate-custom-sections` | proposal_generation | Blocks proposal pipeline |
| `present-for-review` | proposal_generation | Blocks proposal pipeline |
| `parse-scheduling-request` | calendar_find_times | Blocks calendar flow (but edge functions work standalone) |
| `analyse-stall-reason` | stale_deal_revival | Blocks re-engagement pipeline |
| `draft-reengagement` | stale_deal_revival | Blocks re-engagement pipeline |
| `scan-active-deals` | deal_risk_scan | No adapter at all (callEdgeFunctionDirect) |
| `score-deal-risks` | deal_risk_scan | No adapter at all |
| `generate-risk-alerts` | deal_risk_scan | No adapter at all |
| `deliver-risk-slack` | deal_risk_scan | No adapter at all |

**Total: 11 stubs/missing adapters across 4 sequences**

---

## Sequence Readiness Matrix

| Sequence | Steps | Real Adapters | Stubs | End-to-End Ready? |
|----------|-------|--------------|-------|-------------------|
| `meeting_ended` | 9 | 9 | 0 | **YES** |
| `pre_meeting_90min` | 5 | 5 | 0 | **YES** |
| `campaign_daily_check` | 4 | 4 | 0 | **YES** (needs Instantly config) |
| `coaching_weekly` | 4 | 4 | 0 | **YES** |
| `email_received` | 2 | 1 | 1 | NO — match-to-crm-contact stub |
| `calendar_find_times` | 3 | 2 | 1 | NO — parse-scheduling-request stub |
| `proposal_generation` | 4 | 1 | 3 | NO — 3 stubs |
| `stale_deal_revival` | 3 | 1 | 2 | NO — 2 stubs |
| `deal_risk_scan` | 4 | 0 | 4 | NO — no adapters exist |

**Summary: 4 of 9 sequences are end-to-end ready. 5 have blocking stubs.**

---

## What's Real vs What Needs Work

### Genuinely Production-Ready
1. **Orchestrator runner** — parallel waves, self-invocation, retry, HITL, idempotency
2. **Post-meeting debrief pipeline** (meeting_ended) — all 9 steps, rich Slack Block Kit output
3. **Pre-meeting briefing** (pre_meeting_90min) — 5 real adapters, parallel Gemini research, Claude synthesis, Slack delivery
4. **Email send safety rails** — HITL, audit trail, rate limits, undo window
5. **Database schema** — all 4 new migrations are well-designed with RPCs
6. **Frontend demo page** — ProactiveAgentV2Demo.tsx with simulation + live mode
7. **Agent UI components** — 13 components for ability management and visualization

### Needs Completion Before Production
1. **Proposal pipeline** — 3 of 4 steps stubbed. Edge functions exist but not adapter-wired.
2. **Calendar scheduling** — parse-scheduling-request stub blocks the flow. Edge functions work standalone.
3. **Email received handler** — match-to-crm-contact stub. Classification works but can't route.
4. **Stale deal revival** — 2 of 3 steps stubbed. Only research-trigger-events is real.
5. **Deal risk scan** — Entire sequence has zero adapters. Migration schema exists but nothing populates it.

### Discrepancies From Plan

| Plan Said | Reality |
|-----------|---------|
| "Upgrade morning brief Slack blocks with richer format" | Morning brief (`slack-morning-brief`) was updated but uses its own format, not the orchestrator. It runs as a standalone cron, not through `agent-orchestrator`. |
| "Upgrade `meetingbaas-webhook` to call orchestrator" | `meetingbaas-webhook` is listed as wired but the actual webhook → orchestrator integration needs verification — the webhook processes transcripts and the orchestrator fire-and-forget happens after |
| "No new queue tables" | Correct — no new queue tables created. `sequence_jobs` extended as planned. |
| "Builds 4 and 5 run in parallel" | Both were built in the same commit, but Build 5 is mostly stubs while Build 4 is complete |
| "Each build unlocks the next" | The dependency chain is solid for Builds 1→2→orchestrator, but Builds 3-7 are more independent than sequential |

---

## Risk Assessment

### High Priority (blocks core value)
1. **Proposal pipeline stubs** — Intent detection queues `proposal_generation` events that hit 3 stubs. This means the plan's key value prop ("rep says 'I'll send a proposal' → 5 min later gets a draft") doesn't work end-to-end yet.
2. **No cron trigger for orchestrator** — The event sequences for `campaign_daily_check`, `coaching_weekly`, and `deal_risk_scan` are defined but there's no cron job calling `agent-orchestrator` with these event types. The existing crons (`slack-morning-brief`, `slack-stale-deals`) run independently.

### Medium Priority (reduces functionality)
3. **Calendar flow blocked by one stub** — `parse-scheduling-request` is trivial to implement. The actual calendar logic (find slots, create events) is done.
4. **Email received handler** — `match-to-crm-contact` is straightforward CRM lookup. Main value requires email webhook integration (Gmail push notifications) which is a separate infrastructure piece.

### Low Priority (polish)
5. **Deal risk scan has no adapters** — Full sequence is declared but zero implementation. The migration schema is ready — just needs the adapter code.
6. **Stale deal revival** — `analyse-stall-reason` and `draft-reengagement` are stubs. `research-trigger-events` works via Gemini research.

---

## Recommendations

### Phase A: Wire Existing Crons to Orchestrator
The morning brief, stale deals, and task reminders already run on crons. Adding orchestrator event triggers from these crons would activate `campaign_daily_check` and `coaching_weekly` sequences with zero new adapter work (those sequences have real adapters).

### Phase B: Complete the 3 Trivial Stubs
- `parse-scheduling-request` — parse natural language "30 min call next week" into duration + timeframe
- `match-to-crm-contact` — look up email address in contacts table
- `analyse-stall-reason` — AI prompt over deal history to identify why it stalled

### Phase C: Complete the Proposal Pipeline
This is the highest-value unfinished work. `populate-proposal`, `generate-custom-sections`, and `present-for-review` need real implementations. The existing `generate-proposal` edge function has template logic that can be wrapped.

### Phase D: Implement Deal Risk Scan
Write 4 adapters for the `deal_risk_scan` sequence. The `deal_risk_scores` table and RPCs are ready. This is net-new logic but the orchestrator framework makes it straightforward.

---

## Overall Assessment

**The architecture is right. The foundation is excellent. The critical path (orchestrator + post-meeting + pre-meeting) is production-ready.** The remaining work is adapter completion — filling in stubs that the framework already handles. The plan's "extend, don't rebuild" principle was followed consistently.

The gap between "all 7 builds committed" and "all 7 builds working end-to-end" is primarily 11 stub adapters across 5 sequences. The 4 production-ready sequences (meeting_ended, pre_meeting_90min, campaign_daily_check, coaching_weekly) cover the highest-value workflows.
