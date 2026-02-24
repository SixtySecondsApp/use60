-- Migration: Fix google-calendar-sync cron to use pg_net correctly
-- Date: 2026-01-23
--
-- Purpose:
-- - Fix the call_google_calendar_sync function to use net.http_post (pg_net)
-- - The previous migration used extensions.http_post which doesn't exist
-- - Hardcode staging URL since current_database() returns just 'postgres'
--
-- Notes:
-- - pg_net uses net.http_post(), not extensions.http_post()
-- - This is an async HTTP call that returns a request_id
-- - The edge function must accept userId in body for cron/service-role calls

-- =============================================================================
-- Fix the helper function to use correct pg_net syntax
-- =============================================================================

CREATE OR REPLACE FUNCTION public.call_google_calendar_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net', 'extensions'
AS $$
DECLARE
  -- IMPORTANT: Update this URL for production deployment
  supabase_url text := 'https://caerqjzvuerejfrdtygb.supabase.co';  -- Staging URL
  service_role_key text;
  user_record record;
  request_id bigint;
  synced_count integer := 0;
  error_count integer := 0;
BEGIN
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
  -- 2. At least one active MeetingBaaS calendar
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
      -- Call google-calendar-sync for this user using pg_net
      -- Note: Edge function trusts userId in body for cron calls
      SELECT net.http_post(
        url := supabase_url || '/functions/v1/google-calendar-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object(
          'action', 'incremental-sync',
          'userId', user_record.user_id
        ),
        timeout_milliseconds := 30000  -- 30 second timeout per user
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
Called every 15 minutes by pg_cron to ensure calendar_events table stays up to date.
Uses pg_net (net.http_post) for async HTTP calls.
Edge function trusts userId in body for cron/service-role calls.';
