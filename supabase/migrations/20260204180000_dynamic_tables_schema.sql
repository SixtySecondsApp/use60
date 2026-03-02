-- Migration: Dynamic Tables — Core Schema
-- Purpose: Foundation tables for the Dynamic Tables feature: table definitions and column definitions.
-- Date: 2026-02-04

-- =============================================================================
-- dynamic_tables — Each row is a user-created data table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dynamic_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'apollo', 'csv', 'copilot')),
  source_query JSONB,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_table_name_per_org UNIQUE(organization_id, name)
);

COMMENT ON TABLE public.dynamic_tables IS 'User-created dynamic data tables for lead enrichment and prospecting workflows.';
COMMENT ON COLUMN public.dynamic_tables.source_type IS 'How the table was created: manual, apollo search, csv import, or copilot conversation.';
COMMENT ON COLUMN public.dynamic_tables.source_query IS 'Original query/params used to populate the table (e.g. Apollo search filters).';
COMMENT ON COLUMN public.dynamic_tables.row_count IS 'Denormalized row count for list view performance.';

-- =============================================================================
-- dynamic_table_columns — Column definitions per table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dynamic_table_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  column_type TEXT NOT NULL DEFAULT 'text' CHECK (column_type IN ('text', 'email', 'url', 'number', 'boolean', 'enrichment', 'status', 'person', 'company', 'linkedin', 'date')),
  is_enrichment BOOLEAN NOT NULL DEFAULT FALSE,
  enrichment_prompt TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 160,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_column_key_per_table UNIQUE(table_id, key)
);

COMMENT ON TABLE public.dynamic_table_columns IS 'Column definitions for dynamic tables. Supports standard data types and AI enrichment columns.';
COMMENT ON COLUMN public.dynamic_table_columns.enrichment_prompt IS 'Natural language prompt for AI enrichment (e.g. "Find their most recent LinkedIn post").';
COMMENT ON COLUMN public.dynamic_table_columns.position IS 'Display order of column in table (0-indexed).';

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_dynamic_tables_org_id ON public.dynamic_tables(organization_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_tables_created_by ON public.dynamic_tables(created_by);
CREATE INDEX IF NOT EXISTS idx_dynamic_tables_updated_at ON public.dynamic_tables(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dynamic_table_columns_table_id ON public.dynamic_table_columns(table_id, position);

-- =============================================================================
-- Updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_dynamic_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dynamic_tables_updated_at
  BEFORE UPDATE ON public.dynamic_tables
  FOR EACH ROW
  EXECUTE FUNCTION update_dynamic_tables_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.dynamic_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_columns ENABLE ROW LEVEL SECURITY;

-- dynamic_tables: Users can see tables in their org
DO $$ BEGIN
  CREATE POLICY "Users can view org dynamic tables"
  ON public.dynamic_tables
  FOR SELECT
  USING (
    organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- dynamic_tables: Users can create tables in their org
DO $$ BEGIN
  CREATE POLICY "Users can create dynamic tables"
  ON public.dynamic_tables
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- dynamic_tables: Users can update their own tables
DO $$ BEGIN
  CREATE POLICY "Users can update own dynamic tables"
  ON public.dynamic_tables
  FOR UPDATE
  USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- dynamic_tables: Users can delete their own tables
DO $$ BEGIN
  CREATE POLICY "Users can delete own dynamic tables"
  ON public.dynamic_tables
  FOR DELETE
  USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- dynamic_table_columns: Inherit access from parent table
DO $$ BEGIN
  CREATE POLICY "Users can view columns of accessible tables"
  ON public.dynamic_table_columns
  FOR SELECT
  USING (
    table_id IN (
      SELECT id FROM public.dynamic_tables
      WHERE organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can manage columns of own tables"
  ON public.dynamic_table_columns
  FOR ALL
  USING (
    table_id IN (
      SELECT id FROM public.dynamic_tables
      WHERE created_by = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Service role policies (for edge functions)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dynamic_tables' AND policyname = 'Service role full access to dynamic_tables'
  ) THEN
    CREATE POLICY "Service role full access to dynamic_tables"
      ON public.dynamic_tables
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dynamic_table_columns' AND policyname = 'Service role full access to dynamic_table_columns'
  ) THEN
    CREATE POLICY "Service role full access to dynamic_table_columns"
      ON public.dynamic_table_columns
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- =============================================================================
-- Notify PostgREST
-- =============================================================================

NOTIFY pgrst, 'reload schema';
