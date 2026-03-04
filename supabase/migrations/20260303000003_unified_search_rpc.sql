-- Migration: unified_search_rpc
-- Creates a PostgreSQL RPC for cross-entity full-text search using
-- websearch_to_tsquery + ts_rank, UNION ALL across deals, contacts, companies.
-- Returns a consistent {type, id, title, subtitle, url} shape for the command
-- palette and search results page.

-- ---------------------------------------------------------------------------
-- Helper: build a tsvector for a text value with a given weight
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unified_search(
  search_query TEXT,
  result_limit  INT DEFAULT 10,
  entity_types  TEXT[] DEFAULT ARRAY['deal', 'contact', 'company']
)
RETURNS TABLE (
  type      TEXT,
  id        UUID,
  title     TEXT,
  subtitle  TEXT,
  url       TEXT,
  score     FLOAT4
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tsq AS (
    -- websearch_to_tsquery is safe for user-supplied strings (no injection risk)
    SELECT websearch_to_tsquery('english', search_query) AS q
  ),
  deals_results AS (
    SELECT
      'deal'::TEXT                                        AS type,
      d.id                                               AS id,
      d.name                                             AS title,
      COALESCE(d.company, '')                            AS subtitle,
      ('/pipeline/' || d.id)::TEXT                       AS url,
      ts_rank(
        to_tsvector('english', coalesce(d.name, '') || ' ' || coalesce(d.company, '')),
        tsq.q
      )                                                  AS score
    FROM deals d, tsq
    WHERE
      'deal' = ANY(entity_types)
      AND d.status = 'active'
      AND to_tsvector('english', coalesce(d.name, '') || ' ' || coalesce(d.company, '')) @@ tsq.q
      AND (auth.uid() IS NOT NULL AND d.owner_id = auth.uid())
  ),
  contacts_results AS (
    SELECT
      'contact'::TEXT                                     AS type,
      c.id                                               AS id,
      (COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))::TEXT AS title,
      COALESCE(c.title, c.email, '')                     AS subtitle,
      ('/contacts/' || c.id)::TEXT                       AS url,
      ts_rank(
        to_tsvector('english',
          coalesce(c.first_name, '') || ' ' ||
          coalesce(c.last_name,  '') || ' ' ||
          coalesce(c.email,      '') || ' ' ||
          coalesce(c.title,      '')
        ),
        tsq.q
      )                                                  AS score
    FROM contacts c, tsq
    WHERE
      'contact' = ANY(entity_types)
      AND to_tsvector('english',
            coalesce(c.first_name, '') || ' ' ||
            coalesce(c.last_name,  '') || ' ' ||
            coalesce(c.email,      '') || ' ' ||
            coalesce(c.title,      '')
          ) @@ tsq.q
      AND (auth.uid() IS NOT NULL AND c.owner_id = auth.uid())
  ),
  companies_results AS (
    SELECT
      'company'::TEXT                                     AS type,
      co.id                                              AS id,
      co.name                                            AS title,
      COALESCE(co.industry, co.domain, '')               AS subtitle,
      ('/companies/' || co.id)::TEXT                     AS url,
      ts_rank(
        to_tsvector('english', coalesce(co.name, '') || ' ' || coalesce(co.industry, '') || ' ' || coalesce(co.domain, '')),
        tsq.q
      )                                                  AS score
    FROM companies co, tsq
    WHERE
      'company' = ANY(entity_types)
      AND to_tsvector('english', coalesce(co.name, '') || ' ' || coalesce(co.industry, '') || ' ' || coalesce(co.domain, '')) @@ tsq.q
      AND (auth.uid() IS NOT NULL AND co.owner_id = auth.uid())
  ),
  all_results AS (
    SELECT * FROM deals_results
    UNION ALL
    SELECT * FROM contacts_results
    UNION ALL
    SELECT * FROM companies_results
  )
  SELECT type, id, title, subtitle, url, score
  FROM all_results
  ORDER BY score DESC
  LIMIT result_limit;
$$;

-- Grant execute to authenticated users only (service role inherits)
REVOKE ALL ON FUNCTION public.unified_search FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unified_search TO authenticated;

COMMENT ON FUNCTION public.unified_search IS
  'Cross-entity full-text search across deals, contacts, and companies. '
  'Uses websearch_to_tsquery + ts_rank for relevance ranking. '
  'Scoped to the calling user via auth.uid(). '
  'Called by the entity-search edge function and command palette.';
