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

### 2026-02-22 — CONV-001 through CONV-010 ✅
**Story**: Conversational Slack Interface (PRD-22) — all 10 stories
**Files**:
- supabase/migrations/20260223200001_slack_copilot_threads.sql (schema)
- supabase/functions/slack-copilot/index.ts (orchestrator)
- supabase/functions/slack-events/index.ts (DM handler routing)
- supabase/functions/_shared/slack-copilot/types.ts, intentClassifier.ts, contextAssembler.ts, threadMemory.ts, responseFormatter.ts, rateLimiter.ts
- supabase/functions/_shared/slack-copilot/handlers/ (7 handlers: deal, pipeline, history, contact, action, competitive, coaching)
- supabase/functions/_shared/slack-copilot/templates/errorStates.ts (error states + help)
**Gates**: deploy ✅
**Learnings**:
- DM detection: `event.channel_type === 'im' && !event.bot_id && !event.subtype`
- Thread identity: `(slack_channel_id, slack_thread_ts)` tuple with UNIQUE constraint
- Intent classification: Claude Haiku AI-first with regex fallback, always returns a type (never null)
- Context assembly: intent-driven data loading (deal queries don't load meetings, etc.)
- Rate limiting: 30 queries/hour per user, checked against slack_command_analytics
- Deno bundler string issue: single quotes inside single-quoted strings cause parse errors — use double quotes for strings containing apostrophes

---

### 2026-02-22 — GRAD-001 ✅
**Story**: Build approval rate analytics and tracking system
**Files**: supabase/migrations/20260223400001_autonomy_analytics.sql, supabase/functions/_shared/orchestrator/autonomyAnalytics.ts
**Gates**: deploy ✅
**Learnings**: crm_approval_queue uses field_name not action_type — need map_field_to_action_type() helper. Multi-source aggregation: CRM from crm_approval_queue + crm_field_updates, non-CRM from agent_activity.metadata. 1-hour staleness threshold for cached stats.

---

### 2026-02-22 — GRAD-002 ✅
**Story**: Implement promotion rules engine
**Files**: supabase/migrations/20260223400002_autonomy_promotion_queue.sql, supabase/functions/_shared/orchestrator/promotionEngine.ts
**Gates**: deploy ✅
**Learnings**: Policy ladder: disabled → suggest → approve → auto. Never skip levels. Promotion thresholds: 30 min approvals, 5% max rejection, 14 days active. Demotion: 15% rejection in 7d window. 30-day cooldown after demotion.

---

### 2026-02-22 — GRAD-003 ✅
**Story**: Build promotion suggestion delivery via Slack and settings UI
**Files**: supabase/functions/autonomy-promotion-notify/index.ts, supabase/functions/slack-interactive/handlers/autonomyPromotion.ts, src/components/settings/AutonomyPromotionBanner.tsx
**Gates**: deploy ✅
**Learnings**: Uses `notified_at` guard to prevent duplicate sends. Action IDs: autonomy_promotion_approve/reject/snooze. Snooze = 30 days.

---

### 2026-02-22 — GRAD-004 ✅
**Story**: Implement demotion handling and safety net
**Files**: supabase/migrations/20260223400003_autonomy_audit_log.sql, supabase/functions/_shared/orchestrator/demotionHandler.ts, supabase/functions/_shared/slackBlocks.ts (added demotion message)
**Gates**: deploy ✅
**Learnings**: Demotion reverts one level down the policy ladder. 30-day cooldown in autonomy_cooldowns + audit_log. clearExpiredCooldowns() runs daily before evaluations.

---

### 2026-02-22 — GRAD-005 ✅
**Story**: Build autonomy progression dashboard in settings UI
**Files**: src/components/settings/AutonomyProgressionDashboard.tsx, src/components/settings/AutonomyActionCard.tsx, src/lib/hooks/useAutonomyAnalytics.ts
**Gates**: review ✅
**Learnings**: 8 canonical action types with icons, colors, descriptions. Sparkline SVG polylines for approval rate trends. Promotion eligibility indicator: green when ≥90% approval + ≥10 actions.

---

### 2026-02-22 — GRAD-006 ✅
**Story**: Add manager controls for org-wide autonomy policies
**Files**: src/components/settings/ManagerAutonomyControls.tsx, supabase/functions/agent-config-admin/handlers/managerControls.ts, src/lib/hooks/useManagerAutonomy.ts
**Gates**: deploy ✅
**Learnings**: Ceilings stored as `autonomy.ceiling.{action_type}` and `autonomy.eligible.{action_type}` in agent_config_org_overrides. Per-rep overrides in agent_config_user_overrides. Admin role check via requireOrgRole().

---

## Feature Completion Summary

| Feature | Stories | Status |
|---------|---------|--------|
| Progressive Learning (PRD-23 Revised) | 10/10 | ✅ Complete |
| Conversational Slack Interface (PRD-22) | 10/10 | ✅ Complete |
| Graduated Autonomy (PRD-24) | 6/6 | ✅ Complete |
| **Total** | **26/26** | **✅ All Complete** |

---
