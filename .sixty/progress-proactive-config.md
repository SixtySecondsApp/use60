# Progress Log — Proactive Agent Configuration & User Journey

## Source
- Consult: `.sixty/consult/proactive-agent-user-journey.md`
- Plan: `.sixty/plan-proactive-config.json`
- Branch: `feat/proactive-agent-v2`

## Goal
Add org-level master switch, per-user sequence preferences, enforcement in orchestrator runner, delivery hardening (quiet hours, rate limits, in-app mirroring via Agent Activity feed), and onboarding wizard. Config model: hybrid (admin enables, users fine-tune). Core sequences ON by default, advanced OFF.

## Codebase Patterns
- Settings tables: `slack_notification_settings` (org), `slack_user_preferences` (user) — new tables follow same pattern
- Orchestrator runner gates: idempotency → chain depth → steps available → context load → cost budget → **NEW: org+user prefs**
- Delivery layer: `_shared/proactive/deliverySlack.ts` with `checkUserDeliveryPolicy()` — quiet hours, rate limits, feature toggles
- Feature map in deliverySlack.ts (lines 127-134) needs extending for all 9 sequences
- Agent Abilities: `abilityRegistry.ts` has `eventType` per ability — maps to orchestrator event types
- Existing notification system: `NotificationCenter.tsx` with tabs (all, ai, tasks, content, team) — Agent Activity is separate
- Settings pages follow pattern: lazy route in `lazyPages.tsx`, route in `App.tsx`, nav link in settings layout

## Key Decisions
- **Config model**: Hybrid — admin enables at org level, users fine-tune per sequence
- **Defaults**: meeting_ended, pre_meeting_90min, deal_risk_scan ON; remaining 6 OFF
- **In-app delivery**: New Agent Activity feed (separate from existing notification bell)
- **Rollout**: Internal only until ready — is_enabled defaults to false
- **Absence = default**: No user_sequence_preferences row means "use org default"

---

## Session Log

### 2026-02-15 11:28 — CONF-001 ✅
**Story**: Create proactive_agent_config table with org-level master switch
**Files**: supabase/migrations/20260216000003_add_proactive_agent_config.sql
**Agent**: Haiku (a08d468)
**Gates**: verified ✅
**Details**: Table with org_id PK, is_enabled (default false), enabled_sequences JSONB (core ON, advanced OFF), default_delivery, allowed_webhook_domains, webhook_api_keys. 3 RLS policies (admin CRUD, member read, service role). Auto-updated_at trigger.

---

### 2026-02-15 11:28 — CONF-002 ✅
**Story**: Create user_sequence_preferences table for per-user opt-in/out
**Files**: supabase/migrations/20260216000004_add_user_sequence_preferences.sql
**Agent**: Haiku (a99544b)
**Gates**: verified ✅
**Details**: Table with user_id, org_id, sequence_type, is_enabled, delivery_channel. UNIQUE constraint on (user_id, org_id, sequence_type). CHECK on sequence_type (9 valid values). RPCs: get_user_sequence_preference, get_user_sequence_preferences_for_org, update_user_sequence_preference, delete_user_sequence_preference. User-scoped RLS.

---

### 2026-02-15 11:28 — CONF-005 ✅
**Story**: Extend delivery policy feature map for all 9 orchestrator sequences
**Files**: supabase/functions/_shared/proactive/deliverySlack.ts
**Agent**: Haiku (a52bfcf)
**Gates**: verified ✅
**Details**: Extended featureMap from 6 to 15 entries. Added all 9 orchestrator event types mapped to closest existing slack_user_preferences feature keys. Added console.warn for unknown types.

---

### 2026-02-15 11:28 — CONF-009 ✅
**Story**: Create agent_activity table and insert helper for in-app mirroring
**Files**: supabase/migrations/20260216000006_add_agent_activity.sql
**Agent**: Haiku (a421450)
**Gates**: verified ✅
**Details**: Table with user_id, org_id, sequence_type, job_id (FK), title, summary, metadata JSONB, is_read. 3 indexes (feed, unread, job). RPCs: get_agent_activity_feed, get_agent_activity_unread_count, mark_agent_activity_read, insert_agent_activity.

---

### 2026-02-15 11:31 — CONF-012 ✅
**Story**: Create prerequisites check service
**Files**: supabase/functions/_shared/proactive/prerequisites.ts (570 lines)
**Agent**: Sonnet (ab505df)
**Gates**: verified ✅
**Details**: checkProactivePrerequisites(supabase, orgId, userId). Checks: Slack org connected, credit balance, AI API key, Slack user mapped, timezone set. Per-sequence readiness: Google Calendar (pre_meeting), Instantly (campaigns), Gmail (email). All checks parallel via Promise.all.

---

