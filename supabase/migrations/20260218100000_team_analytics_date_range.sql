-- Migration: Add p_start_date / p_end_date support to team analytics RPCs
-- When p_start_date and p_end_date are provided, they take precedence over p_period_days.
-- When NULL (the default), the original p_period_days rolling-window behavior is preserved.

-- =============================================================================
-- 1. get_team_aggregates_with_comparison
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_team_aggregates_with_comparison"(
  "p_org_id" "uuid",
  "p_period_days" integer DEFAULT 30,
  "p_start_date" date DEFAULT NULL,
  "p_end_date" date DEFAULT NULL
) RETURNS TABLE(
  "current_total_meetings" bigint,
  "current_avg_sentiment" numeric,
  "current_avg_talk_time" numeric,
  "current_avg_coach_rating" numeric,
  "current_positive_count" bigint,
  "current_negative_count" bigint,
  "current_total_duration" numeric,
  "current_team_members" bigint,
  "current_forward_movement_count" bigint,
  "current_objection_count" bigint,
  "current_positive_outcome_count" bigint,
  "previous_total_meetings" bigint,
  "previous_avg_sentiment" numeric,
  "previous_avg_talk_time" numeric,
  "previous_avg_coach_rating" numeric,
  "previous_positive_count" bigint,
  "previous_forward_movement_count" bigint,
  "previous_positive_outcome_count" bigint,
  "meetings_change_pct" numeric,
  "sentiment_change_pct" numeric,
  "talk_time_change_pct" numeric,
  "coach_rating_change_pct" numeric,
  "forward_movement_change_pct" numeric,
  "positive_outcome_change_pct" numeric
)
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_current_start timestamptz;
  v_current_end   timestamptz;
  v_prev_start    timestamptz;
  v_prev_end      timestamptz;
  v_span          interval;
BEGIN
  -- Resolve date boundaries
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_current_start := p_start_date::timestamptz;
    v_current_end   := (p_end_date + 1)::timestamptz; -- exclusive upper bound (start of next day)
    v_span          := v_current_end - v_current_start;
    v_prev_start    := v_current_start - v_span;
    v_prev_end      := v_current_start;
  ELSE
    v_current_end   := NOW();
    v_current_start := NOW() - (p_period_days || ' days')::interval;
    v_prev_end      := v_current_start;
    v_prev_start    := NOW() - (p_period_days * 2 || ' days')::interval;
  END IF;

  RETURN QUERY
  WITH current_period AS (
    SELECT
      COUNT(m.id) as total_meetings,
      AVG(m.sentiment_score) as avg_sentiment,
      AVG(m.talk_time_rep_pct) as avg_talk_time,
      AVG(m.coach_rating) as avg_coach_rating,
      COUNT(CASE WHEN m.sentiment_score > 0.2 THEN 1 END) as positive_count,
      COUNT(CASE WHEN m.sentiment_score < -0.2 THEN 1 END) as negative_count,
      SUM(m.duration_minutes) as total_duration,
      COUNT(DISTINCT m.owner_user_id) as team_members,
      COUNT(CASE WHEN mc.has_forward_movement = true THEN 1 END) as forward_movement_count,
      COUNT(CASE WHEN mc.has_objection = true THEN 1 END) as objection_count,
      COUNT(CASE WHEN mc.outcome = 'positive' THEN 1 END) as positive_outcome_count
    FROM meetings m
    LEFT JOIN meeting_classifications mc ON mc.meeting_id = m.id
    WHERE m.org_id = p_org_id
      AND m.meeting_start >= v_current_start
      AND m.meeting_start < v_current_end
      AND m.meeting_start IS NOT NULL
  ),
  previous_period AS (
    SELECT
      COUNT(m.id) as total_meetings,
      AVG(m.sentiment_score) as avg_sentiment,
      AVG(m.talk_time_rep_pct) as avg_talk_time,
      AVG(m.coach_rating) as avg_coach_rating,
      COUNT(CASE WHEN m.sentiment_score > 0.2 THEN 1 END) as positive_count,
      COUNT(CASE WHEN mc.has_forward_movement = true THEN 1 END) as forward_movement_count,
      COUNT(CASE WHEN mc.outcome = 'positive' THEN 1 END) as positive_outcome_count
    FROM meetings m
    LEFT JOIN meeting_classifications mc ON mc.meeting_id = m.id
    WHERE m.org_id = p_org_id
      AND m.meeting_start >= v_prev_start
      AND m.meeting_start < v_prev_end
      AND m.meeting_start IS NOT NULL
  )
  SELECT
    cp.total_meetings,
    ROUND(cp.avg_sentiment, 3),
    ROUND(cp.avg_talk_time, 1),
    ROUND(cp.avg_coach_rating, 1),
    cp.positive_count,
    cp.negative_count,
    ROUND(cp.total_duration, 0),
    cp.team_members,
    cp.forward_movement_count,
    cp.objection_count,
    cp.positive_outcome_count,
    pp.total_meetings,
    ROUND(pp.avg_sentiment, 3),
    ROUND(pp.avg_talk_time, 1),
    ROUND(pp.avg_coach_rating, 1),
    pp.positive_count,
    pp.forward_movement_count,
    pp.positive_outcome_count,
    CASE WHEN pp.total_meetings > 0 THEN
      ROUND(((cp.total_meetings - pp.total_meetings)::NUMERIC / pp.total_meetings) * 100, 1)
    ELSE NULL END,
    CASE WHEN pp.avg_sentiment IS NOT NULL AND ABS(pp.avg_sentiment) > 0.001 THEN
      ROUND(((cp.avg_sentiment - pp.avg_sentiment) / ABS(pp.avg_sentiment)) * 100, 1)
    ELSE NULL END,
    CASE WHEN pp.avg_talk_time IS NOT NULL AND pp.avg_talk_time > 0 THEN
      ROUND(((cp.avg_talk_time - pp.avg_talk_time) / pp.avg_talk_time) * 100, 1)
    ELSE NULL END,
    CASE WHEN pp.avg_coach_rating IS NOT NULL AND pp.avg_coach_rating > 0 THEN
      ROUND(((cp.avg_coach_rating - pp.avg_coach_rating) / pp.avg_coach_rating) * 100, 1)
    ELSE NULL END,
    CASE WHEN pp.forward_movement_count > 0 THEN
      ROUND(((cp.forward_movement_count - pp.forward_movement_count)::NUMERIC / pp.forward_movement_count) * 100, 1)
    ELSE NULL END,
    CASE WHEN pp.positive_outcome_count > 0 THEN
      ROUND(((cp.positive_outcome_count - pp.positive_outcome_count)::NUMERIC / pp.positive_outcome_count) * 100, 1)
    ELSE NULL END
  FROM current_period cp, previous_period pp;
