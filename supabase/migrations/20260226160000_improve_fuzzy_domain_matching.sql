-- Migration: Improve fuzzy domain matching to compare base domain names (strip TLD)
-- Before: "sixtysecondsapp.com" would NOT match "sixtyseconds.video" (different TLDs, no containment)
-- After:  "sixtysecondsapp" starts with "sixtyseconds" → 0.82 score (above 0.8 threshold)

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
DECLARE
  v_search_base text;
BEGIN
  -- Strip TLD to get base domain name (e.g., "sixtysecondsapp.com" -> "sixtysecondsapp")
  v_search_base := LOWER(REGEXP_REPLACE(p_search_domain, '\.[a-z]{2,10}$', ''));

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
      -- Base domain names match exactly (different TLDs: sixtyseconds.com vs sixtyseconds.video)
      WHEN LOWER(REGEXP_REPLACE(o.company_domain, '\.[a-z]{2,10}$', '')) = v_search_base THEN 0.90
      -- One full domain contains the other (subdomain variations)
      WHEN LOWER(o.company_domain) LIKE LOWER('%' || p_search_domain || '%') THEN 0.85
      WHEN LOWER(p_search_domain) LIKE LOWER('%' || o.company_domain || '%') THEN 0.85
      -- One base domain starts with or contains the other (sixtysecondsapp starts with sixtyseconds)
      WHEN v_search_base LIKE LOWER(REGEXP_REPLACE(o.company_domain, '\.[a-z]{2,10}$', '')) || '%' THEN 0.82
      WHEN LOWER(REGEXP_REPLACE(o.company_domain, '\.[a-z]{2,10}$', '')) LIKE v_search_base || '%' THEN 0.82
      ELSE 0.6
    END::float as similarity_score
  FROM organizations o
  LEFT JOIN organization_memberships om ON o.id = om.org_id
    AND om.member_status = 'active'
  WHERE
    o.is_active = true
    AND o.company_domain IS NOT NULL
    AND (
      LOWER(o.company_domain) = LOWER(p_search_domain)
      OR LOWER(REPLACE(o.company_domain, 'www.', '')) = LOWER(REPLACE(p_search_domain, 'www.', ''))
      OR LOWER(o.company_domain) LIKE LOWER('%' || p_search_domain || '%')
      OR LOWER(p_search_domain) LIKE LOWER('%' || o.company_domain || '%')
      -- NEW: Compare base domain names (without TLD)
      OR LOWER(REGEXP_REPLACE(o.company_domain, '\.[a-z]{2,10}$', '')) = v_search_base
      OR v_search_base LIKE LOWER(REGEXP_REPLACE(o.company_domain, '\.[a-z]{2,10}$', '')) || '%'
      OR LOWER(REGEXP_REPLACE(o.company_domain, '\.[a-z]{2,10}$', '')) LIKE v_search_base || '%'
    )
  GROUP BY o.id, o.name, o.company_domain
  HAVING COUNT(om.user_id) > 0
  ORDER BY similarity_score DESC, member_count DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION find_similar_organizations_by_domain(text, int) IS
'Finds organizations with similar domains using fuzzy matching.
Compares full domains AND base domain names (without TLD) for better cross-TLD matching.
Only returns organizations with at least 1 active member to prevent joining ghost orgs.
Used during onboarding to detect existing organizations.';
