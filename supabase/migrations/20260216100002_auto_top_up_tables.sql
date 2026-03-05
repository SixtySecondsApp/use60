-- ============================================================================
-- Auto Top-Up Settings and Log Tables
-- ============================================================================
-- Dedicated tables for auto top-up configuration and history.
-- Moves auto-topup config out of org_credit_balance into its own table.

-- ============================================================================
-- 1. auto_top_up_settings — per-org auto top-up configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS auto_top_up_settings (
  -- One row per org
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- Whether auto top-up is active
  enabled BOOLEAN NOT NULL DEFAULT false,

  -- Which pack to auto-purchase
  pack_type TEXT NOT NULL DEFAULT 'starter' CHECK (pack_type IN (
    'starter', 'growth', 'scale',
    'agency_starter', 'agency_growth', 'agency_scale', 'agency_enterprise',
    'custom'
  )),

  -- Trigger threshold: top up when balance drops below this many credits
  threshold INTEGER NOT NULL DEFAULT 10,

  -- Safety cap: maximum number of auto top-ups per calendar month
  monthly_cap INTEGER NOT NULL DEFAULT 3,

  -- Stripe saved payment method for recurring charges
  stripe_payment_method_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. auto_top_up_log — immutable record of every auto top-up event
-- ============================================================================

CREATE TABLE IF NOT EXISTS auto_top_up_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization reference
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- When the top-up was triggered
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Balance at the time of trigger
  trigger_balance DECIMAL(14,2) NOT NULL,

  -- Pack that was purchased
  pack_type TEXT NOT NULL,

  -- Credits that were added
  credits_added DECIMAL(14,2),

  -- Stripe payment reference (populated on success)
  stripe_payment_intent_id TEXT,

  -- Outcome
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'retrying', 'capped')),

  -- Error details (populated on failure/retry)
  error_message TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_auto_top_up_log_org_id
  ON auto_top_up_log(org_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_top_up_log_status
  ON auto_top_up_log(status);

-- ============================================================================
-- 4. updated_at trigger for auto_top_up_settings
-- ============================================================================

CREATE OR REPLACE FUNCTION update_auto_top_up_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_top_up_settings_updated_at ON auto_top_up_settings;
CREATE TRIGGER trigger_auto_top_up_settings_updated_at
  BEFORE UPDATE ON auto_top_up_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_auto_top_up_settings_updated_at();

-- ============================================================================
-- 5. RLS Policies
-- ============================================================================

ALTER TABLE auto_top_up_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_top_up_log ENABLE ROW LEVEL SECURITY;

-- --- auto_top_up_settings ---

-- Org admins/owners can read their settings
DROP POLICY IF EXISTS "Org admins can read their auto_top_up_settings" ON auto_top_up_settings;
DO $$ BEGIN
  CREATE POLICY "Org admins can read their auto_top_up_settings"
  ON auto_top_up_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = auto_top_up_settings.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins/owners can upsert their settings
DROP POLICY IF EXISTS "Org admins can upsert their auto_top_up_settings" ON auto_top_up_settings;
DO $$ BEGIN
  CREATE POLICY "Org admins can upsert their auto_top_up_settings"
  ON auto_top_up_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = auto_top_up_settings.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Org admins can update their auto_top_up_settings" ON auto_top_up_settings;
DO $$ BEGIN
  CREATE POLICY "Org admins can update their auto_top_up_settings"
  ON auto_top_up_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = auto_top_up_settings.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Platform admins can manage all
DROP POLICY IF EXISTS "Platform admins can manage all auto_top_up_settings" ON auto_top_up_settings;
DO $$ BEGIN
  CREATE POLICY "Platform admins can manage all auto_top_up_settings"
  ON auto_top_up_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --- auto_top_up_log ---

-- All org members can read the log (transparency for billing events)
DROP POLICY IF EXISTS "Org members can read their auto_top_up_log" ON auto_top_up_log;
DO $$ BEGIN
  CREATE POLICY "Org members can read their auto_top_up_log"
  ON auto_top_up_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = auto_top_up_log.org_id
      AND om.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Platform admins can manage all
DROP POLICY IF EXISTS "Platform admins can manage all auto_top_up_log" ON auto_top_up_log;
DO $$ BEGIN
  CREATE POLICY "Platform admins can manage all auto_top_up_log"
  ON auto_top_up_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 6. Migrate existing auto-topup settings from org_credit_balance
-- ============================================================================
-- For orgs that had auto_topup_enabled = true, create a settings row.

INSERT INTO auto_top_up_settings (org_id, enabled, pack_type, threshold, monthly_cap)
SELECT
  org_id,
  auto_topup_enabled,
  'starter',  -- default pack; can be updated by admins
  CASE
    WHEN auto_topup_threshold IS NOT NULL THEN FLOOR(auto_topup_threshold)::INTEGER
    ELSE 10
  END,
  3  -- default monthly cap
FROM org_credit_balance
WHERE auto_topup_enabled = true
ON CONFLICT (org_id) DO NOTHING;

-- ============================================================================
-- 7. Comments
-- ============================================================================

COMMENT ON TABLE auto_top_up_settings IS 'Per-org auto top-up configuration: which pack to buy, when to trigger, and how often per month.';
COMMENT ON COLUMN auto_top_up_settings.threshold IS 'Top up when credit balance drops below this value';
COMMENT ON COLUMN auto_top_up_settings.monthly_cap IS 'Maximum number of automatic top-ups allowed per calendar month';
COMMENT ON COLUMN auto_top_up_settings.stripe_payment_method_id IS 'Saved Stripe payment method for recurring auto charges';

COMMENT ON TABLE auto_top_up_log IS 'Immutable log of every auto top-up event (success, failure, or capped)';
COMMENT ON COLUMN auto_top_up_log.trigger_balance IS 'Credit balance at the moment the top-up was triggered';
COMMENT ON COLUMN auto_top_up_log.status IS 'success|failed|retrying|capped';
