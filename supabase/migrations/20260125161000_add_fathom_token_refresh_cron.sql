-- Add automatic Fathom token refresh cron job
-- Runs every 6 hours to keep OAuth refresh tokens alive
-- Prevents tokens from expiring after 30 days of non-use

-- Create function to call fathom-token-refresh edge function
CREATE OR REPLACE FUNCTION public.call_fathom_token_refresh()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_role_key TEXT;
  supabase_url TEXT;
  response RECORD;
BEGIN
  -- Get Supabase URL from environment or use project-specific URL
  -- For staging: https://caerqjzvuerejfrdtygb.supabase.co
  -- For production: https://ygdpgliavpxeugaajgrb.supabase.co
  supabase_url := COALESCE(
    current_setting('app.settings.supabase_url', true),
    'https://caerqjzvuerejfrdtygb.supabase.co'  -- Default to staging
  );

  -- Get service role key from vault
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF service_role_key IS NULL THEN
    RAISE EXCEPTION 'Service role key not found in vault';
  END IF;

  -- Call the edge function
  SELECT * INTO response FROM net.http_post(
    url := supabase_url || '/functions/v1/fathom-token-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  );

  RAISE NOTICE 'Fathom token refresh response: %', response;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.call_fathom_token_refresh() TO postgres;
GRANT EXECUTE ON FUNCTION public.call_fathom_token_refresh() TO service_role;

-- Schedule the cron job to run every 6 hours (4 times daily)
-- This keeps refresh tokens alive by using them frequently
-- Fathom refresh tokens expire after ~30 days of non-use
SELECT cron.schedule(
  'fathom-token-refresh',
  '0 */6 * * *',  -- At minute 0 past every 6th hour
  'SELECT public.call_fathom_token_refresh()'
);
