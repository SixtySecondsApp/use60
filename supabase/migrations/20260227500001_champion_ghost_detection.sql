-- ============================================================================
-- REL-008: Champion ghost detection — schema additions
-- Adds champion_gone_dark_days to org_settings (configurable threshold) and
-- last_champion_ghost_alert to deals (7-day debounce anchor).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add champion_gone_dark_days to org_settings
--    Default 21 days — matches story spec and existing ghost_detection logic.
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS champion_gone_dark_days INTEGER
    NOT NULL DEFAULT 21
    CHECK (champion_gone_dark_days > 0);

COMMENT ON COLUMN public.org_settings.champion_gone_dark_days IS
  'Number of days a champion contact can be inactive on an active deal before a '
  'champion_disappeared signal is emitted and a command_centre_item is created. '
  'Default 21 days. Configurable per org. (REL-008)';

-- ---------------------------------------------------------------------------
-- 2. Add last_champion_ghost_alert to deals
--    7-day debounce anchor — mirrors last_single_thread_alert from REL-006.
-- ---------------------------------------------------------------------------

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS last_champion_ghost_alert TIMESTAMPTZ;

COMMENT ON COLUMN public.deals.last_champion_ghost_alert IS
  'Timestamp of the last champion_disappeared signal emitted for this deal. '
  'Used for 7-day debounce to prevent alert noise. NULL = never alerted. (REL-008)';

-- ---------------------------------------------------------------------------
-- 3. Index for fast debounce lookups
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_deals_last_champion_ghost_alert
  ON public.deals (last_champion_ghost_alert)
  WHERE last_champion_ghost_alert IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260227500001_champion_ghost_detection.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'REL-008: Champion disappeared ghost detection — schema additions';
  RAISE NOTICE '';
  RAISE NOTICE 'Modified: org_settings table';
  RAISE NOTICE '  + champion_gone_dark_days INTEGER DEFAULT 21 (threshold in days)';
  RAISE NOTICE '';
  RAISE NOTICE 'Modified: deals table';
  RAISE NOTICE '  + last_champion_ghost_alert TIMESTAMPTZ (7-day debounce anchor)';
  RAISE NOTICE '';
  RAISE NOTICE 'Added:';
  RAISE NOTICE '  - idx_deals_last_champion_ghost_alert ON deals(last_champion_ghost_alert)';
  RAISE NOTICE '';
  RAISE NOTICE 'Ghost detection logic lives in health-recalculate edge function.';
  RAISE NOTICE 'Fires champion_disappeared signal + command_centre_item when champion';
  RAISE NOTICE 'last_active exceeds threshold, debounced to once per 7 days per deal.';
  RAISE NOTICE '============================================================================';
END $$;
