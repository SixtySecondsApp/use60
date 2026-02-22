-- ============================================================================
-- Migration: Action Trust Scores
-- Purpose: Per-user, per-action-type confidence gates for progressive autonomy.
--          Tracks approval / rejection history so the trust scorer can
--          dynamically tighten or relax the auto-execution threshold over time.
-- Story: CC11-001
-- Date: 2026-02-22
-- ============================================================================
--
-- Drift rules (enforced in application layer — trustScorer.ts):
--   RAISE threshold by 0.05 after any rejection (up to starting_threshold)
--   LOWER threshold by 0.01 after every 5 consecutive approvals (floor = per-type minimum)
--   Thresholds never drop below the action-type floor
--   Every threshold change is appended to threshold_history JSONB array:
--     { changed_at, old_value, new_value, reason }
-- ============================================================================

-- =============================================================================
-- TABLE: action_trust_scores
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.action_trust_scores (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type             TEXT        NOT NULL,

  -- Current gate threshold (0.00–1.00). Actions with confidence >= this value
  -- can be auto-executed without HITL. Adjusted by drift logic.
  auto_threshold          NUMERIC(3,2) NOT NULL DEFAULT 0.95,

  -- Lifetime counters
  total_presented         INTEGER     NOT NULL DEFAULT 0,
  approved_without_edit   INTEGER     NOT NULL DEFAULT 0,
  approved_with_edit      INTEGER     NOT NULL DEFAULT 0,
  rejected                INTEGER     NOT NULL DEFAULT 0,

  -- Streak tracker — resets to 0 on any rejection
  consecutive_approvals   INTEGER     NOT NULL DEFAULT 0,

  -- Timestamps
  last_rejection_at       TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Audit trail of every threshold change:
  -- [{ "changed_at": "<iso>", "old_value": 0.95, "new_value": 0.90, "reason": "rejection" }, ...]
  threshold_history       JSONB       NOT NULL DEFAULT '[]'::jsonb,

  UNIQUE (user_id, action_type)
);

COMMENT ON TABLE public.action_trust_scores IS
  'Per-user, per-action-type confidence gates for progressive autonomy. '
  'Tracks HITL approval/rejection history so trustScorer.ts can dynamically '
  'adjust auto_threshold within the bounds defined for each action_type. '
  'Drift rules: raise threshold +0.05 on rejection (cap = starting_threshold); '
  'lower threshold -0.01 every 5 consecutive approvals (floor = per-type minimum). '
  'Every change is appended to threshold_history for auditability.';

COMMENT ON COLUMN public.action_trust_scores.auto_threshold IS
  'Current gate: actions with agent confidence >= this value are auto-executed. '
  'Ranges 0.00–1.00; adjusted by drift logic in trustScorer.ts.';
COMMENT ON COLUMN public.action_trust_scores.total_presented IS
  'Total number of times an action of this type was presented to the user for review.';
COMMENT ON COLUMN public.action_trust_scores.approved_without_edit IS
  'Count of approvals where the user accepted the drafted action with no changes.';
COMMENT ON COLUMN public.action_trust_scores.approved_with_edit IS
  'Count of approvals where the user modified the drafted action before accepting.';
COMMENT ON COLUMN public.action_trust_scores.rejected IS
  'Count of outright rejections (user dismissed or said no). Triggers threshold raise.';
COMMENT ON COLUMN public.action_trust_scores.consecutive_approvals IS
  'Running streak of approvals since the last rejection. Used to trigger threshold lowering.';
COMMENT ON COLUMN public.action_trust_scores.last_rejection_at IS
  'Timestamp of the most recent rejection. Used for cooling-off period calculations.';
COMMENT ON COLUMN public.action_trust_scores.threshold_history IS
  'Ordered array of threshold change events: [{changed_at, old_value, new_value, reason}]. '
  'Reason is one of: "rejection", "consecutive_approvals", "manual_reset", "seed".';

-- =============================================================================
-- Trigger: updated_at maintenance
-- =============================================================================

CREATE OR REPLACE FUNCTION update_action_trust_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_action_trust_scores_updated_at ON public.action_trust_scores;
CREATE TRIGGER trg_action_trust_scores_updated_at
  BEFORE UPDATE ON public.action_trust_scores
  FOR EACH ROW EXECUTE FUNCTION update_action_trust_scores_updated_at();

-- =============================================================================
-- RLS: action_trust_scores
-- =============================================================================

ALTER TABLE public.action_trust_scores ENABLE ROW LEVEL SECURITY;

-- Users can view their own trust score rows
DROP POLICY IF EXISTS "Users can view own trust scores" ON public.action_trust_scores;
CREATE POLICY "Users can view own trust scores"
  ON public.action_trust_scores FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own trust score rows (threshold edits from UI)
DROP POLICY IF EXISTS "Users can update own trust scores" ON public.action_trust_scores;
CREATE POLICY "Users can update own trust scores"
  ON public.action_trust_scores FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can insert their own rows (edge function may call on first encounter)
DROP POLICY IF EXISTS "Users can insert own trust scores" ON public.action_trust_scores;
CREATE POLICY "Users can insert own trust scores"
  ON public.action_trust_scores FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Service role full access for edge functions / trust scorer
