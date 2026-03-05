# Progress — Fix Credits, Pricing & Settings Issues

## Feature Context
Drue tested on production and found 4 blocking issues for new user activation:
1. Org owners can't change AI tier settings ("Only admin can")
2. Pricing page Buy buttons don't work (calls startTrial instead of Stripe checkout)
3. New users see ~$3 "usage" from automated onboarding enrichment
4. TopUp tab has no actionable buy flow (modal gate + no pack pre-selection)

## Codebase Patterns
- **Correct admin pattern** (from AutonomySettingsPage:177):
  ```tsx
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;
  ```
- **Broken admin pattern** (isUserAdmin from adminUtils — checks profiles.is_admin platform flag):
  - SimpleModelTierSelector.tsx:222-224
  - CreditsSettingsPage.tsx:107-108
  - CreditPurchaseModal.tsx:49-51
- `useCreateCheckoutSession` hook exists in `src/lib/hooks/useSubscription.ts:336-351`
- `logAICostEvent` in `_shared/costTracking.ts` accepts `metadata?: Record<string, unknown>` param
- UsageChart query selects `created_at, estimated_cost` from `ai_cost_events`

## Execution Order
```
CPS-001 (admin gate)  ──→  CPS-004 (TopUp CTA + modal)
CPS-002 (pricing buy)      (independent)
CPS-003 (onboarding cost)  (independent)
```

---

## Session Log

### 2026-03-03 — CPS-001 ✅
**Story**: Fix admin gate so org owners can change AI tier and credit settings
**Files**: src/components/credits/SimpleModelTierSelector.tsx, src/pages/settings/CreditsSettingsPage.tsx
**Time**: 10 min (est: 15 min)
**Gates**: lint ✅ (5 pre-existing warnings, 0 new)
**Changes**: Replaced `isUserAdmin(userData)` with `useOrg().permissions + useUserPermissions().isPlatformAdmin` pattern

---

### 2026-03-03 — CPS-002 ✅
**Story**: Fix Pricing page buy buttons to create Stripe checkout sessions
**Files**: src/pages/Pricing.tsx
**Time**: 10 min (est: 15 min)
**Gates**: lint ✅
**Changes**: Added `useCreateCheckoutSession`, replaced `startTrial.mutateAsync` with `createCheckoutSession.mutateAsync`, added error toast

---

### 2026-03-03 — CPS-003 ✅
**Story**: Exclude onboarding enrichment cost from user-facing usage chart
**Files**: src/components/credits/UsageChart.tsx
**Time**: 10 min (est: 15 min)
**Gates**: lint ✅
**Changes**: Added `feature_key` to select, filter out `deep_enrich_organization/enrich_organization/research_fact_profile` events within 10 min of first org event

---

### 2026-03-03 — CPS-004 ✅
**Story**: TopUp tab: fix modal admin gate and pre-select pack from quick buttons
**Files**: src/components/credits/CreditPurchaseModal.tsx, src/pages/settings/CreditsSettingsPage.tsx
**Time**: 10 min (est: 15 min)
**Gates**: lint ✅
**Changes**: Fixed modal admin gate to use org permissions, added `initialPack` prop with `useEffect` sync, wired Quick Top-Up buttons to pass pack type
