-- Migration: reset_setup_wizard_progress
-- Date: 20260311143259
--
-- What this migration does:
--   1. Creates an RPC to reset a user's setup wizard progress (for re-testing / re-doing the wizard)
--   2. Does NOT refund credits already awarded (credits stay, preventing double-earn)
--
-- Rollback strategy:
--   DROP FUNCTION IF EXISTS reset_setup_wizard_progress(UUID, UUID);

CREATE OR REPLACE FUNCTION reset_setup_wizard_progress(
  p_user_id UUID,
  p_org_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow the user to reset their own progress
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Reset all step completions but keep credit tracking (prevent re-earning)
  UPDATE setup_wizard_progress
  SET
    step_calendar = false,
    step_calendar_at = NULL,
    step_notetaker = false,
    step_notetaker_at = NULL,
    step_crm = false,
    step_crm_at = NULL,
    step_followups = false,
    step_followups_at = NULL,
    step_test = false,
    step_test_at = NULL,
    all_completed = false,
    is_dismissed = false,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND org_id = p_org_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
