-- Migration: BetterContact Integration Foundation
-- Purpose: Add 'bettercontact' to dynamic_tables.source_type CHECK;
--          add 'bettercontact_property' column type + bettercontact_property_name;
--          create bettercontact_requests table for async enrichment tracking.
-- Date: 2026-03-12

-- =============================================================================
-- Step 1: Expand dynamic_tables.source_type CHECK constraint
-- Current values (as of 20260226800001): manual, apollo, csv, copilot,
--   hubspot, attio, ops_table, standard, ai_ark, explorium
-- Adding: bettercontact
-- =============================================================================

ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_source_type_check;

ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_source_type_check
  CHECK (source_type IN (
    'manual', 'apollo', 'csv', 'copilot',
    'hubspot', 'attio', 'ops_table', 'standard',
    'ai_ark', 'explorium', 'bettercontact'
  ));

-- =============================================================================
-- Step 2: Expand dynamic_table_columns.column_type CHECK constraint
-- Adding: bettercontact_property
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
    'integration', 'action', 'button',
    'hubspot_property', 'apollo_property', 'bettercontact_property'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Step 3: Add bettercontact_property_name column
-- =============================================================================

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS bettercontact_property_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.dynamic_table_columns.bettercontact_property_name IS
  'BetterContact enrichment field name for bettercontact_property column type (e.g. email, email_status, phone, job_title)';

-- =============================================================================
-- Step 4: Create bettercontact_requests table
-- Purpose: Track async enrichment and lead finder requests submitted to
--          BetterContact API. Maps their request_id back to our Ops tables
--          so webhook/polling results can be written to the correct cells.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bettercontact_requests (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  table_id                UUID         REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  column_id               UUID         REFERENCES public.dynamic_table_columns(id) ON DELETE CASCADE,
  bettercontact_request_id TEXT        NOT NULL,
  action                  TEXT         NOT NULL CHECK (action IN ('enrich', 'lead_finder')),
  status                  TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'terminated', 'failed')),
  total_contacts          INTEGER      NOT NULL DEFAULT 0,
  processed_contacts      INTEGER      NOT NULL DEFAULT 0,
  credits_consumed        INTEGER      DEFAULT 0,
  webhook_url             TEXT,
  enrichment_job_id       UUID,
  enrich_email            BOOLEAN      NOT NULL DEFAULT true,
  enrich_phone            BOOLEAN      NOT NULL DEFAULT false,
  error_message           TEXT,
  submitted_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ,
  created_by              UUID         NOT NULL REFERENCES auth.users(id)
);

COMMENT ON TABLE public.bettercontact_requests IS
  'Tracks async enrichment and lead finder requests submitted to BetterContact API. '
  'Maps bettercontact_request_id back to Ops table/column for webhook result processing.';

COMMENT ON COLUMN public.bettercontact_requests.bettercontact_request_id IS
  'The request ID returned by BetterContact POST /async or POST /lead_finder/async endpoints.';

COMMENT ON COLUMN public.bettercontact_requests.action IS
  'enrich = email/phone enrichment via POST /async. lead_finder = prospecting via POST /lead_finder/async.';

-- =============================================================================
-- Step 5: Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_bettercontact_requests_org_request
  ON public.bettercontact_requests(organization_id, bettercontact_request_id);

CREATE INDEX IF NOT EXISTS idx_bettercontact_requests_table_status
  ON public.bettercontact_requests(table_id, status);

CREATE INDEX IF NOT EXISTS idx_bettercontact_requests_pending
  ON public.bettercontact_requests(status) WHERE status = 'pending';

-- =============================================================================
-- Step 6: Row Level Security
-- =============================================================================

ALTER TABLE public.bettercontact_requests ENABLE ROW LEVEL SECURITY;

-- Org members can view their org's requests
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org members can read bettercontact requests" ON public.bettercontact_requests;
CREATE POLICY "Org members can read bettercontact requests"
    ON public.bettercontact_requests
    FOR SELECT
    USING (
      organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role has full access (edge functions handle all writes)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to bettercontact_requests" ON public.bettercontact_requests;
CREATE POLICY "Service role full access to bettercontact_requests"
    ON public.bettercontact_requests
    FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Notify PostgREST to reload schema
-- =============================================================================

NOTIFY pgrst, 'reload schema';
