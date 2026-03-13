# PRD: Smart Credit Warning System

**Author**: AI
**Date**: 2026-03-13
**Status**: Draft
**Branch**: fix/low-credits

---

## Problem Statement

The low-credit warning banner currently shows for 12+ consecutive days, creating banner fatigue. The logic uses a naive `balance / dailyBurnRate` calculation that triggers at a fixed 14-day threshold regardless of context. It ignores:

1. **Auto top-up** — users with auto top-up enabled will get credits before they run out, yet the banner warns them anyway
2. **Subscription credit renewal** — Pro users receive 250 credits/month at billing cycle renewal; if renewal is imminent, the warning is unnecessary
3. **Monthly credit rhythm** — no awareness of how far through the billing cycle the user is or when credits will be replenished
4. **Relative thresholds** — a user with 100 credits at 13 days projected gets the same amber warning as a user with 5 credits at 13 days

## Goal

Replace the current day-count-only warning logic with a smart projection system that accounts for all credit inflows (auto top-up, subscription renewal, pack credits) and only warns when the user genuinely needs to act.

## Success Metrics

- Warning banner shows for **< 5 days** on average before action needed (vs current ~12 days)
- Zero false-positive warnings for users with working auto top-up
- Pro users only warned when credits won't last until their renewal date
- No change in experience for users who are genuinely running out

---

## Current Architecture

### Edge Function: `get-credit-balance/index.ts`
- Lines 319-330: Burn rate = sum of deductions over 7 days / 7
- `projectedDaysRemaining = balance / dailyBurnRate` (or -1 if no burn)
- Returns flat number, no context about inflows

### Banner: `LowBalanceBanner.tsx`
- Lines 69-70: Amber at `7 ≤ projectedDays < 14`, Red at `< 7`
- Line 103: Checks `autoTopUp?.enabled` but only changes the *message text*, not the *threshold*
- Session-dismissible only

### Widget: `CreditWidgetDropdown.tsx`
- Lines 31-37: Same 7/14-day thresholds for dot color

### Alert Function: `check-credit-alerts/index.ts`
- `low_balance_10cr`: balance < 10 credits (12h cooldown)
- `low_balance_20pct`: balance < 20% of last top-up (24h cooldown)
- Neither accounts for auto top-up or subscription renewal

---

## Proposed Solution

### New Concept: Effective Runway

Replace the simple `balance / burnRate` with an **effective runway** that models future credit inflows:

```
effectiveRunway = daysUntilCreditsExhausted(
  currentBalance,
  dailyBurnRate,
  creditInflows[]  // sorted by date
)
```

Where `creditInflows` includes:
1. **Auto top-up triggers** — if enabled, simulated top-ups when balance would cross threshold (up to monthly cap)
2. **Subscription renewal** — 250 credits at `current_period_end` (Pro plan only)
3. **Expiring subscription credits** — negative inflow at `subscription_credits_expiry`

### Algorithm

```
function computeEffectiveRunway(balance, burnRate, inflows):
  if burnRate <= 0: return Infinity  // no spending

  simulatedBalance = balance
  currentDay = 0
  inflowIndex = 0
  autoTopUpsUsed = 0

  while simulatedBalance > 0 and currentDay < 365:
    currentDay += 1
    simulatedBalance -= burnRate

    // Apply any inflows scheduled for this day
    for each inflow where inflow.daysFromNow == currentDay:
      simulatedBalance += inflow.amount

    // Simulate auto top-up trigger
    if autoTopUp.enabled
       and simulatedBalance <= autoTopUp.threshold
       and autoTopUpsUsed < autoTopUp.remainingThisMonth:
      simulatedBalance += autoTopUp.packCredits
      autoTopUpsUsed += 1

  return currentDay
```

### Warning Thresholds (New)

| Condition | Warning Level | Threshold |
|-----------|--------------|-----------|
| Auto top-up enabled + has remaining top-ups | **No warning** | Unless effective runway < 3 days (top-up might fail) |
| Auto top-up enabled + monthly cap reached | **Amber** | Effective runway < 7 days |
| Pro subscription + renewal within runway | **No warning** | Unless credits won't last until renewal |
| Pro subscription + renewal far away | Standard thresholds | |
| Pay-as-you-go, no auto top-up | **Amber** at < 7 days OR < 10% of last pack | **Red** at < 3 days or < 5 credits |
| Balance = 0 | **Red** (depleted) | Always, regardless of other factors |

### Data Flow Changes

1. **Edge function** (`get-credit-balance`): Compute and return new fields:
   - `effective_runway_days`: number (the smart projection)
   - `runway_factors`: object describing what was factored in
   - `warning_level`: 'none' | 'amber' | 'red' | 'depleted' (server-computed)
   - Keep `projected_days_remaining` for backward compat (old simple calculation)

2. **Frontend** (`LowBalanceBanner.tsx`): Use `warning_level` from server instead of local threshold checks. Server has all the context (subscription, auto top-up, renewal dates) — move the decision there.

3. **Widget** (`CreditWidgetDropdown.tsx`): Use `warning_level` for dot color.

4. **Alert function** (`check-credit-alerts`): Update `low_balance_20pct` and `low_balance_10cr` to use effective runway.

---

## User Stories

