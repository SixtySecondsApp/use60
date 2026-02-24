# Progress Log — Subscription Model & Billing Page Rebuild

## Codebase Patterns
- subscription_plans table already exists in baseline (slug-based lookup, Stripe IDs, features JSONB)
- org_subscriptions table already exists (status enum, billing_cycle, trial dates, Stripe IDs)
- org_credit_balance has balance_credits + auto_topup settings — extend with subscription/onboarding columns
- credit_packs table supports FIFO with expiry — subscription credits will use this + dedicated columns
- Edge functions use _shared/stripe.ts for manual HMAC webhook verification (not Stripe SDK)
- All Stripe webhook events logged to billing_event_log before processing
- BillingSettingsPage uses SettingsPageWrapper, useCurrentSubscription(), useCreatePortalSession()
- CreditsSettingsPage already has full credit management UI — billing page shows summary view
- creditPacks.ts has ACTION_CREDIT_COSTS, CREDIT_PACKS catalog, IntelligenceTier type
- subscriptionService.ts has getOrgSubscription, calculateTrialStatus, hasFeatureAccess, canPerformAction
- Deploy to staging with: npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt

---

## Session Log

*No sessions yet*

---
