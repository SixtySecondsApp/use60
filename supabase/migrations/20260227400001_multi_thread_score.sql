-- ============================================================================
-- REL-006: Multi-threading score on deals
-- Adds multi_thread_score and last_single_thread_alert columns to deals.
-- Adds multi_thread_stage_thresholds JSONB to org_settings (configurable).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add columns to deals
-- ---------------------------------------------------------------------------

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS multi_thread_score FLOAT
    CHECK (multi_thread_score IS NULL OR (multi_thread_score >= 0.0 AND multi_thread_score <= 1.0)),
  ADD COLUMN IF NOT EXISTS last_single_thread_alert TIMESTAMPTZ;

COMMENT ON COLUMN public.deals.multi_thread_score IS
  'Multi-threading score: engaged_contacts / contacts_needed for current stage. '
  'Range 0.0–1.0. NULL until first calculation. Recalculated by health-recalculate '
  'whenever deal_contacts are updated. (REL-006)';

COMMENT ON COLUMN public.deals.last_single_thread_alert IS
  'Timestamp of the last Slack alert sent for single-thread risk (<0.5 score in '
  'proposal+ stage). Used for 7-day debounce to prevent alert noise. (REL-006)';

-- ---------------------------------------------------------------------------
-- 2. Add multi_thread_stage_thresholds to org_settings
--    Default thresholds match the story spec:
--      discovery=1, qualification=2, proposal=3, negotiation=3, closing=2
--    Keys are lowercased stage names. Orgs can override per their pipeline.
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS multi_thread_stage_thresholds JSONB
    NOT NULL DEFAULT '{
      "discovery":     1,
      "qualification": 2,
      "proposal":      3,
      "negotiation":   3,
      "closing":       2,
      "sql":           2,
      "opportunity":   3,
      "signed":        2
    }'::jsonb;

COMMENT ON COLUMN public.org_settings.multi_thread_stage_thresholds IS
  'Number of engaged contacts needed per deal stage for healthy multi-threading. '
  'Keys are lowercased stage names; values are integer thresholds. '
  'Falls back to 2 for unknown stages. (REL-006)';

-- ---------------------------------------------------------------------------
-- 3. Index for fast lookups on multi_thread_score (e.g., find at-risk deals)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_deals_multi_thread_score
  ON public.deals (multi_thread_score)
  WHERE multi_thread_score IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260227400001_multi_thread_score.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'REL-006: Multi-threading score calculation and single-thread Slack alert';
  RAISE NOTICE '';
  RAISE NOTICE 'Modified: deals table';
  RAISE NOTICE '  + multi_thread_score FLOAT (0.0-1.0, nullable until first calc)';
  RAISE NOTICE '  + last_single_thread_alert TIMESTAMPTZ (7-day debounce anchor)';
  RAISE NOTICE '';
  RAISE NOTICE 'Modified: org_settings table';
  RAISE NOTICE '  + multi_thread_stage_thresholds JSONB (default thresholds seeded)';
  RAISE NOTICE '';
  RAISE NOTICE 'Added:';
  RAISE NOTICE '  - idx_deals_multi_thread_score ON deals(multi_thread_score)';
  RAISE NOTICE '';
  RAISE NOTICE 'Score calculation lives in health-recalculate edge function.';
  RAISE NOTICE 'Alert fires via slackNotifier when score < 0.5 and stage >= proposal,';
  RAISE NOTICE 'debounced to once per 7 days per deal.';
  RAISE NOTICE '============================================================================';
END $$;
