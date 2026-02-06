-- Enable core tested Copilot skills/sequences for all organizations
-- Date: 2026-01-14
--
-- Copilot lists/runs skills via organization_skills (RPC get_organization_skills_for_agent).
-- This migration ensures the production-tested skills/sequences are available by default.

BEGIN;

WITH skills AS (
  SELECT
    ps.id AS platform_skill_id,
    ps.skill_key,
    ps.version AS platform_skill_version,
    COALESCE(ps.frontmatter->>'name', INITCAP(REPLACE(ps.skill_key, '-', ' '))) AS skill_name
  FROM platform_skills ps
  WHERE ps.skill_key IN (
    'meeting-prep-brief',
    'meeting-digest-truth-extractor',
    'post-meeting-followup-drafter',
    'pipeline-focus-task-planner',
    'seq-meeting-prep',
    'seq-meeting-digest',
    'seq-pipeline-focus-tasks'
  )
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
ON CONFLICT (organization_id, skill_id)
DO UPDATE SET
  skill_name = EXCLUDED.skill_name,
  is_active = true,
  is_enabled = true,
  platform_skill_id = EXCLUDED.platform_skill_id,
  platform_skill_version = EXCLUDED.platform_skill_version,
  updated_at = now();

COMMIT;

