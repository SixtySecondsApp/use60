# Progress Log — Always-On Copilot Phase 7 & 8

## Source
- Master Plan: `docs/copilot/always_on_60/use60_master_plan.md`
- PRDs: PRD-22 (Conversational Slack Interface), PRD-23 Revised (Progressive Agent Learning), PRD-24 (Graduated Autonomy)

## Existing Infrastructure Leveraged

### Already Built (reuse, don't rebuild)

**Config Engine (PRD-01 — Complete)**
- `agent_config_defaults` — 66 seed values across 9 agent types
- `agent_config_org_overrides` — per-org config (UNIQUE on org_id, agent_type, config_key)
- `agent_config_user_overrides` — per-user config
- `resolve_agent_config()` / `resolve_agent_config_all()` — 3-layer resolution RPCs
- `agent_methodology_templates` — 5 methodologies seeded (Generic, MEDDIC, BANT, SPIN, Challenger)
- `apply_methodology()` — bulk-writes org overrides for selected methodology
- `_shared/config/agentConfigEngine.ts` — edge function config loader with 5-min cache
- `agent-config-admin/index.ts` — 10 handlers for CRUD + methodology management
- `agentConfigService.ts` + `useAgentConfig.ts` — frontend service + hooks

**Onboarding V2 (Working)**
- 5-step flow: WebsiteInput → EnrichmentLoading → EnrichmentResult → SkillsConfig → Complete
- `enrich-organization` + `deep-enrich-organization` edge functions
- `user_onboarding_progress` table tracks step + completion

**Settings Pages (40+ exist)**
- `SalesMethodologySettings.tsx` — methodology picker wired to `apply_methodology()`
- `AutonomySettingsPage.tsx` — preset selector + per-action policy grid
- `AIPersonalizationSettings.tsx`, `SlackSettings.tsx`, `ProactiveAgentSettings.tsx`, etc.
- All read/write from config engine via `agentConfigService.ts`

**Slack Delivery (Complete)**
- `_shared/proactive/deliverySlack.ts` — `sendSlackDM()` + `deliverToSlack()`
- `slack-interactive/index.ts` — button/modal handler
- `slack-events/index.ts` — event listener with signature verification
- 35+ Slack-related edge functions deployed
- Block Kit builder utilities

**Orchestrator (Operational)**
- `fleetRouter.ts` — 45+ adapter mappings
- `runner.ts` — imports `getAgentConfig` from config engine
- `autonomyResolver.ts` — preset-based resolution
- `autonomyTracker.ts` — decision logging

**Gamification — DOES NOT EXIST**
- No tables, services, or components found
- Points system deferred — question engine works without it, add later

### Key Patterns to Follow
- Edge functions: `getCorsHeaders(req)` from `corsHelper.ts`
- Auth: JWT from Authorization header → `userClient.auth.getUser()` → org membership check
- Config: `getAgentConfig(orgId, userId, agentType)` for resolved config
- Supabase client: Pin `@supabase/supabase-js@2.43.4` on esm.sh
- Staging deploy: `--no-verify-jwt` flag required
- Slack signature: HMAC-SHA256 via Web Crypto API (not Node.js crypto)
- DB column gotchas: meetings→`owner_user_id`, deals→`owner_id`, contacts→`owner_id`

---

## Codebase Patterns
<!-- Reusable learnings across all stories -->

- `agent_config_org_overrides` unique constraint: `(org_id, agent_type, config_key)` — use `onConflict` for upserts
- `agent_config_questions` unique constraint: `(org_id, user_id, config_key)` — NULL user_id requires special handling (WHERE NOT EXISTS instead of ON CONFLICT)
- Slack interactive action routing: match `action_id` in the `block_actions` handler, return blocks for ephemeral response
- Fire-and-forget pattern in orchestrator: synchronous entry function that internally calls `fetch().catch()` — never blocks the caller
- `getSlackRecipient()` returns null when no Slack mapping exists — use this as the signal to fall back to in-app delivery
- Meetings table uses `owner_user_id` (not `user_id`) — critical for quiet hours / meeting cooldown checks
- Config engine RPC `get_next_config_question` handles 24h rate limiting + priority ordering at the DB level

---

## Session Log

