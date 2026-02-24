-- Migration: Fix check_existing_org_by_email_domain to exclude empty organizations
-- Prevents users from being directed to join organizations with no active members

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
  -- Only return organizations with at least 1 active member (prevents ghost org joins)
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.company_domain,
    COUNT(om.user_id) as member_count,
    TRUE as should_request_join
  FROM organizations o
  LEFT JOIN organization_memberships om ON o.id = om.org_id
    AND om.member_status = 'active'
  WHERE o.company_domain = v_email_domain
    AND o.is_active = true
  GROUP BY o.id, o.name, o.company_domain
  HAVING COUNT(om.user_id) > 0  -- Only orgs with active members
  ORDER BY member_count DESC
  LIMIT 1;
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.check_existing_org_by_email_domain(TEXT) IS
'Checks if an organization exists for a given email domain (business emails only).
Returns organization details if found, suggesting user should request to join.
Returns empty for:
- Personal email domains (gmail.com, etc)
- Organizations with no active members (ghost orgs)
Used during onboarding to prevent duplicate organizations and joining inactive orgs.';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Updated check_existing_org_by_email_domain to exclude empty organizations';
END $$;
