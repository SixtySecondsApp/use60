-- ============================================================================
-- AP-033: Autopilot Confidence — Rubber-Stamp Counter Columns + RPC
--
-- Adds two columns to `autopilot_confidence` that surface the aggregate
-- rubber-stamp rate per (user_id, action_type) pair, and creates a
-- race-condition-safe RPC for incrementing the counter from the edge function.
--
-- rubber_stamp_count: running total of signals flagged as rubber stamps.
--                     Incremented in real-time by the edge function
--                     (autopilot-record-signal) whenever a new rubber-stamp
--                     signal is detected, so the count stays current between
--                     DB trigger recalculations.
--
-- rubber_stamp_rate:  rubber_stamp_count / total_signals.
--                     Recomputed by the DB confidence trigger
--                     (refresh_autopilot_confidence) on every new signal,
--                     which already recalculates total_signals.
--
-- The edge function calls increment_rubber_stamp_count() (an RPC backed by
-- a SQL function) rather than a raw UPDATE to avoid lost-update race
-- conditions when two signals arrive in rapid succession.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Add columns to autopilot_confidence (idempotent)
-- ---------------------------------------------------------------------------

ALTER TABLE public.autopilot_confidence
  ADD COLUMN IF NOT EXISTS rubber_stamp_count INTEGER     DEFAULT 0      NOT NULL,
  ADD COLUMN IF NOT EXISTS rubber_stamp_rate  NUMERIC(4,3) DEFAULT 0.000 NOT NULL;

COMMENT ON COLUMN public.autopilot_confidence.rubber_stamp_count IS
  'AP-033: Running count of approval signals flagged as rubber stamps '
  '(time_to_respond_ms below the action-type-specific threshold). '
  'Incremented by the increment_rubber_stamp_count() RPC; reset to 0 on '
  'first row creation.';

COMMENT ON COLUMN public.autopilot_confidence.rubber_stamp_rate IS
  'AP-033: rubber_stamp_count / total_signals. Recomputed by the '
  'refresh_autopilot_confidence trigger on every signal insert.';


