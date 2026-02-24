-- Function to find similar organizations by domain
-- Handles variations like "acme.com" vs "www.acme.com"
CREATE OR REPLACE FUNCTION "public"."find_similar_organizations_by_domain"(
  p_search_domain text,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  name text,
  company_domain text,
  member_count bigint,
  similarity_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.company_domain,
    COUNT(om.user_id) as member_count,
    CASE
      -- Exact match
      WHEN LOWER(o.company_domain) = LOWER(p_search_domain) THEN 1.0
      -- Remove www prefix and compare
      WHEN LOWER(REPLACE(o.company_domain, 'www.', '')) = LOWER(REPLACE(p_search_domain, 'www.', '')) THEN 0.95
      -- One contains the other (subdomain variations)
      WHEN LOWER(o.company_domain) LIKE LOWER('%' || p_search_domain || '%') THEN 0.85
      WHEN LOWER(p_search_domain) LIKE LOWER('%' || o.company_domain || '%') THEN 0.85
      ELSE 0.6
    END::float as similarity_score
  FROM organizations o
  LEFT JOIN organization_memberships om ON o.id = om.org_id
  WHERE
    o.is_active = true
    AND o.company_domain IS NOT NULL
    AND (
      LOWER(o.company_domain) = LOWER(p_search_domain)
      OR LOWER(REPLACE(o.company_domain, 'www.', '')) = LOWER(REPLACE(p_search_domain, 'www.', ''))
      OR LOWER(o.company_domain) LIKE LOWER('%' || p_search_domain || '%')
      OR LOWER(p_search_domain) LIKE LOWER('%' || o.company_domain || '%')
    )
  GROUP BY o.id, o.name, o.company_domain
  HAVING COUNT(om.user_id) > 0  -- Only show orgs with members
  ORDER BY similarity_score DESC, member_count DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION find_similar_organizations_by_domain(text, int) TO authenticated;
