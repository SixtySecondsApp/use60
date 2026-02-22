-- ============================================================================
-- Migration: Agent Config Questions & Completeness Tracking
-- Purpose: Progressive learning system — contextual question queue with
--          trigger-based delivery and configuration completeness scoring
-- Story: LEARN-001 (PRD-23 Revised: Progressive Agent Learning)
-- Date: 2026-02-23
-- ============================================================================

-- ============================================================================
-- TABLE: agent_config_question_templates
-- Master templates for contextual questions — seeded once, copied to orgs
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_config_question_templates (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key   TEXT NOT NULL UNIQUE,
  question_template TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  trigger_condition JSONB NOT NULL DEFAULT '{}',
  priority     INTEGER NOT NULL DEFAULT 50,
  category     TEXT NOT NULL,
  scope        TEXT NOT NULL DEFAULT 'org' CHECK (scope IN ('org', 'user')),
  options      JSONB,  -- Pre-defined answer options for button rendering
  default_value JSONB, -- Default value if user never answers
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_config_question_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to question templates"
ON agent_config_question_templates FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read question templates"
ON agent_config_question_templates FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON agent_config_question_templates TO authenticated;
GRANT ALL ON agent_config_question_templates TO service_role;

COMMENT ON TABLE agent_config_question_templates IS 'Master templates for contextual configuration questions. Seeded at platform level, copied to agent_config_questions per org/user.';

-- ============================================================================
-- TABLE: agent_config_questions
-- Per-org/user question instances — tracks delivery and answer state
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_config_questions (
  id               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id           UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  template_id      UUID REFERENCES agent_config_question_templates (id),
  config_key       TEXT NOT NULL,
  question_text    TEXT NOT NULL,  -- Resolved from template (may have dynamic values)
  trigger_event    TEXT NOT NULL,
  trigger_condition JSONB NOT NULL DEFAULT '{}',
  priority         INTEGER NOT NULL DEFAULT 50,
  category         TEXT NOT NULL,
  scope            TEXT NOT NULL DEFAULT 'org' CHECK (scope IN ('org', 'user')),
  options          JSONB,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'asked', 'answered', 'skipped', 'expired')),
  delivery_channel TEXT CHECK (delivery_channel IN ('slack', 'in_app')),
  asked_at         TIMESTAMPTZ,
  answered_at      TIMESTAMPTZ,
  answer_value     JSONB,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_config_questions_unique UNIQUE (org_id, user_id, config_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_config_questions_org
  ON agent_config_questions (org_id);
CREATE INDEX IF NOT EXISTS idx_agent_config_questions_user
  ON agent_config_questions (org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_agent_config_questions_pending
  ON agent_config_questions (org_id, user_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_agent_config_questions_trigger
  ON agent_config_questions (trigger_event, status);

ALTER TABLE agent_config_questions ENABLE ROW LEVEL SECURITY;

-- Users can see and answer their own questions
CREATE POLICY "Users can read own config questions"
ON agent_config_questions FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    user_id IS NULL
    AND get_org_role(auth.uid(), org_id) IS NOT NULL
  )
);

-- Users can update their own questions (answer them)
CREATE POLICY "Users can update own config questions"
ON agent_config_questions FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    user_id IS NULL
    AND get_org_role(auth.uid(), org_id) IN ('owner', 'admin')
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR (
    user_id IS NULL
    AND get_org_role(auth.uid(), org_id) IN ('owner', 'admin')
  )
);

-- Service role full access (for seeding, trigger evaluation)
CREATE POLICY "Service role full access to config questions"
ON agent_config_questions FOR ALL
TO service_role
USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE ON agent_config_questions TO authenticated;
GRANT ALL ON agent_config_questions TO service_role;

COMMENT ON TABLE agent_config_questions IS 'Per-org/user contextual question instances. Tracks question delivery state, answers, and links to config engine.';
COMMENT ON COLUMN agent_config_questions.scope IS 'org = answer writes to agent_config_org_overrides, user = writes to agent_config_user_overrides.';
COMMENT ON COLUMN agent_config_questions.delivery_channel IS 'How the question was delivered — slack (Block Kit DM) or in_app (notification card).';

