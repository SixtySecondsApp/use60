-- Migration: linkedin_analytics_daily_cron
-- Date: 20260311180352
--
-- What this migration does:
--   Schedules a daily pg_cron job at 6:00 AM UTC that triggers the
--   linkedin-analytics-cron edge function. The function queries all
--   dynamic_tables with linkedin_analytics columns set to refresh_schedule
--   'daily' or 'both', and calls linkedin-analytics-to-ops for each table.
--
-- Rollback strategy:
--   SELECT cron.unschedule('linkedin-analytics-daily-sync');
--   DROP FUNCTION IF EXISTS public.cron_linkedin_analytics_sync();

-- ============================================================================
-- 1. Ensure extensions exist
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================================
-- 2. Create the cron wrapper function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cron_linkedin_analytics_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_request_id BIGINT;
BEGIN
  -- Get Supabase URL from app settings (set per-environment)
  v_supabase_url := coalesce(
    current_setting('app.supabase_url', true),
    ''
  );

  -- Fallback: derive from net.http_post context is not available,
  -- so log an error if URL is not configured.
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (
      'linkedin-analytics-daily-sync',
      'error',
      'app.supabase_url not configured. Run: ALTER DATABASE postgres SET app.supabase_url = ''https://<ref>.supabase.co'';'
    );
    RETURN;
  END IF;

  -- Get service role key from vault
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF v_service_role_key IS NULL THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (
      'linkedin-analytics-daily-sync',
      'error',
      'Vault secret "service_role_key" not found. Add it in Supabase Dashboard > Settings > Vault'
    );
    RETURN;
  END IF;

  -- Trigger the edge function asynchronously via pg_net
  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/linkedin-analytics-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) INTO v_request_id;

  -- Log the trigger
  INSERT INTO public.cron_job_logs (job_name, status, message, metadata)
  VALUES (
    'linkedin-analytics-daily-sync',
    'triggered',
    'linkedin-analytics-cron edge function called via pg_net',
    jsonb_build_object('request_id', v_request_id)
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_job_logs (job_name, status, message)
  VALUES (
    'linkedin-analytics-daily-sync',
    'error',
    SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION public.cron_linkedin_analytics_sync IS
  'Cron job: Trigger daily LinkedIn analytics refresh for all eligible ops tables (runs at 6:00 AM UTC)';

-- ============================================================================
-- 3. Schedule the cron job
-- ============================================================================

-- Remove existing job if it exists (idempotent)
SELECT cron.unschedule('linkedin-analytics-daily-sync')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'linkedin-analytics-daily-sync'
);

-- Schedule: daily at 6:00 AM UTC
SELECT cron.schedule(
  'linkedin-analytics-daily-sync',
  '0 6 * * *',
  $$SELECT public.cron_linkedin_analytics_sync()$$
);

