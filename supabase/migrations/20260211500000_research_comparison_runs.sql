-- Create research_comparison_runs table for Gemini vs Exa comparison demo
CREATE TABLE research_comparison_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  domain TEXT NOT NULL,
  company_name TEXT,

  -- Gemini results
  gemini_result JSONB,
  gemini_cost NUMERIC(10, 6),
  gemini_duration_ms INTEGER,
  gemini_fields_populated INTEGER,
  gemini_completeness NUMERIC(5, 2),
  gemini_error TEXT,

  -- Exa results
  exa_result JSONB,
  exa_cost NUMERIC(10, 6),
  exa_duration_ms INTEGER,
  exa_fields_populated INTEGER,
  exa_completeness NUMERIC(5, 2),
  exa_error TEXT,

  -- Comparison
  winner TEXT CHECK (winner IN ('gemini', 'exa', 'tie', 'both_failed')),
  quality_score_gemini NUMERIC(5, 2),
  quality_score_exa NUMERIC(5, 2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE research_comparison_runs ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can read own org runs
DO $$ BEGIN
  CREATE POLICY "Users can read own org runs"
  ON research_comparison_runs FOR SELECT
  USING (
    organization_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS policy: Users can insert own org runs
DO $$ BEGIN
  CREATE POLICY "Users can insert own org runs"
  ON research_comparison_runs FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for performance
CREATE INDEX idx_research_comparison_runs_org_created
  ON research_comparison_runs(organization_id, created_at DESC);

-- Add feature flag for research provider selection
INSERT INTO app_settings (key, value, description)
VALUES (
  'research_provider',
  '"disabled"',
  'Active research provider: gemini | exa | disabled'
)
ON CONFLICT (key) DO NOTHING;
