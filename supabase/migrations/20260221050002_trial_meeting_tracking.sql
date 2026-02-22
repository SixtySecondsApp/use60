-- ============================================================================
-- Trial Meeting Tracking RPC
-- ============================================================================
-- Atomically increments trial_meetings_used and marks trial as expired
-- when the meeting limit is reached.

CREATE OR REPLACE FUNCTION increment_trial_meeting(p_org_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT status, trial_meetings_used, trial_meetings_limit
  INTO v_row
  FROM organization_subscriptions
  WHERE org_id = p_org_id AND status = 'trialing'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('trial', false);
  END IF;

  -- Increment
  UPDATE organization_subscriptions
  SET trial_meetings_used = trial_meetings_used + 1
  WHERE org_id = p_org_id AND status = 'trialing';

  -- Check if limit reached
  IF v_row.trial_meetings_used + 1 >= v_row.trial_meetings_limit THEN
    -- Mark trial as expired
    UPDATE organization_subscriptions
    SET status = 'expired'
    WHERE org_id = p_org_id AND status = 'trialing';

    RETURN jsonb_build_object(
      'trial', true,
      'expired', true,
      'meetings_used', v_row.trial_meetings_used + 1,
      'meetings_limit', v_row.trial_meetings_limit
    );
  END IF;

  RETURN jsonb_build_object(
    'trial', true,
    'expired', false,
    'meetings_used', v_row.trial_meetings_used + 1,
    'meetings_limit', v_row.trial_meetings_limit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION increment_trial_meeting(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION increment_trial_meeting IS
  'Atomically increments trial meeting usage. Returns trial status and whether the trial just expired.';
