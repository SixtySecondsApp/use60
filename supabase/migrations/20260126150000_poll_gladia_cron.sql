-- Set up pg_cron job to poll Gladia for completed transcriptions
-- Runs every 3 minutes to check recordings in 'transcribing' status
-- This is necessary because Gladia doesn't fire webhooks despite accepting callback_url

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function that calls the edge function
-- This function needs to be owned by the service role
CREATE OR REPLACE FUNCTION call_poll_gladia_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key text;
  supabase_url text;
BEGIN
  -- Get service role key from vault
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  -- Get Supabase URL from env
  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL THEN
    supabase_url := 'https://caerqjzvuerejfrdtygb.supabase.co'; -- Staging URL
  END IF;

  -- Call the edge function via HTTP
  PERFORM
    net.http_post(
      url := supabase_url || '/functions/v1/poll-gladia-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := '{}'::jsonb
    );
END;
$$;

-- Schedule the cron job to run every 3 minutes
-- The cron format is: minute hour day-of-month month day-of-week
-- */3 * * * * means: every 3 minutes, every hour, every day
SELECT cron.schedule(
  'poll-gladia-jobs',           -- job name
  '*/3 * * * *',                -- every 3 minutes
  'SELECT call_poll_gladia_jobs();'
);

-- Grant execute permission to authenticated users (though it's security definer)
GRANT EXECUTE ON FUNCTION call_poll_gladia_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION call_poll_gladia_jobs() TO service_role;

-- Comment for documentation
COMMENT ON FUNCTION call_poll_gladia_jobs() IS
'Scheduled function that polls Gladia API for completed transcriptions. Runs every 3 minutes via pg_cron.';
