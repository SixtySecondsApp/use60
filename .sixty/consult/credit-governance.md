# Consult Report: Credit Governance & Budget Enforcement
Generated: 2026-03-03 21:00

## User Request
"Credit Governance & Budget Enforcement — the architecture diagram labels this PLANNED/ASPIRATIONAL stubs only. The PRD needs to cover the credit ledger, budget service, fleet throttling, and Stripe webhook integration for credit pack purchases."

## Key Finding: System Is 90% Production-Grade (Not Stubs)

The initial assumption was that the credit system is "stubs only." Codebase analysis reveals **37+ stories shipped** across 4 major implementation phases:

- CRED-001–023: Universal credit pack system (complete)
- CREDIT-001–006: Credit ledger V2 (complete)
- CTRAK-001–013: Credit menu catalog (complete)
- CPS-001–004: Pricing/settings fixes (complete, 2026-03-03)

## Clarifications
- Q: Is the pricing model subscription + top-up packs, packs-only, tiered, or freemium?
- A: **Subscription + top-up packs** (£29/month includes bundled credits, packs for top-ups)

- Q: Should the budget service change its fail-open posture for monetisation?
- A: **Keep fail-open** (availability over accuracy, reconcile after)

- Q: How should fleet graceful degradation work when credits run low?
- A: **Complete current action, stop loop** (no tier downgrade, no priority queue)

- Q: Should the PRD focus on closing existing gaps or building the subscription layer?
- A: **Both — phased** (Phase 1 hardens existing, Phase 2 builds subscription layer)

## Agent Findings Summary

### Codebase Scout
- **37+ implemented stories** across credit packs, ledger, menu, budget service
- **20 UI components** in `src/components/credits/`
- Full Stripe webhook handling: subscription lifecycle, credit pack fulfillment, auto top-up, refunds
- Atomic deduction via `deduct_credits_fifo()` with `FOR UPDATE` row lock
- Model router with circuit breaker, 3 intelligence tiers, 5 features

### Patterns Analyst
- Budget check: `creditBudgetService.checkBudget()` — singleton, 60s cache, fail-open
- Cost tracking: `logAICostEvent()` + `logFlatRateCostEvent()` in `costTracking.ts`
- Agent execution: `autonomousExecutor.ts` with pre-flight budget check per iteration
- Subscription credits: `grant_subscription_credits` / `expire_subscription_credits` RPCs

### Risk Scanner
- **LOW risk**: Atomic deduction prevents double-spending via FOR UPDATE lock
- **LOW risk**: Auto top-up is actually webhook-confirmed (not pure fire-and-forget)
- **MEDIUM risk**: Basic plan has no bundled credits (only Pro gets 250)
- **MEDIUM risk**: 18+ edge functions burn unmetered credits (covered by GAP-002/003/004/009)
- **LOW risk**: Budget cap TOCTOU window is negligible (reset at midnight, not sub-second)

### Scope Sizer
- **7 new stories** for credit governance plan
- **10 existing stories** in plan-billing-completeness-audit.json (unstarted)
- Total estimated: 2.5–3.5 hours (with parallel execution)
- Critical dependency: GAP-002/003/004 must run alongside or before

## Synthesis

### Agreements (all agents align)
- Credit system is production-grade, not stubs
- Basic plan bundled credits are the primary missing piece
- Graceful fleet degradation needs work (currently hard-aborts)
- Subscription management UI exists but needs polish

### Conflicts (resolved)
- None — all agents agreed on the scope

### Gaps
1. Basic plan gets 0 bundled credits (only Pro gets 250)
2. autonomousExecutor aborts on CreditExhaustedError instead of completing current action
3. Usage charts don't show per-agent cost attribution
4. Subscription management UI needs plan comparison and credit impact warnings

## Final Recommendation
See `.sixty/plan-credit-governance.json` (7 stories, 3 phases)
