-- Migration: founding_member_plan
-- Date: 20260314211923
--
-- What this migration does:
--   1. Adds price_lifetime, price_lifetime_gbp, price_lifetime_eur, welcome_credits columns to subscription_plans
--   2. Extends billing_cycle CHECK constraint on organization_subscriptions to allow 'lifetime'
--   3. Inserts the founding member plan into subscription_plans
--   4. Creates platform_counters table for scarcity counter (FM-006)
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS platform_counters;
--   DELETE FROM subscription_plans WHERE slug = 'founding';
--   ALTER TABLE organization_subscriptions DROP CONSTRAINT IF EXISTS organization_subscriptions_billing_cycle_check;
--   ALTER TABLE organization_subscriptions ADD CONSTRAINT organization_subscriptions_billing_cycle_check CHECK (billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text]));
--   ALTER TABLE subscription_plans DROP COLUMN IF EXISTS price_lifetime, DROP COLUMN IF EXISTS price_lifetime_gbp, DROP COLUMN IF EXISTS price_lifetime_eur, DROP COLUMN IF EXISTS welcome_credits;

-- ============================================================================
-- 1. Add new columns to subscription_plans
-- ============================================================================

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_lifetime integer DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_lifetime_gbp integer DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_lifetime_eur integer DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS welcome_credits integer DEFAULT 0;

-- ============================================================================
-- 2. Extend billing_cycle CHECK constraint to allow 'lifetime'
-- ============================================================================

ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_billing_cycle_check;

ALTER TABLE organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_billing_cycle_check
  CHECK (billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text, 'lifetime'::text]));

-- ============================================================================
-- 3. Insert founding member plan (idempotent via ON CONFLICT)
-- ============================================================================

INSERT INTO subscription_plans (
  slug, name, description,
  price_monthly, price_yearly, price_lifetime,
  price_lifetime_gbp, price_lifetime_eur,
  currency, welcome_credits,
  max_users, max_meetings_per_month, max_ai_tokens_per_month, max_storage_mb,
  features, is_active, is_public, is_free_tier,
  trial_days, display_order, badge_text, cta_text,
  highlight_features
) VALUES (
  'founding', 'Founding Member', 'Lifetime Pro access with BYOK. Pay once, use forever.',
  0, 0, 29900,
  23900, 27900,
  'USD', 500,
  999, 999, 999999, 102400,
  '{"analytics": true, "team_insights": true, "api_access": true, "custom_branding": true, "priority_support": true, "founding_member": true, "byok": true, "bundled_credits": 0}'::jsonb,
  true, true, false,
  0, 0, 'Lifetime Deal', 'Claim Your Spot',
  ARRAY['Lifetime platform access', '500 welcome credits', 'Bring your own API key', 'Founding Member badge', 'Private Slack community', 'Early access to features']
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_lifetime = EXCLUDED.price_lifetime,
  price_lifetime_gbp = EXCLUDED.price_lifetime_gbp,
  price_lifetime_eur = EXCLUDED.price_lifetime_eur,
  welcome_credits = EXCLUDED.welcome_credits,
  features = EXCLUDED.features,
  highlight_features = EXCLUDED.highlight_features;

-- ============================================================================
-- 4. Create platform_counters table for scarcity counter (FM-006)
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_counters (
  key text PRIMARY KEY,
  value integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Seed the founding member counter
INSERT INTO platform_counters (key, value) VALUES ('founding_members', 47)
ON CONFLICT (key) DO NOTHING;

-- Public read access (no auth needed for landing page)
ALTER TABLE platform_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read counters" ON platform_counters;
CREATE POLICY "Anyone can read counters" ON platform_counters
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role can update counters" ON platform_counters;
CREATE POLICY "Service role can update counters" ON platform_counters
  FOR ALL USING (auth.role() = 'service_role');
