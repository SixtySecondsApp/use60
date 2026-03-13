-- Creates stripe_coupons, stripe_promotion_codes, and coupon_redemptions tables

CREATE TABLE IF NOT EXISTS stripe_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_coupon_id text NOT NULL UNIQUE,
  name text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percent_off', 'amount_off')),
  discount_value numeric(12,2) NOT NULL,
  currency text DEFAULT 'GBP',
  duration text NOT NULL CHECK (duration IN ('once', 'repeating', 'forever')),
  duration_in_months integer,
  max_redemptions integer,
  times_redeemed integer NOT NULL DEFAULT 0,
  redeem_by timestamptz,
  applies_to_products text[],
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_coupons_stripe_id ON stripe_coupons(stripe_coupon_id);
CREATE INDEX IF NOT EXISTS idx_stripe_coupons_active ON stripe_coupons(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS stripe_promotion_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES stripe_coupons(id) ON DELETE CASCADE,
  stripe_promotion_code_id text NOT NULL UNIQUE,
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  max_redemptions integer,
  times_redeemed integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  customer_restriction text,
  first_time_only boolean NOT NULL DEFAULT false,
  minimum_amount_cents integer,
  minimum_amount_currency text DEFAULT 'GBP',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON stripe_promotion_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_coupon ON stripe_promotion_codes(coupon_id);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES stripe_coupons(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  stripe_promotion_code_id text,
  promotion_code text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  discount_amount_cents integer NOT NULL DEFAULT 0,
  applied_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_redemptions_org ON coupon_redemptions(org_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_coupon ON coupon_redemptions(coupon_id);

ALTER TABLE stripe_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_promotion_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can manage coupons" ON stripe_coupons;
CREATE POLICY "Platform admins can manage coupons" ON stripe_coupons
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'is_admin' = 'true'
    )
  );

DROP POLICY IF EXISTS "Platform admins can manage promo codes" ON stripe_promotion_codes;
CREATE POLICY "Platform admins can manage promo codes" ON stripe_promotion_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'is_admin' = 'true'
    )
  );

DROP POLICY IF EXISTS "Platform admins can view redemptions" ON coupon_redemptions;
CREATE POLICY "Platform admins can view redemptions" ON coupon_redemptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'is_admin' = 'true'
    )
  );

DROP POLICY IF EXISTS "Org members can view own redemptions" ON coupon_redemptions;
CREATE POLICY "Org members can view own redemptions" ON coupon_redemptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = coupon_redemptions.org_id
      AND om.user_id = auth.uid()
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organization_subscriptions'
    AND column_name = 'discount_info'
  ) THEN
    ALTER TABLE organization_subscriptions ADD COLUMN discount_info jsonb;
  END IF;
END $$;
