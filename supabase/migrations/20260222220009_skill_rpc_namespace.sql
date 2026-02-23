-- Skill RPC Namespace Filtering
-- SKILL-002: Update get_organization_skills_for_agent to support namespace-filtered lookups
--
-- Adds p_source parameter (TEXT, default NULL) to filter skills by visible namespaces:
--   web_copilot    → namespace IN ('copilot', 'shared')
--   slack_copilot  → namespace IN ('slack', 'shared')
--   fleet_agent    → namespace IN ('fleet', 'shared')
--   command_centre → namespace IN ('fleet', 'shared')
--
-- Respects namespace_override on organization_skills (allows org to expose fleet skills to copilot).
-- When pinned_version is set, joins on exact version instead of is_current = true.
-- Backward compatible: omitting p_source returns all namespaces (existing behaviour).

CREATE OR REPLACE FUNCTION "public"."get_organization_skills_for_agent"(
  "p_org_id"  uuid,
  "p_source"  text DEFAULT NULL
)
RETURNS TABLE (
  "skill_key"  text,
  "category"   text,
  "frontmatter" jsonb,
  "content"    text,
  "is_enabled" boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allowed_namespaces text[];
BEGIN
  -- Resolve the set of namespaces visible to this caller source.
  -- NULL p_source → no namespace filter (backward-compatible).
  IF p_source IS NOT NULL THEN
    CASE p_source
      WHEN 'web_copilot'    THEN v_allowed_namespaces := ARRAY['copilot', 'shared'];
      WHEN 'slack_copilot'  THEN v_allowed_namespaces := ARRAY['slack',   'shared'];
      WHEN 'fleet_agent'    THEN v_allowed_namespaces := ARRAY['fleet',   'shared'];
      WHEN 'command_centre' THEN v_allowed_namespaces := ARRAY['fleet',   'shared'];
      ELSE
        -- Unknown source — fall back to shared only (safe default)
        v_allowed_namespaces := ARRAY['shared'];
    END CASE;
  END IF;

  RETURN QUERY
  SELECT
    os.skill_id                                        AS skill_key,
    ps.category,
    COALESCE(os.compiled_frontmatter, ps.frontmatter)  AS frontmatter,
    COALESCE(os.compiled_content, ps.content_template) AS content,
    os.is_enabled
  FROM organization_skills os
  JOIN platform_skills ps
    ON ps.skill_key = os.skill_id
    -- When pinned_version is set, join on that exact version.
    -- Otherwise join on the current version flag.
    AND (
      CASE
        WHEN os.pinned_version IS NOT NULL
          THEN ps.version = os.pinned_version
        ELSE ps.is_current = true
      END
    )
  WHERE os.organization_id = p_org_id
    AND os.is_active   = true
    AND ps.is_active   = true
    AND os.is_enabled  = true
    -- Namespace filter: use namespace_override when set, otherwise use platform_skills.namespace.
    -- When p_source is NULL, skip namespace filtering entirely.
    AND (
      v_allowed_namespaces IS NULL
      OR COALESCE(os.namespace_override, ps.namespace) = ANY(v_allowed_namespaces)
    )
  ORDER BY ps.category, os.skill_id;
END;
$$;

COMMENT ON FUNCTION "public"."get_organization_skills_for_agent"("p_org_id" uuid, "p_source" text) IS
  'Returns compiled skills for an organization filtered by caller source (namespace). '
  'p_source maps to namespace groups: web_copilot→copilot+shared, slack_copilot→slack+shared, '
  'fleet_agent/command_centre→fleet+shared. Omit p_source to return all namespaces (backward compat). '
  'namespace_override on organization_skills takes precedence over platform_skills.namespace. '
  'pinned_version pins the join to a specific platform skill version instead of is_current=true.';

GRANT EXECUTE ON FUNCTION "public"."get_organization_skills_for_agent"("p_org_id" uuid, "p_source" text)
  TO authenticated, service_role;
