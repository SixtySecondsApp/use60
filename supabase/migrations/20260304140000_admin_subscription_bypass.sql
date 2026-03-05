-- ============================================================================
-- Admin Subscription Bypass
-- ============================================================================
-- If the org owner is an internal admin (email in internal_users + profiles.is_admin),
-- grant full access without requiring a subscription.

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
  v_owner_is_internal_admin BOOLEAN;
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

  -- Check if the org owner is an internal admin user
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships om
    JOIN public.profiles p ON p.id = om.user_id
    JOIN public.internal_users iu ON lower(iu.email) = lower(p.email) AND iu.is_active = true
    WHERE om.org_id = p_org_id
      AND om.role = 'owner'
      AND p.is_admin = true
  ) INTO v_owner_is_internal_admin;

  -- Internal admin orgs get full access with no subscription required
  IF v_owner_is_internal_admin THEN
    RETURN QUERY SELECT
      TRUE,
      TRUE,
      'internal_admin'::TEXT,
      'none'::TEXT,
      0::INTEGER,
      0::INTEGER;
    RETURN;
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

-- Ensure grants still in place
GRANT EXECUTE ON FUNCTION check_subscription_access(UUID) TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'admin_subscription_bypass migration complete:';
  RAISE NOTICE '  + check_subscription_access now bypasses for internal admin org owners';
END $$;
