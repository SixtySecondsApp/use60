-- Normalize coach_rating values from 0-100 scale to 1-10 scale
--
-- Root cause: process-recording wrote coach_rating on 0-100 scale (e.g. 70 for "good")
-- while fathom-sync writes on 1-10 scale (e.g. 7 for "good").
-- The DB constraint allows 0-100 but the frontend displays "/10".
-- This migration normalizes all values > 10 by dividing by 10.

-- Step 1: Fix meetings table
UPDATE meetings
SET coach_rating = ROUND(coach_rating / 10.0, 1)
WHERE coach_rating > 10;

-- Step 2: Fix recordings table
UPDATE recordings
SET coach_rating = ROUND(coach_rating / 10.0, 1)
WHERE coach_rating > 10;

-- Step 3: (Removed - meeting_metrics has no coach_rating column)

-- Step 4: Tighten the constraint on meetings to prevent future 0-100 values
-- Drop old constraint and add new one (1-10 scale)
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS "meetings_coach_rating_check";
ALTER TABLE meetings ADD CONSTRAINT "meetings_coach_rating_check"
  CHECK (coach_rating >= 0 AND coach_rating <= 10);

-- Step 5: Update the team analytics RPC to normalize as a safety net
-- (in case any edge case writes a value > 10 before the constraint catches it)
CREATE OR REPLACE FUNCTION get_team_aggregates_with_comparison(
  p_org_id uuid,
  p_period_days integer DEFAULT 30,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
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
    v_current_end   := (p_end_date + 1)::timestamptz;
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
      AVG(LEAST(m.coach_rating, 10)) as avg_coach_rating,
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
      AVG(LEAST(m.coach_rating, 10)) as avg_coach_rating,
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
    CASE WHEN pp.avg_sentiment IS NOT NULL AND pp.avg_sentiment != 0 THEN
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
