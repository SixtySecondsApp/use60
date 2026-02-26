# Progress Log — PRD-05: Calendar + Proposal Send

## Codebase Patterns
<!-- Reusable learnings specific to calendar + proposal feature -->

- find-available-slots edge function already exists — don't rebuild, just call it
- generate-proposal already exists with async job execution — use proposal_jobs pattern for status polling
- proposalGenerator.ts adapter exists — extend it for intent-triggered proposals rather than creating new adapter
- Calendar write scope: 'https://www.googleapis.com/auth/calendar.events' (vs read-only 'calendar.readonly')
- PRD-01 email send must be live before CAL-003 and PROP-003 can ship

---

## Session Log

<!-- Stories log as they complete, newest first -->

### 2026-02-26 — PROP-004 ✅
**Story**: Deal memory enrichment on proposal send
**Files**: supabase/functions/hitl-send-followup-email/index.ts
**Time**: ~15 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: deal_memory_events uses event_category (not category), summary (not memory_text), no user_id column; event_type='proposal_sent' with confidence=1.0 salience='high'; fire-and-forget try/catch; logAgentAction action_type='send_proposal' for proposals

---

### 2026-02-26 — PROP-003 ✅
**Story**: Proposal send via email on approval (PRD-01 dependency)
**Files**: supabase/functions/hitl-send-followup-email/index.ts, supabase/functions/slack-interactive/index.ts
**Time**: ~22 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: resource_type='proposal' branch in hitl-send-followup-email; 2-hop contact email resolution (deals→contacts); HTML email with cover note + exec summary + pricing; isHtmlOverride flag for HTML sends; agent_daily_logs includes resource_type + proposal_job_id for tracing

---

### 2026-02-26 — CAL-003 ✅
**Story**: [Send times via email] — compose availability email via PRD-01 HITL flow
**Files**: supabase/functions/slack-interactive/index.ts
**Time**: ~22 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: Chains from calendar_slots HITL to email_draft HITL — creates new hitl_pending_approvals with resource_type='email_draft'; reuses buildEmailDraftApprovalBlocks pattern; Intl.DateTimeFormat for slot formatting; thread context passed through for in-reply-to; posts to same DM channel (no reopen needed)

---

### 2026-02-26 — PROP-002 ✅
**Story**: Proposal HITL via Slack — [Approve & Send] [Edit in 60] [Skip]
**Files**: supabase/functions/_shared/orchestrator/adapters/proposalGenerator.ts, eventSequences.ts, adapters/index.ts, slackBlocks.ts, slack-interactive/index.ts
**Time**: ~25 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: Block Kit helpers prefixed _pa; proposal added to HITLResourceType; queries proposal_jobs for executive_summary/pricing_section; edit keeps approval 'pending'; skip uses complete_sequence_job RPC; deep link to /deals?proposal_approval={id}

---

### 2026-02-26 — CAL-004 ✅
**Story**: Google Calendar invite creation — send actual calendar event
**Files**: supabase/functions/google-calendar-sync/index.ts, supabase/functions/slack-interactive/index.ts
**Time**: ~22 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: events.insert with sendUpdates=all sends invite emails; 401 retry with refreshGoogleAccessToken; 403 = insufficient scope with actionable reconnect message; upsert to calendar_events on user_id,external_id for local sync; optimistic Slack update before API call

---

### 2026-02-26 — CAL-002 ✅
**Story**: Slack HITL message for calendar slot selection
**Files**: supabase/functions/_shared/orchestrator/adapters/calendar.ts, eventSequences.ts, adapters/index.ts, slackBlocks.ts, slack-interactive/index.ts
**Time**: ~20 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: Block Kit helpers prefixed with _cal to avoid name collisions; calendar_slots added to HITLResourceType union; each button in own actionsBlock; Intl.DateTimeFormat for slot rendering; dismiss marks outcome='rep_handling'

---

### 2026-02-26 — CAL-001 ✅
**Story**: Wire schedule_meeting intent → find-available-slots
**Files**: supabase/functions/_shared/orchestrator/adapters/calendar.ts, adapters/index.ts
**Time**: ~15 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: detect-scheduling-intent step already existed in eventSequences.ts — only needed adapter registration; 4-phase flow (intent check → calendar check → param resolution → slot fetch); default 45min/UTC/7days/5results

---

### 2026-02-26 — PROP-001 ✅
**Story**: Wire send_proposal intent → generate-proposal with deal memory
**Files**: supabase/functions/_shared/orchestrator/adapters/proposalGenerator.ts, eventSequences.ts, adapters/index.ts
**Time**: ~18 min
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: detectProposalIntentAdapter reads deal_memory_events for commercial/commitment/objection context; async job via generate-proposal with action='analyze_focus_areas'; proposal_job_id stored for downstream HITL

---

## PRD-05 COMPLETE — 8/8 stories ✅