### CREDIT-001: Compute Effective Runway in Edge Function
**As** the get-credit-balance edge function
**I need to** compute an effective runway that factors in auto top-up, subscription renewal, and expiring credits
**So that** the frontend receives an accurate warning level

**Acceptance Criteria:**
- [x] New `computeEffectiveRunway()` function in edge function
- [x] Accounts for auto top-up triggers (enabled, threshold, pack credits, remaining monthly cap)
- [x] Accounts for subscription credit renewal (Pro plan, current_period_end, 250 credits)
- [x] Accounts for subscription credit expiry (deduction at expiry date)
- [x] Returns `effective_runway_days`, `runway_factors`, and `warning_level`
- [x] Keeps backward-compatible `projected_days_remaining` field
- [x] Unit-testable: pure function with injected parameters

### CREDIT-002: Server-Side Warning Level Calculation
**As** the get-credit-balance edge function
**I need to** compute a `warning_level` enum based on the effective runway and user's credit configuration
**So that** the frontend can display the correct banner without duplicating business logic

**Acceptance Criteria:**
- [x] `warning_level` is one of: `'none'`, `'amber'`, `'red'`, `'depleted'`
- [x] Auto top-up enabled + remaining top-ups → `'none'` unless effective runway < 3 days
- [x] Auto top-up enabled + cap reached → standard thresholds
- [x] Pro subscription + renewal covers the gap → `'none'`
- [x] Pay-as-you-go: amber at < 7 days OR < 10% of last pack, red at < 3 days
- [x] Balance ≤ 0 → always `'depleted'`
- [x] New users with no cost events → `'none'`

### CREDIT-003: Update Frontend Banner to Use Server Warning Level
**As** the LowBalanceBanner component
**I need to** use `warningLevel` from the credit balance API instead of local projectedDays thresholds
**So that** the banner only appears when the server determines it should

**Acceptance Criteria:**
- [x] Remove hardcoded 7/14-day threshold checks from `LowBalanceBanner.tsx`
- [x] Use `data.warningLevel` to determine banner visibility and color
- [x] `'none'` → hidden, `'amber'` → amber banner, `'red'` → red banner, `'depleted'` → red depleted
- [x] Update banner copy to reflect the smarter logic (e.g., mention renewal date if applicable)
- [x] Keep session-dismiss behavior
- [x] Keep brand-new user suppression

### CREDIT-004: Update Credit Widget Dot Color
**As** the CreditWidgetDropdown component
**I need to** use `warningLevel` for the balance indicator dot
**So that** the dot color matches the banner state

**Acceptance Criteria:**
- [x] Remove hardcoded 7/14-day logic from `getBalanceDotClass()`
- [x] Use `warningLevel` from credit balance data
- [x] `'none'` → green, `'amber'` → amber, `'red'` → red, `'depleted'` → red pulse
- [x] Backward-compatible: if `warningLevel` missing, fall back to projectedDays logic

### CREDIT-005: Update CreditService Types & Mapping
**As** the creditService frontend module
**I need to** map the new API response fields to TypeScript types
**So that** components can access `warningLevel`, `effectiveRunway`, and `runwayFactors`

**Acceptance Criteria:**
- [x] Add `warningLevel`, `effectiveRunwayDays`, `runwayFactors` to `CreditBalance` interface
- [x] Map snake_case API response to camelCase in `getBalance()`
- [x] `runwayFactors` includes: `autoTopUpCreditsProjected`, `subscriptionRenewalCreditsProjected`, `daysUntilRenewal`, `autoTopUpsRemaining`
- [x] Backward-compatible: missing fields default to safe values

### CREDIT-006: Update Credit Health Widget & Billing Section
**As** the CreditHealth and CreditBalanceSection components
**I need to** use the new warning thresholds
**So that** the admin dashboard and billing page show consistent warning colors

**Acceptance Criteria:**
- [x] `CreditHealth.tsx`: Use effective runway for projection color
- [x] `CreditBalanceSection.tsx`: Use warning level for balance color
- [x] `CreditsSettingsPage.tsx`: Update color helpers to use warning level
- [x] All components fall back gracefully if new fields missing

### CREDIT-007: Update Alert Function for Smart Thresholds
**As** the check-credit-alerts edge function
**I need to** factor in auto top-up and subscription renewal when evaluating low balance alerts
**So that** users with auto top-up or imminent renewal don't get unnecessary alert notifications

**Acceptance Criteria:**
- [x] `evaluateLowBalance10cr()`: Skip if auto top-up enabled and has remaining monthly cap
- [x] `evaluateLowBalance20pct()`: Skip if Pro renewal within 7 days and balance will last until then
- [x] Add new alert type `auto_topup_failing` for when auto top-up is enabled but cap reached or payment failing
- [x] No changes to `negative_balance` or `budget_cap_hit` alerts (still critical)

---

## Out of Scope

- Changing auto top-up logic itself (thresholds, pack selection)
- Subscription plan changes or pricing
- Credit deduction order (FIFO)
- New notification channels (email/Slack for credit warnings)
- Budget cap system changes

---

## Technical Notes

- All warning logic moves server-side into `get-credit-balance` edge function
- Frontend becomes a dumb renderer of `warningLevel`
- Subscription data fetched from `organization_subscriptions` table (need to add to the edge function query)
- Auto top-up data already fetched (`auto_top_up_settings` + `auto_top_up_log`)
- Credit pack sizes from `creditPacks.ts` config (also available server-side)
