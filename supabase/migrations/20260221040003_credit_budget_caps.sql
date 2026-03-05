-- ============================================================================
-- Credit Budget Caps
-- ============================================================================
-- Per-org spending caps with daily/weekly/unlimited periods.
-- Provides pre-flight check_budget_cap(), increment_budget_spent() for
-- cost-tracking writes, and reset_budget_periods() for the cron job.
-- ============================================================================

-- ============================================================================
-- 1. credit_budget_caps table
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_budget_caps (
  org_id                UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  cap_type              TEXT NOT NULL DEFAULT 'unlimited'
                          CHECK (cap_type IN ('daily', 'weekly', 'unlimited')),
  cap_amount            DECIMAL(10,2),          -- NULL when unlimited
  current_period_spent  DECIMAL(10,4) NOT NULL DEFAULT 0,
  period_reset_at       TIMESTAMPTZ,            -- When current period resets
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE credit_budget_caps IS
  'Per-org credit spending caps. cap_type determines the reset cadence. '
  'NULL cap_amount means unlimited. current_period_spent tracks spend in the active window.';

COMMENT ON COLUMN credit_budget_caps.cap_type IS
  'Cadence of the spending window: daily, weekly, or unlimited.';
COMMENT ON COLUMN credit_budget_caps.cap_amount IS
  'Maximum credits allowed in the current period. NULL = unlimited.';
COMMENT ON COLUMN credit_budget_caps.current_period_spent IS
  'Running total of credits spent in the current period (reset by reset_budget_periods()).';
COMMENT ON COLUMN credit_budget_caps.period_reset_at IS
  'Timestamp when the current period expires and spending resets to 0.';

-- ============================================================================
-- 2. updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_credit_budget_caps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_credit_budget_caps_updated_at ON credit_budget_caps;
CREATE TRIGGER trigger_credit_budget_caps_updated_at
  BEFORE UPDATE ON credit_budget_caps
  FOR EACH ROW
  EXECUTE FUNCTION update_credit_budget_caps_updated_at();

-- ============================================================================
-- 3. RLS Policies
-- ============================================================================

ALTER TABLE credit_budget_caps ENABLE ROW LEVEL SECURITY;

-- Org admins/owners can read their org's cap settings
DROP POLICY IF EXISTS "Org admins can read their credit_budget_caps" ON credit_budget_caps;
DO $$ BEGIN
  CREATE POLICY "Org admins can read their credit_budget_caps"
  ON credit_budget_caps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = credit_budget_caps.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins/owners can update their org's cap settings
DROP POLICY IF EXISTS "Org admins can update their credit_budget_caps" ON credit_budget_caps;
DO $$ BEGIN
  CREATE POLICY "Org admins can update their credit_budget_caps"
  ON credit_budget_caps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = credit_budget_caps.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Platform admins can manage all cap rows (for support / override)
DROP POLICY IF EXISTS "Platform admins can manage all credit_budget_caps" ON credit_budget_caps;
DO $$ BEGIN
  CREATE POLICY "Platform admins can manage all credit_budget_caps"
  ON credit_budget_caps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- service_role bypasses RLS automatically (no explicit policy needed).

-- ============================================================================
-- 4. check_budget_cap(p_org_id) — pre-flight spend check
-- ============================================================================
-- Returns one row: (allowed, spent, cap, cap_type, resets_at).
-- Callers should treat allowed=true as permission to proceed.

CREATE OR REPLACE FUNCTION check_budget_cap(
  p_org_id UUID
) RETURNS TABLE(
  allowed    BOOLEAN,
  spent      DECIMAL,
  cap        DECIMAL,
  cap_type   TEXT,
  resets_at  TIMESTAMPTZ
) AS $$
DECLARE
  v_cap_type            TEXT;
  v_cap_amount          DECIMAL(10,2);
  v_current_period_spent DECIMAL(10,4);
  v_period_reset_at     TIMESTAMPTZ;
BEGIN
  SELECT
    cbc.cap_type,
    cbc.cap_amount,
    cbc.current_period_spent,
    cbc.period_reset_at
  INTO
    v_cap_type,
    v_cap_amount,
    v_current_period_spent,
    v_period_reset_at
  FROM credit_budget_caps cbc
  WHERE cbc.org_id = p_org_id;

  -- No row → org has no cap configured, always allowed
  IF NOT FOUND THEN
    RETURN QUERY SELECT true, 0::DECIMAL, NULL::DECIMAL, 'unlimited'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Unlimited cap → always allowed, report what's been spent
  IF v_cap_type = 'unlimited' THEN
    RETURN QUERY SELECT true, v_current_period_spent::DECIMAL, NULL::DECIMAL, 'unlimited'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Capped period: check if spent >= cap
  IF v_current_period_spent >= v_cap_amount THEN
    RETURN QUERY SELECT false, v_current_period_spent::DECIMAL, v_cap_amount::DECIMAL, v_cap_type, v_period_reset_at;
  ELSE
    RETURN QUERY SELECT true, v_current_period_spent::DECIMAL, v_cap_amount::DECIMAL, v_cap_type, v_period_reset_at;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION check_budget_cap IS
  'Pre-flight check for credit spending. Returns (allowed, spent, cap, cap_type, resets_at). '
  'allowed=false means the org has reached its period cap.';

-- ============================================================================
-- 5. increment_budget_spent(p_org_id, p_amount) — record period spend
-- ============================================================================
-- Upserts the cap row and increments current_period_spent.
-- Called by cost-tracking after a deduction is confirmed.

CREATE OR REPLACE FUNCTION increment_budget_spent(
  p_org_id UUID,
  p_amount  DECIMAL
) RETURNS void AS $$
BEGIN
  INSERT INTO credit_budget_caps (org_id, current_period_spent, updated_at)
  VALUES (p_org_id, p_amount, NOW())
  ON CONFLICT (org_id) DO UPDATE
    SET current_period_spent = credit_budget_caps.current_period_spent + p_amount,
        updated_at            = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE;

COMMENT ON FUNCTION increment_budget_spent IS
  'Atomically increments current_period_spent for an org. '
  'Upserts the cap row if it does not yet exist (defaults to unlimited).';

-- ============================================================================
-- 6. reset_budget_periods() — cron: reset expired period windows
-- ============================================================================
-- Intended to be called by a pg_cron job (e.g. every minute or every hour).
-- Resets orgs whose period_reset_at has passed and advances the window.

CREATE OR REPLACE FUNCTION reset_budget_periods()
RETURNS INT AS $$
DECLARE
  v_reset_count INT;
BEGIN
  UPDATE credit_budget_caps
  SET
    current_period_spent = 0,
    period_reset_at = CASE
      WHEN cap_type = 'daily'  THEN NOW() + INTERVAL '1 day'
      WHEN cap_type = 'weekly' THEN date_trunc('week', NOW()) + INTERVAL '1 week'
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE
    (cap_type = 'daily'  AND period_reset_at <= NOW())
    OR (cap_type = 'weekly' AND period_reset_at <= NOW());

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;
  RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reset_budget_periods IS
  'Resets current_period_spent to 0 for all orgs whose period_reset_at has elapsed. '
  'Advances period_reset_at to the next window. Returns count of orgs reset. '
  'Should be called by a pg_cron job (e.g. every hour).';
