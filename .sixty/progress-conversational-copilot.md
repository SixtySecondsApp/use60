# Progress Log — Conversational Copilot (PRD-CC-001)

## Architecture Decisions

### Existing Infrastructure (extend, don't rebuild)
- **slack-copilot/index.ts** (450 lines) — Main orchestrator already handles: thread state → intent classification → context assembly → handler routing → response posting. Upgrade in-place.
- **slack-events/index.ts** (1048 lines) — Already routes DMs to slack-copilot and handles @mentions. Add /60 slash command routing here.
- **slack-copilot-actions/index.ts** (920 lines) — HITL confirmation flow already works (preview → confirm → execute). Wire draft_email/create_task actions into this.
- **slack-interactive/index.ts** — Handles button clicks. Extend with disambiguation button handlers and new action buttons.

### Shared Modules (upgrade existing)
- **types.ts** — Expand CopilotIntentType from 8 to 20. Add new entity fields.
- **intentClassifier.ts** — Update regex patterns for 20 intents. AI classification via route-message handles the rest.
- **contextAssembler.ts** — Already has per-intent data loading. Add new intents and RAG conditional loading.
- **threadMemory.ts** (486 lines) — Already manages thread state, history, and cross-channel context extraction. Extend with active entity tracking and turn persistence.
- **responseFormatter.ts** — Already has Block Kit helpers. Add disambiguation blocks and action button templates.
- **slackEntityResolver.ts** — Already has fuzzy matching with ILIKE. Extend with thread-context disambiguation and @entity: syntax.

### New Modules
- **entityResolver.ts** — Wraps slackEntityResolver with thread context, disambiguation UI, and @mention syntax
- **metricsQueryHandler.ts** — New handler for metrics_query intent
- **riskQueryHandler.ts** — New handler for risk_query intent (partially exists in dealQueryHandler at-risk filter)
- **analytics.ts** — Centralized analytics logging to slack_copilot_analytics
- **actionExecutor.ts** — Unified action execution (send email, create task, update CRM)
- **slashCommands.ts** — /60 command parsing and routing

### Database
- **slack_copilot_threads** — Extend with active_deal_id, active_contact_id, turns, loaded_context, intents_used, actions_taken, credits_consumed
- **slack_copilot_analytics** — New table for per-query analytics
- Both use existing RLS patterns (user sees own data, service role full access)

### Key Patterns
- `deals` table: owner column is `owner_id` (NOT user_id)
- `meetings` table: owner column is `owner_user_id` (NOT user_id)
- `contacts` table: owner column is `owner_id` (NOT user_id)
- Edge functions: pin `@supabase/supabase-js@2.43.4` on esm.sh
- Staging deploy: `--no-verify-jwt` (project ref: caerqjzvuerejfrdtygb)
- CORS: use `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- RAG client: `_shared/memory/ragClient.ts` with circuit breaker + caching
- Credit system: `rateLimiter.ts` tracks usage, `creditBudgetService` for enforcement

### Model Selection (from PRD)
- Intent classification: Haiku (fast, cheap)
- Simple fact lookups (metrics, contact date): Haiku
- Deal summary, pipeline analysis: Sonnet
- History narrative, coaching, email drafting: Sonnet
- Entity resolution: Haiku

---

## Session Log

### 2026-02-25 — Full Feature Execution (CC-001 through CC-021) ✅

**Mode**: `60/dev-run --all` with Sonnet agent teams + Opus manager review
**Stories completed**: 21/22 (CC-022 staging deploy pending)
**Parallel groups executed**: 9 groups across 11 parallel slots

#### Group 1 (CC-001, CC-002, CC-007, CC-016) — Foundation
- CC-001: Extended intent taxonomy from 8 to 20+ types in types.ts + intentClassifier.ts
- CC-002: Created entityResolver.ts with fuzzy ILIKE, @entity:slug, thread disambiguation, Block Kit UI
- CC-007: Migration 20260226000001 — ALTER slack_copilot_threads + CREATE slack_copilot_analytics
- CC-016: Upgraded contextAssembler.ts with INTENT_DATA_CONFIG for all 20 intents, model tier selection

#### Group 2+3 (CC-003, CC-004, CC-005, CC-006) — Route + Core Handlers
- CC-003: route-message upgraded with slack_conversational source, Haiku classification, regex fallback
- CC-004: dealQueryHandler enhanced — trajectory, key contacts with flags, open items
- CC-005: contactQueryHandler enhanced + NEW metricsQueryHandler (7 parallel queries, date range resolution)
- CC-006: pipelineQueryHandler with stage weights/coverage + NEW riskQueryHandler (multi-signal scoring)

#### Group 4 (CC-008) — Thread Memory
- threadMemory.ts: updateActiveEntities, appendTurn (20-cap), bridgeCrossChannelContext, detectContextSwitch

#### Group 5 (CC-009) — Orchestrator Wiring (Critical Path)
- slack-copilot/index.ts: Full rewrite of handler routing — entity resolution → disambiguation → confidence routing → all 20 intents → analytics logging

#### Group 6 (CC-010, CC-011, CC-012, CC-015) — RAG + Slash Commands
- CC-010: historyQueryHandler with RAG (4 parallel queries), meeting arc narrative, DB fallback
- CC-011: coachingQueryHandler with cross-deal pattern analysis, won/lost segmentation, AI coaching
- CC-012: competitiveQueryHandler with battlecards, win rates, landscape overview
- CC-015: slashCommands.ts + slack-events routing for /60 commands (8 subcommands)

#### Group 7 (CC-013, CC-020, CC-021) — Drafts + Credits + Analytics
- CC-013: actionHandler enhanced with RAG-grounded email drafts, batch check-ins, HITL buttons
- CC-020: rateLimiter with INTENT_CREDIT_COSTS, 50-credit daily budget, warning/exhaustion responses
- CC-021: analytics.ts — logAnalyticsEvent, logActionEvent, recordFeedback, response time targets

#### Group 8 (CC-014, CC-017) — Actions + Demo API
- CC-014: actionExecutor.ts (send email, create task, update CRM) + slack-copilot-actions handler extensions
- CC-017: conversational-copilot edge function (542 lines) — demo API mirroring slack-copilot flow

#### Group 9 (CC-018, CC-019) — Demo UI
- DemoConversationalCopilot.tsx (~504 lines) — chat playground with suggested queries, metadata, session metrics

**Quality Gates**: lint ✅ (0 errors, warnings only) | typecheck ⏳ (running)
**Remaining**: CC-022 (staging deploy + QA across 20 intent types)
