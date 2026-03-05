# Progress Log — Credits Page Cleanup (TSK-0453)

## Session: 2026-03-04

### CRED-001 — Update credit pack pricing ✅
**Owner**: team-lead (opus)
**Files**: src/lib/config/creditPacks.ts, supabase/functions/_shared/creditPacks.ts
**Changes**: Starter £49→£15, Growth £99→£30, Scale £149→£50 (USD/EUR proportional)
**Time**: ~3 min
**Gates**: typecheck ✅ (only pre-existing landing pkg errors)

---

### CRED-002 — Add intelligence tier tooltips ✅
**Owner**: tooltip-agent (sonnet)
**Files**: src/components/credits/CreditEstimator.tsx, src/components/credits/SimpleModelTierSelector.tsx
**Changes**:
- Added TIER_TOOLTIPS map with descriptions for low/medium/high tiers
- Wrapped tier buttons/cards with Tooltip/TooltipTrigger/TooltipContent from UI lib
- Added TooltipProvider wrapper around tier selectors
**Time**: ~5 min

---

### CRED-003 — Wire CreditEstimator to credit_menu DB ✅
**Owner**: estimator-agent (sonnet)
**Files**: src/components/credits/CreditEstimator.tsx
**Changes**:
- Added React Query fetch of getCreditMenu() from creditService
- Built dbCosts map from credit_menu response (action_id → {low, medium, high})
- Estimates now prefer DB costs, fall back to hardcoded ACTION_CREDIT_COSTS
- Loading opacity while fetching, 5-min stale cache
**Time**: ~5 min

---

### CRED-004 — Verify Stripe + auto top-up ✅
**Owner**: team-lead (opus)
**Verification results**:
- CreditPurchaseModal reads from CREDIT_PACKS → shows updated Signal £15, Insight £30, Intelligence £50
- Quick Top-Up buttons on CreditsSettingsPage read from same config → updated
- AutoTopUpSettings pack selector reads CREDIT_PACKS → updated
- create-credit-checkout edge function imports from _shared/creditPacks.ts → updated
- No hardcoded old prices (£49/£99/£149) remain in standard pack definitions
- TypeScript compilation: clean (only pre-existing landing package error)

---

## Feature: COMPLETE ✅
Stories: 4/4
Team: 1 opus leader + 2 sonnet agents
