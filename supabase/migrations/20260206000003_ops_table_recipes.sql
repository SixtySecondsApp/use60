-- OI-014: Ops Table Recipes Schema
CREATE TABLE IF NOT EXISTS ops_table_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  query_text TEXT NOT NULL,
  parsed_config JSONB NOT NULL,
  trigger_type TEXT DEFAULT 'one_shot' CHECK (trigger_type IN ('one_shot', 'on_sync', 'scheduled')),
  is_shared BOOLEAN DEFAULT false,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ops_recipes_table ON ops_table_recipes(table_id);
CREATE INDEX idx_ops_recipes_shared ON ops_table_recipes(table_id) WHERE is_shared = true;
ALTER TABLE ops_table_recipes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view recipes in their org" ON ops_table_recipes FOR SELECT
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create recipes in their org" ON ops_table_recipes FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update recipes in their org" ON ops_table_recipes FOR UPDATE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete recipes in their org" ON ops_table_recipes FOR DELETE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
