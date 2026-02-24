-- Migration: Add helper function to check for existing organizations by email domain
--
-- Purpose: Support the onboarding flow for business emails
-- When a user signs up with a business email (non-personal domain),
-- check if an organization already exists with that domain.
-- If yes → user should request to join
-- If no → user creates new org through onboarding
--
-- This ensures:
-- 1. Coworkers at the same company get grouped into the same organization
-- 2. No duplicate organizations are created for the same company
-- 3. New users go through proper join request approval flow

-- ============================================================================
-- Function: check_existing_org_by_email_domain
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_existing_org_by_email_domain(
  p_email TEXT
)
RETURNS TABLE (
  org_id UUID,
  org_name TEXT,
  org_domain TEXT,
  member_count BIGINT,
  should_request_join BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email_domain TEXT;
  v_is_personal BOOLEAN;
BEGIN
  -- Extract domain from email
  v_email_domain := LOWER(SPLIT_PART(p_email, '@', 2));

  -- Check if it's a personal email domain
  v_is_personal := is_personal_email_domain(p_email);

  -- If personal email, return empty (they should go through full onboarding)
  IF v_is_personal THEN
    RETURN;
  END IF;

  -- Look for existing organization with matching company_domain
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.company_domain,
    COUNT(om.user_id) as member_count,
    TRUE as should_request_join
  FROM organizations o
  LEFT JOIN organization_memberships om ON o.id = om.org_id
  WHERE o.company_domain = v_email_domain
    AND o.is_active = true
  GROUP BY o.id, o.name, o.company_domain
  ORDER BY member_count DESC
  LIMIT 1;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_existing_org_by_email_domain(TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.check_existing_org_by_email_domain(TEXT) IS
'Checks if an organization exists for a given email domain (business emails only).
Returns organization details if found, suggesting user should request to join.
Returns empty for personal email domains (gmail.com, etc).
Used during onboarding to prevent duplicate organizations.';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Created function check_existing_org_by_email_domain';
  RAISE NOTICE 'Business emails will now check for existing organizations during onboarding';
END $$;
