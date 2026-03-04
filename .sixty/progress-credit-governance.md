# Progress Log — Credit Governance & Budget Enforcement

## Codebase Patterns
- autonomousExecutor.ts: budget check at line 393 (`checkBudget()`) runs at TOP of each iteration — move to END to allow current action to finish
- CreditExhaustedError: thrown on budget fail → caught at line 547 → returns `success: false` with error message
- creditBudgetService.ts: singleton, 60s cache, fail-open, `isCritical` flag for soft-warn bypass
- stripe-webhook: `planSlug === 'pro'` guard on subscription credit grants — change to `bundledCredits > 0` for plan-agnostic
- grant_subscription_credits RPC: already plan-agnostic (accepts any amount) — no RPC changes needed
- expire_subscription_credits RPC: already plan-agnostic — no changes needed
- subscription_plans.features JSONB: `bundled_credits` key stores integer credit count per plan
- credit_logs.source: 'user_initiated' | 'agent_automated' | 'sequence_step' | 'scheduled' | 'grace_threshold'
- credit_logs.action: string describing the specific action (useful for agent attribution grouping)
- Deploy edge functions to staging: `npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`
- Pin `@supabase/supabase-js@2.43.4` in all edge function imports

---

## Session Log

### 2026-03-03 — CGV-001 + CGV-003 (Parallel)
**Stories**: Graceful budget exhaustion + Basic plan bundled credits
**Files**: autonomousExecutor.ts, stripe-webhook/index.ts, update-subscription/index.ts, 20260303210001_basic_plan_bundled_credits.sql
**Gates**: lint pass | test pass (pre-existing failures only)
**Learnings**: Budget check moved to post-iteration flag (`shouldStopForCredits`). Changed 3 webhook handlers + update-subscription from `planSlug === 'pro'` to `bundledCredits > 0`.

### 2026-03-03 — CGV-002 + CGV-004 (Parallel)
**Stories**: Credit exhaustion toast + Checkout flow verification
**Files**: useAutonomousExecutor.ts (toast with debounce), Pricing.tsx (verified), create-checkout-session/index.ts (verified)
**Gates**: lint pass | test pass
**Learnings**: Toast uses `lastCreditToastRef` for 5s debounce. Checkout flow already works correctly — plan_slug passed in metadata.

### 2026-03-03 — CGV-005
**Story**: Subscription status card with bundled credits + cancelled state
**Files**: BillingSettingsPage.tsx (enhanced existing Current Plan Card), planDetails.ts (Basic now shows 50 credits)
**Gates**: lint pass | test pass
**Learnings**: Enhanced existing card rather than creating separate component. Added "Credits Included" stat, cancelled/cancel-pending banners.

### 2026-03-03 — CGV-006
**Story**: Plan change flow with credit impact warning
**Files**: PlanChangeModal.tsx (bundled credits in PLAN_PRICES, dynamic upgrade/downgrade messaging)
**Gates**: lint pass | test pass
**Learnings**: Added bundledCredits to PLAN_PRICES config. Downgrade warning explains use-or-lose subscription credits vs never-expire packs.

### 2026-03-03 — CGV-007
**Story**: Feature-level cost attribution in usage chart
**Files**: UsageChart.tsx (Trend/By Feature tab toggle, feature breakdown query, horizontal bar chart)
**Gates**: lint pass | test pass
**Learnings**: Grouped ai_cost_events by feature_key client-side. Top 10 features with bar chart. Uses existing table — no new RPC needed.

---