END;
$$;

COMMENT ON FUNCTION "public"."get_team_aggregates_with_comparison"("p_org_id" "uuid", "p_period_days" integer, "p_start_date" date, "p_end_date" date)
  IS 'Returns team aggregates with period-over-period comparison. Supports explicit date range via p_start_date/p_end_date or rolling window via p_period_days.';

-- =============================================================================
-- 2. get_team_time_series_metrics
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_team_time_series_metrics"(
  "p_org_id" "uuid",
  "p_period_days" integer DEFAULT 30,
  "p_granularity" "text" DEFAULT 'day'::"text",
  "p_user_id" "uuid" DEFAULT NULL::"uuid",
  "p_start_date" date DEFAULT NULL,
  "p_end_date" date DEFAULT NULL
) RETURNS TABLE(
  "period_start" timestamp with time zone,
  "user_id" "uuid",
  "user_name" "text",
  "meeting_count" bigint,
  "avg_sentiment" numeric,
  "avg_talk_time" numeric,
  "avg_coach_rating" numeric,
  "positive_count" bigint,
  "negative_count" bigint,
  "forward_movement_count" bigint,
  "total_duration" numeric
)
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date::timestamptz;
    v_end   := (p_end_date + 1)::timestamptz;
  ELSE
    v_start := NOW() - (p_period_days || ' days')::interval;
    v_end   := NOW();
  END IF;

  RETURN QUERY
  SELECT
    CASE p_granularity
      WHEN 'week' THEN DATE_TRUNC('week', m.meeting_start)
      ELSE DATE_TRUNC('day', m.meeting_start)
    END as period_start,
    m.owner_user_id as user_id,
    COALESCE(
      NULLIF(TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))), ''),
      p.email
    ) as user_name,
    COUNT(m.id) as meeting_count,
    ROUND(AVG(m.sentiment_score), 3) as avg_sentiment,
    ROUND(AVG(m.talk_time_rep_pct), 1) as avg_talk_time,
    ROUND(AVG(m.coach_rating), 1) as avg_coach_rating,
    COUNT(CASE WHEN m.sentiment_score > 0.2 THEN 1 END) as positive_count,
    COUNT(CASE WHEN m.sentiment_score < -0.2 THEN 1 END) as negative_count,
    COUNT(CASE WHEN mc.has_forward_movement = true THEN 1 END) as forward_movement_count,
    ROUND(SUM(m.duration_minutes), 0) as total_duration
  FROM meetings m
  LEFT JOIN profiles p ON m.owner_user_id = p.id
  LEFT JOIN meeting_classifications mc ON mc.meeting_id = m.id
  WHERE m.org_id = p_org_id
    AND m.meeting_start >= v_start
    AND m.meeting_start < v_end
    AND m.meeting_start IS NOT NULL
    AND (p_user_id IS NULL OR m.owner_user_id = p_user_id)
  GROUP BY
    CASE p_granularity
      WHEN 'week' THEN DATE_TRUNC('week', m.meeting_start)
      ELSE DATE_TRUNC('day', m.meeting_start)
    END,
    m.owner_user_id,
    p.first_name,
    p.last_name,
    p.email
  ORDER BY period_start DESC, meeting_count DESC;
