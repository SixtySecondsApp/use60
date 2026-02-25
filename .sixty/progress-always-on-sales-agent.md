# Progress Log — Always-On Sales Agent

## Codebase Patterns
<!-- Reusable learnings across all features -->

- Orchestrator runner at `supabase/functions/_shared/orchestrator/runner.ts` (1013 lines)
- 47 adapters in `supabase/functions/_shared/orchestrator/adapters/`
- Slack delivery via `supabase/functions/_shared/proactive/deliverySlack.ts` (quiet hours, rate limiting already built)
- `notification_queue` table exists (20260205000014) — needs triage columns added
- `agent_activity` table exists (20260216000006) — has feed RPCs
- `proactive_agent_config` table exists (20260216000003) — needs triage_enabled flag
- `agent_persona` table does NOT exist — must create
- `notification_batches` table does NOT exist — must create
- Existing morning brief: `supabase/functions/slack-morning-brief/index.ts` (cron-driven, Block Kit)
- ActivityFeed components exist: `src/components/agent/ActivityFeed.tsx`, `AgentActivityFeed.tsx`
- Slack user prefs already handle quiet hours + rate limits via `slack_user_preferences` table

---

## Session Log

### AOA-001 — agent_persona schema + RPCs ✅
**Files**: `supabase/migrations/20260223600001_agent_persona.sql`

### AOA-002 — notification_queue triage extensions ✅
**Files**: `supabase/migrations/20260223600002_extend_notification_queue_triage.sql`

### AOA-003 — Triage rules engine + edge function ✅
**Files**: `supabase/functions/_shared/proactive/triageRules.ts`, `supabase/functions/notification-triage/index.ts`

### AOA-004 — Wire orchestrator → triage queue ✅
**Files**: `supabase/functions/_shared/orchestrator/runner.ts`, `supabase/migrations/20260223600003_add_triage_enabled_flag.sql`

### AOA-005 — Morning briefing assembler ✅
**Files**: `supabase/functions/agent-morning-briefing/index.ts`

### AOA-006 — Persona-aware Slack delivery ✅
**Files**: `supabase/functions/_shared/proactive/deliverySlack.ts`

### AOA-007 — Agent activity feed: filters + new types ✅
**Files**: `src/components/agent/AgentActivityFeed.tsx`

### AOA-008 — Agent presence indicator (bell → bot) ✅
**Files**: `src/components/AgentActivityBell.tsx`

### AOA-009 — Agent persona settings page ✅
**Files**: `src/pages/settings/AgentPersonaSettings.tsx`

### AOA-010 — First-run activation flow wizard ✅
**Files**: `src/components/agent/AgentActivationFlow.tsx`

### AOA-011 — Initial-scan backfill edge function ✅
**Files**: `supabase/functions/agent-initial-scan/index.ts`

### AOA-012 — Triage analytics dashboard ✅
**Files**: `src/components/agent/AgentAnalyticsDashboard.tsx`

### AOA-013 — Notification preferences UI ✅
**Files**: `src/components/agent/NotificationPreferences.tsx`

### AOA-014 — End-to-end testing and hardening ✅
**Files**: `supabase/functions/_shared/proactive/__tests__/triageRules.test.ts`, `supabase/functions/_shared/proactive/__tests__/deliverySlackPersona.test.ts`
**Tests**: 24 passed (16 triage + 8 persona injection)
**Gates**: lint ✅ (ignored — supabase dir) | test ✅ (24/24) | types: skipped
