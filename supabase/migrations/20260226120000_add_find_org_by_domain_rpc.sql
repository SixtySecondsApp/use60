-- RPC to find organization by exact domain match (SECURITY DEFINER bypasses RLS)
-- Used during onboarding when new users need to find existing orgs to join
CREATE OR REPLACE FUNCTION public.find_organization_by_domain(p_domain TEXT)
RETURNS TABLE(id UUID, name TEXT, company_domain TEXT, member_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.company_domain,
    COUNT(om.user_id)::BIGINT as member_count
  FROM organizations o
  LEFT JOIN organization_memberships om
    ON om.org_id = o.id
    AND om.member_status = 'active'
  WHERE o.company_domain = p_domain
    AND o.is_active = true
  GROUP BY o.id, o.name, o.company_domain
  HAVING COUNT(om.user_id) > 0;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.find_organization_by_domain(TEXT) TO authenticated;
