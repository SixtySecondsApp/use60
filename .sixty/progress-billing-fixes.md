# Progress Log — Billing Settings Page Fixes

## Problem Summary
Brand new users (never touched billing) see contradictory UI:
1. "Current Plan: Basic" badge on the Basic card — wrong, they have NO plan
2. Both "Current Plan" button (disabled) on Basic + "Upgrade to Pro" on Pro shown simultaneously
3. "Upgrade to Pro" click fails with generic "Edge Function returned non-2xx status code"

## Root Causes
1. `currentPlanSlug` defaults to `'basic'` when `subscription` is null (line 107)
2. `isBasicUser` is `true` for both "no subscription" AND "on basic plan" — no distinction
3. Edge function uses `.single()` for membership check which throws PGRST116 on missing row
4. Frontend `createCheckoutSession` doesn't parse error body from edge function responses

## Codebase Patterns
- Subscription state comes from `useCurrentSubscription()` → `useSubscriptionState()` → `getOrgSubscription()`
- `getOrgSubscription()` correctly returns `null` when no record exists (uses `maybeSingle()`)
- Plan comparison uses static `PLAN_DETAILS` config, not DB plans
- Edge function returns structured JSON errors with status codes but frontend doesn't extract them

---

## Session Log

(execution starts here)