END;
$$;

COMMENT ON FUNCTION "public"."get_team_time_series_metrics"("p_org_id" "uuid", "p_period_days" integer, "p_granularity" "text", "p_user_id" "uuid", "p_start_date" date, "p_end_date" date)
  IS 'Returns time-bucketed metrics for trend charts. Supports explicit date range via p_start_date/p_end_date or rolling window via p_period_days.';

-- =============================================================================
-- 3. get_team_quality_signals
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_team_quality_signals"(
  "p_org_id" "uuid",
  "p_period_days" integer DEFAULT 30,
  "p_user_id" "uuid" DEFAULT NULL::"uuid",
  "p_start_date" date DEFAULT NULL,
  "p_end_date" date DEFAULT NULL
) RETURNS TABLE(
  "user_id" "uuid",
  "user_name" "text",
  "user_email" "text",
  "total_meetings" bigint,
  "classified_meetings" bigint,
  "forward_movement_count" bigint,
  "forward_movement_rate" numeric,
  "objection_count" bigint,
  "objection_rate" numeric,
  "competitor_mention_count" bigint,
  "pricing_discussion_count" bigint,
  "positive_outcome_count" bigint,
  "negative_outcome_count" bigint,
  "neutral_outcome_count" bigint,
  "positive_outcome_rate" numeric,
  "avg_sentiment" numeric,
  "avg_talk_time" numeric,
  "avg_coach_rating" numeric
)
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date::timestamptz;
    v_end   := (p_end_date + 1)::timestamptz;
  ELSE
    v_start := NOW() - (p_period_days || ' days')::interval;
    v_end   := NOW();
  END IF;

  RETURN QUERY
  SELECT
    m.owner_user_id as user_id,
    COALESCE(
      NULLIF(TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))), ''),
      p.email
    ) as user_name,
    p.email as user_email,
    COUNT(m.id) as total_meetings,
    COUNT(mc.id) as classified_meetings,
    COUNT(CASE WHEN mc.has_forward_movement = true THEN 1 END) as forward_movement_count,
    CASE WHEN COUNT(mc.id) > 0 THEN
      ROUND((COUNT(CASE WHEN mc.has_forward_movement = true THEN 1 END)::NUMERIC / COUNT(mc.id)) * 100, 1)
    ELSE NULL END as forward_movement_rate,
    COUNT(CASE WHEN mc.has_objection = true THEN 1 END) as objection_count,
    CASE WHEN COUNT(mc.id) > 0 THEN
      ROUND((COUNT(CASE WHEN mc.has_objection = true THEN 1 END)::NUMERIC / COUNT(mc.id)) * 100, 1)
    ELSE NULL END as objection_rate,
    COUNT(CASE WHEN mc.has_competitor_mention = true THEN 1 END) as competitor_mention_count,
    COUNT(CASE WHEN mc.has_pricing_discussion = true THEN 1 END) as pricing_discussion_count,
    COUNT(CASE WHEN mc.outcome = 'positive' THEN 1 END) as positive_outcome_count,
    COUNT(CASE WHEN mc.outcome = 'negative' THEN 1 END) as negative_outcome_count,
    COUNT(CASE WHEN mc.outcome = 'neutral' THEN 1 END) as neutral_outcome_count,
    CASE WHEN COUNT(mc.id) > 0 THEN
      ROUND((COUNT(CASE WHEN mc.outcome = 'positive' THEN 1 END)::NUMERIC / COUNT(mc.id)) * 100, 1)
    ELSE NULL END as positive_outcome_rate,
    ROUND(AVG(m.sentiment_score), 3) as avg_sentiment,
    ROUND(AVG(m.talk_time_rep_pct), 1) as avg_talk_time,
    ROUND(AVG(m.coach_rating), 1) as avg_coach_rating
  FROM meetings m
  LEFT JOIN profiles p ON m.owner_user_id = p.id
  LEFT JOIN meeting_classifications mc ON mc.meeting_id = m.id
  WHERE m.org_id = p_org_id
    AND m.meeting_start >= v_start
    AND m.meeting_start < v_end
    AND m.meeting_start IS NOT NULL
    AND (p_user_id IS NULL OR m.owner_user_id = p_user_id)
  GROUP BY m.owner_user_id, p.first_name, p.last_name, p.email
  ORDER BY COUNT(m.id) DESC;
