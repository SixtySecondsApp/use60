-- ============================================================================
-- Credit System Patch — fixes identified in code review
-- ============================================================================
-- Patch 1: get_user_credit_logs — enforce auth.uid() = p_user_id in SECURITY
--           DEFINER function (previously callers could pass arbitrary user_ids)
-- Patch 2: check_budget_cap — treat elapsed period_reset_at as allowed=true
--           so capped orgs aren't blocked while cron reset is pending
-- Patch 3: reset_budget_periods — also reset rows with NULL period_reset_at
--           for non-unlimited cap types (fresh rows with no reset initialized)
-- ============================================================================

-- ============================================================================
-- Patch 1: Secure get_user_credit_logs
-- ============================================================================
-- Add auth.uid() = p_user_id check so SECURITY DEFINER cannot be abused
-- to fetch another user's credit logs by passing a different UUID.

CREATE OR REPLACE FUNCTION get_user_credit_logs(
  p_user_id UUID,
  p_days    INT DEFAULT 30
)
RETURNS SETOF credit_logs
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM credit_logs
  WHERE user_id = p_user_id
    -- Security: SECURITY DEFINER function — explicitly enforce caller can only
    -- fetch their own logs. If a caller passes a different UUID, this returns
    -- empty (not an error) — no information leakage.
    AND user_id = auth.uid()
    -- Non-admin callers cannot request more than 30 days of history.
    AND created_at > NOW() - (LEAST(p_days, 30) || ' days')::INTERVAL
  ORDER BY created_at DESC;
$$;

COMMENT ON FUNCTION get_user_credit_logs IS
  'User-scoped credit log retrieval. SECURITY DEFINER but enforces '
  'user_id = auth.uid() — callers cannot read other users'' logs. '
  'p_days is capped at 30 (RLS window for authenticated users).';

-- ============================================================================
-- Patch 2: check_budget_cap — handle elapsed period_reset_at
-- ============================================================================
-- If the cron job hasn't run yet but period_reset_at has elapsed, the org's
-- period has de-facto reset. Treat as allowed to prevent phantom blocks.

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

  -- Unlimited cap → always allowed
  IF v_cap_type = 'unlimited' THEN
    RETURN QUERY SELECT true, v_current_period_spent::DECIMAL, NULL::DECIMAL, 'unlimited'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- [PATCH 2] If the period has elapsed (cron not yet processed), treat as new period.
  -- The org is allowed — effectively spending 0 against a fresh window.
  IF v_period_reset_at IS NOT NULL AND v_period_reset_at <= NOW() THEN
    RETURN QUERY SELECT true, 0::DECIMAL, v_cap_amount::DECIMAL, v_cap_type, v_period_reset_at;
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
  'allowed=false means the org has reached its current-period cap. '
  'Treats elapsed period_reset_at as allowed=true (cron reset pending).';

-- ============================================================================
-- Patch 3: reset_budget_periods — handle NULL period_reset_at
-- ============================================================================
-- Orgs that set a daily/weekly cap but never had period_reset_at initialized
-- (e.g. new rows) will now get their first reset window assigned.

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
    -- [PATCH 3] Also reset rows with NULL period_reset_at for non-unlimited caps
    -- (freshly created rows that never had a period initialized).
    (cap_type = 'daily'  AND (period_reset_at IS NULL OR period_reset_at <= NOW()))
    OR
    (cap_type = 'weekly' AND (period_reset_at IS NULL OR period_reset_at <= NOW()));

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;
  RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reset_budget_periods IS
  'Resets current_period_spent to 0 for all orgs whose period_reset_at has elapsed '
  'or is NULL (uninitialized). Advances period_reset_at to the next window. '
  'Returns count of orgs reset. Should be called by a pg_cron job (e.g. every hour).';

-- ============================================================================
-- Patch 4: User-facing budget cap RPCs
-- ============================================================================
-- Org admins/owners can read and set their org's spending cap.
-- Using SECURITY DEFINER to validate role membership safely.

CREATE OR REPLACE FUNCTION get_budget_cap(p_org_id UUID)
RETURNS TABLE(
  cap_type             TEXT,
  cap_amount           DECIMAL,
  current_period_spent DECIMAL,
  period_reset_at      TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  -- Validate caller is a member of this org
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = p_org_id AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(cbc.cap_type, 'unlimited'::TEXT),
    cbc.cap_amount,
    COALESCE(cbc.current_period_spent, 0::DECIMAL(10,4)),
    cbc.period_reset_at
  FROM credit_budget_caps cbc
  WHERE cbc.org_id = p_org_id;
  -- Returns 0 rows if no cap configured (caller treats as unlimited)
END;
$$;

COMMENT ON FUNCTION get_budget_cap IS
  'Org members can read their org budget cap settings. '
  'Returns 0 rows if no cap is configured (treat as unlimited).';

CREATE OR REPLACE FUNCTION set_budget_cap(
  p_org_id      UUID,
  p_cap_type    TEXT,
  p_cap_amount  DECIMAL DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER VOLATILE AS $$
BEGIN
  -- Validate caller is an admin or owner of this org
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.org_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'Admin or owner role required to set budget cap';
  END IF;

  IF p_cap_type NOT IN ('daily', 'weekly', 'unlimited') THEN
    RAISE EXCEPTION 'cap_type must be daily, weekly, or unlimited';
  END IF;

  IF p_cap_type <> 'unlimited' AND (p_cap_amount IS NULL OR p_cap_amount <= 0) THEN
    RAISE EXCEPTION 'cap_amount must be > 0 for daily or weekly caps';
  END IF;

  INSERT INTO credit_budget_caps (
    org_id, cap_type, cap_amount, current_period_spent,
    period_reset_at, updated_at
  )
  VALUES (
    p_org_id,
    p_cap_type,
    CASE WHEN p_cap_type = 'unlimited' THEN NULL ELSE p_cap_amount END,
    0,
    CASE
      WHEN p_cap_type = 'daily'  THEN NOW() + INTERVAL '1 day'
      WHEN p_cap_type = 'weekly' THEN date_trunc('week', NOW()) + INTERVAL '1 week'
      ELSE NULL
    END,
    NOW()
  )
  ON CONFLICT (org_id) DO UPDATE
    SET cap_type             = EXCLUDED.cap_type,
        cap_amount           = EXCLUDED.cap_amount,
        current_period_spent = 0,  -- Reset spend counter on cap change
        period_reset_at      = EXCLUDED.period_reset_at,
        updated_at           = NOW();
END;
$$;

COMMENT ON FUNCTION set_budget_cap IS
  'Org admins/owners can upsert their org budget cap. '
  'Resets current_period_spent to 0 on any cap change. '
  'Validates caller role via organization_memberships.';
