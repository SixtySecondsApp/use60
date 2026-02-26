# Progress Log — V2 Credit Governance (creditLedger)

## Codebase Patterns
- `logAICostEvent()` lives in `supabase/functions/_shared/costTracking.ts` — called by 33 edge functions
- `org_credit_balance` columns: `balance_credits`, `grace_threshold_credits`, `lifetime_purchased`, `lifetime_consumed`
- Client-side singletons follow `ActivityService` pattern (`static getInstance()`, private constructor)
- Supabase client import: `import { supabase } from '@/lib/supabase/clientV2'`
- Edge fn deploy to staging: `npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`

---

## Session Log

### 2026-02-26 — CREDIT-001 ✅
**Story**: Add source_agent column to ai_cost_events
**Files**: supabase/migrations/20260227000001_add_source_agent_to_ai_cost_events.sql
**Gates**: N/A (DDL migration)

---

### 2026-02-26 — CREDIT-002 ✅
**Story**: Add sourceAgent param to logAICostEvent in costTracking.ts
**Files**: supabase/functions/_shared/costTracking.ts
**Notes**: Added `sourceAgent?: string` as last param to both `logAICostEvent()` and `logFlatRateCostEvent()`. All 33 existing callers unchanged.

---

### 2026-02-26 — CREDIT-003 ✅
**Story**: Pass source_agent in copilot-autonomous edge function
**Files**: supabase/functions/copilot-autonomous/index.ts
**Notes**: Pass `undefined` for logContext (10th param), `'copilot-autonomous'` as sourceAgent (11th param)
**Deploy**: `npx supabase functions deploy copilot-autonomous --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`

---

### 2026-02-26 — CREDIT-004 ✅
**Story**: Create creditLedger.ts client-side logging service
**Files**: src/lib/services/creditLedger.ts
**Notes**: Singleton, fire-and-forget, estimated_cost=0/credits_charged=0 (attribution only). PostgREST errors now warned (non-fatal).

---

### 2026-02-26 — CREDIT-005 ✅
**Story**: Create creditBudgetService.ts with fleetThrottle logic
**Files**: src/lib/services/creditBudgetService.ts
**Notes**: 60s per-org cache, fails open on DB error, 80% soft-warn blocks non-critical, grace-threshold hard-kill. `CreditExhaustedError` class exported.

---

### 2026-02-26 — CREDIT-006 ✅
**Story**: Wire autonomousExecutor.ts with budget check and cost logging
**Files**: src/lib/copilot/agent/autonomousExecutor.ts
**Notes**: Budget pre-check + cost log in both execute() loop and executeTool(). CreditExhaustedError caught and returns error:'credit_exhausted'. totalInputTokens/totalOutputTokens in ExecutorResult (main loop only — skill sub-call tokens logged separately, see follow-up improvement).

---

## Opus Review — 2026-02-26
**Verdict**: Ready to deploy. 4 non-blocking items:
1. ✅ Fixed: creditLedger.ts now checks PostgREST `{ error }` on insert
2. (Low) creditBudgetService.ts cache Map never pruned — fine for single-org frontend context
3. (Low) executeTool() tokens not accumulated into ExecutorResult.totalInputTokens — they are still logged individually via creditLedger. Follow-up refactor needed to change executeTool() return type
4. (Pre-existing) Required<ExecutorConfig> type mismatch with optional icpProfile fields — not introduced by this PR
