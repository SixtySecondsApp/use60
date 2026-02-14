# Proactive Agent V2 — Gap Analysis Against Original Plan

**Date**: 15 February 2026
**Branch**: `feat/proactive-agent-v2`
**Reference**: `docs/copilot/proactive_agent_plan.md` (13 Feb 2026)
**Previous Audit**: `.sixty/consult/proactive-agent-audit.md` (14 Feb 2026)

---

## Executive Summary

The orchestrator adapter layer is now **100% complete** — all 11 stubs filled, 9/9 sequences have real adapters. The core architecture (runner, types, context loading, parallel waves, self-invocation, HITL) is production-quality.

However, **the adapters have no events to process**. The critical remaining gap is **event source wiring** — the webhooks, crons, and triggers that feed events into the orchestrator. The orchestra is assembled and the conductor is hired, but nobody is opening the doors to let the audience in.

### Current State vs Plan

| Build | Plan Target | Adapter % | Event Wiring | End-to-End |
|-------|-------------|-----------|--------------|------------|
| 1. Orchestrator | Weeks 1-2 | 100% | **20%** | Partial |
| 2. Intent Detection | Weeks 3-4 | 100% | Via meeting_ended | Yes (if meeting_ended fires) |
| 3. Calendar Finder | Weeks 5-6 | 100% | Via intent chain | Yes (if meeting_ended fires) |
| 4. Email Send-as-Rep | Weeks 7-8 | 100% | Via meeting_ended | Yes (if meeting_ended fires) |
| 5. Proposal Pipeline | Weeks 7-8 | 100% | Via intent chain | Yes (if meeting_ended fires) |
| 6. Campaign Monitoring | Weeks 9-10 | 100% | **0%** | No |
| 7. Coaching Analysis | Weeks 11-12 | 100% | **50%** (per-meeting only) | Partial |

**Bottom line**: Builds 2-7 are architecturally complete but gated on Build 1's event wiring.

---

## What's Production-Ready Right Now

### Adapter Layer (100% — 9/9 sequences)

| Sequence | Steps | All Real | Notes |
|----------|-------|----------|-------|
| `meeting_ended` | 9 | Yes | 4 parallel waves, call type gating |
| `pre_meeting_90min` | 5 | Yes | Parallel Gemini research + Claude synthesis |
| `email_received` | 2 | Yes | Email classify + CRM contact match |
| `proposal_generation` | 4 | Yes | Template select → populate → custom sections → HITL review |
| `calendar_find_times` | 3 | Yes | NL parse → find slots → present options |
| `stale_deal_revival` | 3 | Yes | Research triggers → analyse stall → draft re-engagement |
| `campaign_daily_check` | 4 | Yes | Pull metrics → classify replies → report → deliver |
| `coaching_weekly` | 4 | Yes | Aggregate → correlate → digest → deliver |
| `deal_risk_scan` | 4 | Yes | Scan → score → alerts → deliver |

### Infrastructure (100%)

- Runner with parallel waves, self-invocation, retry, idempotency
- 3-tier context loading (org/user, contact/deal, enrichment)
- HITL pause/resume via slack-interactive
- Email send-as-rep with Gmail API, daily limits, audit trail, 30s undo
- 4 database migrations (sequence_jobs extension, coaching_analyses, crm_field_updates, deal_risk_scores, reengagement_watchlist)
- Frontend demo page with simulation + live mode
- 13 agent UI components
- 41 Slack Block Kit builders in slackBlocks.ts

---

## What's Missing: Event Source Wiring

This is the **single remaining high-leverage gap**. All adapter logic exists but events don't reach the orchestrator.

### Gap 1: Webhook → Orchestrator (HIGH)

| Webhook | Current Behavior | Missing |
|---------|-----------------|---------|
| `meetingbaas-webhook` | Processes transcript, calls `process-recording` | Should fire `meeting_ended` event to orchestrator after transcript ready |
| `google-calendar-webhook` | Processes calendar changes, updates local events | Should detect meetings starting in 60-90min and fire `pre_meeting_90min` |
| Gmail push notifications | **No handler exists** | Need webhook handler to fire `email_received` |

**Note**: The `process-recording` edge function *may* already call the orchestrator (Agent 1 found a reference at line 1194). This needs verification — if it does, `meeting_ended` is already wired.

### Gap 2: Cron → Orchestrator (HIGH)

| Cron Function | Current Behavior | Missing |
|---------------|-----------------|---------|
| `slack-stale-deals` | Sends stale deal alerts | **DONE** — now fires `deal_risk_scan` event (just committed) |
| `slack-morning-brief` | Sends morning brief DMs | TODO comment for `coaching_weekly` + `campaign_daily_check` events |
| No pre-meeting cron | N/A | Need cron that checks for meetings starting in 60-90min |

### Gap 3: Slack Interactive Routing (MEDIUM)

