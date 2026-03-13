-- Migration: add_longevity_tracking_columns
-- Date: 20260310115618
--
-- What this migration does:
--   Adds columns for longevity tracking (is_likely_dead, longevity_milestone_sent)
--   and landing page capture (landing_page JSONB)
--
-- Rollback strategy:
--   ALTER TABLE linkedin_ad_library_ads DROP COLUMN is_likely_dead, DROP COLUMN longevity_milestone_sent, DROP COLUMN landing_page;

ALTER TABLE linkedin_ad_library_ads ADD COLUMN IF NOT EXISTS is_likely_dead boolean NOT NULL DEFAULT false;
ALTER TABLE linkedin_ad_library_ads ADD COLUMN IF NOT EXISTS longevity_milestone_sent int NOT NULL DEFAULT 0;
ALTER TABLE linkedin_ad_library_ads ADD COLUMN IF NOT EXISTS landing_page jsonb;
