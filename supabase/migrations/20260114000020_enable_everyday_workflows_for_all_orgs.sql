-- Enable everyday Copilot workflows for all organizations
-- Date: 2026-01-14
--
-- Ensures Copilot can list/run these sequences via organization_skills.

BEGIN;

WITH skills AS (
  SELECT
    ps.id AS platform_skill_id,
    ps.skill_key,
    ps.version AS platform_skill_version,
    COALESCE(ps.frontmatter->>'name', INITCAP(REPLACE(ps.skill_key, '-', ' '))) AS skill_name
  FROM platform_skills ps
  WHERE ps.skill_key IN (
    -- Sequences
    'seq-daily-focus-plan',
    'seq-followup-zero-inbox',
    'seq-deal-slippage-guardrails',
    -- Skills
    'daily-focus-planner',
    'followup-triage',
    'followup-reply-drafter',
    'deal-slippage-diagnosis'
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