END;
$$;

COMMENT ON FUNCTION "public"."get_team_quality_signals"("p_org_id" "uuid", "p_period_days" integer, "p_user_id" "uuid", "p_start_date" date, "p_end_date" date)
  IS 'Returns meeting quality signals per rep. Supports explicit date range via p_start_date/p_end_date or rolling window via p_period_days.';

-- =============================================================================
-- 4. get_meetings_for_drill_down
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_meetings_for_drill_down"(
  "p_org_id" "uuid",
  "p_metric_type" "text",
  "p_period_days" integer DEFAULT 30,
  "p_user_id" "uuid" DEFAULT NULL::"uuid",
  "p_limit" integer DEFAULT 50,
  "p_start_date" date DEFAULT NULL,
  "p_end_date" date DEFAULT NULL
) RETURNS TABLE(
  "meeting_id" "uuid",
  "title" "text",
  "meeting_date" timestamp with time zone,
  "owner_user_id" "uuid",
  "owner_name" "text",
  "company_name" "text",
  "sentiment_score" numeric,
  "talk_time_pct" numeric,
  "outcome" "text",
  "has_forward_movement" boolean,
  "has_objection" boolean,
  "duration_minutes" numeric
)
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date::timestamptz;
    v_end   := (p_end_date + 1)::timestamptz;
  ELSE
    v_start := NOW() - (p_period_days || ' days')::interval;
    v_end   := NOW();
  END IF;

  RETURN QUERY
  SELECT
    m.id as meeting_id,
    m.title,
    m.meeting_start as meeting_date,
    m.owner_user_id,
    COALESCE(
      NULLIF(TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))), ''),
      p.email
    ) as owner_name,
    c.name as company_name,
    m.sentiment_score,
    m.talk_time_rep_pct as talk_time_pct,
    mc.outcome,
    mc.has_forward_movement,
    mc.has_objection,
    m.duration_minutes
  FROM meetings m
  LEFT JOIN profiles p ON m.owner_user_id = p.id
  LEFT JOIN companies c ON m.company_id = c.id
  LEFT JOIN meeting_classifications mc ON mc.meeting_id = m.id
  WHERE m.org_id = p_org_id
    AND m.meeting_start >= v_start
    AND m.meeting_start < v_end
    AND m.meeting_start IS NOT NULL
    AND (p_user_id IS NULL OR m.owner_user_id = p_user_id)
    AND (
      p_metric_type = 'all' OR
      (p_metric_type = 'positive_sentiment' AND m.sentiment_score > 0.2) OR
      (p_metric_type = 'negative_sentiment' AND m.sentiment_score < -0.2) OR
      (p_metric_type = 'forward_movement' AND mc.has_forward_movement = true) OR
      (p_metric_type = 'objection' AND mc.has_objection = true) OR
      (p_metric_type = 'positive_outcome' AND mc.outcome = 'positive') OR
      (p_metric_type = 'negative_outcome' AND mc.outcome = 'negative')
    )
  ORDER BY m.meeting_start DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION "public"."get_meetings_for_drill_down"("p_org_id" "uuid", "p_metric_type" "text", "p_period_days" integer, "p_user_id" "uuid", "p_limit" integer, "p_start_date" date, "p_end_date" date)
  IS 'Returns filtered meeting list for drill-down modal. Supports explicit date range via p_start_date/p_end_date or rolling window via p_period_days.';

