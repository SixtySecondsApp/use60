-- ============================================================================
-- ADMIN-002: Platform Admin Trial Extension + Credit Grant RPCs
-- ============================================================================
-- Two new RPCs gated by is_platform_admin():
--   1. admin_extend_trial(p_org_id, p_days) — extends trial_ends_at or
--      grace_period_ends_at by N days
--   2. admin_grant_credits(p_org_id, p_amount, p_reason) — adds credits to
--      org_credit_balance with type='admin_grant' transaction record
-- ============================================================================

-- ============================================================================
-- RPC 1: admin_extend_trial
-- ============================================================================
-- Extends the trial or grace period for an org by p_days days.
-- - If subscription is in grace_period status: extends grace_period_ends_at
-- - Otherwise: extends trial_ends_at (adds to existing date or from now)
-- Security: platform admin only
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_extend_trial(
  p_org_id UUID,
  p_days   INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_sub       RECORD;
  v_new_date  TIMESTAMPTZ;
  v_field     TEXT;
BEGIN
  -- Platform admin gate
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: platform admin access required'
      USING ERRCODE = '42501';
  END IF;

  -- Validate days
  IF p_days <= 0 OR p_days > 365 THEN
    RAISE EXCEPTION 'p_days must be between 1 and 365, got %', p_days;
  END IF;

  -- Fetch subscription for this org
  SELECT id, status, trial_ends_at, grace_period_ends_at
    INTO v_sub
    FROM organization_subscriptions
   WHERE org_id = p_org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No subscription found for org %', p_org_id;
  END IF;

  -- Decide which date to extend
  IF v_sub.status = 'grace_period' THEN
    -- Extend grace period
    v_field    := 'grace_period_ends_at';
    v_new_date := COALESCE(v_sub.grace_period_ends_at, NOW()) + (p_days || ' days')::INTERVAL;

    UPDATE organization_subscriptions
       SET grace_period_ends_at = v_new_date,
           updated_at           = NOW()
     WHERE id = v_sub.id;
  ELSE
    -- Extend trial
    v_field    := 'trial_ends_at';
    v_new_date := COALESCE(v_sub.trial_ends_at, NOW()) + (p_days || ' days')::INTERVAL;

    UPDATE organization_subscriptions
       SET trial_ends_at = v_new_date,
           updated_at    = NOW()
     WHERE id = v_sub.id;
  END IF;

  RETURN jsonb_build_object(
    'success',    true,
    'field',      v_field,
    'new_date',   v_new_date,
    'days_added', p_days
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_extend_trial(UUID, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION admin_extend_trial IS
  'Platform admin only: extend trial_ends_at (or grace_period_ends_at when in grace_period) '
  'by p_days days. Returns JSON with field updated, new date, and days added.';


-- ============================================================================
-- RPC 2: admin_grant_credits
-- ============================================================================
-- Grants p_amount credits to an org with type='admin_grant'.
-- Uses the existing add_credits SECURITY DEFINER function internally.
-- Security: platform admin only
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_grant_credits(
  p_org_id UUID,
  p_amount DECIMAL,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_new_balance DECIMAL;
BEGIN
  -- Platform admin gate
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: platform admin access required'
      USING ERRCODE = '42501';
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive, got %', p_amount;
  END IF;

  -- Grant credits via the canonical add_credits function
  -- type='admin_grant', description carries the reason
  SELECT add_credits(
    p_org_id,
    p_amount,
    'admin_grant',
    COALESCE(p_reason, 'Admin credit grant'),
    NULL,        -- stripe_session_id
    auth.uid()   -- created_by
  ) INTO v_new_balance;

  RETURN jsonb_build_object(
    'success',     true,
    'amount',      p_amount,
    'new_balance', v_new_balance,
    'reason',      COALESCE(p_reason, 'Admin credit grant')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION admin_grant_credits(UUID, DECIMAL, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION admin_grant_credits IS
  'Platform admin only: grant p_amount credits to an org with type=''admin_grant''. '
  'Uses add_credits internally to maintain the ledger. Returns JSON with new balance.';
