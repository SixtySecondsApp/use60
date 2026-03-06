-- ============================================================================
-- check_subscription_access RPC + grant RPC security hardening
-- ============================================================================
-- 1. Creates check_subscription_access(p_org_id UUID) for frontend feature gating
-- 2. REVOKEs grant/expire RPCs from authenticated (restrict to service_role only)

-- ============================================================================
-- RPC: check_subscription_access
-- ============================================================================
-- Returns subscription access state for a given org.
-- Frontend uses this to gate features and show appropriate banners/redirects.
--
-- Return columns:
--   has_access         BOOLEAN  — true for active, trialing, grace_period, past_due
--   can_use_ai         BOOLEAN  — true for active, trialing, past_due only
--   status             TEXT     — raw subscription status (or 'no_subscription')
--   action             TEXT     — 'none' | 'show_upgrade' | 'show_grace_banner' | 'redirect_expired'
--   trial_days_remaining  INT   — days left in trial (0 if not trialing or expired)
--   grace_days_remaining  INT   — days left in grace period (0 if not in grace period)

CREATE OR REPLACE FUNCTION check_subscription_access(
  p_org_id UUID
)
RETURNS TABLE (
  has_access            BOOLEAN,
  can_use_ai            BOOLEAN,
  status                TEXT,
  action                TEXT,
  trial_days_remaining  INTEGER,
  grace_days_remaining  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub            RECORD;
  v_status         TEXT;
  v_has_access     BOOLEAN;
  v_can_use_ai     BOOLEAN;
  v_action         TEXT;
  v_trial_days     INTEGER;
  v_grace_days     INTEGER;
BEGIN
  -- Caller must be authenticated or service_role
  IF auth.uid() IS NULL AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Authenticated users may only check their own org
  IF auth.uid() IS NOT NULL AND NOT public.is_service_role() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE org_id = p_org_id
        AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Fetch the subscription row
  SELECT
    os.status,
    os.trial_ends_at,
    os.grace_period_ends_at
  INTO v_sub
  FROM public.organization_subscriptions os
  WHERE os.org_id = p_org_id
  ORDER BY os.created_at DESC
  LIMIT 1;

  -- Handle no subscription
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      FALSE,
      'no_subscription'::TEXT,
      'show_upgrade'::TEXT,
      0::INTEGER,
      0::INTEGER;
    RETURN;
  END IF;

  v_status := v_sub.status;

  -- Compute trial_days_remaining
  IF v_status = 'trialing' AND v_sub.trial_ends_at IS NOT NULL THEN
    v_trial_days := GREATEST(0, EXTRACT(DAY FROM (v_sub.trial_ends_at - NOW()))::INTEGER);
  ELSE
    v_trial_days := 0;
  END IF;

  -- Compute grace_days_remaining
  IF v_status = 'grace_period' AND v_sub.grace_period_ends_at IS NOT NULL THEN
    v_grace_days := GREATEST(0, EXTRACT(DAY FROM (v_sub.grace_period_ends_at - NOW()))::INTEGER);
  ELSE
    v_grace_days := 0;
  END IF;

  -- Determine has_access: full access for active, trialing, grace_period, past_due
  v_has_access := v_status IN ('active', 'trialing', 'grace_period', 'past_due');

  -- Determine can_use_ai: AI features blocked during grace period
  v_can_use_ai := v_status IN ('active', 'trialing', 'past_due');

  -- Determine action
  CASE v_status
    WHEN 'active'       THEN v_action := 'none';
    WHEN 'trialing'     THEN v_action := 'none';
    WHEN 'past_due'     THEN v_action := 'none';
    WHEN 'grace_period' THEN v_action := 'show_grace_banner';
    WHEN 'expired'      THEN v_action := 'redirect_expired';
    WHEN 'canceled'     THEN v_action := 'redirect_expired';
    WHEN 'paused'       THEN v_action := 'show_upgrade';
    ELSE                     v_action := 'show_upgrade';
  END CASE;

  RETURN QUERY SELECT
    v_has_access,
    v_can_use_ai,
    v_status,
    v_action,
    v_trial_days,
    v_grace_days;
END;
$$;

GRANT EXECUTE ON FUNCTION check_subscription_access(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION check_subscription_access IS
  'Returns subscription access state for a given org. Used by frontend to gate features.
   has_access: true for active/trialing/grace_period/past_due.
   can_use_ai: true for active/trialing/past_due only (not grace_period).
   action: none | show_upgrade | show_grace_banner | redirect_expired.';

-- ============================================================================
-- Security hardening: restrict grant/expire RPCs to service_role only
-- ============================================================================
-- These functions mutate credit balances and must never be callable by
-- authenticated users directly. They are invoked only from edge functions
-- running with the service_role key.

REVOKE EXECUTE ON FUNCTION grant_subscription_credits(UUID, DECIMAL, TIMESTAMPTZ) FROM authenticated;
REVOKE EXECUTE ON FUNCTION grant_onboarding_credits(UUID, DECIMAL) FROM authenticated;
REVOKE EXECUTE ON FUNCTION expire_subscription_credits(UUID) FROM authenticated;

-- Ensure service_role retains access (idempotent)
GRANT EXECUTE ON FUNCTION grant_subscription_credits(UUID, DECIMAL, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION grant_onboarding_credits(UUID, DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION expire_subscription_credits(UUID) TO service_role;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'check_subscription_access migration complete:';
  RAISE NOTICE '  + check_subscription_access(UUID) RPC created';
  RAISE NOTICE '  + grant_subscription_credits: REVOKED from authenticated';
  RAISE NOTICE '  + grant_onboarding_credits: REVOKED from authenticated';
  RAISE NOTICE '  + expire_subscription_credits: REVOKED from authenticated';
END $$;
