-- Migration: Schedule standard ops tables backfill via pg_cron
-- Date: 2026-02-20
--
-- Purpose:
-- - Run backfill-standard-ops-tables every 6 hours for all active organizations
-- - Ensures leads, contacts, companies, meetings, and clients stay in sync
-- - Fixes gap where no automatic sync existed (only manual trigger)
--
-- Notes:
-- - Uses pg_net to call edge function with service role key
-- - Iterates through all orgs that have standard tables
-- - Service role key must be in vault (same as other cron jobs)

-- =============================================================================
-- Helper Function: Call backfill-standard-ops-tables for all orgs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.call_backfill_standard_ops_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  org_record record;
  request_id bigint;
  synced_count integer := 0;
  error_count integer := 0;
BEGIN
  -- Get Supabase URL from current database name
  supabase_url := 'https://' ||
    regexp_replace(current_database(), '^postgres_', '') ||
    '.supabase.co';

  -- Get service role key from vault
  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;

  IF service_role_key IS NULL THEN
    RAISE WARNING 'Standard ops backfill: service_role_key not found in vault, skipping';
    RETURN;
  END IF;

  -- Find all orgs that have at least one standard table
  FOR org_record IN
    SELECT DISTINCT dt.organization_id
    FROM dynamic_tables dt
    WHERE dt.is_standard = true
      AND dt.organization_id IS NOT NULL
  LOOP
    BEGIN
      -- Call the backfill edge function with service role auth
      SELECT net.http_post(
        url := supabase_url || '/functions/v1/backfill-standard-ops-tables',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object('org_id', org_record.organization_id)
      ) INTO request_id;

      synced_count := synced_count + 1;
      RAISE LOG 'Standard ops backfill: triggered for org % (request %)',
        org_record.organization_id, request_id;
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      RAISE WARNING 'Standard ops backfill: failed for org %: %',
        org_record.organization_id, SQLERRM;
    END;
  END LOOP;

  RAISE LOG 'Standard ops backfill complete: % orgs triggered, % errors',
    synced_count, error_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Standard ops backfill scheduler failed: %', SQLERRM;
END;
$$;

ALTER FUNCTION public.call_backfill_standard_ops_tables() OWNER TO postgres;

COMMENT ON FUNCTION public.call_backfill_standard_ops_tables() IS
'Cron helper: Triggers standard ops table backfill for all organizations with standard tables.
Called every 6 hours by pg_cron to keep leads, contacts, companies, meetings, and clients in sync.';

-- =============================================================================
-- Schedule the cron job
-- =============================================================================

-- Remove existing job if it exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('standard-ops-backfill');
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist or pg_cron not available, ignore
  NULL;
END $$;

-- Schedule to run every 6 hours at minute 15 (spread from other crons)
SELECT cron.schedule(
  'standard-ops-backfill',
  '15 */6 * * *',  -- Every 6 hours at :15
  $$SELECT public.call_backfill_standard_ops_tables()$$
);

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.call_backfill_standard_ops_tables() TO service_role;
