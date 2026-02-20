-- Setup Wizard Progress: tracks per-user, per-org wizard completion & credit awards
CREATE TABLE IF NOT EXISTS setup_wizard_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Step completion
  step_calendar BOOLEAN NOT NULL DEFAULT false,
  step_calendar_at TIMESTAMPTZ,
  step_notetaker BOOLEAN NOT NULL DEFAULT false,
  step_notetaker_at TIMESTAMPTZ,
  step_crm BOOLEAN NOT NULL DEFAULT false,
  step_crm_at TIMESTAMPTZ,
  step_followups BOOLEAN NOT NULL DEFAULT false,
  step_followups_at TIMESTAMPTZ,
  step_test BOOLEAN NOT NULL DEFAULT false,
  step_test_at TIMESTAMPTZ,

  -- Credit tracking (prevent double-award)
  credits_calendar BOOLEAN NOT NULL DEFAULT false,
  credits_notetaker BOOLEAN NOT NULL DEFAULT false,
  credits_crm BOOLEAN NOT NULL DEFAULT false,
  credits_followups BOOLEAN NOT NULL DEFAULT false,
  credits_test BOOLEAN NOT NULL DEFAULT false,

  -- Wizard state
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  all_completed BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_setup_wizard_user_org
  ON setup_wizard_progress(user_id, org_id);

ALTER TABLE setup_wizard_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own setup wizard progress"
  ON setup_wizard_progress FOR ALL
  USING (user_id = auth.uid());

-- RPC: Complete a setup wizard step, award credits idempotently
CREATE OR REPLACE FUNCTION complete_setup_wizard_step(
  p_user_id UUID,
  p_org_id UUID,
  p_step TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row setup_wizard_progress%ROWTYPE;
  v_credits_awarded BOOLEAN := false;
  v_credits_amount INTEGER := 60;
  v_all_done BOOLEAN;
  v_step_col TEXT;
  v_step_at_col TEXT;
  v_credits_col TEXT;
BEGIN
  -- Validate step name
  IF p_step NOT IN ('calendar', 'notetaker', 'crm', 'followups', 'test') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid step: ' || p_step);
  END IF;

  v_step_col := 'step_' || p_step;
  v_step_at_col := 'step_' || p_step || '_at';
  v_credits_col := 'credits_' || p_step;

  -- Upsert the progress row
  INSERT INTO setup_wizard_progress (user_id, org_id)
  VALUES (p_user_id, p_org_id)
  ON CONFLICT (user_id, org_id) DO NOTHING;

  -- Lock the row for update
  SELECT * INTO v_row
  FROM setup_wizard_progress
  WHERE user_id = p_user_id AND org_id = p_org_id
  FOR UPDATE;

  -- Mark step completed (idempotent)
  EXECUTE format(
    'UPDATE setup_wizard_progress SET %I = true, %I = COALESCE(%I, NOW()), updated_at = NOW() WHERE id = $1',
    v_step_col, v_step_at_col, v_step_at_col
  ) USING v_row.id;

  -- Award credits if not already awarded for this step
  EXECUTE format(
    'SELECT %I FROM setup_wizard_progress WHERE id = $1',
    v_credits_col
  ) INTO v_credits_awarded USING v_row.id;

  IF NOT v_credits_awarded THEN
    -- Award credits via existing add_credits function
    PERFORM add_credits(
      p_org_id,
      v_credits_amount::DECIMAL,
      'bonus',
      'Setup wizard: ' || p_step || ' step completed',
      NULL,
      p_user_id
    );

    -- Mark credits as awarded
    EXECUTE format(
      'UPDATE setup_wizard_progress SET %I = true, updated_at = NOW() WHERE id = $1',
      v_credits_col
    ) USING v_row.id;

    v_credits_awarded := true;
  ELSE
    v_credits_awarded := false;
  END IF;

  -- Check if all 5 steps are done
  SELECT (step_calendar AND step_notetaker AND step_crm AND step_followups AND step_test)
  INTO v_all_done
  FROM setup_wizard_progress
  WHERE id = v_row.id;

  IF v_all_done THEN
    UPDATE setup_wizard_progress
    SET all_completed = true, updated_at = NOW()
    WHERE id = v_row.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'credits_awarded', v_credits_awarded,
    'credits_amount', CASE WHEN v_credits_awarded THEN v_credits_amount ELSE 0 END,
    'all_completed', COALESCE(v_all_done, false)
  );
END;
$$;
