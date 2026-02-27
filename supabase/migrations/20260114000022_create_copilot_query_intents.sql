-- Migration: Create copilot_query_intents table
-- Purpose: Track popular queries platform-wide, identify skill coverage gaps
-- Part of: Copilot Lab AI Skill Builder feature

-- Drop if exists (for re-running during development)
DROP TABLE IF EXISTS copilot_query_intents CASCADE;

-- Create the query intents table
CREATE TABLE copilot_query_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Intent classification
  intent_category TEXT NOT NULL,                -- 'meeting-prep', 'deal-analysis', 'follow-up', etc.
  normalized_query TEXT NOT NULL,               -- Cleaned/normalized version for deduplication
  example_queries JSONB DEFAULT '[]'::jsonb,    -- Sample original queries (up to 10)

  -- Usage metrics
  query_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),

  -- Skill matching
  matched_skill_key TEXT,                       -- If we have a skill for this intent
  skill_match_confidence NUMERIC(3,2),          -- 0.00-1.00 confidence score
  is_covered BOOLEAN GENERATED ALWAYS AS (matched_skill_key IS NOT NULL AND skill_match_confidence >= 0.7) STORED,

  -- Success metrics
  total_executions INTEGER DEFAULT 0,           -- How many times intent was executed
  successful_executions INTEGER DEFAULT 0,      -- How many succeeded
  success_rate NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_executions > 0
      THEN ROUND((successful_executions::NUMERIC / total_executions) * 100, 2)
      ELSE NULL
    END
  ) STORED,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint on normalized query to enable upsert
  CONSTRAINT copilot_query_intents_normalized_query_unique UNIQUE (normalized_query)
);

-- Indexes for efficient querying
CREATE INDEX idx_query_intents_category ON copilot_query_intents(intent_category);
CREATE INDEX idx_query_intents_query_count ON copilot_query_intents(query_count DESC);
CREATE INDEX idx_query_intents_last_seen ON copilot_query_intents(last_seen_at DESC);
CREATE INDEX idx_query_intents_is_covered ON copilot_query_intents(is_covered);
CREATE INDEX idx_query_intents_matched_skill ON copilot_query_intents(matched_skill_key) WHERE matched_skill_key IS NOT NULL;

-- GIN index for searching example queries
CREATE INDEX idx_query_intents_examples ON copilot_query_intents USING GIN (example_queries);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_query_intents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_query_intents_updated_at
  BEFORE UPDATE ON copilot_query_intents
  FOR EACH ROW
  EXECUTE FUNCTION update_query_intents_updated_at();

-- RLS Policies
ALTER TABLE copilot_query_intents ENABLE ROW LEVEL SECURITY;

-- Platform-wide visibility: All authenticated users can read
DO $$ BEGIN
  CREATE POLICY "Authenticated users can view query intents"
  ON copilot_query_intents
  FOR SELECT
  TO authenticated
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only service role can insert/update (edge functions)
DO $$ BEGIN
  CREATE POLICY "Service role can manage query intents"
  ON copilot_query_intents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Helper function to upsert query intent
