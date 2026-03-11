# PRD: Stripe Coupon System

**Run slug:** `stripe-coupon-system`
**Branch:** `feature/stripe-coupon-system`
**Tier:** 2 (Sonnet x2, Opus reviewer)
**Date:** 2026-03-11

---

## Problem Statement

Platform admins currently have to manage coupons directly in the Stripe Dashboard — outside the 60 platform. There's no visibility into coupon performance, no way to apply discounts to existing subscribers, and customers can't see their active discount on their billing page. The checkout infrastructure already supports promotion codes (`allow_promotion_codes: true`), but there's no admin-facing system to create, track, or manage them.

---

## Goals

- Platform admins can create, manage, and deactivate coupons and promotion codes without leaving 60
- Both percentage-off and fixed-amount-off coupons supported, with all Stripe duration models (once, repeating, forever)
- Promotion codes support public distribution (e.g. "LAUNCH20") and 1:1 per-customer codes from sales reps
- Coupons can be restricted to specific plans/products or apply to all
- Admins can apply coupons to existing subscribers mid-cycle
- Customers see their active discount on the billing page
- Coupon usage tracked via webhooks with analytics in BillingAnalytics
- Coupon validation endpoint rate-limited to prevent brute-force guessing

---

## What Already Exists (Do NOT Rebuild)

| Capability | Status | Location |
|---|---|---|
| Stripe SDK v14.14.0 (Coupons + PromotionCodes API) | Operational | `_shared/stripe.ts` |
| Checkout accepts promotion codes | Operational | `create-checkout-session/index.ts` (line 219) |
| Credit checkout accepts promotion codes | Operational | `create-credit-checkout/index.ts` (line 163) |
| `discount_info` JSONB on subscriptions | Exists | `organization_subscriptions.discount_info` |
| Stripe webhook handler (12 events) | Operational | `webhook-integrations/handlers/stripe.ts` |
| Webhook signature verification (HMAC-SHA256) | Operational | `_shared/stripe.ts` |
| Billing event log (idempotency) | Operational | `billing_event_log` table |
| Stripe product router pattern | Operational | `stripe-router/index.ts` with handlers/ |
| Platform admin guard | Operational | `PlatformAdminRouteGuard` |
| Admin pricing page | Operational | `PricingControl` at `/platform/pricing` |
| SaaS admin dashboard | Operational | `SaasAdminDashboard` at `/platform/customers` |
| Billing settings page | Operational | `BillingSettingsPage` |
| Billing analytics | Operational | `BillingAnalytics` |
| Stripe secrets (all envs) | Set | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

---

## User Stories

### US-001: Database Schema for Coupon Tracking
**Description:** As a platform admin, I need database tables to store coupon metadata and track redemptions so that coupon data is queryable locally without hitting the Stripe API for every read.

