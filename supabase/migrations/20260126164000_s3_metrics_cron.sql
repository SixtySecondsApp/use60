-- Schedule S3 metrics calculation cron job
-- Runs daily at midnight UTC

-- Create function to call the edge function
CREATE OR REPLACE FUNCTION call_update_s3_metrics()
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
    url := current_setting('app.settings.supabase_url') || '/functions/v1/update-s3-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  -- Log request
  RAISE NOTICE 'Called update-s3-metrics, request_id: %', request_id;
END;
$$;

-- Schedule cron job to run daily at midnight UTC
SELECT cron.schedule(
  'update-s3-metrics',               -- job name
  '0 0 * * *',                       -- daily at midnight UTC
  $$SELECT call_update_s3_metrics()$$
);

-- Add comment
COMMENT ON FUNCTION call_update_s3_metrics() IS 'Triggers update-s3-metrics edge function via pg_cron. Calculates daily S3 storage and bandwidth metrics for cost tracking.';
