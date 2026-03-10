-- Migration: add_engagement_to_ad_library
-- Date: 20260310091242
--
-- What this migration does:
--   Adds engagement metrics columns to linkedin_ad_library_ads
--   Data sourced by scraping company posts and fuzzy-matching to ad entries
--
-- Rollback strategy:
--   ALTER TABLE linkedin_ad_library_ads DROP COLUMN IF EXISTS num_likes, DROP COLUMN IF EXISTS num_comments, DROP COLUMN IF EXISTS num_reactions, DROP COLUMN IF EXISTS engagement_post_url, DROP COLUMN IF EXISTS engagement_updated_at;

ALTER TABLE linkedin_ad_library_ads
  ADD COLUMN IF NOT EXISTS num_likes       int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_comments    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_reactions   int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_post_url text,
  ADD COLUMN IF NOT EXISTS engagement_updated_at timestamptz;
