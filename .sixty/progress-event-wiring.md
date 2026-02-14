# Progress Log — Event Source Wiring & Production Hardening

## Source
- Consult: `.sixty/consult/proactive-agent-v2-gap-analysis.md`
- Plan: `.sixty/plan-event-wiring.json`
- Branch: `feat/proactive-agent-v2`

## Goal
Wire all event sources into the orchestrator so 9/9 sequences fire end-to-end, add Gmail push notifications, centralize Block Kit, build observability, and create smoke tests.

## Pre-Plan Discovery (Key Findings)

### Already Wired (no work needed)
- **meeting_ended**: `process-recording/index.ts:1182-1218` — fire-and-forget after transcript processing, gated on attendees_count > 1, idempotency_key
- **pre_meeting_90min**: `proactive-meeting-prep/index.ts:237-290` — cron every 30min, checks 30-120min meeting window, idempotency_key
- **deal_risk_scan**: `slack-stale-deals/index.ts:327-348` — fire-and-forget from daily cron

### Dead Code Found
- `slack-interactive/handlers/proposal.ts` — full handler with resume_job_id, NOT routed in dispatcher
- `slack-interactive/handlers/calendar.ts` — full handler with resume_job_id, NOT routed in dispatcher
- `slack-interactive/handlers/emailSend.ts` — full handler with resume_job_id, NOT routed in dispatcher
- `slack-interactive/handlers/campaigns.ts` — full handler with fresh event fire, NOT routed in dispatcher

### Block Kit Gaps
- 4 handler files have ~351 lines of inline Block Kit (not using slackBlocks.ts primitives)
- `campaign_report` case in send-slack-message is plain text only (line 207-209), should use Block Kit

## Codebase Patterns
- Fire-and-forget: bare `fetch()` (no await) with `.catch()`, wrapped in outer try/catch
- Orchestrator event payload: `{ type, source, org_id, user_id, payload, idempotency_key? }`
- Slack interactive routing: `if (action.action_id.startsWith('prefix_')) { const { handler } = await import('./handlers/file.ts'); ... }`
- Handler interface: `{ actionId, actionValue, userId, orgId, channelId, messageTs, responseUrl }`
- HITL resume: POST to agent-orchestrator with `{ resume_job_id, approval_data }`

---

## Session Log

### 2026-02-15 — Session 1 (Team Execution) — ALL 8 STORIES COMPLETE

**Approach**: Sonnet agent team with 3 parallel waves.

#### Wave 1 (Parallel — Phase A)

**WIRE-001** (wave1-morning-brief) — coaching_weekly + campaign_daily_check wiring
- Added fire-and-forget orchestrator events inside recipient loop of `slack-morning-brief/index.ts`
- coaching_weekly: fires Mondays only, source `cron:weekly`, idempotency_key with date
- campaign_daily_check: fires daily for users with Instantly integration, source `cron:morning`
- Replaced TODO comment at line 264 with real implementation
- Files: `supabase/functions/slack-morning-brief/index.ts`

**WIRE-002** (wave1-slack-routing) — HITL handler routing
- Added 4 routing blocks to `slack-interactive/index.ts` after existing `orch_*` block
- `prop_*` → handlers/proposal.ts, `cal_*` → handlers/calendar.ts
- `email_*` → handlers/emailSend.ts, `camp_*` → handlers/campaigns.ts
- All use dynamic import matching existing orch_* pattern
- Files: `supabase/functions/slack-interactive/index.ts`

#### Wave 2 (4 Parallel — Phases B + C)

**WIRE-003** (wave2-gmail-webhook) — Gmail push webhook
- Created new edge function `gmail-push-webhook` with config.toml (verify_jwt = false)
- Decodes Pub/Sub base64 message, looks up user via google_integrations
- Fires `email_received` event with idempotency_key
- Always returns 200 to prevent Pub/Sub retries
- Files: `supabase/functions/gmail-push-webhook/index.ts`, `config.toml`

**WIRE-005** (wave2-block-kit) — Block Kit centralization
- Moved 4 inline builders (~351 lines) to slackBlocks.ts using safe primitives
- buildProposalReviewMessage, buildCalendarSlotsMessage, buildEmailPreviewMessage, buildCampaignReportMessage
- Fixed campaign_report case in send-slack-message from plain text to Block Kit
- Handler files now import from slackBlocks.ts
- Net: ~240 lines added, ~351 removed = 111 lines saved
- Files: `slackBlocks.ts`, 4 handler files, `send-slack-message/index.ts`

**WIRE-006** (wave2-metrics-rpc) — Orchestrator metrics RPC
- Created migration `20260216000002_add_orchestrator_metrics_rpc.sql`
- RPC returns: total_sequences, sequences_by_source, sequences_by_status, avg_duration_ms, success_rate, stuck_jobs, daily_counts, top_skills, error_summary
- Uses actual sequence_jobs schema (organization_id TEXT, event_source, status enum)
- Files: `supabase/migrations/20260216000002_add_orchestrator_metrics_rpc.sql`

**WIRE-008** (wave2-smoke-tests) — End-to-end smoke tests
- Extended proactive-simulate with `orchestrator_smoke_test` feature
- Fires sync events to agent-orchestrator for all 9 event types
- Per-event test payloads, 30s timeout via AbortController
- Reports: passed/paused/failed per sequence with step counts
- Sequential execution to avoid overwhelming system
- Files: `supabase/functions/proactive-simulate/index.ts`

#### Wave 3 (Parallel — Phases B + C)

**WIRE-004** (wave3-gmail-watch) — Gmail watch management
- Created migration `20260216000001_add_gmail_watch_tracking.sql`
- Added gmail_watch_expiration, gmail_watch_history_id, gmail_watch_resource_id, gmail_scopes columns
- Created get_gmail_watches_needing_renewal RPC
- Extended gmail-push-webhook with ?action=setup and ?action=renew endpoints
- OAuth token refresh, scope detection (gmail.readonly + gmail.send)
- Files: migration + `gmail-push-webhook/index.ts`

**WIRE-007** (wave3-dashboard) — Orchestrator observability dashboard
- Created `src/pages/platform/OrchestratorDashboard.tsx`
- 4 stats cards, sequences by source/status, daily activity, stuck jobs alert, top skills, error summary
- Date range selector (7d/30d/90d), auto-refresh every 30s
- Added lazy route in lazyPages.tsx + route in App.tsx with PlatformAdminRouteGuard
- Uses React Query + supabase.rpc for data fetching
- Lucide icons, Radix UI, Tailwind CSS — no new dependencies
- Files: `OrchestratorDashboard.tsx`, `lazyPages.tsx`, `App.tsx`

#### Result
- **8/8 stories complete** across 3 phases
- **Phase A**: All 9 sequences can fire end-to-end
- **Phase B**: Gmail push notifications fully wired with watch management
- **Phase C**: Centralized Block Kit, observability dashboard, smoke tests

---
