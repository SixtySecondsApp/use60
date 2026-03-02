-- =============================================================================
-- Dynamic Table Views
-- Saved filter/sort/column visibility presets per table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dynamic_table_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  filter_config JSONB DEFAULT '[]'::jsonb,
  sort_config JSONB,
  column_config JSONB,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_view_name_per_user_table UNIQUE(table_id, created_by, name)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_dynamic_table_views_table_id
  ON public.dynamic_table_views(table_id, position);

CREATE INDEX IF NOT EXISTS idx_dynamic_table_views_created_by
  ON public.dynamic_table_views(created_by);

-- =============================================================================
-- Updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_dynamic_table_views_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dynamic_table_views_updated_at
  BEFORE UPDATE ON public.dynamic_table_views
  FOR EACH ROW
  EXECUTE FUNCTION update_dynamic_table_views_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.dynamic_table_views ENABLE ROW LEVEL SECURITY;

-- Users can read their own views + system views for tables in their org
DO $$ BEGIN
  CREATE POLICY "Users can view own and system views"
  ON public.dynamic_table_views
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR (
      is_system = TRUE
      AND table_id IN (
        SELECT id FROM public.dynamic_tables
        WHERE organization_id IN (
          SELECT org_id FROM public.organization_memberships
          WHERE user_id = auth.uid()
        )
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can create views for tables in their org
DO $$ BEGIN
  CREATE POLICY "Users can create views"
  ON public.dynamic_table_views
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND table_id IN (
      SELECT id FROM public.dynamic_tables
      WHERE organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can update their own views
DO $$ BEGIN
  CREATE POLICY "Users can update own views"
  ON public.dynamic_table_views
  FOR UPDATE
  USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can delete their own non-system views
DO $$ BEGIN
  CREATE POLICY "Users can delete own non-system views"
  ON public.dynamic_table_views
  FOR DELETE
  USING (created_by = auth.uid() AND is_system = FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Service role policies (for edge functions creating system views)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dynamic_table_views'
    AND policyname = 'Service role full access to views'
  ) THEN
    CREATE POLICY "Service role full access to views"
      ON public.dynamic_table_views
      FOR ALL
      TO service_role
      USING (TRUE)
      WITH CHECK (TRUE);
  END IF;
END $$;
