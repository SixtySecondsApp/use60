-- Migration: SOT-006 — Sync Conflict Resolution
-- Purpose: Add conflict detection and audit trail for multi-source sync collisions,
--          supporting last-writer-wins resolution strategy with full audit history.
-- Date: 2026-02-18

-- =============================================================================
-- Step 1: Add conflict tracking columns to dynamic_table_cells
-- =============================================================================

ALTER TABLE public.dynamic_table_cells ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.dynamic_table_cells.source_updated_at IS
  'Timestamp when this value was last updated from a CRM/external source. Used for last-writer-wins conflict resolution.';

ALTER TABLE public.dynamic_table_cells ADD COLUMN IF NOT EXISTS last_source TEXT;

COMMENT ON COLUMN public.dynamic_table_cells.last_source IS
  'Source system of the last update: hubspot, attio, app, or manual. Used to identify which system won a conflict.';

-- =============================================================================
-- Step 2: Create ops_sync_conflicts audit table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ops_sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id UUID NOT NULL REFERENCES public.dynamic_table_cells(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  column_key TEXT NOT NULL,
  row_source_id TEXT,
  app_value TEXT,
  crm_value TEXT,
  crm_source TEXT NOT NULL CHECK (crm_source IN ('hubspot', 'attio', 'app', 'manual')),
  winner TEXT NOT NULL CHECK (winner IN ('app', 'crm')),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by TEXT NOT NULL DEFAULT 'auto_last_writer_wins',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ops_sync_conflicts IS
  'Audit trail for sync conflicts when both app and CRM sources update the same cell. Resolved via last-writer-wins strategy.';

COMMENT ON COLUMN public.ops_sync_conflicts.cell_id IS
  'Reference to the dynamic_table_cell that experienced the conflict.';

COMMENT ON COLUMN public.ops_sync_conflicts.table_id IS
  'Reference to the dynamic_table for org-scoped RLS access.';

COMMENT ON COLUMN public.ops_sync_conflicts.column_key IS
  'Column key that experienced the conflict (e.g., email, phone, status).';

COMMENT ON COLUMN public.ops_sync_conflicts.row_source_id IS
  'External source ID if applicable (e.g., hubspot_deal_id, attio_record_id). Null for manual rows.';

COMMENT ON COLUMN public.ops_sync_conflicts.app_value IS
  'Value that was in the app at the time of conflict (may be null).';

COMMENT ON COLUMN public.ops_sync_conflicts.crm_value IS
  'Value coming from the CRM source.';

COMMENT ON COLUMN public.ops_sync_conflicts.crm_source IS
  'Source system of the incoming update: hubspot, attio, app, or manual.';

COMMENT ON COLUMN public.ops_sync_conflicts.winner IS
  'Which value won the conflict: app (existing) or crm (incoming).';

COMMENT ON COLUMN public.ops_sync_conflicts.resolved_by IS
  'Resolution strategy used. Currently always auto_last_writer_wins.';

-- =============================================================================
-- Step 3: Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ops_sync_conflicts_table ON public.ops_sync_conflicts(table_id);

COMMENT ON INDEX idx_ops_sync_conflicts_table IS
  'Efficiently retrieve all conflicts for a specific table (used for conflict dashboard).';

CREATE INDEX IF NOT EXISTS idx_ops_sync_conflicts_cell ON public.ops_sync_conflicts(cell_id);

COMMENT ON INDEX idx_ops_sync_conflicts_cell IS
  'Efficiently retrieve all conflicts for a specific cell (used for cell history).';

CREATE INDEX IF NOT EXISTS idx_ops_sync_conflicts_created ON public.ops_sync_conflicts(created_at DESC);

COMMENT ON INDEX idx_ops_sync_conflicts_created IS
  'Retrieve recent conflicts ordered by timestamp (used for audit trail and dashboards).';

CREATE INDEX IF NOT EXISTS idx_dynamic_table_cells_source_updated ON public.dynamic_table_cells(source_updated_at DESC)
  WHERE source_updated_at IS NOT NULL;

COMMENT ON INDEX idx_dynamic_table_cells_source_updated IS
  'Find cells updated by CRM sources (used for determining last-writer-wins winner).';

-- =============================================================================
-- Step 4: Enable RLS and create policies for ops_sync_conflicts
-- =============================================================================

ALTER TABLE public.ops_sync_conflicts ENABLE ROW LEVEL SECURITY;

-- Allow org members to view conflicts in their tables
DO $$ BEGIN
  CREATE POLICY "org_members_view_conflicts"
  ON public.ops_sync_conflicts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dynamic_tables dt
      JOIN public.organization_memberships om ON om.org_id = dt.organization_id
      WHERE dt.id = ops_sync_conflicts.table_id
        AND om.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON POLICY "org_members_view_conflicts" ON public.ops_sync_conflicts IS
  'Org members can view conflicts in their organization tables (scoped via organization_memberships).';

-- Allow service role full access for automation/webhooks
DO $$ BEGIN
  CREATE POLICY "service_role_full_access_conflicts"
  ON public.ops_sync_conflicts
  FOR ALL
  USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON POLICY "service_role_full_access_conflicts" ON public.ops_sync_conflicts IS
  'Service role (webhooks, edge functions) can insert/update conflicts for automation.';

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
