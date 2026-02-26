-- ============================================================================
-- AP-002: Autopilot Confidence Table
-- Autopilot Engine — per-user, per-action-type confidence scoring
--
-- Tracks composite confidence scores (0.0–1.0) and raw approval/rejection/
-- undo signal counts for each (user, action_type) pair. Used by the
-- Autopilot Engine to determine tier placement (approve / auto / notify)
-- and to gate promotion eligibility.
--
-- Companion to: AP-001 (autopilot_signals), AP-003 (autopilot_events + autopilot_thresholds)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.autopilot_confidence (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                 UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Action identity
  action_type             TEXT          NOT NULL,

  -- Composite confidence score (0.0 – 1.0)
  score                   NUMERIC(4,3)  NOT NULL DEFAULT 0,

  -- Rate breakdowns (0.0 – 1.0, NULL until enough signals exist)
  approval_rate           NUMERIC(4,3),
  clean_approval_rate     NUMERIC(4,3),   -- approved without edit / total, excludes rubber-stamps
  edit_rate               NUMERIC(4,3),
  rejection_rate          NUMERIC(4,3),
  undo_rate               NUMERIC(4,3),

  -- Raw signal counters
  total_signals           INTEGER       NOT NULL DEFAULT 0,
  total_approved          INTEGER       NOT NULL DEFAULT 0,
  total_rejected          INTEGER       NOT NULL DEFAULT 0,
  total_undone            INTEGER       NOT NULL DEFAULT 0,

  -- Rolling 30-day window
  last_30_score           NUMERIC(4,3),
  last_30_signals         JSONB         NOT NULL DEFAULT '[]',

  -- Latency
  avg_response_time_ms    INTEGER,

  -- Temporal bookmarks
  first_signal_at         TIMESTAMPTZ,
  last_signal_at          TIMESTAMPTZ,
  days_active             INTEGER       NOT NULL DEFAULT 0,

  -- Tier management
  current_tier            TEXT          NOT NULL DEFAULT 'approve',
  promotion_eligible      BOOLEAN       NOT NULL DEFAULT FALSE,
  cooldown_until          TIMESTAMPTZ,
  never_promote           BOOLEAN       NOT NULL DEFAULT FALSE,
  extra_required_signals  INTEGER       NOT NULL DEFAULT 0,   -- boost applied after demotion

  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_autopilot_confidence_user_action UNIQUE (user_id, action_type)
);

COMMENT ON TABLE public.autopilot_confidence IS
  'Per-user, per-action-type confidence scores for the Autopilot Engine (AP-002). '
  'Composite score (0.0–1.0) drives tier placement and promotion eligibility. '
  'Refreshed incrementally as signals arrive from autopilot_executions.';

COMMENT ON COLUMN public.autopilot_confidence.score IS
  'Composite confidence score 0.0–1.0 blending approval_rate, clean_approval_rate, '
  'recency weighting, and penalty factors (undo_rate, edit_rate).';

COMMENT ON COLUMN public.autopilot_confidence.clean_approval_rate IS
  'Fraction of actions approved WITHOUT subsequent edit, excluding rubber-stamp '
  'approvals (approved faster than the minimum deliberation threshold). '
  'A more honest measure of genuine user confidence than raw approval_rate.';

COMMENT ON COLUMN public.autopilot_confidence.last_30_signals IS
  'Ordered JSONB array of the most recent 30-day signal events used for rolling '
  'score recalculation. Each element: {ts, outcome, response_ms}.';

COMMENT ON COLUMN public.autopilot_confidence.current_tier IS
  'Active autopilot tier for this (user, action_type): ''disabled'', ''suggest'', ''approve'', or ''auto''.';

COMMENT ON COLUMN public.autopilot_confidence.promotion_eligible IS
  'TRUE when score and signal count criteria are met and the user can be promoted '
  'to the next tier. Evaluated by the promotion-queue job.';

COMMENT ON COLUMN public.autopilot_confidence.extra_required_signals IS
  'Additional signals required before the next promotion evaluation — applied as '
  'a demotion penalty to slow re-promotion after a confidence drop.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_confidence_user
  ON public.autopilot_confidence (user_id);

CREATE INDEX IF NOT EXISTS idx_confidence_org
  ON public.autopilot_confidence (org_id);

-- Partial index: only rows ready for promotion evaluation
CREATE INDEX IF NOT EXISTS idx_confidence_eligible
  ON public.autopilot_confidence (org_id, promotion_eligible)
  WHERE promotion_eligible = TRUE;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.autopilot_confidence ENABLE ROW LEVEL SECURITY;

-- Users read their own confidence rows
DO $$ BEGIN
  CREATE POLICY "autopilot_confidence_user_select"
  ON public.autopilot_confidence FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins / owners read all rows for their org
DO $$ BEGIN
  CREATE POLICY "autopilot_confidence_admin_select"
  ON public.autopilot_confidence FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_confidence.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role: full access (edge functions use service-role client for writes)
DO $$ BEGIN
  CREATE POLICY "autopilot_confidence_service_all"
  ON public.autopilot_confidence FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.autopilot_confidence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_confidence TO service_role;

-- ---------------------------------------------------------------------------
-- 5. updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_autopilot_confidence_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS autopilot_confidence_updated_at ON public.autopilot_confidence;
CREATE TRIGGER autopilot_confidence_updated_at
  BEFORE UPDATE ON public.autopilot_confidence
  FOR EACH ROW EXECUTE FUNCTION public.update_autopilot_confidence_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260226100002_autopilot_confidence.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'AP-002: autopilot_confidence table';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - autopilot_confidence table (per-user, per-action-type scoring)';
  RAISE NOTICE '  - UNIQUE constraint on (user_id, action_type)';
  RAISE NOTICE '  - Indexes: idx_confidence_user, idx_confidence_org,';
  RAISE NOTICE '             idx_confidence_eligible (partial, promotion_eligible=TRUE)';
  RAISE NOTICE '  - RLS: user self-read, org admin read, service_role full access';
  RAISE NOTICE '  - updated_at trigger: update_autopilot_confidence_updated_at()';
  RAISE NOTICE '';
  RAISE NOTICE 'Columns tracked:';
  RAISE NOTICE '  score, approval_rate, clean_approval_rate, edit_rate,';
  RAISE NOTICE '  rejection_rate, undo_rate, total_signals, total_approved,';
  RAISE NOTICE '  total_rejected, total_undone, last_30_score, last_30_signals,';
  RAISE NOTICE '  avg_response_time_ms, first_signal_at, last_signal_at,';
  RAISE NOTICE '  days_active, current_tier, promotion_eligible, cooldown_until,';
  RAISE NOTICE '  never_promote, extra_required_signals';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
