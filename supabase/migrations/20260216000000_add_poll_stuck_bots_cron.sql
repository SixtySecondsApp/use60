-- =============================================================================
-- Poll Stuck Bots: Cron Job
-- =============================================================================
-- Automatically polls MeetingBaaS for bots stuck in non-terminal states.
-- Runs every 3 minutes to detect completed bots whose webhooks were missed,
-- uploads recordings to S3, and triggers process-recording.
--
-- Prerequisites:
--   - pg_cron and pg_net extensions (already enabled)
--   - service_role_key stored in Supabase Vault
--     (Dashboard > Settings > Vault > name: "service_role_key")
-- =============================================================================

-- Function that calls the poll-stuck-bots edge function via pg_net
CREATE OR REPLACE FUNCTION public.call_poll_stuck_bots() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  request_id bigint;
BEGIN
  -- Build Supabase URL from database name (format: postgres_<project_ref>)
  supabase_url := 'https://' ||
    regexp_replace(current_database(), '^postgres_', '') ||
    '.supabase.co';

  -- Get service role key from vault
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_role_key IS NULL THEN
    RAISE WARNING 'poll-stuck-bots: service_role_key not found in vault';
    RETURN;
  END IF;

  -- Call the edge function via pg_net
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/poll-stuck-bots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'max_age_hours', 24,
      'stale_minutes', 3
    )
  ) INTO request_id;

  RAISE LOG 'poll-stuck-bots called, request_id: %', request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'poll-stuck-bots failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.call_poll_stuck_bots() IS
'Calls the poll-stuck-bots edge function to detect completed bots with missed webhooks.
Scheduled to run every 3 minutes via pg_cron.

SETUP REQUIRED:
Add service_role_key to vault: Dashboard > Settings > Vault > New Secret
  Name: service_role_key
  Value: <your project service role key>

See: supabase/functions/poll-stuck-bots/index.ts';

-- Schedule the cron job: every 3 minutes
SELECT cron.schedule(
  'poll-stuck-bots',
  '*/3 * * * *',
  $$SELECT public.call_poll_stuck_bots()$$
);
