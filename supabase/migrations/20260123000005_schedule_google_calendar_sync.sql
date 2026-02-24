-- Migration: Schedule google-calendar-sync via pg_cron
-- Date: 2026-01-23
--
-- Purpose:
-- - Sync Google Calendar events to calendar_events table every 15 minutes
-- - Ensures auto-join-scheduler has fresh calendar data to work with
-- - Fixes issue where MeetingBaaS calendar webhooks are not being received
--
-- Notes:
-- - Uses pg_net (http extension) to call edge function
-- - Iterates through all users with Google Calendar connected
-- - Service role key must be stored in vault (same as auto-join-scheduler)
--
-- Setup required:
-- - Add `service_role_key` to Supabase Vault (if not already done)
--   Dashboard → Settings → Vault → New Secret
--   Name: service_role_key
--   Value: <project service role key>

-- =============================================================================
-- Helper Function: Call google-calendar-sync for all connected users
-- =============================================================================

CREATE OR REPLACE FUNCTION public.call_google_calendar_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  user_record record;
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
    RAISE WARNING 'Google calendar sync: service_role_key not found in vault';
    RETURN;
  END IF;

  -- Iterate through users who have:
  -- 1. A Google integration (OAuth tokens)
  -- 2. At least one active MeetingBaaS calendar OR calendar_calendars record
  FOR user_record IN
    SELECT DISTINCT gi.user_id
    FROM google_integrations gi
    WHERE gi.refresh_token IS NOT NULL
      AND gi.updated_at > NOW() - INTERVAL '90 days'  -- Only active integrations
      AND EXISTS (
        -- User has MeetingBaaS calendar connected
        SELECT 1 FROM meetingbaas_calendars mc
        WHERE mc.user_id = gi.user_id AND mc.is_active = true
      )
    LIMIT 50  -- Safety limit per run
  LOOP
    BEGIN
      -- Call google-calendar-sync for this user
      SELECT extensions.http_post(
        url := supabase_url || '/functions/v1/google-calendar-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object(
          'action', 'incremental-sync',
          'userId', user_record.user_id
        )
      ) INTO request_id;

      synced_count := synced_count + 1;

      -- Small delay to avoid overwhelming the edge function
      PERFORM pg_sleep(0.5);

    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      RAISE WARNING 'Google calendar sync failed for user %: %', user_record.user_id, SQLERRM;
    END;
  END LOOP;

  RAISE LOG 'Google calendar sync completed: % users synced, % errors', synced_count, error_count;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Google calendar sync scheduler failed: %', SQLERRM;
END;
$$;

ALTER FUNCTION public.call_google_calendar_sync() OWNER TO postgres;

COMMENT ON FUNCTION public.call_google_calendar_sync() IS
'Cron helper: Syncs Google Calendar events for all users with connected MeetingBaaS calendars.
Called every 15 minutes by pg_cron to ensure calendar_events table stays up to date.';

-- =============================================================================
-- Schedule the cron job
-- =============================================================================

-- Remove existing job if it exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('google-calendar-sync');
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist or pg_cron not available, ignore
  NULL;
END $$;

-- Schedule to run every 15 minutes
-- Offset by 7 minutes from auto-join-scheduler to spread load
SELECT cron.schedule(
  'google-calendar-sync',
  '7,22,37,52 * * * *',  -- Minutes 7, 22, 37, 52 of each hour
  $$SELECT public.call_google_calendar_sync()$$
);

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.call_google_calendar_sync() TO service_role;
