-- ============================================================================
-- REL-011: Manual write RPCs for deal_contacts
-- Provides SECURITY DEFINER functions so authenticated org members can upsert
-- and delete their own deal_contacts rows with inferred_from='manual'.
-- The deal_contacts table only grants SELECT to authenticated users; these
-- RPCs enforce org scoping and allow manual role overrides from the UI.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. upsert_deal_contact_manual
--    Inserts or updates a deal_contacts row for the calling user's org.
--    Always sets inferred_from='manual', confidence=1.0.
--    Enforces org membership: the deal must belong to an org the caller is in.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_deal_contact_manual(
  p_deal_id    UUID,
  p_contact_id UUID,
  p_role       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_valid BOOLEAN;
BEGIN
  -- Validate role value against the allowed enum
  v_role_valid := p_role IN (
    'champion',
    'blocker',
    'economic_buyer',
    'influencer',
    'end_user',
    'technical_evaluator'
  );

  IF NOT v_role_valid THEN
    RAISE EXCEPTION 'Invalid role: %. Must be one of: champion, blocker, economic_buyer, influencer, end_user, technical_evaluator', p_role;
  END IF;

  -- Enforce org membership: the deal must be in an org the caller belongs to
  IF NOT EXISTS (
    SELECT 1
    FROM public.deals d
    JOIN public.organization_memberships om ON om.org_id::TEXT = d.clerk_org_id
    WHERE d.id = p_deal_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: deal % not found in your organisation', p_deal_id;
  END IF;

  -- Upsert: insert or update role. Manual overrides always win on conflict.
  INSERT INTO public.deal_contacts (
    deal_id,
    contact_id,
    role,
    confidence,
    inferred_from,
    last_active,
    updated_at
  )
  VALUES (
    p_deal_id,
    p_contact_id,
    p_role,
    1.0,
    'manual',
    NOW(),
    NOW()
  )
  ON CONFLICT (deal_id, contact_id) DO UPDATE
    SET role          = EXCLUDED.role,
        confidence    = 1.0,
        inferred_from = 'manual',
        last_active   = NOW(),
        updated_at    = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_deal_contact_manual(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_deal_contact_manual(UUID, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION upsert_deal_contact_manual IS
  'REL-011: Upserts a deal_contacts row with inferred_from=''manual'', confidence=1.0. '
  'Enforces org membership so callers can only write to deals in their org. '
  'Accepts role in (champion, blocker, economic_buyer, influencer, end_user, technical_evaluator).';


-- ---------------------------------------------------------------------------
-- 2. delete_deal_contact_manual
--    Deletes a deal_contacts row, scoped to the calling user's org.
--    Used when the rep selects "Remove" from the role dropdown.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION delete_deal_contact_manual(
  p_deal_id    UUID,
  p_contact_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Enforce org membership: the deal must be in an org the caller belongs to
  IF NOT EXISTS (
    SELECT 1
    FROM public.deals d
    JOIN public.organization_memberships om ON om.org_id::TEXT = d.clerk_org_id
    WHERE d.id = p_deal_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: deal % not found in your organisation', p_deal_id;
  END IF;

  DELETE FROM public.deal_contacts
  WHERE deal_id    = p_deal_id
    AND contact_id = p_contact_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_deal_contact_manual(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_deal_contact_manual(UUID, UUID) TO service_role;

COMMENT ON FUNCTION delete_deal_contact_manual IS
  'REL-011: Deletes a deal_contacts row for the given deal/contact pair. '
  'Enforces org membership so callers can only delete from deals in their org. '
  'Used by the manual role override UI ("Remove" option).';


-- ---------------------------------------------------------------------------
-- 3. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260227600001_deal_contacts_manual_write_rpcs.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'REL-011: Manual write RPCs for deal_contacts';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - upsert_deal_contact_manual(deal_id, contact_id, role)';
  RAISE NOTICE '      Inserts or updates with inferred_from=manual, confidence=1.0';
  RAISE NOTICE '      Enforces org membership, validates role enum';
  RAISE NOTICE '  - delete_deal_contact_manual(deal_id, contact_id)';
  RAISE NOTICE '      Deletes row, enforces org membership';
  RAISE NOTICE '';
  RAISE NOTICE 'Both use SECURITY DEFINER to bypass deal_contacts RLS';
  RAISE NOTICE '(authenticated users only have SELECT on deal_contacts).';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