DROP POLICY IF EXISTS "Service role full access" ON public.action_trust_scores;
CREATE POLICY "Service role full access"
  ON public.action_trust_scores FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Seed: default thresholds per action_type
-- Rows are seeded per-user on first encounter by the application. These
-- constants are used by get_trust_threshold() as fallback defaults when no
-- row exists for a given user/action_type pair.
--
-- starting_threshold | floor
-- crm_field_update      0.90 | 0.70
-- task_creation         0.90 | 0.75
-- meeting_scheduling    0.95 | 0.85
-- follow_up_email       0.95 | 0.85
-- reengagement_outreach 0.98 | 0.90
-- proposal_send         0.98 | 0.90
-- =============================================================================

-- Stored as a reference table so get_trust_threshold() can return defaults
-- without requiring a pre-existing row for each user.
CREATE TABLE IF NOT EXISTS public.action_trust_score_defaults (
  action_type         TEXT        PRIMARY KEY,
  starting_threshold  NUMERIC(3,2) NOT NULL,
  floor_threshold     NUMERIC(3,2) NOT NULL,
  description         TEXT
);

COMMENT ON TABLE public.action_trust_score_defaults IS
  'Static per-action-type threshold defaults used as seed values and fallback '
  'by get_trust_threshold(). Rows in action_trust_scores start from starting_threshold '
  'and must never drop below floor_threshold during drift.';

INSERT INTO public.action_trust_score_defaults
  (action_type, starting_threshold, floor_threshold, description)
VALUES
  ('crm_field_update',      0.90, 0.70, 'Updating a CRM field value autonomously'),
  ('task_creation',         0.90, 0.75, 'Creating a new task on behalf of the user'),
  ('meeting_scheduling',    0.95, 0.85, 'Booking or rescheduling a calendar event'),
  ('follow_up_email',       0.95, 0.85, 'Sending a follow-up email to a contact'),
  ('reengagement_outreach', 0.98, 0.90, 'Initiating re-engagement sequence for a cold deal'),
  ('proposal_send',         0.98, 0.90, 'Sending a proposal or quote document')
ON CONFLICT (action_type) DO UPDATE
  SET starting_threshold = EXCLUDED.starting_threshold,
      floor_threshold     = EXCLUDED.floor_threshold,
      description         = EXCLUDED.description;

-- =============================================================================
-- RPC: get_trust_threshold
-- Returns the current auto_threshold for a user+action_type pair,
-- or the starting_threshold default if no personalised row exists yet.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_trust_threshold(
  p_user_id    UUID,
  p_action_type TEXT
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Personalised threshold for this user
    (
      SELECT ats.auto_threshold
      FROM   public.action_trust_scores ats
      WHERE  ats.user_id    = p_user_id
        AND  ats.action_type = p_action_type
    ),
    -- Fall back to the action-type default
    (
      SELECT atd.starting_threshold
      FROM   public.action_trust_score_defaults atd
      WHERE  atd.action_type = p_action_type
    ),
    -- Ultimate fallback if action_type is unknown
    0.95::NUMERIC
  );
$$;

COMMENT ON FUNCTION public.get_trust_threshold(UUID, TEXT) IS
  'Returns the current auto-execution threshold for a given user and action type. '
  'Checks action_trust_scores for a personalised row first; falls back to '
  'action_trust_score_defaults.starting_threshold; ultimate fallback is 0.95.';

-- =============================================================================
-- Migration summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222700004_action_trust_scores.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: CC11-001';
  RAISE NOTICE '';
  RAISE NOTICE 'New tables:';
  RAISE NOTICE '  action_trust_scores         — per-user/action-type confidence gates';
  RAISE NOTICE '  action_trust_score_defaults — static per-type starting thresholds + floors';
  RAISE NOTICE '';
  RAISE NOTICE 'Default rows seeded into action_trust_score_defaults:';
  RAISE NOTICE '  crm_field_update      (0.90 / floor 0.70)';
  RAISE NOTICE '  task_creation         (0.90 / floor 0.75)';
  RAISE NOTICE '  meeting_scheduling    (0.95 / floor 0.85)';
  RAISE NOTICE '  follow_up_email       (0.95 / floor 0.85)';
  RAISE NOTICE '  reengagement_outreach (0.98 / floor 0.90)';
  RAISE NOTICE '  proposal_send         (0.98 / floor 0.90)';
  RAISE NOTICE '';
  RAISE NOTICE 'Trigger:';
  RAISE NOTICE '  trg_action_trust_scores_updated_at — auto-updates updated_at on row change';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS:';
  RAISE NOTICE '  SELECT / UPDATE / INSERT for authenticated (own rows only)';
  RAISE NOTICE '  ALL for service_role';
  RAISE NOTICE '';
  RAISE NOTICE 'RPC:';
  RAISE NOTICE '  get_trust_threshold(p_user_id, p_action_type) → NUMERIC';
  RAISE NOTICE '    Returns personalised threshold or default fallback (0.95 ultimate)';
  RAISE NOTICE '============================================================================';
END $$;