-- =============================================================================
-- 5. get_team_comparison_matrix
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_team_comparison_matrix"(
  "p_org_id" "uuid",
  "p_period_days" integer DEFAULT 30,
  "p_start_date" date DEFAULT NULL,
  "p_end_date" date DEFAULT NULL
) RETURNS TABLE(
  "user_id" "uuid",
  "user_name" "text",
  "user_email" "text",
  "avatar_url" "text",
  "total_meetings" bigint,
  "avg_sentiment" numeric,
  "avg_talk_time" numeric,
  "avg_coach_rating" numeric,
  "forward_movement_rate" numeric,
  "positive_outcome_rate" numeric,
  "trend_data" "jsonb"
)
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date::timestamptz;
    v_end   := (p_end_date + 1)::timestamptz;
  ELSE
    v_start := NOW() - (p_period_days || ' days')::interval;
    v_end   := NOW();
  END IF;

  RETURN QUERY
  WITH rep_metrics AS (
    SELECT
      m.owner_user_id,
      COUNT(m.id) as total_meetings,
      AVG(m.sentiment_score) as avg_sentiment,
      AVG(m.talk_time_rep_pct) as avg_talk_time,
      AVG(m.coach_rating) as avg_coach_rating,
      CASE WHEN COUNT(mc.id) > 0 THEN
        ROUND((COUNT(CASE WHEN mc.has_forward_movement = true THEN 1 END)::NUMERIC / COUNT(mc.id)) * 100, 1)
      ELSE NULL END as forward_movement_rate,
      CASE WHEN COUNT(mc.id) > 0 THEN
        ROUND((COUNT(CASE WHEN mc.outcome = 'positive' THEN 1 END)::NUMERIC / COUNT(mc.id)) * 100, 1)
      ELSE NULL END as positive_outcome_rate
    FROM meetings m
    LEFT JOIN meeting_classifications mc ON mc.meeting_id = m.id
    WHERE m.org_id = p_org_id
      AND m.meeting_start >= v_start
      AND m.meeting_start < v_end
      AND m.meeting_start IS NOT NULL
    GROUP BY m.owner_user_id
  ),
  daily_trends AS (
    SELECT
      m.owner_user_id,
      DATE_TRUNC('day', m.meeting_start)::DATE as meeting_date,
      COUNT(*) as daily_count,
      ROUND(AVG(m.sentiment_score), 2) as daily_sentiment
    FROM meetings m
    WHERE m.org_id = p_org_id
      AND m.meeting_start >= v_start
      AND m.meeting_start < v_end
      AND m.meeting_start IS NOT NULL
    GROUP BY m.owner_user_id, DATE_TRUNC('day', m.meeting_start)::DATE
  ),
  aggregated_trends AS (
    SELECT
      owner_user_id,
      jsonb_agg(
        jsonb_build_object(
          'date', meeting_date::TEXT,
          'count', daily_count,
          'sentiment', daily_sentiment
        ) ORDER BY meeting_date
      ) as trend_data
    FROM daily_trends
    GROUP BY owner_user_id
  )
  SELECT
    rm.owner_user_id as user_id,
    COALESCE(
      NULLIF(TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))), ''),
      p.email
    ) as user_name,
    p.email as user_email,
    p.avatar_url,
    rm.total_meetings,
    ROUND(rm.avg_sentiment, 3),
    ROUND(rm.avg_talk_time, 1),
    ROUND(rm.avg_coach_rating, 1),
    rm.forward_movement_rate,
    rm.positive_outcome_rate,
    COALESCE(at.trend_data, '[]'::jsonb) as trend_data
  FROM rep_metrics rm
  LEFT JOIN profiles p ON rm.owner_user_id = p.id
  LEFT JOIN aggregated_trends at ON at.owner_user_id = rm.owner_user_id
  ORDER BY rm.total_meetings DESC;
END;
$$;

COMMENT ON FUNCTION "public"."get_team_comparison_matrix"("p_org_id" "uuid", "p_period_days" integer, "p_start_date" date, "p_end_date" date)
  IS 'Returns all reps with metrics for comparison table. Supports explicit date range via p_start_date/p_end_date or rolling window via p_period_days.';
