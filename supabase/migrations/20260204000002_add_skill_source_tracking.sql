-- Add source tracking columns to platform_skills
-- Enables change detection and provenance tracking for SKILL.md file sync

ALTER TABLE platform_skills
ADD COLUMN IF NOT EXISTS source_format TEXT DEFAULT 'sql_seed'
  CHECK (source_format IN ('sql_seed', 'skill_md', 'admin_ui')),
ADD COLUMN IF NOT EXISTS source_path TEXT,
ADD COLUMN IF NOT EXISTS source_hash TEXT;

COMMENT ON COLUMN platform_skills.source_format IS 'How this skill was created: sql_seed (migration), skill_md (SKILL.md file sync), admin_ui (manual)';
COMMENT ON COLUMN platform_skills.source_path IS 'Relative path to the SKILL.md source file (e.g. skills/atomic/meeting-prep/SKILL.md)';
COMMENT ON COLUMN platform_skills.source_hash IS 'SHA-256 hash of the source file content for change detection';
