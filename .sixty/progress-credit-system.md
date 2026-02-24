# Progress Log — AI Credit Control System

## Feature Summary
Prepay credit system for all AI usage. Token-based passthrough (1 credit = $1 USD). Stripe self-serve credit packs. Org-configurable planner/driver models per feature. Hard block at zero credits. Rich credit widget in top-right header.

## Existing Infrastructure (DO NOT REBUILD)
- `ai_models` table (provider pricing per million tokens)
- `ai_feature_config` table (features → primary + fallback models)
- `org_ai_config` table (org-level model overrides)
- `ai_cost_events` table (per-call usage tracking)
- `costTracking.ts` (logAICostEvent, checkAgentBudget)
- `_shared/stripe.ts` (Stripe client, customer management)
- `create-checkout-session` edge function (subscription checkout — template for credit checkout)
- `stripe-webhook` edge function (extend for credit purchases)
- Usage aggregation views (ai_usage_by_feature/org/user)
- `calculate_token_cost` RPC function
- `CreditCard` icon already imported in AppLayout

## Codebase Patterns
- Edge functions use `getCorsHeaders(req)` from `corsHelper.ts` for new functions
- Use `esm.sh` with pinned `@supabase/supabase-js@2.43.4`
- Use `maybeSingle()` when record might not exist
- Follow existing checkout session pattern for Stripe integration
- React Query for data fetching, 30s polling for near-realtime

---

## Session Log

*(No stories completed yet)*

---