**Acceptance Criteria:**
- [ ] `stripe_coupons` table: `id` (UUID PK), `stripe_coupon_id` (TEXT UNIQUE), `name` (TEXT), `discount_type` (TEXT CHECK 'percent_off' or 'amount_off'), `discount_value` (NUMERIC), `currency` (TEXT), `duration` (TEXT CHECK 'once', 'repeating', 'forever'), `duration_in_months` (INT), `max_redemptions` (INT), `times_redeemed` (INT DEFAULT 0), `redeem_by` (TIMESTAMPTZ), `applies_to_products` (TEXT[]), `is_active` (BOOLEAN DEFAULT true), `metadata` (JSONB DEFAULT '{}'), `created_by` (UUID REFERENCES auth.users), `created_at` (TIMESTAMPTZ DEFAULT NOW()), `updated_at` (TIMESTAMPTZ DEFAULT NOW())
- [ ] `coupon_redemptions` table: `id` (UUID PK), `coupon_id` (UUID REFERENCES stripe_coupons), `org_id` (UUID REFERENCES organizations), `stripe_promotion_code_id` (TEXT), `promotion_code` (TEXT), `stripe_subscription_id` (TEXT), `stripe_checkout_session_id` (TEXT), `discount_amount_cents` (INT), `applied_at` (TIMESTAMPTZ DEFAULT NOW()), `removed_at` (TIMESTAMPTZ)
- [ ] `stripe_promotion_codes` table: `id` (UUID PK), `coupon_id` (UUID REFERENCES stripe_coupons), `stripe_promotion_code_id` (TEXT UNIQUE), `code` (TEXT NOT NULL), `is_active` (BOOLEAN DEFAULT true), `max_redemptions` (INT), `times_redeemed` (INT DEFAULT 0), `expires_at` (TIMESTAMPTZ), `customer_restriction` (TEXT), `first_time_only` (BOOLEAN DEFAULT false), `minimum_amount_cents` (INT), `minimum_amount_currency` (TEXT), `created_at` (TIMESTAMPTZ DEFAULT NOW())
- [ ] RLS policies: platform admins can CRUD all tables; service role has full access
- [ ] Indexes on `stripe_coupons.stripe_coupon_id`, `stripe_promotion_codes.code`, `coupon_redemptions.org_id`
- [ ] Migration uses `DROP POLICY IF EXISTS` before `CREATE POLICY`
- [ ] Migration created via `./scripts/new-migration.sh stripe-coupon-tables`
- [ ] Typecheck passes

### US-002: Coupon Admin Edge Function
**Description:** As a platform admin, I need a backend API to create, list, update, and delete coupons and promotion codes so that coupon management is handled securely server-side via the Stripe API.

