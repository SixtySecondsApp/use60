-- ============================================================================
-- Migration: Cross-deal Stakeholder RPC Functions
-- Purpose: Two RPCs for querying stakeholder maps across deals and contacts.
--
--   1. get_cross_deal_stakeholders(p_contact_id) — Given a contact, return all
--      open deals they appear in with their role, confidence, and last_active.
--
--   2. get_deal_stakeholder_map(p_deal_id) — Given a deal, return all contacts
--      on that deal with their roles, confidence scores, and last activity.
--
-- Both functions use SECURITY DEFINER so they can bypass RLS on deal_contacts
-- (which service-role agents write to), but they enforce org scoping explicitly
-- by checking that the calling user is a member of the deal's org via
-- organization_memberships. Users can only see their own org's data.
--
-- Story: REL-005
-- Date: 2026-02-27
-- DEPENDS ON: REL-001 (deal_contacts), deals, contacts, organization_memberships
-- ============================================================================


-- ============================================================================
-- FUNCTION: get_cross_deal_stakeholders(p_contact_id UUID)
--
-- Returns the named contact plus a JSONB array of every open deal they are
-- linked to via deal_contacts, scoped to the calling user's org.
--
-- Return columns:
--   contact_id   UUID    — the contact requested
--   contact_name TEXT    — COALESCE(full_name, first_name || ' ' || last_name)
--   deals        JSONB   — array of {deal_id, deal_name, role, confidence,
--                           last_active} for all open deals in the caller's org
--
-- Edge cases:
--   - Contact not found: returns zero rows (RLS: contact must be in same org)
--   - No deal_contacts rows: deals is '[]'::jsonb (empty array, not an error)
--   - Deals in other orgs: excluded via the org_id membership check
-- ============================================================================

CREATE OR REPLACE FUNCTION get_cross_deal_stakeholders(
  p_contact_id UUID
)
RETURNS TABLE (
  contact_id   UUID,
  contact_name TEXT,
  deals        JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id                                                    AS contact_id,
    COALESCE(
      NULLIF(TRIM(c.full_name), ''),
      NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '')
    )                                                       AS contact_name,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'deal_id',     d.id,
            'deal_name',   d.name,
            'role',        dc.role,
            'confidence',  dc.confidence,
            'last_active', dc.last_active
          )
          ORDER BY dc.last_active DESC
        )
        FROM public.deal_contacts dc
        JOIN public.deals d ON d.id = dc.deal_id
        WHERE dc.contact_id = c.id
          AND d.status NOT IN ('won', 'lost')
          AND d.clerk_org_id IN (
            SELECT om.org_id::TEXT
            FROM public.organization_memberships om
            WHERE om.user_id = auth.uid()
          )
      ),
      '[]'::jsonb
    )                                                       AS deals
  FROM public.contacts c
  WHERE c.id = p_contact_id
    -- Org-scope: contact must belong to the caller's org
    AND c.owner_id IN (
      SELECT om.user_id
      FROM public.organization_memberships om
      WHERE om.org_id IN (
        SELECT om2.org_id
        FROM public.organization_memberships om2
        WHERE om2.user_id = auth.uid()
      )
    );
$$;