-- ============================================================================
-- TABLE: agent_config_question_log
-- Audit log for question delivery — tracks rate limiting
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_config_question_log (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  question_id  UUID NOT NULL REFERENCES agent_config_questions (id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('delivered', 'answered', 'skipped', 'expired', 'rate_limited')),
  channel      TEXT CHECK (channel IN ('slack', 'in_app')),
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_config_question_log_user_recent
  ON agent_config_question_log (org_id, user_id, created_at DESC);

ALTER TABLE agent_config_question_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own question log"
ON agent_config_question_log FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role full access to question log"
ON agent_config_question_log FOR ALL
TO service_role
USING (true) WITH CHECK (true);

GRANT SELECT ON agent_config_question_log TO authenticated;
GRANT ALL ON agent_config_question_log TO service_role;

-- ============================================================================
-- FUNCTION: get_config_completeness
-- Returns configuration completeness tier and percentage for an org/user
-- ============================================================================

CREATE OR REPLACE FUNCTION get_config_completeness(
  p_org_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_total_questions INTEGER;
  v_answered_questions INTEGER;
  v_auto_detected INTEGER;
  v_learned_items INTEGER;
  v_percentage NUMERIC;
  v_tier TEXT;
  v_categories JSONB;
BEGIN
  -- Count total and answered questions for this org/user
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'answered')
  INTO v_total_questions, v_answered_questions
  FROM agent_config_questions
  WHERE org_id = p_org_id
    AND (user_id = p_user_id OR (user_id IS NULL AND p_user_id IS NOT NULL) OR p_user_id IS NULL);

  -- Count org-level config overrides (auto-detected + bootstrap confirmed)
  SELECT COUNT(*)
  INTO v_auto_detected
  FROM agent_config_org_overrides
  WHERE org_id = p_org_id;

  -- Count user-level config overrides
  IF p_user_id IS NOT NULL THEN
    SELECT COUNT(*) + v_auto_detected
    INTO v_auto_detected
    FROM agent_config_user_overrides
    WHERE org_id = p_org_id AND user_id = p_user_id;
  END IF;

  -- Calculate percentage based on weighted scoring:
  -- Auto-detected configs (21 items max) = 40% weight
  -- Answered contextual questions (~20 items) = 50% weight
  -- Learned items (pattern recognition) = 10% weight (based on data volume)
  v_percentage := LEAST(100, (
    (LEAST(v_auto_detected, 21)::NUMERIC / 21.0 * 40) +
    (CASE WHEN v_total_questions > 0
      THEN (v_answered_questions::NUMERIC / v_total_questions * 50)
      ELSE 0 END) +
    (CASE WHEN v_auto_detected > 30 THEN 10 ELSE v_auto_detected::NUMERIC / 30.0 * 10 END)
  ));

  -- Determine tier
  v_tier := CASE
    WHEN v_percentage >= 90 THEN 'learning'
    WHEN v_percentage >= 70 THEN 'optimised'
    WHEN v_percentage >= 40 THEN 'tuned'
    ELSE 'functional'
  END;

  -- Category breakdown
  SELECT jsonb_object_agg(
    category,
    jsonb_build_object(
      'total', total,
      'answered', answered,
      'percentage', CASE WHEN total > 0 THEN ROUND(answered::NUMERIC / total * 100) ELSE 0 END
    )
  )
  INTO v_categories
  FROM (
    SELECT
      category,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'answered') AS answered
    FROM agent_config_questions
    WHERE org_id = p_org_id
      AND (user_id = p_user_id OR user_id IS NULL)
    GROUP BY category
  ) cats;

  RETURN jsonb_build_object(
    'tier', v_tier,
    'percentage', ROUND(v_percentage, 1),
    'total_questions', v_total_questions,
    'answered_questions', v_answered_questions,
    'auto_detected_configs', v_auto_detected,
    'categories', COALESCE(v_categories, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION get_config_completeness IS 'Returns configuration completeness tier (functional/tuned/optimised/learning) and percentage breakdown for an org/user.';

-- ============================================================================
-- FUNCTION: get_next_config_question
-- Returns the next eligible question for a user, respecting rate limits
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_config_question(
  p_org_id UUID,
  p_user_id UUID,
  p_trigger_event TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_last_asked TIMESTAMPTZ;
  v_question RECORD;
BEGIN
  -- Rate limit: check if a question was asked in the last 24 hours
  SELECT MAX(asked_at)
  INTO v_last_asked
  FROM agent_config_questions
  WHERE org_id = p_org_id
    AND (user_id = p_user_id OR user_id IS NULL)
    AND asked_at IS NOT NULL;

  IF v_last_asked IS NOT NULL AND v_last_asked > now() - interval '24 hours' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'rate_limited', 'next_eligible_at', (v_last_asked + interval '24 hours'));
  END IF;

  -- Find highest-priority pending question
  -- If trigger_event specified, filter to matching questions
  SELECT q.id, q.config_key, q.question_text, q.category, q.scope, q.options, q.priority
  INTO v_question
  FROM agent_config_questions q
  WHERE q.org_id = p_org_id
    AND (q.user_id = p_user_id OR q.user_id IS NULL)
    AND q.status = 'pending'
    AND (p_trigger_event IS NULL OR q.trigger_event = p_trigger_event)
    -- Skip questions where the config is already set
    AND NOT EXISTS (
      SELECT 1 FROM agent_config_org_overrides o
      WHERE o.org_id = q.org_id
        AND o.config_key = q.config_key
        AND q.scope = 'org'
    )
    AND NOT EXISTS (
      SELECT 1 FROM agent_config_user_overrides u
      WHERE u.org_id = q.org_id
        AND u.user_id = p_user_id
        AND u.config_key = q.config_key
        AND q.scope = 'user'
    )
  ORDER BY q.priority ASC, q.created_at ASC
  LIMIT 1;

  IF v_question IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_pending_questions');
  END IF;

  RETURN jsonb_build_object(
    'eligible', true,
    'question_id', v_question.id,
    'config_key', v_question.config_key,
    'question_text', v_question.question_text,
    'category', v_question.category,
    'scope', v_question.scope,
    'options', v_question.options,
    'priority', v_question.priority
  );
END;
$$;

COMMENT ON FUNCTION get_next_config_question IS 'Returns the next eligible contextual question for a user, respecting 24h rate limit and skipping already-configured items.';

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_config_completeness TO authenticated;
GRANT EXECUTE ON FUNCTION get_config_completeness TO service_role;
GRANT EXECUTE ON FUNCTION get_next_config_question TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_config_question TO service_role;