### 2026-02-22 — LEARN-001 ✅
**Story**: Create agent_config_questions table and completeness tracking schema
**Files**: supabase/migrations/20260223300001_agent_config_questions.sql
**Gates**: schema review ✅
**Learnings**: 3 tables (templates, questions, log) + 2 RPCs (get_config_completeness, get_next_config_question)

---

### 2026-02-22 — LEARN-002 ✅
**Story**: Extend research step to infer agent configuration from webscrape
**Files**: supabase/functions/_shared/enrichment/agentConfigInference.ts
**Gates**: review ✅
**Learnings**: 5-pass inference strategy (enrichment → CRM → country → Gemini → fallback). Same Gemini JSON repair as enrich-organization.

---

### 2026-02-22 — LEARN-005 ✅
**Story**: Build contextual question trigger evaluation engine
**Files**: supabase/functions/evaluate-config-questions/index.ts, supabase/functions/_shared/config/questionEvaluator.ts
**Gates**: review ✅
**Learnings**: 3 delivery gate checks in parallel (quiet hours, meeting cooldown, inactivity). All fail open.

---

### 2026-02-22 — LEARN-009 ✅
**Story**: Build config completeness indicator for settings page
**Files**: src/components/settings/ConfigCompletenessCard.tsx, src/lib/hooks/useConfigCompleteness.ts
**Gates**: review ✅
**Learnings**: Tier color mapping: functional=blue, tuned=violet, optimised=emerald, learning=amber. Category icons mapped from CATEGORY_META.

---

### 2026-02-22 — LEARN-003 ✅
**Story**: Build bootstrap confirmation screen after onboarding enrichment
**Files**: src/pages/onboarding/v2/AgentConfigConfirmStep.tsx, OnboardingV2.tsx (edited), EnrichmentResultStep.tsx (edited), onboardingV2Store.ts (edited)
**Gates**: review ✅
**Learnings**: New onboarding flow: enrichment_result → agent_config_confirm → skills_config. Supports inline editing with 4 input types (dropdown, tags, number, text).

---

### 2026-02-22 — LEARN-006 ✅
**Story**: Deliver contextual questions via Slack DM or in-app notification
**Files**: supabase/functions/_shared/config/questionDelivery.ts, questionBlockKit.ts, questionInApp.ts
**Gates**: review ✅
**Learnings**: Slack Block Kit action_id must be "config_question_answer" (exact match). Slack fallback to in-app on any delivery failure.

---

### 2026-02-22 — LEARN-010 ✅
**Story**: Wire question engine into orchestrator event hooks
**Files**: supabase/functions/_shared/config/questionTriggerHook.ts, supabase/functions/_shared/orchestrator/runner.ts (edited)
**Gates**: review ✅
**Learnings**: Synchronous entry point, async fire-and-forget internally. Hooked into both executeStepsParallel and executeStepsSequential after rpcUpdateStep 'completed'.

---

### 2026-02-22 — LEARN-004 ✅
**Story**: Write inferred config to config engine on bootstrap confirm
**Files**: supabase/functions/agent-config-admin/handlers/bootstrapConfig.ts, agent-config-admin/index.ts (edited)
**Gates**: review ✅
**Learnings**: Batch upsert with onConflict. Conditional apply_methodology RPC for high-confidence methodology. Skips pending questions matching written config_keys.

---

### 2026-02-22 — LEARN-007 ✅
**Story**: Handle contextual question answers from Slack and in-app
**Files**: supabase/functions/slack-interactive/handlers/configQuestionAnswer.ts, supabase/functions/answer-config-question/index.ts, slack-interactive/index.ts (edited)
**Gates**: review ✅
**Learnings**: Slack handler sends ephemeral confirmation. In-app handler uses JWT auth with RLS. Both write to same config tables via scope-based routing.

---

### 2026-02-22 — LEARN-008 ✅
**Story**: Seed all contextual question templates into the question queue
**Files**: supabase/migrations/20260223300002_seed_config_question_templates.sql, supabase/functions/initialize-onboarding/index.ts (edited)
**Gates**: review ✅
**Learnings**: 18 templates across 5 categories. seed_config_questions_for_org RPC uses two separate INSERTs (org vs user scope) due to NULL user_id dedup issue. initialize-onboarding seeds if org membership exists, defers otherwise.

---
