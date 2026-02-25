-- Migration: ATTIO-001 — Full Attio CRM Integration Schema
-- Purpose: Create all Attio integration tables, update source_type/column_type enums,
--          add bidirectional sync columns, RLS policies, indexes, and dequeue function.
-- Date: 2026-02-11

-- =============================================================================
-- Step 1: attio_org_integrations — Connection metadata (non-sensitive)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.attio_org_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  connected_at TIMESTAMPTZ,
  attio_workspace_id TEXT,
  attio_workspace_name TEXT,
  scopes TEXT[] DEFAULT '{}'::TEXT[],
  webhook_secret TEXT,
  webhook_id TEXT,
  webhook_last_received_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT attio_org_integrations_org_id_key UNIQUE (org_id)
);

COMMENT ON TABLE public.attio_org_integrations IS
  'Org-scoped Attio integration metadata (non-sensitive). One row per org.';
COMMENT ON COLUMN public.attio_org_integrations.webhook_secret IS
  'Shared secret appended to webhook target_url for verification.';

-- =============================================================================
-- Step 2: attio_org_credentials — OAuth tokens (service-role-only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.attio_org_credentials (
  org_id UUID NOT NULL PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.attio_org_credentials IS
  'Org-scoped Attio OAuth credentials (service-role-only). Never expose to frontend.';

-- =============================================================================
-- Step 3: attio_oauth_states — CSRF protection for OAuth flow
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.attio_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  redirect_uri TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.attio_oauth_states IS
  'CSRF state tokens for Attio OAuth flow. 10-minute TTL, one-time use.';

-- =============================================================================
-- Step 4: attio_settings — Admin-configurable sync settings
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.attio_settings (
  org_id UUID NOT NULL PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.attio_settings IS
  'Admin-configurable mapping/settings for Attio sync. Stores object mapping, field mapping, sync direction.';

-- =============================================================================
-- Step 5: attio_sync_queue — Job queue for async processing
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.attio_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 10,
  last_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT attio_sync_queue_job_type_check CHECK (
    job_type IN (
      'sync_record', 'sync_table', 'webhook_event',
      'sync_contact', 'sync_company', 'sync_deal',
      'sync_task', 'sync_note', 'push_record'
    )
  )
);

COMMENT ON TABLE public.attio_sync_queue IS
  'DB-backed queue for Attio sync jobs (rate limited + retried by worker).';

-- =============================================================================
-- Step 6: attio_sync_history — Sync snapshots for revert capability
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.attio_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  synced_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sync stats
  new_records_count INTEGER NOT NULL DEFAULT 0,
  updated_records_count INTEGER NOT NULL DEFAULT 0,
  removed_records_count INTEGER NOT NULL DEFAULT 0,
  returned_records_count INTEGER NOT NULL DEFAULT 0,

  -- Snapshot for revert (only changed cells/rows, not full table)
  snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Metadata
  sync_duration_ms INTEGER,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.attio_sync_history IS
  'Tracks each Attio sync operation with snapshot for revert capability.';
COMMENT ON COLUMN public.attio_sync_history.snapshot IS
  'Diff snapshot: { cells: [{row_id, column_id, old_value, new_value}], rows: [{id, action, source_id}] }';

-- =============================================================================
-- Step 7: Add 'attio' to dynamic_tables source_type CHECK
-- =============================================================================

ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_source_type_check;

DO $$ BEGIN
  ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_source_type_check
  CHECK (source_type IN ('manual', 'apollo', 'csv', 'copilot', 'hubspot', 'ops_table', 'attio'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Step 8: Add 'attio_property' to column_type CHECK + attio_property_name column
-- =============================================================================

ALTER TABLE public.dynamic_table_columns
  DROP CONSTRAINT IF EXISTS dynamic_table_columns_column_type_check;

DO $$ BEGIN
  ALTER TABLE public.dynamic_table_columns
  ADD CONSTRAINT dynamic_table_columns_column_type_check
  CHECK (column_type IN (
    'text', 'email', 'url', 'number', 'boolean', 'enrichment',
    'status', 'person', 'company', 'linkedin', 'date',
    'dropdown', 'tags', 'phone', 'checkbox', 'formula',
    'integration', 'action', 'hubspot_property', 'attio_property'
  )) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS attio_property_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.attio_property_name IS
  'Attio attribute slug for attio_property column type (e.g. name, email_addresses, domains)';

-- =============================================================================
-- Step 9: Add attio_removed_at to dynamic_table_rows (bidirectional sync)
-- =============================================================================

ALTER TABLE public.dynamic_table_rows
  ADD COLUMN IF NOT EXISTS attio_removed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_rows.attio_removed_at IS
  'Set when record was removed from Attio. NULL = still in Attio.';

-- =============================================================================
-- Step 10: Add attio_last_pushed_at to dynamic_table_cells (write-back loop prevention)
-- =============================================================================

ALTER TABLE public.dynamic_table_cells
  ADD COLUMN IF NOT EXISTS attio_last_pushed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_cells.attio_last_pushed_at IS
  'Last time this cell value was pushed to Attio. Used to prevent write-back loops.';

-- =============================================================================
-- Step 11: Enable RLS on all Attio tables
-- =============================================================================

ALTER TABLE public.attio_org_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attio_org_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attio_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attio_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attio_sync_history ENABLE ROW LEVEL SECURITY;

-- attio_org_integrations: org members can read, admins can write
DO $$ BEGIN
  CREATE POLICY "attio_org_integrations_select"
  ON public.attio_org_integrations FOR SELECT
  USING (is_service_role() OR can_access_org_data(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "attio_org_integrations_admin_all"
  ON public.attio_org_integrations
  USING (is_service_role() OR can_admin_org(org_id))
  WITH CHECK (is_service_role() OR can_admin_org(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- attio_org_credentials: service role ONLY
DO $$ BEGIN
  CREATE POLICY "attio_org_credentials_service_all"
  ON public.attio_org_credentials
  USING (is_service_role())
  WITH CHECK (is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- attio_oauth_states: service role ONLY
DO $$ BEGIN
  CREATE POLICY "attio_oauth_states_service_all"
  ON public.attio_oauth_states
  USING (is_service_role())
  WITH CHECK (is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- attio_settings: org members can read, admins can write
DO $$ BEGIN
  CREATE POLICY "attio_settings_select"
  ON public.attio_settings FOR SELECT
  USING (is_service_role() OR can_access_org_data(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "attio_settings_admin_all"
  ON public.attio_settings
  USING (is_service_role() OR can_admin_org(org_id))
  WITH CHECK (is_service_role() OR can_admin_org(org_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- attio_sync_queue: service role ONLY
DO $$ BEGIN
  CREATE POLICY "attio_sync_queue_service_all"
  ON public.attio_sync_queue
  USING (is_service_role())
  WITH CHECK (is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- attio_sync_history: org members can view via table access
DO $$ BEGIN
  CREATE POLICY "attio_sync_history_select"
  ON public.attio_sync_history FOR SELECT
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
  CREATE POLICY "attio_sync_history_service_all"
  ON public.attio_sync_history
  USING (is_service_role())
  WITH CHECK (is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Step 12: Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_attio_org_integrations_org_id
  ON public.attio_org_integrations(org_id);

CREATE INDEX IF NOT EXISTS idx_attio_sync_queue_ready
  ON public.attio_sync_queue(run_after, priority DESC, created_at ASC)
  WHERE attempts < max_attempts;

CREATE INDEX IF NOT EXISTS idx_attio_sync_queue_dedupe
  ON public.attio_sync_queue(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attio_sync_history_table_id
  ON public.attio_sync_history(table_id, synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_attio_removed
  ON public.dynamic_table_rows(table_id, attio_removed_at)
  WHERE attio_removed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dynamic_table_cells_attio_pushed
  ON public.dynamic_table_cells(attio_last_pushed_at)
  WHERE attio_last_pushed_at IS NOT NULL;

-- =============================================================================
-- Step 13: Dequeue function for attio_sync_queue (atomic pick + delete)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.attio_dequeue_jobs(
  p_limit INTEGER DEFAULT 10,
  p_org_id UUID DEFAULT NULL
)
RETURNS SETOF public.attio_sync_queue
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.attio_sync_queue
    WHERE run_after <= NOW()
      AND attempts < max_attempts
      AND (p_org_id IS NULL OR org_id = p_org_id)
    ORDER BY priority DESC, run_after ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 50))
  )
  DELETE FROM public.attio_sync_queue q
  USING picked
  WHERE q.id = picked.id
  RETURNING q.*;
END;
$$;

COMMENT ON FUNCTION public.attio_dequeue_jobs IS
  'Atomically picks and deletes jobs from attio_sync_queue. Uses SKIP LOCKED for concurrency.';

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
