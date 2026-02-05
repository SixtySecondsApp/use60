-- OI-014: Create ops_table_recipes schema and migration
-- Saved natural language recipes for Ops tables

-- Create recipe trigger_type enum
CREATE TYPE ops_recipe_trigger_type AS ENUM (
  'one_shot',
  'on_sync',
  'scheduled'
);

-- Create recipe run status enum
CREATE TYPE ops_recipe_run_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed'
);

-- Main recipes table
CREATE TABLE ops_table_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,

  -- Metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Original query and parsed config
  query_text TEXT NOT NULL,
  parsed_config JSONB NOT NULL,
  -- Stores the AI-parsed action type and parameters for replay

  -- Trigger configuration
  trigger_type ops_recipe_trigger_type NOT NULL DEFAULT 'one_shot',
  schedule_config JSONB DEFAULT '{}'::jsonb,
  -- For scheduled recipes: { "cron": "0 9 * * *", "timezone": "America/New_York" }

  -- Sharing
  is_shared BOOLEAN DEFAULT false,

  -- Usage tracking
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipe execution history
CREATE TABLE ops_table_recipe_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES ops_table_recipes(id) ON DELETE CASCADE,

  -- Execution context
  executed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status ops_recipe_run_status NOT NULL DEFAULT 'pending',

  -- Results
  result_summary TEXT,
  -- Human-readable summary of what happened

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_recipes_table_shared ON ops_table_recipes(table_id, is_shared);

CREATE INDEX idx_recipes_org_trigger ON ops_table_recipes(org_id, trigger_type)
  WHERE trigger_type != 'one_shot';

CREATE INDEX idx_recipe_runs_recipe ON ops_table_recipe_runs(recipe_id, started_at DESC);

-- RLS Policies
ALTER TABLE ops_table_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_table_recipe_runs ENABLE ROW LEVEL SECURITY;

-- Users can read recipes they created or shared recipes in their org
CREATE POLICY "Users can read accessible recipes"
  ON ops_table_recipes FOR SELECT
  USING (
    created_by = auth.uid()
    OR (
      is_shared = true
      AND org_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can create recipes
CREATE POLICY "Users can create recipes"
  ON ops_table_recipes FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Users can update own recipes
CREATE POLICY "Users can update own recipes"
  ON ops_table_recipes FOR UPDATE
  USING (created_by = auth.uid());

-- Users can delete own recipes
CREATE POLICY "Users can delete own recipes"
  ON ops_table_recipes FOR DELETE
  USING (created_by = auth.uid());

-- Users can read recipe runs for accessible recipes
CREATE POLICY "Users can read accessible recipe runs"
  ON ops_table_recipe_runs FOR SELECT
  USING (
    recipe_id IN (
      SELECT id FROM ops_table_recipes
      WHERE created_by = auth.uid()
        OR (
          is_shared = true
          AND org_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
          )
        )
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_ops_table_recipes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ops_table_recipes_updated_at
  BEFORE UPDATE ON ops_table_recipes
  FOR EACH ROW
  EXECUTE FUNCTION update_ops_table_recipes_updated_at();

-- Comments
COMMENT ON TABLE ops_table_recipes IS 'Saved reusable queries and automations for Ops tables';
COMMENT ON TABLE ops_table_recipe_runs IS 'Execution history for recipe runs';
COMMENT ON COLUMN ops_table_recipes.parsed_config IS 'AI-parsed action configuration for efficient replay';
COMMENT ON COLUMN ops_table_recipes.schedule_config IS 'Cron and timezone config for scheduled recipes';