-- ---------------------------------------------------------------------------
-- 2. RPC: increment_rubber_stamp_count(p_user_id, p_action_type)
--
-- Atomically increments rubber_stamp_count for the given (user_id,
-- action_type) row.  Uses a SQL-language function (single statement) so the
-- entire operation is handled in one server round-trip and is safe under
-- concurrent updates.
--
-- If no row exists yet (the confidence trigger fires synchronously in the
-- same transaction, but only AFTER the INSERT, so in theory the row should
-- always exist by the time this RPC is called), the UPDATE is a no-op.
-- The edge function is fire-and-forget so a missed increment on a race is
-- acceptable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_rubber_stamp_count(
  p_user_id    UUID,
  p_action_type TEXT
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.autopilot_confidence
  SET rubber_stamp_count = COALESCE(rubber_stamp_count, 0) + 1
  WHERE user_id     = p_user_id
    AND action_type = p_action_type;
$$;

COMMENT ON FUNCTION public.increment_rubber_stamp_count(UUID, TEXT) IS
  'AP-033: Atomically increments rubber_stamp_count on autopilot_confidence '
  'for the given (user_id, action_type) pair. Called by the '
  'autopilot-record-signal edge function whenever a rubber-stamp approval '
  'is detected. SECURITY DEFINER so the edge function service-role client '
  'can call it without needing direct UPDATE access.';


-- ---------------------------------------------------------------------------
-- 3. Update refresh_autopilot_confidence trigger to maintain rubber_stamp_rate
--
-- The trigger already recomputes total_signals; we add rubber_stamp_count
-- recalculation in the same pass and derive rubber_stamp_rate from it.
-- This keeps the rate column accurate even if rubber_stamp_count drifts
-- (e.g. after a backfill or manual data correction).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_autopilot_confidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- -------------------------------------------------------------------------
  -- Raw signal counters (last 90 days)
  -- -------------------------------------------------------------------------
  v_total_signals         INTEGER;
  v_total_approved        INTEGER;
  v_total_rejected        INTEGER;
  v_total_undone          INTEGER;

  -- -------------------------------------------------------------------------
  -- Rate columns (NUMERIC(4,3) — matches table definition)
  -- -------------------------------------------------------------------------
  v_approval_rate         NUMERIC(4,3);
  v_clean_approval_count  INTEGER;
  v_clean_approval_rate   NUMERIC(4,3);
  v_approved_edited_count INTEGER;
  v_edit_rate             NUMERIC(4,3);
  v_rejection_rate        NUMERIC(4,3);
  v_undo_rate             NUMERIC(4,3);

  -- -------------------------------------------------------------------------
  -- AP-033: Rubber-stamp counters
  -- -------------------------------------------------------------------------
  v_rubber_stamp_count    INTEGER;
  v_rubber_stamp_rate     NUMERIC(4,3);

  -- -------------------------------------------------------------------------
  -- Temporal bookmarks
  -- -------------------------------------------------------------------------
  v_avg_response_time_ms  INTEGER;
  v_first_signal_at       TIMESTAMPTZ;
  v_last_signal_at        TIMESTAMPTZ;
  v_days_active           INTEGER;

  -- -------------------------------------------------------------------------
  -- Time-decayed confidence score (full window)
  -- -------------------------------------------------------------------------
  v_weighted_sum          DOUBLE PRECISION := 0.0;
  v_weight_total          DOUBLE PRECISION := 0.0;
  v_raw_score             DOUBLE PRECISION;
  v_sample_factor         DOUBLE PRECISION;
  v_score                 NUMERIC(4,3);

  -- -------------------------------------------------------------------------
  -- Last-30 window
  -- -------------------------------------------------------------------------
  v_last_30_weighted_sum  DOUBLE PRECISION := 0.0;
  v_last_30_weight_total  DOUBLE PRECISION := 0.0;
  v_last_30_raw_score     DOUBLE PRECISION;
  v_last_30_sample_factor DOUBLE PRECISION;
  v_last_30_score         NUMERIC(4,3);
  v_last_30_signals       JSONB;
  v_last_30_count         INTEGER;

  -- -------------------------------------------------------------------------
  -- Promotion flag
  -- -------------------------------------------------------------------------
  v_promotion_eligible    BOOLEAN;

BEGIN
  -- =========================================================================
  -- STEP 1: Aggregate raw counters from the last 90 days of signals
  --
  -- All metrics are computed in a single pass over the filtered rows.
  -- We use FILTER clauses on aggregate functions rather than sub-selects
  -- to keep this as a single sequential scan.
  --
  -- AP-033: rubber_stamp_count added to this pass (signals where
  -- rubber_stamp = TRUE).
  -- =========================================================================

  SELECT
    -- Total row count
    COUNT(*)                                                            AS total_signals,

    -- Approved: 'approved' OR 'approved_edited'
    COUNT(*) FILTER (
      WHERE signal IN ('approved', 'approved_edited')
    )                                                                   AS total_approved,

    -- Rejected: 'rejected'
    COUNT(*) FILTER (
      WHERE signal = 'rejected'
    )                                                                   AS total_rejected,

    -- Undone: 'undone' OR 'auto_undone'
    COUNT(*) FILTER (
      WHERE signal IN ('undone', 'auto_undone')
    )                                                                   AS total_undone,

    -- Clean approvals: 'approved' only (not edited) AND not a rubber-stamp
    COUNT(*) FILTER (
      WHERE signal = 'approved' AND rubber_stamp = FALSE
    )                                                                   AS clean_approval_count,

    -- Approved-and-edited count (needed for edit_rate denominator)
    COUNT(*) FILTER (
      WHERE signal = 'approved_edited'
    )                                                                   AS approved_edited_count,

    -- AP-033: Rubber-stamp count (any approval signal flagged as too fast)
    COUNT(*) FILTER (
      WHERE rubber_stamp = TRUE
    )                                                                   AS rubber_stamp_count,

    -- Average response time across all rows with a non-NULL value
    AVG(time_to_respond_ms) FILTER (
      WHERE time_to_respond_ms IS NOT NULL
    )::INTEGER                                                          AS avg_response_time_ms,

    -- Temporal boundaries
    MIN(created_at)                                                     AS first_signal_at,
    MAX(created_at)                                                     AS last_signal_at,

    -- Distinct calendar days (UTC date)
    COUNT(DISTINCT DATE(created_at AT TIME ZONE 'UTC'))                 AS days_active

  INTO
    v_total_signals,
    v_total_approved,
    v_total_rejected,
    v_total_undone,
    v_clean_approval_count,
    v_approved_edited_count,
    v_rubber_stamp_count,
    v_avg_response_time_ms,
    v_first_signal_at,
    v_last_signal_at,
    v_days_active

  FROM public.autopilot_signals
  WHERE user_id    = NEW.user_id
    AND action_type = NEW.action_type
    AND created_at >= NOW() - INTERVAL '90 days';


  -- =========================================================================
  -- STEP 2: Derive rate columns
  --
  -- Mirror of TypeScript buildConfidenceScore() rate calculations.
  -- NULLIF(x, 0) prevents division-by-zero; result is NULL when denominator
  -- is zero (consistent with "not enough data" semantics).
  -- =========================================================================

  -- approval_rate = (approved + approved_edited) / total
  v_approval_rate := v_total_approved::NUMERIC
                     / NULLIF(v_total_signals, 0);

  -- clean_approval_rate = clean_approved / total  (rubber-stamps excluded)
  v_clean_approval_rate := v_clean_approval_count::NUMERIC
                           / NULLIF(v_total_signals, 0);

  -- edit_rate = approved_edited / total_approved
  --   (what fraction of approvals were "corrected" by the rep?)
  v_edit_rate := v_approved_edited_count::NUMERIC
                 / NULLIF(v_total_approved, 0);

  -- rejection_rate = rejected / total
  v_rejection_rate := v_total_rejected::NUMERIC
                      / NULLIF(v_total_signals, 0);

  -- undo_rate = (undone + auto_undone) / total
  v_undo_rate := v_total_undone::NUMERIC
                 / NULLIF(v_total_signals, 0);

  -- AP-033: rubber_stamp_rate = rubber_stamp_count / total
  v_rubber_stamp_rate := COALESCE(
    v_rubber_stamp_count::NUMERIC / NULLIF(v_total_signals, 0),
    0.000
  );


  -- =========================================================================
  -- STEP 3: Time-decayed confidence score — full 90-day window
  -- =========================================================================

  SELECT
    -- Σ (signalWeight × timeWeight)
    SUM(
      CASE signal
        WHEN 'approved'        THEN  1.0
        WHEN 'approved_edited' THEN  0.3
        WHEN 'rejected'        THEN -1.0
        WHEN 'expired'         THEN -0.2
        WHEN 'undone'          THEN -2.0
        WHEN 'auto_executed'   THEN  0.1
        WHEN 'auto_undone'     THEN -3.0
        ELSE 0.0
      END
      *
      POWER(0.5::DOUBLE PRECISION,
            EXTRACT(EPOCH FROM (NOW() - created_at))::DOUBLE PRECISION
            / 86400.0
            / 30.0)
    ),

    -- Σ (ABS(signalWeight) × timeWeight)
    SUM(
      ABS(CASE signal
        WHEN 'approved'        THEN  1.0
        WHEN 'approved_edited' THEN  0.3
        WHEN 'rejected'        THEN -1.0
        WHEN 'expired'         THEN -0.2
        WHEN 'undone'          THEN -2.0
        WHEN 'auto_executed'   THEN  0.1
        WHEN 'auto_undone'     THEN -3.0
        ELSE 0.0
      END)
      *
      POWER(0.5::DOUBLE PRECISION,
            EXTRACT(EPOCH FROM (NOW() - created_at))::DOUBLE PRECISION
            / 86400.0
            / 30.0)
    )

  INTO v_weighted_sum, v_weight_total

  FROM public.autopilot_signals
  WHERE user_id     = NEW.user_id
    AND action_type  = NEW.action_type
    AND created_at  >= NOW() - INTERVAL '90 days';

  -- Guard: both accumulators are NULL when no rows match (not zero)
  v_weighted_sum := COALESCE(v_weighted_sum, 0.0);
  v_weight_total := COALESCE(v_weight_total, 0.0);

  IF v_weight_total = 0.0 OR v_total_signals = 0 THEN
    v_score := 0;
  ELSE
    v_raw_score    := (v_weighted_sum / v_weight_total + 1.0) / 2.0;
    v_sample_factor := LEAST(v_total_signals::DOUBLE PRECISION / 10.0, 1.0);
    v_score := GREATEST(0, LEAST(1, v_raw_score * v_sample_factor))::NUMERIC(4,3);
  END IF;


  -- =========================================================================
  -- STEP 4: Last-30 window score
  -- =========================================================================

  -- Count how many rows are in the last-30 window (for sampleFactor)
  SELECT COUNT(*)
  INTO   v_last_30_count
  FROM (
    SELECT 1
    FROM public.autopilot_signals
    WHERE user_id     = NEW.user_id
      AND action_type  = NEW.action_type
      AND created_at  >= NOW() - INTERVAL '90 days'
    ORDER BY created_at DESC
    LIMIT 30
  ) sub;

  -- Compute weighted sums over the last-30 subquery
  SELECT
    SUM(
      CASE signal
        WHEN 'approved'        THEN  1.0
        WHEN 'approved_edited' THEN  0.3
        WHEN 'rejected'        THEN -1.0
        WHEN 'expired'         THEN -0.2
        WHEN 'undone'          THEN -2.0
        WHEN 'auto_executed'   THEN  0.1
        WHEN 'auto_undone'     THEN -3.0
        ELSE 0.0
      END
      *
      POWER(0.5::DOUBLE PRECISION,
            EXTRACT(EPOCH FROM (NOW() - created_at))::DOUBLE PRECISION
            / 86400.0
            / 30.0)
    ),
    SUM(
      ABS(CASE signal
        WHEN 'approved'        THEN  1.0
        WHEN 'approved_edited' THEN  0.3
        WHEN 'rejected'        THEN -1.0
        WHEN 'expired'         THEN -0.2
        WHEN 'undone'          THEN -2.0
        WHEN 'auto_executed'   THEN  0.1
        WHEN 'auto_undone'     THEN -3.0
        ELSE 0.0
      END)
      *
      POWER(0.5::DOUBLE PRECISION,
            EXTRACT(EPOCH FROM (NOW() - created_at))::DOUBLE PRECISION
            / 86400.0
            / 30.0)
    ),
    -- JSONB array of signal strings, newest-first
    jsonb_agg(signal ORDER BY created_at DESC)

  INTO v_last_30_weighted_sum, v_last_30_weight_total, v_last_30_signals

  FROM (
    SELECT signal, created_at
    FROM public.autopilot_signals
    WHERE user_id     = NEW.user_id
      AND action_type  = NEW.action_type
      AND created_at  >= NOW() - INTERVAL '90 days'
    ORDER BY created_at DESC
    LIMIT 30
  ) last30;

  v_last_30_weighted_sum := COALESCE(v_last_30_weighted_sum, 0.0);
  v_last_30_weight_total := COALESCE(v_last_30_weight_total, 0.0);
  v_last_30_signals      := COALESCE(v_last_30_signals, '[]'::JSONB);

  IF v_last_30_weight_total = 0.0 OR v_last_30_count = 0 THEN
    v_last_30_score := 0;
  ELSE
    v_last_30_raw_score    := (v_last_30_weighted_sum / v_last_30_weight_total + 1.0) / 2.0;
    v_last_30_sample_factor := LEAST(v_last_30_count::DOUBLE PRECISION / 10.0, 1.0);
    v_last_30_score := GREATEST(0, LEAST(1, v_last_30_raw_score * v_last_30_sample_factor))::NUMERIC(4,3);
  END IF;


  -- =========================================================================
  -- STEP 5: Promotion eligibility
  -- =========================================================================

  v_promotion_eligible := (v_score > 0.7 AND v_total_signals >= 10);


  -- =========================================================================
  -- STEP 6: Upsert into autopilot_confidence
  --
  -- Columns deliberately NOT touched (managed by the promotion engine):
  --   current_tier, cooldown_until, never_promote, extra_required_signals
  --
  -- AP-033: rubber_stamp_count and rubber_stamp_rate are now included.
  -- rubber_stamp_count is RECOMPUTED here from signal rows (source of truth),
  -- overriding any value set by the edge function increment RPC — this
  -- ensures the counter self-heals after backfills or corrections.
  -- =========================================================================

  INSERT INTO public.autopilot_confidence (
    org_id,
    user_id,
    action_type,
    score,
    approval_rate,
    clean_approval_rate,
    edit_rate,
    rejection_rate,
    undo_rate,
    total_signals,
    total_approved,
    total_rejected,
    total_undone,
    rubber_stamp_count,
    rubber_stamp_rate,
    last_30_score,
    last_30_signals,
    avg_response_time_ms,
    first_signal_at,
    last_signal_at,
    days_active,
    promotion_eligible,
    updated_at
    -- NOT included: current_tier, cooldown_until, never_promote, extra_required_signals
  )
  VALUES (
    NEW.org_id,
    NEW.user_id,
    NEW.action_type,
    v_score,
    v_approval_rate,
    v_clean_approval_rate,
    v_edit_rate,
    v_rejection_rate,
    v_undo_rate,
    v_total_signals,
    v_total_approved,
    v_total_rejected,
    v_total_undone,
    COALESCE(v_rubber_stamp_count, 0),
    v_rubber_stamp_rate,
    v_last_30_score,
    v_last_30_signals,
    v_avg_response_time_ms,
    v_first_signal_at,
    v_last_signal_at,
    v_days_active,
    v_promotion_eligible,
    NOW()
  )
  ON CONFLICT (user_id, action_type) DO UPDATE SET
    -- Identity (org may change in edge cases — keep in sync)
    org_id               = EXCLUDED.org_id,
    -- Computed metrics
    score                = EXCLUDED.score,
    approval_rate        = EXCLUDED.approval_rate,
    clean_approval_rate  = EXCLUDED.clean_approval_rate,
    edit_rate            = EXCLUDED.edit_rate,
    rejection_rate       = EXCLUDED.rejection_rate,
    undo_rate            = EXCLUDED.undo_rate,
    total_signals        = EXCLUDED.total_signals,
    total_approved       = EXCLUDED.total_approved,
    total_rejected       = EXCLUDED.total_rejected,
    total_undone         = EXCLUDED.total_undone,
    -- AP-033: rubber-stamp counters (recomputed from signal rows = self-healing)
    rubber_stamp_count   = EXCLUDED.rubber_stamp_count,
    rubber_stamp_rate    = EXCLUDED.rubber_stamp_rate,
    last_30_score        = EXCLUDED.last_30_score,
    last_30_signals      = EXCLUDED.last_30_signals,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    first_signal_at      = EXCLUDED.first_signal_at,
    last_signal_at       = EXCLUDED.last_signal_at,
    days_active          = EXCLUDED.days_active,
    promotion_eligible   = EXCLUDED.promotion_eligible,
    updated_at           = NOW();
    -- NOT updated: current_tier, cooldown_until, never_promote, extra_required_signals

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.refresh_autopilot_confidence() IS
  'Trigger function (AP-011 / AP-033): fires AFTER INSERT on autopilot_signals. '
  'Recalculates all computed confidence metrics for the affected (user_id, '
  'action_type) pair over the last 90 days and upserts into autopilot_confidence. '
  'AP-033: now includes rubber_stamp_count and rubber_stamp_rate recomputed from '
  'signal rows (self-healing — overrides incremental edge-function updates). '
  'Does NOT modify current_tier, cooldown_until, never_promote, or '
  'extra_required_signals — those columns are managed exclusively by the '
  'promotion/demotion engine.';


-- ---------------------------------------------------------------------------
-- 4. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260226700001_autopilot_rubber_stamp_counter.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'AP-033: Rubber-stamp counter columns + RPC';
  RAISE NOTICE '';
  RAISE NOTICE 'Added to autopilot_confidence:';
  RAISE NOTICE '  - rubber_stamp_count INTEGER DEFAULT 0 NOT NULL';
  RAISE NOTICE '  - rubber_stamp_rate  NUMERIC(4,3) DEFAULT 0.000 NOT NULL';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - FUNCTION public.increment_rubber_stamp_count(UUID, TEXT)';
  RAISE NOTICE '    - Race-condition-safe atomic increment via single SQL UPDATE';
  RAISE NOTICE '    - Called by autopilot-record-signal edge function (fire-and-forget)';
  RAISE NOTICE '';
  RAISE NOTICE 'Updated:';
  RAISE NOTICE '  - FUNCTION public.refresh_autopilot_confidence() RETURNS trigger';
  RAISE NOTICE '    - Added rubber_stamp_count to STEP 1 aggregate query';
  RAISE NOTICE '    - Added rubber_stamp_rate = rubber_stamp_count / total_signals';
  RAISE NOTICE '    - Both columns now included in upsert INSERT + ON CONFLICT UPDATE';
  RAISE NOTICE '    - rubber_stamp_count recomputed from signal rows = self-healing';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
