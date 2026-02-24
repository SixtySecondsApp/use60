-- RPC Function: initialize_v2_onboarding
-- Creates user_onboarding_progress record with V2 starting step
-- SECURITY DEFINER allows it to bypass RLS

CREATE OR REPLACE FUNCTION "public"."initialize_v2_onboarding"(
  p_user_id uuid,
  p_email text
)
RETURNS TABLE (
  success boolean,
  message text,
  onboarding_step text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_domain text;
  v_initial_step text;
  v_personal_domains text[] := ARRAY[
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'icloud.com', 'aol.com', 'protonmail.com', 'proton.me',
    'mail.com', 'ymail.com', 'live.com', 'msn.com', 'me.com', 'mac.com'
  ];
BEGIN
  -- Extract domain from email
  v_domain := LOWER(SPLIT_PART(p_email, '@', 2));

  -- Determine initial step based on email domain
  IF v_domain = ANY(v_personal_domains) THEN
    v_initial_step := 'website_input';
  ELSE
    v_initial_step := 'enrichment_loading';
  END IF;

  -- Upsert onboarding progress record
  INSERT INTO user_onboarding_progress (
    user_id,
    onboarding_step,
    onboarding_completed_at,
    skipped_onboarding
  )
  VALUES (
    p_user_id,
    v_initial_step,
    NULL,
    FALSE
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    onboarding_step = v_initial_step,
    onboarding_completed_at = NULL,
    skipped_onboarding = FALSE;

  RETURN QUERY SELECT
    true,
    'Onboarding progress initialized',
    v_initial_step;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION "public"."initialize_v2_onboarding"(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."initialize_v2_onboarding"(uuid, text) TO service_role;