GRANT EXECUTE ON FUNCTION get_cross_deal_stakeholders(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cross_deal_stakeholders(UUID) TO service_role;

COMMENT ON FUNCTION get_cross_deal_stakeholders IS
  'REL-005: Returns a contact and a JSON array of all open deals that contact '
  'appears in (via deal_contacts), scoped to the calling user''s org. '
  'Each deal entry contains: deal_id, deal_name, role, confidence, last_active. '
  'Returns an empty deals array (not an error) when the contact has no deal associations. '
  'Enforces org membership so callers only see their own org''s deals.';


-- ============================================================================
-- FUNCTION: get_deal_stakeholder_map(p_deal_id UUID)
--
-- Returns every contact linked to the given deal via deal_contacts, with their
-- resolved name, role, confidence, and last activity timestamp.
--
-- Return columns (one row per contact on the deal):
--   contact_id    UUID    — the contact's id
--   contact_name  TEXT    — COALESCE(full_name, first_name || ' ' || last_name)
--   role          TEXT    — stakeholder role (champion, blocker, …)
--   confidence    FLOAT   — inference confidence 0.0–1.0
--   last_active   TIMESTAMPTZ — most recent signal for this stakeholder
--
-- Edge cases:
--   - Deal not in caller's org: returns zero rows (org membership check)
--   - No deal_contacts rows: returns zero rows (not an error)
--   - Contact name NULL: returns NULL contact_name (callers should handle gracefully)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_deal_stakeholder_map(
  p_deal_id UUID
)
RETURNS TABLE (
  contact_id   UUID,
  contact_name TEXT,
  role         TEXT,
  confidence   FLOAT,
  last_active  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id                                                    AS contact_id,
    COALESCE(
      NULLIF(TRIM(c.full_name), ''),
      NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '')
    )                                                       AS contact_name,
    dc.role,
    dc.confidence,
    dc.last_active
  FROM public.deal_contacts dc
  JOIN public.contacts c       ON c.id = dc.contact_id
  JOIN public.deals d          ON d.id = dc.deal_id
  -- Org-scope: deal must belong to a org the caller is a member of
  JOIN public.organization_memberships om
    ON om.org_id::TEXT = d.clerk_org_id
   AND om.user_id = auth.uid()
  WHERE dc.deal_id = p_deal_id
  ORDER BY dc.last_active DESC;
$$;

GRANT EXECUTE ON FUNCTION get_deal_stakeholder_map(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_deal_stakeholder_map(UUID) TO service_role;

COMMENT ON FUNCTION get_deal_stakeholder_map IS
  'REL-005: Returns all contacts on a deal (via deal_contacts) with their role, '
  'confidence score, and last activity timestamp. Results are scoped to the calling '
  'user''s org — deals in other orgs return zero rows. Ordered by last_active DESC. '
  'Returns zero rows (not an error) when the deal has no stakeholder associations.';


-- ============================================================================
-- Migration summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260227300003_stakeholder_rpcs.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: REL-005';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '';
  RAISE NOTICE '  get_cross_deal_stakeholders(p_contact_id UUID)';
  RAISE NOTICE '    → (contact_id UUID, contact_name TEXT, deals JSONB)';
  RAISE NOTICE '    Given a contact, returns all open deals they appear in across the';
  RAISE NOTICE '    caller''s org. deals is a JSON array of {deal_id, deal_name, role,';
  RAISE NOTICE '    confidence, last_active}. Returns empty array when no associations.';
  RAISE NOTICE '';
  RAISE NOTICE '  get_deal_stakeholder_map(p_deal_id UUID)';
  RAISE NOTICE '    → TABLE(contact_id, contact_name, role, confidence, last_active)';
  RAISE NOTICE '    Given a deal, returns all contacts on that deal with their role,';
  RAISE NOTICE '    confidence score, and most recent activity timestamp.';
  RAISE NOTICE '    Returns zero rows when deal has no contacts or is in another org.';
  RAISE NOTICE '';
  RAISE NOTICE 'Security:';
  RAISE NOTICE '  Both functions use SECURITY DEFINER to bypass deal_contacts RLS';
  RAISE NOTICE '  (which blocks authenticated reads for service-role written rows).';
  RAISE NOTICE '  Org scoping is enforced explicitly via organization_memberships join';
  RAISE NOTICE '  on auth.uid() — callers can only see their own org''s data.';
  RAISE NOTICE '';
  RAISE NOTICE 'Contact name resolution:';
  RAISE NOTICE '  COALESCE(full_name, first_name || '' '' || last_name)';
  RAISE NOTICE '  Handles contacts with only first/last name split or only full_name set.';
  RAISE NOTICE '';
  RAISE NOTICE 'Grants: EXECUTE to authenticated + service_role on both functions.';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
