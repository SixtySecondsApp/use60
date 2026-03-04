-- =============================================================================
-- AE2-016: Trust Capital Score RPC
-- =============================================================================
-- Lightweight server-side version of the trust capital calculation.
-- The full logic lives in trustCapital.ts (edge function); this RPC provides
-- fast reads for the frontend dashboard.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_trust_capital(
  p_user_id UUID,
  p_org_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_signals     BIGINT;
  v_action_types      INTEGER;
  v_avg_confidence    NUMERIC;
  v_auto_tier_count   INTEGER;
  v_days_active       INTEGER;
  v_earliest          TIMESTAMPTZ;
  v_score             INTEGER;
BEGIN
  -- Aggregate from autopilot_confidence
  SELECT
    COALESCE(SUM(ac.total_signals), 0),
    COUNT(DISTINCT ac.action_type),
    COALESCE(AVG(ac.score), 0),
    COUNT(*) FILTER (WHERE ac.current_tier = 'auto'),
    MIN(ac.created_at)
  INTO
    v_total_signals,
    v_action_types,
    v_avg_confidence,
    v_auto_tier_count,
    v_earliest
  FROM public.autopilot_confidence ac
  WHERE ac.user_id = p_user_id
    AND ac.org_id = p_org_id;

  -- Days active
  v_days_active := GREATEST(0, EXTRACT(DAY FROM NOW() - COALESCE(v_earliest, NOW()))::INTEGER);

  -- Simplified composite score (0-1000)
  -- Mirrors the TypeScript weights: signals 0.25, coverage 0.20, confidence 0.20, tenure 0.15, auto 0.10, personalization 0.10
  v_score := LEAST(1000, ROUND(
    (LEAST(1.0, LN(v_total_signals + 1) / LN(501)) * 250) +
    (LEAST(1.0, v_action_types::NUMERIC / 8.0) * 200) +
    (v_avg_confidence * 200) +
    (LEAST(1.0, LN(v_days_active + 1) / LN(181)) * 150) +
    (LEAST(1.0, v_auto_tier_count::NUMERIC / 8.0) * 100) +
    50  -- baseline for personalization (server-side doesn't check user_ai_preferences)
  ));

  RETURN jsonb_build_object(
    'score', v_score,
    'total_signals', v_total_signals,
    'action_types_trained', v_action_types,
    'avg_confidence', ROUND(v_avg_confidence, 2),
    'days_active', v_days_active,
    'auto_tier_count', v_auto_tier_count
  );
END;
$$;

COMMENT ON FUNCTION public.get_trust_capital(UUID, UUID) IS 'AE2-016: Returns trust capital score and breakdown for the dashboard';

GRANT EXECUTE ON FUNCTION public.get_trust_capital(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trust_capital(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260303200006_trust_capital_rpc.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Ticket: AE2-016';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - get_trust_capital(user_id, org_id) RPC';
  RAISE NOTICE '  - Returns: score (0-1000), total_signals, action_types_trained,';
  RAISE NOTICE '    avg_confidence, days_active, auto_tier_count';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
