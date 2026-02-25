-- Skill Versioning Schema
-- SKILL-001: Add namespace, source, is_current, changelog, deprecated_at to platform_skills
--            Add pinned_version, source, namespace_override to organization_skills
--
-- platform_skills already has: version (int, default 1)
-- organization_skills already has: compiled_frontmatter, compiled_content, platform_skill_version

-- =============================================================================
-- platform_skills — new columns
-- =============================================================================

ALTER TABLE platform_skills
  ADD COLUMN IF NOT EXISTS namespace TEXT NOT NULL DEFAULT 'shared'
    CHECK (namespace IN ('copilot', 'fleet', 'slack', 'shared')),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'platform'
    CHECK (source IN ('platform', 'org', 'user')),
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS changelog TEXT,
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ;

COMMENT ON COLUMN platform_skills.namespace IS 'Routing namespace: copilot (chat), fleet (background agents), slack (Slack bot), shared (all channels)';
COMMENT ON COLUMN platform_skills.source IS 'Authorship origin: platform (Sixty team), org (org-created), user (user-created)';
COMMENT ON COLUMN platform_skills.is_current IS 'True for the canonical current version; false for historical snapshots';
COMMENT ON COLUMN platform_skills.changelog IS 'Human-readable description of changes in this version';
COMMENT ON COLUMN platform_skills.deprecated_at IS 'When set, skill is deprecated and should not be compiled into new orgs';

-- =============================================================================
-- organization_skills — new columns
-- =============================================================================

ALTER TABLE organization_skills
  ADD COLUMN IF NOT EXISTS pinned_version INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS namespace_override TEXT;

COMMENT ON COLUMN organization_skills.pinned_version IS 'If set, org is locked to this platform_skills version rather than auto-upgrading';
COMMENT ON COLUMN organization_skills.source IS 'Mirrors platform_skills.source at compile time for quick filtering';
COMMENT ON COLUMN organization_skills.namespace_override IS 'Overrides the platform skill namespace for this org (e.g. promote shared skill to copilot only)';

-- =============================================================================
-- Backfill existing rows
-- =============================================================================

UPDATE platform_skills
SET
  is_current = true,
  namespace  = 'shared',
  source     = 'platform'
WHERE
  is_current IS DISTINCT FROM true
  OR namespace IS DISTINCT FROM 'shared'
  OR source    IS DISTINCT FROM 'platform';

-- =============================================================================
-- Index: fast lookup of current skills by key + version
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_platform_skills_key_version
  ON platform_skills (skill_key, version);

CREATE INDEX IF NOT EXISTS idx_platform_skills_namespace_current
  ON platform_skills (namespace, is_current)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_platform_skills_deprecated
  ON platform_skills (deprecated_at)
  WHERE deprecated_at IS NOT NULL;
