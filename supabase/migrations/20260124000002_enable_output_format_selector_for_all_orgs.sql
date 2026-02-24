-- Enable: Output Format Selector SKILL for all orgs
-- Date: 2026-01-24
-- Story: FOUND-001
-- Uses the same pattern as 20260123000004_enable_catch_me_up_for_all_orgs.sql

BEGIN;

-- Enable output-format-selector for all orgs
WITH skills AS (
  SELECT
    ps.id AS platform_skill_id,
    ps.skill_key,
    ps.version AS platform_skill_version,
    COALESCE(ps.frontmatter->>'name', 'Output Format Selector') AS skill_name
  FROM platform_skills ps
  WHERE ps.skill_key = 'output-format-selector'
    AND ps.is_active = true
)
INSERT INTO organization_skills (
  organization_id,
  skill_id,
  skill_name,
  config,
  ai_generated,
  user_modified,
  is_active,
  is_enabled,
  platform_skill_id,
  platform_skill_version
)
SELECT
  o.id AS organization_id,
  s.skill_key AS skill_id,
  s.skill_name,
  '{}'::jsonb AS config,
  true AS ai_generated,
  false AS user_modified,
  true AS is_active,
  true AS is_enabled,
  s.platform_skill_id,
  s.platform_skill_version
FROM organizations o
CROSS JOIN skills s
WHERE NOT EXISTS (
  SELECT 1 FROM organization_skills os
  WHERE os.organization_id = o.id AND os.skill_id = s.skill_key
)
ON CONFLICT (organization_id, skill_id) DO UPDATE
SET
  is_active = true,
  is_enabled = true,
  platform_skill_id = EXCLUDED.platform_skill_id,
  platform_skill_version = EXCLUDED.platform_skill_version,
  updated_at = now();

COMMIT;
