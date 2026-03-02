-- Migration: Explorium Integration Foundation
-- Purpose: Add 'explorium' (and 'ai_ark') to dynamic_tables.source_type CHECK;
--          create explorium_crm_mappings table for incremental CRM exclusion caching.
-- Date: 2026-02-26

-- =============================================================================
-- Step 1: Expand dynamic_tables.source_type CHECK constraint
-- Current values (as of 20260219500001): manual, apollo, csv, copilot,
--   hubspot, attio, ops_table, standard
-- Adding: ai_ark (missing from constraint despite being used), explorium
-- =============================================================================

ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_source_type_check;

ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_source_type_check
  CHECK (source_type IN (
    'manual', 'apollo', 'csv', 'copilot',
    'hubspot', 'attio', 'ops_table', 'standard',
    'ai_ark', 'explorium'
  ));

-- =============================================================================
-- Step 2: Create explorium_crm_mappings table
-- Purpose: Cache org CRM company/contact → Explorium business_id/prospect_id
--          mappings so that CRM exclusion sync is incremental (only unmatched
--          records are sent to the Explorium match API on each sync run).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.explorium_crm_mappings (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type    TEXT         NOT NULL CHECK (entity_type IN ('business', 'prospect')),
  crm_id         UUID         NOT NULL,   -- companies.id or contacts.id
  explorium_id   TEXT         NOT NULL,   -- business_id (32-char) or prospect_id (40-char)
  matched_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_crm_entity_per_org UNIQUE(organization_id, entity_type, crm_id)
);

COMMENT ON TABLE public.explorium_crm_mappings IS
  'Cache of CRM entity → Explorium stable ID mappings for incremental exclusion sync. '
  'Match API is free; this cache ensures we only re-match new CRM records.';

COMMENT ON COLUMN public.explorium_crm_mappings.entity_type IS
  'business = companies.id → explorium business_id (32-char hex). '
  'prospect = contacts.id → explorium prospect_id (40-char hex).';

COMMENT ON COLUMN public.explorium_crm_mappings.crm_id IS
  'Primary key from companies or contacts table in this Supabase project.';

COMMENT ON COLUMN public.explorium_crm_mappings.explorium_id IS
  'Stable Explorium ID: business_id is 32-char hex, prospect_id is 40-char hex.';

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_explorium_crm_mappings_org_type
  ON public.explorium_crm_mappings(organization_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_explorium_crm_mappings_explorium_id
  ON public.explorium_crm_mappings(organization_id, explorium_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.explorium_crm_mappings ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's mappings (for exclusion count display in UI)
DO $$ BEGIN
  CREATE POLICY "Org members can read explorium CRM mappings"
    ON public.explorium_crm_mappings
    FOR SELECT
    USING (
      organization_id IN (
        SELECT org_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only service role writes (edge functions handle all sync logic)
DO $$ BEGIN
  CREATE POLICY "Service role full access to explorium_crm_mappings"
    ON public.explorium_crm_mappings
    FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Notify PostgREST to reload schema
-- =============================================================================

NOTIFY pgrst, 'reload schema';
