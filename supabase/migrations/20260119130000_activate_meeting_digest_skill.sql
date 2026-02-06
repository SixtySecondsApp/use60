-- Activate Meeting Digest Truth Extractor skill
-- Date: 2026-01-19
--
-- The skill was updated but not activated. This migration ensures it's visible in the UI.
--

UPDATE platform_skills
SET
  is_active = true,
  updated_at = now()
WHERE skill_key = 'meeting-digest-truth-extractor';
