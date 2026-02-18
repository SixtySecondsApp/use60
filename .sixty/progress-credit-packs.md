# Progress Log — Universal Credit Pack System

## Codebase Patterns
<!-- Reusable learnings across the credit pack feature -->

- Credit deductions route through `deduct_credits()` RPC in `supabase/functions/_shared/costTracking.ts`
- Token-based costs use `logAICostEvent()`, flat-rate costs use `logFlatRateCostEvent()`
- Pre-checks use `checkCreditBalance()` which reads `org_credit_balance.balance_credits`
- Stripe webhook at `stripe-webhook/index.ts` handles checkout.session.completed + charge.refunded
- Auto top-up currently lives on `org_credit_balance` columns (auto_topup_enabled, auto_topup_amount, auto_topup_threshold)
- UI hooks: `useCreditBalance()` polls every 30s, `useRequireCredits()` gates features
- All credit UI in `src/components/credits/`
- Settings page at `src/pages/settings/CreditsSettingsPage.tsx`
- Current denomination: 1 credit = $1 USD → changing to abstract credit units priced via GBP packs

---

## Session Log

### 2026-02-17 — Session 1: Full Feature Implementation ✅

**Stories completed**: 23/23 (all phases)
**Time**: ~10 hours implementation + 15 min validation

#### Phase 1 — Foundation (CRED-001 to CRED-007)
- CRED-001 ✅ credit_packs table, deduct_credits_fifo RPC, add_credits_pack RPC
- CRED-002 ✅ auto_top_up_settings + auto_top_up_log tables with legacy migration
- CRED-003 ✅ Credit pack catalog config (frontend + edge function mirror)
- CRED-004 ✅ creditService.ts rewrite — pack-based balance, FIFO, auto top-up APIs
- CRED-005 ✅ create-credit-checkout: pack-based Stripe checkout in GBP
- CRED-006 ✅ stripe-webhook: pack fulfillment + auto top-up payment handling
- CRED-007 ✅ credit-auto-topup: monthly caps, cooldown, 2-failure auto-disable

#### Phase 2 — AI Action Metering (CRED-008 to CRED-010)
- CRED-008 ✅ costTracking.ts rewrite — intelligence tiers, FIFO deduction, AR budget
- CRED-009 ✅ get-credit-balance: comprehensive response with packs, storage, usage
- CRED-010 ✅ Flat-rate integration costs (apollo 0.3cr, ai-ark 0.25/1.25cr, exa 0.2cr)

#### Phase 3 — AR + Storage (CRED-011 to CRED-013)
- CRED-011 ✅ AR budget columns + check_ar_budget RPC
- CRED-012 ✅ meter-storage monthly cron (audio, transcripts, docs, enrichment)
- CRED-013 ✅ Storage metrics in get-credit-balance response

#### Phase 4 — UI Overhaul (CRED-014 to CRED-020)
- CRED-014 ✅ CreditPurchaseModal with pack selection cards
- CRED-015 ✅ CreditWidget + CreditWidgetDropdown (credit units, burn rate, usage bars)
- CRED-016 ✅ CreditEstimator with tier selector and pack-based calculations
- CRED-017 ✅ CreditsSettingsPage redesign + UsageBreakdownChart + StorageUsageCard + PackInventory
- CRED-018 ✅ TransactionLog + LowBalanceBanner (credit-based)
- CRED-019 ✅ AutoTopUpSettings panel
- CRED-020 ✅ ARBudgetSettings panel

#### Phase 5 — Migration + Launch (CRED-021 to CRED-023)
- CRED-021 ✅ Dollar-to-credits migration script (3.3x rate, idempotent)
- CRED-022 ✅ SimpleModelTierSelector with credit cost display
- CRED-023 ✅ Feature flags + CreditMigrationModal

**Quality Gates**: lint ✅ | tests ✅ (pre-existing failures only) | types: IDE clean
**Bug fixed**: UsageBreakdownChart referenced `BotMessageSquare` instead of imported `Bot`

---
