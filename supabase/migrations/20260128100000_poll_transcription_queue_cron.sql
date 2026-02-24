-- Schedule transcription queue polling cron job
-- Runs every 5 minutes to process pending/failed transcriptions
-- Tier 1: Lambda WhisperX (retries < 3)
-- Tier 2: Fallback to Gladia/Deepgram (retries >= 3)

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to call the edge function
CREATE OR REPLACE FUNCTION call_poll_transcription_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_role_key TEXT;
  request_id BIGINT;
BEGIN
  -- Get service role key from vault
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF service_role_key IS NULL THEN
    RAISE EXCEPTION 'service_role_key not found in vault';
  END IF;

  -- Call edge function via http extension
  SELECT http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/poll-transcription-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  RAISE NOTICE 'Called poll-transcription-queue, request_id: %', request_id;
END;
$$;

-- Schedule cron job to run every 5 minutes
SELECT cron.schedule(
  'poll-transcription-queue',          -- job name
  '*/5 * * * *',                       -- every 5 minutes
  $$SELECT call_poll_transcription_queue()$$
);

COMMENT ON FUNCTION call_poll_transcription_queue() IS 'Triggers poll-transcription-queue edge function via pg_cron. Processes pending/failed transcriptions with tiered fallback (Lambda WhisperX → Gladia/Deepgram).';