The `slack-interactive/index.ts` dispatcher routes `orch_*` prefixed actions to the orchestrator handler. But several HITL flows use non-prefixed action IDs:

| Flow | Action ID Pattern | Routed? |
|------|-------------------|---------|
| Orchestrator approvals | `orch_approve::*`, `orch_reject::*` | Yes |
| Proposal review | `proposal_approve::*`, `proposal_edit::*`, `proposal_skip::*` | **Needs verification** |
| Calendar selection | `calendar_select::*`, `calendar_send::*` | **Needs verification** |
| Email send approval | `email_approve::*`, `email_cancel::*` | **Needs verification** |

### Gap 4: Block Kit Standardization (LOW)

Three flows build Slack blocks inline instead of using `slackBlocks.ts` builders:

| Flow | Current | Should Use |
|------|---------|------------|
| Pre-meeting briefing | Inline in `preMeeting.ts` | `buildPreMeetingBriefMessage()` |
| Proposal review | Inline in `presentForReviewAdapter` | `buildProposalReviewMessage()` |
| Campaign report | Inline in `campaignMonitor.ts` | `buildCampaignReportMessage()` |

Not blocking — flows work, just not centralized.

---

## Recommended Next Feature Plan

### Phase 1: Verify & Wire Event Sources (1-2 days)

**Stories**:

1. **Verify process-recording → orchestrator wiring**
   - Read `process-recording/index.ts` line ~1194
   - Confirm it fires `meeting_ended` to `agent-orchestrator`
   - If not, add the fire-and-forget call
   - Test: meeting ends → orchestrator job created in `sequence_jobs`

2. **Wire slack-morning-brief to fire coaching_weekly + campaign_daily_check**
   - Replace TODO comment with actual orchestrator calls
   - `coaching_weekly`: fire on Mondays for users with coaching enabled
   - `campaign_daily_check`: fire daily for users with Instantly configured
   - Pattern: match existing `deal_risk_scan` wiring in `slack-stale-deals`

3. **Create pre-meeting cron trigger**
   - New edge function or extend existing cron
   - Query `calendar_events` for meetings starting in 60-90min
   - Fire `pre_meeting_90min` event per meeting
   - Deduplicate via idempotency_key: `pre_meeting_90min:{meeting_id}`

4. **Verify Slack interactive routing for HITL flows**
   - Check proposal_approve/edit/skip, calendar_select, email_approve action IDs
   - Wire any missing routes to orchestrator resume

### Phase 2: Gmail Push Notifications (3-5 days)

5. **Create Gmail webhook handler**
   - New edge function: `gmail-push-webhook`
   - Handles Google Pub/Sub push notifications for new emails
   - Fires `email_received` event to orchestrator
   - Requires: Gmail API watch setup per user, Pub/Sub topic

6. **OAuth scope management**
   - Detect users with read-only Gmail scope
   - Prompt for `gmail.send` + `gmail.readonly` scope upgrade
   - Track authorized scopes in `google_integrations` table

### Phase 3: Production Hardening (2-3 days)

7. **Centralize remaining Block Kit builders**
   - Move inline blocks from preMeeting.ts, proposalGenerator.ts, campaignMonitor.ts to slackBlocks.ts
   - Add TypeScript interfaces for each message data type

8. **Add orchestrator observability**
   - Dashboard showing: sequences/day, step success rates, avg duration, HITL response times
   - Error alerting: failed sequences, stuck HITL approvals (>24hrs)

9. **End-to-end smoke tests**
   - `proactive-simulate` edge function for each of the 9 sequences
   - Verify full chain: event → context load → adapter execution → Slack delivery → HITL pause/resume

---

## What We're NOT Building (Confirmed from Plan)

- Real-time meeting coaching (post-meeting only) ✅
- Salesforce integration ✅
- Voice interface ✅
- Multi-language ✅
- Fine-tuned models ✅
- Chrome extension ✅
- New database tables for things that already have tables ✅

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| process-recording may not fire meeting_ended | HIGH | Verify first — if missing, trivial to add |
| Gmail Pub/Sub requires GCP project setup | MEDIUM | Users must connect Gmail with push notifications enabled |
| Slack interactive routing gaps break HITL | HIGH | Verify all action ID patterns before production |
| Edge function cold starts delay orchestrator | LOW | Self-invocation pattern already handles this |
| Cost of 9-step meeting_ended sequence | LOW | Cost budget gate at sequence start, Claude Haiku for most steps |

---

## Overall Assessment

**The hard work is done.** The orchestrator architecture, all 34+ adapters, the HITL framework, email safety rails, coaching analysis, campaign monitoring, deal risk scanning — all of this is production-quality code.

**The remaining work is plumbing, not architecture.** Wiring webhooks and crons to fire events into an already-working system. Phase 1 (1-2 days) would activate 7 of 9 sequences. Phase 2 (3-5 days) would activate email_received. Phase 3 is polish.

**Estimated total to full production**: 6-10 days.