**Acceptance Criteria:**
- [ ] New edge function `coupon-admin-router/index.ts` with router pattern (follows `stripe-router`)
- [ ] `list_coupons` handler: reads from local `stripe_coupons` table, returns with promotion code counts
- [ ] `create_coupon` handler: calls `stripe.coupons.create()`, inserts into `stripe_coupons`, returns created coupon
- [ ] `update_coupon` handler: calls `stripe.coupons.update()` (name/metadata only — Stripe limitation), updates local record
- [ ] `delete_coupon` handler: calls `stripe.coupons.del()`, marks `is_active = false` locally
- [ ] `create_promotion_code` handler: calls `stripe.promotionCodes.create()`, inserts into `stripe_promotion_codes`
- [ ] `list_promotion_codes` handler: reads from `stripe_promotion_codes` filtered by `coupon_id`
- [ ] `update_promotion_code` handler: calls `stripe.promotionCodes.update()` (active status), updates local record
- [ ] `apply_to_subscription` handler: calls `stripe.subscriptions.update({ coupon })` for existing subscribers
- [ ] Auth: JWT validation + platform admin check (follows `stripe-router` auth pattern)
- [ ] In-memory rate limiting: 20 req/min per IP on create/update actions
- [ ] Uses `getStripeClient()` from `_shared/stripe.ts`
- [ ] Uses `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- [ ] Pins `@supabase/supabase-js@2.43.4`
- [ ] TypeScript types added to `src/lib/types/subscription.ts`: `StripeCoupon`, `StripePromotionCode`, `CouponRedemption`
- [ ] Typecheck passes

### US-003: Coupon Admin Page
**Description:** As a platform admin, I want a dedicated page to view and manage all coupons so that I can create discounts, generate promotion codes, and monitor usage without leaving 60.

**Acceptance Criteria:**
- [ ] New page `CouponAdmin` at `/platform/coupons` behind `PlatformAdminRouteGuard`
- [ ] Route registered in `App.tsx`, lazy import in `lazyPages.tsx`
- [ ] Navigation link added to platform admin sidebar/nav (follows existing platform nav pattern)
- [ ] Coupons table: name, type (% or fixed), value, duration, redemptions/max, status badge (Active/Inactive/Expired), created date
- [ ] Create Coupon dialog: name, discount type toggle (percentage/fixed amount), value input, currency selector (for fixed), duration selector (once/repeating/forever), duration_in_months (if repeating), max redemptions, redeem by date, plan restriction multi-select
- [ ] Inline actions per coupon row: View Promo Codes, Edit (name/metadata), Deactivate/Reactivate toggle, Delete (with confirmation)
- [ ] Expandable row or detail sheet showing promotion codes for each coupon
- [ ] Create Promotion Code dialog: code (auto-generate option), max redemptions, expires at, customer restriction (email input), first-time-only toggle, minimum amount
- [ ] Deactivate/reactivate toggle on promotion codes
- [ ] Frontend service `couponAdminService.ts` calling `coupon-admin-router` via `supabase.functions.invoke()`
- [ ] React Query hooks: `useCoupons()`, `useCreateCoupon()`, `usePromotionCodes(couponId)`, `useCreatePromotionCode()`
- [ ] Toast notifications on all CRUD operations (success and error)
- [ ] Empty state when no coupons exist
- [ ] Lucide icons only (Tag, Percent, DollarSign, Copy, Trash2, Plus, ToggleLeft)
- [ ] Dark mode support
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-004: Stripe Webhook Discount Handlers
**Description:** As the system, I need to capture discount events from Stripe webhooks so that local coupon data stays in sync and redemptions are tracked.

**Acceptance Criteria:**
- [ ] Extend `webhook-integrations/handlers/stripe.ts` with handlers for: `customer.discount.created`, `customer.discount.deleted`
- [ ] `handleDiscountCreated`: updates `organization_subscriptions.discount_info` JSONB with coupon details, inserts into `coupon_redemptions`, increments `times_redeemed` on both `stripe_coupons` and `stripe_promotion_codes`
- [ ] `handleDiscountDeleted`: sets `removed_at` on `coupon_redemptions`, clears `discount_info` on subscription
- [ ] Extract discount data from `checkout.session.completed` events (already handled — add discount extraction to existing handler)
- [ ] All events logged to `billing_event_log` for idempotency
- [ ] Uses existing `verifyWebhookSignature()` pattern (no changes needed)
- [ ] Typecheck passes

### US-005: Customer Billing Discount Display
**Description:** As a customer, I want to see my active discount on the billing page so that I know what coupon is applied, how much I'm saving, and when it expires.

**Acceptance Criteria:**
- [ ] New `ActiveDiscount` component on `BillingSettingsPage` (above or within current plan section)
- [ ] Shows: coupon name, discount value (e.g. "20% off" or "£10 off"), duration remaining (e.g. "3 months remaining" or "Forever"), savings per billing cycle
- [ ] Reads from `organization_subscriptions.discount_info` JSONB (already queried by existing subscription hook)
- [ ] Hidden when no active discount (no empty state needed)
- [ ] Badge styling: green for active, amber for expiring soon (< 1 month), grey for expired
- [ ] Dark mode support
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-006: Coupon Usage Analytics
**Description:** As a platform admin, I want to see coupon performance metrics in the billing analytics dashboard so that I can measure the revenue impact of discounts and identify top-performing codes.

**Acceptance Criteria:**
- [ ] New "Coupons" section in `BillingAnalytics` page (or new tab)
- [ ] Metrics: total active coupons, total redemptions (7d/30d/all-time), total discount given (currency), redemption rate (redemptions / unique checkout sessions)
- [ ] Per-coupon table: code, redemptions, total discount amount, last used date
- [ ] Revenue impact: estimated MRR reduction from active discounts
- [ ] Data sourced from `stripe_coupons`, `coupon_redemptions`, `stripe_promotion_codes` tables
- [ ] React Query hook: `useCouponAnalytics()`
- [ ] Follows existing BillingAnalytics card/chart patterns
- [ ] Dark mode support
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

## Functional Requirements

- FR-1: Only platform admins can access coupon management (create, edit, delete, apply)
- FR-2: Coupon creation syncs to Stripe API immediately; local table is secondary cache
- FR-3: Stripe is source of truth for coupon validity; local records track metadata and analytics
- FR-4: Coupons support both `percent_off` and `amount_off` with multi-currency for fixed amounts
- FR-5: All three Stripe durations supported: `once`, `repeating` (with configurable months), `forever`
- FR-6: Promotion codes can be public (shared openly) or restricted to a specific customer email
- FR-7: Coupons can be restricted to specific Stripe products or apply to all
- FR-8: Admins can apply a coupon to an existing active subscription mid-cycle
- FR-9: Webhook events sync discount state to local database within seconds
- FR-10: Coupon validation endpoint rate-limited to 20 req/min per IP
- FR-11: All CRUD operations show toast feedback (success/error)
- FR-12: Checkout continues to use `allow_promotion_codes: true` — no changes to checkout flow

---

## Non-Goals (Out of Scope)

- Custom checkout UI for entering coupon codes (Stripe Checkout handles this)
- Coupon stacking (Stripe allows one discount per subscription checkout)
- Customer self-service coupon management (customers only enter codes at checkout)
- Automated coupon distribution (e.g. auto-sending codes via email campaigns)
- A/B testing coupon effectiveness
- Coupon code brute-force detection beyond rate limiting

---

## Technical Considerations

### Schema Changes
- 3 new tables: `stripe_coupons`, `coupon_redemptions`, `stripe_promotion_codes`
- RLS policies scoped to platform admins + service role
- Migration via `./scripts/new-migration.sh`

### Edge Function
- New `coupon-admin-router` following `stripe-router` handler pattern
- Deploy with `--no-verify-jwt` on staging (ES256 JWT issue)
- Pin `@supabase/supabase-js@2.43.4` on esm.sh

### Stripe API
- Coupons API: POST/GET/DELETE `/v1/coupons`
- Promotion Codes API: POST/GET `/v1/promotion_codes`, POST `/v1/promotion_codes/:id`
- Note: Coupons are largely immutable after creation (only name/metadata editable)
- Note: Promotion codes cannot be deleted — only deactivated via `active: false`
- Note: `duration: 'forever'` with `amount_off` is being deprecated by Stripe

### Webhook Events to Handle
- `customer.discount.created` — discount applied to subscription
- `customer.discount.deleted` — discount removed from subscription

### Existing Patterns to Follow
- Edge function auth: JWT + platform admin check (see `stripe-router`)
- Frontend service: `supabase.functions.invoke()` pattern (see `stripeSyncService.ts`)
- React Query: factory key pattern with `useMutation` + cache invalidation
- Admin UI: `PricingControl` page structure (guard, table, modals, toast)
- Types: extend `src/lib/types/subscription.ts`

### Key Files to Modify
- `supabase/functions/webhook-integrations/handlers/stripe.ts` — add discount event handlers
- `src/lib/types/subscription.ts` — add coupon/promo code types
- `src/pages/admin/BillingAnalytics.tsx` — add coupon analytics section
- `src/pages/settings/BillingSettingsPage.tsx` — add active discount display

### Key Files to Create
- `supabase/migrations/{ts}_stripe_coupon_tables.sql`
- `supabase/functions/coupon-admin-router/index.ts`
- `supabase/functions/coupon-admin-router/handlers/` (one per action)
- `src/pages/platform/CouponAdmin.tsx`
- `src/lib/services/couponAdminService.ts`
- `src/lib/hooks/useCoupons.ts`
- `src/components/billing/ActiveDiscount.tsx`

---

## Success Metrics

- Platform admins can create a coupon and generate a promotion code in under 60 seconds
- Coupon redemptions tracked with <5 second webhook latency
- Zero Stripe API errors from malformed coupon requests (validated before submission)
- Active discounts visible on customer billing page immediately after webhook processing
- Coupon analytics dashboard loads within 2 seconds

---

## Open Questions

- None — all gaps resolved during discovery phase
