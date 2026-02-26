-- ============================================================================
-- REL-002: contact_org_history table
-- Tracks the employment history of a contact across companies (orgs).
-- Each row represents one tenure at a company, with optional end date
-- (NULL ended_at = current position). Used for relationship graph and
-- career-path intelligence.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create contact_org_history table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contact_org_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   UUID        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title        TEXT,                        -- job title at this company (nullable)
  started_at   TIMESTAMPTZ NOT NULL,        -- when the tenure began
  ended_at     TIMESTAMPTZ,                 -- NULL = current position
  source       TEXT        NOT NULL,        -- how this record was discovered
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_contact_org_history_source CHECK (
    source IN ('linkedin', 'apollo', 'crm_update', 'email_domain_change')
  ),

  CONSTRAINT uq_contact_org_history_contact_company_started
    UNIQUE (contact_id, company_id, started_at)
);

COMMENT ON TABLE public.contact_org_history IS
  'Employment history for contacts — one row per tenure at a company. '
  'ended_at NULL means the contact currently works there. '
  'source tracks how the record was discovered (REL-002).';

COMMENT ON COLUMN public.contact_org_history.ended_at IS
  'NULL when this is the contact''s current position.';

COMMENT ON COLUMN public.contact_org_history.source IS
  'How this history record was discovered: '
  'linkedin | apollo | crm_update | email_domain_change';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

-- All history rows for a contact (common lookup)
CREATE INDEX IF NOT EXISTS idx_contact_org_history_contact_id
  ON public.contact_org_history (contact_id);

-- All contacts ever at a company
CREATE INDEX IF NOT EXISTS idx_contact_org_history_company_id
  ON public.contact_org_history (company_id);

-- Current-job query: WHERE contact_id = ? AND ended_at IS NULL
CREATE INDEX IF NOT EXISTS idx_contact_org_history_contact_current
  ON public.contact_org_history (contact_id, ended_at)
  WHERE ended_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.contact_org_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read history rows for contacts they own.
-- Contacts use owner_id for user attribution (not org_id).
DO $$ BEGIN
  CREATE POLICY "contact_org_history_owner_select"
  ON public.contact_org_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.contacts c
      WHERE c.id = contact_org_history.contact_id
        AND c.owner_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role: full access for edge function writes and enrichment pipelines
DO $$ BEGIN
  CREATE POLICY "contact_org_history_service_all"
  ON public.contact_org_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.contact_org_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_org_history TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260227300001_contact_org_history.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'REL-002: contact_org_history table';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - contact_org_history table with 8 columns';
  RAISE NOTICE '  - FK: contact_id -> contacts(id) ON DELETE CASCADE';
  RAISE NOTICE '  - FK: company_id -> companies(id) ON DELETE CASCADE';
  RAISE NOTICE '  - CHECK constraint: source IN (linkedin, apollo, crm_update, email_domain_change)';
  RAISE NOTICE '  - UNIQUE (contact_id, company_id, started_at)';
  RAISE NOTICE '  - idx_contact_org_history_contact_id      ON (contact_id)';
  RAISE NOTICE '  - idx_contact_org_history_company_id      ON (company_id)';
  RAISE NOTICE '  - idx_contact_org_history_contact_current ON (contact_id, ended_at) WHERE ended_at IS NULL';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS policies:';
  RAISE NOTICE '  - authenticated: SELECT for contact owners (contacts.owner_id = auth.uid())';
  RAISE NOTICE '  - service_role: full access (INSERT/UPDATE/DELETE for edge functions)';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
