# PRD-112: AI Model Routing End-to-End

**Priority:** Tier 3 — Differentiator Upgrade
**Current Score:** 1 (SPEC ONLY) — credit system complete, model routing not enforced
**Target Score:** 4 (BETA)
**Estimated Effort:** 15-20 hours
**Dependencies:** None

---

## Problem

60 has a comprehensive credit governance system — credit balance tracking, pack purchases, auto-topup, budget caps, soft/hard throttling, per-feature cost attribution. The `ai_models` table catalogues models from 4 providers (Anthropic, Google, OpenRouter, Kimi) with pricing and capabilities.

But model selection is **not user-configurable or consistently enforced**:
1. **No model preference UI** — users can't choose which model powers each feature
2. **No per-feature model routing** — each edge function hardcodes its model (mostly Claude Haiku or GPT-4o-mini)
3. **`research-router` routes by query type** (894 lines) but only for research — not for copilot, meeting analysis, or coaching
4. **No quality/cost trade-off selector** — users can't choose "faster + cheaper" vs "smarter + expensive"
5. **Credit costs are tiered (low/medium/high)** but there's no way for users to select their tier

## Goal

A model routing layer that lets users (or admins) configure quality/cost preferences per feature, with the backend enforcing those preferences and attributing costs correctly.

## Success Criteria

- [ ] Model preferences page in settings (per-feature quality tier selection)
- [ ] Quality tier selector: Economy (fastest, cheapest), Standard (balanced), Premium (best quality)
- [ ] Backend model resolver that reads user/org preferences before each AI call
- [ ] Per-feature model mapping table (feature → tier → provider + model)
- [ ] Cost estimation shown before expensive operations
- [ ] Admin override: org-wide model restrictions (e.g., "never use GPT" or "only Anthropic")

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| ROUTE-001 | Create model_preferences table and seed defaults | backend | 2h | — |
| ROUTE-002 | Build model resolver service (_shared/ai/modelResolver.ts) | backend | 3h | ROUTE-001 |
| ROUTE-003 | Create per-feature model mapping config | backend | 2h | ROUTE-001 |
| ROUTE-004 | Wire model resolver into top 5 AI edge functions | backend | 3h | ROUTE-002 |
| ROUTE-005 | Build ModelPreferencesPage in settings | frontend | 2.5h | ROUTE-001 |
| ROUTE-006 | Add quality tier selector per feature category | frontend | 2h | ROUTE-005 |
| ROUTE-007 | Add cost estimation preview for expensive operations | frontend | 1.5h | ROUTE-002 |
| ROUTE-008 | Add admin model restrictions (org-wide overrides) | frontend + backend | 2h | ROUTE-005 |

## Technical Notes

- `ai_models` table has: provider, model_id, display_name, input_cost, output_cost, context_window, capabilities (vision, function_calling, streaming)
- `sync-ai-models` (661 lines) syncs from Anthropic, Google, OpenRouter, Kimi — keeps catalogue fresh
- `ai_cost_events` table logs every AI call: provider, model, feature, tokens, cost, credits_charged
- Credit tier costs in `creditPacks.ts`: e.g., `copilot_chat: { low: 0.3, medium: 0.8, high: 4.0 }`
- `creditBudgetService.ts` (220 lines) has pre-flight budget check with 60s cache
- `CreditEstimator.tsx` exists — extend for model-aware cost preview
- `CreditGate.tsx` exists — can gate on model tier too
- Feature categories to route: copilot_chat, meeting_summary, research_enrichment, content_generation, crm_update, task_execution
- Current hardcoded models across functions: Claude Haiku (coaching, competitive intel), GPT-4o-mini (meeting analytics), Gemini Flash (demo research)
- `research-router` (894 lines) has provider ranking logic — generalise for all features