### 2026-02-15 — CONF-003 ✅ (pre-existing)
**Story**: Create RPCs for proactive agent settings management
**Files**: supabase/migrations/20260216000005_add_proactive_agent_rpcs.sql
**Agent**: Previous session
**Gates**: verified ✅
**Details**: 3 RPCs: get_proactive_agent_config, upsert_proactive_agent_config, get_merged_sequence_preferences. Already existed from prior session.

---

### 2026-02-15 — CONF-004 ✅ (pre-existing)
**Story**: Add org+user preference gate to orchestrator runner
**Files**: supabase/functions/_shared/orchestrator/runner.ts (lines 91-141)
**Agent**: Previous session
**Gates**: verified ✅
**Details**: Settings gate checks: (1) org config enabled, (2) sequence enabled for org, (3) user not opted out. Uses maybeSingle() for both queries. Already existed from prior session.

---

### 2026-02-15 — CONF-008 ✅ (verified complete)
**Story**: Wire abilities backend to orchestrator
**Files**: src/hooks/useAgentAbilityPreferences.ts, src/lib/agent/abilityRegistry.ts, src/components/agent/AbilityCard.tsx, src/pages/platform/AgentAbilitiesPage.tsx
**Agent**: Haiku (verified no changes needed)
**Gates**: verified ✅
**Details**: All wiring already complete from prior session. abilityRegistry has EVENT_TYPE_TO_SEQUENCE_TYPE map for all 9 event types, AbilityCard has backendEnabled prop, AgentAbilitiesPage passes backend state.

---

### 2026-02-15 — CONF-010 ✅
**Story**: Route remaining delivery adapters through delivery layer
**Files**: supabase/functions/_shared/orchestrator/adapters/campaignMonitor.ts, supabase/functions/_shared/orchestrator/adapters/coaching.ts, supabase/functions/_shared/proactive/types.ts
**Agent**: Haiku
**Gates**: verified ✅
**Details**: campaignMonitor and coaching adapters now route through deliverToSlack() + insert_agent_activity (matching pattern from dealRisk, preMeeting, notifySlackSummary). Added missing notification types to types.ts.

---

### 2026-02-15 — CONF-011 ✅ (verified complete)
**Story**: Agent Activity feed UI component
**Files**: src/components/agent/AgentActivityFeed.tsx (368 lines), src/hooks/useAgentActivity.ts (209 lines), src/components/AgentActivityBell.tsx (160 lines)
**Agent**: Sonnet (verified no changes needed)
**Gates**: verified ✅
**Details**: Full feed with read/unread tracking, infinite scroll, mark all read. Bell icon with badge already wired into AppLayout.tsx.

---

### 2026-02-15 — CONF-006 ✅
**Story**: Admin Proactive Agent Settings page
**Files**: src/pages/settings/ProactiveAgentSettings.tsx (created), src/routes/lazyPages.tsx, src/App.tsx
**Agent**: Sonnet
**Gates**: verified ✅
**Details**: Admin-only settings page at /settings/proactive-agent. Master toggle, 9 sequence cards with enable/disable + delivery channel. Core sequences marked "Recommended", advanced marked "Advanced". Uses get_proactive_agent_config and upsert_proactive_agent_config RPCs.

---

### 2026-02-15 — CONF-007 ✅
**Story**: User Proactive Agent Preferences panel
**Files**: src/pages/settings/SlackSettings.tsx (ProactiveAgentPreferences component, lines 981-1188)
**Agent**: Sonnet
**Gates**: build verified ✅ (9596 modules)
**Details**: Shows all 9 sequences with toggle + delivery channel. Admin-disabled sequences show "Disabled by admin" badge. Source indicator for org default vs user override. Uses get_merged_sequence_preferences, get_proactive_agent_config, update_user_sequence_preference RPCs.

---

### 2026-02-15 — CONF-013 ✅
**Story**: Proactive Agent onboarding wizard
**Files**: src/components/agent/ProactiveAgentSetup.tsx (753 lines, created), src/pages/settings/ProactiveAgentSettings.tsx (modified)
**Agent**: Sonnet
**Gates**: verified ✅
**Details**: Multi-step wizard: Prerequisites → Choose Sequences → Review & Activate. Step 1 checks Slack org, Slack user mapping, Google Calendar. Step 2 shows 9 sequence cards with toggles (core pre-enabled). Step 3 summary + Activate. Saves via upsert_proactive_agent_config RPC. Dismissible with "Skip and configure later". Integrated into ProactiveAgentSettings.

---

## Feature Complete ✅

```
═══════════════════════════════════════════════════════
  COMPLETION VERIFICATION
═══════════════════════════════════════════════════════
    Total stories:     13
    ✅ Complete:       13
    ⏳ Pending:        0
    🔄 In Progress:    0
    ❌ Blocked:        0
    🏗️ Build:          PASS (46.09s)
═══════════════════════════════════════════════════════
```
