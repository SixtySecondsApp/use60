-- Migration: Dynamic Tables — Rows & Cells
-- Purpose: Row and cell storage for dynamic tables with cascade deletes and RLS.
-- Date: 2026-02-04

-- =============================================================================
-- dynamic_table_rows — Each row in a dynamic table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dynamic_table_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  source_id TEXT,
  source_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.dynamic_table_rows IS 'Individual rows within a dynamic table. source_id links to external system IDs (e.g. Apollo contact ID).';
COMMENT ON COLUMN public.dynamic_table_rows.source_id IS 'External system identifier (Apollo contact ID, CSV row hash, etc).';
COMMENT ON COLUMN public.dynamic_table_rows.source_data IS 'Raw data from the source system for reference/re-enrichment.';

-- =============================================================================
-- dynamic_table_cells — Individual cell values
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dynamic_table_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id UUID NOT NULL REFERENCES public.dynamic_table_rows(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES public.dynamic_table_columns(id) ON DELETE CASCADE,
  value TEXT,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source TEXT,
  status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'pending', 'complete', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_cell_per_row_column UNIQUE(row_id, column_id)
);

COMMENT ON TABLE public.dynamic_table_cells IS 'Individual cell values. Enrichment cells include confidence scores and source attribution.';
COMMENT ON COLUMN public.dynamic_table_cells.confidence IS 'AI enrichment confidence score 0.0-1.0. NULL for manually entered values.';
COMMENT ON COLUMN public.dynamic_table_cells.source IS 'Attribution for enriched values (e.g. "linkedin_profile", "google_search", "apollo").';

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_table_id ON public.dynamic_table_rows(table_id, row_index);
CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_source_id ON public.dynamic_table_rows(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dynamic_table_cells_row_id ON public.dynamic_table_cells(row_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_table_cells_column_id ON public.dynamic_table_cells(column_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_table_cells_status ON public.dynamic_table_cells(status) WHERE status != 'none';

-- =============================================================================
-- Updated_at trigger for cells
-- =============================================================================

CREATE OR REPLACE FUNCTION update_dynamic_table_cells_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dynamic_table_cells_updated_at
  BEFORE UPDATE ON public.dynamic_table_cells
  FOR EACH ROW
  EXECUTE FUNCTION update_dynamic_table_cells_updated_at();

-- =============================================================================
-- Row count trigger — keep dynamic_tables.row_count in sync
-- =============================================================================

CREATE OR REPLACE FUNCTION update_dynamic_table_row_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.dynamic_tables SET row_count = row_count + 1 WHERE id = NEW.table_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.dynamic_tables SET row_count = GREATEST(row_count - 1, 0) WHERE id = OLD.table_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dynamic_table_row_count
  AFTER INSERT OR DELETE ON public.dynamic_table_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_dynamic_table_row_count();

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.dynamic_table_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_cells ENABLE ROW LEVEL SECURITY;

-- Rows: Inherit access from parent table
DO $$ BEGIN
  CREATE POLICY "Users can view rows of accessible tables"
  ON public.dynamic_table_rows
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
  CREATE POLICY "Users can manage rows of own tables"
  ON public.dynamic_table_rows
  FOR ALL
  USING (
    table_id IN (
      SELECT id FROM public.dynamic_tables
      WHERE created_by = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Cells: Inherit access from parent row → parent table
DO $$ BEGIN
  CREATE POLICY "Users can view cells of accessible tables"
  ON public.dynamic_table_cells
  FOR SELECT
  USING (
    row_id IN (
      SELECT r.id FROM public.dynamic_table_rows r
      JOIN public.dynamic_tables t ON r.table_id = t.id
      WHERE t.organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can manage cells of own tables"
  ON public.dynamic_table_cells
  FOR ALL
  USING (
    row_id IN (
      SELECT r.id FROM public.dynamic_table_rows r
      JOIN public.dynamic_tables t ON r.table_id = t.id
      WHERE t.created_by = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dynamic_table_rows' AND policyname = 'Service role full access to dynamic_table_rows'
  ) THEN
    CREATE POLICY "Service role full access to dynamic_table_rows"
      ON public.dynamic_table_rows FOR ALL USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dynamic_table_cells' AND policyname = 'Service role full access to dynamic_table_cells'
  ) THEN
    CREATE POLICY "Service role full access to dynamic_table_cells"
      ON public.dynamic_table_cells FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- =============================================================================
NOTIFY pgrst, 'reload schema';
