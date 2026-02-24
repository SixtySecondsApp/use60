-- Migration: Apify Results 30-Day Purge Cron Job
-- Purpose: Automatically delete expired apify_results rows daily
-- Date: 2026-02-10

-- ============================================================================
-- 1. Ensure extensions exist
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ============================================================================
-- 2. Create wrapper function for the purge job
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cron_apify_purge_expired()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.apify_results
  WHERE expires_at < now();

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  INSERT INTO public.cron_job_logs (job_name, status, message, metadata)
  VALUES (
    'apify-purge-expired',
    'completed',
    'Purged expired apify_results rows',
    jsonb_build_object('deleted_count', v_deleted_count)
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_job_logs (job_name, status, message, error_details)
  VALUES ('apify-purge-expired', 'error', 'Failed to purge expired rows', SQLERRM);
END;
$$;

-- ============================================================================
-- 3. Schedule the cron job
-- ============================================================================

-- Remove existing job if it exists (for idempotency)
SELECT cron.unschedule('apify-purge-expired') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'apify-purge-expired'
);

-- Schedule: Daily at 3:00 AM UTC
SELECT cron.schedule(
  'apify-purge-expired',
  '0 3 * * *',
  $$SELECT public.cron_apify_purge_expired()$$
);

-- ============================================================================
-- 4. Add comment
-- ============================================================================

COMMENT ON FUNCTION public.cron_apify_purge_expired IS
  'Cron job: Delete expired apify_results rows older than their expires_at timestamp (runs daily at 3 AM UTC)';
