# RevenueCat Metrics Reference

This document maps RevenueCat's subscription analytics definitions to our Stripe-based implementation.

## Core Metrics

### Monthly Recurring Revenue (MRR)

**RevenueCat Definition:**
- Normalizes revenue from active paid subscriptions to a monthly value
- Example: $8/month subscription = $8 MRR, $120/year subscription = $10 MRR (normalized)

**Our Implementation:**
- Calculate from `organization_subscriptions` where `status IN ('active', 'trialing')`
- Normalize annual plans: `(unit_amount * quantity) / 12` for yearly billing cycles
- Use actual Stripe subscription item amounts (not plan table prices) to account for discounts/coupons
- Formula: `SUM(normalized_monthly_amount)` grouped by currency

**Data Sources:**
- `organization_subscriptions.current_recurring_amount_cents` (to be added)
- `organization_subscriptions.billing_cycle` (monthly/yearly)
- `organization_subscriptions.currency`

### Churn Rate

**RevenueCat Definition:**
- Percentage of active subscriptions lost during a given period that have not resubscribed
- Measures both subscriber churn (count) and MRR churn (revenue)

**Our Implementation:**
- **Subscriber Churn:** `(subscriptions_canceled / active_subscriptions_start_of_period) * 100`
- **MRR Churn:** `(mrr_lost_from_cancellations / mrr_start_of_period) * 100`
- Track cancellations from `billing_event_log` where `event_type = 'subscription_canceled'`
- Exclude subscriptions that resubscribed within 30 days (win-back)

**Data Sources:**
- `billing_event_log` for cancellation events
- `organization_subscriptions.status = 'canceled'`
- `organization_subscriptions.canceled_at` timestamp

### Subscription Retention

**RevenueCat Definition:**
- Tracks how paying subscriptions renew and retain over time by cohorts
- Segmented by subscription start date (cohort) or other dimensions (country, product)

**Our Implementation:**
- Group subscriptions by cohort (month/week of `started_at`)
- Calculate retention rate: `(active_subscriptions_in_cohort_at_period_end / total_subscriptions_in_cohort) * 100`
- Track retention at intervals: 1 month, 3 months, 6 months, 12 months

**Data Sources:**
- `organization_subscriptions.started_at` (cohort grouping)
- `organization_subscriptions.status` (active vs canceled)
- `organization_subscriptions.current_period_end` (renewal tracking)

### Realized Lifetime Value (LTV)

**RevenueCat Definition:**
- Total revenue generated from a customer over their entire subscription lifetime
- Based on actual payments received (not projected)

**Our Implementation:**
- Sum all `billing_history` payments where `status = 'paid'` for each `org_id`
- Group by subscription cohort to calculate average LTV per cohort
- Formula: `SUM(amount) WHERE event_type = 'payment' AND status = 'paid' GROUP BY org_id`

**Data Sources:**
- `billing_history.amount` (in cents)
- `billing_history.status = 'paid'`
- `billing_history.event_type = 'payment'`

### Trial Conversion Rate

**RevenueCat Definition:**
- Percentage of trial subscriptions that convert to paid subscriptions

**Our Implementation:**
- Count subscriptions that transitioned from `status = 'trialing'` to `status = 'active'`
- Exclude trials that canceled before conversion
- Formula: `(converted_trials / total_trials_started) * 100`

**Data Sources:**
- `organization_subscriptions.trial_start_at` (trial start)
- `organization_subscriptions.trial_ends_at` (trial end)
- `organization_subscriptions.status` (trialing → active transition)
- `billing_event_log` for trial → paid conversion events

## MRR Movement Categories

**RevenueCat Definition:**
- New MRR: Revenue from new subscriptions
- Expansion MRR: Revenue increase from upgrades/add-ons
- Contraction MRR: Revenue decrease from downgrades
- Churned MRR: Revenue lost from cancellations

**Our Implementation:**
- Track MRR changes via `billing_event_log` events:
  - `subscription_created` → New MRR
  - `subscription_updated` (plan change) → Expansion/Contraction MRR
  - `subscription_canceled` → Churned MRR
- Compare `current_recurring_amount_cents` before/after plan changes

## Segmentation Dimensions

**RevenueCat Supports:**
- By plan/product
- By country/region
- By billing cycle (monthly/yearly)
- By acquisition channel

**Our Implementation:**
- Plan: `subscription_plans.slug`
- Billing Cycle: `organization_subscriptions.billing_cycle`
- Currency: `organization_subscriptions.currency`
- Country: `organizations.country` (if available) or Stripe customer address

## Event Types (Normalized)

We'll normalize Stripe events to a common event type schema:

| Stripe Event | Normalized Event Type | Description |
|--------------|----------------------|-------------|
| `customer.subscription.created` | `subscription_created` | New subscription started |
| `customer.subscription.updated` | `subscription_updated` | Plan change, quantity change, etc. |
| `customer.subscription.deleted` | `subscription_canceled` | Subscription canceled |
| `invoice.paid` | `payment_received` | Successful payment |
| `invoice.payment_failed` | `payment_failed` | Payment attempt failed |
| `checkout.session.completed` | `checkout_completed` | Checkout flow completed |

## Implementation Notes

1. **Idempotency:** All events stored in `billing_event_log` with `provider_event_id` to prevent double-counting
2. **Normalization:** Annual subscriptions normalized to monthly for MRR calculations
3. **Discounts:** Use actual Stripe subscription amounts, not plan table prices
4. **Cohorts:** Group by subscription start date (month/week) for retention analysis
5. **Reconciliation:** Daily job to reconcile Stripe API state with our database
