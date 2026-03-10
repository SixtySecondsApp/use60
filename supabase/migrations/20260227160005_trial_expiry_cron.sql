-- ============================================================================
-- Trial Expiry Cron Job Schedule
-- Story: TRIAL-003
--
-- Schedules the trial-expiry-cron edge function to run daily at midnight UTC.
-- The job moves overdue trials → grace_period, grace_period → deactivated,
-- and sends day-12 warning notifications.
--
-- Uses call_proactive_edge_function() helper (defined in setup_proactive_cron_jobs)
-- which reads CRON_SECRET from vault and injects it as Authorization header.
-- ============================================================================

-- Wrapper function called by pg_cron
CREATE OR REPLACE FUNCTION public.cron_trial_expiry_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function('trial-expiry-cron', '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.cron_trial_expiry_check IS
  'Cron job: Expire overdue trials, deactivate expired grace periods, send warnings (runs daily at midnight UTC)';

-- Unschedule if already exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('trial-expiry-check');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule daily at midnight UTC
SELECT cron.schedule(
  'trial-expiry-check',
  '0 0 * * *',
  $$SELECT public.cron_trial_expiry_check()$$
);