CREATE OR REPLACE FUNCTION upsert_query_intent(
  p_intent_category TEXT,
  p_normalized_query TEXT,
  p_original_query TEXT,
  p_matched_skill_key TEXT DEFAULT NULL,
  p_skill_match_confidence NUMERIC DEFAULT NULL,
  p_was_successful BOOLEAN DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_examples JSONB;
BEGIN
  -- Get existing examples or empty array
  SELECT example_queries INTO v_examples
  FROM copilot_query_intents
  WHERE normalized_query = p_normalized_query;

  -- Add new example if not already present and under limit
  IF v_examples IS NULL THEN
    v_examples = jsonb_build_array(p_original_query);
  ELSIF NOT v_examples ? p_original_query AND jsonb_array_length(v_examples) < 10 THEN
    v_examples = v_examples || jsonb_build_array(p_original_query);
  END IF;

  -- Upsert the intent
  INSERT INTO copilot_query_intents (
    intent_category,
    normalized_query,
    example_queries,
    matched_skill_key,
    skill_match_confidence,
    total_executions,
    successful_executions
  )
  VALUES (
    p_intent_category,
    p_normalized_query,
    v_examples,
    p_matched_skill_key,
    p_skill_match_confidence,
    CASE WHEN p_was_successful IS NOT NULL THEN 1 ELSE 0 END,
    CASE WHEN p_was_successful = true THEN 1 ELSE 0 END
  )
  ON CONFLICT (normalized_query) DO UPDATE SET
    query_count = copilot_query_intents.query_count + 1,
    last_seen_at = now(),
    example_queries = v_examples,
    matched_skill_key = COALESCE(EXCLUDED.matched_skill_key, copilot_query_intents.matched_skill_key),
    skill_match_confidence = COALESCE(EXCLUDED.skill_match_confidence, copilot_query_intents.skill_match_confidence),
    total_executions = copilot_query_intents.total_executions +
      CASE WHEN p_was_successful IS NOT NULL THEN 1 ELSE 0 END,
    successful_executions = copilot_query_intents.successful_executions +
      CASE WHEN p_was_successful = true THEN 1 ELSE 0 END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get trending queries (most popular uncovered intents)
CREATE OR REPLACE FUNCTION get_trending_query_gaps(
  p_limit INTEGER DEFAULT 10,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID,
  intent_category TEXT,
  normalized_query TEXT,
  example_queries JSONB,
  query_count INTEGER,
  last_seen_at TIMESTAMPTZ,
  matched_skill_key TEXT,
  skill_match_confidence NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qi.id,
    qi.intent_category,
    qi.normalized_query,
    qi.example_queries,
    qi.query_count,
    qi.last_seen_at,
    qi.matched_skill_key,
    qi.skill_match_confidence
  FROM copilot_query_intents qi
  WHERE qi.is_covered = false
    AND qi.last_seen_at >= now() - (p_days || ' days')::interval
  ORDER BY qi.query_count DESC, qi.last_seen_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get coverage statistics
CREATE OR REPLACE FUNCTION get_query_coverage_stats(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_intents BIGINT,
  covered_intents BIGINT,
  uncovered_intents BIGINT,
  coverage_percentage NUMERIC,
  total_queries BIGINT,
  covered_queries BIGINT,
  uncovered_queries BIGINT,
  queries_coverage_percentage NUMERIC,
  categories JSONB
) AS $$
DECLARE
  v_categories JSONB;
BEGIN
  -- Get category breakdown
  SELECT jsonb_agg(cat_stats ORDER BY cat_stats->>'query_count' DESC)
  INTO v_categories
  FROM (
    SELECT jsonb_build_object(
      'category', intent_category,
      'total_intents', COUNT(*),
      'covered_intents', COUNT(*) FILTER (WHERE is_covered),
      'query_count', SUM(query_count)
    ) as cat_stats
    FROM copilot_query_intents
    WHERE last_seen_at >= now() - (p_days || ' days')::interval
    GROUP BY intent_category
  ) sub;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_intents,
    COUNT(*) FILTER (WHERE qi.is_covered)::BIGINT as covered_intents,
    COUNT(*) FILTER (WHERE NOT qi.is_covered)::BIGINT as uncovered_intents,
    ROUND(
      (COUNT(*) FILTER (WHERE qi.is_covered)::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
      1
    ) as coverage_percentage,
    SUM(qi.query_count)::BIGINT as total_queries,
    SUM(qi.query_count) FILTER (WHERE qi.is_covered)::BIGINT as covered_queries,
    SUM(qi.query_count) FILTER (WHERE NOT qi.is_covered)::BIGINT as uncovered_queries,
    ROUND(
      (SUM(qi.query_count) FILTER (WHERE qi.is_covered)::NUMERIC / NULLIF(SUM(qi.query_count), 0)) * 100,
      1
    ) as queries_coverage_percentage,
    COALESCE(v_categories, '[]'::jsonb) as categories
  FROM copilot_query_intents qi
  WHERE qi.last_seen_at >= now() - (p_days || ' days')::interval;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION upsert_query_intent TO service_role;
GRANT EXECUTE ON FUNCTION get_trending_query_gaps TO authenticated;
GRANT EXECUTE ON FUNCTION get_query_coverage_stats TO authenticated;

-- Add comment
COMMENT ON TABLE copilot_query_intents IS 'Platform-wide tracking of copilot query intents for analytics and skill gap identification';
