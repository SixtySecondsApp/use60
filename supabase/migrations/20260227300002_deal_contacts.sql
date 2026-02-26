-- ============================================================================
-- REL-001: deal_contacts junction table
-- Many-to-many between deals and contacts with stakeholder role classification.
-- Supports inference from transcripts, email patterns, manual entry, enrichment.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create deal_contacts table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.deal_contacts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         UUID          NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  contact_id      UUID          NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,

  -- Stakeholder classification
  role            TEXT          NOT NULL,
  confidence      FLOAT         NOT NULL DEFAULT 1.0,
  inferred_from   TEXT          NOT NULL DEFAULT 'manual',

  -- Activity tracking
  first_seen      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_active     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Timestamps
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_deal_contacts_deal_contact UNIQUE (deal_id, contact_id),

  CONSTRAINT chk_deal_contacts_role CHECK (
    role IN (
      'champion',
      'blocker',
      'economic_buyer',
      'influencer',
      'end_user',
      'technical_evaluator'
    )
  ),

  CONSTRAINT chk_deal_contacts_confidence CHECK (
    confidence >= 0.0 AND confidence <= 1.0
  ),

  CONSTRAINT chk_deal_contacts_inferred_from CHECK (
    inferred_from IN (
      'transcript',
      'email_pattern',
      'manual',
      'enrichment'
    )
  )
);

COMMENT ON TABLE public.deal_contacts IS
  'Junction table linking deals to contacts with stakeholder role classification. '
  'Role and confidence are inferred by the autonomous agent fleet from transcripts, '
  'email patterns, or enrichment sources, or set manually by the user. (REL-001)';

COMMENT ON COLUMN public.deal_contacts.role IS
  'Stakeholder role: champion | blocker | economic_buyer | influencer | end_user | technical_evaluator.';

COMMENT ON COLUMN public.deal_contacts.confidence IS
  'Inference confidence score 0.0–1.0. 1.0 for manual entries.';

COMMENT ON COLUMN public.deal_contacts.inferred_from IS
  'How this relationship was established: transcript | email_pattern | manual | enrichment.';

COMMENT ON COLUMN public.deal_contacts.first_seen IS
  'Timestamp when this contact was first associated with the deal.';

COMMENT ON COLUMN public.deal_contacts.last_active IS
  'Timestamp of the most recent signal confirming this contact''s involvement.';

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_deal_contacts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS deal_contacts_updated_at ON public.deal_contacts;
CREATE TRIGGER deal_contacts_updated_at
  BEFORE UPDATE ON public.deal_contacts
  FOR EACH ROW EXECUTE FUNCTION update_deal_contacts_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

-- All contacts for a deal (most common query)
CREATE INDEX IF NOT EXISTS idx_deal_contacts_deal_id
  ON public.deal_contacts (deal_id);

-- All deals for a contact (contact profile view)
CREATE INDEX IF NOT EXISTS idx_deal_contacts_contact_id
  ON public.deal_contacts (contact_id);

-- Filter by role across a deal (find champions, blockers, etc.)
CREATE INDEX IF NOT EXISTS idx_deal_contacts_deal_role
  ON public.deal_contacts (deal_id, role);

-- Recency queries: recently active stakeholders
CREATE INDEX IF NOT EXISTS idx_deal_contacts_last_active
  ON public.deal_contacts (last_active DESC);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.deal_contacts ENABLE ROW LEVEL SECURITY;

-- Org members can read deal_contacts for deals in their org
DO $$ BEGIN
  CREATE POLICY "deal_contacts_org_member_select"
  ON public.deal_contacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deals d
      JOIN public.organization_memberships om ON om.org_id = d.org_id
      WHERE d.id = deal_contacts.deal_id
        AND om.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role: full access for edge function inference writes
DO $$ BEGIN
  CREATE POLICY "deal_contacts_service_all"
  ON public.deal_contacts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.deal_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_contacts TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260227300001_deal_contacts.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'REL-001: deal_contacts junction table';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - deal_contacts table with 10 columns';
  RAISE NOTICE '  - UNIQUE constraint: (deal_id, contact_id)';
  RAISE NOTICE '  - CHECK constraint: role IN (champion, blocker, economic_buyer,';
  RAISE NOTICE '                               influencer, end_user, technical_evaluator)';
  RAISE NOTICE '  - CHECK constraint: confidence BETWEEN 0.0 AND 1.0';
  RAISE NOTICE '  - CHECK constraint: inferred_from IN (transcript, email_pattern,';
  RAISE NOTICE '                                        manual, enrichment)';
  RAISE NOTICE '  - idx_deal_contacts_deal_id      ON (deal_id)';
  RAISE NOTICE '  - idx_deal_contacts_contact_id   ON (contact_id)';
  RAISE NOTICE '  - idx_deal_contacts_deal_role    ON (deal_id, role)';
  RAISE NOTICE '  - idx_deal_contacts_last_active  ON (last_active DESC)';
  RAISE NOTICE '  - deal_contacts_updated_at trigger (auto-updates updated_at)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS policies:';
  RAISE NOTICE '  - authenticated: SELECT for org members (via deals.org_id join)';
  RAISE NOTICE '  - service_role:  full access (INSERT/UPDATE/DELETE for edge functions)';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
