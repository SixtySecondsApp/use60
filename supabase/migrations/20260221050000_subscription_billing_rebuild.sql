-- ============================================================================
-- Subscription Billing Rebuild: Basic/Pro Tiers + Subscription Credit Columns
-- ============================================================================
-- Part of the two-tier subscription model (Basic £29/mo, Pro £99/mo).
-- 1. Ensures slug unique constraint on subscription_plans
-- 2. Inserts new Basic and Pro plan rows
-- 3. Deactivates legacy plan rows (starter/growth/team/free/enterprise)
-- 4. Adds trial meeting tracking columns to organization_subscriptions
-- 5. Adds subscription/onboarding credit columns to org_credit_balance
-- 6. Updates status CHECK constraint to include 'expired'

-- ============================================================================
-- 1. Ensure slug has a unique constraint (required for ON CONFLICT)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_plans_slug_key'
  ) THEN
    ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_slug_key UNIQUE (slug);
  END IF;
END $$;

-- ============================================================================
-- 2. Insert Basic plan
-- ============================================================================

INSERT INTO subscription_plans (
  name, slug, description,
  price_monthly, price_yearly, currency,
  max_users, max_meetings_per_month, max_ai_tokens_per_month, max_storage_mb,
  features,
  is_active, is_default, is_free_tier, is_public,
  display_order, badge_text,
  cta_text, cta_url,
  highlight_features,
  trial_days, included_seats, per_seat_price,
  meeting_retention_months
)
VALUES (
  'Basic', 'basic', 'For individuals and small teams getting started with AI-powered sales workflows.',
  2900, 29000, 'GBP',
  NULL, NULL, NULL, NULL,
  '{
    "analytics": true,
    "team_insights": false,
    "api_access": false,
    "webhooks": false,
    "advanced_analytics": false,
    "coaching_digests": false,
    "bundled_credits": 0,
    "custom_branding": false,
    "priority_support": false
  }'::jsonb,
  true, true, false, true,
  1, NULL,
  'Get Started', NULL,
  ARRAY['Unlimited call recording', 'HubSpot integration', 'AI Copilot (credits)', 'Calendar sync', 'Slack notifications', 'Basic analytics'],
  14, 1, 0,
  NULL
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  currency = EXCLUDED.currency,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  is_default = EXCLUDED.is_default,
  is_free_tier = EXCLUDED.is_free_tier,
  is_public = EXCLUDED.is_public,
  display_order = EXCLUDED.display_order,
  badge_text = EXCLUDED.badge_text,
  cta_text = EXCLUDED.cta_text,
  highlight_features = EXCLUDED.highlight_features,
  trial_days = EXCLUDED.trial_days,
  updated_at = NOW();

-- ============================================================================
-- 3. Insert Pro plan
-- ============================================================================

INSERT INTO subscription_plans (
  name, slug, description,
  price_monthly, price_yearly, currency,
  max_users, max_meetings_per_month, max_ai_tokens_per_month, max_storage_mb,
  features,
  is_active, is_default, is_free_tier, is_public,
  display_order, badge_text,
  cta_text, cta_url,
  highlight_features,
  trial_days, included_seats, per_seat_price,
  meeting_retention_months
)
VALUES (
  'Pro', 'pro', 'For power users and scaling teams. Bundled credits and API access included.',
  9900, 99000, 'GBP',
  NULL, NULL, NULL, NULL,
  '{
    "analytics": true,
    "team_insights": true,
    "api_access": true,
    "webhooks": true,
    "advanced_analytics": true,
    "coaching_digests": true,
    "bundled_credits": 250,
    "custom_branding": false,
    "priority_support": true
  }'::jsonb,
  true, false, false, true,
  2, 'Most Popular',
  'Upgrade to Pro', NULL,
  ARRAY['Everything in Basic', '250 credits/month (bundled)', 'API & Webhooks access', 'Advanced analytics & coaching', 'Priority support'],
  14, 1, 0,
  NULL
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  currency = EXCLUDED.currency,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  is_default = EXCLUDED.is_default,
  is_free_tier = EXCLUDED.is_free_tier,
  is_public = EXCLUDED.is_public,
  display_order = EXCLUDED.display_order,
  badge_text = EXCLUDED.badge_text,
  cta_text = EXCLUDED.cta_text,
  highlight_features = EXCLUDED.highlight_features,
  trial_days = EXCLUDED.trial_days,
  updated_at = NOW();

-- ============================================================================
-- 4. Deactivate legacy plan rows
-- ============================================================================

UPDATE subscription_plans
SET is_active = false, is_public = false, is_default = false, updated_at = NOW()
WHERE slug IN ('starter', 'growth', 'team', 'free', 'enterprise')
  AND slug NOT IN ('basic', 'pro');

-- ============================================================================
-- 5. Add trial meeting tracking to organization_subscriptions
-- ============================================================================

ALTER TABLE organization_subscriptions
  ADD COLUMN IF NOT EXISTS trial_meetings_used INTEGER DEFAULT 0;

ALTER TABLE organization_subscriptions
  ADD COLUMN IF NOT EXISTS trial_meetings_limit INTEGER DEFAULT 100;

-- ============================================================================
-- 6. Update status CHECK constraint to include 'expired'
-- ============================================================================

ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_status_check;

ALTER TABLE organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_status_check
  CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused', 'expired'));

-- ============================================================================
-- 7. Add subscription/onboarding credit columns to org_credit_balance
-- ============================================================================

-- Subscription credits (Pro plan — refresh monthly, expire at cycle end)
ALTER TABLE org_credit_balance
  ADD COLUMN IF NOT EXISTS subscription_credits_balance DECIMAL(12,4) DEFAULT 0;

ALTER TABLE org_credit_balance
  ADD COLUMN IF NOT EXISTS subscription_credits_expiry TIMESTAMPTZ DEFAULT NULL;

-- Onboarding credits (granted once on setup completion, never expire)
ALTER TABLE org_credit_balance
  ADD COLUMN IF NOT EXISTS onboarding_credits_balance DECIMAL(12,4) DEFAULT 0;

ALTER TABLE org_credit_balance
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false;

-- ============================================================================
-- 8. Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN organization_subscriptions.trial_meetings_used IS 'Number of meetings processed during trial period';
COMMENT ON COLUMN organization_subscriptions.trial_meetings_limit IS 'Maximum meetings allowed during trial (default 100)';
COMMENT ON COLUMN org_credit_balance.subscription_credits_balance IS 'Pro plan bundled credits — reset each billing cycle, expire if unused';
COMMENT ON COLUMN org_credit_balance.subscription_credits_expiry IS 'When subscription credits expire (end of current billing period)';
COMMENT ON COLUMN org_credit_balance.onboarding_credits_balance IS 'One-time onboarding credits — granted on setup completion, never expire';
COMMENT ON COLUMN org_credit_balance.onboarding_complete IS 'Whether onboarding credits have been granted (prevents double-grant)';
