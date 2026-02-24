-- LAB-004, LAB-005: Create tables for Prompt Library and Response Grading

-- ============================================================================
-- LAB-004: Prompt Library Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS copilot_prompt_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Prompt details
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  
  -- Expected behavior
  expected_response_type TEXT,
  expected_sequence_key TEXT,
  expected_actions TEXT[],
  
  -- Test results
  last_run_at TIMESTAMPTZ,
  last_run_success BOOLEAN,
  last_run_response_type TEXT,
  last_run_duration_ms INTEGER,
  
  -- Metadata
  is_regression_test BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false, -- Share across org
  run_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prompt_library_org 
  ON copilot_prompt_library(organization_id);

CREATE INDEX IF NOT EXISTS idx_prompt_library_created_by 
  ON copilot_prompt_library(created_by);

CREATE INDEX IF NOT EXISTS idx_prompt_library_tags 
  ON copilot_prompt_library USING GIN(tags);

-- RLS
ALTER TABLE copilot_prompt_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own prompts"
  ON copilot_prompt_library FOR SELECT
  USING (auth.uid() = created_by OR is_public = true);

CREATE POLICY "Users can insert own prompts"
  ON copilot_prompt_library FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own prompts"
  ON copilot_prompt_library FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own prompts"
  ON copilot_prompt_library FOR DELETE
  USING (auth.uid() = created_by);

-- ============================================================================
-- LAB-005: Response Grades Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS copilot_response_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  graded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Reference to the graded message
  message_id UUID,
  conversation_id UUID,
  prompt_library_id UUID REFERENCES copilot_prompt_library(id) ON DELETE SET NULL,
  
  -- The content being graded
  user_prompt TEXT NOT NULL,
  assistant_response TEXT NOT NULL,
  response_type TEXT,
  sequence_key TEXT,
  
  -- Grades (1-5 scale)
  accuracy_score INTEGER CHECK (accuracy_score BETWEEN 1 AND 5),
  helpfulness_score INTEGER CHECK (helpfulness_score BETWEEN 1 AND 5),
  tone_score INTEGER CHECK (tone_score BETWEEN 1 AND 5),
  actionability_score INTEGER CHECK (actionability_score BETWEEN 1 AND 5),
  
  -- Aggregate
  overall_score NUMERIC(3,2) GENERATED ALWAYS AS (
    (COALESCE(accuracy_score, 0) + COALESCE(helpfulness_score, 0) + 
     COALESCE(tone_score, 0) + COALESCE(actionability_score, 0)) / 
    NULLIF(
      (CASE WHEN accuracy_score IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN helpfulness_score IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN tone_score IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN actionability_score IS NOT NULL THEN 1 ELSE 0 END), 0
    )
  ) STORED,
  
  -- Feedback
  feedback_text TEXT,
  is_positive BOOLEAN,
  
  -- Metadata
  execution_duration_ms INTEGER,
  token_count INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_response_grades_org 
  ON copilot_response_grades(organization_id);

CREATE INDEX IF NOT EXISTS idx_response_grades_message 
  ON copilot_response_grades(message_id);

CREATE INDEX IF NOT EXISTS idx_response_grades_prompt 
  ON copilot_response_grades(prompt_library_id);

CREATE INDEX IF NOT EXISTS idx_response_grades_created 
  ON copilot_response_grades(created_at DESC);

-- RLS
ALTER TABLE copilot_response_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own grades"
  ON copilot_response_grades FOR SELECT
  USING (auth.uid() = graded_by);

CREATE POLICY "Admins can read org grades"
  ON copilot_response_grades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      JOIN profiles p ON p.id = om.user_id
      WHERE om.org_id = copilot_response_grades.organization_id
        AND om.user_id = auth.uid()
        AND p.is_admin = true
    )
  );

CREATE POLICY "Users can insert own grades"
  ON copilot_response_grades FOR INSERT
  WITH CHECK (auth.uid() = graded_by);

-- ============================================================================
-- Aggregate View for Quality Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW copilot_quality_summary AS
SELECT 
  organization_id,
  DATE_TRUNC('day', created_at) AS grade_date,
  COUNT(*) AS total_grades,
  AVG(overall_score) AS avg_overall_score,
  AVG(accuracy_score) AS avg_accuracy,
  AVG(helpfulness_score) AS avg_helpfulness,
  AVG(tone_score) AS avg_tone,
  AVG(actionability_score) AS avg_actionability,
  COUNT(*) FILTER (WHERE is_positive = true) AS positive_count,
  COUNT(*) FILTER (WHERE is_positive = false) AS negative_count,
  COUNT(DISTINCT sequence_key) FILTER (WHERE sequence_key IS NOT NULL) AS sequences_graded
FROM copilot_response_grades
GROUP BY organization_id, DATE_TRUNC('day', created_at);

-- Comments
COMMENT ON TABLE copilot_prompt_library IS 
  'Library of saved test prompts for regression testing and quick access';

COMMENT ON TABLE copilot_response_grades IS 
  'User ratings of AI response quality for optimization';
