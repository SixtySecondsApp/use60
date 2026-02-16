-- Migration: Fix sync-savvycal-events cron job to include x-cron-secret header
-- Date: 2026-02-20
--
-- Root Cause:
-- On January 11, 2026 (commit c2488531), CRON_SECRET authentication was added
-- to the sync-savvycal-events edge function. But the pg_cron job was never
-- updated to send the x-cron-secret header, causing every cron invocation
-- to be rejected with 401 Unauthorized since that date.
--
-- Fix:
-- 1. Store cron_secret in Supabase vault
-- 2. Rewrite the savvycal sync helper function to read from vault and include the header
-- 3. Reschedule the cron job

-- =============================================================================
-- MANUAL STEP REQUIRED: Add cron_secret to Supabase Vault
-- =============================================================================
-- After applying this migration, add the cron_secret via Supabase Dashboard:
--   Dashboard → Project Settings → Vault → New Secret
--   Name: cron_secret
--   Value: <same value as CRON_SECRET env var in edge functions>
--
-- The function below reads from vault at runtime. It will skip gracefully
-- if the vault secret is not yet configured.
-- =============================================================================

-- =============================================================================
-- Update the sync helper function to include x-cron-secret header
-- =============================================================================

CREATE OR REPLACE FUNCTION public.call_sync_savvycal_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  cron_secret_val text;
  request_id bigint;
BEGIN
  -- Get Supabase URL
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

  -- Get cron secret from vault
  BEGIN
    SELECT decrypted_secret INTO cron_secret_val
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    cron_secret_val := NULL;
  END;

  IF service_role_key IS NULL THEN
    RAISE WARNING 'sync-savvycal-events cron: service_role_key not found in vault, skipping';
    RETURN;
  END IF;

  IF cron_secret_val IS NULL OR cron_secret_val = 'REPLACE_WITH_ACTUAL_CRON_SECRET' THEN
    RAISE WARNING 'sync-savvycal-events cron: cron_secret not configured in vault, skipping';
    RETURN;
  END IF;

  -- Call the sync edge function with both auth headers
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/sync-savvycal-events?since_hours=5',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key,
      'x-cron-secret', cron_secret_val
    ),
    body := '{"cron_mode": true}'::jsonb
  ) INTO request_id;

  RAISE LOG 'sync-savvycal-events cron: triggered (request %)', request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync-savvycal-events cron failed: %', SQLERRM;
END;
$$;

ALTER FUNCTION public.call_sync_savvycal_events() OWNER TO postgres;

COMMENT ON FUNCTION public.call_sync_savvycal_events() IS
'Cron helper: Syncs SavvyCal events and creates leads from new bookings.
Called every 4 hours by pg_cron as a backup for real-time webhooks.
Reads service_role_key and cron_secret from vault.';

-- =============================================================================
-- Step 3: Reschedule the cron job
-- =============================================================================

-- Remove existing broken job
DO $$
BEGIN
  PERFORM cron.unschedule('sync-savvycal-events-backup');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule with the new function that includes auth headers
SELECT cron.schedule(
  'sync-savvycal-events-backup',
  '0 */4 * * *',  -- Every 4 hours
  $$SELECT public.call_sync_savvycal_events()$$
);

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.call_sync_savvycal_events() TO service_role;
