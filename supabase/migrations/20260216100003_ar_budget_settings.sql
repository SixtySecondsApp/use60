-- ============================================================================
-- AR Budget Settings
-- ============================================================================
-- Adds AR (autonomous research / proactive agent) monthly credit caps per org.
-- Columns added directly to org_credit_balance for simplicity.
-- Provides a check_ar_budget() RPC for pre-flight checks in agent edge functions.
-- ============================================================================

-- ============================================================================
-- 1. Add AR budget columns to org_credit_balance
-- ============================================================================

ALTER TABLE org_credit_balance
  ADD COLUMN IF NOT EXISTS ar_monthly_cap INTEGER DEFAULT NULL,  -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS ar_paused BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN org_credit_balance.ar_monthly_cap IS
  'Monthly credit cap for autonomous research (AR) agent runs. NULL = unlimited.';
COMMENT ON COLUMN org_credit_balance.ar_paused IS
  'When true, proactive/autonomous agent runs are blocked for this org.';

-- ============================================================================
-- 2. check_ar_budget RPC
-- ============================================================================
-- Returns: { allowed boolean, used_this_month numeric, cap numeric }
-- Callers should treat allowed=true as permission to proceed.

CREATE OR REPLACE FUNCTION check_ar_budget(
  p_org_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_ar_paused BOOLEAN;
  v_monthly_cap INTEGER;
  v_used_this_month DECIMAL;
  v_month_start TIMESTAMPTZ;
BEGIN
  -- Fetch AR settings for this org
  SELECT ar_paused, ar_monthly_cap
  INTO v_ar_paused, v_monthly_cap
  FROM org_credit_balance
  WHERE org_id = p_org_id;

  -- If no balance row, treat as allowed (org not yet on credit system)
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used_this_month', 0,
      'cap', NULL
    );
  END IF;

  -- Hard pause overrides everything
  IF v_ar_paused THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used_this_month', 0,
      'cap', v_monthly_cap,
      'reason', 'AR budget paused by administrator'
    );
  END IF;

  -- No cap → always allowed
  IF v_monthly_cap IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used_this_month', 0,
      'cap', NULL
    );
  END IF;

  -- Sum AR deductions this calendar month
  v_month_start := date_trunc('month', NOW());

  SELECT COALESCE(SUM(ABS(ct.amount)), 0)
  INTO v_used_this_month
  FROM credit_transactions ct
  WHERE ct.org_id = p_org_id
    AND ct.type = 'deduction'
    AND ct.feature_key LIKE 'ar_%'
    AND ct.created_at >= v_month_start;

  RETURN jsonb_build_object(
    'allowed', v_used_this_month < v_monthly_cap,
    'used_this_month', v_used_this_month,
    'cap', v_monthly_cap
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_ar_budget IS
  'Pre-flight check for autonomous-research agent runs. '
  'Returns { allowed, used_this_month, cap } in JSON. '
  'allowed=false means the org has hit its monthly AR credit cap.';

-- ============================================================================
-- 3. RLS extension: allow admins to update AR budget columns
-- ============================================================================
-- The existing "Org admins can update their org_credit_balance" policy already
-- covers UPDATE on org_credit_balance for admin/owner roles, so no new policy
-- is needed. The new columns are included automatically.
-- ============================================================================
