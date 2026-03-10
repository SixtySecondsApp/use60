-- Migration: add_is_saved_to_ad_library
-- Date: 20260310100238
--
-- What this migration does:
--   Adds is_saved boolean to linkedin_ad_library_ads for explore/save workflow
--
-- Rollback strategy:
--   ALTER TABLE linkedin_ad_library_ads DROP COLUMN is_saved;

ALTER TABLE linkedin_ad_library_ads ADD COLUMN IF NOT EXISTS is_saved boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_ad_library_is_saved ON linkedin_ad_library_ads (org_id, is_saved) WHERE is_saved = true;
