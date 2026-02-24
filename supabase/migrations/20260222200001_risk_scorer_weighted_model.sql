-- ============================================================================
-- PRD-04: Deal Risk Scorer Agent — Weighted Scoring Model
-- Story: RSK-001
--
-- Adds score_breakdown column to deal_risk_scores for per-dimension
-- transparency (engagement, champion, momentum, sentiment).
-- Updates calculate_deal_risk_aggregate to use the weighted model.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add score_breakdown column to deal_risk_scores
-- ---------------------------------------------------------------------------

ALTER TABLE deal_risk_scores
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT NULL;

COMMENT ON COLUMN deal_risk_scores.score_breakdown IS
  'Per-dimension sub-scores: {engagement, champion, momentum, sentiment} each 0-100';

-- ---------------------------------------------------------------------------
-- 2. Replace calculate_deal_risk_aggregate with weighted model
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION calculate_deal_risk_aggregate(p_deal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_critical_count INT := 0;
  v_high_count INT := 0;
  v_medium_count INT := 0;
  v_low_count INT := 0;
  v_signal_breakdown JSONB := '{}';
  v_risk_score INT := 0;
  v_overall_risk_level TEXT := 'low';
  v_sentiment_trend TEXT := 'unknown';
  v_avg_sentiment NUMERIC;
  v_older_avg_sentiment NUMERIC;
  v_days_since_last_meeting INT;
  v_last_forward_movement TIMESTAMPTZ;
  v_risk_summary TEXT := '';
  -- Weighted model dimensions
  v_engagement_score INT := 0;
  v_champion_score INT := 0;
  v_momentum_score INT := 0;
  v_sentiment_score INT := 0;
  -- Weights (default 25% each — can be overridden via PRD-01 config at app layer)
  v_w_engagement NUMERIC := 0.25;
  v_w_champion NUMERIC := 0.25;
  v_w_momentum NUMERIC := 0.25;
  v_w_sentiment NUMERIC := 0.25;
  -- Signal classification
  v_engagement_signals TEXT[] := ARRAY['stalled_deal'];
  v_champion_signals TEXT[] := ARRAY['champion_silent', 'stakeholder_concern'];
  v_momentum_signals TEXT[] := ARRAY['timeline_slip', 'decision_delay', 'scope_creep'];
  v_sentiment_signals TEXT[] := ARRAY['budget_concern', 'competitor_mention', 'sentiment_decline', 'objection_unresolved'];
BEGIN
  -- Get org_id from deal
  SELECT d.owner_id INTO v_org_id
  FROM deals d WHERE d.id = p_deal_id;

  -- Actually get org_id properly
  SELECT d.org_id INTO v_org_id
  FROM deals d WHERE d.id = p_deal_id;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Count active signals by severity
  SELECT
    COUNT(*) FILTER (WHERE severity = 'critical'),
    COUNT(*) FILTER (WHERE severity = 'high'),
    COUNT(*) FILTER (WHERE severity = 'medium'),
    COUNT(*) FILTER (WHERE severity = 'low')
  INTO v_critical_count, v_high_count, v_medium_count, v_low_count
  FROM deal_risk_signals
  WHERE deal_id = p_deal_id
    AND is_resolved = false
    AND auto_dismissed = false;

  -- Build signal breakdown by type
  SELECT COALESCE(jsonb_object_agg(signal_type, cnt), '{}')
  INTO v_signal_breakdown
  FROM (
    SELECT signal_type, COUNT(*) AS cnt
    FROM deal_risk_signals
    WHERE deal_id = p_deal_id
      AND is_resolved = false
      AND auto_dismissed = false
    GROUP BY signal_type
  ) sub;

  -- Calculate per-dimension scores from signal severity weights
  -- Engagement dimension: stalled_deal signals
  SELECT LEAST(100, COALESCE(SUM(
    CASE severity
      WHEN 'critical' THEN 40
      WHEN 'high' THEN 25
      WHEN 'medium' THEN 15
      WHEN 'low' THEN 5
    END
  ), 0))
  INTO v_engagement_score
  FROM deal_risk_signals
  WHERE deal_id = p_deal_id
    AND is_resolved = false
    AND auto_dismissed = false
    AND signal_type = ANY(v_engagement_signals);

  -- Champion dimension: champion_silent, stakeholder_concern
  SELECT LEAST(100, COALESCE(SUM(
    CASE severity
      WHEN 'critical' THEN 40
      WHEN 'high' THEN 25
      WHEN 'medium' THEN 15
      WHEN 'low' THEN 5
    END
  ), 0))
  INTO v_champion_score
  FROM deal_risk_signals
  WHERE deal_id = p_deal_id
    AND is_resolved = false
    AND auto_dismissed = false
    AND signal_type = ANY(v_champion_signals);

  -- Momentum dimension: timeline_slip, decision_delay, scope_creep
  SELECT LEAST(100, COALESCE(SUM(
    CASE severity
      WHEN 'critical' THEN 40
      WHEN 'high' THEN 25
      WHEN 'medium' THEN 15
      WHEN 'low' THEN 5
    END
  ), 0))
  INTO v_momentum_score
  FROM deal_risk_signals
  WHERE deal_id = p_deal_id
    AND is_resolved = false
    AND auto_dismissed = false
    AND signal_type = ANY(v_momentum_signals);

  -- Sentiment dimension: budget_concern, competitor_mention, sentiment_decline, objection_unresolved
  SELECT LEAST(100, COALESCE(SUM(
    CASE severity
      WHEN 'critical' THEN 40
      WHEN 'high' THEN 25
      WHEN 'medium' THEN 15
      WHEN 'low' THEN 5
    END
  ), 0))
  INTO v_sentiment_score
  FROM deal_risk_signals
  WHERE deal_id = p_deal_id
    AND is_resolved = false
    AND auto_dismissed = false
    AND signal_type = ANY(v_sentiment_signals);

  -- Weighted composite score
  v_risk_score := LEAST(100, ROUND(
    v_engagement_score * v_w_engagement +
    v_champion_score * v_w_champion +
    v_momentum_score * v_w_momentum +
    v_sentiment_score * v_w_sentiment
  )::INT);

  -- Determine overall risk level
  IF v_critical_count > 0 OR v_risk_score >= 80 THEN
    v_overall_risk_level := 'critical';
  ELSIF v_high_count >= 2 OR v_risk_score >= 50 THEN
    v_overall_risk_level := 'high';
  ELSIF v_high_count >= 1 OR v_medium_count >= 2 OR v_risk_score >= 25 THEN
    v_overall_risk_level := 'medium';
  ELSE
    v_overall_risk_level := 'low';
  END IF;

  -- Sentiment trend from recent meetings (90-day window)
  SELECT AVG(sentiment_score)
  INTO v_avg_sentiment
  FROM meetings
  WHERE company_id IN (SELECT company_id FROM deals WHERE id = p_deal_id)
    AND start_time > NOW() - INTERVAL '14 days'
    AND sentiment_score IS NOT NULL;

  SELECT AVG(sentiment_score)
  INTO v_older_avg_sentiment
  FROM meetings
  WHERE company_id IN (SELECT company_id FROM deals WHERE id = p_deal_id)
    AND start_time BETWEEN NOW() - INTERVAL '90 days' AND NOW() - INTERVAL '14 days'
    AND sentiment_score IS NOT NULL;

  IF v_avg_sentiment IS NOT NULL AND v_older_avg_sentiment IS NOT NULL AND v_older_avg_sentiment > 0 THEN
    IF ((v_avg_sentiment - v_older_avg_sentiment) / v_older_avg_sentiment) > 0.05 THEN
      v_sentiment_trend := 'improving';
    ELSIF ((v_avg_sentiment - v_older_avg_sentiment) / v_older_avg_sentiment) < -0.05 THEN
      v_sentiment_trend := 'declining';
    ELSE
      v_sentiment_trend := 'stable';
    END IF;
  END IF;

  -- Days since last meeting
  SELECT EXTRACT(DAY FROM NOW() - MAX(start_time))::INT
  INTO v_days_since_last_meeting
  FROM meetings
  WHERE company_id IN (SELECT company_id FROM deals WHERE id = p_deal_id);

  -- Last forward movement
  SELECT MAX(mc.updated_at)
  INTO v_last_forward_movement
  FROM meeting_classifications mc
  JOIN meetings m ON m.id = mc.meeting_id
  WHERE m.company_id IN (SELECT company_id FROM deals WHERE id = p_deal_id)
    AND mc.has_forward_movement = true;

  -- Generate risk summary
  CASE v_overall_risk_level
    WHEN 'critical' THEN
      v_risk_summary := format('Critical risk (score %s): %s critical, %s high signals. Immediate intervention required.',
        v_risk_score, v_critical_count, v_high_count);
    WHEN 'high' THEN
      v_risk_summary := format('High risk (score %s): %s high, %s medium signals. Active attention needed.',
        v_risk_score, v_high_count, v_medium_count);
    WHEN 'medium' THEN
      v_risk_summary := format('Medium risk (score %s): %s signals detected. Monitor for changes.',
        v_risk_score, v_high_count + v_medium_count);
    ELSE
      v_risk_summary := format('Low risk (score %s): Deal progressing normally.',
        v_risk_score);
  END CASE;

  -- Upsert aggregate
  INSERT INTO deal_risk_aggregates (
    deal_id, org_id, overall_risk_level, risk_score,
    active_signals_count, critical_signals_count, high_signals_count,
    medium_signals_count, low_signals_count, signal_breakdown,
    sentiment_trend, avg_sentiment_last_3_meetings,
    days_since_last_meeting,
    last_forward_movement_at,
    days_without_forward_movement,
    risk_summary, last_calculated_at, updated_at
  ) VALUES (
    p_deal_id, v_org_id, v_overall_risk_level, v_risk_score,
    v_critical_count + v_high_count + v_medium_count + v_low_count,
    v_critical_count, v_high_count, v_medium_count, v_low_count,
    v_signal_breakdown,
    v_sentiment_trend, v_avg_sentiment,
    v_days_since_last_meeting,
    v_last_forward_movement,
    CASE WHEN v_last_forward_movement IS NOT NULL
      THEN EXTRACT(DAY FROM NOW() - v_last_forward_movement)::INT
      ELSE NULL END,
    v_risk_summary, NOW(), NOW()
  )
  ON CONFLICT (deal_id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    overall_risk_level = EXCLUDED.overall_risk_level,
    risk_score = EXCLUDED.risk_score,
    active_signals_count = EXCLUDED.active_signals_count,
    critical_signals_count = EXCLUDED.critical_signals_count,
    high_signals_count = EXCLUDED.high_signals_count,
    medium_signals_count = EXCLUDED.medium_signals_count,
    low_signals_count = EXCLUDED.low_signals_count,
    signal_breakdown = EXCLUDED.signal_breakdown,
    sentiment_trend = EXCLUDED.sentiment_trend,
    avg_sentiment_last_3_meetings = EXCLUDED.avg_sentiment_last_3_meetings,
    days_since_last_meeting = EXCLUDED.days_since_last_meeting,
    last_forward_movement_at = EXCLUDED.last_forward_movement_at,
    days_without_forward_movement = EXCLUDED.days_without_forward_movement,
    risk_summary = EXCLUDED.risk_summary,
    last_calculated_at = EXCLUDED.last_calculated_at,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Grant execute on updated function
GRANT EXECUTE ON FUNCTION calculate_deal_risk_aggregate(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_deal_risk_aggregate(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Upsert RPC that also stores score_breakdown
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_deal_risk_score(
  p_org_id TEXT,
  p_deal_id UUID,
  p_score INT,
  p_signals JSONB,
  p_score_breakdown JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_prev_score INT;
  v_id UUID;
BEGIN
  -- Validate score range
  IF p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'Score must be between 0 and 100';
  END IF;

  -- Get previous score for delta tracking
  SELECT score INTO v_prev_score
  FROM deal_risk_scores
  WHERE deal_id = p_deal_id;

  -- Upsert
  INSERT INTO deal_risk_scores (org_id, deal_id, score, previous_score, signals, score_breakdown, scanned_at)
  VALUES (p_org_id, p_deal_id, p_score, COALESCE(v_prev_score, p_score), p_signals, p_score_breakdown, NOW())
  ON CONFLICT (deal_id) DO UPDATE SET
    score = EXCLUDED.score,
    previous_score = COALESCE(v_prev_score, deal_risk_scores.score),
    signals = EXCLUDED.signals,
    score_breakdown = EXCLUDED.score_breakdown,
    scanned_at = EXCLUDED.scanned_at
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_deal_risk_score(TEXT, UUID, INT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_deal_risk_score(TEXT, UUID, INT, JSONB, JSONB) TO service_role;
