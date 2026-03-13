-- Migration: refresh_organization_enrichment_schema_cache
-- Date: 20260311131805
--
-- What this migration does:
--   Forces PostgREST schema cache refresh for organization_enrichment table.
--   The change_summary, enrichment_version, and previous_hash columns were added
--   in 20260124100002 but the schema cache was never refreshed, causing
--   "Could not find the 'change_summary' column" errors during enrichment.
--
-- Rollback strategy:
--   N/A — comment-only change, no data impact

COMMENT ON TABLE public.organization_enrichment IS 'Organization enrichment data with change tracking — schema cache refresh for change_summary, enrichment_version, previous_hash columns';

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
