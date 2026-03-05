-- Migration: HubSpot Bi-Directional Sync
-- Purpose: Sync history table for revert, removed contact flagging, write-back tracking.
-- Date: 2026-02-08

-- =============================================================================
-- Step 1: hubspot_sync_history — Records each sync with snapshot for revert
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hubspot_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  synced_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sync stats
  new_contacts_count INTEGER NOT NULL DEFAULT 0,
  updated_contacts_count INTEGER NOT NULL DEFAULT 0,
  removed_contacts_count INTEGER NOT NULL DEFAULT 0,
  returned_contacts_count INTEGER NOT NULL DEFAULT 0,

  -- Snapshot for revert (only changed cells/rows, not full table)
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata
  sync_duration_ms INTEGER,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.hubspot_sync_history IS 'Tracks each HubSpot sync operation with snapshot for revert capability.';
COMMENT ON COLUMN public.hubspot_sync_history.snapshot IS 'Diff snapshot: { cells: [{row_id, column_id, old_value, new_value}], rows: [{id, action, source_id}] }';

-- =============================================================================
-- Step 2: Add hubspot_removed_at to dynamic_table_rows
-- =============================================================================

ALTER TABLE public.dynamic_table_rows
  ADD COLUMN IF NOT EXISTS hubspot_removed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_rows.hubspot_removed_at IS
  'Set when contact was removed from HubSpot list. NULL = still in list.';

-- =============================================================================
-- Step 3: Add hubspot_last_pushed_at to dynamic_table_cells
-- =============================================================================

ALTER TABLE public.dynamic_table_cells
  ADD COLUMN IF NOT EXISTS hubspot_last_pushed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_cells.hubspot_last_pushed_at IS
  'Last time this cell value was pushed to HubSpot. Used to prevent write-back loops.';

-- =============================================================================
-- Step 4: Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_hubspot_sync_history_table_id
  ON public.hubspot_sync_history(table_id, synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_hubspot_removed
  ON public.dynamic_table_rows(table_id, hubspot_removed_at)
  WHERE hubspot_removed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dynamic_table_cells_hubspot_pushed
  ON public.dynamic_table_cells(hubspot_last_pushed_at)
  WHERE hubspot_last_pushed_at IS NOT NULL;

-- =============================================================================
-- Step 5: RLS for hubspot_sync_history
-- =============================================================================

ALTER TABLE public.hubspot_sync_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view sync history of accessible tables"
  ON public.hubspot_sync_history
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'hubspot_sync_history' AND policyname = 'Service role full access to hubspot_sync_history'
  ) THEN
    CREATE POLICY "Service role full access to hubspot_sync_history"
      ON public.hubspot_sync_history FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- =============================================================================
NOTIFY pgrst, 'reload schema';
