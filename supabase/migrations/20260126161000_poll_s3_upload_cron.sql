-- Schedule S3 upload queue polling cron job
-- Runs every 5 minutes to process pending S3 uploads

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to call the edge function
CREATE OR REPLACE FUNCTION call_poll_s3_upload_queue()
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
    url := current_setting('app.settings.supabase_url') || '/functions/v1/poll-s3-upload-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  -- Log request (optional, for debugging)
  RAISE NOTICE 'Called poll-s3-upload-queue, request_id: %', request_id;
END;
$$;

-- Schedule cron job to run every 5 minutes
SELECT cron.schedule(
  'poll-s3-upload-queue',           -- job name
  '*/5 * * * *',                    -- every 5 minutes
  $$SELECT call_poll_s3_upload_queue()$$
);

-- Add comment
COMMENT ON FUNCTION call_poll_s3_upload_queue() IS 'Triggers poll-s3-upload-queue edge function via pg_cron. Processes pending S3 uploads for 60 Notetaker recordings.';
