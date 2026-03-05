-- ============================================================================
-- AP-011: Autopilot Confidence — Async Recalculation Trigger
--
-- Creates a PostgreSQL trigger on `autopilot_signals` that fires AFTER each
-- INSERT and synchronously recalculates the full confidence score for the
-- affected (user_id, action_type) pair, persisting the result into
-- `autopilot_confidence` via upsert.
--
-- The PL/pgSQL function mirrors the TypeScript logic in:
--   supabase/functions/_shared/autopilot/confidence.ts  (buildConfidenceScore,
--                                                         calculateConfidence)
--
-- Columns deliberately NOT touched (managed by the promotion engine):
--   current_tier, cooldown_until, never_promote, extra_required_signals
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Trigger function: refresh_autopilot_confidence()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_autopilot_confidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER           -- runs as the function owner (postgres) so it can
                           -- bypass RLS on autopilot_confidence without
                           -- requiring service_role at the connection level
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


  -- =========================================================================
  -- STEP 3: Time-decayed confidence score — full 90-day window
  --
  -- Mirrors calculateConfidence() in confidence.ts:
  --
  --   for each signal:
  --     daysOld     = (now - created_at) in fractional days
  --     timeWeight  = 0.5 ^ (daysOld / 30)          -- 30-day half-life
  --     signalWeight = SIGNAL_WEIGHTS[signal]
  --     weightedSum += signalWeight * timeWeight
  --     weightTotal += ABS(signalWeight) * timeWeight  -- ABS is critical
  --
  --   rawScore    = (weightedSum / weightTotal + 1.0) / 2.0  -- normalise to [0,1]
  --   sampleFactor = LEAST(n / 10.0, 1.0)                    -- penalise thin data
  --   score        = GREATEST(0, LEAST(1, rawScore * sampleFactor))
  --
  -- SIGNAL_WEIGHTS (from signals.ts):
  --   approved        → +1.0
  --   approved_edited → +0.3
  --   rejected        → -1.0
  --   expired         → -0.2
  --   undone          → -2.0
  --   auto_executed   → +0.1
  --   auto_undone     → -3.0
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
            / 86400.0                                -- seconds → days
            / 30.0)                                  -- 30-day half-life
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
  --
  -- Applies the same calculateConfidence() formula to only the 30 most recent
  -- signals (by created_at DESC), regardless of their age.
  --
  -- We also build the last_30_signals JSONB array (array of signal strings).
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
  --
  -- Mirrors TypeScript: score > 0.7 AND total_signals >= 10
  -- =========================================================================

  v_promotion_eligible := (v_score > 0.7 AND v_total_signals >= 10);


  -- =========================================================================
  -- STEP 6: Upsert into autopilot_confidence
  --
  -- Only "computed" columns are written. The four promotion-engine-managed
  -- columns are explicitly excluded from both the INSERT column list and the
  -- ON CONFLICT DO UPDATE clause:
  --
  --   current_tier            — set by the promotion/demotion engine
  --   cooldown_until          — set by the demotion engine
  --   never_promote           — set by admin or policy
  --   extra_required_signals  — penalty applied after demotion
  --
  -- On first insert (no existing row) these columns will default to their
  -- table-level defaults ('approve', NULL, FALSE, 0) which is correct.
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
  'Trigger function (AP-011): fires AFTER INSERT on autopilot_signals. '
  'Recalculates all computed confidence metrics for the affected (user_id, '
  'action_type) pair over the last 90 days and upserts into autopilot_confidence. '
  'Does NOT modify current_tier, cooldown_until, never_promote, or '
  'extra_required_signals — those columns are managed exclusively by the '
  'promotion/demotion engine.';


-- ---------------------------------------------------------------------------
-- 2. Attach trigger to autopilot_signals
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS autopilot_signals_refresh_confidence
  ON public.autopilot_signals;

CREATE TRIGGER autopilot_signals_refresh_confidence
  AFTER INSERT ON public.autopilot_signals
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_autopilot_confidence();

COMMENT ON TRIGGER autopilot_signals_refresh_confidence
  ON public.autopilot_signals IS
  'AP-011: After each new signal row, recomputes confidence metrics for the '
  'affected (user_id, action_type) pair and upserts autopilot_confidence.';


-- ---------------------------------------------------------------------------
-- 3. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260226400001_autopilot_confidence_trigger.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'AP-011: autopilot_confidence trigger';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - FUNCTION public.refresh_autopilot_confidence() RETURNS trigger';
  RAISE NOTICE '    - Aggregates last-90-day signals in a single SQL pass';
  RAISE NOTICE '    - Computes time-decayed score (30-day half-life, POWER(0.5, days/30))';
  RAISE NOTICE '    - Computes last_30_score / last_30_signals over most recent 30 rows';
  RAISE NOTICE '    - Sets promotion_eligible = TRUE when score > 0.7 AND signals >= 10';
  RAISE NOTICE '    - Upserts autopilot_confidence ON CONFLICT (user_id, action_type)';
  RAISE NOTICE '    - NEVER touches: current_tier, cooldown_until, never_promote,';
  RAISE NOTICE '      extra_required_signals (promotion-engine-managed columns)';
  RAISE NOTICE '';
  RAISE NOTICE '  - TRIGGER autopilot_signals_refresh_confidence';
  RAISE NOTICE '    - AFTER INSERT ON autopilot_signals FOR EACH ROW';
  RAISE NOTICE '    - Fires synchronously in the same transaction as the signal insert';
  RAISE NOTICE '';
  RAISE NOTICE 'Signal weights (mirrors signals.ts SIGNAL_WEIGHTS):';
  RAISE NOTICE '  approved        → +1.0';
  RAISE NOTICE '  approved_edited → +0.3';
  RAISE NOTICE '  rejected        → -1.0';
  RAISE NOTICE '  expired         → -0.2';
  RAISE NOTICE '  undone          → -2.0';
  RAISE NOTICE '  auto_executed   → +0.1';
  RAISE NOTICE '  auto_undone     → -3.0';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
