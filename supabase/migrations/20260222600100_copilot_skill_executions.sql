-- Copilot Skill Executions — tracks /skill command usage for analytics and debugging
-- Part of the @ Mentions & /Skills feature (SKILL-001)

CREATE TABLE IF NOT EXISTS copilot_skill_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_key TEXT NOT NULL,
  user_id UUID NOT NULL,
  org_id UUID NOT NULL,
  entities_referenced JSONB DEFAULT '[]'::jsonb,
  input_text TEXT,
  output_text TEXT,
  execution_time_ms INTEGER,
  credits_charged INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skill_executions_user ON copilot_skill_executions (user_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_org ON copilot_skill_executions (org_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_skill ON copilot_skill_executions (skill_key);
CREATE INDEX IF NOT EXISTS idx_skill_executions_created ON copilot_skill_executions (created_at DESC);

-- RLS
ALTER TABLE copilot_skill_executions ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own org's executions
DO $$ BEGIN
  CREATE POLICY "Users can insert own skill executions"
  ON copilot_skill_executions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can read own org skill executions"
  ON copilot_skill_executions FOR SELECT
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
